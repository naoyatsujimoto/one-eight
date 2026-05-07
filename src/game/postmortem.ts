/**
 * postmortem.ts — ブラウザ内でゲーム棋譜を分析し、決定的な一手を特定する
 *
 * postmortem.tsのロジック（~/Desktop/Claude_Cowork/one-eight-postmortem/src/postmortem.ts）
 * をWeb MVP向けに移植。MoveRecord[] から GameState を再現しながら評価する。
 *
 * 分析はBlack視点のみ。depth 3固定（ブラウザ負荷を考慮）。
 */

import { createInitialState } from './initialState';
import { selectPosition, applyMassiveBuild, applySelectiveBuild, applySelectiveBuildSingle, applyQuadBuildForGates, skipTurn } from './engine';
import { evaluateState, enumerateLegalMoves, scoreMoveForOrdering, type CpuMove } from './ai';
import type { GameState, MoveRecord, Player, PositionId, GateId } from './types';
import { fetchPositionWinRates } from './positionStats';

// Win probability (logistic), Black perspective
const K_WP = 0.003;
function winProb(evalScore: number): number {
  return 1 / (1 + Math.exp(-K_WP * evalScore));
}

// ─── State replay ─────────────────────────────────────────────────────────────

/** MoveRecord を GameState に適用して次の状態を返す */
function applyMoveRecord(state: GameState, record: MoveRecord): GameState {
  if (record.positioning === 'P' || record.build.type === 'skip') {
    // Pass/skip
    const withPlayer: GameState = { ...state, currentPlayer: record.player };
    return skipTurn(withPlayer);
  }

  const posId = record.positioning as PositionId;
  const withPos = selectPosition({ ...state, currentPlayer: record.player }, posId);

  if (record.build.type === 'massive') {
    const gate = record.build.gate;
    if (gate === null) return withPos;
    return applyMassiveBuild(withPos, gate as GateId);
  }

  if (record.build.type === 'selective') {
    const [g1, g2] = record.build.gates;
    if (g1 !== 0 && g2 !== 0) {
      return applySelectiveBuild(withPos, [g1 as GateId, g2 as GateId]);
    }
    if (g1 !== 0) {
      return applySelectiveBuildSingle(withPos, g1 as GateId);
    }
    if (g2 !== 0) {
      return applySelectiveBuildSingle(withPos, g2 as GateId);
    }
    return withPos;
  }

  if (record.build.type === 'quad') {
    return applyQuadBuildForGates(withPos, record.build.placedGateIds);
  }

  return state;
}

// ─── Minimax（depth-limited, Black視点） ─────────────────────────────────────

const INF = 1e9;

function minimaxAB(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  currentPlayer: Player,
  maximizingPlayer: Player,
): number {
  if (depth === 0 || state.gameEnded) {
    return evaluateState(state, maximizingPlayer, true);
  }
  const legal = enumerateLegalMoves(state, currentPlayer);
  const opp: Player = currentPlayer === 'black' ? 'white' : 'black';
  if (legal.length === 0) {
    return minimaxAB(state, depth - 1, alpha, beta, opp, maximizingPlayer);
  }
  const ordered = [...legal].sort(
    (a, b) => scoreMoveForOrdering(state, currentPlayer, b) - scoreMoveForOrdering(state, currentPlayer, a),
  );
  const isMax = currentPlayer === maximizingPlayer;
  if (isMax) {
    let best = -INF;
    for (const move of ordered) {
      const next = simulateMove(state, currentPlayer, move);
      const s = minimaxAB(next, depth - 1, alpha, beta, opp, maximizingPlayer);
      if (s > best) best = s;
      if (s > alpha) alpha = s;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = INF;
    for (const move of ordered) {
      const next = simulateMove(state, currentPlayer, move);
      const s = minimaxAB(next, depth - 1, alpha, beta, opp, maximizingPlayer);
      if (s < best) best = s;
      if (s < beta) beta = s;
      if (beta <= alpha) break;
    }
    return best;
  }
}

function simulateMove(state: GameState, player: Player, move: CpuMove): GameState {
  if (move.type === 'pass') {
    const withPlayer: GameState = { ...state, currentPlayer: player };
    return skipTurn(withPlayer);
  }
  const stateForPlayer: GameState = state.currentPlayer === player
    ? state
    : { ...state, currentPlayer: player };
  const selected = selectPosition(stateForPlayer, move.positionId);
  switch (move.type) {
    case 'massive': return applyMassiveBuild(selected, move.gateId);
    case 'selective': return applySelectiveBuild(selected, move.gates);
    case 'quad': return applyQuadBuildForGates(selected, move.gateIds);
  }
}

function bestMoveDepth(state: GameState, player: Player, depth: number): { move: CpuMove; evalAfter: number } {
  const legal = enumerateLegalMoves(state, player);
  if (legal.length === 0) {
    return { move: { type: 'pass' }, evalAfter: evaluateState(state, player, true) };
  }
  const ordered = [...legal].sort(
    (a, b) => scoreMoveForOrdering(state, player, b) - scoreMoveForOrdering(state, player, a),
  );
  const opp: Player = player === 'black' ? 'white' : 'black';
  let bestScore = -INF;
  let bestMove: CpuMove = ordered[0]!;
  let alpha = -INF;
  const beta = INF;
  for (const move of ordered) {
    const next = simulateMove(state, player, move);
    const s = minimaxAB(next, depth - 1, alpha, beta, opp, player);
    if (s > bestScore) {
      bestScore = s;
      bestMove = move;
    }
    if (s > alpha) alpha = s;
  }
  // evalAfter: 実際にbestMoveを適用した後の評価値
  const nextIfBest = simulateMove(state, player, bestMove);
  const evalAfter = evaluateState(nextIfBest, player, true);
  return { move: bestMove, evalAfter };
}

// ─── 手の短縮表示 ─────────────────────────────────────────────────────────────

function shortMove(m: CpuMove): string {
  if (m.type === 'pass') return 'Pass';
  if (m.type === 'massive') return `${m.positionId} massive(${m.gateId})`;
  if (m.type === 'selective') return `${m.positionId} selective(${m.gates.join(',')})`;
  if (m.type === 'quad') return `${m.positionId} quad`;
  return '?';
}

function shortRecord(r: MoveRecord): string {
  if (r.positioning === 'P' || r.build.type === 'skip') return 'Pass';
  if (r.build.type === 'massive') return `${r.positioning} massive(${r.build.gate ?? '?'})`;
  if (r.build.type === 'selective') {
    const gates = r.build.gates.filter(g => g !== 0);
    return `${r.positioning} selective(${gates.join(',')})`;
  }
  if (r.build.type === 'quad') return `${r.positioning} quad`;
  return '?';
}

// ─── 公開型 ───────────────────────────────────────────────────────────────────

export interface PostmortemMoveRow {
  moveNum: number;
  player: Player;
  played: string;
  best: string | null;        // Black手のみ
  evalAfterPlayed: number;
  evalAfterBest: number | null;
  loss: number | null;        // Black手のみ
  wpAfter: number;            // Black勝率
  wpAfterIfBest: number | null;
  wpSwing: number | null;
  historicWinRate?: number;        // win_rate_black (0–100)
  sampleCount?: number;            // total games
  confidence?: 'reference' | 'main'; // hidden は設定しない
  winRateSource?: 'position_stats';
  resolvedWP?: number;                               // 最終的に使用するWP（0–1）
  resolvedWpSource?: 'static' | 'blend' | 'historic'; // どのソースを使ったか
}

export interface PostmortemCrossing {
  moveNum: number;
  player: Player;
  played: string;
  fromWP: number;
  toWP: number;
  direction: 'up' | 'down';
}

export interface PostmortemResult {
  rows: PostmortemMoveRow[];
  wpInitial: number;
  decisiveCrossing: PostmortemCrossing | null;
  crossings: PostmortemCrossing[];
  topBlackLosses: PostmortemMoveRow[];
}

// ─── resolvedWP ヘルパー ─────────────────────────────────────────────────────

/** main confidence: historicWinRate を直接使用。reference: 50/50 ブレンド。fallback: 静的WP */
function resolveWPForRow(row: PostmortemMoveRow): number {
  if (row.confidence === 'main' && row.historicWinRate !== undefined) {
    return row.historicWinRate / 100;
  }
  if (row.confidence === 'reference' && row.historicWinRate !== undefined) {
    return (row.historicWinRate / 100 + row.wpAfter) / 2;
  }
  return row.wpAfter;
}

/** resolvedWP のソースを判定する */
function resolveWpSource(row: PostmortemMoveRow): 'static' | 'blend' | 'historic' {
  if (row.confidence === 'main' && row.historicWinRate !== undefined) return 'historic';
  if (row.confidence === 'reference' && row.historicWinRate !== undefined) return 'blend';
  return 'static';
}

/**
 * WP graph / DECISIVE MOVE 共通の WP 系列を返す。
 * [wpInitial, resolvedWP[0], resolvedWP[1], ...]
 * resolvedWP が設定されていない行は wpAfter を使う。
 */
export function buildResolvedWPSeries(rows: PostmortemMoveRow[], wpInitial: number): number[] {
  return [wpInitial, ...rows.map(r => r.resolvedWP ?? r.wpAfter)];
}

/**
 * WP swing の大きさと持続性からDECISIVE MOVEを選ぶ。
 * resolvedSeries: buildResolvedWPSeries の結果（length = rows.length + 1）
 */
function computeDecisiveMoveFromSwing(
  rows: PostmortemMoveRow[],
  resolvedSeries: number[],
): PostmortemCrossing | null {
  if (rows.length < 3) return null;

  const n = rows.length;
  const MIN_SWING = 0.05;
  const LATE_GAME_THRESHOLD = 0.85;
  const LATE_GAME_PENALTY = 0.6;
  const REBOUND_LOOKBACK = 2;
  const REBOUND_WEIGHT = 0.7;

  let bestScore = -1;
  let bestIdx = -1;

  for (let i = 0; i < n; i++) {
    const wpBefore = resolvedSeries[i]!;
    const wpAfterI = resolvedSeries[i + 1]!;
    const swing = Math.abs(wpAfterI - wpBefore);

    if (swing < MIN_SWING) continue;

    const direction = wpAfterI > wpBefore ? 1 : -1;
    let reboundSum = 0;
    let reboundCount = 0;
    for (let j = 1; j <= REBOUND_LOOKBACK && (i + j) < n; j++) {
      const wpNext = resolvedSeries[i + j + 1]!;
      const recovery = (wpNext - wpAfterI) * (-direction);
      if (recovery > 0) {
        reboundSum += Math.min(recovery / swing, 1.0);
        reboundCount++;
      }
    }
    const reboundFactor = reboundCount > 0 ? (reboundSum / reboundCount) : 0;

    const isLateGame = (i / n) > LATE_GAME_THRESHOLD;
    const latePenalty = isLateGame ? LATE_GAME_PENALTY : 1.0;

    const adjustedScore = swing * (1 - reboundFactor * REBOUND_WEIGHT) * latePenalty;

    if (adjustedScore > bestScore) {
      bestScore = adjustedScore;
      bestIdx = i;
    }
  }

  if (bestIdx < 0) return null;

  const row = rows[bestIdx]!;
  const wpBefore = resolvedSeries[bestIdx]!;
  const wpAfterI = resolvedSeries[bestIdx + 1]!;

  return {
    moveNum: row.moveNum,
    player: row.player,
    played: row.played,
    fromWP: +wpBefore.toFixed(4),
    toWP: +wpAfterI.toFixed(4),
    direction: wpAfterI < wpBefore ? 'down' : 'up',
  };
}

// ─── メイン分析関数 ───────────────────────────────────────────────────────────

/**
 * MoveRecord[] からゲームをリプレイしてpostmortem分析を実行する。
 * depth=3 固定。
 */
export function runPostmortem(history: MoveRecord[]): PostmortemResult {
  const DEPTH = 3;
  let state: GameState = createInitialState(null);
  // Black first: currentPlayer は 'black' が初期値

  const wpInitial = winProb(evaluateState(state, 'black', true));
  const rows: PostmortemMoveRow[] = [];

  for (const record of history) {
    const currentPlayer = record.player;

    // Black手のみ最善手を計算
    let bestMoveStr: string | null = null;
    let evalBest: number | null = null;
    let wpAfterIfBest: number | null = null;

    if (currentPlayer === 'black') {
      const res = bestMoveDepth(state, 'black', DEPTH);
      bestMoveStr = shortMove(res.move);
      evalBest = res.evalAfter;
      wpAfterIfBest = winProb(evalBest);
    }

    // 実際の手を適用
    const next = applyMoveRecord(state, record);
    const evalPlayed = evaluateState(next, 'black', true);
    const wpAfter = winProb(evalPlayed);

    const loss = evalBest !== null ? Math.max(0, evalBest - evalPlayed) : null;
    const wpSwing = wpAfterIfBest !== null ? wpAfterIfBest - wpAfter : null;

    rows.push({
      moveNum: record.moveNumber,
      player: currentPlayer,
      played: shortRecord(record),
      best: bestMoveStr,
      evalAfterPlayed: Math.round(evalPlayed),
      evalAfterBest: evalBest !== null ? Math.round(evalBest) : null,
      loss: loss !== null ? Math.round(loss) : null,
      wpAfter: +wpAfter.toFixed(4),
      wpAfterIfBest: wpAfterIfBest !== null ? +wpAfterIfBest.toFixed(4) : null,
      wpSwing: wpSwing !== null ? +wpSwing.toFixed(4) : null,
    });

    state = next;
  }

  // 50%跨ぎを検出
  const crossings: PostmortemCrossing[] = [];
  let prevWP = wpInitial;
  for (const r of rows) {
    const fromWP = prevWP;
    const toWP = r.wpAfter;
    if ((fromWP >= 0.5 && toWP < 0.5) || (fromWP < 0.5 && toWP >= 0.5)) {
      crossings.push({
        moveNum: r.moveNum,
        player: r.player,
        played: r.played,
        fromWP: +fromWP.toFixed(4),
        toWP: +toWP.toFixed(4),
        direction: toWP < 0.5 ? 'down' : 'up',
      });
    }
    prevWP = toWP;
  }

  // 決定的な一手：最後の跨ぎのうち終局側と一致するもの
  const finalWP = rows.length > 0 ? rows[rows.length - 1]!.wpAfter : wpInitial;
  const finalSide = finalWP < 0.5 ? 'down' : 'up';
  let decisiveCrossing: PostmortemCrossing | null = null;
  for (let i = crossings.length - 1; i >= 0; i--) {
    if (crossings[i]!.direction === finalSide) {
      decisiveCrossing = crossings[i]!;
      break;
    }
  }

  // Blackの損失top3
  const topBlackLosses = rows
    .filter(r => r.player === 'black' && r.loss !== null && r.loss > 0)
    .sort((a, b) => (b.loss ?? 0) - (a.loss ?? 0))
    .slice(0, 3);

  return { rows, wpInitial, decisiveCrossing, crossings, topBlackLosses };
}

/**
 * runPostmortem の結果に位置統計を付加する（非同期）。
 * RPC失敗・Supabase未接続・統計不足時はrowsを変更せず返す。
 * confidence='hidden'(total<5) の統計は付加しない。
 */
export async function enrichPostmortemWithStats(
  result: PostmortemResult,
  history: MoveRecord[],
): Promise<PostmortemResult> {
  // canonical_hash を収集
  const hashes = history
    .map(r => r.canonical_hash)
    .filter((h): h is string => typeof h === 'string' && h.length > 0);

  if (hashes.length === 0) return result;

  let statsMap: Map<string, import('./positionStats').PositionWinRateRow>;
  try {
    statsMap = await fetchPositionWinRates(hashes, 'all');
  } catch {
    return result; // RPC失敗 → fallback
  }

  // historicWinRate を付加 + resolvedWP を計算
  const enrichedRows = result.rows.map((row, i) => {
    const hash = history[i]?.canonical_hash;
    if (!hash) return { ...row, resolvedWP: row.wpAfter, resolvedWpSource: 'static' as const };
    const stat = statsMap.get(hash);
    if (!stat || stat.confidence === 'hidden') {
      return { ...row, resolvedWP: row.wpAfter, resolvedWpSource: 'static' as const };
    }
    const rowWithHist = {
      ...row,
      historicWinRate: stat.win_rate_black ?? undefined,
      sampleCount: stat.total,
      confidence: stat.confidence as 'reference' | 'main',
      winRateSource: 'position_stats' as const,
    };
    const resolvedWP = resolveWPForRow(rowWithHist);
    const resolvedWpSource = resolveWpSource(rowWithHist);
    return { ...rowWithHist, resolvedWP, resolvedWpSource };
  });

  // resolvedWP が存在しない行を補完（安全策）
  const safeRows = enrichedRows.map(row => ({
    ...row,
    resolvedWP: row.resolvedWP ?? row.wpAfter,
    resolvedWpSource: row.resolvedWpSource ?? 'static' as const,
  }));

  // resolved WP 系列から DECISIVE MOVE を再計算
  const resolvedSeries = buildResolvedWPSeries(safeRows, result.wpInitial);
  const newDecisiveCrossing = computeDecisiveMoveFromSwing(safeRows, resolvedSeries);

  return {
    ...result,
    rows: safeRows,
    decisiveCrossing: newDecisiveCrossing,
  };
}
