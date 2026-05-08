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
import { computePositionOwnershipCanonicalHashString } from './zobrist';

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
// C4 canonicalization of corner bits
// ---------------------------------------------------------------------------

/**
 * Canonicalize a 4-char corner bits string by applying C4 rotations.
 *
 * The C4 rotation cycle for corner gates is: 1→4→7→10→1
 * Rotating the gate order by 1 step shifts the bits array by 1 position.
 *
 * bits[0] = gate1, bits[1] = gate4, bits[2] = gate7, bits[3] = gate10
 * R90:  gate1→gate4→gate7→gate10→gate1
 *       new bits[0] = old bits[3], bits[1] = old bits[0], etc.
 *       i.e., rotate right by 1: "dcba" for "abcd" → "dabc" (last char moves to front)
 *
 * We compute all 4 rotations and return the lexicographically smallest.
 */
export function canonicalizeMediumPatternBits(bits: string): string {
  const len = bits.length; // 4
  let minBits = bits;
  for (let r = 1; r < len; r++) {
    // Rotate right by r: last r chars move to front
    const rotated = bits.slice(len - r) + bits.slice(0, len - r);
    if (rotated < minBits) {
      minBits = rotated;
    }
  }
  return minBits;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the raw (non-canonicalized) corner bits for the given state.
 * Order: [gate1, gate4, gate7, gate10]
 * Exported for testing.
 */
export function getMediumPatternCornerBits(state: GameState): string {
  const rawBits = CORNER_GATES.map(gId => gateDominanceChar(state, gId)).join('');
  return canonicalizeMediumPatternBits(rawBits);
}

/**
 * Compute the medium_pattern_id for the given state.
 *
 * Format: `${part1}:${part2}`
 *   part1: C4-normalized position ownership hash (same as symmetry_group_id)
 *   part2: C4-normalized corner gate dominance bits (4 chars: gate1,4,7,10)
 *
 * Example: "a1b2c3d4e5f6:0021"
 */
export function computeMediumPatternId(state: GameState): string {
  const part1 = computePositionOwnershipCanonicalHashString(state);
  const part2 = getMediumPatternCornerBits(state);
  return `${part1}:${part2}`;
}
