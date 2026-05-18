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
import { fetchPositionWinRates, fetchSymmetryGroupWinRates, fetchMediumPatternWinRates, fetchSimMediumPatternWinRates, fetchSimPositionOnlyWinRates } from './positionStats';
import { computeMediumPatternId } from './mediumPattern';
import type { MediumPatternWinRateRow, SimMediumPatternWinRateRow, SimPositionOnlyWinRateRow } from './positionStats';
import { detectStrategyFlags } from './strategyPatterns';
import type { StrategyFlag } from './strategyPatterns';

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

/** top-N候補手を返す（各候補について evalAfter を計算） */
function topNMovesDepth(
  state: GameState,
  player: Player,
  depth: number,
  n: number,
): { move: CpuMove; evalAfter: number }[] {
  const legal = enumerateLegalMoves(state, player);
  if (legal.length === 0) {
    const evalAfter = evaluateState(state, player, true);
    return [{ move: { type: 'pass' }, evalAfter }];
  }
  const ordered = [...legal].sort(
    (a, b) => scoreMoveForOrdering(state, player, b) - scoreMoveForOrdering(state, player, a),
  );
  const opp: Player = player === 'black' ? 'white' : 'black';
  let alpha = -INF;
  const beta = INF;
  const scored: { move: CpuMove; score: number }[] = [];
  for (const move of ordered) {
    const next = simulateMove(state, player, move);
    const s = minimaxAB(next, depth - 1, alpha, beta, opp, player);
    scored.push({ move, score: s });
    if (s > alpha) alpha = s;
  }
  // score順にソートして上位Nを返す
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, n).map(({ move }) => {
    const next = simulateMove(state, player, move);
    const evalAfter = evaluateState(next, player, true);
    return { move, evalAfter };
  });
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

/** 候補手1件（top3の1つ） */
export interface CandidateMove {
  rank: number;          // 1-indexed
  move: string;          // shortMove() 表記
  wp: number;            // 推定WP（Black視点, 0–1）
  wpDiff: number;        // 実際に指した手との差分（+がProが有利）
}

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
  winRateSource?: 'position_stats' | 'symmetry_group' | 'medium_pattern' | 'sim_medium_pattern' | 'sim_position_only' | 'fh_sim_medium_pattern' | 'fh_sim_position_only';
  resolvedWP?: number;                               // 最終的に使用するWP（0–1）
  resolvedWpSource?: 'static' | 'blend' | 'historic'; // どのソースを使ったか
  /** Phase N-4: post-move 局面で成立している戦略的特徴 */
  strategicFlags?: StrategyFlag[];
  /** Phase M-1: medium_pattern_id（DB未適用時は未使用） */
  mediumPatternId?: string;
  /** Phase P-2b: top3候補手（Pro専用表示用） */
  candidateMoves?: CandidateMove[];
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

// ─── medium_pattern_id リプレイ算出 ──────────────────────────────────────────

/**
 * MoveRecord[] をリプレイして各手の post-move state の medium_pattern_id を算出する。
 * enrichPostmortemWithStats の内部ヘルパー。
 * 既存ゲームで MoveRecord.medium_pattern_id が未設定の場合に使用。
 */
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

// ─── メイン分析関数 ───────────────────────────────────────────────────────────

/**
 * MoveRecord[] からゲームをリプレイしてpostmortem分析を実行する。
 * depth=3 固定。
 * @param humanColor  人間プレイヤーの手番色。候補手表示の対象手番を制御する。
 *   - 'black': 先手（奇数手）のみ候補手を計算・表示
 *   - 'white': 後手（偶数手）のみ候補手を計算・表示
 *   - null/undefined: 安全側として候補手を計算しない
 */
export function runPostmortem(history: MoveRecord[], humanColor?: 'black' | 'white' | null): PostmortemResult {
  const DEPTH = 3;
  let state: GameState = createInitialState(null);
  // Black first: currentPlayer は 'black' が初期値

  const wpInitial = winProb(evaluateState(state, 'black', true));
  const rows: PostmortemMoveRow[] = [];

  for (const record of history) {
    const currentPlayer = record.player;

    // humanColor と一致する手番のみ候補手を計算する
    // humanColor が未指定・null の場合は安全側として計算しない
    const isHumanTurn = humanColor != null && currentPlayer === humanColor;
    let bestMoveStr: string | null = null;
    let evalBest: number | null = null;
    let wpAfterIfBest: number | null = null;
    let candidateMoves: CandidateMove[] | undefined;

    if (isHumanTurn) {
      const top3 = topNMovesDepth(state, currentPlayer, DEPTH, 3);
      if (top3.length > 0) {
        const best = top3[0]!;
        bestMoveStr = shortMove(best.move);
        evalBest = best.evalAfter;
        // white 視点の evalAfter は white 有利 = Black WP が低い → 1 - winProb で Black 視点 WP に変換
        wpAfterIfBest = humanColor === 'white'
          ? 1 - winProb(evalBest)
          : winProb(evalBest);
        // 実際の手のWP（仮計算: 後で正式に計算）を使って差分を計算するため、後でセット
        candidateMoves = top3.map((c, idx) => ({
          rank: idx + 1,
          move: shortMove(c.move),
          // candidateMoves.wp は常に Black 視点 WP で統一
          wp: humanColor === 'white'
            ? +(1 - winProb(c.evalAfter)).toFixed(4)
            : +winProb(c.evalAfter).toFixed(4),
          wpDiff: 0, // 後でwpAfterが確定してから設定
        }));
      }
    }

    // 実際の手を適用
    const next = applyMoveRecord(state, record);
    const evalPlayed = evaluateState(next, 'black', true);
    const wpAfter = winProb(evalPlayed);

    // candidateMovesのwpDiffを確定（実際に指した手のWPとの差分）
    // wpDiff = 候補手WP - 実際の手WP（正が有利 = 人間視点でより良い手があった）
    if (candidateMoves) {
      candidateMoves = candidateMoves.map(c => ({
        ...c,
        wpDiff: +(c.wp - wpAfter).toFixed(4),
      }));
    }

    const loss = evalBest !== null ? Math.max(0, evalBest - evalPlayed) : null;
    const wpSwing = wpAfterIfBest !== null ? wpAfterIfBest - wpAfter : null;

    // Phase N-4: post-move 局面での戦略パターン検出
    const strategicFlags = detectStrategyFlags(next, currentPlayer);

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
      strategicFlags,
      candidateMoves,
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
 * runPostmortem の非同期版。
 * 各手の処理後に setTimeout(0) で制御をブラウザに返し、UIスレッドをブロックしない。
 * バックグラウンド事前計算・PostmortemModal の両方から利用可能。
 *
 * @param history        棋譜
 * @param isCancelled    キャンセルチェック関数（New Game等でキャンセルされた場合にtrueを返す）
 * @param humanColor     人間プレイヤーの手番色。候補手表示の対象手番を制御する。
 */
export async function runPostmortemAsync(
  history: MoveRecord[],
  isCancelled?: () => boolean,
  humanColor?: 'black' | 'white' | null,
): Promise<PostmortemResult> {
  const DEPTH = 3;
  let state: GameState = createInitialState(null);
  const wpInitial = winProb(evaluateState(state, 'black', true));
  const rows: PostmortemMoveRow[] = [];

  for (let idx = 0; idx < history.length; idx++) {
    if (isCancelled?.()) {
      // キャンセルされた場合は中間結果を返す
      break;
    }

    const record = history[idx]!;
    const currentPlayer = record.player;

    // humanColor と一致する手番のみ候補手を計算する
    const isHumanTurn = humanColor != null && currentPlayer === humanColor;
    let bestMoveStr: string | null = null;
    let evalBest: number | null = null;
    let wpAfterIfBest: number | null = null;
    let candidateMoves: CandidateMove[] | undefined;

    if (isHumanTurn) {
      const top3 = topNMovesDepth(state, currentPlayer, DEPTH, 3);
      if (top3.length > 0) {
        const best = top3[0]!;
        bestMoveStr = shortMove(best.move);
        evalBest = best.evalAfter;
        wpAfterIfBest = humanColor === 'white'
          ? 1 - winProb(evalBest)
          : winProb(evalBest);
        candidateMoves = top3.map((c, idx) => ({
          rank: idx + 1,
          move: shortMove(c.move),
          wp: humanColor === 'white'
            ? +(1 - winProb(c.evalAfter)).toFixed(4)
            : +winProb(c.evalAfter).toFixed(4),
          wpDiff: 0,
        }));
      }
    }

    const next = applyMoveRecord(state, record);
    const evalPlayed = evaluateState(next, 'black', true);
    const wpAfter = winProb(evalPlayed);

    if (candidateMoves) {
      candidateMoves = candidateMoves.map(c => ({
        ...c,
        wpDiff: +(c.wp - wpAfter).toFixed(4),
      }));
    }

    const loss = evalBest !== null ? Math.max(0, evalBest - evalPlayed) : null;
    const wpSwing = wpAfterIfBest !== null ? wpAfterIfBest - wpAfter : null;
    const strategicFlags = detectStrategyFlags(next, currentPlayer);

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
      strategicFlags,
      candidateMoves,
    });

    state = next;

    // UIスレッドに制御を返す（60fps 維持のため）
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }

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

  const finalWP = rows.length > 0 ? rows[rows.length - 1]!.wpAfter : wpInitial;
  const finalSide = finalWP < 0.5 ? 'down' : 'up';
  let decisiveCrossing: PostmortemCrossing | null = null;
  for (let i = crossings.length - 1; i >= 0; i--) {
    if (crossings[i]!.direction === finalSide) {
      decisiveCrossing = crossings[i]!;
      break;
    }
  }

  const topBlackLosses = rows
    .filter(r => r.player === 'black' && r.loss !== null && r.loss > 0)
    .sort((a, b) => (b.loss ?? 0) - (a.loss ?? 0))
    .slice(0, 3);

  return { rows, wpInitial, decisiveCrossing, crossings, topBlackLosses };
}

/**
 * runPostmortem の結果に位置統計を付加する（非同期）。
 *
 * fallback chain: canonical_hash → symmetry_group_id → static
 * RPC失敗・Supabase未接続・統計不足時はrowsを変更せず返す。
 * confidence='hidden'(total<5) の統計は付加しない。
 *
 * 【設計方針】
 * - canonical_hash: full state（positions + gates + player + moveNumber）の厳密統計。信頼度の基準。
 * - symmetry_group_id: Position所有状態のみの C4 正規化 hash（= position pattern group）。
 *   Gate asset 差による勝率差が混入するため、厳密な局面グループではない。
 *   → サンプル数が多くても常に「参考値（reference）」として扱い、canonical_hashと同格にしない。
 *   → resolvedWP は常にblend（50/50）とし、direct historic WP は使わない。
 *
 * 【将来の拡張余地】
 *   Position所有 + Gate支配要約（e.g. 各Gate上の優勢プレイヤーのみ）による中間粒度IDを
 *   別フィールド（e.g. mid_group_id）として追加し、第3の fallback として挿入できる設計。
 */
export async function enrichPostmortemWithStats(
  result: PostmortemResult,
  history: MoveRecord[],
): Promise<PostmortemResult> {
  // 各「局面ID」を收集
  const hashes = history
    .map(r => r.canonical_hash)
    .filter((h): h is string => typeof h === 'string' && h.length > 0);
  const groupIds = history
    .map(r => r.symmetry_group_id)
    .filter((g): g is string => typeof g === 'string' && g.length > 0);

  // medium_pattern_id の取得: MoveRecord にあればそれを使い、なければリプレイ算出
  const mediumPatternIds: (string | undefined)[] = history.map(r => r.medium_pattern_id);
  const needsReplay = mediumPatternIds.some(id => !id);

  if (needsReplay) {
    // history をリプレイして各 post-move state から medium_pattern_id を算出
    const replayedIds = computeMediumPatternIdsFromHistory(history);
    for (let i = 0; i < mediumPatternIds.length; i++) {
      if (!mediumPatternIds[i]) {
        mediumPatternIds[i] = replayedIds[i];
      }
    }
  }

  const validMediumPatternIds = mediumPatternIds.filter((p): p is string => typeof p === 'string' && p.length > 0);

  // position_only_id = medium_pattern_id の ":" より前（posOwnershipHash）
  const positionOnlyIds: (string | undefined)[] = mediumPatternIds.map(pid => {
    if (!pid) return undefined;
    const colonIdx = pid.indexOf(':');
    return colonIdx >= 0 ? pid.slice(0, colonIdx) : pid;
  });
  const validPositionOnlyIds = [...new Set(
    positionOnlyIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
  )];

  if (hashes.length === 0 && groupIds.length === 0 && validMediumPatternIds.length === 0) return result;

  // 一括フェッチ（並列実行）
  const [
    canonicalMap,
    symmetryMap,
    mediumPatternMap,
    fhSimMediumPatternMap,
    fhSimPositionOnlyMap,
    simMediumPatternMap,
    simPositionOnlyMap,
  ] =
    await Promise.all([
      // canonical_hash 統計
      hashes.length > 0
        ? fetchPositionWinRates(hashes, 'all').catch(() => new Map())
        : Promise.resolve(new Map<string, import('./positionStats').PositionWinRateRow>()),

      // symmetry_group_id 統計（fallback用）
      groupIds.length > 0
        ? fetchSymmetryGroupWinRates(groupIds, 'all').catch(() => new Map())
        : Promise.resolve(new Map<string, import('./positionStats').SymmetryGroupWinRateRow>()),

      // 実戦 medium_pattern 統計（Step 1.5 fallback）— min_total=5
      validMediumPatternIds.length > 0
        ? fetchMediumPatternWinRates(validMediumPatternIds, 5, 'all').catch(() => new Map())
        : Promise.resolve(new Map<string, MediumPatternWinRateRow>()),

      // fast_hard sim medium_pattern 統計（Step 2.3a fallback）— min_total=30
      validMediumPatternIds.length > 0
        ? fetchSimMediumPatternWinRates(validMediumPatternIds, 30, 'fast_hard_vs_fast_hard').catch(() => new Map())
        : Promise.resolve(new Map<string, SimMediumPatternWinRateRow>()),

      // fast_hard sim position_only 統計（Step 2.5a fallback）— min_total=100
      validPositionOnlyIds.length > 0
        ? fetchSimPositionOnlyWinRates(validPositionOnlyIds, 100, 'fast_hard_vs_fast_hard').catch(() => new Map())
        : Promise.resolve(new Map<string, SimPositionOnlyWinRateRow>()),

      // easy sim medium_pattern 統計（Step 2.3b fallback）— min_total=30
      validMediumPatternIds.length > 0
        ? fetchSimMediumPatternWinRates(validMediumPatternIds, 30, 'easy_vs_easy').catch(() => new Map())
        : Promise.resolve(new Map<string, SimMediumPatternWinRateRow>()),

      // easy sim position_only 統計（Step 2.5b fallback）— min_total=100
      validPositionOnlyIds.length > 0
        ? fetchSimPositionOnlyWinRates(validPositionOnlyIds, 100, 'easy_vs_easy').catch(() => new Map())
        : Promise.resolve(new Map<string, SimPositionOnlyWinRateRow>()),
    ]);

  // fallback chain で各行を enrich
  const enrichedRows = result.rows.map((row, i) => {
    const hash = history[i]?.canonical_hash;
    const groupId = history[i]?.symmetry_group_id;
    const mediumPatternId = mediumPatternIds[i];
    const positionOnlyId = positionOnlyIds[i];

    // ──────────────────────────────────────────────────────────────────────────
    // Step 1: 実戦 canonical_hash 統計
    //   採用条件: confidence != 'hidden' (total >= 5)
    //   confidence: DB値をそのまま使用（'reference' or 'main'）
    //   resolvedWP: main=historic, reference=50/50 blend
    // ──────────────────────────────────────────────────────────────────────────
    const canonicalStat = hash ? canonicalMap.get(hash) : undefined;
    if (canonicalStat && canonicalStat.confidence !== 'hidden') {
      const rowWithHist = {
        ...row,
        historicWinRate: canonicalStat.win_rate_black ?? undefined,
        sampleCount: canonicalStat.total,
        confidence: canonicalStat.confidence as 'reference' | 'main',
        winRateSource: 'position_stats' as const,
      };
      const resolvedWP = resolveWPForRow(rowWithHist);
      return { ...rowWithHist, resolvedWP, resolvedWpSource: resolveWpSource(rowWithHist) };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Step 1.5: 実戦 medium_pattern_id fallback
    //   採用条件: total >= 5 (confidence='reference'固定)
    //   resolvedWP: 50/50 blend (historicWinRate + wpAfter) / 2
    //   winRateSource: 'medium_pattern'
    //   注意: medium_pattern_id は実戦の MoveRecordから取得
    //            (旧実装のバグを修正： initial state を渡す事はしない)
    // ──────────────────────────────────────────────────────────────────────────
    const mediumPatternStat = mediumPatternId ? mediumPatternMap.get(mediumPatternId) : undefined;
    if (mediumPatternStat && mediumPatternStat.total >= 5 && mediumPatternStat.win_rate_black !== null) {
      const rowWithMed = {
        ...row,
        historicWinRate: mediumPatternStat.win_rate_black ?? undefined,
        sampleCount: mediumPatternStat.total,
        confidence: 'reference' as const,  // medium_pattern は常に reference 固定
        winRateSource: 'medium_pattern' as const,
      };
      const resolvedWP = resolveWPForRow(rowWithMed); // 50/50 blend
      return { ...rowWithMed, resolvedWP, resolvedWpSource: 'blend' as const };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Step 2: symmetry_group_id 統計へ fallback
    //   【重要】 symmetry_group_id は Position 所有 + Gate asset 差が混入するため、
    //   実際の sampleCount に関わらず confidence を 'reference' に固定する。
    // ──────────────────────────────────────────────────────────────────────────
    const symmetryStat = groupId ? symmetryMap.get(groupId) : undefined;
    if (symmetryStat && symmetryStat.confidence !== 'hidden') {
      const rowWithSym = {
        ...row,
        historicWinRate: symmetryStat.win_rate_black ?? undefined,
        sampleCount: symmetryStat.total,
        confidence: 'reference' as const,  // Gate asset 差混入リスクのため常に reference 固定
        winRateSource: 'symmetry_group' as const,
      };
      const resolvedWP = resolveWPForRow(rowWithSym);
      return { ...rowWithSym, resolvedWP, resolvedWpSource: resolveWpSource(rowWithSym) };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ──────────────────────────────────────────────────────────────────────────
    // Step 2.3a: fast_hard sim medium_pattern fallback
    //   採用条件: total >= 30 (confidence='reference'固定)
    //   resolvedWP: 0.2 × simWP + 0.8 × staticWP (wpAfter)
    //   winRateSource: 'fh_sim_medium_pattern'
    //   優先度: easy_vs_easyより上位（実戦よりは下位）
    // ──────────────────────────────────────────────────────────────────────────
    const fhSimMedPatternStat = mediumPatternId ? fhSimMediumPatternMap.get(mediumPatternId) : undefined;
    if (fhSimMedPatternStat && fhSimMedPatternStat.total >= 30 && fhSimMedPatternStat.win_rate_black !== null) {
      const simWP = fhSimMedPatternStat.win_rate_black / 100;
      const blendedWP = 0.2 * simWP + 0.8 * row.wpAfter;
      return {
        ...row,
        historicWinRate: fhSimMedPatternStat.win_rate_black,
        sampleCount: fhSimMedPatternStat.total,
        confidence: 'reference' as const,
        winRateSource: 'fh_sim_medium_pattern' as const,
        resolvedWP: blendedWP,
        resolvedWpSource: 'blend' as const,
      };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Step 2.5a: fast_hard sim position_only（total >= 100, blend 0.1）
    //   採用条件: total >= 100
    //   resolvedWP: 0.1 × posWP + 0.9 × staticWP (wpAfter)
    //   winRateSource: 'fh_sim_position_only'
    //   優先度: easy_vs_easyより上位（実戦よりは下位）
    // ──────────────────────────────────────────────────────────────────────────
    const fhSimPosOnlyStat = positionOnlyId ? fhSimPositionOnlyMap.get(positionOnlyId) : undefined;
    if (fhSimPosOnlyStat && fhSimPosOnlyStat.total >= 100) {
      const posWP = fhSimPosOnlyStat.win_rate_black; // black視点（0–1範囲）
      const blendedWP = 0.1 * posWP + 0.9 * row.wpAfter;
      return {
        ...row,
        historicWinRate: Math.round(posWP * 10000) / 100, // 0–1 → 0–100
        sampleCount: fhSimPosOnlyStat.total,
        confidence: 'reference' as const,
        winRateSource: 'fh_sim_position_only' as const,
        resolvedWP: blendedWP,
        resolvedWpSource: 'blend' as const,
      };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Step 2.3b: easy sim medium_pattern fallback
    //   採用条件: total >= 30 (confidence='reference'固定)
    //   resolvedWP: 0.2 × simWP + 0.8 × staticWP (wpAfter)
    //   winRateSource: 'sim_medium_pattern'
    // ──────────────────────────────────────────────────────────────────────────
    const simMedPatternStat = mediumPatternId ? simMediumPatternMap.get(mediumPatternId) : undefined;
    if (simMedPatternStat && simMedPatternStat.total >= 30 && simMedPatternStat.win_rate_black !== null) {
      const simWP = simMedPatternStat.win_rate_black / 100;
      const blendedWP = 0.2 * simWP + 0.8 * row.wpAfter;
      return {
        ...row,
        historicWinRate: simMedPatternStat.win_rate_black,
        sampleCount: simMedPatternStat.total,
        confidence: 'reference' as const,
        winRateSource: 'sim_medium_pattern' as const,
        resolvedWP: blendedWP,
        resolvedWpSource: 'blend' as const,
      };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Step 2.5b: easy sim position_only（total >= 100, blend 0.1）
    //   採用条件: total >= 100
    //   resolvedWP: 0.1 × posWP + 0.9 × staticWP (wpAfter)
    //   winRateSource: 'sim_position_only'
    // ──────────────────────────────────────────────────────────────────────────
    const simPosOnlyStat = positionOnlyId ? simPositionOnlyMap.get(positionOnlyId) : undefined;
    if (simPosOnlyStat && simPosOnlyStat.total >= 100) {
      const posWP = simPosOnlyStat.win_rate_black; // black視点（0–1範囲）
      const blendedWP = 0.1 * posWP + 0.9 * row.wpAfter;
      return {
        ...row,
        historicWinRate: Math.round(posWP * 10000) / 100, // 0–1 → 0–100
        sampleCount: simPosOnlyStat.total,
        confidence: 'reference' as const,
        winRateSource: 'sim_position_only' as const,
        resolvedWP: blendedWP,
        resolvedWpSource: 'blend' as const,
      };
    }

    // Step 3: static fallback
    // ──────────────────────────────────────────────────────────────────────────
    return { ...row, resolvedWP: row.wpAfter, resolvedWpSource: 'static' as const };
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
