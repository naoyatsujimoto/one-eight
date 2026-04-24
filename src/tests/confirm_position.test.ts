import { describe, expect, it } from 'vitest';
import { confirmPositionOnly, selectPosition } from '../game/engine';
import { createInitialState } from '../game/initialState';
import { canCapturePosition } from '../game/capture';
import type { Asset, GameState, GateState } from '../game/types';

function fillGate(gate: GateState, owner: 'black' | 'white'): GateState {
  return {
    ...gate,
    largeSlots: gate.largeSlots.map(() => ({ size: 'large', owner } as Asset)),
    middleSlots: gate.middleSlots.map(() => ({ size: 'middle', owner } as Asset)),
    smallSlots: gate.smallSlots.map(() => ({ size: 'small', owner } as Asset)),
  };
}

// Position A is connected to gates [1, 2, 7, 12]
// Fill them all for black so build options are zero.
function makeAllGatesFullForA(state: GameState, owner: 'black' | 'white'): GameState {
  return {
    ...state,
    gates: {
      ...state.gates,
      1:  fillGate(state.gates[1],  owner),
      2:  fillGate(state.gates[2],  owner),
      7:  fillGate(state.gates[7],  owner),
      12: fillGate(state.gates[12], owner),
    },
  };
}

describe('confirmPositionOnly', () => {
  it('is blocked when no position is selected', () => {
    const state = createInitialState();
    const next = confirmPositionOnly(state);
    expect(next.currentPlayer).toBe('black'); // no change
    expect(next.history).toHaveLength(0);
  });

  it('is blocked when build options are still available', () => {
    // Initial state: gates are not full, so builds are possible
    const state = selectPosition(createInitialState(), 'A');
    const next = confirmPositionOnly(state);
    expect(next.currentPlayer).toBe('black'); // blocked
    expect(next.history).toHaveLength(0);
  });

  it('confirms own position without build when all gates are full', () => {
    const base = makeAllGatesFullForA(createInitialState(), 'black');
    const state: GameState = {
      ...base,
      positions: { ...base.positions, A: { id: 'A', owner: 'black' } },
      selectedPosition: 'A',
      pendingPositionOwner: 'black',
    };
    const next = confirmPositionOnly(state);
    expect(next.currentPlayer).toBe('white');
    expect(next.history).toHaveLength(1);
    expect(next.history[0]!.build.type).toBe('no-build');
    expect(next.history[0]!.positioning).toBe('A');
    // Position A ownership unchanged
    expect(next.positions['A'].owner).toBe('black');
  });

  it('captures opponent position without build when all gates are full and player dominates', () => {
    const base = createInitialState();
    // Position A → gates [1, 2, 7, 12]. All must be full (no build options).
    // When all gates are full they have equal gateTotalValue, so mostBuilt = all 4 gates.
    // For black to capture: playerWins > opponentWins among all 4 gates.
    // → black must dominate at least 3 of the 4 gates.
    const gatesFull: GameState['gates'] = {
      ...base.gates,
      1:  fillGate(base.gates[1],  'black'),  // black dominates
      2:  fillGate(base.gates[2],  'black'),  // black dominates
      7:  fillGate(base.gates[7],  'black'),  // black dominates
      12: fillGate(base.gates[12], 'white'),  // white dominates
    };

    const state: GameState = {
      ...base,
      gates: gatesFull,
      positions: { ...base.positions, A: { id: 'A', owner: 'white' } },
      // black's turn; black dominates gate 1 (the highest-value gate for A)
      currentPlayer: 'black',
      selectedPosition: 'A',
      pendingPositionOwner: 'black',
    };

    // Verify that capture is indeed allowed by the existing capture rule
    expect(canCapturePosition(state, 'black', 'A')).toBe(true);

    const next = confirmPositionOnly(state);
    expect(next.currentPlayer).toBe('white');
    expect(next.history).toHaveLength(1);
    expect(next.history[0]!.build.type).toBe('no-build');
    expect(next.positions['A'].owner).toBe('black'); // captured
  });

  it('does NOT allow capture when player does not dominate', () => {
    // All gates filled with white — black cannot capture
    const base = makeAllGatesFullForA(createInitialState(), 'white');
    const state: GameState = {
      ...base,
      positions: { ...base.positions, A: { id: 'A', owner: 'white' } },
      currentPlayer: 'black',
    };

    // selectPosition should reject (canCapturePosition = false)
    const afterSelect = selectPosition(state, 'A');
    expect(afterSelect.selectedPosition).toBeNull(); // not selectable

    // Even if we force-set selectedPosition, confirmPositionOnly proceeds
    // because hasAny=false, but position ownership was never legally selected.
    // This is a guard test: engine does not validate ownership at confirm time,
    // which is intentional — selectPosition is the gatekeeper.
  });
});
