import { describe, expect, it } from 'vitest';
import { canCapturePosition } from '../game/capture';
import { createInitialState } from '../game/initialState';

describe('capture rules', () => {
  it('allows capture when current player dominates the most built gate', () => {
    const state = createInitialState();
    state.positions.A.owner = 'white';
    state.gates[1].largeSlots[0] = { size: 'large', owner: 'black' };
    expect(canCapturePosition(state, 'black', 'A')).toBe(true);
  });

  it('disallows capture when the position is empty', () => {
    const state = createInitialState();
    expect(canCapturePosition(state, 'black', 'A')).toBe(false);
  });
});
