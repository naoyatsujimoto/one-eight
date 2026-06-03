/**
 * Training T3 unit tests.
 *
 * T3_BUILD_REQUIRED_SKIP_BLOCKED:
 *   - initialState has trainingMode=true, currentPlayer=black
 *   - expectedMove: positioning=B, build=massive, gate=2
 *   - Correct move completes the task step
 *   - Wrong move (different position or gate) does not pass
 */

import { describe, expect, it } from 'vitest';
import { applyMassiveBuild, selectPosition } from '../game/engine';
import { T3_BUILD_REQUIRED_SKIP_BLOCKED } from '../training/tasks/T3_build_required_skip_blocked';
import { validateMove } from '../training/validateMove';

describe('T3_BUILD_REQUIRED_SKIP_BLOCKED', () => {
  it('initialState has trainingMode=true and currentPlayer=black', () => {
    const state = T3_BUILD_REQUIRED_SKIP_BLOCKED.initialState;
    expect(state.trainingMode).toBe(true);
    expect(state.currentPlayer).toBe('black');
  });

  it('expectedMove is positioning=B, build=massive, gate=2', () => {
    const step = T3_BUILD_REQUIRED_SKIP_BLOCKED.steps[0];
    expect(step).toBeDefined();
    if (!step || step.kind !== 'user_move') throw new Error('Step 0 should be user_move');
    const expected = step.expected;
    expect(expected.positioning).toBe('B');
    expect(expected.build.type).toBe('massive');
    if (expected.build.type === 'massive') {
      expect(expected.build.gate).toBe(2);
    }
  });

  it('correct move (B, massive, gate 2) validates as true', () => {
    const state = T3_BUILD_REQUIRED_SKIP_BLOCKED.initialState;
    const step = T3_BUILD_REQUIRED_SKIP_BLOCKED.steps[0];
    if (!step || step.kind !== 'user_move') throw new Error('Expected user_move step');

    const afterSelect = selectPosition(state, 'B');
    const afterBuild = applyMassiveBuild(afterSelect, 2);
    const lastRecord = afterBuild.history[afterBuild.history.length - 1];
    expect(lastRecord).toBeDefined();
    expect(validateMove(lastRecord!, step.expected)).toBe(true);
  });

  it('wrong gate (gate 3) does not validate', () => {
    const state = T3_BUILD_REQUIRED_SKIP_BLOCKED.initialState;
    const step = T3_BUILD_REQUIRED_SKIP_BLOCKED.steps[0];
    if (!step || step.kind !== 'user_move') throw new Error('Expected user_move step');

    const afterSelect = selectPosition(state, 'B');
    const afterBuild = applyMassiveBuild(afterSelect, 3);
    const lastRecord = afterBuild.history[afterBuild.history.length - 1];
    expect(lastRecord).toBeDefined();
    expect(validateMove(lastRecord!, step.expected)).toBe(false);
  });

  it('wrong position does not validate', () => {
    const state = T3_BUILD_REQUIRED_SKIP_BLOCKED.initialState;
    const step = T3_BUILD_REQUIRED_SKIP_BLOCKED.steps[0];
    if (!step || step.kind !== 'user_move') throw new Error('Expected user_move step');

    const afterSelect = selectPosition(state, 'A');
    const afterBuild = applyMassiveBuild(afterSelect, 1);
    const lastRecord = afterBuild.history[afterBuild.history.length - 1];
    expect(lastRecord).toBeDefined();
    expect(validateMove(lastRecord!, step.expected)).toBe(false);
  });

  it('task completes when correct move is applied (single step)', () => {
    const state = T3_BUILD_REQUIRED_SKIP_BLOCKED.initialState;
    const step = T3_BUILD_REQUIRED_SKIP_BLOCKED.steps[0];
    if (!step || step.kind !== 'user_move') throw new Error('Expected user_move step');

    const afterSelect = selectPosition(state, 'B');
    const afterBuild = applyMassiveBuild(afterSelect, 2);
    const lastRecord = afterBuild.history[afterBuild.history.length - 1];
    expect(lastRecord).toBeDefined();
    const isCorrect = validateMove(lastRecord!, step.expected);
    // After the only user_move step is correct, the task is eligible for completion
    expect(isCorrect).toBe(true);
    expect(T3_BUILD_REQUIRED_SKIP_BLOCKED.steps.filter((s) => s.kind === 'user_move').length).toBe(1);
  });
});
