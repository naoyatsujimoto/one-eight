import { describe, expect, it } from 'vitest';
import { enumerateLegalMoves, selectCpuMove, scoreMoveForOrdering, evaluateState, isEndgame } from '../game/ai';
import { createInitialState } from '../game/initialState';
import { applyMassiveBuild, selectPosition } from '../game/engine';
import { canCapturePosition } from '../game/capture';
import type { Asset, GameState, GateState, Player } from '../game/types';

// ---------- helpers ----------

function fillGate(gate: GateState, owner: Player): GateState {
  return {
    ...gate,
    largeSlots: gate.largeSlots.map(() => ({ size: 'large', owner } as Asset)),
    middleSlots: gate.middleSlots.map(() => ({ size: 'middle', owner } as Asset)),
    smallSlots: gate.smallSlots.map(() => ({ size: 'small', owner } as Asset)),
  };
}

function fillAllGates(state: GameState, owner: Player): GameState {
  const gates = Object.fromEntries(
    Object.entries(state.gates).map(([id, gate]) => [id, fillGate(gate as GateState, owner)])
  ) as GameState['gates'];
  return { ...state, gates };
}

// ---------- enumerateLegalMoves ----------

describe('enumerateLegalMoves', () => {
  it('returns non-empty moves from initial state for black', () => {
    const state = createInitialState();
    const moves = enumerateLegalMoves(state, 'black');
    expect(moves.length).toBeGreaterThan(0);
  });

  it('returns non-empty moves from initial state for white', () => {
    const state = createInitialState();
    const moves = enumerateLegalMoves(state, 'white');
    expect(moves.length).toBeGreaterThan(0);
  });

  it('all moves reference valid positionIds', () => {
    const state = createInitialState();
    const VALID_POS = new Set(['A','B','C','D','E','F','G','H','I','J','K','L','M']);
    const moves = enumerateLegalMoves(state, 'black');
    for (const m of moves) {
      if (m.type !== 'pass') {
        expect(VALID_POS.has(m.positionId)).toBe(true);
      }
    }
  });

  it('returns pass when all gates are full', () => {
    const state = fillAllGates(createInitialState(), 'black');
    const moves = enumerateLegalMoves(state, 'white');
    // No build possible → empty list → selectCpuMove returns pass
    expect(moves.length).toBe(0);
  });

  it('does not include moves for opponent-owned unbeatable positions', () => {
    const state = createInitialState();
    // Give black all positions
    const positions = Object.fromEntries(
      Object.entries(state.positions).map(([id, pos]) => [id, { ...pos, owner: 'black' }])
    ) as GameState['positions'];
    const next: GameState = { ...state, positions };
    const moves = enumerateLegalMoves(next, 'white');
    for (const m of moves) {
      if (m.type !== 'pass') {
        const owner = next.positions[m.positionId].owner;
        expect(owner === null || owner === 'white').toBe(true);
      }
    }
  });
});

// ---------- selectCpuMove (Normal difficulty) ----------

describe('selectCpuMove (normal)', () => {
  it('returns a move from initial state', () => {
    const state = createInitialState('white');
    const move = selectCpuMove(state, 'white', 'normal');
    expect(move.type).not.toBe(undefined);
  });

  it('returns pass when no legal moves exist', () => {
    const state = fillAllGates(createInitialState('white'), 'black');
    const move = selectCpuMove(state, 'white', 'normal');
    expect(move.type).toBe('pass');
  });

  it('never returns a massive move to a gate not belonging to the chosen position', () => {
    const POSITION_TO_GATES: Record<string, number[]> = {
      A: [1, 2, 7, 12], B: [2, 3, 6, 11], C: [3, 4, 5, 10],
      D: [1, 3, 7, 11],  E: [2, 4, 6, 10], F: [3, 8, 11, 12],
      G: [1, 4, 7, 10],  H: [2, 5, 6, 9],  I: [4, 8, 10, 12],
      J: [1, 5, 7, 9],   K: [4, 9, 10, 11],L: [5, 8, 9, 12],
      M: [1, 6, 7, 8],
    };
    const state = createInitialState('white');
    // Single call is sufficient; gate–position mapping is deterministic
    const move = selectCpuMove(state, 'white', 'normal');
    if (move.type === 'massive') {
      const validGates = POSITION_TO_GATES[move.positionId]!;
      expect(validGates.includes(move.gateId)).toBe(true);
    }
  });

  it('cpu move can be applied via engine functions without error', () => {
    const state = createInitialState('white');
    const move = selectCpuMove(state, 'white', 'normal');
    if (move.type === 'pass') return;

    const afterSelect = selectPosition(state, move.positionId);
    expect(afterSelect.selectedPosition).toBe(move.positionId);

    if (move.type === 'massive') {
      const afterBuild = applyMassiveBuild(afterSelect, move.gateId);
      expect(afterBuild.moveNumber).toBe(state.moveNumber + 1);
    }
  });

  it('never returns pass when non-pass moves exist', () => {
    const state = createInitialState('white');
    // Single call is sufficient to verify the contract
    const move = selectCpuMove(state, 'white', 'normal');
    expect(move.type).not.toBe('pass');
  });
});

// ---------- selectCpuMove (Hard difficulty) ----------

describe('selectCpuMove (hard)', () => {
  it('returns a move from initial state', () => {
    const state = createInitialState('white');
    const move = selectCpuMove(state, 'white', 'hard');
    expect(move.type).not.toBe(undefined);
  });

  it('returns pass when no legal moves exist', () => {
    const state = fillAllGates(createInitialState('white'), 'black');
    const move = selectCpuMove(state, 'white', 'hard');
    expect(move.type).toBe('pass');
  });

  it('cpu move can be applied without error', () => {
    const state = createInitialState('white');
    const move = selectCpuMove(state, 'white', 'hard');
    if (move.type === 'pass') return;

    const afterSelect = selectPosition(state, move.positionId);
    expect(afterSelect.selectedPosition).toBe(move.positionId);

    if (move.type === 'massive') {
      const afterBuild = applyMassiveBuild(afterSelect, move.gateId);
      expect(afterBuild.moveNumber).toBe(state.moveNumber + 1);
    }
  });

  it('hard CPU prefers immediate capture over a clearly inferior non-capture move', () => {
    /**
     * Controlled scenario:
     * - All gates are completely filled with black assets (no build space anywhere),
     *   EXCEPT gate 1 which has only large slots filled by black (middle+small empty).
     * - Position A is owned by white.
     * - Gate 1 total value: 128 (black large × 2), other A-gates: fully filled black → tie.
     *   Wait, we need black to dominate gate 1. Gate 1 = all black → black dominates.
     *   Most-built gates: all gates of A have same fill level if we fill 2,7,12 fully too.
     *   Let gate 1 have large (black, 2×64=128) + middle (black) + small (black).
     *   Remaining: gate 1 has 0 free slots except we leave middle+small free.
     *   
     * Simpler: Fill ALL gates completely with white assets, except:
     *   - Gate 1: fill large slots with black (2×64), leave middle/small empty.
     *   - Gates 2,7,12 (other A gates): fill completely with white.
     * Then mostBuilt = whichever has highest total. Gate 1 has 128 (black only).
     * Gates 2,7,12 filled with white → value = 2×64+2×8+4×1=148 each.
     * So mostBuilt = gates 2,7,12 (value 148 each). Black has 0 on those.
     * White dominates → black cannot capture A. Bad.
     *
     * Better: Fill gates 2,7,12 partially with black too so gate 1 dominates as most-built.
     * Gate 1: 2 black large = 128. No middle/small so black can still build middle+small.
     * Gates 2,7,12: fill all with white = 148 each.
     * mostBuilt = {2,7,12} with 148. White dominates → cannot capture.
     *
     * Actually: we need gate 1 to be the most-built gate AND black to dominate it.
     * Gate 1: fill with black (2 large + 2 middle + 4 small = 128+16+4=148).
     * Gates 2,7,12: empty (value 0).
     * Now mostBuilt = {gate 1} with 148. Black dominates gate 1 → canCapturePosition = true.
     * But gates 2,7,12 have free large slots → black can also build massive on those.
     * White owns position A. Black can capture by building on any of A's gates.
     *
     * For the CPU to ONLY have moves on position A, fill all OTHER gates completely
     * so no other positions have available builds.
     */

    const base = createInitialState('black');

    // Fill gate 1 completely with black assets (making black dominate gate 1)
    const gate1: GateState = {
      ...base.gates[1],
      largeSlots: [{ size: 'large', owner: 'black' }, { size: 'large', owner: 'black' }],
      middleSlots: [{ size: 'middle', owner: 'black' }, { size: 'middle', owner: 'black' }],
      smallSlots: [
        { size: 'small', owner: 'black' }, { size: 'small', owner: 'black' },
        { size: 'small', owner: 'black' }, { size: 'small', owner: 'black' },
      ],
    } as GateState;

    // Fill ALL other gates completely with white assets (so no build space)
    const fillWhite = (gate: GateState): GateState => ({
      ...gate,
      largeSlots: gate.largeSlots.map(() => ({ size: 'large' as const, owner: 'white' as const })),
      middleSlots: gate.middleSlots.map(() => ({ size: 'middle' as const, owner: 'white' as const })),
      smallSlots: gate.smallSlots.map(() => ({ size: 'small' as const, owner: 'white' as const })),
    });

    const newGates = { ...base.gates };
    // Fill gates NOT belonging to position A (A's gates: 1, 2, 7, 12) with white
    // so that no build space exists outside of A's gates.
    for (const gId of [3,4,5,6,8,9,10,11] as const) {
      newGates[gId] = fillWhite(base.gates[gId]);
    }
    // Gate 1: black dominates (value 148). Gates 2, 7, 12: left empty (value 0).
    // → mostBuilt = { gate 1 } → black dominates → canCapturePosition('A') = true
    newGates[1] = gate1;

    // White owns position A
    const positions = {
      ...base.positions,
      A: { ...base.positions['A'], owner: 'white' as const },
    };

    const captureState: GameState = {
      ...base,
      currentPlayer: 'black',
      positions,
      gates: newGates as GameState['gates'],
    };

    // Verify canCapturePosition returns true for this scenario
    // Gate 1 (total 148 black) is most-built. Black dominates → should be capturable.
    expect(canCapturePosition(captureState, 'black', 'A')).toBe(true);

    // A should be present in legal moves (capture move exists)
    const legal = enumerateLegalMoves(captureState, 'black');
    const positionsInLegal = legal.filter(m => m.type !== 'pass').map(m => (m as any).positionId);
    expect(positionsInLegal).toContain('A');

    // CPU (hard) should pick position A as the best move (capture is highest priority)
    const move = selectCpuMove(captureState, 'black', 'hard');
    expect(move.type).not.toBe('pass');
    expect((move as any).positionId).toBe('A');
  });
});

// ---------- move ordering ----------

describe('move ordering', () => {
  it('ordering does not break legality', () => {
    const VALID_POS = new Set(['A','B','C','D','E','F','G','H','I','J','K','L','M']);
    const state = createInitialState('white');
    const moves = enumerateLegalMoves(state, 'white');
    const scored = moves
      .filter(m => m.type !== 'pass')
      .sort((a, b) => scoreMoveForOrdering(state, 'white', b) - scoreMoveForOrdering(state, 'white', a));
    for (const m of scored) {
      // m is already narrowed to non-pass by the filter above
      expect(VALID_POS.has((m as any).positionId)).toBe(true);
    }
  });

  it('capture move scores higher than non-capture move', () => {
    // Use same scenario as the hard CPU capture test
    const base = createInitialState('black');
    const gate1: GateState = {
      ...base.gates[1],
      largeSlots: [{ size: 'large', owner: 'black' }, { size: 'large', owner: 'black' }],
      middleSlots: [{ size: 'middle', owner: 'black' }, { size: 'middle', owner: 'black' }],
      smallSlots: [
        { size: 'small', owner: 'black' }, { size: 'small', owner: 'black' },
        { size: 'small', owner: 'black' }, { size: 'small', owner: 'black' },
      ],
    } as GateState;
    const fillWhite = (gate: GateState): GateState => ({
      ...gate,
      largeSlots: gate.largeSlots.map(() => ({ size: 'large' as const, owner: 'white' as const })),
      middleSlots: gate.middleSlots.map(() => ({ size: 'middle' as const, owner: 'white' as const })),
      smallSlots: gate.smallSlots.map(() => ({ size: 'small' as const, owner: 'white' as const })),
    });
    const newGates = { ...base.gates };
    for (const gId of [3,4,5,6,8,9,10,11] as const) {
      newGates[gId] = fillWhite(base.gates[gId]);
    }
    newGates[1] = gate1;
    const positions = {
      ...base.positions,
      A: { ...base.positions['A'], owner: 'white' as const },
    };
    const captureState: GameState = { ...base, currentPlayer: 'black', positions, gates: newGates as GameState['gates'] };

    const moves = enumerateLegalMoves(captureState, 'black');
    const captureMove = moves.find(m => m.type !== 'pass' && (m as any).positionId === 'A');
    const nonCaptureMoves = moves.filter(m => m.type !== 'pass' && (m as any).positionId !== 'A');

    if (captureMove && nonCaptureMoves.length > 0) {
      const captureScore = scoreMoveForOrdering(captureState, 'black', captureMove);
      const nonCaptureScore = scoreMoveForOrdering(captureState, 'black', nonCaptureMoves[0]!);
      expect(captureScore).toBeGreaterThan(nonCaptureScore);
    }
  });
});

// ---------- evaluateState Phase 2 ----------

describe('evaluateState Phase 2', () => {
  it('owning a position with gate dominance scores higher than initial state', () => {
    const base = createInitialState('black');
    // Give black position A and make black dominate all of A's gates (1,2,7,12)
    const fillBlack = (gate: GateState): GateState => ({
      ...gate,
      largeSlots: gate.largeSlots.map(() => ({ size: 'large' as const, owner: 'black' as const })),
      middleSlots: gate.middleSlots.map(() => ({ size: 'middle' as const, owner: 'black' as const })),
      smallSlots: gate.smallSlots.map(() => ({ size: 'small' as const, owner: 'black' as const })),
    });
    const newGates = { ...base.gates };
    for (const gId of [1,2,7,12] as const) {
      newGates[gId] = fillBlack(base.gates[gId]);
    }
    const positions = { ...base.positions, A: { ...base.positions['A'], owner: 'black' as const } };
    const stateA: GameState = { ...base, positions, gates: newGates as GameState['gates'] };
    const stateB = createInitialState('black');
    expect(evaluateState(stateA, 'black')).toBeGreaterThan(evaluateState(stateB, 'black'));
  });

  it('penalizes high recapture risk on own positions', () => {
    const base = createInitialState('black');
    const fillBlack = (gate: GateState): GateState => ({
      ...gate,
      largeSlots: gate.largeSlots.map(() => ({ size: 'large' as const, owner: 'black' as const })),
      middleSlots: gate.middleSlots.map(() => ({ size: 'middle' as const, owner: 'black' as const })),
      smallSlots: gate.smallSlots.map(() => ({ size: 'small' as const, owner: 'black' as const })),
    });
    const fillWhite = (gate: GateState): GateState => ({
      ...gate,
      largeSlots: gate.largeSlots.map(() => ({ size: 'large' as const, owner: 'white' as const })),
      middleSlots: gate.middleSlots.map(() => ({ size: 'middle' as const, owner: 'white' as const })),
      smallSlots: gate.smallSlots.map(() => ({ size: 'small' as const, owner: 'white' as const })),
    });

    // stateStrong: black owns A, dominates all 4 gates
    const newGatesStrong = { ...base.gates };
    for (const gId of [1,2,7,12] as const) { newGatesStrong[gId] = fillBlack(base.gates[gId]); }
    const positionsOwned = { ...base.positions, A: { ...base.positions['A'], owner: 'black' as const } };
    const stateStrong: GameState = { ...base, positions: positionsOwned, gates: newGatesStrong as GameState['gates'] };

    // stateRisky: black owns A, but white dominates 3 of 4 gates (2,7,12 white; gate 1 black)
    const newGatesRisky = { ...base.gates };
    newGatesRisky[1] = fillBlack(base.gates[1]);
    for (const gId of [2,7,12] as const) { newGatesRisky[gId] = fillWhite(base.gates[gId]); }
    const stateRisky: GameState = { ...base, positions: positionsOwned, gates: newGatesRisky as GameState['gates'] };

    expect(evaluateState(stateStrong, 'black')).toBeGreaterThan(evaluateState(stateRisky, 'black'));
  });
});

// ---------- hard CPU Phase 2 regression ----------

describe('hard CPU Phase 2 regression', () => {
  it('hard still picks immediate capture after Phase 2', () => {
    const base = createInitialState('black');
    const gate1: GateState = {
      ...base.gates[1],
      largeSlots: [{ size: 'large', owner: 'black' }, { size: 'large', owner: 'black' }],
      middleSlots: [{ size: 'middle', owner: 'black' }, { size: 'middle', owner: 'black' }],
      smallSlots: [
        { size: 'small', owner: 'black' }, { size: 'small', owner: 'black' },
        { size: 'small', owner: 'black' }, { size: 'small', owner: 'black' },
      ],
    } as GateState;
    const fillWhite = (gate: GateState): GateState => ({
      ...gate,
      largeSlots: gate.largeSlots.map(() => ({ size: 'large' as const, owner: 'white' as const })),
      middleSlots: gate.middleSlots.map(() => ({ size: 'middle' as const, owner: 'white' as const })),
      smallSlots: gate.smallSlots.map(() => ({ size: 'small' as const, owner: 'white' as const })),
    });
    const newGates = { ...base.gates };
    for (const gId of [3,4,5,6,8,9,10,11] as const) {
      newGates[gId] = fillWhite(base.gates[gId]);
    }
    newGates[1] = gate1;
    const positions = { ...base.positions, A: { ...base.positions['A'], owner: 'white' as const } };
    const captureState: GameState = { ...base, currentPlayer: 'black', positions, gates: newGates as GameState['gates'] };
    const move = selectCpuMove(captureState, 'black', 'hard');
    expect(move.type).not.toBe('pass');
    expect((move as any).positionId).toBe('A');
  });
});

// ---------- search runs without crash ----------

describe('CPU search sanity', () => {
  it('normal search completes without throwing', () => {
    const state = createInitialState('white');
    expect(() => selectCpuMove(state, 'white', 'normal')).not.toThrow();
  });

  it('hard search completes without throwing', () => {
    const state = createInitialState('white');
    expect(() => selectCpuMove(state, 'white', 'hard')).not.toThrow();
  });

  it('move never returns illegal positionId (normal, single call)', () => {
    // Use normal difficulty to avoid heavy search; purpose is legality check only
    const VALID_POS = new Set(['A','B','C','D','E','F','G','H','I','J','K','L','M']);
    const state = createInitialState('white');
    const move = selectCpuMove(state, 'white', 'normal');
    if (move.type !== 'pass') {
      expect(VALID_POS.has(move.positionId)).toBe(true);
    }
  });
});

// ---------- isEndgame ----------

describe('isEndgame', () => {
  it('returns false for initial state (0 positions owned)', () => {
    const state = createInitialState();
    expect(isEndgame(state)).toBe(false);
  });

  it('returns false when 7 positions are owned', () => {
    const base = createInitialState();
    const posIds: Array<keyof typeof base.positions> = ['A','B','C','D','E','F','G'];
    const positions = { ...base.positions };
    for (const id of posIds) {
      positions[id] = { ...positions[id], owner: 'black' as const };
    }
    const state: GameState = { ...base, positions };
    expect(isEndgame(state)).toBe(false);
  });

  it('returns true when 8 positions are owned', () => {
    const base = createInitialState();
    const posIds: Array<keyof typeof base.positions> = ['A','B','C','D','E','F','G','H'];
    const positions = { ...base.positions };
    for (const id of posIds) {
      positions[id] = { ...positions[id], owner: 'black' as const };
    }
    const state: GameState = { ...base, positions };
    expect(isEndgame(state)).toBe(true);
  });

  it('returns true when all 13 positions are owned', () => {
    const base = createInitialState();
    const posIds: Array<keyof typeof base.positions> = ['A','B','C','D','E','F','G','H','I','J','K','L','M'];
    const positions = { ...base.positions };
    for (const id of posIds) {
      positions[id] = { ...positions[id], owner: 'black' as const };
    }
    const state: GameState = { ...base, positions };
    expect(isEndgame(state)).toBe(true);
  });
});

// ---------- selectCpuMove (very_hard) ----------

describe('selectCpuMove (very_hard)', () => {
  it('returns a move from initial state', () => {
    const state = createInitialState('white');
    const move = selectCpuMove(state, 'white', 'very_hard');
    expect(move.type).not.toBe(undefined);
  });

  it('returns pass when no legal moves exist', () => {
    const state = fillAllGates(createInitialState('white'), 'black');
    const move = selectCpuMove(state, 'white', 'very_hard');
    expect(move.type).toBe('pass');
  });

  it('cpu move can be applied without error', () => {
    const state = createInitialState('white');
    const move = selectCpuMove(state, 'white', 'very_hard');
    if (move.type === 'pass') return;

    const afterSelect = selectPosition(state, move.positionId);
    expect(afterSelect.selectedPosition).toBe(move.positionId);

    if (move.type === 'massive') {
      const afterBuild = applyMassiveBuild(afterSelect, move.gateId);
      expect(afterBuild.moveNumber).toBe(state.moveNumber + 1);
    }
  });

  it('very_hard CPU picks capture in the controlled capture scenario', () => {
    const base = createInitialState('black');
    const gate1: GateState = {
      ...base.gates[1],
      largeSlots: [{ size: 'large', owner: 'black' }, { size: 'large', owner: 'black' }],
      middleSlots: [{ size: 'middle', owner: 'black' }, { size: 'middle', owner: 'black' }],
      smallSlots: [
        { size: 'small', owner: 'black' }, { size: 'small', owner: 'black' },
        { size: 'small', owner: 'black' }, { size: 'small', owner: 'black' },
      ],
    } as GateState;
    const fillWhite = (gate: GateState): GateState => ({
      ...gate,
      largeSlots: gate.largeSlots.map(() => ({ size: 'large' as const, owner: 'white' as const })),
      middleSlots: gate.middleSlots.map(() => ({ size: 'middle' as const, owner: 'white' as const })),
      smallSlots: gate.smallSlots.map(() => ({ size: 'small' as const, owner: 'white' as const })),
    });
    const newGates = { ...base.gates };
    for (const gId of [3,4,5,6,8,9,10,11] as const) {
      newGates[gId] = fillWhite(base.gates[gId]);
    }
    newGates[1] = gate1;
    const positions = { ...base.positions, A: { ...base.positions['A'], owner: 'white' as const } };
    const captureState: GameState = { ...base, currentPlayer: 'black', positions, gates: newGates as GameState['gates'] };
    const move = selectCpuMove(captureState, 'black', 'very_hard');
    expect(move.type).not.toBe('pass');
    expect((move as any).positionId).toBe('A');
  });

  it('very_hard search completes without throwing', () => {
    const state = createInitialState('white');
    expect(() => selectCpuMove(state, 'white', 'very_hard')).not.toThrow();
  });

  it('very_hard uses depth 4 in endgame (isEndgame check only)', () => {
    // NOTE: actual depth-4 search is not executed here due to combinatorial explosion.
    // This test verifies only that the endgame condition is correctly detected,
    // which is the prerequisite for depth-4 extension logic to trigger.
    const base = createInitialState('black');
    const posIds: Array<keyof typeof base.positions> = ['A','B','C','D','E','F','G','H'];
    const positions = { ...base.positions };
    for (let i = 0; i < posIds.length; i++) {
      positions[posIds[i]!] = { ...positions[posIds[i]!], owner: i % 2 === 0 ? 'black' as const : 'white' as const };
    }
    const endgameState: GameState = { ...base, positions };
    expect(isEndgame(endgameState)).toBe(true);
  });
});
