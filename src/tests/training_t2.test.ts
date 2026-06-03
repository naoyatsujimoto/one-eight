import { describe, it, expect } from 'vitest';
import type { GateId } from '../game/types';
import { T2_CAPTURE_BUILD } from '../training/tasks/T2_capture_build';
import { validateMove } from '../training/validateMove';
import { canCapturePosition } from '../game/capture';
import { selectPosition, applyMassiveBuild } from '../game/engine';

describe('T2 Capture and Build — initial state', () => {
  it('has trainingMode true, currentPlayer black, moveNumber 3', () => {
    const s = T2_CAPTURE_BUILD.initialState;
    expect(s.trainingMode).toBe(true);
    expect(s.currentPlayer).toBe('black');
    expect(s.moveNumber).toBe(3);
  });

  it('Position E owner is white', () => {
    const s = T2_CAPTURE_BUILD.initialState;
    expect(s.positions.E.owner).toBe('white');
  });

  it('Gate 6 has black large asset', () => {
    const s = T2_CAPTURE_BUILD.initialState;
    const gate6 = s.gates[6];
    const hasBlackLarge = gate6.largeSlots.some(
      (slot) => slot !== null && slot.owner === 'black' && slot.size === 'large'
    );
    expect(hasBlackLarge).toBe(true);
  });

  it('cpuPlayer is white', () => {
    const s = T2_CAPTURE_BUILD.initialState;
    expect(s.cpuPlayer).toBe('white');
  });
});

describe('T2 Capture — canCapturePosition', () => {
  it('black can capture Position E (Gate 6 dominance)', () => {
    const s = T2_CAPTURE_BUILD.initialState;
    expect(canCapturePosition(s, 'black', 'E')).toBe(true);
  });
});

describe('T2 Capture and Build — step structure', () => {
  it('has 1 step of kind user_move', () => {
    const { steps } = T2_CAPTURE_BUILD;
    expect(steps.length).toBe(1);
    expect(steps[0]?.kind).toBe('user_move');
  });

  it('expected move is E,m(10)', () => {
    const step = T2_CAPTURE_BUILD.steps[0];
    expect(step?.kind).toBe('user_move');
    if (step?.kind !== 'user_move') return;
    expect(step.expected.positioning).toBe('E');
    expect(step.expected.build.type).toBe('massive');
    if (step.expected.build.type === 'massive') {
      expect(step.expected.build.gate).toBe(10);
    }
  });
});

describe('validateMove — T2 E,m(10)', () => {
  it('E,m(10) is correct', () => {
    const state = selectPosition(T2_CAPTURE_BUILD.initialState, 'E');
    const next = applyMassiveBuild(state, 10);
    const record = next.history[next.history.length - 1];
    expect(record).toBeDefined();
    expect(
      validateMove(record!, { positioning: 'E', build: { type: 'massive', gate: 10 } })
    ).toBe(true);
  });

  it('E,m(2) is incorrect', () => {
    const state = selectPosition(T2_CAPTURE_BUILD.initialState, 'E');
    const next = applyMassiveBuild(state, 2);
    const record = next.history[next.history.length - 1];
    expect(record).toBeDefined();
    expect(
      validateMove(record!, { positioning: 'E', build: { type: 'massive', gate: 10 } })
    ).toBe(false);
  });

  it('A,m(10) is incorrect — wrong position (Gate 10 not connected to A, engine rejects)', () => {
    // Position A connects to gates [1, 2, 7, 12]. Gate 10 is not in A's gates,
    // so engine.applyMassiveBuild returns state unchanged (no history record added).
    const state = selectPosition(T2_CAPTURE_BUILD.initialState, 'A');
    const next = applyMassiveBuild(state, 10);
    const record = next.history[next.history.length - 1];
    // Engine rejects the move — no record added, or record positioning is not E
    const isCorrect = record !== undefined &&
      validateMove(record, { positioning: 'E', build: { type: 'massive', gate: 10 } });
    expect(isCorrect).toBe(false);
  });
});

describe('T2 — E,q is incorrect (wrong build type)', () => {
  it('validateMove with quad build returns false for massive expected', () => {
    // Simulate a quad-type record
    const fakeRecord = {
      moveNumber: 3,
      player: 'black' as const,
      positioning: 'E' as const,
      build: { type: 'quad' as const, placedGateIds: [2, 4, 6, 10] as GateId[], placed: 4 },
    };
    expect(
      validateMove(fakeRecord, { positioning: 'E', build: { type: 'massive', gate: 10 } })
    ).toBe(false);
  });
});
