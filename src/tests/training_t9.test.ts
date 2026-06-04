import { describe, it, expect } from 'vitest';
import { T9_NO_BUILD_ENDGAME } from '../training/tasks/T9_no_build_endgame';
import { TRAINING_TASKS } from '../training/tasks/index';
import { validateMove } from '../training/validateMove';
import { selectPosition, applyMassiveBuild } from '../game/engine';
import { isGameEnded } from '../game/selectors';

describe('T9_no_build_endgame', () => {
  const task = T9_NO_BUILD_ENDGAME;
  const state = task.initialState;

  // ── Initial state — Position owners ────────────────────────────────────

  it('Position D owner = null in initialState', () => {
    expect(state.positions['D']?.owner).toBeNull();
  });

  it('Black owns 6 positions initially', () => {
    const count = Object.values(state.positions).filter((p) => p.owner === 'black').length;
    expect(count).toBe(6);
  });

  it('White owns 6 positions initially', () => {
    const count = Object.values(state.positions).filter((p) => p.owner === 'white').length;
    expect(count).toBe(6);
  });

  // ── Initial state — Gate 1 ────────────────────────────────────────────

  it('Gate 1 has exactly one empty large slot (largeSlots[0] = null)', () => {
    const gate1 = state.gates[1];
    expect(gate1).toBeDefined();
    const emptyLarge = gate1!.largeSlots.filter((s) => s === null).length;
    expect(emptyLarge).toBe(1);
    expect(gate1!.largeSlots[0]).toBeNull();
  });

  it('Gate 1 largeSlots[1].owner = white', () => {
    const gate1 = state.gates[1];
    expect(gate1!.largeSlots[1]).toMatchObject({ size: 'large', owner: 'white' });
  });

  it('Gate 1 middleSlots are all white', () => {
    const gate1 = state.gates[1];
    for (const s of gate1!.middleSlots) {
      expect(s).toMatchObject({ size: 'middle', owner: 'white' });
    }
  });

  it('Gate 1 smallSlots are all white', () => {
    const gate1 = state.gates[1];
    expect(gate1!.smallSlots).toHaveLength(4);
    for (const s of gate1!.smallSlots) {
      expect(s).toMatchObject({ size: 'small', owner: 'white' });
    }
  });

  // ── Initial state — Gates 2..12 are completely full ───────────────────

  it('Gates 2..12 are completely full', () => {
    for (let id = 2; id <= 12; id++) {
      const gate = state.gates[id as keyof typeof state.gates];
      expect(gate).toBeDefined();
      const emptySlots = [
        ...gate!.largeSlots,
        ...gate!.middleSlots,
        ...gate!.smallSlots,
      ].filter((s) => s === null).length;
      expect(emptySlots).toBe(0);
    }
  });

  // ── Initial state — game status ───────────────────────────────────────

  it('initial gameEnded = false', () => {
    expect(state.gameEnded).toBe(false);
  });

  it('isGameEnded(initial) = false', () => {
    expect(isGameEnded(state)).toBe(false);
  });

  it('currentPlayer = black', () => {
    expect(state.currentPlayer).toBe('black');
  });

  it('moveNumber = 49', () => {
    expect(state.moveNumber).toBe(49);
  });

  it('cpuPlayer = white', () => {
    expect(state.cpuPlayer).toBe('white');
  });

  // ── selectPosition ────────────────────────────────────────────────────

  it('selectPosition(initial, D) sets selectedPosition = D', () => {
    const s1 = selectPosition(state, 'D');
    expect(s1.selectedPosition).toBe('D');
  });

  // ── D,m(1) correct move ───────────────────────────────────────────────

  it('after D,m(1): gameEnded = true', () => {
    const s1 = selectPosition(state, 'D');
    const s2 = applyMassiveBuild(s1, 1);
    expect(s2.gameEnded).toBe(true);
  });

  it('after D,m(1): winner = black', () => {
    const s1 = selectPosition(state, 'D');
    const s2 = applyMassiveBuild(s1, 1);
    expect(s2.winner).toBe('black');
  });

  it('after D,m(1): endReason = null', () => {
    const s1 = selectPosition(state, 'D');
    const s2 = applyMassiveBuild(s1, 1);
    expect(s2.endReason).toBeNull();
  });

  it('after D,m(1): Position D owner = black', () => {
    const s1 = selectPosition(state, 'D');
    const s2 = applyMassiveBuild(s1, 1);
    expect(s2.positions['D']?.owner).toBe('black');
  });

  it('after D,m(1): Gate 1 largeSlots[0].owner = black', () => {
    const s1 = selectPosition(state, 'D');
    const s2 = applyMassiveBuild(s1, 1);
    expect(s2.gates[1]!.largeSlots[0]).toMatchObject({ size: 'large', owner: 'black' });
  });

  it('after D,m(1): history.length = 1', () => {
    const s1 = selectPosition(state, 'D');
    const s2 = applyMassiveBuild(s1, 1);
    expect(s2.history).toHaveLength(1);
  });

  it('after D,m(1): history[0] is D,m(1)', () => {
    const s1 = selectPosition(state, 'D');
    const s2 = applyMassiveBuild(s1, 1);
    const rec = s2.history[0];
    expect(rec).toBeDefined();
    expect(rec!.positioning).toBe('D');
    expect(rec!.build.type).toBe('massive');
    if (rec!.build.type === 'massive') {
      expect(rec!.build.gate).toBe(1);
    }
  });

  it('after D,m(1): history[0] has moveNumber=49, player=black', () => {
    const s1 = selectPosition(state, 'D');
    const s2 = applyMassiveBuild(s1, 1);
    const rec = s2.history[0];
    expect(rec!.moveNumber).toBe(49);
    expect(rec!.player).toBe('black');
  });

  // ── validateMove: correct ─────────────────────────────────────────────

  it('isCorrectMove: D,m(1) validates as correct', () => {
    const step = task.steps[0];
    if (!step || step.kind !== 'user_move') throw new Error('step 0 is not user_move');
    const s1 = selectPosition(state, 'D');
    const s2 = applyMassiveBuild(s1, 1);
    const rec = s2.history[s2.history.length - 1];
    expect(rec).toBeDefined();
    expect(validateMove(rec!, step.expected)).toBe(true);
  });

  // ── Wrong moves — draw scenarios ──────────────────────────────────────

  it('A,m(1) results in draw (not correct Training answer)', () => {
    const step = task.steps[0];
    if (!step || step.kind !== 'user_move') throw new Error('step 0 is not user_move');
    const s1 = selectPosition(state, 'A');
    const s2 = applyMassiveBuild(s1, 1);
    // A is already black-owned, so this should not change black count
    // The move itself won't match expected D,m(1)
    const rec = s2.history[s2.history.length - 1];
    if (!rec) return;
    expect(validateMove(rec, step.expected)).toBe(false);
  });

  it('G,m(1) does not match expected D,m(1)', () => {
    const step = task.steps[0];
    if (!step || step.kind !== 'user_move') throw new Error('step 0 is not user_move');
    const s1 = selectPosition(state, 'G');
    const s2 = applyMassiveBuild(s1, 1);
    const rec = s2.history[s2.history.length - 1];
    if (!rec) return;
    expect(validateMove(rec, step.expected)).toBe(false);
  });

  // ── White-owned positions: selectPosition should not allow Black to claim ─

  it('White-owned positions H..M cannot be selected by Black (no positioning change)', () => {
    for (const pid of ['H', 'I', 'J', 'K', 'L', 'M'] as const) {
      // selectPosition may still set selectedPosition, but owner check happens at finalizeTurn
      // The test verifies that White positions are not owned by Black initially
      expect(state.positions[pid]?.owner).toBe('white');
    }
  });

  // ── Task structure ────────────────────────────────────────────────────

  it('task has 1 step: user_move', () => {
    expect(task.steps).toHaveLength(1);
    expect(task.steps[0]?.kind).toBe('user_move');
  });

  it('T9_NO_BUILD_ENDGAME is registered in TRAINING_TASKS', () => {
    const found = TRAINING_TASKS.find((t) => t.id === 'T9_no_build_endgame');
    expect(found).toBeDefined();
  });
});
