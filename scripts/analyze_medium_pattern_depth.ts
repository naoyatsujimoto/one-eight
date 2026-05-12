/**
 * analyze_medium_pattern_depth.ts
 *
 * 10,000局（sim_match_logs, sim_policy='easy_vs_easy'）をリプレイし、
 * moveNumber帯別の medium_pattern カバレッジを実測する。
 *
 * 実行方法:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   npx tsx scripts/analyze_medium_pattern_depth.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// .env 手動ロード
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

// ─── 型 ──────────────────────────────────────────────────────────────────────

interface SimMatchLog {
  id: string;
  winner: string;
  full_record: MoveRecord[] | Record<string, MoveRecord>;
}

// ─── ゲームリプレイ（post-move states を返す） ────────────────────────────────

function replayGamePostMoveStates(history: MoveRecord[]): { state: GameState; moveNumber: number }[] {
  let state: GameState = createInitialState();
  const results: { state: GameState; moveNumber: number }[] = [];

  for (const record of history) {
    const { positioning, build } = record;

    if (positioning !== 'P') {
      state = selectPosition(state, positioning as PositionId);
    }

    let nextState: GameState;

    switch (build.type) {
      case 'massive':
        nextState = build.gate !== null && build.gate !== undefined
          ? applyMassiveBuild(state, build.gate as GateId)
          : confirmPositionOnly(state);
        break;
      case 'selective': {
        const gates = ((build as { gates: (GateId | 0)[] }).gates).filter((g): g is GateId => g !== 0);
        if (gates.length === 2) nextState = applySelectiveBuild(state, gates as [GateId, GateId]);
        else if (gates.length === 1) nextState = applySelectiveBuildSingle(state, gates[0]!);
        else nextState = confirmPositionOnly(state);
        break;
      }
      case 'quad':
        nextState = applyQuadBuildForGates(state, (build as { placedGateIds: GateId[] }).placedGateIds);
        break;
      case 'skip':
        nextState = skipTurn(state);
        break;
      case 'no-build':
        nextState = confirmPositionOnly(state);
        break;
      default:
        nextState = state;
        break;
    }

    results.push({ state: nextState, moveNumber: record.moveNumber });
    state = nextState;
  }

  return results;
}

// ─── moveNumber帯の定義 ───────────────────────────────────────────────────────

type Band = 'M1' | 'M2-3' | 'M4-8' | 'M9-22' | 'M23+';

function getBand(moveNumber: number): Band {
  if (moveNumber === 1) return 'M1';
  if (moveNumber <= 3) return 'M2-3';
  if (moveNumber <= 8) return 'M4-8';
  if (moveNumber <= 22) return 'M9-22';
  return 'M23+';
}

// ─── メイン ───────────────────────────────────────────────────────────────────

interface BandStats {
  total: number;        // 総手数（分母）
  hit100: number;       // total>=100 にヒット
  hit50: number;        // total>=50 にヒット
  hit30: number;        // total>=30 にヒット
}

interface MoveInfo {
  moveNumber: number;
  patternId: string;
}

async function main() {
  console.log('=== medium_pattern coverage analysis ===');
  console.log('対象: sim_match_logs (sim_policy=easy_vs_easy)');

  // Step 1: sim_match_logs の全件取得（バッチ処理）
  const PAGE_SIZE = 500;
  let allGames: SimMatchLog[] = [];
  let offset = 0;
  let totalFetched = 0;

  console.log('\n[1] sim_match_logs 取得中...');
  while (true) {
    const { data, error } = await supabase
      .from('sim_match_logs')
      .select('id, winner, full_record')
      .eq('sim_policy', 'easy_vs_easy')
      .not('winner', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('取得エラー:', error.message);
      break;
    }
    if (!data || data.length === 0) break;

    allGames = allGames.concat(data as SimMatchLog[]);
    totalFetched += data.length;
    offset += PAGE_SIZE;
    process.stdout.write(`\r  取得済み: ${totalFetched} 件`);

    if (data.length < PAGE_SIZE) break;
  }

  console.log(`\n  合計 ${allGames.length} 局取得完了`);

  // Step 2: 全局をリプレイして medium_pattern_id を計算
  console.log('\n[2] リプレイして medium_pattern_id を計算中...');

  const allMoves: MoveInfo[] = [];
  let gameCount = 0;
  let totalMoves = 0;

  for (const game of allGames) {
    const fr = game.full_record;
    // full_record は MoveRecord[] か { '0': MoveRecord, '1': MoveRecord, ... } のどちらか
    let history: MoveRecord[];
    if (Array.isArray(fr)) {
      history = fr;
    } else if (fr && typeof fr === 'object') {
      // 数値キーのオブジェクトを配列に変換
      const keys = Object.keys(fr).filter(k => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b));
      history = keys.map(k => (fr as Record<string, MoveRecord>)[k]!);
    } else {
      continue;
    }
    if (!history || history.length === 0) continue;

    const postMoveStates = replayGamePostMoveStates(history);

    for (const { state, moveNumber } of postMoveStates) {
      const patternId = computeMediumPatternId(state);
      if (patternId) {
        allMoves.push({ moveNumber, patternId });
        totalMoves++;
      }
    }

    gameCount++;
    if (gameCount % 1000 === 0) {
      process.stdout.write(`\r  処理済み: ${gameCount}局 / ${allMoves.length}手`);
    }
  }

  console.log(`\n  リプレイ完了: ${gameCount}局 / ${totalMoves}手`);

  // Step 3: medium_pattern_id のユニーク一覧を取得
  const uniquePatterns = [...new Set(allMoves.map(m => m.patternId))];
  console.log(`\n[3] ユニーク medium_pattern_id: ${uniquePatterns.length}種`);

  // Step 4: sim_medium_pattern_stats から一括取得
  console.log('\n[4] sim_medium_pattern_stats から total lookup中...');
  
  const CHUNK_SIZE = 500;
  const patternTotalMap = new Map<string, number>();
  
  for (let i = 0; i < uniquePatterns.length; i += CHUNK_SIZE) {
    const chunk = uniquePatterns.slice(i, i + CHUNK_SIZE);
    const { data, error } = await supabase
      .from('sim_medium_pattern_stats')
      .select('medium_pattern_id, total')
      .in('medium_pattern_id', chunk)
      .eq('sim_policy', 'easy_vs_easy');

    if (error) {
      console.error(`  ERROR: ${error.message}`);
      continue;
    }

    for (const row of (data ?? []) as { medium_pattern_id: string; total: number }[]) {
      patternTotalMap.set(row.medium_pattern_id, row.total);
    }

    if ((i + CHUNK_SIZE) % 5000 === 0 || i + CHUNK_SIZE >= uniquePatterns.length) {
      process.stdout.write(`\r  lookup済み: ${Math.min(i + CHUNK_SIZE, uniquePatterns.length)} / ${uniquePatterns.length}`);
    }
  }
  console.log(`\n  lookup完了: ${patternTotalMap.size} 件ヒット`);

  // Step 5: moveNumber帯別集計
  console.log('\n[5] moveNumber帯別カバレッジ集計...');

  const BANDS: Band[] = ['M1', 'M2-3', 'M4-8', 'M9-22', 'M23+'];
  const bandStats: Record<Band, BandStats> = {
    'M1': { total: 0, hit100: 0, hit50: 0, hit30: 0 },
    'M2-3': { total: 0, hit100: 0, hit50: 0, hit30: 0 },
    'M4-8': { total: 0, hit100: 0, hit50: 0, hit30: 0 },
    'M9-22': { total: 0, hit100: 0, hit50: 0, hit30: 0 },
    'M23+': { total: 0, hit100: 0, hit50: 0, hit30: 0 },
  };

  // 最大 moveNumber ごとの閾値別追跡
  let maxMoveWith100 = 0;
  let maxMoveWith50 = 0;
  let maxMoveWith30 = 0;

  // M1 のサンプル調査
  const m1Samples: { patternId: string; total: number | undefined }[] = [];

  for (const { moveNumber, patternId } of allMoves) {
    const band = getBand(moveNumber);
    const total = patternTotalMap.get(patternId);
    const t = total ?? 0;

    bandStats[band].total++;
    if (t >= 30) {
      bandStats[band].hit30++;
      if (moveNumber > maxMoveWith30) maxMoveWith30 = moveNumber;
    }
    if (t >= 50) {
      bandStats[band].hit50++;
      if (moveNumber > maxMoveWith50) maxMoveWith50 = moveNumber;
    }
    if (t >= 100) {
      bandStats[band].hit100++;
      if (moveNumber > maxMoveWith100) maxMoveWith100 = moveNumber;
    }

    // M1 サンプル収集（最初の20件）
    if (moveNumber === 1 && m1Samples.length < 20) {
      m1Samples.push({ patternId, total });
    }
  }

  // ─── 結果出力 ───────────────────────────────────────────────────────────────

  console.log('\n\n=== moveNumber帯別 medium_pattern カバレッジ ===');
  console.log('（対象: sim_policy=easy_vs_easy, sim_medium_pattern_stats）');
  console.log('');
  console.log('帯       | 総手数   | >=100 手数  | >=100 % | >=50 手数 | >=50 %  | >=30 手数 | >=30 %');
  console.log('---------|----------|------------|---------|-----------|---------|-----------|--------');

  for (const band of BANDS) {
    const s = bandStats[band];
    const pct100 = s.total > 0 ? (s.hit100 / s.total * 100).toFixed(1) : '0.0';
    const pct50  = s.total > 0 ? (s.hit50  / s.total * 100).toFixed(1) : '0.0';
    const pct30  = s.total > 0 ? (s.hit30  / s.total * 100).toFixed(1) : '0.0';
    const bandPad = band.padEnd(8);
    const totPad = String(s.total).padStart(8);
    const h100 = String(s.hit100).padStart(11);
    const h50  = String(s.hit50).padStart(10);
    const h30  = String(s.hit30).padStart(10);
    console.log(`${bandPad} | ${totPad} | ${h100} | ${pct100.padStart(7)}% | ${h50} | ${pct50.padStart(7)}% | ${h30} | ${pct30.padStart(7)}%`);
  }

  const grandTotal = BANDS.reduce((acc, b) => acc + bandStats[b].total, 0);
  const grandH100  = BANDS.reduce((acc, b) => acc + bandStats[b].hit100, 0);
  const grandH50   = BANDS.reduce((acc, b) => acc + bandStats[b].hit50, 0);
  const grandH30   = BANDS.reduce((acc, b) => acc + bandStats[b].hit30, 0);
  const gPct100 = grandTotal > 0 ? (grandH100 / grandTotal * 100).toFixed(1) : '0.0';
  const gPct50  = grandTotal > 0 ? (grandH50  / grandTotal * 100).toFixed(1) : '0.0';
  const gPct30  = grandTotal > 0 ? (grandH30  / grandTotal * 100).toFixed(1) : '0.0';
  console.log(`---------|----------|------------|---------|-----------|---------|-----------|--------`);
  console.log(`TOTAL    | ${String(grandTotal).padStart(8)} | ${String(grandH100).padStart(11)} | ${gPct100.padStart(7)}% | ${String(grandH50).padStart(10)} | ${gPct50.padStart(7)}% | ${String(grandH30).padStart(10)} | ${gPct30.padStart(7)}%`);

  console.log('\n=== total閾値別 最大 moveNumber ===');
  console.log(`total >= 100 が存在した最大 moveNumber: ${maxMoveWith100}`);
  console.log(`total >= 50  が存在した最大 moveNumber: ${maxMoveWith50}`);
  console.log(`total >= 30  が存在した最大 moveNumber: ${maxMoveWith30}`);

  console.log('\n=== M1 カバレッジ 0.0% 調査 ===');
  console.log(`M1 総手数: ${bandStats['M1'].total}`);
  console.log(`M1 サンプル（最初の最大20件）:`);
  if (m1Samples.length === 0) {
    console.log('  M1 の手が存在しない（moveNumber=1 の手がリプレイできなかった）');
  } else {
    for (const s of m1Samples) {
      const t = s.total !== undefined ? s.total : '(DB未登録)';
      console.log(`  patternId: ${s.patternId.substring(0, 32)}... | sim_medium_pattern_stats.total: ${t}`);
    }
    // M1 の patternId がユニークかどうか確認
    const m1Patterns = new Set(m1Samples.map(s => s.patternId));
    console.log(`  M1 ユニーク patternId 数（サンプル内）: ${m1Patterns.size}`);
    if (m1Patterns.size === 1) {
      console.log('  → M1 は全局で同一 medium_pattern_id（初期局面が共通）');
    }
  }

  console.log('\n処理完了');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
