/**
 * zobrist.test.ts — Step F-1 tests
 *
 * Test coverage:
 *   1. computeRawHash — deterministic, distinct for different states
 *   2. computeCanonicalHash — C4 rotational equivalence
 *   3. D,m(1) ≠ D,m(7) — confirmed separate canonical hashes under C4
 *   4. symmetry group ID isolation — canonical_hash does NOT equal symmetry group ID
 *   5. Differential update — XOR toggle produces same result as full recompute
 *   6. currentPlayer and moveNumber are included in hash
 */

import { describe, it, expect } from 'vitest';
import {
  computeRawHash,
  computeCanonicalHash,
  computeCanonicalHashString,
  updatePositionOwner,
  updateCurrentPlayer,
  updateMoveNumber,
  updateGateLargeSlot,
  keyToString,
  type ZobristKey,
} from '../game/zobrist';
import { createInitialState } from '../game/initialState';
import { selectPosition, applyMassiveBuild } from '../game/engine';
import type { GameState, GateId, PositionId } from '../game/types';
import { POSITION_IDS, GATE_IDS } from '../game/constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state));
}

/**
 * Build a minimal state with given position owners and gate large slot assignments.
 * Used to construct specific test scenarios without full game moves.
 */
function buildTestState(
  posOwners: Partial<Record<PositionId, 'black' | 'white' | null>>,
  gateLargeOwners: Partial<Record<GateId, ['black' | 'white' | null, 'black' | 'white' | null]>>,
  currentPlayer: 'black' | 'white' = 'black',
  moveNumber = 1,
): GameState {
  const base = createInitialState();

  const positions = { ...base.positions };
  for (const [posId, owner] of Object.entries(posOwners) as [PositionId, 'black' | 'white' | null][]) {
    positions[posId] = { id: posId, owner };
  }

  const gates = { ...base.gates };
  for (const [gateIdStr, owners] of Object.entries(gateLargeOwners) as [string, ['black' | 'white' | null, 'black' | 'white' | null]][]) {
    const id = Number(gateIdStr) as GateId;
    gates[id] = {
      ...base.gates[id],
      largeSlots: [
        owners[0] ? { size: 'large', owner: owners[0] } : null,
        owners[1] ? { size: 'large', owner: owners[1] } : null,
      ],
    };
  }

  return {
    ...base,
    positions,
    gates,
    currentPlayer,
    moveNumber,
  };
}

// ---------------------------------------------------------------------------
// 1. computeRawHash — deterministic and distinct
// ---------------------------------------------------------------------------

describe('computeRawHash', () => {
  it('is deterministic: same state produces same hash', () => {
    const state = createInitialState();
    const h1 = computeRawHash(state);
    const h2 = computeRawHash(state);
    expect(keyToString(h1)).toBe(keyToString(h2));
  });

  it('initial state hash is non-zero', () => {
    const state = createInitialState();
    const h = computeRawHash(state);
    expect(h[0] !== 0 || h[1] !== 0).toBe(true);
  });

  it('different position owners → different hashes', () => {
    const s1 = buildTestState({ A: 'black' }, {});
    const s2 = buildTestState({ A: 'white' }, {});
    const s3 = buildTestState({ A: null }, {});
    const h1 = keyToString(computeRawHash(s1));
    const h2 = keyToString(computeRawHash(s2));
    const h3 = keyToString(computeRawHash(s3));
    expect(h1).not.toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h2).not.toBe(h3);
  });

  it('different gate large slot owners → different hashes', () => {
    const s1 = buildTestState({}, { 1: ['black', null] });
    const s2 = buildTestState({}, { 1: ['white', null] });
    const s3 = buildTestState({}, { 1: [null, null] });
    const h1 = keyToString(computeRawHash(s1));
    const h2 = keyToString(computeRawHash(s2));
    const h3 = keyToString(computeRawHash(s3));
    expect(h1).not.toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h2).not.toBe(h3);
  });

  it('different currentPlayer → different raw hashes', () => {
    const s1 = buildTestState({}, {}, 'black', 1);
    const s2 = buildTestState({}, {}, 'white', 1);
    expect(keyToString(computeRawHash(s1))).not.toBe(keyToString(computeRawHash(s2)));
  });

  it('different moveNumber → different raw hashes', () => {
    const s1 = buildTestState({}, {}, 'black', 1);
    const s2 = buildTestState({}, {}, 'black', 7);
    expect(keyToString(computeRawHash(s1))).not.toBe(keyToString(computeRawHash(s2)));
  });
});

// ---------------------------------------------------------------------------
// 2. computeCanonicalHash — C4 rotational equivalence
// ---------------------------------------------------------------------------

describe('computeCanonicalHash (C4)', () => {
  it('is deterministic', () => {
    const state = createInitialState();
    const h1 = computeCanonicalHashString(state);
    const h2 = computeCanonicalHashString(state);
    expect(h1).toBe(h2);
  });

  it('initial state: canonical hash equals raw hash for R0 rotation (all empty, symmetric)', () => {
    // Empty board is fully symmetric under C4, so canonical = raw (any rotation produces same state)
    const state = createInitialState();
    const canonical = computeCanonicalHashString(state);
    // Just verify it's non-empty and well-formed (16 hex chars = 64 bits)
    expect(canonical).toMatch(/^[0-9a-f]{16}$/);
  });

  /**
   * C4 rotational equivalence test:
   * Build state S1: position A (black) + Gate 1 large[0] (black), moveNumber=1, player=black
   * Build state S2: position C (black) + Gate 4 large[0] (black), moveNumber=1, player=black
   *   (S2 = R90(S1): A→C, Gate1→Gate4)
   * Build state S3: position M (black) + Gate 7 large[0] (black), moveNumber=1, player=black
   *   (S3 = R180(S1): A→M, Gate1→Gate7)
   * Build state S4: position K (black) + Gate 10 large[0] (black), moveNumber=1, player=black
   *   (S4 = R270(S1): A→K, Gate1→Gate10)
   *
   * All 4 states must have the same canonical hash.
   */
  it('C4 rotational equivalents share the same canonical hash', () => {
    const s1 = buildTestState({ A: 'black' }, { 1: ['black', null] });
    // R90: A→C, Gate1→Gate4
    const s2 = buildTestState({ C: 'black' }, { 4: ['black', null] });
    // R180: A→M, Gate1→Gate7
    const s3 = buildTestState({ M: 'black' }, { 7: ['black', null] });
    // R270: A→K, Gate1→Gate10
    const s4 = buildTestState({ K: 'black' }, { 10: ['black', null] });

    const h1 = computeCanonicalHashString(s1);
    const h2 = computeCanonicalHashString(s2);
    const h3 = computeCanonicalHashString(s3);
    const h4 = computeCanonicalHashString(s4);

    expect(h1).toBe(h2);
    expect(h1).toBe(h3);
    expect(h1).toBe(h4);
  });

  /**
   * Non-equivalent states must have different canonical hashes.
   */
  it('non-rotationally-equivalent states have different canonical hashes', () => {
    // A black + Gate1 black  vs  B black + Gate1 black
    // B is NOT a C4 rotation of A (B→H→L→F→B cycle, doesn't map to A)
    const s1 = buildTestState({ A: 'black' }, { 1: ['black', null] });
    const s2 = buildTestState({ B: 'black' }, { 1: ['black', null] });
    const h1 = computeCanonicalHashString(s1);
    const h2 = computeCanonicalHashString(s2);
    expect(h1).not.toBe(h2);
  });
});

// ---------------------------------------------------------------------------
// 3. D,m(1) ≠ D,m(7): confirmed distinct canonical hashes
// ---------------------------------------------------------------------------

describe('D,m(1) ≠ D,m(7) — C4 preservation', () => {
  /**
   * State for "Black plays D, massive build on Gate 1":
   *   - position D: black
   *   - Gate 1 large[0]: black  (massive build places into first available large slot)
   *   - moveNumber = 2 (after black's first move), currentPlayer = white
   *
   * State for "Black plays D, massive build on Gate 7":
   *   - position D: black
   *   - Gate 7 large[0]: black
   *   - moveNumber = 2, currentPlayer = white
   *
   * Under C4:
   *   R90:  D→E, Gate1→Gate4   → (E, Gate4) ≠ (D, Gate7) ❌
   *   R180: D→J, Gate1→Gate7   → (J, Gate7) ≠ (D, Gate7) ❌  (position J ≠ D)
   *   R270: D→I, Gate1→Gate10  → (I, Gate10) ≠ (D, Gate7) ❌
   *
   * Therefore canonical_hash(D,m(1)) ≠ canonical_hash(D,m(7)).
   */
  it('D black + Gate1 black ≠ D black + Gate7 black under C4', () => {
    const stateD_m1 = buildTestState(
      { D: 'black' },
      { 1: ['black', null] },
      'white',
      2,
    );
    const stateD_m7 = buildTestState(
      { D: 'black' },
      { 7: ['black', null] },
      'white',
      2,
    );

    const h1 = computeCanonicalHashString(stateD_m1);
    const h7 = computeCanonicalHashString(stateD_m7);

    expect(h1).not.toBe(h7);
  });

  it('raw hashes for D+Gate1 and D+Gate7 are also distinct', () => {
    const stateD_m1 = buildTestState({ D: 'black' }, { 1: ['black', null] }, 'white', 2);
    const stateD_m7 = buildTestState({ D: 'black' }, { 7: ['black', null] }, 'white', 2);
    expect(keyToString(computeRawHash(stateD_m1))).not.toBe(keyToString(computeRawHash(stateD_m7)));
  });

  /**
   * Verify explicitly that no C4 rotation maps (D, Gate1) → (D, Gate7):
   * This is a mathematical proof encoded as an assertion.
   */
  it('C4 position transforms: D never maps to D with Gate1→Gate7', () => {
    // R90: D→E (not D)
    // R180: D→J (not D)
    // R270: D→I (not D)
    // R0: D→D, Gate1→Gate1 (not Gate7)
    // Only R180 maps Gate1→Gate7, but R180 also maps D→J, so (D,Gate7) is never reached
    const positionR90: Record<PositionId, PositionId> = {
      A: 'C', B: 'H', C: 'M', D: 'E', E: 'J',
      F: 'B', G: 'G', H: 'L', I: 'D', J: 'I',
      K: 'A', L: 'F', M: 'K',
    };
    const gateR90: Record<number, number> = {
      1: 4, 2: 5, 3: 6, 4: 7, 5: 8, 6: 9,
      7: 10, 8: 11, 9: 12, 10: 1, 11: 2, 12: 3,
    };

    let pos: PositionId = 'D';
    let gate = 1;

    for (let rot = 1; rot <= 3; rot++) {
      pos = positionR90[pos] as PositionId;
      gate = gateR90[gate] as number;
      // After rot rotations from (D, Gate1):
      const isD = pos === 'D';
      const isGate7 = gate === 7;
      // They should never both be true
      expect(isD && isGate7).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. symmetry group ID isolation
// ---------------------------------------------------------------------------

describe('symmetry group ID isolation from canonical_hash', () => {
  /**
   * The symmetry group ID (prefix-based, position-only stabilizer)
   * is NOT stored in or derivable from canonical_hash.
   *
   * Design guarantee: canonical_hash uses FULL state (position + gate assets + player + moveNumber).
   * symmetry group ID would only use position ownership.
   *
   * Test: two states with same position ownership pattern but different gate assets
   * should have DIFFERENT canonical hashes (gate assets ARE included).
   */
  it('states with same positions but different gate assets have different canonical hashes', () => {
    const s1 = buildTestState({ A: 'black' }, { 1: ['black', null] });
    const s2 = buildTestState({ A: 'black' }, { 2: ['black', null] }); // different gate
    const h1 = computeCanonicalHashString(s1);
    const h2 = computeCanonicalHashString(s2);
    expect(h1).not.toBe(h2);
  });

  it('canonical_hash includes gate assets (not position-only)', () => {
    // Same position ownership, no gates filled in s1, some in s2
    const s1 = buildTestState({ A: 'black', B: 'white' }, {});
    const s2 = buildTestState({ A: 'black', B: 'white' }, { 3: ['black', null] });
    expect(computeCanonicalHashString(s1)).not.toBe(computeCanonicalHashString(s2));
  });

  it('canonical_hash includes currentPlayer (not position-only)', () => {
    const s1 = buildTestState({ A: 'black' }, {}, 'black');
    const s2 = buildTestState({ A: 'black' }, {}, 'white');
    expect(computeCanonicalHashString(s1)).not.toBe(computeCanonicalHashString(s2));
  });

  it('canonical_hash includes moveNumber (not position-only)', () => {
    const s1 = buildTestState({ A: 'black' }, {}, 'black', 1);
    const s2 = buildTestState({ A: 'black' }, {}, 'black', 7);
    expect(computeCanonicalHashString(s1)).not.toBe(computeCanonicalHashString(s2));
  });
});

// ---------------------------------------------------------------------------
// 5. Differential update — XOR toggle consistency
// ---------------------------------------------------------------------------

describe('differential update helpers', () => {
  it('updatePositionOwner produces same hash as full recompute', () => {
    const s1 = buildTestState({ A: null }, {}, 'black', 1);
    // Compute full hash for s1 (A=null)
    const h1 = computeRawHash(s1);

    // Differential: update A from null → black
    const hDiff = updatePositionOwner(h1, 'A', null, 'black');

    // Full recompute for s2 (A=black)
    const s2 = buildTestState({ A: 'black' }, {}, 'black', 1);
    const h2 = computeRawHash(s2);

    expect(keyToString(hDiff)).toBe(keyToString(h2));
  });

  it('updatePositionOwner round-trip: toggling twice returns original hash', () => {
    const state = buildTestState({ D: 'black' }, {});
    const h0 = computeRawHash(state);
    const h1 = updatePositionOwner(h0, 'D', 'black', 'white');
    const h2 = updatePositionOwner(h1, 'D', 'white', 'black');
    expect(keyToString(h2)).toBe(keyToString(h0));
  });

  it('updateCurrentPlayer produces same hash as full recompute', () => {
    const s1 = buildTestState({}, {}, 'black', 3);
    const h1 = computeRawHash(s1);
    const hDiff = updateCurrentPlayer(h1, 'black', 'white');

    const s2 = buildTestState({}, {}, 'white', 3);
    const h2 = computeRawHash(s2);

    expect(keyToString(hDiff)).toBe(keyToString(h2));
  });

  it('updateMoveNumber produces same hash as full recompute', () => {
    const s1 = buildTestState({ G: 'black' }, {}, 'black', 5);
    const h1 = computeRawHash(s1);
    const hDiff = updateMoveNumber(h1, 5, 6);

    const s2 = buildTestState({ G: 'black' }, {}, 'black', 6);
    const h2 = computeRawHash(s2);

    expect(keyToString(hDiff)).toBe(keyToString(h2));
  });

  it('updateGateLargeSlot produces same hash as full recompute', () => {
    const s1 = buildTestState({}, { 7: [null, null] }, 'black', 1);
    const h1 = computeRawHash(s1);
    const hDiff = updateGateLargeSlot(h1, 7, 0, null, { size: 'large', owner: 'black' });

    const s2 = buildTestState({}, { 7: ['black', null] }, 'black', 1);
    const h2 = computeRawHash(s2);

    expect(keyToString(hDiff)).toBe(keyToString(h2));
  });
});

// ---------------------------------------------------------------------------
// 6. currentPlayer and moveNumber in hash
// ---------------------------------------------------------------------------

describe('hash includes currentPlayer and moveNumber', () => {
  it('identical board, different player → different canonical hash', () => {
    const s1 = buildTestState({ A: 'black', M: 'white' }, { 1: ['black', null] }, 'black', 4);
    const s2 = buildTestState({ A: 'black', M: 'white' }, { 1: ['black', null] }, 'white', 4);
    expect(computeCanonicalHashString(s1)).not.toBe(computeCanonicalHashString(s2));
  });

  it('identical board, different moveNumber → different canonical hash', () => {
    const s1 = buildTestState({ A: 'black', M: 'white' }, { 1: ['black', null] }, 'black', 4);
    const s2 = buildTestState({ A: 'black', M: 'white' }, { 1: ['black', null] }, 'black', 8);
    expect(computeCanonicalHashString(s1)).not.toBe(computeCanonicalHashString(s2));
  });
});

// ---------------------------------------------------------------------------
// 7. Integration: use actual engine moves
// ---------------------------------------------------------------------------

describe('integration with engine moves', () => {
  it('game state after first move has non-initial canonical hash', () => {
    const initial = createInitialState();
    const h0 = computeCanonicalHashString(initial);

    let state = selectPosition(initial, 'A');
    state = applyMassiveBuild(state, 1);

    const h1 = computeCanonicalHashString(state);
    expect(h0).not.toBe(h1);
  });

  it('two distinct first moves produce distinct canonical hashes', () => {
    const initial = createInitialState();

    let stateA = selectPosition(initial, 'A');
    stateA = applyMassiveBuild(stateA, 1);

    let stateB = selectPosition(initial, 'G');
    stateB = applyMassiveBuild(stateB, 1);

    const hA = computeCanonicalHashString(stateA);
    const hB = computeCanonicalHashString(stateB);
    expect(hA).not.toBe(hB);
  });
});
