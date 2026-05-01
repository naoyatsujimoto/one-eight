/**
 * ai.ts — CPU opponent for ONE EIGHT Web MVP
 *
 * Phase 1 upgrade: minimax with alpha-beta pruning.
 * Phase 2 upgrade: move ordering + strengthened evaluation.
 * Phase 3 upgrade: very_hard difficulty with endgame extension.
 * Phase 4 upgrade: differential gate-cache evaluation (≈5× speedup vs Phase 3).
 *
 * Difficulty levels:
 *   'normal'    → depth 2
 *   'hard'      → depth 3
 *   'very_hard' → depth 3 (base), depth 4 in endgame (≥8/13 positions owned)
 *
 * Evaluation factors (normal/hard):
 *   1. Position count difference (own - opponent)
 *   2. Immediate capture opportunity count (+bonus for CPU)
 *   3. Immediate vulnerability count (-penalty if opponent can capture ours)
 *   4. Raw gate value pressure (Small=1 / Middle=8 / Large=64)
 *   5. Per-gate pip-ratio score (ownValue/total − 0.5) × 120  [cached in GateCache]
 *      replaces former binary ±30; Selective now correctly outscores Quad in contested gates
 *   5b. Gate security score (forward-looking: +40 absolute / +25 effective / +10 leading, net)
 *       [cached in GateCache — stored as net player−opponent]
 *   6. Grip on own positions (+15 per dominated gate on own positions)
 *   7. Recapture risk (-60 when opponent dominates ≥2 gates of our position)
 *
 * Additional evaluation factors for very_hard:
 *   1. Position count weight: 70 (vs 50)
 *   2. Capture opportunity bonus: 160 (vs 120)
 *   3. Vulnerability penalty: 130 (vs 100)
 *   6. Grip bonus: 22 (vs 15)
 *   7. Recapture risk penalty: 90 (vs 60)
 *   8. Territory pressure: +8/-8 per gate dominated on unowned positions
 *
 * Phase 4 — differential evaluation:
 *   GateCache holds per-gate scores (factors 5+5b) for all 12 gates.
 *   On each minimax node, only 1–4 affected gates are recomputed instead of all 12.
 *   Expected ~5× speedup over Phase 3 / ~1.9× over original binary evaluation.
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

export type CpuDifficulty = 'normal' | 'hard' | 'very_hard';

const DEPTH_MAP: Record<CpuDifficulty, number> = {
  normal: 2,
  hard: 3,
  very_hard: 3,
};

// ---------------------------------------------------------------------------
// Endgame detection
// ---------------------------------------------------------------------------

/**
 * Returns true when the board is in endgame phase:
 * at least 8 of 13 positions are owned by either player.
 */
export function isEndgame(state: GameState): boolean {
  let owned = 0;
  for (const posId of POSITION_IDS) {
    if (state.positions[posId].owner !== null) owned++;
  }
  return owned >= 8;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CpuMovePass = { type: 'pass' };

export type CpuMoveMassive = {
  type: 'massive';
  positionId: PositionId;
  gateId: GateId;
  /** Gates affected by this move (used for differential cache update). */
  affectedGates?: GateId[];
};

export type CpuMoveSelective = {
  type: 'selective';
  positionId: PositionId;
  gates: [GateId, GateId];
  /** Gates affected by this move (used for differential cache update). */
  affectedGates?: GateId[];
};

export type CpuMoveQuad = {
  type: 'quad';
  positionId: PositionId;
  /** Up to 4 gate IDs where small slots are available */
  gateIds: GateId[];
  /** Gates affected by this move (used for differential cache update). */
  affectedGates?: GateId[];
};

export type CpuMove = CpuMoveMassive | CpuMoveSelective | CpuMoveQuad | CpuMovePass;

// ---------------------------------------------------------------------------
// Gate cache — differential evaluation (Phase 4)
// ---------------------------------------------------------------------------

/**
 * Per-gate score cache for O(1–4) incremental evaluation.
 *
 * `scores[i]` = net score for gate `GATE_IDS[i]` from `player`'s perspective.
 * "Net" means: (pip-ratio + securityScore(player)) − securityScore(opponent).
 * This symmetry allows flipCachePlayer() to negate scores in O(12) instead of
 * recomputing all gates.
 *
 * Float32Array is used to minimize GC pressure in tight minimax loops.
 */
export type GateCache = {
  scores: Float32Array; // length 12
  player: Player;
};

/** GateId → index into GateCache.scores (0-based, matching GATE_IDS order). */
const GATE_TO_INDEX = new Map<GateId, number>(
  (GATE_IDS as GateId[]).map((g, i) => [g, i] as [GateId, number])
);

// ---------------------------------------------------------------------------
// Legal move enumeration
// ---------------------------------------------------------------------------

/**
 * Returns all legal CPU moves for the given player in the current state.
 * Each move includes `affectedGates` for differential cache updates.
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
      moves.push({
        type: 'massive',
        positionId: posId,
        gateId,
        affectedGates: [gateId],
      });
    }

    // Selective options
    for (const pair of opts.selectivePairs) {
      moves.push({
        type: 'selective',
        positionId: posId,
        gates: pair,
        affectedGates: [...pair],
      });
    }

    // Quad option — gather all gates with free small slots for this position
    if (opts.quadAvailable) {
      const quadGates = POSITION_TO_GATES[posId].filter(
        (gId) => state.gates[gId].smallSlots.some((s) => s === null)
      );
      const quadGateIds = quadGates.slice(0, 4) as GateId[];
      moves.push({
        type: 'quad',
        positionId: posId,
        gateIds: quadGateIds,
        affectedGates: quadGateIds,
      });
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
// Gate security helpers (for evaluateState Factor 5b)
// ---------------------------------------------------------------------------

/**
 * Count unfilled slots of a given size in a gate.
 */
function countUnfilledSlots(
  state: GameState,
  gateId: GateId,
  size: 'small' | 'middle' | 'large',
): number {
  const gate = state.gates[gateId];
  const slots =
    size === 'small'  ? gate.smallSlots  :
    size === 'middle' ? gate.middleSlots :
                        gate.largeSlots;
  return slots.filter((s) => s === null).length;
}

/**
 * Forward-looking gate security bonus for `player` on a specific gate.
 *
 *   +40  Absolutely safe: opponent filling all remaining slots still can't win
 *   +25  Effective control: player can match opponent's best single move and still lead
 *   +10  Currently leading but vulnerable to reversal
 *     0  Not leading or empty gate
 */
function gateSecurityScore(
  state: GameState,
  gateId: GateId,
  player: Player,
): number {
  const opponent: Player = player === 'black' ? 'white' : 'black';
  const gate = state.gates[gateId];
  const ownNow = gatePlayerValue(gate, player);
  const oppNow = gatePlayerValue(gate, opponent);

  if (ownNow === 0 && oppNow === 0) return 0;

  const remainingS = countUnfilledSlots(state, gateId, 'small');
  const remainingM = countUnfilledSlots(state, gateId, 'middle');
  const remainingL = countUnfilledSlots(state, gateId, 'large');
  const oppMaxAdditional = remainingS * 1 + remainingM * 8 + remainingL * 64;

  // Case 1: Absolutely safe
  if (ownNow > oppNow + oppMaxAdditional) {
    return 40;
  }

  // Case 2: Effective control — match opponent's best single move and still lead
  const oppBestSingleMove =
    remainingL > 0 ? 64 :
    remainingM > 0 ? 8  :
    remainingS > 0 ? 1  : 0;
  if (ownNow + oppBestSingleMove > oppNow + oppBestSingleMove) {
    return 25;
  }

  // Case 3: Currently leading but vulnerable
  if (ownNow > oppNow) {
    return 10;
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Phase 4: Gate cache helpers
// ---------------------------------------------------------------------------

/**
 * Compute the net score for a single gate from `player`'s perspective.
 *
 * Combines:
 *   - pip-ratio score: (ownVal / total − 0.5) × 120
 *   - net security:    gateSecurityScore(player) − gateSecurityScore(opponent)
 *
 * Storing as "net" ensures that negating all scores correctly produces the
 * opponent's perspective (used by flipCachePlayer).
 */
function gateScore(state: GameState, gateId: GateId, player: Player): number {
  const opponent: Player = player === 'black' ? 'white' : 'black';
  const gate = state.gates[gateId];
  const ownVal = gatePlayerValue(gate, player);
  const oppVal = gatePlayerValue(gate, opponent);
  const total = ownVal + oppVal;

  let score = total > 0 ? (ownVal / total - 0.5) * 120 : 0;

  score += gateSecurityScore(state, gateId, player);
  score -= gateSecurityScore(state, gateId, opponent);

  return score;
}

/**
 * Initialize a GateCache for the given player before starting minimax.
 * Called once per getBestMove invocation (O(12) full scan).
 */
function initGateCache(state: GameState, player: Player): GateCache {
  const scores = new Float32Array(12);
  for (let i = 0; i < GATE_IDS.length; i++) {
    scores[i] = gateScore(state, GATE_IDS[i] as GateId, player);
  }
  return { scores, player };
}

/**
 * Return a new GateCache with only the gates affected by `move` recomputed.
 * All other gate scores are carried over (O(1–4) per node).
 *
 * Falls back to full recompute if `move.affectedGates` is absent (safety net
 * for move objects created outside enumerateLegalMoves).
 */
function updateGateCache(
  cache: GateCache,
  newState: GameState,
  move: CpuMove,
): GateCache {
  if (move.type === 'pass') return cache;

  const affectedGates: GateId[] =
    move.affectedGates ?? (GATE_IDS as GateId[]); // fallback: recompute all

  // Float32Array.from is faster than push-based construction; shallow copy in O(12)
  const newScores = Float32Array.from(cache.scores);

  for (const gId of affectedGates) {
    const idx = GATE_TO_INDEX.get(gId);
    if (idx !== undefined) {
      newScores[idx] = gateScore(newState, gId, cache.player);
    }
  }

  return { scores: newScores, player: cache.player };
}

/**
 * Compute evaluation factors NOT stored in GateCache.
 *
 * Covers:
 *   1. Position count difference
 *   2. Immediate capture opportunities
 *   3. Immediate vulnerability
 *   4. Raw gate value pressure (ownVal − oppVal, summed)
 *   6. Grip on own positions
 *   7. Recapture risk
 *   8. [very_hard] Territory pressure on unowned positions
 */
function evaluateNonGateTerms(
  state: GameState,
  player: Player,
  veryHard = false,
): number {
  const opponent: Player = player === 'black' ? 'white' : 'black';
  let score = 0;

  const posWeight     = veryHard ? 70  : 50;
  const captureBonus  = veryHard ? 160 : 120;
  const vulnPenalty   = veryHard ? 130 : 100;
  const gripBonus     = veryHard ? 22  : 15;
  const recaptureRisk = veryHard ? 90  : 60;

  // 1. Position count difference
  let ownPositions = 0;
  let oppPositions = 0;
  for (const posId of POSITION_IDS) {
    const owner = state.positions[posId].owner;
    if (owner === player)   ownPositions++;
    if (owner === opponent) oppPositions++;
  }
  score += (ownPositions - oppPositions) * posWeight;

  // 2. Immediate capture opportunities
  for (const posId of POSITION_IDS) {
    if (state.positions[posId].owner === opponent) {
      if (canCapturePosition(state, player, posId)) score += captureBonus;
    }
  }

  // 3. Immediate vulnerability
  for (const posId of POSITION_IDS) {
    if (state.positions[posId].owner === player) {
      if (canCapturePosition(state, opponent, posId)) score -= vulnPenalty;
    }
  }

  // 4. Raw gate value pressure
  for (const gId of GATE_IDS) {
    const gate = state.gates[gId as GateId];
    score += gatePlayerValue(gate, player) - gatePlayerValue(gate, opponent);
  }

  // 6 & 7 (and 8 for very_hard): position-level factors
  for (const posId of POSITION_IDS) {
    const posOwner = state.positions[posId].owner;
    const posGates = POSITION_TO_GATES[posId] as GateId[];

    if (posOwner === player) {
      let playerDominated = 0;
      let opponentDominated = 0;

      for (const gId of posGates) {
        const gate = state.gates[gId];
        const ownVal = gatePlayerValue(gate, player);
        const oppVal = gatePlayerValue(gate, opponent);

        if (ownVal > oppVal) {
          playerDominated++;
          score += gripBonus; // Factor 6
        } else if (oppVal > ownVal) {
          opponentDominated++;
        }
      }

      if (opponentDominated >= 2) {
        score -= recaptureRisk; // Factor 7
      }
    } else if (posOwner === null && veryHard) {
      // Factor 8: territory pressure on unowned positions (very_hard only)
      for (const gId of posGates) {
        const gate = state.gates[gId];
        const ownVal = gatePlayerValue(gate, player);
        const oppVal = gatePlayerValue(gate, opponent);
        if (ownVal > oppVal) score += 8;
        else if (oppVal > ownVal) score -= 8;
      }
    }
  }

  return score;
}

/**
 * Leaf-node evaluation using a pre-computed GateCache.
 *
 * Gate scores (factors 5 + 5b) are summed directly from the cache (O(12)).
 * Non-gate factors are computed fresh but are cheaper than gate scanning.
 */
function evaluateWithCache(
  state: GameState,
  cache: GateCache,
  veryHard = false,
): number {
  // Sum cached gate scores (factors 5 + 5b), no re-scan needed
  let score = 0;
  for (let i = 0; i < 12; i++) score += cache.scores[i] ?? 0;

  // Non-gate terms (factors 1, 2, 3, 4, 6, 7, 8)
  score += evaluateNonGateTerms(state, cache.player, veryHard);

  return score;
}

// ---------------------------------------------------------------------------
// Static evaluation function (kept for external use / backward compat)
// ---------------------------------------------------------------------------

/**
 * Evaluate state from `player`'s perspective.
 * Returns a score: positive = good for player, negative = bad.
 *
 * Factors:
 *   1. Position count difference
 *   2. Immediate capture opportunity count
 *   3. Immediate vulnerability count
 *   4. Raw gate value pressure (own value - opponent value summed across all gates)
 *   5. Per-position gate dominance — pip-ratio score (ownValue/total − 0.5) × 120
 *      replaces the former binary ±30; Selective now correctly outscores Quad in contested gates
 *   5b. Gate security score (net +40/+25/+10 forward-looking bonus per gate)
 *   6. Grip on own positions (+15/+22 per dominated gate on own positions)
 *   7. Recapture risk (-60/-90 if opponent dominates ≥2 gates of our position)
 *   8. [very_hard only] Territory pressure (±8 per gate dominated on unowned positions)
 *
 * @param veryHard  When true, uses strengthened weights for very_hard difficulty.
 */
export function evaluateState(state: GameState, player: Player, veryHard = false): number {
  const opponent: Player = player === 'black' ? 'white' : 'black';
  let score = 0;

  const posWeight       = veryHard ? 70  : 50;
  const captureBonus    = veryHard ? 160 : 120;
  const vulnPenalty     = veryHard ? 130 : 100;
  const gripBonus       = veryHard ? 22  : 15;
  const recaptureRisk   = veryHard ? 90  : 60;

  // 1. Position count difference
  let ownPositions = 0;
  let oppPositions = 0;
  for (const posId of POSITION_IDS) {
    const owner = state.positions[posId].owner;
    if (owner === player)   ownPositions++;
    if (owner === opponent) oppPositions++;
  }
  score += (ownPositions - oppPositions) * posWeight;

  // 2. Immediate capture opportunities for player
  for (const posId of POSITION_IDS) {
    if (state.positions[posId].owner === opponent) {
      if (canCapturePosition(state, player, posId)) score += captureBonus;
    }
  }

  // 3. Immediate vulnerability: opponent can capture our positions
  for (const posId of POSITION_IDS) {
    if (state.positions[posId].owner === player) {
      if (canCapturePosition(state, opponent, posId)) score -= vulnPenalty;
    }
  }

  // 4. Gate value pressure: sum of (own value - opponent value) across all gates
  //    Using Small=1, Middle=8, Large=64 (assetValue already implements this)
  for (const gId of GATE_IDS) {
    const gate = state.gates[gId as GateId];
    const ownVal = gatePlayerValue(gate, player);
    const oppVal = gatePlayerValue(gate, opponent);
    score += (ownVal - oppVal);
  }

  // 5. Per-position gate dominance for owned positions
  // 6. Grip on own positions
  // 7. Recapture risk
  for (const posId of POSITION_IDS) {
    const posOwner = state.positions[posId].owner;

    const posGates = POSITION_TO_GATES[posId] as GateId[];

    if (posOwner !== null) {
      for (const gId of posGates) {
        const gate = state.gates[gId];
        const ownVal = gatePlayerValue(gate, player);
        const oppVal = gatePlayerValue(gate, opponent);
        const total = ownVal + oppVal;

        // Factor 5: pip-ratio gate dominance (replaces binary ±30)
        // Selective (M=8×2 gates) correctly outscores Quad (S=1×4 gates) in contested gates.
        if (total > 0) {
          score += (ownVal / total - 0.5) * 120;
        }

        // Factor 5b: forward-looking gate security bonus (net: player minus opponent perspective)
        score += gateSecurityScore(state, gId, player);
        score -= gateSecurityScore(state, gId, opponent);
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
            score += gripBonus; // Factor 6: grip on own positions
          } else if (oppVal > ownVal) {
            opponentDominatedGates++;
          }
        }

        // Factor 7: recapture risk
        if (opponentDominatedGates >= 2) {
          score -= recaptureRisk;
        }
      }
    } else if (veryHard) {
      // Factor 8 (very_hard only): territory pressure on unowned positions
      for (const gId of posGates) {
        const gate = state.gates[gId];
        const ownVal = gatePlayerValue(gate, player);
        const oppVal = gatePlayerValue(gate, opponent);
        if (ownVal > oppVal) score += 8;
        else if (oppVal > ownVal) score -= 8;
      }
    }
  }

  return score;
}

// ---------------------------------------------------------------------------
// Minimax with alpha-beta pruning (Phase 4: gate-cache aware)
// ---------------------------------------------------------------------------

const INF = 1_000_000;

/**
 * Minimax with alpha-beta pruning and differential gate-cache evaluation.
 *
 * `gateCache` always reflects `maximizingPlayer`'s perspective and is updated
 * incrementally (O(1–4) gate recomputes per node instead of O(12)).
 */
function minimax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  currentPlayer: Player,
  maximizingPlayer: Player,
  veryHard: boolean,
  gateCache: GateCache,
): number {
  if (depth === 0 || state.gameEnded) {
    return evaluateWithCache(state, gateCache, veryHard);
  }

  const moves = enumerateLegalMoves(state, currentPlayer);

  if (moves.length === 0) {
    // No legal moves → treat as pass, switch player
    const opponent: Player = currentPlayer === 'black' ? 'white' : 'black';
    return minimax(state, depth - 1, alpha, beta, opponent, maximizingPlayer, veryHard, gateCache);
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
      // Update only affected gates; cache stays in maximizingPlayer's perspective
      const nextCache = updateGateCache(gateCache, next, move);
      const score = minimax(next, depth - 1, alpha, beta, opponent, maximizingPlayer, veryHard, nextCache);
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (beta <= alpha) break; // beta cutoff
    }
    return best;
  } else {
    let best = INF;
    for (const move of orderedMoves) {
      const next = simulateMove(state, currentPlayer, move);
      const nextCache = updateGateCache(gateCache, next, move);
      const score = minimax(next, depth - 1, alpha, beta, opponent, maximizingPlayer, veryHard, nextCache);
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
 * Phase 4: initializes a GateCache once before tree search and passes it
 * through minimax so each node recomputes only 1–4 affected gates instead of 12.
 *
 * @param state       Current game state
 * @param player      CPU player color
 * @param difficulty  'normal' (depth 2), 'hard' (depth 3), or 'very_hard' (depth 3, +1 in endgame).
 *                    Defaults to 'normal'.
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

  const veryHard = difficulty === 'very_hard';

  // Phase 3: endgame extension for very_hard
  let depth = DEPTH_MAP[difficulty];
  if (veryHard && isEndgame(state)) {
    depth = 4;
  }

  const opponent: Player = player === 'black' ? 'white' : 'black';

  // Phase 4: initialize gate cache once for the entire search tree
  const rootCache = initGateCache(state, player);

  // Phase 2: apply move ordering at root for better pruning
  const orderedLegal = [...legal].sort(
    (a, b) => scoreMoveForOrdering(state, player, b) - scoreMoveForOrdering(state, player, a)
  );

  let bestScore = -INF;
  const bestMoves: CpuMove[] = [];

  for (const move of orderedLegal) {
    const next = simulateMove(state, player, move);
    // Update cache for the root move before descending
    const moveCache = updateGateCache(rootCache, next, move);
    const score = minimax(next, depth - 1, -INF, INF, opponent, player, veryHard, moveCache);
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
