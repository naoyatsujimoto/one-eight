/**
 * zobrist.ts — Zobrist hashing for ONE EIGHT Web MVP
 *
 * Step F-1: Zobrist hash table initialization + full state canonical_hash (C4)
 *
 * Design (v6 confirmed):
 *   - Transformation group for canonical_hash: C4 (rotations only, 4 transforms)
 *   - Hash includes: Position ownership + Gate assets + currentPlayer + moveNumber
 *   - D,m(1) ≠ D,m(7) is correctly preserved (C4 never maps Gate1 → Gate7 for D)
 *   - symmetry group ID is NOT implemented here (separate concern, Step F-3 reserved)
 *   - Differential update support via XOR toggle
 *
 * C4 transformation tables (verified in symmetry_design_v6.md):
 *   Position R90 cycle: G→G, A→C→M→K→A, D→E→J→I→D, B→H→L→F→B
 *   Gate R90 cycle: 1→4→7→10→1, 2→5→8→11→2, 3→6→9→12→3
 */

import { POSITION_IDS, GATE_IDS } from './constants';
import type { Asset, GateId, GateState, Player, PositionId, GameState } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A 64-bit Zobrist random value represented as [hi32, lo32] pair. */
export type ZobristKey = [number, number];

// ---------------------------------------------------------------------------
// Pseudo-random number generator (deterministic, seeded)
// ---------------------------------------------------------------------------

/**
 * Mulberry32 PRNG — fast, deterministic, good distribution.
 * Seeded once at module load; produces a fixed table every run.
 */
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

const SEED = 0x18_08_19_42; // ONE EIGHT birth seed (fixed)
const rng = mulberry32(SEED);

function rand32(): number {
  return Math.floor(rng() * 0x100000000) >>> 0;
}

function randKey(): ZobristKey {
  return [rand32(), rand32()];
}

// ---------------------------------------------------------------------------
// XOR helpers
// ---------------------------------------------------------------------------

export function xorKey(a: ZobristKey, b: ZobristKey): ZobristKey {
  return [(a[0] ^ b[0]) >>> 0, (a[1] ^ b[1]) >>> 0];
}

export function keyToString(k: ZobristKey): string {
  return k[0].toString(16).padStart(8, '0') + k[1].toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------
// Zobrist table layout
// ---------------------------------------------------------------------------
// Index schema:
//   Position ownership:  posIdx (0..12) × ownerIdx (0=null,1=black,2=white)
//   Gate large slots:    gateIdx (0..11) × slotIdx (0..1) × ownerIdx (0=null,1=black,2=white)
//   Gate middle slots:   gateIdx (0..11) × slotIdx (0..1) × ownerIdx
//   Gate small slots:    gateIdx (0..11) × slotIdx (0..3) × ownerIdx
//   currentPlayer:       playerIdx (0=black,1=white)
//   moveNumber:          stored as-is in a separate hash table (lazy map)
// ---------------------------------------------------------------------------

// Position ownership table: [posIdx][ownerIdx]
const ZOBRIST_POSITION: [ZobristKey, ZobristKey, ZobristKey][] = POSITION_IDS.map(() => [
  randKey(), // null
  randKey(), // black
  randKey(), // white
]);

// Gate large slots table: [gateIdx][slotIdx 0..1][ownerIdx]
const ZOBRIST_GATE_LARGE: [[ZobristKey, ZobristKey, ZobristKey], [ZobristKey, ZobristKey, ZobristKey]][] = GATE_IDS.map(() => [
  [randKey(), randKey(), randKey()],
  [randKey(), randKey(), randKey()],
]);

// Gate middle slots table: [gateIdx][slotIdx 0..1][ownerIdx]
const ZOBRIST_GATE_MIDDLE: [[ZobristKey, ZobristKey, ZobristKey], [ZobristKey, ZobristKey, ZobristKey]][] = GATE_IDS.map(() => [
  [randKey(), randKey(), randKey()],
  [randKey(), randKey(), randKey()],
]);

// Gate small slots table: [gateIdx][slotIdx 0..3][ownerIdx]
const ZOBRIST_GATE_SMALL: [[ZobristKey, ZobristKey, ZobristKey], [ZobristKey, ZobristKey, ZobristKey], [ZobristKey, ZobristKey, ZobristKey], [ZobristKey, ZobristKey, ZobristKey]][] = GATE_IDS.map(() => [
  [randKey(), randKey(), randKey()],
  [randKey(), randKey(), randKey()],
  [randKey(), randKey(), randKey()],
  [randKey(), randKey(), randKey()],
]);

// Current player table: [0=black, 1=white]
const ZOBRIST_PLAYER: [ZobristKey, ZobristKey] = [randKey(), randKey()];

// Move number table: lazy map (moveNumber → ZobristKey)
const ZOBRIST_MOVE_NUMBER = new Map<number, ZobristKey>();

function getMoveNumberKey(n: number): ZobristKey {
  let k = ZOBRIST_MOVE_NUMBER.get(n);
  if (k === undefined) {
    k = randKey();
    ZOBRIST_MOVE_NUMBER.set(n, k);
  }
  return k;
}

// ---------------------------------------------------------------------------
// Index helpers
// ---------------------------------------------------------------------------

const POSITION_INDEX: Readonly<Record<PositionId, number>> = Object.fromEntries(
  POSITION_IDS.map((id, i) => [id, i])
) as Record<PositionId, number>;

const GATE_INDEX: Readonly<Record<GateId, number>> = Object.fromEntries(
  GATE_IDS.map((id, i) => [id, i])
) as Record<GateId, number>;

function ownerIndex(owner: Player | null): 0 | 1 | 2 {
  if (owner === null) return 0;
  if (owner === 'black') return 1;
  return 2;
}

function assetOwnerIndex(asset: Asset | null): 0 | 1 | 2 {
  return ownerIndex(asset?.owner ?? null);
}

// ---------------------------------------------------------------------------
// Full hash computation from scratch
// ---------------------------------------------------------------------------

/**
 * Compute the raw Zobrist hash for a given GameState (no C4 normalization).
 * Used internally by canonicalHash.
 */
export function computeRawHash(state: GameState): ZobristKey {
  let h: ZobristKey = [0, 0];

  // Position ownership
  for (const posId of POSITION_IDS) {
    const idx = POSITION_INDEX[posId] as number;
    const oIdx = ownerIndex(state.positions[posId].owner);
    h = xorKey(h, (ZOBRIST_POSITION[idx] as [ZobristKey, ZobristKey, ZobristKey])[oIdx]);
  }

  // Gate assets
  for (const gateId of GATE_IDS) {
    const gi = GATE_INDEX[gateId] as number;
    const gate = state.gates[gateId];
    const largeTable = ZOBRIST_GATE_LARGE[gi] as [[ZobristKey, ZobristKey, ZobristKey], [ZobristKey, ZobristKey, ZobristKey]];
    const middleTable = ZOBRIST_GATE_MIDDLE[gi] as [[ZobristKey, ZobristKey, ZobristKey], [ZobristKey, ZobristKey, ZobristKey]];
    const smallTable = ZOBRIST_GATE_SMALL[gi] as [[ZobristKey, ZobristKey, ZobristKey], [ZobristKey, ZobristKey, ZobristKey], [ZobristKey, ZobristKey, ZobristKey], [ZobristKey, ZobristKey, ZobristKey]];

    for (let si = 0; si < 2; si++) {
      const largeAsset = gate.largeSlots[si] ?? null;
      const middleAsset = gate.middleSlots[si] ?? null;
      h = xorKey(h, (largeTable[si as 0 | 1])[assetOwnerIndex(largeAsset)]);
      h = xorKey(h, (middleTable[si as 0 | 1])[assetOwnerIndex(middleAsset)]);
    }
    for (let si = 0; si < 4; si++) {
      const smallAsset = gate.smallSlots[si] ?? null;
      h = xorKey(h, (smallTable[si as 0 | 1 | 2 | 3])[assetOwnerIndex(smallAsset)]);
    }
  }

  // Current player
  h = xorKey(h, ZOBRIST_PLAYER[state.currentPlayer === 'black' ? 0 : 1]);

  // Move number
  h = xorKey(h, getMoveNumberKey(state.moveNumber));

  return h;
}

// ---------------------------------------------------------------------------
// C4 transformation tables (confirmed in symmetry_design_v6.md)
// ---------------------------------------------------------------------------

/**
 * Position R90 rotation map.
 * R90: A→C, C→M, M→K, K→A | D→E, E→J, J→I, I→D | B→H, H→L, L→F, F→B | G→G
 */
const POSITION_R90: Record<PositionId, PositionId> = {
  A: 'C', B: 'H', C: 'M', D: 'E', E: 'J',
  F: 'B', G: 'G', H: 'L', I: 'D', J: 'I',
  K: 'A', L: 'F', M: 'K',
};

/**
 * Gate R90 rotation map.
 * R90: 1→4, 4→7, 7→10, 10→1 | 2→5, 5→8, 8→11, 11→2 | 3→6, 6→9, 9→12, 12→3
 */
const GATE_R90: Record<GateId, GateId> = {
  1: 4, 2: 5, 3: 6,
  4: 7, 5: 8, 6: 9,
  7: 10, 8: 11, 9: 12,
  10: 1, 11: 2, 12: 3,
};

/** Compose R90 n times to get R0/R90/R180/R270 position maps. */
function buildPositionMap(steps: number): Record<PositionId, PositionId> {
  const map = Object.fromEntries(POSITION_IDS.map(id => [id, id])) as Record<PositionId, PositionId>;
  for (let i = 0; i < steps; i++) {
    for (const id of POSITION_IDS) {
      map[id] = POSITION_R90[map[id]];
    }
  }
  return map;
}

function buildGateMap(steps: number): Record<GateId, GateId> {
  const map = Object.fromEntries(GATE_IDS.map(id => [id, id])) as Record<GateId, GateId>;
  for (let i = 0; i < steps; i++) {
    for (const id of GATE_IDS) {
      map[id] = GATE_R90[map[id]];
    }
  }
  return map;
}

// Pre-compute C4 transform maps
const C4_POSITION_MAPS: Record<PositionId, PositionId>[] = [
  buildPositionMap(0), // R0
  buildPositionMap(1), // R90
  buildPositionMap(2), // R180
  buildPositionMap(3), // R270
];

const C4_GATE_MAPS: Record<GateId, GateId>[] = [
  buildGateMap(0), // R0
  buildGateMap(1), // R90
  buildGateMap(2), // R180
  buildGateMap(3), // R270
];

// ---------------------------------------------------------------------------
// State transformation for C4
// ---------------------------------------------------------------------------

/**
 * Apply a C4 rotation transform to a GameState.
 * Produces a new GameState with positions and gates remapped.
 * currentPlayer and moveNumber are preserved unchanged.
 */
function applyC4Transform(state: GameState, rotationIndex: number): GameState {
  const posMap = C4_POSITION_MAPS[rotationIndex] as Record<PositionId, PositionId>;
  const gateMap = C4_GATE_MAPS[rotationIndex] as Record<GateId, GateId>;

  // Build new positions: for each position id in original, find where it maps to
  // We need the inverse: transformed[posMap[id]] = original[id]
  const newPositions = { ...state.positions };
  for (const origId of POSITION_IDS) {
    const destId = posMap[origId];
    newPositions[destId] = {
      id: destId,
      owner: state.positions[origId].owner,
    };
  }

  // Build new gates: transformed[gateMap[id]] = original[id]
  const newGates = { ...state.gates };
  for (const origId of GATE_IDS) {
    const destId = gateMap[origId];
    newGates[destId] = {
      id: destId,
      largeSlots: state.gates[origId].largeSlots,
      middleSlots: state.gates[origId].middleSlots,
      smallSlots: state.gates[origId].smallSlots,
    };
  }

  return {
    ...state,
    positions: newPositions,
    gates: newGates,
  };
}

// ---------------------------------------------------------------------------
// Canonical hash (C4 normalization)
// ---------------------------------------------------------------------------

/**
 * Compute the full state canonical_hash for the given GameState using C4 normalization.
 *
 * Algorithm:
 *   1. Compute raw hash for all 4 C4 rotations (R0, R90, R180, R270)
 *   2. Return the lexicographically minimum hash string's corresponding key
 *
 * This ensures:
 *   - Same canonical_hash for rotationally equivalent states
 *   - D,m(1) ≠ D,m(7) (C4 never maps Gate1→Gate7 for position D)
 *   - currentPlayer and moveNumber are included
 *
 * NOTE: symmetry group ID is a separate concept and is NOT computed here.
 */
export function computeCanonicalHash(state: GameState): ZobristKey {
  let minHashStr = '';
  let minHashKey: ZobristKey = [0, 0];

  for (let rot = 0; rot < 4; rot++) {
    const transformed = applyC4Transform(state, rot);
    const hashKey = computeRawHash(transformed);
    const hashStr = keyToString(hashKey);

    if (rot === 0 || hashStr < minHashStr) {
      minHashStr = hashStr;
      minHashKey = hashKey;
    }
  }

  return minHashKey;
}

/**
 * Compute canonical hash as a hex string (convenient for use as Map/Record key).
 */
export function computeCanonicalHashString(state: GameState): string {
  return keyToString(computeCanonicalHash(state));
}

// ---------------------------------------------------------------------------
// Differential update support
// ---------------------------------------------------------------------------

/**
 * Incrementally update a raw hash when a position ownership changes.
 *
 * Usage:
 *   const newHash = updatePositionOwner(oldHash, posId, oldOwner, newOwner);
 *
 * XOR out the old value, XOR in the new value.
 */
export function updatePositionOwner(
  hash: ZobristKey,
  posId: PositionId,
  oldOwner: Player | null,
  newOwner: Player | null,
): ZobristKey {
  const idx = POSITION_INDEX[posId] as number;
  const table = ZOBRIST_POSITION[idx] as [ZobristKey, ZobristKey, ZobristKey];
  let h = xorKey(hash, table[ownerIndex(oldOwner)]);
  h = xorKey(h, table[ownerIndex(newOwner)]);
  return h;
}

/**
 * Incrementally update a raw hash when a gate large slot changes.
 */
export function updateGateLargeSlot(
  hash: ZobristKey,
  gateId: GateId,
  slotIdx: number,
  oldAsset: Asset | null,
  newAsset: Asset | null,
): ZobristKey {
  const gi = GATE_INDEX[gateId] as number;
  const table = ZOBRIST_GATE_LARGE[gi] as [[ZobristKey, ZobristKey, ZobristKey], [ZobristKey, ZobristKey, ZobristKey]];
  const row = table[slotIdx as 0 | 1] as [ZobristKey, ZobristKey, ZobristKey];
  let h = xorKey(hash, row[assetOwnerIndex(oldAsset)]);
  h = xorKey(h, row[assetOwnerIndex(newAsset)]);
  return h;
}

/**
 * Incrementally update a raw hash when a gate middle slot changes.
 */
export function updateGateMiddleSlot(
  hash: ZobristKey,
  gateId: GateId,
  slotIdx: number,
  oldAsset: Asset | null,
  newAsset: Asset | null,
): ZobristKey {
  const gi = GATE_INDEX[gateId] as number;
  const table = ZOBRIST_GATE_MIDDLE[gi] as [[ZobristKey, ZobristKey, ZobristKey], [ZobristKey, ZobristKey, ZobristKey]];
  const row = table[slotIdx as 0 | 1] as [ZobristKey, ZobristKey, ZobristKey];
  let h = xorKey(hash, row[assetOwnerIndex(oldAsset)]);
  h = xorKey(h, row[assetOwnerIndex(newAsset)]);
  return h;
}

/**
 * Incrementally update a raw hash when a gate small slot changes.
 */
export function updateGateSmallSlot(
  hash: ZobristKey,
  gateId: GateId,
  slotIdx: number,
  oldAsset: Asset | null,
  newAsset: Asset | null,
): ZobristKey {
  const gi = GATE_INDEX[gateId] as number;
  const table = ZOBRIST_GATE_SMALL[gi] as [[ZobristKey, ZobristKey, ZobristKey], [ZobristKey, ZobristKey, ZobristKey], [ZobristKey, ZobristKey, ZobristKey], [ZobristKey, ZobristKey, ZobristKey]];
  const row = table[slotIdx as 0 | 1 | 2 | 3] as [ZobristKey, ZobristKey, ZobristKey];
  let h = xorKey(hash, row[assetOwnerIndex(oldAsset)]);
  h = xorKey(h, row[assetOwnerIndex(newAsset)]);
  return h;
}

/**
 * Incrementally update a raw hash when currentPlayer changes.
 */
export function updateCurrentPlayer(
  hash: ZobristKey,
  oldPlayer: Player,
  newPlayer: Player,
): ZobristKey {
  let h = xorKey(hash, ZOBRIST_PLAYER[oldPlayer === 'black' ? 0 : 1] as ZobristKey);
  h = xorKey(h, ZOBRIST_PLAYER[newPlayer === 'black' ? 0 : 1] as ZobristKey);
  return h;
}

/**
 * Incrementally update a raw hash when moveNumber changes.
 */
export function updateMoveNumber(
  hash: ZobristKey,
  oldMoveNumber: number,
  newMoveNumber: number,
): ZobristKey {
  let h = xorKey(hash, getMoveNumberKey(oldMoveNumber) as ZobristKey);
  h = xorKey(h, getMoveNumberKey(newMoveNumber) as ZobristKey);
  return h;
}

// ---------------------------------------------------------------------------
// Gate total asset value helper (for hash content description)
// ---------------------------------------------------------------------------

/**
 * Returns a compact string describing a gate's asset state for debugging.
 * Not used in hashing — for test/debug output only.
 */
export function describeGateAssets(gate: GateState): string {
  const slots = [
    ...gate.largeSlots.map((a, i) => `L${i}:${a ? a.owner[0] : '-'}`),
    ...gate.middleSlots.map((a, i) => `M${i}:${a ? a.owner[0] : '-'}`),
    ...gate.smallSlots.map((a, i) => `S${i}:${a ? a.owner[0] : '-'}`),
  ];
  return `gate${gate.id}[${slots.join(',')}]`;
}
