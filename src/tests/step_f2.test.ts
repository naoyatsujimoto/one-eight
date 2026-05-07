/**
 * step_f2.test.ts — Step F-2: canonical_hash integration tests
 *
 * Test coverage:
 *   1. engine.ts — finalizeTurn() records canonical_hash on every MoveRecord
 *   2. types.ts — MoveRecord.canonical_hash is optional (backward compat)
 *   3. storage.ts — ensureCanonicalHash() fills missing canonical_hash
 *   4. storage.ts — ensureAllCanonicalHashes() handles history with missing hashes
 *   5. symmetry.ts — symmetryGroupIdFromHash() returns canonical_hash as-is for C4
 *   6. symmetry.ts — ACTIVE_TRANSFORM_GROUP is 'C4'
 *   7. symmetry.ts — C4_POSITION_MAPS and C4_GATE_MAPS are consistent with zobrist.ts
 *   8. canonical_hash is consistent across moves (same state → same hash)
 *
 * Constraints verified:
 *   - No Supabase schema changes (not applicable to unit tests)
 *   - No postmortem UI hash display (not applicable to unit tests)
 *   - Step F-3 / CPU search not touched
 */

import { describe, it, expect } from 'vitest';
import { selectPosition, applyMassiveBuild, applyQuadBuild } from '../game/engine';
import { createInitialState } from '../game/initialState';
import { ensureCanonicalHash, ensureAllCanonicalHashes } from '../game/storage';
import {
  symmetryGroupIdFromHash,
  countC4Orbit,
  ACTIVE_TRANSFORM_GROUP,
  C4_POSITION_MAPS,
  C4_GATE_MAPS,
  POSITION_R90,
  GATE_R90,
} from '../game/symmetry';
import { computeCanonicalHashString } from '../game/zobrist';
import type { GameState, MoveRecord } from '../game/types';

// ---------------------------------------------------------------------------
// Helper: perform a standard first move (black: A → massive build gate 1)
// ---------------------------------------------------------------------------

function firstMove(): GameState {
  const s0 = createInitialState();
  const s1 = selectPosition(s0, 'A');
  return applyMassiveBuild(s1, 1);
}

// ---------------------------------------------------------------------------
// 1. engine.ts: finalizeTurn records canonical_hash
// ---------------------------------------------------------------------------

describe('Step F-2: engine — canonical_hash in MoveRecord', () => {
  it('first move record has canonical_hash set', () => {
    const state = firstMove();
    expect(state.history).toHaveLength(1);
    const record = state.history[0]!;
    expect(record.canonical_hash).toBeDefined();
    expect(typeof record.canonical_hash).toBe('string');
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(record.canonical_hash!.length).toBe(16); // 64-bit hex = 16 chars
  });

  it('canonical_hash is a valid hex string', () => {
    const state = firstMove();
    const hash = state.history[0]!.canonical_hash!;
    expect(/^[0-9a-f]{16}$/.test(hash)).toBe(true);
  });

  it('each subsequent move also records canonical_hash', () => {
    const s0 = createInitialState();
    const s1 = selectPosition(s0, 'A');
    const s2 = applyMassiveBuild(s1, 1);
    // white moves
    const s3 = selectPosition(s2, 'B');
    const s4 = applyMassiveBuild(s3, 2);

    expect(s4.history).toHaveLength(2);
    for (const record of s4.history) {
      expect(record.canonical_hash).toBeDefined();
      expect(typeof record.canonical_hash).toBe('string');
    }
  });

  it('canonical_hash matches computeCanonicalHashString of the post-move state', () => {
    const s0 = createInitialState();
    const s1 = selectPosition(s0, 'A');
    const s2 = applyMassiveBuild(s1, 1);

    const recordHash = s2.history[0]!.canonical_hash!;
    // engine.ts computes canonical_hash from the post-move state which has:
    //   - positions committed (A=black)
    //   - gates updated by massive build
    //   - moveNumber+1, currentPlayer flipped
    //   - selectedPosition=null, pendingPositionOwner=null
    //   - history NOT yet appended (the snapshot used for hashing precedes the push)
    // s2 itself contains the full committed state; stripping history yields the
    // same board state that engine used for hashing.
    const postMoveState: GameState = {
      ...s2,
      history: [], // engine hashes BEFORE pushing history
    };
    const expected = computeCanonicalHashString(postMoveState);
    expect(recordHash).toBe(expected);
  });

  it('different states produce different canonical_hash values', () => {
    // Move A vs Move B
    const stateA = applyMassiveBuild(selectPosition(createInitialState(), 'A'), 1);
    const stateB = applyMassiveBuild(selectPosition(createInitialState(), 'B'), 2);

    const hashA = stateA.history[0]!.canonical_hash!;
    const hashB = stateB.history[0]!.canonical_hash!;
    expect(hashA).not.toBe(hashB);
  });
});

// ---------------------------------------------------------------------------
// 2. types.ts: MoveRecord.canonical_hash is optional
// ---------------------------------------------------------------------------

describe('Step F-2: types — MoveRecord canonical_hash is optional', () => {
  it('can create a MoveRecord without canonical_hash (backward compat)', () => {
    const record: MoveRecord = {
      moveNumber: 1,
      player: 'black',
      positioning: 'A',
      build: { type: 'massive', gate: 1, placed: 2 },
      // No canonical_hash field
    };
    expect(record.canonical_hash).toBeUndefined();
  });

  it('can create a MoveRecord with canonical_hash', () => {
    const record: MoveRecord = {
      moveNumber: 1,
      player: 'black',
      positioning: 'A',
      build: { type: 'massive', gate: 1, placed: 2 },
      canonical_hash: 'abcd1234abcd1234',
    };
    expect(record.canonical_hash).toBe('abcd1234abcd1234');
  });
});

// ---------------------------------------------------------------------------
// 3. storage.ts: ensureCanonicalHash
// ---------------------------------------------------------------------------

describe('Step F-2: storage — ensureCanonicalHash', () => {
  it('returns record unchanged when canonical_hash already set', () => {
    const record: MoveRecord = {
      moveNumber: 1,
      player: 'black',
      positioning: 'A',
      build: { type: 'massive', gate: 1, placed: 2 },
      canonical_hash: 'deadbeefdeadbeef',
    };
    const postState = firstMove();
    const result = ensureCanonicalHash(record, postState);
    expect(result.canonical_hash).toBe('deadbeefdeadbeef');
    expect(result).toBe(record); // same reference — not mutated
  });

  it('computes canonical_hash when missing', () => {
    const record: MoveRecord = {
      moveNumber: 1,
      player: 'black',
      positioning: 'A',
      build: { type: 'massive', gate: 1, placed: 2 },
    };
    const postState = firstMove();
    const result = ensureCanonicalHash(record, postState);
    expect(result.canonical_hash).toBeDefined();
    expect(typeof result.canonical_hash).toBe('string');
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result.canonical_hash!.length).toBe(16);
  });

  it('does not mutate the original record', () => {
    const record: MoveRecord = {
      moveNumber: 1,
      player: 'black',
      positioning: 'A',
      build: { type: 'massive', gate: 1, placed: 2 },
    };
    const postState = firstMove();
    ensureCanonicalHash(record, postState);
    expect(record.canonical_hash).toBeUndefined(); // original unchanged
  });
});

// ---------------------------------------------------------------------------
// 4. storage.ts: ensureAllCanonicalHashes
// ---------------------------------------------------------------------------

describe('Step F-2: storage — ensureAllCanonicalHashes', () => {
  it('returns state unchanged when all records have canonical_hash', () => {
    const state = firstMove();
    expect(state.history.every(r => r.canonical_hash !== undefined)).toBe(true);
    const result = ensureAllCanonicalHashes(state);
    expect(result).toBe(state); // same reference — fast path
  });

  it('fills missing canonical_hash for old records', () => {
    const state = firstMove();
    // Simulate old save: strip canonical_hash from history
    const oldState: GameState = {
      ...state,
      history: state.history.map(r => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { canonical_hash, ...rest } = r;
        return rest as MoveRecord;
      }),
    };
    expect(oldState.history[0]!.canonical_hash).toBeUndefined();

    const result = ensureAllCanonicalHashes(oldState);
    expect(result.history[0]!.canonical_hash).toBeDefined();
    expect(typeof result.history[0]!.canonical_hash).toBe('string');
  });

  it('does not modify records that already have canonical_hash', () => {
    const s0 = createInitialState();
    const s1 = applyMassiveBuild(selectPosition(s0, 'A'), 1);
    const s2 = applyMassiveBuild(selectPosition(s1, 'B'), 2);

    const rec0 = s2.history[0]!;
    const rec1 = s2.history[1]!;

    // Strip hash from only the first record
    const strippedRec0: MoveRecord = { ...rec0, canonical_hash: undefined };
    const oldState: GameState = {
      ...s2,
      history: [strippedRec0, rec1],
    };

    const result = ensureAllCanonicalHashes(oldState);
    expect(result.history[0]!.canonical_hash).toBeDefined();
    expect(result.history[1]!.canonical_hash).toBe(rec1.canonical_hash);
  });
});

// ---------------------------------------------------------------------------
// 5. symmetry.ts: symmetryGroupIdFromHash
// ---------------------------------------------------------------------------

describe('Step F-2: symmetry — symmetryGroupIdFromHash', () => {
  it('returns the same string as canonical_hash (C4 group)', () => {
    const hash = 'abcd1234ef567890';
    expect(symmetryGroupIdFromHash(hash)).toBe(hash);
  });

  it('works with actual canonical hash from a game state', () => {
    const state = firstMove();
    const hash = state.history[0]!.canonical_hash!;
    expect(symmetryGroupIdFromHash(hash)).toBe(hash);
  });
});

// ---------------------------------------------------------------------------
// 6. symmetry.ts: ACTIVE_TRANSFORM_GROUP
// ---------------------------------------------------------------------------

describe('Step F-2: symmetry — ACTIVE_TRANSFORM_GROUP', () => {
  it('is C4', () => {
    expect(ACTIVE_TRANSFORM_GROUP).toBe('C4');
  });
});

// ---------------------------------------------------------------------------
// 7. symmetry.ts: C4 maps consistency
// ---------------------------------------------------------------------------

describe('Step F-2: symmetry — C4 maps', () => {
  it('C4_POSITION_MAPS[0] is identity (R0)', () => {
    const r0 = C4_POSITION_MAPS[0]!;
    for (const id of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'] as const) {
      expect(r0[id]).toBe(id);
    }
  });

  it('C4_GATE_MAPS[0] is identity (R0)', () => {
    const r0 = C4_GATE_MAPS[0]!;
    for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const) {
      expect(r0[id]).toBe(id);
    }
  });

  it('C4_POSITION_MAPS[1] matches POSITION_R90', () => {
    const r90 = C4_POSITION_MAPS[1]!;
    for (const [from, to] of Object.entries(POSITION_R90)) {
      expect(r90[from as keyof typeof r90]).toBe(to);
    }
  });

  it('C4_GATE_MAPS[1] matches GATE_R90', () => {
    const r90 = C4_GATE_MAPS[1]!;
    for (const [from, to] of Object.entries(GATE_R90)) {
      expect(r90[Number(from) as keyof typeof r90]).toBe(to);
    }
  });

  it('applying R90 four times returns to identity for positions', () => {
    let current: import('../game/types').PositionId = 'A';
    for (let i = 0; i < 4; i++) {
      current = POSITION_R90[current];
    }
    expect(current).toBe('A');
  });

  it('applying R90 four times returns to identity for gates', () => {
    let current: import('../game/types').GateId = 1;
    for (let i = 0; i < 4; i++) {
      current = GATE_R90[current];
    }
    expect(current).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 8. canonical_hash consistency
// ---------------------------------------------------------------------------

describe('Step F-2: canonical_hash consistency', () => {
  it('same game replayed produces identical canonical hashes', () => {
    function playGame(): string[] {
      const s0 = createInitialState();
      const s1 = applyMassiveBuild(selectPosition(s0, 'A'), 1);
      const s2 = applyMassiveBuild(selectPosition(s1, 'B'), 2);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return s2.history.map(r => r.canonical_hash!);
    }
    const run1 = playGame();
    const run2 = playGame();
    expect(run1).toEqual(run2);
  });

  it('countC4Orbit counts distinct rotational hashes', () => {
    // With 4 identical hashes (a fully symmetric state), orbit size = 1
    expect(countC4Orbit(['aabb', 'aabb', 'aabb', 'aabb'])).toBe(1);
    // With 4 distinct hashes, orbit size = 4
    expect(countC4Orbit(['aa', 'bb', 'cc', 'dd'])).toBe(4);
    // With 2 distinct hashes, orbit size = 2
    expect(countC4Orbit(['aa', 'bb', 'aa', 'bb'])).toBe(2);
  });
});
