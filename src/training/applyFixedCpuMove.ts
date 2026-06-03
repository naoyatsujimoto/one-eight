import { selectPosition, applyMassiveBuild, applySelectiveBuild, applyQuadBuild } from '../game/engine';
import type { GameState } from '../game/types';
import type { FixedCpuMove } from './types';

/**
 * Apply a fixed CPU move to the game state.
 * Uses existing engine functions — no AI evaluation.
 */
export function applyFixedCpuMove(state: GameState, move: FixedCpuMove): GameState {
  let next = selectPosition(state, move.positioning);

  if (move.build.type === 'massive') {
    return applyMassiveBuild(next, move.build.gate);
  }

  if (move.build.type === 'selective') {
    return applySelectiveBuild(next, move.build.gates);
  }

  if (move.build.type === 'quad') {
    return applyQuadBuild(next);
  }

  return next;
}
