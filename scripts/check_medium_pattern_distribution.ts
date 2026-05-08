/**
 * check_medium_pattern_distribution.ts
 *
 * sim_medium_pattern_stats / medium_pattern_stats の moveNumber 分布を確認する。
 * sim_match_logs をサンプルリプレイして分布を推定する。
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
} catch {}

import { createClient } from '@supabase/supabase-js';
import { createInitialState } from '../src/game/initialState';
import {
  selectPosition,
  applyMassiveBuild,
  applySelectiveBuild,
  applySelectiveBuildSingle,
  applyQuadBuildForGates,
  skipTurn,
  confirmPositionOnly,
} from '../src/game/engine';
import { computeMediumPatternId } from '../src/game/mediumPattern';
import type { GameState, MoveRecord, GateId, PositionId } from '../src/game/types';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: VITE_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── ゲームリプレイ ──────────────────────────────────────────────────────────

function applyMoveRecord(state: GameState, record: MoveRecord): GameState {
  if (record.positioning === 'P' || record.build.type === 'skip') {
    const withPlayer: GameState = { ...state, currentPlayer: record.player };
    return skipTurn(withPlayer);
  }

  const posId = record.positioning as PositionId;
  const withPos = selectPosition({ ...state, currentPlayer: record.player }, posId);

  if (record.build.type === 'massive') {
    const gate = record.build.gate;
    if (gate === null) return confirmPositionOnly(withPos);
    return applyMassiveBuild(withPos, gate as GateId);
  }

  if (record.build.type === 'selective') {
    const [g1, g2] = record.build.gates;
    if (g1 !== 0 && g2 !== 0) return applySelectiveBuild(withPos, [g1 as GateId, g2 as GateId]);
    if (g1 !== 0) return applySelectiveBuildSingle(withPos, g1 as GateId);
    if (g2 !== 0) return applySelectiveBuildSingle(withPos, g2 as GateId);
    return confirmPositionOnly(withPos);
  }

  if (record.build.type === 'quad') {
    return applyQuadBuildForGates(withPos, record.build.placedGateIds);
  }

  if (record.build.type === 'no-build') {
    return confirmPositionOnly(withPos);
  }

  return state;
}

async function main() {
  console.log('=== medium_pattern moveNumber 分布確認 ===\n');

  // 1. sim_medium_pattern_stats から total >= 30/50/100 のパターン数を確認
  console.log('--- sim_medium_pattern_stats coverage ---');
  const { data: simTotal30 } = await supabase
    .from('sim_medium_pattern_stats')
    .select('medium_pattern_id', { count: 'exact' })
    .gte('total', 30);
  const { data: simTotal50 } = await supabase
    .from('sim_medium_pattern_stats')
    .select('medium_pattern_id', { count: 'exact' })
    .gte('total', 50);
  const { data: simTotal100 } = await supabase
    .from('sim_medium_pattern_stats')
    .select('medium_pattern_id', { count: 'exact' })
    .gte('total', 100);
  const { count: simCount30 } = await supabase
    .from('sim_medium_pattern_stats')
    .select('*', { count: 'exact', head: true })
    .gte('total', 30);
  const { count: simCount50 } = await supabase
    .from('sim_medium_pattern_stats')
    .select('*', { count: 'exact', head: true })
    .gte('total', 50);
  const { count: simCount100 } = await supabase
    .from('sim_medium_pattern_stats')
    .select('*', { count: 'exact', head: true })
    .gte('total', 100);
  console.log(`  total >= 30: ${simCount30} patterns`);
  console.log(`  total >= 50: ${simCount50} patterns`);
  console.log(`  total >= 100: ${simCount100} patterns`);

  // max total
  const { data: maxData } = await supabase
    .from('sim_medium_pattern_stats')
    .select('total')
    .order('total', { ascending: false })
    .limit(1);
  console.log(`  max total: ${maxData?.[0]?.total ?? 'N/A'}`);

  // 2. medium_pattern_stats (実戦)
  console.log('\n--- medium_pattern_stats (実戦) coverage ---');
  const { count: realCount5 } = await supabase
    .from('medium_pattern_stats')
    .select('*', { count: 'exact', head: true })
    .gte('total', 5);
  const { count: realCount30 } = await supabase
    .from('medium_pattern_stats')
    .select('*', { count: 'exact', head: true })
    .gte('total', 30);
  const { count: realCountAll } = await supabase
    .from('medium_pattern_stats')
    .select('*', { count: 'exact', head: true });
  console.log(`  total rows: ${realCountAll}`);
  console.log(`  total >= 5: ${realCount5} patterns`);
  console.log(`  total >= 30: ${realCount30} patterns`);

  // 3. sim_match_logs をサンプルリプレイして moveNumber 別分布を確認
  console.log('\n--- sim_match_logs moveNumber 分布サンプル (limit 100) ---');
  const { data: sampleLogs, error: logErr } = await supabase
    .from('sim_match_logs')
    .select('full_record, winner')
    .eq('sim_policy', 'easy_vs_easy')
    .limit(100);

  if (logErr) {
    console.error('sim_match_logs fetch error:', logErr.message);
    process.exit(1);
  }

  // moveNumber 別に medium_pattern_id を計算して total >= 30/50/100 に何個該当するか

  // まず sim_medium_pattern_stats から total >= 30 のパターンIDを取得
  const { data: sim30Rows } = await supabase
    .from('sim_medium_pattern_stats')
    .select('medium_pattern_id')
    .gte('total', 30);
  const sim30Set = new Set((sim30Rows ?? []).map((r: any) => r.medium_pattern_id as string));

  const { data: sim50Rows } = await supabase
    .from('sim_medium_pattern_stats')
    .select('medium_pattern_id')
    .gte('total', 50);
  const sim50Set = new Set((sim50Rows ?? []).map((r: any) => r.medium_pattern_id as string));

  const { data: sim100Rows } = await supabase
    .from('sim_medium_pattern_stats')
    .select('medium_pattern_id')
    .gte('total', 100);
  const sim100Set = new Set((sim100Rows ?? []).map((r: any) => r.medium_pattern_id as string));

  // moveNumber ごとのカウンター
  const moveCoverage30: Map<number, number> = new Map();
  const moveCoverage50: Map<number, number> = new Map();
  const moveCoverage100: Map<number, number> = new Map();
  const moveTotalMoves: Map<number, number> = new Map();
  let maxMoveNumber = 0;

  let gameCount = 0;
  for (const log of (sampleLogs ?? [])) {
    const history = log.full_record as MoveRecord[];
    if (!history || !Array.isArray(history)) continue;
    gameCount++;

    let state: GameState = createInitialState(null);
    for (const record of history) {
      const mn = record.moveNumber;
      if (mn > maxMoveNumber) maxMoveNumber = mn;
      moveTotalMoves.set(mn, (moveTotalMoves.get(mn) ?? 0) + 1);

      const patternId = computeMediumPatternId(state);
      if (sim30Set.has(patternId)) moveCoverage30.set(mn, (moveCoverage30.get(mn) ?? 0) + 1);
      if (sim50Set.has(patternId)) moveCoverage50.set(mn, (moveCoverage50.get(mn) ?? 0) + 1);
      if (sim100Set.has(patternId)) moveCoverage100.set(mn, (moveCoverage100.get(mn) ?? 0) + 1);

      state = applyMoveRecord(state, record);
    }
  }

  console.log(`  サンプルゲーム数: ${gameCount}`);
  console.log(`  最大 moveNumber: ${maxMoveNumber}`);

  // moveNumber 別の coverage 率を表示（M1,M2-3,M4-8,M9-22,M23以降）
  const bands = [
    { label: 'M1', range: [1, 1] },
    { label: 'M2-3', range: [2, 3] },
    { label: 'M4-8', range: [4, 8] },
    { label: 'M9-22', range: [9, 22] },
    { label: 'M23+', range: [23, 9999] },
  ] as const;

  console.log('\n  moveNumber 帯別カバレッジ（sim_medium_pattern_stats）:');
  console.log('  Band       | total moves | >=30 covered | >=50 covered | >=100 covered');
  console.log('  -----------|-------------|--------------|--------------|---------------');

  for (const band of bands) {
    let total = 0, c30 = 0, c50 = 0, c100 = 0;
    for (let mn = band.range[0]; mn <= band.range[1]; mn++) {
      total += moveTotalMoves.get(mn) ?? 0;
      c30 += moveCoverage30.get(mn) ?? 0;
      c50 += moveCoverage50.get(mn) ?? 0;
      c100 += moveCoverage100.get(mn) ?? 0;
    }
    const pct30 = total > 0 ? ((c30 / total) * 100).toFixed(1) : 'N/A';
    const pct50 = total > 0 ? ((c50 / total) * 100).toFixed(1) : 'N/A';
    const pct100 = total > 0 ? ((c100 / total) * 100).toFixed(1) : 'N/A';
    console.log(`  ${band.label.padEnd(10)} | ${String(total).padEnd(11)} | ${pct30}%          | ${pct50}%          | ${pct100}%`);
  }

  // 最大 moveNumber で total>=100/50/30 がある最大の moveNumber を探す
  console.log('\n  移動別詳細 (moveNumber 1-30):');
  console.log('  moveNum | totalMoves | >=30 | >=50 | >=100');
  console.log('  --------|------------|------|------|-------');
  for (let mn = 1; mn <= Math.min(maxMoveNumber, 30); mn++) {
    const t = moveTotalMoves.get(mn) ?? 0;
    if (t === 0) continue;
    const c30 = moveCoverage30.get(mn) ?? 0;
    const c50 = moveCoverage50.get(mn) ?? 0;
    const c100 = moveCoverage100.get(mn) ?? 0;
    console.log(`  ${String(mn).padEnd(7)} | ${String(t).padEnd(10)} | ${c30}/${t} | ${c50}/${t} | ${c100}/${t}`);
  }

  // canonical_hash との比較（sim_position_stats から count を取得）
  console.log('\n--- canonical_hash (sim_position_stats) との比較 ---');
  const { count: simPosCount30 } = await supabase
    .from('sim_position_stats')
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', 'easy_vs_easy')
    .gte('total', 30);
  const { count: simPosCount100 } = await supabase
    .from('sim_position_stats')
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', 'easy_vs_easy')
    .gte('total', 100);
  console.log(`  sim_position_stats (easy_vs_easy) total >= 30: ${simPosCount30}`);
  console.log(`  sim_position_stats (easy_vs_easy) total >= 100: ${simPosCount100}`);
  console.log(`  sim_medium_pattern_stats total >= 30: ${simCount30}`);
  console.log(`  sim_medium_pattern_stats total >= 100: ${simCount100}`);

  console.log('\n=== 完了 ===');
}

main().catch(e => { console.error(e); process.exit(1); });
