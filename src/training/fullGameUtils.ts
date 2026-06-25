import {
  selectPosition,
  applyMassiveBuild,
  applySelectiveBuild,
  applySelectiveBuildSingle,
  applyQuadBuildForGates,
  applyAutoPass,
} from '../game/engine';
import type { GameState, GateId, PositionId } from '../game/types';
import type { ScriptedMove, ExpectedMove } from './types';

const FULLGAME_V1_COMPLETED_KEY = 'one_eight_fullgame_v1_completed';

/**
 * Apply a ScriptedMove (from fullGameV1.ts) to a GameState using the engine.
 * Used for both auto-steps and for building the expected state in tests.
 */
export function applyScriptedMove(state: GameState, move: ScriptedMove): GameState {
  if (move.buildType === 'pass') {
    return applyAutoPass(state);
  }
  const pos = move.position as PositionId;
  const next = selectPosition(state, pos);

  if (move.buildType === 'massive') {
    return applyMassiveBuild(next, move.gates[0] as GateId);
  }
  if (move.buildType === 'selective') {
    return applySelectiveBuild(next, [move.gates[0] as GateId, move.gates[1] as GateId]);
  }
  if (move.buildType === 'selective_single') {
    return applySelectiveBuildSingle(next, move.gates[0] as GateId);
  }
  // quad
  return applyQuadBuildForGates(next, move.gates as GateId[]);
}

/**
 * Convert a ScriptedMove to an ExpectedMove for use with validateMove().
 */
export function scriptedMoveToExpected(sm: ScriptedMove): ExpectedMove {
  if (sm.buildType === 'massive') {
    return {
      positioning: sm.position as PositionId,
      build: { type: 'massive', gate: sm.gates[0] as GateId },
    };
  }
  if (sm.buildType === 'selective') {
    return {
      positioning: sm.position as PositionId,
      build: {
        type: 'selective',
        gates: [sm.gates[0] as GateId, sm.gates[1] as GateId],
      },
    };
  }
  // quad — minGates = number of scripted gates
  return {
    positioning: sm.position as PositionId,
    build: {
      type: 'quad',
      minGates: sm.gates.length > 0 ? sm.gates.length : undefined,
    },
  };
}

/**
 * Save a completion timestamp to localStorage.
 * Stored as ISO string under FULLGAME_V1_COMPLETED_KEY.
 */
export function markFullGameCompleted(): void {
  try {
    localStorage.setItem(FULLGAME_V1_COMPLETED_KEY, new Date().toISOString());
  } catch {
    // localStorage may be unavailable (e.g. in test env)
  }
}

/**
 * Returns true if the full-game v1 course has ever been completed.
 */
export function isFullGameCompleted(): boolean {
  try {
    return localStorage.getItem(FULLGAME_V1_COMPLETED_KEY) !== null;
  } catch {
    return false;
  }
}
