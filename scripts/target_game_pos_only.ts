/**
 * target_game_pos_only.ts
 *
 * 対象対局 113969e1 の position_only fallback 分析
 * match_logs テーブルから取得して完全シミュレーション
 *
 * 実行:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   npx vite-node scripts/target_game_pos_only.ts 2>&1
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
try {
  const envPath = resolve(process.cwd(), '.env');
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* ignore */ }

import { createClient } from '@supabase/supabase-js';
import { createInitialState } from '../src/game/initialState';
import {
  selectPosition, applyMassiveBuild, applySelectiveBuild,
  applySelectiveBuildSingle, applyQuadBuildForGates, skipTurn, confirmPositionOnly,
} from '../src/game/engine';
import { computeMediumPatternId } from '../src/game/mediumPattern';
import type { GameState, MoveRecord, GateId, PositionId } from '../src/game/types';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('ENV missing'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const POSITION_IDS: PositionId[] = ['A','B','C','D','E','F','G','H','I','J','K','L','M'];
const POSITION_R90: Record<PositionId, PositionId> = {
  A: 'C', B: 'H', C: 'M', D: 'E', E: 'J', F: 'B', G: 'G', H: 'L', I: 'D', J: 'I', K: 'A', L: 'F', M: 'K',
};

function buildPositionMap(steps: number): Record<PositionId, PositionId> {
  const map = Object.fromEntries(POSITION_IDS.map(id => [id, id])) as Record<PositionId, PositionId>;
  for (let i = 0; i < steps; i++) for (const id of POSITION_IDS) map[id] = POSITION_R90[map[id]!]!;
  return map;
}
const C4_POSITION_MAPS = [0, 1, 2, 3].map(buildPositionMap);

function computePositionOnlyId(state: GameState): string {
  let min = '';
  for (let rot = 0; rot < 4; rot++) {
    const posMap = C4_POSITION_MAPS[rot]!;
    const s = POSITION_IDS.map(newId => {
      const origId = POSITION_IDS.find(id => posMap[id] === newId) ?? newId;
      const owner = state.positions[origId]?.owner;
      return owner === 'black' ? 'b' : owner === 'white' ? 'w' : 'n';
    }).join('');
    if (rot === 0 || s < min) min = s;
  }
  return min;
}

function replayGame(history: MoveRecord[]): { state: GameState; moveNumber: number }[] {
  let state = createInitialState();
  const results: { state: GameState; moveNumber: number }[] = [];
  for (const record of history) {
    if (record.positioning !== 'P') state = selectPosition(state, record.positioning as PositionId);
    let next: GameState;
    switch (record.build.type) {
      case 'massive': next = record.build.gate ? applyMassiveBuild(state, record.build.gate as GateId) : confirmPositionOnly(state); break;
      case 'selective': {
        const g = ((record.build as { gates: (GateId | 0)[] }).gates).filter((x): x is GateId => x !== 0);
        next = g.length === 2 ? applySelectiveBuild(state, g as [GateId, GateId]) : g.length === 1 ? applySelectiveBuildSingle(state, g[0]!) : confirmPositionOnly(state);
        break;
      }
      case 'quad': next = applyQuadBuildForGates(state, (record.build as { placedGateIds: GateId[] }).placedGateIds); break;
      case 'skip': next = skipTurn(state); break;
      default: next = confirmPositionOnly(state);
    }
    results.push({ state: next, moveNumber: record.moveNumber });
    state = next;
  }
  return results;
}

async function main() {
  console.log('=== 対象対局 113969e1 position_only 分析 ===');

  // 対象対局取得
  const { data, error } = await supabase
    .from('match_logs')
    .select('id, winner, full_record')
    .eq('id', '113969e1-929f-48c2-92f1-d1cff4e2bff4')
    .single();

  if (error || !data) { console.error('取得失敗:', error?.message); process.exit(1); }

  console.log(`winner: ${data.winner}`);

  const fr = data.full_record;
  let history: MoveRecord[] = [];
  if (Array.isArray(fr)) {
    history = fr as MoveRecord[];
  } else if (fr && typeof fr === 'object') {
    const keys = Object.keys(fr as object).sort((a, b) => Number(a) - Number(b));
    history = keys.map(k => (fr as Record<string, MoveRecord>)[k]!);
  }
  console.log(`手数: ${history.length}`);

  // リプレイ
  const postMoveStates = replayGame(history);

  // 各手のID計算
  interface MoveInfo {
    moveNumber: number;
    mediumPatternId: string;
    positionOnlyId: string;
    posHash: string;
    recordWinRateSource?: string;
  }

  const moveInfos: MoveInfo[] = postMoveStates.map(({ state, moveNumber }) => {
    const mediumPatternId = computeMediumPatternId(state);
    const positionOnlyId = computePositionOnlyId(state);
    const colonIdx = mediumPatternId.indexOf(':');
    const posHash = colonIdx >= 0 ? mediumPatternId.slice(0, colonIdx) : mediumPatternId;
    const rec = history[moveNumber - 1];
    return {
      moveNumber,
      mediumPatternId,
      positionOnlyId,
      posHash,
      recordWinRateSource: (rec as Record<string, unknown>)?.winRateSource as string | undefined,
    };
  });

  // sim_medium_pattern_stats クエリ
  console.log('\n[1] sim_medium_pattern_stats クエリ...');
  const uniqueMedIds = [...new Set(moveInfos.map(m => m.mediumPatternId))];
  const { data: simRows } = await supabase
    .from('sim_medium_pattern_stats')
    .select('medium_pattern_id, total, wins_black')
    .in('medium_pattern_id', uniqueMedIds)
    .eq('sim_policy', 'easy_vs_easy');

  const simMap = new Map<string, { total: number; wins_black: number }>();
  for (const r of (simRows ?? []) as { medium_pattern_id: string; total: number; wins_black: number }[]) {
    simMap.set(r.medium_pattern_id, r);
  }
  console.log(`  取得: ${simMap.size} 件`);

  // 全 position hash に対して prefix 集計
  console.log('\n[2] position_only 全DB集計（prefix per unique posHash）...');
  const uniquePosHashes = [...new Map(moveInfos.map(m => [m.posHash, m.positionOnlyId])).entries()];
  console.log(`  ユニーク posHash 数: ${uniquePosHashes.length}`);

  const posHashFullAgg = new Map<string, { total: number; wins_black: number; count: number }>();
  for (const [posHash, posOnlyId] of uniquePosHashes) {
    const { data: prefixRows } = await supabase
      .from('sim_medium_pattern_stats')
      .select('total, wins_black')
      .eq('sim_policy', 'easy_vs_easy')
      .like('medium_pattern_id', `${posHash}%`);

    let t = 0, wb = 0, c = 0;
    for (const r of (prefixRows ?? []) as { total: number; wins_black: number }[]) {
      t += r.total; wb += r.wins_black; c++;
    }
    posHashFullAgg.set(posHash, { total: t, wins_black: wb, count: c });
    const wr = t > 0 ? (wb / t * 100).toFixed(1) : 'N/A';
    console.log(`  ${posOnlyId.slice(0, 13).padEnd(13)} | posHash=${posHash.slice(0, 16)} | full_total=${String(t).padStart(5)} | wr_black=${wr}%`);
  }

  // fallback chain シミュレーション
  console.log('\n\n=== fallback chain シミュレーション ===');
  console.log('');
  console.log(`threshold: sim_medium(>=30), position_only_full(>=100)`);
  console.log(`blend: sim_medium = 0.2×simWP + 0.8×static`);
  console.log(`blend: position_only = 0.1×posWP + 0.9×static`);
  console.log(`static: wpAfter = 0.5 (近似)`);
  console.log('');
  console.log('手 | pos_only(13)   | sim_med_tot | pos_full_tot | 現行src              | 新src                | 変化   | 現行WP | 新WP  | 差分');
  console.log('---+----------------+-------------+--------------+----------------------+----------------------+--------+--------+-------+-----');

  const STATIC_WP = 0.5;
  let staticCount = 0, simMedCount = 0, posOnlyCount = 0;

  for (const m of moveInfos) {
    const simRow = simMap.get(m.mediumPatternId);
    const fullAgg = posHashFullAgg.get(m.posHash) ?? { total: 0, wins_black: 0, count: 0 };

    // 現行 source
    let curSrc: string;
    let curWP: number;
    if (simRow && simRow.total >= 30) {
      curSrc = 'sim_medium_pattern';
      curWP = 0.2 * (simRow.wins_black / simRow.total) + 0.8 * STATIC_WP;
      simMedCount++;
    } else {
      curSrc = 'static';
      curWP = STATIC_WP;
      staticCount++;
    }

    // 新 source
    let newSrc: string;
    let newWP: number;
    let changed = '';
    if (curSrc === 'sim_medium_pattern') {
      newSrc = curSrc;
      newWP = curWP;
    } else if (fullAgg.total >= 100) {
      newSrc = 'sim_position_only';
      const posWP = fullAgg.wins_black / fullAgg.total;
      newWP = 0.1 * posWP + 0.9 * STATIC_WP;
      posOnlyCount++;
      changed = '✅ 変化';
    } else {
      newSrc = 'static';
      newWP = STATIC_WP;
    }

    const pos13 = m.positionOnlyId.slice(0, 13).padEnd(14);
    const simTot = (simRow?.total ?? '-').toString().padStart(11);
    const posTot = fullAgg.total.toString().padStart(12);
    const diff = (newWP - curWP) * 100;
    const diffStr = diff !== 0 ? `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%` : '0.0%';
    console.log(`${String(m.moveNumber).padStart(2)} | ${pos13} | ${simTot} | ${posTot} | ${curSrc.padEnd(20)} | ${newSrc.padEnd(20)} | ${changed.padEnd(6)} | ${(curWP * 100).toFixed(1).padStart(6)}% | ${(newWP * 100).toFixed(1).padStart(5)}% | ${diffStr}`);
  }

  // サマリー
  console.log('');
  console.log('=== サマリー ===');
  console.log(`総手数: ${moveInfos.length}`);
  console.log(`現行 sim_medium_pattern: ${simMedCount} 手`);
  console.log(`現行 static: ${staticCount} 手`);
  console.log(`position_only 追加後: static → sim_position_only = ${posOnlyCount} 手`);
  console.log(`static 残り: ${staticCount - posOnlyCount} 手`);

  // MoveRecord の winRateSource 分布
  console.log('');
  console.log('MoveRecord の winRateSource（実際の記録）:');
  const srcCount: Record<string, number> = {};
  for (const m of moveInfos) {
    const src = m.recordWinRateSource ?? 'unknown/null';
    srcCount[src] = (srcCount[src] ?? 0) + 1;
  }
  for (const [src, cnt] of Object.entries(srcCount)) {
    console.log(`  ${src}: ${cnt} 手`);
  }

  // 最終判断条件チェック
  console.log('');
  console.log('=== 最終判断条件 ===');
  const c1 = posOnlyCount >= 5;
  console.log(`[ ${c1 ? '✅' : '❌'} ] static ${staticCount}手のうち ${posOnlyCount}手が position_only で補完される（>=5手 が条件）`);
  console.log(`  → ${c1 ? '条件を満たす' : '条件を満たさない（static 22手のうち 5手以上の補完が必要）'}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
