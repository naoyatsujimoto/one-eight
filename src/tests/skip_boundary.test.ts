import { describe, expect, it } from 'vitest';
import { selectPosition, skipTurn } from '../game/engine';
import { createInitialState } from '../game/initialState';
import type { Asset, GameState, GateState } from '../game/types';

function fillGate(gate: GateState, owner: 'black' | 'white'): GateState {
  return {
    ...gate,
    largeSlots: gate.largeSlots.map(() => ({ size: 'large', owner } as Asset)),
    middleSlots: gate.middleSlots.map(() => ({ size: 'middle', owner } as Asset)),
    smallSlots: gate.smallSlots.map(() => ({ size: 'small', owner } as Asset)),
  };
}

describe('skipTurn — boundary', () => {
  it('skip proceeds when no position is selected', () => {
    const state = createInitialState();
    // No selectedPosition → build options irrelevant
    const next = skipTurn(state);
    expect(next.currentPlayer).toBe('white');
    expect(next.history).toHaveLength(1);
    expect(next.history[0]!.build.type).toBe('skip');
  });

  it('skip is blocked when a position is selected and builds are available', () => {
    const state = selectPosition(createInitialState(), 'A');
    // All gates of A have open slots → build possible → skip blocked
    const next = skipTurn(state);
    expect(next.currentPlayer).toBe('black');
    expect(next.history).toHaveLength(0);
  });

  it('skip proceeds when a position is selected but all its gates are full', () => {
    // Position A → gates [1, 2, 7, 12]
    const state = createInitialState();
    const gatesFullForA: GameState['gates'] = {
      ...state.gates,
      1: fillGate(state.gates[1], 'black'),
      2: fillGate(state.gates[2], 'black'),
      7: fillGate(state.gates[7], 'black'),
      12: fillGate(state.gates[12], 'black'),
    };
    const stateWithFullGates: GameState = { ...state, gates: gatesFullForA };
    // Select position A (own it, so no capture needed)
    const stateSelected: GameState = {
      ...stateWithFullGates,
      selectedPosition: 'A',
      positions: { ...stateWithFullGates.positions, A: { id: 'A', owner: 'black' } }
    };
    // No builds possible → skip should proceed
    const next = skipTurn(stateSelected);
    expect(next.currentPlayer).toBe('white');
    expect(next.history).toHaveLength(1);
    expect(next.history[0]!.build.type).toBe('skip');
  });
});
