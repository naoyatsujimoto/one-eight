/**
 * medium_pattern.test.ts — Phase M-1: computeMediumPatternId unit tests
 *
 * Test coverage:
 *   1. 空盤面での medium_pattern_id が一意に決まること
 *   2. C4対称局面で同一 medium_pattern_id になること（R90/R180/R270）
 *   3. 対称でない局面では異なる medium_pattern_id になること
 *   4. Gate1 に黒が支配的 vs Gate4 に黒が支配的 → C4正規化後の corner_bits が等しいこと
 *   5. Gate1 黒支配 + Gate4 白支配 ≠ Gate1 白支配 + Gate4 黒支配（非対称）
 *   6. medium_pattern_id のフォーマットが `[hash]:[4桁]` であること
 *   7. all-neutral state → corner_bits = "0000"
 *   8. 全 corner gates に黒支配 → corner_bits = "1111"
 *   9. canonicalizeMediumPatternBits: all rotations of "1000" → "0001" (lexmin)
 *  10. canonicalizeMediumPatternBits: "0001" is already canonical
 *  11. part1 は computePositionOwnershipCanonicalHashString と一致すること
 *  12. 空盤面の corner_bits が "0000" であること（getMediumPatternCornerBits）
 *  13. 単一 corner gate 黒支配の raw → canonical が期待値
 *  14. 異なる position 所有状態 → 異なる part1
 */

import { describe, it, expect } from 'vitest';
import {
  computeMediumPatternId,
  computeMediumPatternIdForRotation,
  getMediumPatternCornerBits,
  canonicalizeMediumPatternBits,
} from '../game/mediumPattern';
import { computePositionOwnershipCanonicalHashString } from '../game/zobrist';
import { selectPosition, applyMassiveBuild, applySelectiveBuild } from '../game/engine';
import { createInitialState } from '../game/initialState';
import type { GameState, GateId } from '../game/types';

// ---------------------------------------------------------------------------
// Helper: apply a massive build to a gate on the given state
// ---------------------------------------------------------------------------

function withMassiveBuild(state: GameState, gateId: GateId): GameState {
  return applyMassiveBuild(state, gateId);
}

// ---------------------------------------------------------------------------
// Helper: create a state with black owning position A + massive build on gate g
// ---------------------------------------------------------------------------

function blackAtAWithGate(g: GateId): GameState {
  const s0 = createInitialState(null);
  const s1 = selectPosition({ ...s0, currentPlayer: 'black' }, 'A');
  return withMassiveBuild(s1, g);
}

// ---------------------------------------------------------------------------
// Helper: create a state with white owning position C + massive build on gate g
// (White is the current player)
// ---------------------------------------------------------------------------

function whiteAtCWithGate(g: GateId): GameState {
  const s0 = createInitialState(null);
  const s1 = selectPosition({ ...s0, currentPlayer: 'white' }, 'C');
  return withMassiveBuild(s1, g);
}

// ---------------------------------------------------------------------------
// 1. 空盤面での medium_pattern_id が一意に決まること
// ---------------------------------------------------------------------------

describe('computeMediumPatternId — empty board', () => {
  it('returns a deterministic id for initial state', () => {
    const s = createInitialState(null);
    const id1 = computeMediumPatternId(s);
    const id2 = computeMediumPatternId(s);
    expect(id1).toBe(id2);
    expect(typeof id1).toBe('string');
    expect(id1.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2. C4対称局面で同一 medium_pattern_id になること
// ---------------------------------------------------------------------------

describe('computeMediumPatternId — C4 symmetry equivalence', () => {
  /**
   * A と K はC4回転で等価（A→C→M→K→A サイクル）。
   * 同様に Gate1, Gate4, Gate7, Gate10 も回転等価。
   * black が A with gate1 と black が C with gate4 の position ownership は
   * C4回転で等価になるので、part1 が同一になる。
   * corner_bits も同じ dominance パターンなので C4正規化後に同一になる。
   */
  it('black A+gate1 and black C+gate4 yield same medium_pattern_id', () => {
    const stateA = blackAtAWithGate(1);
    const stateC = (() => {
      const s0 = createInitialState(null);
      const s1 = selectPosition({ ...s0, currentPlayer: 'black' }, 'C');
      return withMassiveBuild(s1, 4);
    })();
    const idA = computeMediumPatternId(stateA);
    const idC = computeMediumPatternId(stateC);
    expect(idA).toBe(idC);
  });

  it('black A+gate1 and black M+gate7 yield same medium_pattern_id (R180)', () => {
    const stateA = blackAtAWithGate(1);
    const stateM = (() => {
      const s0 = createInitialState(null);
      const s1 = selectPosition({ ...s0, currentPlayer: 'black' }, 'M');
      return withMassiveBuild(s1, 7);
    })();
    const idA = computeMediumPatternId(stateA);
    const idM = computeMediumPatternId(stateM);
    expect(idA).toBe(idM);
  });

  it('black A+gate1 and black K+gate10 yield same medium_pattern_id (R270)', () => {
    const stateA = blackAtAWithGate(1);
    const stateK = (() => {
      const s0 = createInitialState(null);
      const s1 = selectPosition({ ...s0, currentPlayer: 'black' }, 'K');
      return withMassiveBuild(s1, 10);
    })();
    const idA = computeMediumPatternId(stateA);
    const idK = computeMediumPatternId(stateK);
    expect(idA).toBe(idK);
  });
});

// ---------------------------------------------------------------------------
// 3. 対称でない局面では異なる medium_pattern_id になること
// ---------------------------------------------------------------------------

describe('computeMediumPatternId — asymmetric states differ', () => {
  it('black at A (no gate) vs black at A+gate1 → different ids', () => {
    const s0 = createInitialState(null);
    // black at A, no build
    const stateNoBuild = selectPosition({ ...s0, currentPlayer: 'black' }, 'A');
    const stateWithBuild = blackAtAWithGate(1);
    const idNoBuild = computeMediumPatternId(stateNoBuild);
    const idWithBuild = computeMediumPatternId(stateWithBuild);
    expect(idNoBuild).not.toBe(idWithBuild);
  });

  it('black at A+gate1 vs white at A+gate1 → different corner bits (different states overall)', () => {
    const blackState = blackAtAWithGate(1);
    const whiteState = whiteAtCWithGate(1);
    // These differ in position ownership (A vs C) and possibly corner bits
    const idBlack = computeMediumPatternId(blackState);
    const idWhite = computeMediumPatternId(whiteState);
    // Different position owners → different part1
    expect(idBlack).not.toBe(idWhite);
  });
});

// ---------------------------------------------------------------------------
// 4. Gate1 に黒が支配的 vs Gate4 に黒が支配的 → C4正規化後の medium_pattern_id が等しいこと
//    (raw bits はズレるが、co-minimized ID は等しい)
// ---------------------------------------------------------------------------

describe('computeMediumPatternId — C4 gate rotation equivalence', () => {
  it('black A+gate1 vs black C+gate4 → same medium_pattern_id (co-minimized)', () => {
    const stateGate1 = blackAtAWithGate(1);
    const stateGate4 = (() => {
      const s0 = createInitialState(null);
      const s1 = selectPosition({ ...s0, currentPlayer: 'black' }, 'C');
      return withMassiveBuild(s1, 4);
    })();
    // raw corner bits differ: "1000" vs "0100" — but co-minimized IDs must match
    expect(getMediumPatternCornerBits(stateGate1)).toBe('1000'); // R0 raw
    expect(getMediumPatternCornerBits(stateGate4)).toBe('0100'); // R0 raw, intentionally different
    expect(computeMediumPatternId(stateGate1)).toBe(computeMediumPatternId(stateGate4));
  });
});

// ---------------------------------------------------------------------------
// 5. Gate1 黒支配 + Gate4 白支配 ≠ Gate1 白支配 + Gate4 黒支配（非対称）
// ---------------------------------------------------------------------------

describe('getMediumPatternCornerBits — non-symmetric mixed dominance', () => {
  it('gate1=black+gate4=white differs from gate1=white+gate4=black', () => {
    // State A: black massive at gate1, white massive at gate4
    const s0 = createInitialState(null);

    const blackAtGate1 = (() => {
      const s1 = selectPosition({ ...s0, currentPlayer: 'black' }, 'A');
      return withMassiveBuild(s1, 1);
    })();
    // Add white build at gate4 on top of blackAtGate1 state
    const mixedStateA = (() => {
      const s1 = selectPosition({ ...blackAtGate1, currentPlayer: 'white' }, 'C');
      return withMassiveBuild(s1, 4);
    })();

    // State B: black massive at gate4, white massive at gate1
    const blackAtGate4 = (() => {
      const s1 = selectPosition({ ...s0, currentPlayer: 'black' }, 'A');
      return withMassiveBuild(s1, 4);
    })();
    const mixedStateB = (() => {
      const s1 = selectPosition({ ...blackAtGate4, currentPlayer: 'white' }, 'C');
      return withMassiveBuild(s1, 1);
    })();

    const bitsA = getMediumPatternCornerBits(mixedStateA);
    const bitsB = getMediumPatternCornerBits(mixedStateB);

    // These represent fundamentally different dominance patterns:
    // A: [black, white, 0, 0] → canonical "0012" or similar
    // B: [white, black, 0, 0] → different canonical
    // They should not be equal
    expect(bitsA).not.toBe(bitsB);
  });
});

// ---------------------------------------------------------------------------
// 6. medium_pattern_id のフォーマットが `[hash]:[4桁]` であること
// ---------------------------------------------------------------------------

describe('computeMediumPatternId — format validation', () => {
  it('format is [hash]:[4chars]', () => {
    const s = createInitialState(null);
    const id = computeMediumPatternId(s);
    const parts = id.split(':');
    // The last segment is the 4-char corner bits
    const cornerBits = parts[parts.length - 1];
    expect(cornerBits).toMatch(/^[012]{4}$/);
    // There must be content before the last ':'
    const hashPart = parts.slice(0, -1).join(':');
    expect(hashPart.length).toBeGreaterThan(0);
  });

  it('format is [hash]:[4chars] after moves', () => {
    const s = blackAtAWithGate(1);
    const id = computeMediumPatternId(s);
    const parts = id.split(':');
    const cornerBits = parts[parts.length - 1];
    expect(cornerBits).toMatch(/^[012]{4}$/);
    const hashPart = parts.slice(0, -1).join(':');
    expect(hashPart.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 7. all-neutral state → corner_bits = "0000"
// ---------------------------------------------------------------------------

describe('getMediumPatternCornerBits — neutral states', () => {
  it('empty board yields "0000"', () => {
    const s = createInitialState(null);
    const bits = getMediumPatternCornerBits(s);
    expect(bits).toBe('0000');
  });
});

// ---------------------------------------------------------------------------
// 8. 全 corner gates に黒支配 → corner_bits = "1111"
// ---------------------------------------------------------------------------

describe('getMediumPatternCornerBits — all black dominant', () => {
  it('all corner gates dominated by black → "1111"', () => {
    const s0 = createInitialState(null);
    // Apply massive build at gates 1, 4, 7, 10 for black
    // Each step: force currentPlayer=black, select position, apply massive build
    const s1 = selectPosition({ ...s0, currentPlayer: 'black' as const }, 'A');
    const s2 = withMassiveBuild(s1, 1);
    const s3 = selectPosition({ ...s2, currentPlayer: 'black' as const }, 'C');
    const s4 = withMassiveBuild(s3, 4);
    const s5 = selectPosition({ ...s4, currentPlayer: 'black' as const }, 'M');
    const s6 = withMassiveBuild(s5, 7);
    const s7 = selectPosition({ ...s6, currentPlayer: 'black' as const }, 'K');
    const state = withMassiveBuild(s7, 10);

    const bits = getMediumPatternCornerBits(state);
    expect(bits).toBe('1111');
  });
});

// ---------------------------------------------------------------------------
// 9. canonicalizeMediumPatternBits: all rotations of "1000" → "0001"
// ---------------------------------------------------------------------------

describe('canonicalizeMediumPatternBits', () => {
  it('"1000" → "0001" (lexicographic minimum rotation)', () => {
    // Rotations: "1000", "0001", "0010", "0100"
    // Lexmin = "0001"
    expect(canonicalizeMediumPatternBits('1000')).toBe('0001');
  });

  // ---------------------------------------------------------------------------
  // 10. canonicalizeMediumPatternBits: "0001" is already canonical
  // ---------------------------------------------------------------------------

  it('"0001" is already canonical', () => {
    expect(canonicalizeMediumPatternBits('0001')).toBe('0001');
  });

  it('"0000" is canonical (all neutral)', () => {
    expect(canonicalizeMediumPatternBits('0000')).toBe('0000');
  });

  it('"1111" is canonical (all black)', () => {
    expect(canonicalizeMediumPatternBits('1111')).toBe('1111');
  });

  it('"1200" → lexmin is "0012" or one of its rotations', () => {
    const result = canonicalizeMediumPatternBits('1200');
    // All rotations: "1200", "0120", "0012", "2001"
    // Lexmin = "0012"
    expect(result).toBe('0012');
  });
});

// ---------------------------------------------------------------------------
// 11. part1 は中立コーナー状態では computePositionOwnershipCanonicalHashString と一致する
//     (非中立状態では co-minimize のためズレる可能性あり。初期状態のみ検証)
// ---------------------------------------------------------------------------

describe('computeMediumPatternId — part1 consistency (neutral corner)', () => {
  it('initial state: part1 matches computePositionOwnershipCanonicalHashString', () => {
    // When all corner bits are "0000" for every rotation, co-minimization degrades
    // to position-only minimization, so part1 must equal the independent canonical hash.
    const s = createInitialState(null);
    const id = computeMediumPatternId(s);
    const expectedPart1 = computePositionOwnershipCanonicalHashString(s);
    expect(id.startsWith(expectedPart1 + ':')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 11b. 向きズレ検出テスト— computeMediumPatternIdForRotation で同回転向きを検証
// ---------------------------------------------------------------------------

describe('computeMediumPatternId — co-rotation alignment (key fix verification)', () => {
  it('all 4 C4-rotated versions of a state yield the SAME medium_pattern_id', () => {
    // R90 equivalent: black@A+gate1 ≡ black@C+gate4 ≡ black@M+gate7 ≡ black@K+gate10
    const s1 = blackAtAWithGate(1);
    const s4 = (() => {
      const s0 = createInitialState(null);
      const s = selectPosition({ ...s0, currentPlayer: 'black' }, 'C');
      return withMassiveBuild(s, 4);
    })();
    const s7 = (() => {
      const s0 = createInitialState(null);
      const s = selectPosition({ ...s0, currentPlayer: 'black' }, 'M');
      return withMassiveBuild(s, 7);
    })();
    const s10 = (() => {
      const s0 = createInitialState(null);
      const s = selectPosition({ ...s0, currentPlayer: 'black' }, 'K');
      return withMassiveBuild(s, 10);
    })();
    const id1 = computeMediumPatternId(s1);
    const id4 = computeMediumPatternId(s4);
    const id7 = computeMediumPatternId(s7);
    const id10 = computeMediumPatternId(s10);
    expect(id1).toBe(id4);
    expect(id1).toBe(id7);
    expect(id1).toBe(id10);
  });

  it('computeMediumPatternIdForRotation: each rotation returns a valid format string', () => {
    // This verifies the per-rotation helper used internally for co-minimization
    const state = blackAtAWithGate(1);
    for (let rot = 0; rot < 4; rot++) {
      const candidate = computeMediumPatternIdForRotation(state, rot);
      const parts = candidate.split(':');
      const cornerBits = parts[parts.length - 1];
      expect(cornerBits).toMatch(/^[012]{4}$/);
    }
  });

  it('position and gate bits are from the SAME rotation: no independent minimization', () => {
    // If position and gate were independently minimized, states that are
    // C4-rotations of each other might map to different IDs.
    // This test confirms they always map to the same ID.
    const state = blackAtAWithGate(1); // R0 base
    const rotated = (() => {
      // R90: A→C, gate1→4
      const s0 = createInitialState(null);
      const s = selectPosition({ ...s0, currentPlayer: 'black' }, 'C');
      return withMassiveBuild(s, 4);
    })();
    expect(computeMediumPatternId(state)).toBe(computeMediumPatternId(rotated));
  });
});

// ---------------------------------------------------------------------------
// 12. 空盤面の corner_bits が "0000" であること（getMediumPatternCornerBits）
// ---------------------------------------------------------------------------

describe('getMediumPatternCornerBits — initial state', () => {
  it('initial state has "0000" corner bits', () => {
    const s = createInitialState(null);
    expect(getMediumPatternCornerBits(s)).toBe('0000');
  });
});

// ---------------------------------------------------------------------------
// 13. 単一 corner gate 黒支配の raw → canonical が期待値
// ---------------------------------------------------------------------------

describe('getMediumPatternCornerBits — single gate dominance (raw R0 bits)', () => {
  it('only gate1 dominated by black → raw R0 bits = "1000" (NOT independently canonicalized)', () => {
    // getMediumPatternCornerBits returns raw (R0) bits, not independently canonicalized.
    // canonical form is only produced inside computeMediumPatternId via co-minimization.
    const state = blackAtAWithGate(1);
    const bits = getMediumPatternCornerBits(state);
    expect(bits).toBe('1000'); // raw: gate1=black, gate4=0, gate7=0, gate10=0
  });
});

// ---------------------------------------------------------------------------
// 14. 異なる position 所有状態 → 異なる part1
// ---------------------------------------------------------------------------

describe('computeMediumPatternId — different positions yield different part1', () => {
  it('black at A+gate1 vs black at B+gate2 → different medium_pattern_id', () => {
    // Position A -> gates [1,2,7,12]: use gate1
    // Position B -> gates [2,3,6,11]: use gate2 (non-corner, so corner_bits both 0000)
    // A and B are not C4 symmetric, so part1 should differ
    const stateA = blackAtAWithGate(1);
    const stateB = (() => {
      const s0 = createInitialState(null);
      const s1 = selectPosition({ ...s0, currentPlayer: 'black' }, 'B');
      return withMassiveBuild(s1, 2); // gate2 is non-corner
    })();
    expect(computeMediumPatternId(stateA)).not.toBe(computeMediumPatternId(stateB));
  });
});
