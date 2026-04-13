import { describe, expect, it } from 'vitest';
import { canCapturePosition } from '../game/capture';
import { createInitialState } from '../game/initialState';
import type { Asset, GameState } from '../game/types';

// Helpers
function setGateLarge(state: GameState, gateId: keyof GameState['gates'], owner: 'black' | 'white'): GameState {
  const gate = state.gates[gateId];
  return {
    ...state,
    gates: {
      ...state.gates,
      [gateId]: {
        ...gate,
        largeSlots: [{ size: 'large', owner } as Asset, gate.largeSlots[1]],
      }
    }
  };
}

describe('capture boundary — tied most-built gate group', () => {
  /**
   * Position A → Gates [1, 2, 7, 12]
   * Scenario: gate 1 has most total value.
   * Gate 1 is the sole "most-built" gate.
   * If black dominates gate 1, black can capture A (owned by white).
   */
  it('allows capture when black dominates the sole most-built gate', () => {
    let state = createInitialState();
    state = {
      ...state,
      positions: {
        ...state.positions,
        A: { id: 'A', owner: 'white' }
      }
    };
    state = setGateLarge(state, 1, 'black'); // gate 1: black large[0]
    expect(canCapturePosition(state, 'black', 'A')).toBe(true);
  });

  /**
   * Tied most-built group: gate 1 and gate 2 have the same max total value.
   * black wins gate 1 (1 large = 64), white wins gate 2 (1 large = 64).
   * playerWins=1, opponentWins=1 → 1 > 1 is false → capture denied.
   */
  it('denies capture when tied most-built gates are 1 black vs 1 white', () => {
    let state = createInitialState();
    state = {
      ...state,
      positions: {
        ...state.positions,
        A: { id: 'A', owner: 'white' }
      }
    };
    // gate 1: black large[0]
    state = setGateLarge(state, 1, 'black');
    // gate 2: white large[0]
    state = setGateLarge(state, 2, 'white');
    // gate 7, 12 stay empty → value = 0, not tied with max(64)
    expect(canCapturePosition(state, 'black', 'A')).toBe(false);
  });

  /**
   * Tied most-built group: gate 1 and gate 2 and gate 7 each have 1 large (64).
   * black wins gate 1 and gate 7 (playerWins=2), white wins gate 2 (opponentWins=1).
   * 2 > 1 → capture allowed.
   */
  it('allows capture when black wins 2 of 3 tied most-built gates', () => {
    let state = createInitialState();
    state = {
      ...state,
      positions: {
        ...state.positions,
        A: { id: 'A', owner: 'white' }
      }
    };
    state = setGateLarge(state, 1, 'black');
    state = setGateLarge(state, 7, 'black');
    state = setGateLarge(state, 2, 'white');
    // gate 12 stays empty
    expect(canCapturePosition(state, 'black', 'A')).toBe(true);
  });

  /**
   * All tied most-built gates are 'tie' (neither player dominates any gate).
   * playerWins=0, opponentWins=0 → 0 > 0 is false → capture denied.
   */
  it('denies capture when all most-built gates are internal ties', () => {
    let state = createInitialState();
    state = {
      ...state,
      positions: {
        ...state.positions,
        A: { id: 'A', owner: 'white' }
      }
    };
    // Both players put a large on gate 1 → tie in gate 1
    const gate1 = state.gates[1];
    const gate1Tied: typeof gate1 = {
      ...gate1,
      largeSlots: [
        { size: 'large', owner: 'black' } as Asset,
        { size: 'large', owner: 'white' } as Asset,
      ]
    };
    state = { ...state, gates: { ...state.gates, 1: gate1Tied } };
    // Gates 2, 7, 12 stay empty (value=0, not max-built)
    // Only gate1 is most-built
    expect(canCapturePosition(state, 'black', 'A')).toBe(false);
  });

  /**
   * Cannot capture own position.
   */
  it('denies capture of own position', () => {
    let state = createInitialState();
    state = {
      ...state,
      positions: {
        ...state.positions,
        A: { id: 'A', owner: 'black' }
      }
    };
    state = setGateLarge(state, 1, 'black');
    expect(canCapturePosition(state, 'black', 'A')).toBe(false);
  });

  /**
   * Cannot capture empty position.
   */
  it('denies capture of empty position', () => {
    const state = createInitialState();
    expect(canCapturePosition(state, 'black', 'A')).toBe(false);
  });
});
