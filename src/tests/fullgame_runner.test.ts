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

// ── applyScriptedMove — selective_single ────────────────────────────────────

describe('applyScriptedMove — selective_single', () => {
  it('applies selective_single correctly and advances moveNumber', () => {
    // Apply up to just before M46 (step index 55) using user/auto/pass moves only
    let state = createInitialState(null);
    for (let i = 0; i < FULL_GAME_V1.steps.length; i++) {
      const step = FULL_GAME_V1.steps[i]!;
      if (step.moveNumber === 55) break; // stop before M46
      if (step.kind === 'intro' || step.kind === 'select_only') continue;
      if (!step.move) continue;
      state = applyScriptedMove(state, step.move);
    }
    const step55 = FULL_GAME_V1.steps[55]!; // M46
    expect(step55.kind).toBe('auto');
    expect(step55.move?.buildType).toBe('selective_single');
    const before = state.history.length;
    const next = applyScriptedMove(state, step55.move!);
    expect(next.history.length).toBeGreaterThan(before);
  });

  it('M46 selective_single(9) and M48 selective_single(9) are applied legally', () => {
    let state = createInitialState(null);
    for (const step of FULL_GAME_V1.steps) {
      if (step.kind === 'intro' || step.kind === 'select_only') continue;
      if (!step.move) continue;
      // Just confirm it doesn't throw
      state = applyScriptedMove(state, step.move);
    }
    // If we got here without error, selective_single was handled
    expect(state).toBeDefined();
  });
});

// ── applyScriptedMove — pass ─────────────────────────────────────────────────

describe('applyScriptedMove — pass (M50)', () => {
  it('M50 pass step has buildType pass', () => {
    const step59 = FULL_GAME_V1.steps[59]!;
    expect(step59.moveNumber).toBe(59);
    expect(step59.kind).toBe('pass');
    expect(step59.move?.buildType).toBe('pass');
  });

  it('applying pass move does not throw', () => {
    const state = createInitialState(null);
    const passMove: ScriptedMove = { position: '', buildType: 'pass', gates: [] };
    expect(() => applyScriptedMove(state, passMove)).not.toThrow();
  });
});

// ── applyScriptedMove — full sequence integrity ──────────────────────────────

describe('applyScriptedMove — full sequence integrity', () => {
  it('applying all user/auto/pass moves produces valid game history', () => {
    let state = createInitialState(null);
    for (const step of FULL_GAME_V1.steps) {
      if (step.kind === 'intro' || step.kind === 'select_only') continue;
      if (!step.move) continue;
      state = applyScriptedMove(state, step.move);
    }
    // Should have processed all non-intro/select_only steps
    expect(state.history.length).toBeGreaterThan(0);
  });

  it('final state after all moves: gameEnded=true, Black=9, White=4', () => {
    let state = createInitialState(null);
    for (const step of FULL_GAME_V1.steps) {
      if (step.kind === 'intro' || step.kind === 'select_only') continue;
      if (!step.move) continue;
      state = applyScriptedMove(state, step.move);
    }
    expect(state.gameEnded).toBe(true);
    const positions = Object.values(state.positions);
    const black = positions.filter((p) => p.owner === 'black').length;
    const white = positions.filter((p) => p.owner === 'white').length;
    expect(black).toBe(9);
    expect(white).toBe(4);
  });
});
