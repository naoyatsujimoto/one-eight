import { describe, expect, it } from 'vitest';
import { applyQuadBuildForGates, selectPosition } from '../game/engine';
import { POSITION_TO_GATES } from '../game/constants';
import { createInitialState } from '../game/initialState';
import type { GameState, GateId, PositionId } from '../game/types';
import { applyScriptedMove, scriptedMoveToExpected } from '../training/fullGameUtils';
import { FULL_GAME_V1 } from '../training/tasks/fullGameV1';
import { validateMove } from '../training/validateMove';

function applyUpToMoveNumber(targetMoveNumber: number): GameState {
  let state = createInitialState(null);
  for (const step of FULL_GAME_V1.steps) {
    if (step.moveNumber >= targetMoveNumber) break;
    if (step.kind === 'intro' || step.kind === 'select_only' || !step.move) continue;
    state = applyScriptedMove(state, step.move);
  }
  return state;
}

function buildableQuadGates(state: GameState, position: PositionId): GateId[] {
  const selected = selectPosition(state, position);
  return POSITION_TO_GATES[position].filter((gateId) =>
    selected.gates[gateId].smallSlots.some((slot) => slot === null),
  );
}

describe('Move 58 (M49) — Position B partial Quad Build', () => {
  it('has only Gates 2 and 6 available for small Assets', () => {
    const state = applyUpToMoveNumber(58);

    expect(POSITION_TO_GATES.B).toEqual([2, 3, 6, 11]);
    expect(state.gates[2].smallSlots.filter((slot) => slot === null)).toHaveLength(1);
    expect(state.gates[3].smallSlots.filter((slot) => slot === null)).toHaveLength(0);
    expect(state.gates[6].smallSlots.filter((slot) => slot === null)).toHaveLength(1);
    expect(state.gates[11].smallSlots.filter((slot) => slot === null)).toHaveLength(0);
    expect(buildableQuadGates(state, 'B')).toEqual([2, 6]);
  });

  it('keeps the scripted replay move but validates the two buildable Gates', () => {
    const step = FULL_GAME_V1.steps[58]!;

    expect(step.move?.gates).toEqual([2, 3, 6, 11]);
    expect(step.expectedMove?.gates).toEqual([2, 6]);

    const expected = scriptedMoveToExpected(step.expectedMove!);
    expect(expected).toEqual({
      positioning: 'B',
      build: { type: 'quad', minGates: 2 },
    });
  });

  it('accepts the Quad Build recorded on Gates 2 and 6', () => {
    const state = applyUpToMoveNumber(58);
    const selected = selectPosition(state, 'B');
    const next = applyQuadBuildForGates(selected, [2, 6]);
    const record = next.history[next.history.length - 1]!;
    const expected = scriptedMoveToExpected(FULL_GAME_V1.steps[58]!.expectedMove!);

    expect(record.positioning).toBe('B');
    expect(record.build).toEqual({
      type: 'quad',
      placedGateIds: [2, 6],
      placed: 2,
    });
    expect(validateMove(record, expected)).toBe(true);
  });
});

describe('FULL_GAME_V1 — user Quad expectations match the deterministic board', () => {
  it('requires exactly the Gates that can receive a small Asset', () => {
    let state = createInitialState(null);

    for (const step of FULL_GAME_V1.steps) {
      if (step.kind === 'user' && step.expectedMove?.buildType === 'quad') {
        const position = step.expectedMove.position as PositionId;
        expect(
          step.expectedMove.gates,
          `Move ${step.moveNumber} expected Quad Gates`,
        ).toEqual(buildableQuadGates(state, position));
      }

      if (step.kind === 'intro' || step.kind === 'select_only' || !step.move) continue;
      state = applyScriptedMove(state, step.move);
    }
  });
});
