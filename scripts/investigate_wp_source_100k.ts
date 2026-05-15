/**
 * investigate_wp_source_100k.ts
 *
 * 対局 113969e1-929f-48c2-92f1-d1cff4e2bff4 の 52 手について
 * 100k 局リビルド後の winRateSource 分布を調査する。
 *
 * 実行:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   npx vite-node scripts/investigate_wp_source_100k.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// .env ロード
try {
  const lines = readFileSync(resolve(process.cwd(), '.env'), 'utf-8').split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx < 0) continue;
    const key = t.slice(0, idx).trim();
    const val = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch {}

import { createClient } from '@supabase/supabase-js';
import { createInitialState } from '../src/game/initialState';
import { computeMediumPatternId } from '../src/game/mediumPattern';
import type { GameState, MoveRecord, PositionId, GateId } from '../src/game/types';
import {
  selectPosition,
  applyMassiveBuild,
  applySelectiveBuild,
  applySelectiveBuildSingle,
  applyQuadBuildForGates,
  skipTurn,
} from '../src/game/engine';

const MATCH_ID = '113969e1-929f-48c2-92f1-d1cff4e2bff4';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: VITE_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── State replay ─────────────────────────────────────────────────────────────
function applyMoveRecord(state: GameState, record: MoveRecord): GameState {
  if (record.positioning === 'P' || record.build?.type === 'skip') {
    const withPlayer: GameState = { ...state, currentPlayer: record.player };
    return skipTurn(withPlayer);
  }

  const posId = record.positioning as PositionId;
  const withPos = selectPosition({ ...state, currentPlayer: record.player }, posId);

  if (record.build?.type === 'massive') {
    const gate = record.build.gate;
    if (gate === null) return withPos;
    return applyMassiveBuild(withPos, gate as GateId);
  }

  if (record.build?.type === 'selective') {
    const [g1, g2] = record.build.gates;
    if (g1 !== 0 && g2 !== 0) {
      return applySelectiveBuild(withPos, [g1 as GateId, g2 as GateId]);
    }
    if (g1 !== 0) return applySelectiveBuildSingle(withPos, g1 as GateId);
    if (g2 !== 0) return applySelectiveBuildSingle(withPos, g2 as GateId);
    return withPos;
  }

  if (record.build?.type === 'quad') {
    return applyQuadBuildForGates(withPos, record.build.placedGateIds);
  }

  return state;
}

// ─── medium_pattern_id をリプレイ算出 ─────────────────────────────────────────
function computeMediumPatternIdsFromHistory(history: MoveRecord[]): (string | undefined)[] {
  let state: GameState = createInitialState(null);
  const result: (string | undefined)[] = [];

  for (const record of history) {
    state = applyMoveRecord(state, record);
    try {
      result.push(computeMediumPatternId(state));
    } catch {
      result.push(undefined);
    }
  }
  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`=== investigate_wp_source_100k.ts ===`);
  console.log(`対局ID: ${MATCH_ID}\n`);

  // 1. match_logs から full_record を取得
  const { data: matchData, error: matchErr } = await supabase
    .from('match_logs')
    .select('id, full_record')
    .eq('id', MATCH_ID)
    .single();

  if (matchErr || !matchData) {
    console.error('match_logs 取得エラー:', matchErr?.message);
    process.exit(1);
  }

  const fullRecord = matchData.full_record;
  let history: MoveRecord[];
  if (Array.isArray(fullRecord)) {
    history = fullRecord as MoveRecord[];
  } else if (fullRecord && typeof fullRecord === 'object' && Array.isArray((fullRecord as Record<string,unknown>).history)) {
    history = (fullRecord as { history: MoveRecord[] }).history;
  } else {
    console.error('full_record の構造が不明:', JSON.stringify(fullRecord)?.slice(0, 200));
    process.exit(1);
  }
  console.log(`full_record.history: ${history.length} 手\n`);
  console.log('postmortem_cache: カラム未存在（DBスキーマに含まれない）\n');

  // 2. canonical_hash / symmetry_group_id / medium_pattern_id の収集
  const canonicalHashes = history.map(r => r.canonical_hash).filter((h): h is string => typeof h === 'string' && h.length > 0);
  const groupIds        = history.map(r => r.symmetry_group_id).filter((g): g is string => typeof g === 'string' && g.length > 0);

  // medium_pattern_id: MoveRecord にあればそれ使用、なければリプレイ算出
  const mediumPatternIds: (string | undefined)[] = history.map(r => r.medium_pattern_id);
  const needsReplay = mediumPatternIds.some(id => !id);
  if (needsReplay) {
    console.log('medium_pattern_id が未設定の手あり → リプレイ算出中...');
    const replayedIds = computeMediumPatternIdsFromHistory(history);
    for (let i = 0; i < mediumPatternIds.length; i++) {
      if (!mediumPatternIds[i]) mediumPatternIds[i] = replayedIds[i];
    }
  }

  const validMediumPatternIds = [...new Set(
    mediumPatternIds.filter((p): p is string => typeof p === 'string' && p.length > 0)
  )];

  console.log(`canonical_hash あり: ${canonicalHashes.length} 手`);
  console.log(`symmetry_group_id あり: ${groupIds.length} 手`);
  console.log(`medium_pattern_id 算出済み: ${mediumPatternIds.filter(Boolean).length} 手`);
  console.log(`ユニーク medium_pattern_id: ${validMediumPatternIds.length} 件\n`);

  // 3. DB 一括取得
  console.log('DB 一括取得中...');

  // position_stats
  const { data: psData, error: psErr } = await supabase
    .from('position_stats')
    .select('canonical_hash, total, confidence, win_rate_black')
    .in('canonical_hash', canonicalHashes.length > 0 ? canonicalHashes : ['__none__']);
  if (psErr) console.error('position_stats エラー:', psErr.message);
  const positionMap = new Map<string, { total: number; confidence: string; win_rate_black: number | null }>(
    (psData ?? []).map(r => [r.canonical_hash, r])
  );

  // medium_pattern_stats (total >= 5)
  const { data: mpData, error: mpErr } = await supabase
    .from('medium_pattern_stats')
    .select('medium_pattern_id, total, win_rate_black')
    .in('medium_pattern_id', validMediumPatternIds.length > 0 ? validMediumPatternIds : ['__none__'])
    .gte('total', 5);
  if (mpErr) console.error('medium_pattern_stats エラー:', mpErr.message);
  const mediumPatternMap = new Map<string, { total: number; win_rate_black: number | null }>(
    (mpData ?? []).map(r => [r.medium_pattern_id, r])
  );

  // sim_medium_pattern_stats (total >= 30, easy_vs_easy)
  const { data: smpData, error: smpErr } = await supabase
    .from('sim_medium_pattern_stats')
    .select('medium_pattern_id, total, win_rate_black, win_rate_white')
    .in('medium_pattern_id', validMediumPatternIds.length > 0 ? validMediumPatternIds : ['__none__'])
    .eq('sim_policy', 'easy_vs_easy');
  if (smpErr) console.error('sim_medium_pattern_stats エラー:', smpErr.message);
  // total >= 30 でフィルタは後で（まず全件取得して調査用に分布確認）
  const simMediumPatternAll = new Map<string, { total: number; win_rate_black: number | null; win_rate_white: number | null }>(
    (smpData ?? []).map(r => [r.medium_pattern_id, r])
  );

  // 調査2: pattern 06865a5f36ac5df5:1011 の直接クエリ
  console.log('\n--- 調査 2: pattern 06865a5f36ac5df5:1011 直接確認 ---');
  const TARGET_PATTERN = '06865a5f36ac5df5:1011';
  const { data: targetData, error: targetErr } = await supabase
    .from('sim_medium_pattern_stats')
    .select('medium_pattern_id, total, win_rate_black, win_rate_white')
    .eq('medium_pattern_id', TARGET_PATTERN);
  if (targetErr) {
    console.log(`  エラー: ${targetErr.message}`);
  } else if (!targetData || targetData.length === 0) {
    console.log('  結果: 該当なし（テーブルに存在しない）');
  } else {
    for (const row of targetData) {
      console.log(`  medium_pattern_id: ${row.medium_pattern_id}`);
      console.log(`  total:             ${row.total}`);
      console.log(`  win_rate_black:    ${row.win_rate_black}`);
      console.log(`  win_rate_white:    ${row.win_rate_white}`);
      console.log(`  total >= 30:       ${row.total >= 30 ? '✅ YES' : '❌ NO (未達)'}`);
    }
  }

  // 4. 各手の winRateSource 判定
  console.log('\n--- 調査 1: 52 手 winRateSource ---');

  type SourceType = 'canonical' | 'medium_pattern' | 'sim_medium_pattern' | 'static';

  interface MoveResult {
    moveNumber: number;
    player: string;
    winRateSource: SourceType;
    medium_pattern_id: string | undefined;
    sim_total: number | null;
    position_confidence: string | null;
    medium_pattern_total: number | null;
  }

  const results: MoveResult[] = [];

  for (let i = 0; i < history.length; i++) {
    const record = history[i]!;
    const hash    = record.canonical_hash;
    const mpId    = mediumPatternIds[i];

    const posStat = hash ? positionMap.get(hash) : undefined;
    const mpStat  = mpId ? mediumPatternMap.get(mpId) : undefined;
    const smpStat = mpId ? simMediumPatternAll.get(mpId) : undefined;

    let source: SourceType = 'static';

    if (posStat && posStat.confidence !== 'hidden') {
      source = 'canonical';
    } else if (mpStat && mpStat.total >= 5) {
      source = 'medium_pattern';
    } else if (smpStat && smpStat.total >= 30) {
      source = 'sim_medium_pattern';
    }

    results.push({
      moveNumber: record.moveNumber,
      player: record.player,
      winRateSource: source,
      medium_pattern_id: mpId,
      sim_total: smpStat?.total ?? null,
      position_confidence: posStat?.confidence ?? null,
      medium_pattern_total: mpStat?.total ?? null,
    });
  }

  // 各手の詳細表示
  console.log('\nmoveNum | player | winRateSource       | mp_id (short)      | sim_total | pos_conf | mp_total');
  console.log('--------|--------|---------------------|--------------------|-----------|----------|----------');
  for (const r of results) {
    const mpShort = r.medium_pattern_id
      ? (r.medium_pattern_id.length > 18 ? r.medium_pattern_id.slice(0, 18) : r.medium_pattern_id.padEnd(18))
      : '(none)            ';
    const simTot  = r.sim_total !== null ? String(r.sim_total).padStart(9) : '     null';
    const posConf = (r.position_confidence ?? 'null').padEnd(8);
    const mpTot   = r.medium_pattern_total !== null ? String(r.medium_pattern_total) : 'null';
    console.log(
      `${String(r.moveNumber).padStart(7)} | ${r.player.padEnd(6)} | ${r.winRateSource.padEnd(19)} | ${mpShort} | ${simTot} | ${posConf} | ${mpTot}`
    );
  }

  // 5. 分布集計
  const dist: Record<SourceType, number> = {
    canonical: 0, medium_pattern: 0, sim_medium_pattern: 0, static: 0,
  };
  for (const r of results) dist[r.winRateSource]++;

  console.log('\n### 52 手 winRateSource 分布');
  console.log('| source              | 手数 | 割合   |');
  console.log('|---------------------|------|--------|');
  const total = results.length;
  for (const [src, cnt] of Object.entries(dist)) {
    const pct = ((cnt / total) * 100).toFixed(1);
    console.log(`| ${src.padEnd(19)} | ${String(cnt).padStart(4) } | ${pct.padStart(5)}% |`);
  }
  console.log(`| ${'TOTAL'.padEnd(19)} | ${String(total).padStart(4)} | 100.0% |`);

  // 6. sim_medium_pattern 採用手
  const simAdopted = results.filter(r => r.winRateSource === 'sim_medium_pattern');
  console.log(`\n### sim_medium_pattern 採用手`);
  console.log(`採用手数: ${simAdopted.length}`);
  if (simAdopted.length > 0) {
    console.log('moveNumber | medium_pattern_id | total');
    for (const r of simAdopted) {
      console.log(`  ${r.moveNumber} | ${r.medium_pattern_id} | ${r.sim_total}`);
    }
  }

  // 7. sim total>=30 到達件数（この対局の全 medium_pattern_id のうち）
  let ge30Count = 0;
  for (const mpId of validMediumPatternIds) {
    const smp = simMediumPatternAll.get(mpId);
    if (smp && smp.total >= 30) ge30Count++;
  }
  console.log(`\n### total>=30 到達手数（この対局のユニーク ${validMediumPatternIds.length} pattern 中）`);
  console.log(`  total>=30: ${ge30Count} 件`);

  // 8. static の手: sim_total 分布 (この対局の static 手について)
  const staticMoves = results.filter(r => r.winRateSource === 'static');
  console.log(`\n### WP差分の原因調査`);
  console.log(`\nA. static 手数: ${staticMoves.length}`);
  if (staticMoves.length > 0) {
    // sim_total が存在するが total<30 の手を確認
    const hasSim = staticMoves.filter(r => r.sim_total !== null);
    const noSim  = staticMoves.filter(r => r.sim_total === null);
    console.log(`  sim_medium_pattern_stats に存在するが total<30: ${hasSim.length} 手`);
    console.log(`  sim_medium_pattern_stats に存在しない:           ${noSim.length} 手`);

    if (hasSim.length > 0) {
      const d0_9   = hasSim.filter(r => (r.sim_total ?? 0) < 10).length;
      const d10_19 = hasSim.filter(r => (r.sim_total ?? 0) >= 10 && (r.sim_total ?? 0) < 20).length;
      const d20_29 = hasSim.filter(r => (r.sim_total ?? 0) >= 20 && (r.sim_total ?? 0) < 30).length;
      console.log(`  sim_total 分布 (total<30 の手):`);
      console.log(`    0-9:   ${d0_9} 手`);
      console.log(`    10-19: ${d10_19} 手`);
      console.log(`    20-29: ${d20_29} 手`);

      console.log(`\n  sim_total<30 の手一覧:`);
      for (const r of hasSim) {
        console.log(`    move ${r.moveNumber} (${r.player}): pattern=${r.medium_pattern_id}, sim_total=${r.sim_total}`);
      }
    }
  }

  // D. postmortem_cache 確認
  console.log('\nD. postmortem_cache: カラム未存在（DBスキーマに含まれない）');

  // E. コード変更確認
  console.log('\nE. postmortem.ts / positionStats.ts の 2026-05-14 以降の変更:');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
