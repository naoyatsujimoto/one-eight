import { describe, it, expect } from 'vitest';
import { T5_CAPTURE_TIE } from '../training/tasks/T5_capture_tie';
import { validateMove } from '../training/validateMove';
import { applyMassiveBuild } from '../game/engine';
import { canCapturePosition } from '../game/capture';
import { gatePlayerValue, gateTotalValue } from '../game/build';
import { POSITION_TO_GATES } from '../game/constants';

describe('T5_capture_tie', () => {
  const task = T5_CAPTURE_TIE;

  it('task structure is valid', () => {
    expect(task.id).toBe('T5_capture_tie');
    expect(task.steps).toHaveLength(1);
    const s = task.steps[0];
    expect(s).toBeDefined();
    expect(s!.kind).toBe('user_move');
  });

  it('Position K is owned by White in initialState', () => {
    const posK = task.initialState.positions['K'];
    expect(posK).toBeDefined();
    expect(posK!.owner).toBe('white');
  });

  it('Position K connects to 4 gates including Gate 4 and Gate 9', () => {
    const gates = POSITION_TO_GATES['K'];
    expect(gates).toContain(4);
    expect(gates).toContain(9);
    expect(gates).toContain(10);
    expect(gates).toContain(11);
  });

  it('Gate 4 has Black Large(64) — Black dominates', () => {
    const gate4 = task.initialState.gates[4];
    const blackVal = gatePlayerValue(gate4, 'black');
    const whiteVal = gatePlayerValue(gate4, 'white');
    expect(blackVal).toBe(64);
    expect(whiteVal).toBe(0);
    expect(gateTotalValue(gate4)).toBe(64);
  });

  it('Gate 9 has White Large(64) — White dominates', () => {
    const gate9 = task.initialState.gates[9];
    const blackVal = gatePlayerValue(gate9, 'black');
    const whiteVal = gatePlayerValue(gate9, 'white');
    expect(blackVal).toBe(0);
    expect(whiteVal).toBe(64);
    expect(gateTotalValue(gate9)).toBe(64);
  });

  it('most-built Gates (4 and 9) are tied at value 64', () => {
    const gate4 = task.initialState.gates[4];
    const gate9 = task.initialState.gates[9];
    expect(gateTotalValue(gate4)).toBe(gateTotalValue(gate9));
  });

  it('canCapturePosition(black, K) === false in initialState (tie blocks capture)', () => {
    const result = canCapturePosition(task.initialState, 'black', 'K');
    expect(result).toBe(false);
  });

  it('correct move: Position K + Massive Build to Gate 10 passes validation', () => {
    const s = task.steps[0];
    if (!s || s.kind !== 'user_move') return;

    const stateWithPos = { ...task.initialState, selectedPosition: 'K' as const };
    const nextState = applyMassiveBuild(stateWithPos, 10);
    const lastRecord = nextState.history[nextState.history.length - 1];
    expect(lastRecord).toBeDefined();
    if (!lastRecord) return;

    const result = validateMove(lastRecord, s.expected);
    expect(result).toBe(true);
  });

  it('direct Capture move on Position K is not the correct answer (must build first)', () => {
    // Capture would be selecting K with no build — but in ONE EIGHT you must build.
    // We verify that the expected move is a Build, not a pure capture.
    const s = task.steps[0];
    if (!s || s.kind !== 'user_move') return;
    expect(s.expected.build.type).toBe('massive');
    expect(s.expected.positioning).toBe('K');
  });

  it('wrong move: Massive to Gate 4 instead of Gate 10 is rejected', () => {
    const s = task.steps[0];
    if (!s || s.kind !== 'user_move') return;

    const stateWithPos = { ...task.initialState, selectedPosition: 'K' as const };
    const nextState = applyMassiveBuild(stateWithPos, 9);
    const lastRecord = nextState.history[nextState.history.length - 1];
    if (!lastRecord) return;
    const result = validateMove(lastRecord, s.expected);
    expect(result).toBe(false);
  });

  it('wrong move: different position is rejected', () => {
    const s = task.steps[0];
    if (!s || s.kind !== 'user_move') return;

    const stateWithPos = { ...task.initialState, selectedPosition: 'J' as const };
    const nextState = applyMassiveBuild(stateWithPos, 10);
    const lastRecord = nextState.history[nextState.history.length - 1];
    if (!lastRecord) return;
    const result = validateMove(lastRecord, s.expected);
    expect(result).toBe(false);
  });
});
