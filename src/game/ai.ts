/**
 * ai.ts — CPU opponent for ONE EIGHT Web MVP
 *
 * Phase 1 upgrade: minimax with alpha-beta pruning.
 * Phase 2 upgrade: move ordering + strengthened evaluation.
 *
 * Difficulty levels:
 *   'normal' → depth 2
 *   'hard'   → depth 3
 *
 * Evaluation factors:
 *   1. Position count difference (own - opponent)
 *   2. Immediate capture opportunity count (+bonus for CPU)
 *   3. Immediate vulnerability count (-penalty if opponent can capture ours)
 *   4. Raw gate value pressure (Small=1 / Middle=8 / Large=64)
 *   5. Per-position gate dominance (±30 per gate for owned positions)
 *   6. Grip on own positions (+15 per dominated gate on own positions)
 *   7. Recapture risk (-60 when opponent dominates ≥2 gates of our position)
 */

import { POSITION_IDS, POSITION_TO_GATES, GATE_IDS } from './constants';
import { canCapturePosition } from './capture';
import { gatePlayerValue, assetValue, gateTotalValue } from './build';
import { getAvailableBuildOptions } from './selectors';
import { selectPosition, applyMassiveBuild, applySelectiveBuild, applyQuadBuildForGates } from './engine';
import type { GameState, GateId, Player, PositionId } from './types';

// ---------------------------------------------------------------------------
// Difficulty configuration
// ---------------------------------------------------------------------------

export type CpuDifficulty = 'normal' | 'hard';

const DEPTH_MAP: Record<CpuDifficulty, number> = {
  normal: 2,
  hard: 3,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CpuMovePass = { type: 'pass' };

export type CpuMoveMassive = {
  type: 'massive';
  positionId: PositionId;
  gateId: GateId;
};

export type CpuMoveSelective = {
  type: 'selective';
  positionId: PositionId;
  gates: [GateId, GateId];
};

export type CpuMoveQuad = {
  type: 'quad';
  positionId: PositionId;
  /** Up to 4 gate IDs where small slots are available */
  gateIds: GateId[];
};

export type CpuMove = CpuMoveMassive | CpuMoveSelective | CpuMoveQuad | CpuMovePass;

// ---------------------------------------------------------------------------
// Legal move enumeration
// ---------------------------------------------------------------------------

/**
 * Returns all legal CPU moves for the given player in the current state.
 */
export function enumerateLegalMoves(state: GameState, player: Player): CpuMove[] {
  const moves: CpuMove[] = [];

  for (const posId of POSITION_IDS) {
    const pos = state.positions[posId];
    // Skip positions owned by the opponent unless they can be captured
    if (pos.owner !== null && pos.owner !== player) {
      if (!canCapturePosition(state, player, posId)) continue;
    }

    const opts = getAvailableBuildOptions(state, posId);

    if (!opts.hasAny) {
      continue;
    }

    // Massive options
    for (const gateId of opts.massiveGateIds) {
      moves.push({ type: 'massive', positionId: posId, gateId });
    }

    // Selective options
    for (const pair of opts.selectivePairs) {
      moves.push({ type: 'selective', positionId: posId, gates: pair });
    }

    // Quad option — gather all gates with free small slots for this position
    if (opts.quadAvailable) {
      const quadGates = POSITION_TO_GATES[posId].filter(
        (gId) => state.gates[gId].smallSlots.some((s) => s === null)
      );
      moves.push({ type: 'quad', positionId: posId, gateIds: quadGates.slice(0, 4) as GateId[] });
    }
  }

  return moves;
}

// ---------------------------------------------------------------------------
// Move ordering
// ---------------------------------------------------------------------------

/**
 * Score a move for alpha-beta ordering (higher = search first).
 *
 * Priority:
 *   +1000  Immediate capture (opponent's position that we can take)
 *   +500   Blocks opponent's immediate capture (our position opponent can take)
 *   +200   Affects the most-built gate of the position
 *   +5×V   Higher gate value involvement (V = max gateTotalValue among move's gates)
 *   0      Passive baseline
 */
export function scoreMoveForOrdering(state: GameState, player: Player, move: CpuMove): number {
  if (move.type === 'pass') return 0;

  const opponent: Player = player === 'black' ? 'white' : 'black';
  const posId = move.positionId;
  const posOwner = state.positions[posId].owner;

  let score = 0;

  // Rule 1: Immediate capture
  if (posOwner === opponent && canCapturePosition(state, player, posId)) {
    score += 1000;
  }

  // Rule 2: Block opponent's immediate capture of our position
  if (posOwner === player && canCapturePosition(state, opponent, posId)) {
    score += 500;
  }

  // Determine which gates this move involves
  const moveGates: GateId[] =
    move.type === 'massive' ? [move.gateId] :
    move.type === 'selective' ? [...move.gates] :
    move.type === 'quad' ? [...move.gateIds] :
    [];

  // Rule 3: Affects the most-built gate of the position
  const posGates = POSITION_TO_GATES[posId] as GateId[];
  const maxGateValue = Math.max(...posGates.map(g => gateTotalValue(state.gates[g])));
  const moveInvolvesMostBuilt = moveGates.some(
    g => gateTotalValue(state.gates[g]) === maxGateValue
  );
  if (moveInvolvesMostBuilt) {
    score += 200;
  }

  // Rule 4: Higher gate value involvement (+5 per point of max gate value in move)
  const maxMoveGateValue = moveGates.length > 0
    ? Math.max(...moveGates.map(g => gateTotalValue(state.gates[g])))
    : 0;
  score += maxMoveGateValue * 5;

  return score;
}

// ---------------------------------------------------------------------------
// Move simulation
// ---------------------------------------------------------------------------

/** Apply a CpuMove to a state and return the resulting state. */
function simulateMove(state: GameState, player: Player, move: CpuMove): GameState {
  if (move.type === 'pass') return state;

  const stateForPlayer: GameState = state.currentPlayer === player
    ? state
    : { ...state, currentPlayer: player };

  const selected = selectPosition(stateForPlayer, move.positionId);

  switch (move.type) {
    case 'massive':
      return applyMassiveBuild(selected, move.gateId);
    case 'selective':
      return applySelectiveBuild(selected, move.gates);
    case 'quad':
      return applyQuadBuildForGates(selected, move.gateIds);
  }
}

// ---------------------------------------------------------------------------
// Static evaluation function
// ---------------------------------------------------------------------------

/**
 * Evaluate state from `player`'s perspective.
 * Returns a score: positive = good for player, negative = bad.
 *
 * Factors:
 *   1. Position count difference
 *   2. Immediate capture opportunity count
 *   3. Immediate vulnerability count
 *   4. Gate value pressure (own value - opponent value summed across all gates)
 *   5. Per-position gate dominance (±30 per gate for owned positions)
 *   6. Grip on own positions (+15 per gate player dominates on own positions)
 *   7. Recapture risk (-60 if opponent dominates ≥2 of our position's gates)
 */
export function evaluateState(state: GameState, player: Player): number {
  const opponent: Player = player === 'black' ? 'white' : 'black';
  let score = 0;

  // 1. Position count difference
  let ownPositions = 0;
  let oppPositions = 0;
  for (const posId of POSITION_IDS) {
    const owner = state.positions[posId].owner;
    if (owner === player)   ownPositions++;
    if (owner === opponent) oppPositions++;
  }
  score += (ownPositions - oppPositions) * 50;

  // 2. Immediate capture opportunities for player
  for (const posId of POSITION_IDS) {
    if (state.positions[posId].owner === opponent) {
      if (canCapturePosition(state, player, posId)) score += 120;
    }
  }

  // 3. Immediate vulnerability: opponent can capture our positions
  for (const posId of POSITION_IDS) {
    if (state.positions[posId].owner === player) {
      if (canCapturePosition(state, opponent, posId)) score -= 100;
    }
  }

  // 4. Gate value pressure: sum of (own value - opponent value) across all gates
  //    Using Small=1, Middle=8, Large=64 (assetValue already implements this)
  for (const gId of GATE_IDS) {
    const gate = state.gates[gId];
    const ownVal = gatePlayerValue(gate, player);
    const oppVal = gatePlayerValue(gate, opponent);
    score += (ownVal - oppVal);
  }

  // 5. Per-position gate dominance for owned positions
  // 6. Grip on own positions
  // 7. Recapture risk
  for (const posId of POSITION_IDS) {
    const posOwner = state.positions[posId].owner;
    if (posOwner === null) continue;

    const posGates = POSITION_TO_GATES[posId] as GateId[];

    for (const gId of posGates) {
      const gate = state.gates[gId];
      const ownVal = gatePlayerValue(gate, player);
      const oppVal = gatePlayerValue(gate, opponent);

      // Factor 5: per-position gate dominance
      if (ownVal > oppVal) score += 30;
      else if (oppVal > ownVal) score -= 30;
    }

    // Factors 6 & 7: apply only to player's own positions
    if (posOwner === player) {
      let playerDominatedGates = 0;
      let opponentDominatedGates = 0;

      for (const gId of posGates) {
        const gate = state.gates[gId];
        const ownVal = gatePlayerValue(gate, player);
        const oppVal = gatePlayerValue(gate, opponent);

        if (ownVal > oppVal) {
          playerDominatedGates++;
          score += 15; // Factor 6: grip on own positions
        } else if (oppVal > ownVal) {
          opponentDominatedGates++;
        }
      }

      // Factor 7: recapture risk
      if (opponentDominatedGates >= 2) {
        score -= 60;
      }
    }
  }

  return score;
}

// ---------------------------------------------------------------------------
// Minimax with alpha-beta pruning
// ---------------------------------------------------------------------------

const INF = 1_000_000;

/**
 * Minimax with alpha-beta pruning.
 * `maximizingPlayer` = the root CPU player.
 * Returns the best achievable score from this node.
 */
function minimax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  currentPlayer: Player,
  maximizingPlayer: Player,
): number {
  if (depth === 0 || state.gameEnded) {
    return evaluateState(state, maximizingPlayer);
  }

  const moves = enumerateLegalMoves(state, currentPlayer);

  if (moves.length === 0) {
    // No legal moves → treat as pass, switch player
    const opponent: Player = currentPlayer === 'black' ? 'white' : 'black';
    return minimax(state, depth - 1, alpha, beta, opponent, maximizingPlayer);
  }

  const isMaximizing = currentPlayer === maximizingPlayer;
  const opponent: Player = currentPlayer === 'black' ? 'white' : 'black';

  // Phase 2: sort moves by ordering score (descending) for better alpha-beta cutoffs
  const orderedMoves = [...moves].sort(
    (a, b) => scoreMoveForOrdering(state, currentPlayer, b) - scoreMoveForOrdering(state, currentPlayer, a)
  );

  if (isMaximizing) {
    let best = -INF;
    for (const move of orderedMoves) {
      const next = simulateMove(state, currentPlayer, move);
      const score = minimax(next, depth - 1, alpha, beta, opponent, maximizingPlayer);
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (beta <= alpha) break; // beta cutoff
    }
    return best;
  } else {
    let best = INF;
    for (const move of orderedMoves) {
      const next = simulateMove(state, currentPlayer, move);
      const score = minimax(next, depth - 1, alpha, beta, opponent, maximizingPlayer);
      if (score < best) best = score;
      if (score < beta) beta = score;
      if (beta <= alpha) break; // alpha cutoff
    }
    return best;
  }
}

// ---------------------------------------------------------------------------
// Move selection
// ---------------------------------------------------------------------------

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/**
 * Select one move for the CPU player using minimax search.
 *
 * @param state   Current game state
 * @param player  CPU player color
 * @param difficulty  'normal' (depth 2) or 'hard' (depth 3). Defaults to 'normal'.
 */
export function selectCpuMove(
  state: GameState,
  player: Player,
  difficulty: CpuDifficulty = 'normal',
): CpuMove {
  const legal = enumerateLegalMoves(state, player);

  if (legal.length === 0) {
    return { type: 'pass' };
  }

  const depth = DEPTH_MAP[difficulty];
  const opponent: Player = player === 'black' ? 'white' : 'black';

  // Phase 2: apply move ordering at root for better pruning
  const orderedLegal = [...legal].sort(
    (a, b) => scoreMoveForOrdering(state, player, b) - scoreMoveForOrdering(state, player, a)
  );

  let bestScore = -INF;
  const bestMoves: CpuMove[] = [];

  for (const move of orderedLegal) {
    const next = simulateMove(state, player, move);
    const score = minimax(next, depth - 1, -INF, INF, opponent, player);
    if (score > bestScore) {
      bestScore = score;
      bestMoves.length = 0;
      bestMoves.push(move);
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
  }

  return pickRandom(bestMoves);
}
