/**
 * Move 46 (M37) Partial Quad Build — Runner Regression Tests
 *
 * Verifies:
 * 1. Gate 11 is full (not buildable) just before Move 46
 * 2. Gates 4, 9, 10 are buildable just before Move 46
 * 3. expectedMove for Move 46 uses gates [4,9,10] → minGates=3 via scriptedMoveToExpected
 * 4. Applying applyQuadBuildForGates with [4,9,10] passes validateMove with minGates:3
 * 5. The scripted move (gate 11 included) still completes the full game correctly (Black=9, White=4)
 */
import { describe, it, expect } from 'vitest';
import { FULL_GAME_V1 } from '../training/tasks/fullGameV1';
import { createInitialState } from '../game/initialState';
import { applyScriptedMove, scriptedMoveToExpected } from '../training/fullGameUtils';
import { selectPosition, applyQuadBuildForGates } from '../game/engine';
import { validateMove } from '../training/validateMove';
import type { GameState, GateId } from '../game/types';

function applyUpToMoveNumber(targetMoveNumber: number): GameState {
  let state = createInitialState(null);
  for (const step of FULL_GAME_V1.steps) {
    if (step.moveNumber >= targetMoveNumber) break;
    if (step.kind === 'intro' || step.kind === 'select_only') continue;
    if (!step.move) continue;
    state = applyScriptedMove(state, step.move);
  }
  return state;
}

// ── Board state at Move 46 ────────────────────────────────────────────────

describe('Move 46 (moveNumber=46) — board state just before', () => {
  it('Gate 11 has NO empty small slots (full)', () => {
    const state = applyUpToMoveNumber(46);
    const gate11 = state.gates[11];
    const hasEmpty = gate11.smallSlots.some(s => s === null);
    expect(hasEmpty).toBe(false);
  });

  it('Gate 4 has at least one empty small slot (buildable)', () => {
    const state = applyUpToMoveNumber(46);
    expect(state.gates[4].smallSlots.some(s => s === null)).toBe(true);
  });

  it('Gate 9 has at least one empty small slot (buildable)', () => {
    const state = applyUpToMoveNumber(46);
    expect(state.gates[9].smallSlots.some(s => s === null)).toBe(true);
  });

  it('Gate 10 has at least one empty small slot (buildable)', () => {
    const state = applyUpToMoveNumber(46);
    expect(state.gates[10].smallSlots.some(s => s === null)).toBe(true);
  });
});

// ── expectedMove for Move 46 ──────────────────────────────────────────────

describe('Move 46 — expectedMove uses [4,9,10] → minGates:3', () => {
  it('Move 46 expectedMove.gates is [4,9,10]', () => {
    const step46 = FULL_GAME_V1.steps[46];
    expect(step46).toBeDefined();
    expect(step46!.expectedMove).toBeDefined();
    expect(step46!.expectedMove!.gates).toEqual([4, 9, 10]);
  });

  it('scriptedMoveToExpected(expectedMove) produces minGates:3', () => {
    const step46 = FULL_GAME_V1.steps[46]!;
    const expected = scriptedMoveToExpected(step46.expectedMove!);
    expect(expected.build.type).toBe('quad');
    if (expected.build.type === 'quad') {
      expect(expected.build.minGates).toBe(3);
    }
  });

  it('Move 46 scripted move (for replay) still includes all 4 gates', () => {
    const step46 = FULL_GAME_V1.steps[46]!;
    expect(step46.move!.gates).toEqual([4, 9, 10, 11]);
  });
});

// ── Runner-level: selecting Gates 4, 9, 10 triggers validateMove success ──

describe('Move 46 — Runner threshold: select Gates 4,9,10 → validateMove succeeds', () => {
  it('applying applyQuadBuildForGates([4,9,10]) validates correctly with minGates:3', () => {
    const stateBeforeM46 = applyUpToMoveNumber(46);
    // Simulate user selecting Position K
    const stateSelected = selectPosition(stateBeforeM46, 'K');
    // Apply quad build for the 3 buildable gates
    const newState = applyQuadBuildForGates(stateSelected, [4, 9, 10] as GateId[]);
    const lastRecord = newState.history[newState.history.length - 1];
    expect(lastRecord).toBeDefined();
    expect(lastRecord!.build.type).toBe('quad');
    if (lastRecord!.build.type === 'quad') {
      // placedGateIds should include Gates 4, 9, 10 (Gate 11 has no empty slots so placed=0 there)
      expect(lastRecord!.build.placedGateIds.length).toBeGreaterThanOrEqual(1);
    }
    // validateMove with minGates:3 must succeed
    const step46 = FULL_GAME_V1.steps[46]!;
    const expected = scriptedMoveToExpected(step46.expectedMove!);
    expect(validateMove(lastRecord!, expected)).toBe(true);
  });

  it('selecting only 1 gate is NOT enough (below threshold)', () => {
    const stateBeforeM46 = applyUpToMoveNumber(46);
    const stateSelected = selectPosition(stateBeforeM46, 'K');
    const newState = applyQuadBuildForGates(stateSelected, [4] as GateId[]);
    const lastRecord = newState.history[newState.history.length - 1];
    expect(lastRecord).toBeDefined();
    // placedGateIds should have exactly 1 gate placed
    if (lastRecord!.build.type === 'quad') {
      // minGates=3, so 1 gate placed should FAIL validateMove
      const step46 = FULL_GAME_V1.steps[46]!;
      const expected = scriptedMoveToExpected(step46.expectedMove!);
      expect(validateMove(lastRecord!, expected)).toBe(false);
    }
  });

  it('selecting only 2 gates is NOT enough (below threshold)', () => {
    const stateBeforeM46 = applyUpToMoveNumber(46);
    const stateSelected = selectPosition(stateBeforeM46, 'K');
    const newState = applyQuadBuildForGates(stateSelected, [4, 9] as GateId[]);
    const lastRecord = newState.history[newState.history.length - 1];
    expect(lastRecord).toBeDefined();
    if (lastRecord!.build.type === 'quad') {
      const step46 = FULL_GAME_V1.steps[46]!;
      const expected = scriptedMoveToExpected(step46.expectedMove!);
      expect(validateMove(lastRecord!, expected)).toBe(false);
    }
  });

  it('order does not matter — [9,4,10] also validates correctly', () => {
    const stateBeforeM46 = applyUpToMoveNumber(46);
    const stateSelected = selectPosition(stateBeforeM46, 'K');
    const newState = applyQuadBuildForGates(stateSelected, [9, 4, 10] as GateId[]);
    const lastRecord = newState.history[newState.history.length - 1];
    expect(lastRecord).toBeDefined();
    const step46 = FULL_GAME_V1.steps[46]!;
    const expected = scriptedMoveToExpected(step46.expectedMove!);
    expect(validateMove(lastRecord!, expected)).toBe(true);
  });

  it('[10,9,4] also validates correctly', () => {
    const stateBeforeM46 = applyUpToMoveNumber(46);
    const stateSelected = selectPosition(stateBeforeM46, 'K');
    const newState = applyQuadBuildForGates(stateSelected, [10, 9, 4] as GateId[]);
    const lastRecord = newState.history[newState.history.length - 1];
    expect(lastRecord).toBeDefined();
    const step46 = FULL_GAME_V1.steps[46]!;
    const expected = scriptedMoveToExpected(step46.expectedMove!);
    expect(validateMove(lastRecord!, expected)).toBe(true);
  });
});

// ── Regression: Gate 11 is not in placedGateIds (no empty slot) ──────────

describe('Move 46 — Gate 11 placement (Partial Quad behavior)', () => {
  it('applyQuadBuildForGates([4,9,10,11]) places 0 in Gate 11 (already full)', () => {
    const stateBeforeM46 = applyUpToMoveNumber(46);
    const stateSelected = selectPosition(stateBeforeM46, 'K');
    const newState = applyQuadBuildForGates(stateSelected, [4, 9, 10, 11] as GateId[]);
    const lastRecord = newState.history[newState.history.length - 1]!;
    expect(lastRecord.build.type).toBe('quad');
    if (lastRecord.build.type === 'quad') {
      // Gate 11 should NOT be in placedGateIds since it had no empty slots
      expect(lastRecord.build.placedGateIds).not.toContain(11);
      // Gates 4, 9, 10 should each have been placed
      expect(lastRecord.build.placedGateIds).toContain(4);
      expect(lastRecord.build.placedGateIds).toContain(9);
      expect(lastRecord.build.placedGateIds).toContain(10);
    }
  });
});

// ── Full game regression: scripted replay still ends Black=9, White=4 ────

describe('Move 46 fix — full game regression', () => {
  it('All 61 steps applied via scripted moves: gameEnded=true, Black=9, White=4', () => {
    let state = createInitialState(null);
    for (const step of FULL_GAME_V1.steps) {
      if (step.kind === 'intro' || step.kind === 'select_only') continue;
      if (!step.move) continue;
      state = applyScriptedMove(state, step.move);
    }
    expect(state.gameEnded).toBe(true);
    const positions = Object.values(state.positions);
    const black = positions.filter(p => p.owner === 'black').length;
    const white = positions.filter(p => p.owner === 'white').length;
    expect(black).toBe(9);
    expect(white).toBe(4);
  });
});
