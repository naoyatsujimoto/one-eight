/**
 * Training T7 unit tests.
 *
 * T7_DIAGONAL_GATES:
 *   - POSITION_TO_GATES.H = [2, 5, 6, 9]
 *   - initialState has trainingMode=true, currentPlayer=black
 *   - expectedMove: positioning=H, build=massive, allowedGates=[2,5,6,9]
 *   - Gates 2, 5, 6, 9 are all connected to H -> all correct
 *   - Non-connected gate (e.g. gate 1) -> wrong
 *   - Non-H position -> wrong
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

  it('expected allowedGates contains all connected gates for Position H', () => {
    const step = T7_DIAGONAL_GATES.steps[0];
    if (!step || step.kind !== 'user_move') throw new Error('Expected user_move step');
    expect(step.expected.positioning).toBe('H');
    if (step.expected.build.type === 'massive') {
      const allowed = step.expected.build.allowedGates;
      expect(allowed).toBeDefined();
      expect(allowed).toEqual(expect.arrayContaining([2, 5, 6, 9]));
      expect(allowed!.length).toBe(4);
    }
  });

  it('correct move: H, massive, gate 2 validates as true', () => {
    const state = T7_DIAGONAL_GATES.initialState;
    const step = T7_DIAGONAL_GATES.steps[0];
    if (!step || step.kind !== 'user_move') throw new Error('Expected user_move step');
    const afterSelect = selectPosition(state, 'H');
    const afterBuild = applyMassiveBuild(afterSelect, 2);
    const lastRecord = afterBuild.history[afterBuild.history.length - 1];
    expect(lastRecord).toBeDefined();
    expect(validateMove(lastRecord!, step.expected)).toBe(true);
  });

  it('correct move: H, massive, gate 5 validates as true', () => {
    const state = T7_DIAGONAL_GATES.initialState;
    const step = T7_DIAGONAL_GATES.steps[0];
    if (!step || step.kind !== 'user_move') throw new Error('Expected user_move step');
    const afterSelect = selectPosition(state, 'H');
    const afterBuild = applyMassiveBuild(afterSelect, 5);
    const lastRecord = afterBuild.history[afterBuild.history.length - 1];
    expect(lastRecord).toBeDefined();
    expect(validateMove(lastRecord!, step.expected)).toBe(true);
  });

  it('correct move: H, massive, gate 6 validates as true', () => {
    const state = T7_DIAGONAL_GATES.initialState;
    const step = T7_DIAGONAL_GATES.steps[0];
    if (!step || step.kind !== 'user_move') throw new Error('Expected user_move step');
    const afterSelect = selectPosition(state, 'H');
    const afterBuild = applyMassiveBuild(afterSelect, 6);
    const lastRecord = afterBuild.history[afterBuild.history.length - 1];
    expect(lastRecord).toBeDefined();
    expect(validateMove(lastRecord!, step.expected)).toBe(true);
  });

  it('correct move: H, massive, gate 9 validates as true', () => {
    const state = T7_DIAGONAL_GATES.initialState;
    const step = T7_DIAGONAL_GATES.steps[0];
    if (!step || step.kind !== 'user_move') throw new Error('Expected user_move step');
    const afterSelect = selectPosition(state, 'H');
    const afterBuild = applyMassiveBuild(afterSelect, 9);
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
});
