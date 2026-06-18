/**
 * Phase 3-D: FullGameTrainingRunner utility tests
 *
 * Tests for fullGameUtils.ts — applyScriptedMove, scriptedMoveToExpected,
 * markFullGameCompleted, isFullGameCompleted.
 * Does not import React components (no JSDOM required).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { applyScriptedMove, scriptedMoveToExpected, markFullGameCompleted, isFullGameCompleted } from '../training/fullGameUtils';
import { createInitialState } from '../game/initialState';
import { FULL_GAME_V1 } from '../training/tasks/fullGameV1';
import type { ScriptedMove } from '../training/types';

// ── localStorage mock ────────────────────────────────────────────────────────

const LS_KEY = 'one_eight_fullgame_v1_completed';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── isFullGameCompleted / markFullGameCompleted ──────────────────────────────

describe('isFullGameCompleted', () => {
  it('returns false when localStorage key is absent', () => {
    expect(isFullGameCompleted()).toBe(false);
  });

  it('returns true after markFullGameCompleted()', () => {
    markFullGameCompleted();
    expect(isFullGameCompleted()).toBe(true);
  });

  it('markFullGameCompleted stores an ISO date string', () => {
    markFullGameCompleted();
    const val = localStorage.getItem(LS_KEY);
    expect(val).not.toBeNull();
    expect(() => new Date(val!)).not.toThrow();
    expect(isNaN(new Date(val!).getTime())).toBe(false);
  });

  it('returns false when localStorage throws (graceful degradation)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('quota'); });
    expect(isFullGameCompleted()).toBe(false);
  });

  it('markFullGameCompleted does not throw when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => markFullGameCompleted()).not.toThrow();
  });
});

// ── scriptedMoveToExpected ───────────────────────────────────────────────────

describe('scriptedMoveToExpected', () => {
  it('converts massive move correctly', () => {
    const sm: ScriptedMove = { position: 'E', buildType: 'massive', gates: [6] };
    const em = scriptedMoveToExpected(sm);
    expect(em.positioning).toBe('E');
    expect(em.build.type).toBe('massive');
    if (em.build.type === 'massive') {
      expect(em.build.gate).toBe(6);
    }
  });

  it('converts selective move correctly', () => {
    const sm: ScriptedMove = { position: 'F', buildType: 'selective', gates: [3, 7] };
    const em = scriptedMoveToExpected(sm);
    expect(em.positioning).toBe('F');
    expect(em.build.type).toBe('selective');
    if (em.build.type === 'selective') {
      expect(em.build.gates).toEqual([3, 7]);
    }
  });

  it('converts quad move and sets minGates', () => {
    const sm: ScriptedMove = { position: 'A', buildType: 'quad', gates: [1, 2, 7, 12] };
    const em = scriptedMoveToExpected(sm);
    expect(em.positioning).toBe('A');
    expect(em.build.type).toBe('quad');
    if (em.build.type === 'quad') {
      expect(em.build.minGates).toBe(4);
    }
  });

  it('converts quad move with empty gates (minGates=undefined)', () => {
    const sm: ScriptedMove = { position: 'B', buildType: 'quad', gates: [] };
    const em = scriptedMoveToExpected(sm);
    expect(em.build.type).toBe('quad');
    if (em.build.type === 'quad') {
      expect(em.build.minGates).toBeUndefined();
    }
  });
});

// ── applyScriptedMove ────────────────────────────────────────────────────────

describe('applyScriptedMove — Move 1 (massive)', () => {
  it('applies Move 1 massive build and advances moveNumber', () => {
    const state = createInitialState(null);
    const step = FULL_GAME_V1.steps[0];
    expect(step).toBeDefined();
    expect(step!.kind).toBe('user');
    expect(step!.player).toBe('black');
    const next = applyScriptedMove(state, step!.move);
    expect(next.moveNumber).toBe(2);
    expect(next.history).toHaveLength(1);
  });

  it('Move 1 result: selectedPosition is null (build committed)', () => {
    const state = createInitialState(null);
    const next = applyScriptedMove(state, FULL_GAME_V1.steps[0]!.move);
    expect(next.selectedPosition).toBeNull();
  });
});

describe('applyScriptedMove — Move 2 (auto/white)', () => {
  it('applies Move 2 after Move 1 and advances to moveNumber 3', () => {
    const s0 = createInitialState(null);
    const s1 = applyScriptedMove(s0, FULL_GAME_V1.steps[0]!.move);
    const s2 = applyScriptedMove(s1, FULL_GAME_V1.steps[1]!.move);
    expect(s2.moveNumber).toBe(3);
    expect(s2.history).toHaveLength(2);
  });
});

describe('applyScriptedMove — full sequence integrity', () => {
  it('applying all 22 moves produces 22 history records', () => {
    let state = createInitialState(null);
    for (const step of FULL_GAME_V1.steps) {
      state = applyScriptedMove(state, step.move);
    }
    expect(state.history).toHaveLength(22);
  });

  it('final state: Black=8, White=3, Open=2, gameEnded=false', () => {
    let state = createInitialState(null);
    for (const step of FULL_GAME_V1.steps) {
      state = applyScriptedMove(state, step.move);
    }
    const positions = Object.values(state.positions);
    const black = positions.filter((p) => p.owner === 'black').length;
    const white = positions.filter((p) => p.owner === 'white').length;
    const open  = positions.filter((p) => p.owner === null).length;
    expect(black).toBe(8);
    expect(white).toBe(3);
    expect(open).toBe(2);
    expect(state.gameEnded).toBe(false);
  });
});
