import { describe, it, expect } from 'vitest';
import { T1_BUILD_BASICS } from '../training/tasks/T1_build_basics';
import { validateMove } from '../training/validateMove';
import { applyFixedCpuMove } from '../training/applyFixedCpuMove';
import { selectPosition, applyMassiveBuild, applySelectiveBuild, applyQuadBuild, applyQuadBuildForGates } from '../game/engine';

describe('T1 Build Basics — initial state', () => {
  it('trainingMode is true, currentPlayer is black, moveNumber is 1', () => {
    const s = T1_BUILD_BASICS.initialState;
    expect(s.trainingMode).toBe(true);
    expect(s.currentPlayer).toBe('black');
    expect(s.moveNumber).toBe(1);
  });
});

describe('T1 Build Basics — steps order', () => {
  it('has 5 steps in correct order', () => {
    const { steps } = T1_BUILD_BASICS;
    expect(steps.length).toBe(5);
    expect(steps[0]?.kind).toBe('user_move');
    expect(steps[1]?.kind).toBe('cpu_fixed_move');
    expect(steps[2]?.kind).toBe('user_move');
    expect(steps[3]?.kind).toBe('cpu_fixed_move');
    expect(steps[4]?.kind).toBe('user_move');
  });

  it('user steps have correct expected moves', () => {
    const s0 = T1_BUILD_BASICS.steps[0];
    const s2 = T1_BUILD_BASICS.steps[2];
    const s4 = T1_BUILD_BASICS.steps[4];
    expect(s0?.kind).toBe('user_move');
    expect(s2?.kind).toBe('user_move');
    expect(s4?.kind).toBe('user_move');
    if (s0?.kind === 'user_move') {
      expect(s0.expected.positioning).toBe('G');
      expect(s0.expected.build.type).toBe('massive');
      if (s0.expected.build.type === 'massive') expect(s0.expected.build.gate).toBe(7);
    }
    if (s2?.kind === 'user_move') {
      expect(s2.expected.positioning).toBe('M');
      expect(s2.expected.build.type).toBe('selective');
    }
    if (s4?.kind === 'user_move') {
      expect(s4.expected.positioning).toBe('A');
      expect(s4.expected.build.type).toBe('quad');
    }
  });
});

describe('validateMove — massive', () => {
  it('G,m(7) is correct', () => {
    const state = selectPosition(T1_BUILD_BASICS.initialState, 'G');
    const next = applyMassiveBuild(state, 7);
    const record = next.history[next.history.length - 1];
    expect(record).toBeDefined();
    expect(validateMove(record!, { positioning: 'G', build: { type: 'massive', gate: 7 } })).toBe(true);
  });

  it('G,m(1) is incorrect', () => {
    const state = selectPosition(T1_BUILD_BASICS.initialState, 'G');
    const next = applyMassiveBuild(state, 1);
    const record = next.history[next.history.length - 1];
    expect(record).toBeDefined();
    expect(validateMove(record!, { positioning: 'G', build: { type: 'massive', gate: 7 } })).toBe(false);
  });
});

describe('validateMove — selective order-insensitive', () => {
  function setupAfterM2() {
    let state = T1_BUILD_BASICS.initialState;
    state = selectPosition(state, 'G');
    state = applyMassiveBuild(state, 7);
    state = applyFixedCpuMove(state, { positioning: 'K', build: { type: 'massive', gate: 4 } });
    return state;
  }

  it('M,s(6,8) is correct', () => {
    let state = setupAfterM2();
    state = selectPosition(state, 'M');
    const next = applySelectiveBuild(state, [6, 8]);
    const record = next.history[next.history.length - 1];
    expect(record).toBeDefined();
    expect(validateMove(record!, { positioning: 'M', build: { type: 'selective', gates: [6, 8] } })).toBe(true);
  });

  it('M,s(8,6) reversed is also correct', () => {
    let state = setupAfterM2();
    state = selectPosition(state, 'M');
    const next = applySelectiveBuild(state, [8, 6]);
    const record = next.history[next.history.length - 1];
    expect(record).toBeDefined();
    expect(validateMove(record!, { positioning: 'M', build: { type: 'selective', gates: [6, 8] } })).toBe(true);
  });
});

describe('applyFixedCpuMove — K,m(4)', () => {
  it('applies deterministically after M1', () => {
    let state = T1_BUILD_BASICS.initialState;
    state = selectPosition(state, 'G');
    state = applyMassiveBuild(state, 7);

    const step1 = T1_BUILD_BASICS.steps[1];
    expect(step1?.kind).toBe('cpu_fixed_move');
    if (step1?.kind !== 'cpu_fixed_move') return;

    const after = applyFixedCpuMove(state, step1.move);
    expect(after.moveNumber).toBe(3);
    expect(after.currentPlayer).toBe('black');
    const cpuRecord = after.history[after.history.length - 1];
    expect(cpuRecord).toBeDefined();
    expect(cpuRecord!.positioning).toBe('K');
    expect(cpuRecord!.build.type).toBe('massive');
    if (cpuRecord!.build.type === 'massive') expect(cpuRecord!.build.gate).toBe(4);
  });
});

describe('validateMove — quad', () => {
  function setupBeforeA() {
    let state = T1_BUILD_BASICS.initialState;
    state = selectPosition(state, 'G');
    state = applyMassiveBuild(state, 7);
    state = applyFixedCpuMove(state, { positioning: 'K', build: { type: 'massive', gate: 4 } });
    state = selectPosition(state, 'M');
    state = applySelectiveBuild(state, [6, 8]);
    state = applyFixedCpuMove(state, { positioning: 'L', build: { type: 'massive', gate: 9 } });
    state = selectPosition(state, 'A');
    return state;
  }

  it('A,q with all 4 connected gates [1,2,7,12] is correct', () => {
    const state = setupBeforeA();
    const next = applyQuadBuild(state);
    const record = next.history[next.history.length - 1];
    expect(record).toBeDefined();
    expect(validateMove(record!, { positioning: 'A', build: { type: 'quad', minGates: 4 } })).toBe(true);
  });

  it('A,q with only 1 gate selected is incorrect', () => {
    const state = setupBeforeA();
    const next = applyQuadBuildForGates(state, [1]);
    const record = next.history[next.history.length - 1];
    expect(record).toBeDefined();
    expect(validateMove(record!, { positioning: 'A', build: { type: 'quad', minGates: 4 } })).toBe(false);
  });

  it('A,q with only 3 gates selected is incorrect', () => {
    const state = setupBeforeA();
    const next = applyQuadBuildForGates(state, [1, 2, 7]);
    const record = next.history[next.history.length - 1];
    expect(record).toBeDefined();
    expect(validateMove(record!, { positioning: 'A', build: { type: 'quad', minGates: 4 } })).toBe(false);
  });
});
