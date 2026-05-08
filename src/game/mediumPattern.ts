/**
 * mediumPattern.ts — Medium Pattern ID computation for ONE EIGHT Web MVP
 *
 * Phase M-1: 候補F（Position所有 + corner gate dominance）実装
 *
 * medium_pattern_id = `${part1}:${part2}`
 *
 * part1: C4正規化済みPosition所有マスク（symmetry_group_id と同一）
 *   - computePositionOwnershipCanonicalHashString() を再利用
 *
 * part2: Corner Gate dominance bits（Gate 1, 4, 7, 10）
 *   - 各 corner gate の dominance を '0'（neutral）/'1'（black）/'2'（white）で表現
 *   - C4正規化と同じ回転サイクル（1→4→7→10→1）で4回転を全計算し辞書順最小を採用
 *
 * Constraints:
 *   - CPU評価関数に触れない
 *   - Step F-3 / 探索枝刈りに進まない
 *   - 既存 canonical / symmetry / sim_easy の動作を壊さない
 */

import type { GateId, GameState } from './types';
import {
  computePositionOwnershipHashStringForRotation,
  getInverseGateMapForRotation,
} from './zobrist';

// ---------------------------------------------------------------------------
// Corner Gate definition
// ---------------------------------------------------------------------------

/** Corner gates (C4 cycle: 1→4→7→10→1) */
const CORNER_GATES: [GateId, GateId, GateId, GateId] = [1, 4, 7, 10];

// ---------------------------------------------------------------------------
// Gate dominance helper
// ---------------------------------------------------------------------------

/**
 * Compute the dominance character for a single gate.
 *
 * Dominance is determined by total asset count per player (all slot types).
 *   black > white → '1'
 *   white > black → '2'
 *   equal (including 0-0) → '0'
 */
function gateDominanceChar(state: GameState, gateId: GateId): '0' | '1' | '2' {
  const gate = state.gates[gateId];
  if (!gate) return '0';

  let blackCount = 0;
  let whiteCount = 0;

  for (const slot of gate.largeSlots) {
    if (slot?.owner === 'black') blackCount++;
    else if (slot?.owner === 'white') whiteCount++;
  }
  for (const slot of gate.middleSlots) {
    if (slot?.owner === 'black') blackCount++;
    else if (slot?.owner === 'white') whiteCount++;
  }
  for (const slot of gate.smallSlots) {
    if (slot?.owner === 'black') blackCount++;
    else if (slot?.owner === 'white') whiteCount++;
  }

  if (blackCount > whiteCount) return '1';
  if (whiteCount > blackCount) return '2';
  return '0';
}

// ---------------------------------------------------------------------------
// C4 corner bits helper (per-rotation, NOT independently canonicalized)
// ---------------------------------------------------------------------------

/**
 * Compute the raw corner bits [gate1, gate4, gate7, gate10] for the original state
 * (no rotation applied). Used as base for per-rotation computation.
 */
function getRawCornerBitsFromOriginal(state: GameState): string {
  return CORNER_GATES.map(gId => gateDominanceChar(state, gId)).join('');
}

/**
 * Compute corner bits for a specific C4 rotation (rot=0..3).
 *
 * Under rotation `rot`, the new corner gate `newGateId` shows the dominance
 * of the original gate `invGateMap[newGateId]`.
 *
 * Gate cycle: 1→4→7→10→1 under R90.
 * Example for rot=1 (R90):
 *   invGateMap: 1←10, 4←1, 7←4, 10←7
 *   new corner order [gate1, gate4, gate7, gate10] reads [old_gate10, old_gate1, old_gate4, old_gate7]
 */
function getCornerBitsForRotation(
  state: GameState,
  rot: number
): string {
  const invGateMap = getInverseGateMapForRotation(rot);
  return CORNER_GATES.map(newGateId => {
    const origGateId = (invGateMap[newGateId] ?? newGateId) as GateId;
    return gateDominanceChar(state, origGateId);
  }).join('');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the raw (R0) corner bits for the given state.
 * Order: [gate1, gate4, gate7, gate10]. Exported for testing.
 * Note: this is NOT independently canonicalized — use computeMediumPatternId for the canonical form.
 */
export function getMediumPatternCornerBits(state: GameState): string {
  return getRawCornerBitsFromOriginal(state);
}

/**
 * Independently canonicalize corner bits by applying C4 rotations.
 * Exported as a test utility.
 * NOTE: This is NOT used inside computeMediumPatternId — there, position and corner bits
 * are co-minimized under the SAME rotation to avoid misalignment.
 */
export function canonicalizeMediumPatternBits(bits: string): string {
  const len = bits.length;
  let minBits = bits;
  for (let r = 1; r < len; r++) {
    const rotated = bits.slice(len - r) + bits.slice(0, len - r);
    if (rotated < minBits) minBits = rotated;
  }
  return minBits;
}

/**
 * Compute the medium_pattern_id for the given state.
 *
 * CORRECT C4 canonicalization:
 *   For each rotation rot in {0,1,2,3}:
 *     1. Compute position ownership hash under rotation rot
 *     2. Compute corner bits under the SAME rotation rot
 *     3. Concatenate: `${posHash}:${cornerBits}`
 *   Return the lexicographically smallest concatenated string.
 *
 * This guarantees that position and corner bits are always from the SAME rotation,
 * avoiding the bug where part1 and part2 could independently choose different rotations.
 *
 * Format: `${posOwnershipHash}:${cornerBits4chars}`
 * Example: "a1b2c3d4e5f6:0021"
 */
export function computeMediumPatternId(state: GameState): string {
  let minId = '';

  for (let rot = 0; rot < 4; rot++) {
    const posHash = computePositionOwnershipHashStringForRotation(state, rot);
    const cornerBits = getCornerBitsForRotation(state, rot);
    const candidate = `${posHash}:${cornerBits}`;

    if (rot === 0 || candidate < minId) {
      minId = candidate;
    }
  }

  return minId;
}

/**
 * @deprecated For internal testing only: returns the per-rotation combined string.
 * Used in tests to verify that all 4 rotations of a C4-equivalent state map to the same id.
 */
export function computeMediumPatternIdForRotation(
  state: GameState,
  rot: number
): string {
  const posHash = computePositionOwnershipHashStringForRotation(state, rot);
  const cornerBits = getCornerBitsForRotation(state, rot);
  return `${posHash}:${cornerBits}`;
}
