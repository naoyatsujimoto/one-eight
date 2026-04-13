/**
 * ai.ts — CPU opponent for ONE EIGHT Web MVP
 *
 * Scope: legal-move enumeration + evaluation-based move selection (depth 1).
 * No minimax, no search tree, no learning.
 *
 * Move selection:
 *   Enumerate all legal moves → score each → pick highest-score move.
 *   Ties broken randomly for variety.
 */

import { POSITION_IDS, POSITION_TO_GATES } from './constants';
import { canCapturePosition } from './capture';
import { gatePlayerValue } from './build';
import { getAvailableBuildOptions } from './selectors';
import { selectPosition, applyMassiveBuild, applySelectiveBuild, applyQuadBuildForGates } from './engine';
import type { GameState, GateId, Player, PositionId } from './types';

// ---------------------------------------------------------------------------
// Score constants (tune here)
// ---------------------------------------------------------------------------

const SCORE_CAPTURE        =  1000; // move captures an opponent-owned position
const SCORE_MASSIVE        =   300; // build type: massive (large asset, high value)
const SCORE_SELECTIVE      =   150; // build type: selective (middle asset)
const SCORE_QUAD           =    50; // build type: quad (small assets)
const SCORE_PASS           =  -500; // pass move heavily penalised
const SCORE_PER_OWN_POS    =    30; // per position owned by player after move
const SCORE_PER_OPP_POS    =   -30; // per position owned by opponent after move
const SCORE_PER_GATE_DOM   =    10; // per gate where player dominates (playerValue > opponentValue)
const SCORE_EXPOSE_PENALTY =  -200; // penalty if opponent can capture one of our positions after move
const SCORE_RANDOM_RANGE   =     5; // +/- random jitter to avoid monotony

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
 * A legal move is: pick a selectable position, then pick a valid build.
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
      // Position selectable but no build → only contributes a pass at this pos,
      // skip unless all positions have no builds (handled below)
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
// Evaluation helpers
// ---------------------------------------------------------------------------

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** Apply a CpuMove to a state and return the resulting state. */
function simulateMove(state: GameState, player: Player, move: CpuMove): GameState {
  if (move.type === 'pass') return state;

  // selectPosition sets selectedPosition and updates owner to currentPlayer.
  // We must ensure currentPlayer matches `player`.
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

/** Count positions owned by `player` in the given state. */
function countPositions(state: GameState, player: Player): number {
  return Object.values(state.positions).filter((p) => p.owner === player).length;
}

/** Count gates where playerValue strictly dominates opponentValue. */
function countDominatedGates(state: GameState, player: Player): number {
  const opponent: Player = player === 'black' ? 'white' : 'black';
  return Object.values(state.gates).filter((gate) => {
    return gatePlayerValue(gate, player) > gatePlayerValue(gate, opponent);
  }).length;
}

/** Returns true if opponent can capture at least one of player's positions. */
function canOpponentCapture(state: GameState, player: Player): boolean {
  const opponent: Player = player === 'black' ? 'white' : 'black';
  return Object.values(state.positions).some(
    (pos) => pos.owner === player && canCapturePosition(state, opponent, pos.id)
  );
}

// ---------------------------------------------------------------------------
// Evaluation function
// ---------------------------------------------------------------------------

/**
 * Score a single move for `player` in the given state.
 * Higher = better for player.
 */
function scoreMove(state: GameState, player: Player, move: CpuMove): number {
  const opponent: Player = player === 'black' ? 'white' : 'black';
  let score = 0;

  // 1. Pass penalty
  if (move.type === 'pass') {
    return SCORE_PASS + (Math.random() * 2 - 1) * SCORE_RANDOM_RANGE;
  }

  // 2. Capture bonus: move targets an opponent-owned position
  const pos = state.positions[move.positionId];
  if (pos.owner !== null && pos.owner === opponent) {
    score += SCORE_CAPTURE;
  }

  // 3. Build-type value
  if (move.type === 'massive')   score += SCORE_MASSIVE;
  if (move.type === 'selective') score += SCORE_SELECTIVE;
  if (move.type === 'quad')      score += SCORE_QUAD;

  // 4. Simulate the move and evaluate resulting state
  const after = simulateMove(state, player, move);

  // Position count advantage
  score += countPositions(after, player)   * SCORE_PER_OWN_POS;
  score += countPositions(after, opponent) * SCORE_PER_OPP_POS;

  // Gate domination
  score += countDominatedGates(after, player) * SCORE_PER_GATE_DOM;

  // 5. Exposure penalty: can opponent capture one of our positions next turn?
  if (canOpponentCapture(after, player)) {
    score += SCORE_EXPOSE_PENALTY;
  }

  // 6. Small random jitter to avoid monotony
  score += (Math.random() * 2 - 1) * SCORE_RANDOM_RANGE;

  return score;
}

// ---------------------------------------------------------------------------
// Move selection (evaluation-based)
// ---------------------------------------------------------------------------

/**
 * Select one move for the CPU player using evaluation scoring.
 * All legal moves are scored; the highest-scoring move is chosen.
 * Ties broken randomly.
 */
export function selectCpuMove(state: GameState, player: Player): CpuMove {
  const legal = enumerateLegalMoves(state, player);

  if (legal.length === 0) {
    return { type: 'pass' };
  }

  // Score all legal moves
  const scored = legal.map((move) => ({
    move,
    score: scoreMove(state, player, move),
  }));

  // Find the best score
  const best = Math.max(...scored.map((s) => s.score));
  const bestMoves = scored.filter((s) => s.score === best).map((s) => s.move);

  // Random tie-breaking
  return pickRandom(bestMoves);
}
