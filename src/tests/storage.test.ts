import { afterEach, describe, expect, it } from 'vitest';
import { applyMassiveBuild, selectPosition } from '../game/engine';
import { createInitialState } from '../game/initialState';
import { clearState, hasSavedState, loadState, saveState } from '../game/storage';

// vitest runs in jsdom, which has localStorage available via globalThis.localStorage

afterEach(() => {
  clearState();
});

describe('storage — saveState / loadState', () => {
  it('returns initial state when localStorage is empty', () => {
    const state = loadState();
    expect(state.moveNumber).toBe(1);
    expect(state.currentPlayer).toBe('black');
    expect(state.gameEnded).toBe(false);
  });

  it('restores saved state', () => {
    const s1 = selectPosition(createInitialState(), 'A');
    const s2 = applyMassiveBuild(s1, 1);
    saveState(s2);

    const restored = loadState();
    expect(restored.moveNumber).toBe(2);
    expect(restored.currentPlayer).toBe('white');
    expect(restored.positions.A.owner).toBe('black');
    expect(restored.history).toHaveLength(1);
  });

  it('returns initial state for malformed data', () => {
    localStorage.setItem('one_eight_game_state', 'not-json{{{');
    const state = loadState();
    expect(state.moveNumber).toBe(1);
  });

  it('returns initial state when saved object is structurally invalid', () => {
    localStorage.setItem('one_eight_game_state', JSON.stringify({ foo: 'bar' }));
    const state = loadState();
    expect(state.moveNumber).toBe(1);
  });
});

describe('storage — clearState', () => {
  it('removes saved state', () => {
    saveState(createInitialState());
    clearState();
    expect(localStorage.getItem('one_eight_game_state')).toBeNull();
  });
});

describe('storage — hasSavedState', () => {
  it('returns false when no saved state exists', () => {
    expect(hasSavedState()).toBe(false);
  });

  it('returns true after saveState', () => {
    saveState(createInitialState());
    expect(hasSavedState()).toBe(true);
  });

  it('returns false after clearState', () => {
    saveState(createInitialState());
    clearState();
    expect(hasSavedState()).toBe(false);
  });
});
