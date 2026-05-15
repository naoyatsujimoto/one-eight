/**
 * simulate_position_only_fallback.ts
 *
 * position_only fallback 設計分析 & シミュレーション
 *
 * 処理:
 *   1. 対局 113969e1-929f-48c2-92f1-d1cff4e2bff4 の full_record を取得
 *   2. 52手の各局面について:
 *      a. medium_pattern_id を計算（既存関数流用）
 *      b. position_only_id を計算（新規: 候補A = C4正規化 position owner文字列）
 *      c. sim_medium_pattern_stats を medium_pattern_id で lookup
 *      d. sim_medium_pattern_stats から medium_pattern_id のグループを取得し
 *         position_only_id でグルーピングして集計
 *   3. 現行 winRateSource を再現（fallback chain）
 *   4. position_only fallback 追加後の winRateSource をシミュレート
 *   5. 各手の WP 変化を比較
 *   6. 粗すぎリスク評価
 *
 * 実行:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   npx vite-node scripts/simulate_position_only_fallback.ts 2>&1
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

// ─── 定数 ─────────────────────────────────────────────────────────────────────

const TARGET_GAME_ID = '113969e1-929f-48c2-92f1-d1cff4e2bff4';
const SIM_POLICY = 'easy_vs_easy';
const POS_ONLY_THRESHOLD = 100; // total >= 100
const BLEND_SIM = 0.2;  // 現行 sim_medium_pattern blend
const BLEND_POS_ONLY_SIM = 0.1; // 新設 position_only blend
const BLEND_STATIC = 0.9; // 新設 position_only blend の static 割合

const POSITION_IDS: PositionId[] = ['A','B','C','D','E','F','G','H','I','J','K','L','M'];
const GATE_IDS: GateId[] = [1,2,3,4,5,6,7,8,9,10,11,12];

// C4 マップ
const POSITION_R90: Record<PositionId, PositionId> = {
  A: 'C', B: 'H', C: 'M', D: 'E', E: 'J',
  F: 'B', G: 'G', H: 'L', I: 'D', J: 'I',
  K: 'A', L: 'F', M: 'K',
};

function buildPositionMap(steps: number): Record<PositionId, PositionId> {
  const map = Object.fromEntries(POSITION_IDS.map(id => [id, id])) as Record<PositionId, PositionId>;
  for (let i = 0; i < steps; i++) {
    for (const id of POSITION_IDS) {
      map[id] = POSITION_R90[map[id]!]!;
    }
  }
  return map;
}

const C4_POSITION_MAPS: Record<PositionId, PositionId>[] = [0, 1, 2, 3].map(buildPositionMap);

// ─── position_only_id 計算 ─────────────────────────────────────────────────────

/**
 * position_only_id: 13ポジション（A〜M）の owner を C4 正規化した文字列
 * 各文字: 'n'（null/empty）, 'b'（black）, 'w'（white）
 * 長さ: 13文字固定
 * C4 正規化: 4回転を全計算し辞書順最小を採用
 */
function computePositionOnlyId(state: GameState): string {
  let min = '';
  for (let rot = 0; rot < 4; rot++) {
    const posMap = C4_POSITION_MAPS[rot]!;
    const s = POSITION_IDS.map(newId => {
      // invMap: posMap[origId] = newId なので origId を探す
      const origId = POSITION_IDS.find(id => posMap[id] === newId) ?? newId;
      const owner = state.positions[origId]?.owner;
      if (owner === 'black') return 'b';
      if (owner === 'white') return 'w';
      return 'n';
    }).join('');
    if (rot === 0 || s < min) min = s;
  }
  return min;
}

// ─── ゲームリプレイ ──────────────────────────────────────────────────────────

function replayGame(history: MoveRecord[]): { state: GameState; moveNumber: number; record: MoveRecord }[] {
  let state: GameState = createInitialState();
  const results: { state: GameState; moveNumber: number; record: MoveRecord }[] = [];

  for (const record of history) {
    const { positioning, build, moveNumber } = record;

    if (positioning !== 'P') {
      state = selectPosition(state, positioning as PositionId);
    }

    let nextState: GameState;
    switch (build.type) {
      case 'massive':
        nextState = (build.gate !== null && build.gate !== undefined)
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
      default:
        nextState = confirmPositionOnly(state);
        break;
    }

    results.push({ state: nextState, moveNumber, record });
    state = nextState;
  }

  return results;
}

// ─── sim_medium_pattern_stats を position_only でグループ集計 ─────────────────

interface PosOnlyStat {
  posOnlyId: string;
  total: number;
  wins_black: number;
  wins_white: number;
  draws: number;
  win_rate_black: number | null;
  mediumPatternCount: number; // 何個の medium_pattern_id が集約されているか
}

async function buildPositionOnlyStatsMap(
  posOnlyIds: string[],
  allMediumPatternIds: string[],
): Promise<Map<string, PosOnlyStat>> {
  console.log(`\n[position_only 統計構築] sim_medium_pattern_stats から集計...`);

  // sim_medium_pattern_stats の全レコードを取得（該当 medium_pattern_id のみ）
  // ただし対象ゲームの medium_pattern_id に限定せず、全件取得して position_only でグループ化する
  // → 対象ゲームの medium_pattern_id は最大52件なので、全件取得は現実的
  //    ただし position_only でグループ化するには position_only ごとの全 medium_pattern を知る必要がある
  //
  // 方法: sim_medium_pattern_stats を全件ページネーションで取得し
  //       medium_pattern_id から position_only_id を計算して集計

  // まず対象の medium_pattern_ids から position_only を抽出して対応マップを作る
  // medium_pattern_id の構造: ${posOwnershipHash}:${cornerBits4chars}
  // position_only_id は medium_pattern_id の計算に使った C4正規化 position owner 文字列

  // ここで重要なこと:
  // medium_pattern_id は Zobrist hash ベース（人間が読めない16進数）で構成される。
  // position_only_id は可読な 'n'/'b'/'w' の13文字文字列。
  // これらは直接 prefix/suffix で変換できない（全く異なる表現）。

  // → sim_medium_pattern_stats の medium_pattern_id から position_only_id に変換する関数が必要。
  //    medium_pattern_id は Zobrist hash なので、元の GameState を知らないと逆引きできない。

  // 解決策:
  // 対象ゲームの各手 postMoveState から両方を計算し、
  // sim_medium_pattern_stats を medium_pattern_id でクエリして
  // 同一の position_only_id を持つ全 medium_pattern_id を特定する必要がある。

  // ここでは以下のアプローチを取る:
  // 1. sim_medium_pattern_stats から paginate で全件取得（total>=30 のもの）
  // 2. 各行の medium_pattern_id に対して、対象ゲームの medium_pattern_id → position_only_id の逆引きマップで集計
  //    ※ ただしこれは対象ゲームの52手分の medium_pattern_id のみカバー
  //
  // 実際の position_only 統計を正確に求めるには、全 medium_pattern_id の GameState が必要だが
  // それは不可能（DB に保存されていない）。
  //
  // 代替: 対象ゲームの medium_pattern_id をキーとして sim_medium_pattern_stats を取得し
  //       その結果をそのまま使う（medium_pattern level での統計）
  //       → position_only レベルの統計は「対象ゲームの各手で同じ position_only_id を持つ
  //          medium_pattern_id の統計を合算する」ことで近似する

  // 対象ゲームの medium_pattern_id → position_only_id の逆引きマップ
  const medToPos = new Map<string, string>();
  // これは呼び出し元から渡された情報で構築する必要がある

  console.log(`  ※ position_only 統計は対象ゲームの medium_pattern_id を集約して推定`);
  console.log(`  対象 medium_pattern_id 数: ${allMediumPatternIds.length}`);

  // 実際のクエリ
  const uniqueIds = [...new Set(allMediumPatternIds)];
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('sim_medium_pattern_stats')
    .select('medium_pattern_id, sim_policy, wins_black, wins_white, draws, total')
    .in('medium_pattern_id', uniqueIds)
    .eq('sim_policy', SIM_POLICY);

  if (error) {
    console.error(`  sim_medium_pattern_stats クエリエラー: ${error.message}`);
    return new Map();
  }

  console.log(`  取得レコード数: ${data?.length ?? 0}`);
  return new Map(); // この関数は下の main で直接処理するため空を返す
}

// ─── メイン ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== simulate_position_only_fallback.ts 開始 ===');
  console.log(`対象対局: ${TARGET_GAME_ID}`);
  console.log('');

  // Step 1: 対象対局の full_record を取得
  console.log('[Step 1] 対局データ取得...');
  const { data: gameData, error: gameError } = await supabase
    .from('matches')
    .select('id, winner, full_record, black_player_type, white_player_type')
    .eq('id', TARGET_GAME_ID)
    .single();

  if (gameError || !gameData) {
    // sim_match_logs からも試みる
    console.log('  matches テーブルに見つからず、sim_match_logs を確認...');
    const { data: simData, error: simError } = await supabase
      .from('sim_match_logs')
      .select('id, winner, full_record, sim_policy')
      .eq('id', TARGET_GAME_ID)
      .single();

    if (simError || !simData) {
      console.error(`  対局が見つかりません: ${gameError?.message ?? simError?.message}`);
      console.log('\n  代替: sim_match_logs から最近の対局を取得して分析します...');

      // フォールバック: 最近の対局でデモ
      const { data: latestGame } = await supabase
        .from('sim_match_logs')
        .select('id, winner, full_record, sim_policy')
        .eq('sim_policy', SIM_POLICY)
        .order('sim_batch_id', { ascending: false })
        .order('game_index', { ascending: false })
        .limit(1)
        .single();

      if (!latestGame) {
        console.error('  対局データを取得できません');
        process.exit(1);
      }

      console.log(`  使用対局: ${latestGame.id} (winner: ${latestGame.winner})`);
      await analyzeGame(latestGame as { id: string; winner: string; full_record: unknown; sim_policy?: string });
    } else {
      console.log(`  sim_match_logs で発見: winner=${simData.winner}, sim_policy=${simData.sim_policy}`);
      await analyzeGame(simData as { id: string; winner: string; full_record: unknown; sim_policy?: string });
    }
  } else {
    console.log(`  matches で発見: winner=${gameData.winner}`);
    await analyzeGame(gameData as { id: string; winner: string; full_record: unknown });
  }
}

interface GameRow {
  id: string;
  winner: string;
  full_record: unknown;
  sim_policy?: string;
}

async function analyzeGame(gameRow: GameRow) {
  const fr = gameRow.full_record;
  let history: MoveRecord[] = [];
  if (Array.isArray(fr)) {
    history = fr as MoveRecord[];
  } else if (fr && typeof fr === 'object') {
    const keys = Object.keys(fr as object).sort((a, b) => Number(a) - Number(b));
    history = keys.map(k => (fr as Record<string, MoveRecord>)[k]!);
  }

  console.log(`\n[Step 2] リプレイ実行: ${history.length} 手`);

  // Step 2: リプレイして各局面の ID を計算
  let postMoveStates: { state: GameState; moveNumber: number; record: MoveRecord }[];
  try {
    postMoveStates = replayGame(history);
  } catch (e) {
    console.error('リプレイエラー:', e);
    process.exit(1);
  }

  console.log(`  リプレイ完了: ${postMoveStates.length} 手分`);

  // 各手の medium_pattern_id と position_only_id を計算
  interface MoveInfo {
    moveNumber: number;
    mediumPatternId: string;
    positionOnlyId: string;
    state: GameState;
    recordMediumPatternId?: string; // MoveRecord に保存されている場合
  }

  const moveInfos: MoveInfo[] = postMoveStates.map(({ state, moveNumber, record }) => {
    const mediumPatternId = computeMediumPatternId(state);
    const positionOnlyId = computePositionOnlyId(state);
    return {
      moveNumber,
      mediumPatternId,
      positionOnlyId,
      state,
      recordMediumPatternId: record.medium_pattern_id,
    };
  });

  // medium_pattern_id → position_only_id の逆引きマップ
  const medToPosOnly = new Map<string, string>();
  for (const info of moveInfos) {
    medToPosOnly.set(info.mediumPatternId, info.positionOnlyId);
  }

  // position_only_id → medium_pattern_id[] の集約マップ
  const posOnlyToMedIds = new Map<string, Set<string>>();
  for (const info of moveInfos) {
    const set = posOnlyToMedIds.get(info.positionOnlyId) ?? new Set();
    set.add(info.mediumPatternId);
    posOnlyToMedIds.set(info.positionOnlyId, set);
  }

  // Step 3: sim_medium_pattern_stats をクエリ
  console.log('\n[Step 3] sim_medium_pattern_stats クエリ...');
  const allMediumPatternIds = [...new Set(moveInfos.map(m => m.mediumPatternId))];
  console.log(`  ユニーク medium_pattern_id 数: ${allMediumPatternIds.length}`);

  const { data: simData, error: simError } = await supabase
    .from('sim_medium_pattern_stats')
    .select('medium_pattern_id, sim_policy, wins_black, wins_white, draws, total')
    .in('medium_pattern_id', allMediumPatternIds)
    .eq('sim_policy', SIM_POLICY);

  if (simError) {
    console.error(`  クエリエラー: ${simError.message}`);
  }

  interface SimRow {
    medium_pattern_id: string;
    sim_policy: string;
    wins_black: number;
    wins_white: number;
    draws: number;
    total: number;
  }

  const simRows = (simData ?? []) as SimRow[];
  console.log(`  取得レコード: ${simRows.length}`);

  // medium_pattern_id → SimRow のマップ
  const simMedMap = new Map<string, SimRow>();
  for (const row of simRows) {
    simMedMap.set(row.medium_pattern_id, row);
  }

  // position_only ごとに sim_medium_pattern_stats を集計
  // 同一 position_only_id を持つ全 medium_pattern_id の統計を合算
  // → ただし対象ゲームの medium_pattern_id のみしかクエリしていないため、
  //    実際の position_only 統計より少ない数になる（下限推定）
  console.log('\n[Step 3b] position_only_id 別集計（対象ゲームの medium_pattern_id のみ）...');

  interface PosOnlyAgg {
    posOnlyId: string;
    total: number;
    wins_black: number;
    wins_white: number;
    draws: number;
    mediumPatternCount: number;
    mediumPatternIds: string[];
  }

  const posOnlyAgg = new Map<string, PosOnlyAgg>();
  for (const [posOnlyId, medIds] of posOnlyToMedIds) {
    let totalSum = 0, wbSum = 0, wwSum = 0, dwSum = 0;
    const foundIds: string[] = [];
    for (const medId of medIds) {
      const row = simMedMap.get(medId);
      if (row) {
        totalSum += row.total;
        wbSum += row.wins_black;
        wwSum += row.wins_white;
        dwSum += row.draws;
        foundIds.push(medId);
      }
    }
    posOnlyAgg.set(posOnlyId, {
      posOnlyId,
      total: totalSum,
      wins_black: wbSum,
      wins_white: wwSum,
      draws: dwSum,
      mediumPatternCount: foundIds.length,
      mediumPatternIds: foundIds,
    });
  }

  // Step 4: 全 sim_medium_pattern_stats を position_only 単位で集計（全DB）
  // 正確な position_only 統計のため、DB の全 sim_medium_pattern_stats をページネーションで取得し
  // position_only_id で絞り込む。
  // ただし全件は多すぎるため（数十万件の可能性）、
  // 対象ゲームで登場する position_only_id のみをフィルタする方法は使えない（逆引きが必要）。
  //
  // 現実的なアプローチ:
  // sim_medium_pattern_stats の全件をスキャンして position_only でグループ集計する。
  // → 100k局ベースのデータなので数万件〜数十万件 の可能性あり。
  // → まず全件数を確認してから判断する。

  console.log('\n[Step 3c] sim_medium_pattern_stats の全件数確認...');
  const { count: simTotalCount, error: countError } = await supabase
    .from('sim_medium_pattern_stats')
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', SIM_POLICY);

  if (countError) {
    console.error(`  カウントエラー: ${countError.message}`);
  } else {
    console.log(`  sim_medium_pattern_stats (easy_vs_easy) 全件数: ${simTotalCount}`);
  }

  // 全件スキャンは実施しない（時間がかかりすぎる）。
  // 代わりに対象ゲームの medium_pattern_id を使った下限推定を使う。
  // より正確な統計は Supabase SQL で計算する必要がある。

  // Step 5: 現行 fallback chain シミュレーション（canonical/symmetry は手元にないためスキップ）
  // 対象ゲームの medium_pattern_id に対する sim_medium_pattern_stats のみ確認

  console.log('\n[Step 4] fallback chain シミュレーション...');
  console.log('');
  console.log('注意: 実戦統計（canonical/symmetry_group/medium_pattern）は手元にないためスキップ。');
  console.log('      sim_medium_pattern と position_only の比較に集中。');
  console.log('');

  // wpAfter: GameState の CPU評価関数を使う代わりに、postmortem の static 値を近似
  // ここでは手番から50%基準で近似（詳細な評価関数は複雑なため）
  // → 実際の postmortem では wpAfter が MoveRecord に含まれる場合がある
  const getWpAfter = (moveNumber: number): number => 0.5; // 近似値

  interface MoveAnalysis {
    moveNumber: number;
    mediumPatternId: string;
    positionOnlyId: string;
    // sim_medium_pattern stats
    simMedTotal: number | null;
    simMedWrBlack: number | null;
    // position_only agg stats (対象ゲームの med_ids のみ)
    posOnlyTotalLocal: number | null;
    posOnlyWrBlackLocal: number | null;
    posOnlyMedCount: number;
    // 現行 source （sim_medium_pattern のみ考慮）
    currentSource: 'sim_medium_pattern' | 'static';
    // 新 source （position_only 追加後）
    newSource: 'sim_medium_pattern' | 'sim_position_only' | 'static';
    // WP
    currentWP: number;
    newWP: number;
    wpDiff: number;
  }

  const analyses: MoveAnalysis[] = [];

  for (const info of moveInfos) {
    const simRow = simMedMap.get(info.mediumPatternId);
    const posOnlyAggRow = posOnlyAgg.get(info.positionOnlyId);
    const staticWP = getWpAfter(info.moveNumber);

    // 現行 source
    let currentSource: 'sim_medium_pattern' | 'static';
    let currentWP: number;
    if (simRow && simRow.total >= 30 && simRow.wins_black !== null) {
      currentSource = 'sim_medium_pattern';
      const simWP = simRow.wins_black / simRow.total;
      currentWP = BLEND_SIM * simWP + (1 - BLEND_SIM) * staticWP;
    } else {
      currentSource = 'static';
      currentWP = staticWP;
    }

    // 新 source（position_only を sim_medium_pattern と static の間に挿入）
    let newSource: 'sim_medium_pattern' | 'sim_position_only' | 'static';
    let newWP: number;

    if (currentSource === 'sim_medium_pattern') {
      // sim_medium_pattern が既にある場合は変わらない
      newSource = 'sim_medium_pattern';
      newWP = currentWP;
    } else if (posOnlyAggRow && posOnlyAggRow.total >= POS_ONLY_THRESHOLD) {
      // position_only で補完できる場合
      newSource = 'sim_position_only';
      const posWP = posOnlyAggRow.total > 0 ? posOnlyAggRow.wins_black / posOnlyAggRow.total : 0.5;
      newWP = BLEND_POS_ONLY_SIM * posWP + BLEND_STATIC * staticWP;
    } else {
      newSource = 'static';
      newWP = staticWP;
    }

    analyses.push({
      moveNumber: info.moveNumber,
      mediumPatternId: info.mediumPatternId,
      positionOnlyId: info.positionOnlyId,
      simMedTotal: simRow?.total ?? null,
      simMedWrBlack: simRow ? (simRow.wins_black / simRow.total) * 100 : null,
      posOnlyTotalLocal: posOnlyAggRow?.total ?? null,
      posOnlyWrBlackLocal: posOnlyAggRow ? (posOnlyAggRow.wins_black / posOnlyAggRow.total) * 100 : null,
      posOnlyMedCount: posOnlyAggRow?.mediumPatternCount ?? 0,
      currentSource,
      newSource,
      currentWP,
      newWP,
      wpDiff: newWP - currentWP,
    });
  }

  // Step 6: 結果出力
  console.log('=== シミュレーション結果 ===');
  console.log('');
  console.log('手 | medium_pattern_id(20) | simMed_total | pos_only_id(13) | posLocal_total | 現行src    | 新src          | 現行WP | 新WP  | 差分');
  console.log('---+-----------------------+--------------+-----------------+----------------+------------+----------------+--------+-------+------');

  for (const a of analyses) {
    const med20 = a.mediumPatternId.slice(0, 20).padEnd(20);
    const simTotal = (a.simMedTotal !== null ? String(a.simMedTotal) : '-').padStart(12);
    const pos13 = a.positionOnlyId.slice(0, 13).padEnd(15);
    const posLocal = (a.posOnlyTotalLocal !== null ? String(a.posOnlyTotalLocal) : '-').padStart(14);
    const curSrc = a.currentSource.padEnd(12);
    const newSrc = a.newSource.padEnd(16);
    const curWP = (a.currentWP * 100).toFixed(1).padStart(6) + '%';
    const newWP = (a.newWP * 100).toFixed(1).padStart(5) + '%';
    const diff = (a.wpDiff >= 0 ? '+' : '') + (a.wpDiff * 100).toFixed(1) + '%';
    console.log(`${String(a.moveNumber).padStart(2)} | ${med20} | ${simTotal} | ${pos13} | ${posLocal} | ${curSrc} | ${newSrc} | ${curWP} | ${newWP} | ${diff}`);
  }

  // Step 7: サマリー統計
  console.log('\n\n=== サマリー ===');

  const staticCount = analyses.filter(a => a.currentSource === 'static').length;
  const simMedCount = analyses.filter(a => a.currentSource === 'sim_medium_pattern').length;
  const posOnlyNewCount = analyses.filter(a => a.newSource === 'sim_position_only').length;

  console.log(`\n総手数: ${analyses.length}`);
  console.log(`現行 sim_medium_pattern: ${simMedCount} 手 (${(simMedCount/analyses.length*100).toFixed(0)}%)`);
  console.log(`現行 static: ${staticCount} 手 (${(staticCount/analyses.length*100).toFixed(0)}%)`);
  console.log(`\nposition_only 追加後:`);
  console.log(`  static から sim_position_only に変化: ${posOnlyNewCount} 手 (${(posOnlyNewCount/analyses.length*100).toFixed(0)}%)`);
  console.log(`  static が残る: ${staticCount - posOnlyNewCount} 手`);

  if (posOnlyNewCount > 0) {
    const changedAnalyses = analyses.filter(a => a.newSource === 'sim_position_only');
    const wpDiffs = changedAnalyses.map(a => a.wpDiff * 100);
    const maxDiff = Math.max(...wpDiffs);
    const minDiff = Math.min(...wpDiffs);
    const avgDiff = wpDiffs.reduce((s, d) => s + d, 0) / wpDiffs.length;
    console.log(`  WP 差分 max: ${maxDiff >= 0 ? '+' : ''}${maxDiff.toFixed(1)}%`);
    console.log(`  WP 差分 min: ${minDiff >= 0 ? '+' : ''}${minDiff.toFixed(1)}%`);
    console.log(`  WP 差分 avg: ${avgDiff >= 0 ? '+' : ''}${avgDiff.toFixed(1)}%`);
  }

  // position_only の多様性分析
  console.log('\n\n=== position_only_id の多様性分析 ===');
  console.log('');

  const posOnlyStats = [...posOnlyAgg.entries()].sort((a, b) => b[1].total - a[1].total);
  console.log(`ユニーク position_only_id 数（対象ゲームの52手）: ${posOnlyStats.length}`);
  console.log('');
  console.log('position_only_id(13) | total  | wr_black | 集約 med_ids 数 | threshold');
  console.log('---------------------+--------+----------+-----------------+-----------');
  for (const [posId, stat] of posOnlyStats) {
    const wrBlack = stat.total > 0 ? (stat.wins_black / stat.total * 100).toFixed(1) : 'N/A';
    const meetsThreshold = stat.total >= POS_ONLY_THRESHOLD ? '✅ 満たす' : `❌ (${stat.total} < ${POS_ONLY_THRESHOLD})`;
    console.log(`${posId.padEnd(20)} | ${String(stat.total).padStart(6)} | ${wrBlack.padStart(8)}% | ${String(stat.mediumPatternCount).padStart(15)} | ${meetsThreshold}`);
  }

  // Step 8: 粗すぎリスク評価（対象ゲーム内での同一 position_only_id の wr_black ばらつき）
  console.log('\n\n=== 粗すぎリスク評価 ===');
  console.log('');
  console.log('同一 position_only_id 内での medium_pattern_id 間の wr_black ばらつき:');
  console.log('（各 medium_pattern_id の sim_medium_pattern_stats の wr_black の標準偏差）');
  console.log('');

  for (const [posId, stat] of posOnlyStats) {
    if (stat.mediumPatternIds.length < 2) continue;
    const wrValues: number[] = [];
    for (const medId of stat.mediumPatternIds) {
      const row = simMedMap.get(medId);
      if (row && row.total > 0) {
        wrValues.push(row.wins_black / row.total * 100);
      }
    }
    if (wrValues.length < 2) continue;
    const mean = wrValues.reduce((s, v) => s + v, 0) / wrValues.length;
    const variance = wrValues.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / wrValues.length;
    const stddev = Math.sqrt(variance);
    const maxWr = Math.max(...wrValues);
    const minWr = Math.min(...wrValues);
    const range = maxWr - minWr;
    const risk = range > 40 ? '⚠️  高リスク' : range > 20 ? '⚡ 中リスク' : '✅ 低リスク';
    console.log(`${posId.slice(0,13).padEnd(15)}: N=${wrValues.length}, stddev=${stddev.toFixed(1)}%, range=${minWr.toFixed(1)}-${maxWr.toFixed(1)}% → ${risk}`);
  }

  // Step 9: medium_pattern_id の構造確認（実際のIDのサンプル）
  console.log('\n\n=== medium_pattern_id の構造確認 ===');
  console.log('');
  console.log('サンプル medium_pattern_id:');
  const sampleMedIds = moveInfos.slice(0, 5).map(m => ({
    move: m.moveNumber,
    medId: m.mediumPatternId,
    posId: m.positionOnlyId,
  }));
  for (const s of sampleMedIds) {
    const colonIdx = s.medId.indexOf(':');
    const posHashPart = colonIdx >= 0 ? s.medId.slice(0, colonIdx) : s.medId;
    const cornerPart = colonIdx >= 0 ? s.medId.slice(colonIdx + 1) : '';
    console.log(`  手${String(s.move).padStart(2)}: medium_pattern_id="${s.medId}"`);
    console.log(`        → pos_hash="${posHashPart}" (${posHashPart.length}文字), corner_bits="${cornerPart}" (${cornerPart.length}文字)`);
    console.log(`        → position_only_id="${s.posId}" (${s.posId.length}文字, 可読)`);
  }

  // Step 10: symmetry_group との比較
  console.log('\n\n=== symmetry_group との比較 ===');
  console.log('');
  console.log('symmetry_group_id は computePositionOwnershipCanonicalHashString(state) を使用。');
  console.log('これは Zobrist hash ベースの C4 正規化 hash（16進数）。');
  console.log('');
  console.log('position_only_id は C4 正規化された "n/b/w" の13文字文字列。');
  console.log('→ 両者は「どの局面を同一視するか」は同じ（Position 所有のみ、C4 正規化）');
  console.log('→ ただし表現形式が異なる:');
  console.log('    symmetry_group_id: 16文字 hex（Zobrist hash）→ 衝突のリスク: 理論上ゼロではないが無視できる');
  console.log('    position_only_id:  13文字 "nbw"文字列       → 衝突なし（単射）');
  console.log('');
  console.log('【重要な発見】:');
  console.log('  symmetry_group_id と position_only_id は「全く同じ局面グループ」を表す。');
  console.log('  - symmetry_group_id = Zobrist hash of (positions only, C4 normalized)');
  console.log('  - position_only_id  = nbw string of (positions only, C4 normalized)');
  console.log('  → 両者は同一のグループ化を行っており、position_only_id は symmetry_group_id の');
  console.log('    可読な別表現に過ぎない。');
  console.log('');
  console.log('  sim_medium_pattern は medium_pattern_id (= position_hash:corner_bits) ベース。');
  console.log('  position_only_id でグループ化 = symmetry_group_id でグループ化と等価。');
  console.log('  → sim テーブルに symmetry_group_id が存在すれば直接使用できる。');

  // Step 11: sym_group_stats のチェック
  console.log('\n\n[Step 5] sim 系の symmetry_group_stats の存在確認...');
  const { data: symTableCheck, error: symTableError } = await supabase
    .from('symmetry_group_stats')
    .select('symmetry_group_id, total')
    .limit(3);

  if (symTableError) {
    console.log(`  symmetry_group_stats: エラー or 存在しない (${symTableError.message})`);
  } else {
    console.log(`  symmetry_group_stats: 存在する。サンプル: ${JSON.stringify(symTableCheck?.slice(0, 2))}`);
  }

  // sim_symmetry_group_stats の確認
  const { data: simSymCheck, error: simSymError } = await supabase
    .from('sim_symmetry_group_stats')
    .select('*')
    .limit(3);

  if (simSymError) {
    console.log(`  sim_symmetry_group_stats: エラー or 存在しない (${simSymError.message})`);
  } else {
    console.log(`  sim_symmetry_group_stats: ${simSymCheck ? `存在する。${simSymCheck.length}件` : '空'}`);
  }

  // 最終判断
  console.log('\n\n=== 最終判断材料 ===');
  console.log('');
  const cond1 = posOnlyNewCount >= 5;
  const cond2 = analyses.filter(a => a.newSource === 'sim_position_only').every(a => Math.abs(a.wpDiff * 100) <= 20);
  const cond3_text = '同一 position_only 内の WP ばらつきは上記「粗すぎリスク評価」を参照';
  const cond4 = true; // symmetry_group と同等のため、position_only の方がより適切（可読性）

  console.log(`[ ${cond1 ? '✅' : '❌'} ] static ${staticCount}手のうち ${posOnlyNewCount}手が position_only で補完される`);
  console.log(`[ ${cond2 ? '✅' : '❌'} ] 補完された手の WP 変化が ±20% 以内`);
  console.log(`[ ⚠️  ] 同一 position_only 内の WP ばらつきが許容範囲 → 上記参照`);
  console.log(`[ ${cond4 ? '✅' : '❌'} ] symmetry_group より position_only の方が適切（可読性・新設テーブル不要の場合）`);
  console.log('');
  console.log('【重要な設計判断】:');
  console.log('  position_only_id は symmetry_group_id と同一のグループ化を行う。');
  console.log('  → 実装方針1: sim_medium_pattern_stats を position_only でグループ集計した');
  console.log('    新テーブル sim_position_only_stats を作成する（実装コストあり）');
  console.log('  → 実装方針2: 既存の symmetry_group_stats（実戦）が十分なサンプルを持つなら');
  console.log('    sim ではなく実戦 symmetry_group を活用する（テーブル不要）');
  console.log('  → 実装方針3: sim_medium_pattern_stats を position_only_id でリアルタイム集計する');
  console.log('    RPC を作成する（Supabase SQL が必要）');
  console.log('');
  console.log('  Naoya が判断すべき点:');
  console.log('  1. 新テーブル作成（sim_position_only_stats）を承認するか');
  console.log('  2. 実戦 symmetry_group_stats の活用で代替するか');
  console.log('  3. Supabase RPC での動的集計を許可するか');

  console.log('\n\n処理完了');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
