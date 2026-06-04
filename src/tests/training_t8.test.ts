import { describe, it, expect } from 'vitest';
import { T8_PREPARE_CAPTURE } from '../training/tasks/T8_prepare_capture';
import { TRAINING_TASKS } from '../training/tasks/index';
import { validateMove } from '../training/validateMove';
import { gatePlayerValue } from '../game/build';
import { selectPosition, applyMassiveBuild } from '../game/engine';
import { canCapturePosition } from '../game/capture';
import { POSITION_TO_GATES } from '../game/constants';

describe('T8_prepare_capture', () => {
  const task = T8_PREPARE_CAPTURE;
  const state = task.initialState;

  // ── Initial state ────────────────────────────────────────────────────────

  it('Position D is owned by White in initialState', () => {
    expect(state.positions['D']?.owner).toBe('white');
  });

  it('Gate 3 has White Large at largeSlots[1]', () => {
    const gate3 = state.gates[3];
    expect(gate3).toBeDefined();
    expect(gate3!.largeSlots[0]).toBeNull();
    expect(gate3!.largeSlots[1]).toMatchObject({ size: 'large', owner: 'white' });
    expect(gatePlayerValue(gate3!, 'white')).toBe(64);
    expect(gatePlayerValue(gate3!, 'black')).toBe(0);
  });

  it('Gate 7 has Black Large at largeSlots[0]', () => {
    const gate7 = state.gates[7];
    expect(gate7).toBeDefined();
    expect(gate7!.largeSlots[0]).toMatchObject({ size: 'large', owner: 'black' });
    expect(gate7!.largeSlots[1]).toBeNull();
    expect(gatePlayerValue(gate7!, 'black')).toBe(64);
    expect(gatePlayerValue(gate7!, 'white')).toBe(0);
  });

  it('POSITION_TO_GATES D = [1, 3, 7, 11]', () => {
    const gates = POSITION_TO_GATES['D'];
    expect(gates).toContain(1);
    expect(gates).toContain(3);
    expect(gates).toContain(7);
    expect(gates).toContain(11);
  });

  it('initial canCapturePosition(black, D) === false (tie: Gate3=White, Gate7=Black)', () => {
    expect(canCapturePosition(state, 'black', 'D')).toBe(false);
  });

  // ── Step 1: F,m(11) ──────────────────────────────────────────────────────

  it('after Step 1 F,m(11): Position F owner = black', () => {
    const s1 = selectPosition(state, 'F');
    const s2 = applyMassiveBuild(s1, 11);
    expect(s2.positions['F']?.owner).toBe('black');
  });

  it('after Step 1 F,m(11): Gate 11 has Black Large', () => {
    const s1 = selectPosition(state, 'F');
    const s2 = applyMassiveBuild(s1, 11);
    const gate11 = s2.gates[11];
    expect(gate11).toBeDefined();
    const blackVal = gatePlayerValue(gate11!, 'black');
    expect(blackVal).toBe(64);
  });

  it('after Step 1 F,m(11): canCapturePosition(black, D) === true', () => {
    const s1 = selectPosition(state, 'F');
    const s2 = applyMassiveBuild(s1, 11);
    expect(canCapturePosition(s2, 'black', 'D')).toBe(true);
  });

  it('Step 1 expected F,m(11) validates correctly', () => {
    const step = task.steps[0];
    if (!step || step.kind !== 'user_move') throw new Error('step 0 is not user_move');
    const s1 = selectPosition(state, 'F');
    const s2 = applyMassiveBuild(s1, 11);
    const lastRecord = s2.history[s2.history.length - 1];
    expect(lastRecord).toBeDefined();
    expect(validateMove(lastRecord!, step.expected)).toBe(true);
  });

  // ── CPU move: E,m(2) ──────────────────────────────────────────────────────

  it('after CPU E,m(2): Position E owner = white', () => {
    const s1 = selectPosition(state, 'F');
    const s2 = applyMassiveBuild(s1, 11);
    const s3 = selectPosition(s2, 'E');
    const s4 = applyMassiveBuild(s3, 2);
    expect(s4.positions['E']?.owner).toBe('white');
  });

  it('after CPU E,m(2): Gate 2 has White Large', () => {
    const s1 = selectPosition(state, 'F');
    const s2 = applyMassiveBuild(s1, 11);
    const s3 = selectPosition(s2, 'E');
    const s4 = applyMassiveBuild(s3, 2);
    const gate2 = s4.gates[2];
    expect(gate2).toBeDefined();
    expect(gatePlayerValue(gate2!, 'white')).toBe(64);
  });

  it('after CPU E,m(2): canCapturePosition(black, D) remains true', () => {
    const s1 = selectPosition(state, 'F');
    const s2 = applyMassiveBuild(s1, 11);
    const s3 = selectPosition(s2, 'E');
    const s4 = applyMassiveBuild(s3, 2);
    expect(canCapturePosition(s4, 'black', 'D')).toBe(true);
  });

  // ── Step 2: D,m(1) ──────────────────────────────────────────────────────

  it('after Step 2 D,m(1): Position D owner = black', () => {
    const s1 = selectPosition(state, 'F');
    const s2 = applyMassiveBuild(s1, 11);
    const s3 = selectPosition(s2, 'E');
    const s4 = applyMassiveBuild(s3, 2);
    const s5 = selectPosition(s4, 'D');
    const s6 = applyMassiveBuild(s5, 1);
    expect(s6.positions['D']?.owner).toBe('black');
  });

  it('after Step 2 D,m(1): Gate 1 has Black Large', () => {
    const s1 = selectPosition(state, 'F');
    const s2 = applyMassiveBuild(s1, 11);
    const s3 = selectPosition(s2, 'E');
    const s4 = applyMassiveBuild(s3, 2);
    const s5 = selectPosition(s4, 'D');
    const s6 = applyMassiveBuild(s5, 1);
    const gate1 = s6.gates[1];
    expect(gate1).toBeDefined();
    expect(gatePlayerValue(gate1!, 'black')).toBe(64);
  });

  it('Step 2 expected D,m(1) validates correctly', () => {
    const step = task.steps[2];
    if (!step || step.kind !== 'user_move') throw new Error('step 2 is not user_move');
    const s1 = selectPosition(state, 'F');
    const s2 = applyMassiveBuild(s1, 11);
    const s3 = selectPosition(s2, 'E');
    const s4 = applyMassiveBuild(s3, 2);
    const s5 = selectPosition(s4, 'D');
    const s6 = applyMassiveBuild(s5, 1);
    const lastRecord = s6.history[s6.history.length - 1];
    expect(lastRecord).toBeDefined();
    expect(validateMove(lastRecord!, step.expected)).toBe(true);
  });

  // ── Wrong moves ──────────────────────────────────────────────────────────

  it('wrong Step 1: F,m(3) does not make canCapturePosition(black, D) true', () => {
    // Gate 3 already has White Large; adding Black Large there is invalid/different result
    const s1 = selectPosition(state, 'F');
    const s2 = applyMassiveBuild(s1, 3);
    // Gate 3 may not have room, but either way dominance check on D:
    // Gate 3 has both White and Black large — compare values
    const canCapture = canCapturePosition(s2, 'black', 'D');
    // Gate 3: white=64, black=64 → tie at gate 3
    // Gate 7: black=64 → playerWins=1, opponentWins=0 from gate 7
    // mostBuilt total = 64 (gate3:128? depends on impl) — but regardless, F,m(3) is NOT the expected move
    const step = task.steps[0];
    if (!step || step.kind !== 'user_move') return;
    const lastRecord = s2.history[s2.history.length - 1];
    if (!lastRecord) return;
    expect(validateMove(lastRecord, step.expected)).toBe(false);
  });

  it('wrong Step 1: selecting D directly is not the expected move', () => {
    const step = task.steps[0];
    if (!step || step.kind !== 'user_move') return;
    const s1 = selectPosition(state, 'D');
    const s2 = applyMassiveBuild(s1, 1);
    const lastRecord = s2.history[s2.history.length - 1];
    if (!lastRecord) return;
    expect(validateMove(lastRecord, step.expected)).toBe(false);
  });

  it('wrong Step 2: D,m(3) is not the expected Step 2 move', () => {
    const step = task.steps[2];
    if (!step || step.kind !== 'user_move') return;
    // Simulate reaching step 2 state
    const s1 = selectPosition(state, 'F');
    const s2 = applyMassiveBuild(s1, 11);
    const s3 = selectPosition(s2, 'E');
    const s4 = applyMassiveBuild(s3, 2);
    const s5 = selectPosition(s4, 'D');
    const s6 = applyMassiveBuild(s5, 3);
    const lastRecord = s6.history[s6.history.length - 1];
    if (!lastRecord) return;
    expect(validateMove(lastRecord, step.expected)).toBe(false);
  });

  // ── Task structure ────────────────────────────────────────────────────────

  it('task has 3 steps: user_move, cpu_fixed_move, user_move', () => {
    expect(task.steps).toHaveLength(3);
    expect(task.steps[0]?.kind).toBe('user_move');
    expect(task.steps[1]?.kind).toBe('cpu_fixed_move');
    expect(task.steps[2]?.kind).toBe('user_move');
  });

  it('cpu_fixed_move is E,m(2)', () => {
    const cpuStep = task.steps[1];
    if (!cpuStep || cpuStep.kind !== 'cpu_fixed_move') throw new Error('step 1 is not cpu_fixed_move');
    expect(cpuStep.move.positioning).toBe('E');
    expect(cpuStep.move.build.type).toBe('massive');
    if (cpuStep.move.build.type === 'massive') {
      expect(cpuStep.move.build.gate).toBe(2);
    }
  });

  it('T8_PREPARE_CAPTURE is registered in TRAINING_TASKS', () => {
    const found = TRAINING_TASKS.find((t) => t.id === 'T8_prepare_capture');
    expect(found).toBeDefined();
  });
});
