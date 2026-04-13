import { describe, expect, it } from 'vitest';
import { applyMassiveBuild, selectPosition, skipTurn } from '../game/engine';
import { createInitialState } from '../game/initialState';

describe('engine flow', () => {
  it('selects an empty position', () => {
    const state = createInitialState();
    const next = selectPosition(state, 'A');
    expect(next.positions.A.owner).toBe('black');
    expect(next.selectedPosition).toBe('A');
  });

  it('deselects when the same position is clicked again', () => {
    const state = selectPosition(createInitialState(), 'A');
    expect(state.selectedPosition).toBe('A');
    const next = selectPosition(state, 'A');
    expect(next.selectedPosition).toBeNull();
    // Owner must remain unchanged
    expect(next.positions.A.owner).toBe('black');
  });

  it('switches selection to a different position', () => {
    const state = selectPosition(createInitialState(), 'A');
    const next = selectPosition(state, 'B');
    expect(next.selectedPosition).toBe('B');
    expect(next.positions.A.owner).toBe('black');
    expect(next.positions.B.owner).toBe('black');
  });

  it('applies a massive build and advances turn', () => {
    const state = selectPosition(createInitialState(), 'A');
    const next = applyMassiveBuild(state, 1);
    expect(next.currentPlayer).toBe('white');
    expect(next.gates[1].largeSlots.filter(Boolean)).toHaveLength(1);
    expect(next.history).toHaveLength(1);
  });
});

describe('skipTurn guard', () => {
  it('does not skip when at least one build option exists for selected position', () => {
    // Initial state has empty gates, so build options are always available
    const state = selectPosition(createInitialState(), 'A');
    const next = skipTurn(state);
    // State must be unchanged: turn does not advance
    expect(next.currentPlayer).toBe('black');
    expect(next.history).toHaveLength(0);
  });

  it('allows skip when no position is selected', () => {
    const state = createInitialState();
    // No selectedPosition → skip proceeds
    const next = skipTurn(state);
    expect(next.currentPlayer).toBe('white');
    expect(next.history).toHaveLength(1);
  });
});
