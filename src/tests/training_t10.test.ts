import { describe, it, expect } from 'vitest';
import { T10_DEFENSIVE_BUILD } from '../training/tasks/T10_defensive_build';
import { TRAINING_TASKS } from '../training/tasks/index';
import { validateMove } from '../training/validateMove';
import { canCapturePosition } from '../game/capture';
import { selectPosition, applyMassiveBuild, applySelectiveBuild } from '../game/engine';

describe('T10_defensive_build', () => {
  const task = T10_DEFENSIVE_BUILD;
  const state = task.initialState;

  // ── Initial state — Position owners ────────────────────────────────────

  it('Position E owner = black in initialState', () => {
    expect(state.positions['E']?.owner).toBe('black');
  });

  it('All other positions owner = null initially', () => {
    const others = ['A','B','C','D','F','G','H','I','J','K','L','M'] as const;
    for (const pid of others) {
      expect(state.positions[pid]?.owner).toBeNull();
    }
  });

  // ── Initial state — Gate 2 ────────────────────────────────────────────

  it('Gate 2 largeSlots[1].owner = white', () => {
    const gate2 = state.gates[2];
    expect(gate2).toBeDefined();
    expect(gate2!.largeSlots[1]).toMatchObject({ size: 'large', owner: 'white' });
  });

  it('Gate 2 largeSlots[0] = null', () => {
    const gate2 = state.gates[2];
    expect(gate2!.largeSlots[0]).toBeNull();
  });

  it('Gate 2 middleSlots are all null', () => {
    const gate2 = state.gates[2];
    for (const s of gate2!.middleSlots) {
      expect(s).toBeNull();
    }
  });

  it('Gate 2 smallSlots are all null', () => {
    const gate2 = state.gates[2];
    for (const s of gate2!.smallSlots) {
      expect(s).toBeNull();
    }
  });

  // ── Initial state — Gate 4 ────────────────────────────────────────────

  it('Gate 4 is all null initially', () => {
    const gate4 = state.gates[4];
    expect(gate4).toBeDefined();
    const allNull = [
      ...gate4!.largeSlots,
      ...gate4!.middleSlots,
      ...gate4!.smallSlots,
    ].every((s) => s === null);
    expect(allNull).toBe(true);
  });

  // ── Initial state — game status ───────────────────────────────────────

  it('currentPlayer = black', () => {
    expect(state.currentPlayer).toBe('black');
  });

  it('moveNumber = 5', () => {
    expect(state.moveNumber).toBe(5);
  });

  it('cpuPlayer = white', () => {
    expect(state.cpuPlayer).toBe('white');
  });

  it('initial gameEnded = false', () => {
    expect(state.gameEnded).toBe(false);
  });

  // ── Initial canCapturePosition ────────────────────────────────────────

  it('initial canCapturePosition(state, white, E) === true', () => {
    // White threatens E: Gate 2 has white Large (total=64), all others have total=0
    // mostBuilt = [Gate 2], white dominates → playerWins(white)=1 > opponentWins=0
    expect(canCapturePosition(state, 'white', 'E')).toBe(true);
  });

  it('initial canCapturePosition(state, black, E) === false', () => {
    // E is already black-owned, so black cannot capture own position
    expect(canCapturePosition(state, 'black', 'E')).toBe(false);
  });

  // ── selectPosition ────────────────────────────────────────────────────

  it('selectPosition(initial, E) sets selectedPosition = E', () => {
    const s1 = selectPosition(state, 'E');
    expect(s1.selectedPosition).toBe('E');
  });

  // ── E,m(4) correct move ───────────────────────────────────────────────

  it('after E,m(4): history.length = 1', () => {
    const s1 = selectPosition(state, 'E');
    const s2 = applyMassiveBuild(s1, 4);
    expect(s2.history).toHaveLength(1);
  });

  it('after E,m(4): Position E owner = black', () => {
    const s1 = selectPosition(state, 'E');
    const s2 = applyMassiveBuild(s1, 4);
    expect(s2.positions['E']?.owner).toBe('black');
  });

  it('after E,m(4): Gate 4 largeSlots[1].owner = black', () => {
    const s1 = selectPosition(state, 'E');
    const s2 = applyMassiveBuild(s1, 4);
    expect(s2.gates[4]!.largeSlots[1]).toMatchObject({ size: 'large', owner: 'black' });
  });

  it('after E,m(4): Gate 2 is unchanged', () => {
    const s1 = selectPosition(state, 'E');
    const s2 = applyMassiveBuild(s1, 4);
    expect(s2.gates[2]!.largeSlots[1]).toMatchObject({ size: 'large', owner: 'white' });
    expect(s2.gates[2]!.largeSlots[0]).toBeNull();
  });

  it('after E,m(4): canCapturePosition(state, white, E) === false', () => {
    const s1 = selectPosition(state, 'E');
    const s2 = applyMassiveBuild(s1, 4);
    // Gate 2: white (total=64) / Gate 4: black (total=64) → tie → white cannot capture
    expect(canCapturePosition(s2, 'white', 'E')).toBe(false);
  });

  it('after E,m(4): gameEnded = false', () => {
    const s1 = selectPosition(state, 'E');
    const s2 = applyMassiveBuild(s1, 4);
    expect(s2.gameEnded).toBe(false);
  });

  it('after E,m(4): winner = null', () => {
    const s1 = selectPosition(state, 'E');
    const s2 = applyMassiveBuild(s1, 4);
    expect(s2.winner).toBeNull();
  });

  it('after E,m(4): history[0] has moveNumber=5, player=black', () => {
    const s1 = selectPosition(state, 'E');
    const s2 = applyMassiveBuild(s1, 4);
    const rec = s2.history[0];
    expect(rec).toBeDefined();
    expect(rec!.moveNumber).toBe(5);
    expect(rec!.player).toBe('black');
  });

  it('after E,m(4): history[0] has positioning=E, build.type=massive, build.gate=4', () => {
    const s1 = selectPosition(state, 'E');
    const s2 = applyMassiveBuild(s1, 4);
    const rec = s2.history[0];
    expect(rec!.positioning).toBe('E');
    expect(rec!.build.type).toBe('massive');
    if (rec!.build.type === 'massive') {
      expect(rec!.build.gate).toBe(4);
    }
  });

  // ── validateMove: correct ─────────────────────────────────────────────

  it('isCorrectMove: E,m(4) validates as correct', () => {
    const step = task.steps[0];
    if (!step || step.kind !== 'user_move') throw new Error('step 0 is not user_move');
    const s1 = selectPosition(state, 'E');
    const s2 = applyMassiveBuild(s1, 4);
    const rec = s2.history[s2.history.length - 1];
    expect(rec).toBeDefined();
    expect(validateMove(rec!, step.expected)).toBe(true);
  });

  // ── Wrong moves — defense failure ─────────────────────────────────────

  it('E,s(2,4) — white can still capture E (selective does not add enough value)', () => {
    // Selective build adds middle assets, not large → Gate 4 total much less than 64
    // so Gate 2 remains the only mostBuilt, white dominates → can still capture
    const s1 = selectPosition(state, 'E');
    const s2 = applySelectiveBuild(s1, [2, 4]);
    expect(canCapturePosition(s2, 'white', 'E')).toBe(true);
  });

  it('E,s(4,6) — white can still capture E', () => {
    const s1 = selectPosition(state, 'E');
    const s2 = applySelectiveBuild(s1, [4, 6]);
    expect(canCapturePosition(s2, 'white', 'E')).toBe(true);
  });

  it('E,m(4) — validateMove returns true (correct answer)', () => {
    const step = task.steps[0];
    if (!step || step.kind !== 'user_move') throw new Error('step 0 is not user_move');
    const s1 = selectPosition(state, 'E');
    const s2 = applyMassiveBuild(s1, 4);
    const rec = s2.history[s2.history.length - 1];
    expect(validateMove(rec!, step.expected)).toBe(true);
  });

  it('E,m(6) — defense numerically succeeds but isCorrectMove is false', () => {
    const step = task.steps[0];
    if (!step || step.kind !== 'user_move') throw new Error('step 0 is not user_move');
    const s1 = selectPosition(state, 'E');
    const s2 = applyMassiveBuild(s1, 6);
    const rec = s2.history[s2.history.length - 1];
    expect(rec).toBeDefined();
    // Gate 6 also has total=64 black → defense works, but wrong gate
    expect(canCapturePosition(s2, 'white', 'E')).toBe(false);
    expect(validateMove(rec!, step.expected)).toBe(false);
  });

  it('E,m(2) — defense numerically succeeds but isCorrectMove is false', () => {
    const step = task.steps[0];
    if (!step || step.kind !== 'user_move') throw new Error('step 0 is not user_move');
    const s1 = selectPosition(state, 'E');
    const s2 = applyMassiveBuild(s1, 2);
    const rec = s2.history[s2.history.length - 1];
    expect(rec).toBeDefined();
    // Gate 2 now has both large slots (white at [1], black at [0]) → black dominates Gate 2 by value
    // Gate 2 total = 128, other gates = 0 → mostBuilt = [Gate 2], black dominates → white cannot capture
    expect(canCapturePosition(s2, 'white', 'E')).toBe(false);
    expect(validateMove(rec!, step.expected)).toBe(false);
  });

  // ── Task registration ─────────────────────────────────────────────────

  it('T10_DEFENSIVE_BUILD is registered in TRAINING_TASKS', () => {
    const found = TRAINING_TASKS.find((t) => t.id === 'T10_defensive_build');
    expect(found).toBeDefined();
  });

  it('task has 1 step: user_move', () => {
    expect(task.steps).toHaveLength(1);
    expect(task.steps[0]?.kind).toBe('user_move');
  });
});
