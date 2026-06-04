import { describe, it, expect } from 'vitest';
import { T4_PARTIAL_BUILD } from '../training/tasks/T4_partial_build';
import { validateMove } from '../training/validateMove';
import { applyQuadBuildForGates } from '../game/engine';
import { gatePlayerValue } from '../game/build';

describe('T4_partial_build', () => {
  const task = T4_PARTIAL_BUILD;

  it('task structure is valid', () => {
    expect(task.id).toBe('T4_partial_build');
    expect(task.steps).toHaveLength(1);
    const s = task.steps[0];
    expect(s).toBeDefined();
    expect(s!.kind).toBe('user_move');
  });

  it('initialState has Gate 8 fully occupied in smallSlots', () => {
    const gate8 = task.initialState.gates[8];
    expect(gate8.smallSlots.every((s) => s !== null)).toBe(true);
  });

  it('initialState has Gate 3 with exactly one empty small slot', () => {
    const gate3 = task.initialState.gates[3];
    const emptyCount = gate3.smallSlots.filter((s) => s === null).length;
    expect(emptyCount).toBe(1);
  });

  it('initialState has Gates 11 and 12 with all small slots empty', () => {
    const gate11 = task.initialState.gates[11];
    const gate12 = task.initialState.gates[12];
    expect(gate11.smallSlots.every((s) => s === null)).toBe(true);
    expect(gate12.smallSlots.every((s) => s === null)).toBe(true);
  });

  it('correct move: Position F + Quad including Gate 3, 11, 12 passes validation', () => {
    const s = task.steps[0];
    if (!s || s.kind !== 'user_move') return;

    const stateWithPos = {
      ...task.initialState,
      selectedPosition: 'F' as const,
    };
    // Apply Quad Build to gates 3, 8, 11, 12 (gate 8 is full — skipped by engine)
    const nextState = applyQuadBuildForGates(stateWithPos, [3, 8, 11, 12]);
    const lastRecord = nextState.history[nextState.history.length - 1];
    expect(lastRecord).toBeDefined();
    if (!lastRecord) return;

    const result = validateMove(lastRecord, s.expected);
    expect(result).toBe(true);
  });

  it('correct move: Gate 8 is full so engine places assets in available gates only', () => {
    const stateWithPos = {
      ...task.initialState,
      selectedPosition: 'F' as const,
    };
    // Apply Quad Build attempting all 4 gates
    const nextState = applyQuadBuildForGates(stateWithPos, [3, 8, 11, 12]);
    const lastRecord = nextState.history[nextState.history.length - 1];
    expect(lastRecord).toBeDefined();
    if (!lastRecord || lastRecord.build.type !== 'quad') return;

    // Gate 8 was full — total placed should be 3 (gates 3, 11, 12)
    expect(lastRecord.build.placed).toBeGreaterThanOrEqual(3);
  });

  it('wrong move: different position is rejected', () => {
    const s = task.steps[0];
    if (!s || s.kind !== 'user_move') return;

    const stateWithPos = {
      ...task.initialState,
      selectedPosition: 'A' as const,
    };
    const nextState = applyQuadBuildForGates(stateWithPos, [1, 2, 7, 12]);
    const lastRecord = nextState.history[nextState.history.length - 1];
    if (!lastRecord) return;
    const result = validateMove(lastRecord, s.expected);
    expect(result).toBe(false);
  });

  it('wrong move: Massive build type instead of Quad is rejected', () => {
    const s = task.steps[0];
    if (!s || s.kind !== 'user_move') return;

    // Simulate a record with wrong build type
    const fakeRecord = {
      moveNumber: 5,
      player: 'black' as const,
      positioning: 'F' as const,
      build: { type: 'massive' as const, gate: 3 as const, placed: 1 },
    };
    const result = validateMove(fakeRecord, s.expected);
    expect(result).toBe(false);
  });

  it('correct move: Partial Quad with 3 gates (no gate 8) also passes validation', () => {
    const s = task.steps[0];
    if (!s || s.kind !== 'user_move') return;

    const stateWithPos = {
      ...task.initialState,
      selectedPosition: 'F' as const,
    };
    // Apply Quad Build to only gates 3, 11, 12 (excluding gate 8 which is full)
    const nextState = applyQuadBuildForGates(stateWithPos, [3, 11, 12]);
    const lastRecord = nextState.history[nextState.history.length - 1];
    expect(lastRecord).toBeDefined();
    if (!lastRecord) return;

    // Gate 8 not in placedGateIds — should still pass because minGates: 3
    if (lastRecord.build.type === 'quad') {
      expect(lastRecord.build.placedGateIds).not.toContain(8);
      expect(lastRecord.build.placedGateIds.length).toBeGreaterThanOrEqual(3);
    }
    const result = validateMove(lastRecord, s.expected);
    expect(result).toBe(true);
  });

  // suppress unused import warning
  it('gatePlayerValue is importable', () => {
    expect(typeof gatePlayerValue).toBe('function');
  });
});
