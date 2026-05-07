/**
 * symmetry.ts — Symmetry group management for ONE EIGHT Web MVP
 *
 * Step F-2: Design and separation of D4 / C4 / symmetry group ID responsibilities.
 *
 * Responsibilities of this module:
 *   - Define the transformation groups used for canonical state normalization
 *   - Provide symmetry group ID computation (reserved; NOT connected to CPU search)
 *   - Separate D4 (8 transforms: 4 rotations × 2 reflections) from
 *     C4 (4 rotations only — the group currently used for canonical_hash)
 *
 * Constraints (Step F-2):
 *   - symmetry group ID is NOT used by CPU search (Step F-3 reserved)
 *   - symmetry group ID is NOT displayed in postmortem UI
 *   - This module does NOT modify canonical_hash computation in zobrist.ts
 *   - Supabase schema is NOT changed
 *
 * Architecture note:
 *   zobrist.ts   — Zobrist hash table + raw hash + canonical_hash (C4 normalization)
 *   symmetry.ts  — Transform group definitions + symmetry group ID (this file)
 *   engine.ts    — Calls computeCanonicalHashString() and stores in MoveRecord
 *   storage.ts   — On-demand re-computation for records missing canonical_hash
 */

import type { GateId, PositionId } from './types';
import { POSITION_IDS, GATE_IDS } from './constants';

// ---------------------------------------------------------------------------
// Transform group definitions
// ---------------------------------------------------------------------------

/**
 * The two symmetry groups relevant to ONE EIGHT board geometry.
 *
 * C4 (cyclic group of order 4):
 *   - 4 rotational symmetries: R0, R90, R180, R270
 *   - Currently used for canonical_hash in zobrist.ts
 *   - Correct because D,m(1) ≠ D,m(7): Gate1→Gate7 is never a C4 rotation
 *
 * D4 (dihedral group of order 8):
 *   - 4 rotations + 4 reflections (R0, R90, R180, R270, Fx, Fy, Fd1, Fd2)
 *   - Available here for future use (e.g., symmetry group ID analysis)
 *   - NOT currently used for canonical_hash (would break Gate numbering semantics)
 */
export type TransformGroupId = 'C4' | 'D4';

/**
 * A named C4 rotation transform (0, 90, 180, or 270 degrees clockwise).
 */
export type C4RotationName = 'R0' | 'R90' | 'R180' | 'R270';

/**
 * A named D4 transform.
 */
export type D4TransformName = 'R0' | 'R90' | 'R180' | 'R270' | 'Fx' | 'Fy' | 'Fd1' | 'Fd2';

// ---------------------------------------------------------------------------
// C4 position rotation map (R90)
// Confirmed in symmetry_design_v6.md
// R90: A→C, C→M, M→K, K→A | D→E, E→J, J→I, I→D | B→H, H→L, L→F, F→B | G→G
// ---------------------------------------------------------------------------

export const POSITION_R90: Readonly<Record<PositionId, PositionId>> = {
  A: 'C', B: 'H', C: 'M', D: 'E', E: 'J',
  F: 'B', G: 'G', H: 'L', I: 'D', J: 'I',
  K: 'A', L: 'F', M: 'K',
};

/**
 * Gate R90 rotation map.
 * R90: 1→4, 4→7, 7→10, 10→1 | 2→5, 5→8, 8→11, 11→2 | 3→6, 6→9, 9→12, 12→3
 */
export const GATE_R90: Readonly<Record<GateId, GateId>> = {
  1: 4, 2: 5, 3: 6,
  4: 7, 5: 8, 6: 9,
  7: 10, 8: 11, 9: 12,
  10: 1, 11: 2, 12: 3,
};

// ---------------------------------------------------------------------------
// C4 full rotation maps (R0, R90, R180, R270)
// ---------------------------------------------------------------------------

function buildPositionMap(steps: number): Readonly<Record<PositionId, PositionId>> {
  const map = Object.fromEntries(POSITION_IDS.map(id => [id, id])) as Record<PositionId, PositionId>;
  for (let i = 0; i < steps; i++) {
    for (const id of POSITION_IDS) {
      map[id] = POSITION_R90[map[id]];
    }
  }
  return map;
}

function buildGateMap(steps: number): Readonly<Record<GateId, GateId>> {
  const map = Object.fromEntries(GATE_IDS.map(id => [id, id])) as Record<GateId, GateId>;
  for (let i = 0; i < steps; i++) {
    for (const id of GATE_IDS) {
      map[id] = GATE_R90[map[id]];
    }
  }
  return map;
}

/**
 * All 4 C4 position rotation maps indexed by rotation steps (0=R0, 1=R90, 2=R180, 3=R270).
 */
export const C4_POSITION_MAPS: readonly Readonly<Record<PositionId, PositionId>>[] = [
  buildPositionMap(0),
  buildPositionMap(1),
  buildPositionMap(2),
  buildPositionMap(3),
];

/**
 * All 4 C4 gate rotation maps indexed by rotation steps.
 */
export const C4_GATE_MAPS: readonly Readonly<Record<GateId, GateId>>[] = [
  buildGateMap(0),
  buildGateMap(1),
  buildGateMap(2),
  buildGateMap(3),
];

/**
 * Human-readable names for C4 rotation steps.
 */
export const C4_ROTATION_NAMES: readonly C4RotationName[] = ['R0', 'R90', 'R180', 'R270'];

// ---------------------------------------------------------------------------
// Symmetry group ID
//
// A symmetry group ID identifies the orbit of a canonical state under C4.
// In Step F-2, this is:
//   - Defined and isolated here for architectural clarity
//   - NOT connected to CPU search (Step F-3 reserved)
//   - NOT displayed in the postmortem UI
//
// Definition:
//   The symmetry group ID of a game state is the canonical_hash of its
//   representative under C4 normalization (i.e., the minimum-hash rotation).
//   Two states have the same symmetry group ID iff they are C4-equivalent.
//
// Since canonical_hash IS the representative hash, the symmetry group ID
// is simply canonical_hash itself for C4. This function is provided as an
// explicit, named boundary to make the concept tangible for future use.
// ---------------------------------------------------------------------------

/**
 * Derive the symmetry group ID from a precomputed canonical_hash string.
 *
 * For C4, the symmetry group ID is the canonical_hash itself.
 * This function is intentionally thin — it exists to name the concept
 * and provide a stable call site for future evolution (e.g., if D4 or
 * a richer group is adopted later).
 *
 * Step F-2: NOT used by CPU search or postmortem UI.
 */
export function symmetryGroupIdFromHash(canonicalHash: string): string {
  // For C4 normalization, the symmetry group orbit representative IS the canonical hash.
  return canonicalHash;
}

/**
 * Count the distinct C4 rotation hashes for a canonical hash.
 * Returns 1 (fully symmetric), 2, or 4 depending on how many distinct
 * rotations the state has.
 *
 * This is useful for future weight adjustments in analysis, but is NOT
 * used by the current implementation.
 *
 * Step F-2: Read-only analysis utility. Not connected to anything yet.
 */
export function countC4Orbit(rotationHashes: readonly string[]): number {
  return new Set(rotationHashes).size;
}

// ---------------------------------------------------------------------------
// D4 transform names (reserved for future use)
// ---------------------------------------------------------------------------

/**
 * All 8 D4 transform names.
 * Reflections (Fx, Fy, Fd1, Fd2) are defined here for completeness
 * but are NOT implemented as position/gate maps in Step F-2.
 *
 * If D4 normalization is adopted in the future:
 *   - Reflection maps must be verified against actual board geometry
 *   - Gate numbering semantics must be re-evaluated (D4 may map Gate1→Gate7)
 *   - canonical_hash computation in zobrist.ts must be updated
 */
export const D4_TRANSFORM_NAMES: readonly D4TransformName[] = [
  'R0', 'R90', 'R180', 'R270',
  'Fx', 'Fy', 'Fd1', 'Fd2',
];

/**
 * Current transform group used for canonical_hash computation.
 * C4 is confirmed correct for ONE EIGHT board geometry.
 */
export const ACTIVE_TRANSFORM_GROUP: TransformGroupId = 'C4';
