import { describe, expect, it } from 'vitest';
import { applyMassiveToGate, applyQuadToGate, applySelectiveToGate } from '../game/build';
import { createInitialState } from '../game/initialState';

describe('build rules', () => {
  it('places one large asset when a slot is free', () => {
    const state = createInitialState();
    const result = applyMassiveToGate(state.gates[1], 'black');
    expect(result.placed).toBe(1);
    expect(result.gate.largeSlots.filter(Boolean)).toHaveLength(1);
  });

  it('returns zero when no middle slot remains on a gate', () => {
    const state = createInitialState();
    let gate = state.gates[1];
    gate = applySelectiveToGate(gate, 'black').gate;
    gate = applySelectiveToGate(gate, 'black').gate;
    const result = applySelectiveToGate(gate, 'black');
    expect(result.placed).toBe(0);
  });

  it('places one small asset on the last remaining small slot', () => {
    const state = createInitialState();
    let gate = state.gates[1];
    for (let i = 0; i < 3; i += 1) gate = applyQuadToGate(gate, 'black').gate;
    const result = applyQuadToGate(gate, 'black');
    expect(result.placed).toBe(1);
  });
});
