/**
 * Training T7 unit tests.
 *
 * T7_DIAGONAL_GATES:
 *   - POSITION_TO_GATES.H = [2, 5, 6, 9]
 *   - initialState has trainingMode=true, currentPlayer=black
 *   - expectedMove: positioning=H, build=massive, gate=5
 *   - Gate 5 is connected to H → correct
 *   - Non-connected gate (e.g. gate 1) → wrong
 *   - Non-H position → wrong
 */

import { describe, expect, it } from 'vitest';
import { applyMassiveBuild, selectPosition } from '../game/engine';
import { POSITION_TO_GATES } from '../game/constants';
import { T7_DIAGONAL_GATES } from '../training/tasks/T7_diagonal_gates';
import { validateMove } from '../training/validateMove';

describe('T7_DIAGONAL_GATES', () => {
  it('POSITION_TO_GATES.H contains the expected connected gates', () => {
    const hGates = POSITION_TO_GATES['H'];
    expect(hGates).toEqual(expect.arrayContaining([2, 5, 6, 9]));
    expect(hGates.length).toBe(4);
  });

  it('initialState has trainingMode=true and currentPlayer=black', () => {
    const state = T7_DIAGONAL_GATES.initialState;
    expect(state.trainingMode).toBe(true);
    expect(state.currentPlayer).toBe('black');
  });

  it('expected gate (5) is connected to Position H', () => {
    const step = T7_DIAGONAL_GATES.steps[0];
    if (!step || step.kind !== 'user_move') throw new Error('Expected user_move step');
    expect(step.expected.positioning).toBe('H');
    if (step.expected.build.type === 'massive') {
      const correctGate = step.expected.build.gate;
      expect(POSITION_TO_GATES['H']).toContain(correctGate);
    }
  });

  it('correct move (H, massive, gate 5) validates as true', () => {
    const state = T7_DIAGONAL_GATES.initialState;
    const step = T7_DIAGONAL_GATES.steps[0];
    if (!step || step.kind !== 'user_move') throw new Error('Expected user_move step');

    const afterSelect = selectPosition(state, 'H');
    const afterBuild = applyMassiveBuild(afterSelect, 5);
    const lastRecord = afterBuild.history[afterBuild.history.length - 1];
    expect(lastRecord).toBeDefined();
    expect(validateMove(lastRecord!, step.expected)).toBe(true);
  });

  it('non-connected gate (gate 1 is not connected to H) does not validate', () => {
    const state = T7_DIAGONAL_GATES.initialState;
    const step = T7_DIAGONAL_GATES.steps[0];
    if (!step || step.kind !== 'user_move') throw new Error('Expected user_move step');

    // Gate 1 is not in POSITION_TO_GATES.H
    expect(POSITION_TO_GATES['H']).not.toContain(1);

    const afterSelect = selectPosition(state, 'H');
    // Gate 1 is not connected to H, so applyMassiveBuild with gate 1 should not match
    // In engine, applying massive build to non-connected gate may be rejected or produce wrong record
    const afterBuild = applyMassiveBuild(afterSelect, 1);
    const lastRecord = afterBuild.history[afterBuild.history.length - 1];
    if (lastRecord) {
      expect(validateMove(lastRecord, step.expected)).toBe(false);
    } else {
      // No record means the move was rejected — also correct behavior
      expect(lastRecord).toBeUndefined();
    }
  });

  it('non-H position (position A) does not validate', () => {
    const state = T7_DIAGONAL_GATES.initialState;
    const step = T7_DIAGONAL_GATES.steps[0];
    if (!step || step.kind !== 'user_move') throw new Error('Expected user_move step');

    const afterSelect = selectPosition(state, 'A');
    const afterBuild = applyMassiveBuild(afterSelect, 1);
    const lastRecord = afterBuild.history[afterBuild.history.length - 1];
    expect(lastRecord).toBeDefined();
    expect(validateMove(lastRecord!, step.expected)).toBe(false);
  });

  it('wrong gate connected to H (gate 2 is connected but not expected) does not validate', () => {
    const state = T7_DIAGONAL_GATES.initialState;
    const step = T7_DIAGONAL_GATES.steps[0];
    if (!step || step.kind !== 'user_move') throw new Error('Expected user_move step');

    // Gate 2 is connected to H but expected is gate 5
    expect(POSITION_TO_GATES['H']).toContain(2);

    const afterSelect = selectPosition(state, 'H');
    const afterBuild = applyMassiveBuild(afterSelect, 2);
    const lastRecord = afterBuild.history[afterBuild.history.length - 1];
    expect(lastRecord).toBeDefined();
    expect(validateMove(lastRecord!, step.expected)).toBe(false);
  });
});
