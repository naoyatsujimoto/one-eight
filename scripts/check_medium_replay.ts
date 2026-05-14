/**
 * 対象対局113969e1で medium_pattern_id リプレイが機能するか確認
 */
import { createClient } from '@supabase/supabase-js';
import { createInitialState } from '../src/game/initialState';
import { computeMediumPatternId } from '../src/game/mediumPattern';
import {
  selectPosition,
  applyMassiveBuild,
  applySelectiveBuild,
  applySelectiveBuildSingle,
  applyQuadBuildForGates,
  skipTurn,
  confirmPositionOnly,
} from '../src/game/engine';
import type { GameState, MoveRecord, GateId, PositionId } from '../src/game/types';

const supabase = createClient(process.env.VITE_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '');

function applyMoveRecord(state: GameState, record: MoveRecord): GameState {
  const { positioning, build } = record;
  let s = state;
  if (positioning && positioning !== 'P') {
    s = selectPosition(s, positioning as PositionId);
  }
  switch (build.type) {
    case 'massive':
      return build.gate != null ? applyMassiveBuild(s, build.gate as GateId) : confirmPositionOnly(s);
    case 'selective': {
      const gates = (build.gates as (GateId | 0)[]).filter((g): g is GateId => g !== 0);
      if (gates.length === 2) return applySelectiveBuild(s, gates as [GateId, GateId]);
      if (gates.length === 1) return applySelectiveBuildSingle(s, gates[0]!);
      return confirmPositionOnly(s);
    }
    case 'quad': return applyQuadBuildForGates(s, build.placedGateIds as GateId[]);
    case 'skip': return skipTurn(s);
    case 'no-build': return confirmPositionOnly(s);
    default: return s;
  }
}

async function main() {
  const { data: logs } = await supabase
    .from('match_logs')
    .select('id, winner, full_record')
    .eq('id', '113969e1-929f-48c2-92f1-d1cff4e2bff4')
    .limit(1);

  if (!logs || logs.length === 0) { console.log('対局なし'); return; }
  const log = logs[0];
  const history = log.full_record as MoveRecord[];
  console.log(`対局: ${log.id} / 勝者: ${log.winner} / 総手数: ${history.length}`);

  // リプレイして medium_pattern_id を算出
  let state: GameState = createInitialState(null);
  const results: { mn: number; pid: string | null; hash: string | undefined }[] = [];

  for (const record of history) {
    try {
      state = applyMoveRecord(state, record);
      const pid = computeMediumPatternId(state);
      results.push({ mn: record.moveNumber ?? 0, pid: pid || null, hash: record.canonical_hash });
    } catch (e) {
      results.push({ mn: record.moveNumber ?? 0, pid: null, hash: record.canonical_hash });
      console.warn(`M${record.moveNumber}: applyMoveRecord/computeMediumPatternId 失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const computed = results.filter(r => r.pid !== null).length;
  const nullCount = results.filter(r => r.pid === null).length;
  console.log(`\nmedium_pattern_id 算出: ${computed}手 / null: ${nullCount}手`);

  // M50-52を表示
  const targets = results.filter(r => r.mn >= 50 && r.mn <= 52);
  console.log('\nM50-52:');
  for (const t of targets) {
    console.log(`  M${t.mn}: pid=${t.pid ? t.pid.substring(0, 24) + '...' : 'null'}`);
  }

  // sim_medium_pattern_stats ヒット確認
  const allPids = results.map(r => r.pid).filter(Boolean) as string[];
  if (allPids.length > 0) {
    const { data: simHits } = await supabase
      .from('sim_medium_pattern_stats')
      .select('medium_pattern_id, total, win_rate_black')
      .eq('sim_policy', 'easy_vs_easy')
      .gte('total', 30)
      .in('medium_pattern_id', allPids);
    console.log(`\nsim_medium_pattern_stats hits (total>=30): ${simHits?.length ?? 0}手`);
    if (simHits && simHits.length > 0) {
      (simHits as { medium_pattern_id: string; total: number; win_rate_black: number }[])
        .slice(0, 5)
        .forEach(h => console.log(`  pid=...${h.medium_pattern_id.slice(-12)} total=${h.total} wr=${h.win_rate_black?.toFixed(1)}%`));
    }

    // M50-52 のhit確認
    const targetPids = targets.map(r => r.pid).filter(Boolean) as string[];
    if (targetPids.length > 0) {
      const { data: t5052 } = await supabase
        .from('sim_medium_pattern_stats')
        .select('medium_pattern_id, total, win_rate_black')
        .eq('sim_policy', 'easy_vs_easy')
        .in('medium_pattern_id', targetPids);
      console.log(`\nM50-52 の sim_medium_pattern_stats:`);
      if (!t5052 || t5052.length === 0) console.log('  ヒットなし');
      else (t5052 as { medium_pattern_id: string; total: number; win_rate_black: number }[])
        .forEach(h => console.log(`  pid=...${h.medium_pattern_id.slice(-12)} total=${h.total} wr=${h.win_rate_black?.toFixed(1)}%`));
    }
  }

  // get_medium_pattern_win_rates RPC 存在確認
  const { error: rpcErr } = await supabase.rpc('get_medium_pattern_win_rates', {
    p_pattern_ids: allPids.slice(0, 1),
    p_min_total: 5,
    p_mode_group: 'all',
  });
  if (!rpcErr) {
    console.log('\nget_medium_pattern_win_rates RPC: 存在する');
  } else if (rpcErr.message.includes('does not exist') || rpcErr.message.includes('function') || rpcErr.message.includes('Could not find')) {
    console.log('\nget_medium_pattern_win_rates RPC: 存在しない ← fetchMediumPatternWinRates が失敗する');
  } else {
    console.log('\nget_medium_pattern_win_rates RPC error:', rpcErr.message);
  }

  // medium_pattern_stats テーブル確認
  const { count: mpsCount, error: mpsErr } = await supabase
    .from('medium_pattern_stats')
    .select('*', { count: 'exact', head: true });
  if (mpsErr) console.log('medium_pattern_stats テーブル: エラー -', mpsErr.message);
  else console.log(`medium_pattern_stats テーブル: 存在する (${mpsCount}件)`);
}

main().catch(console.error);
