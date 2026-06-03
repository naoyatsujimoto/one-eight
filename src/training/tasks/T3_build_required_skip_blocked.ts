import { createInitialState } from '../../game/initialState';
import type { TrainingTask } from '../types';

function buildT3InitialState() {
  const base = createInitialState('white');

  return {
    ...base,
    currentPlayer: 'black' as const,
    moveNumber: 2,
    cpuPlayer: 'white' as const,
    trainingMode: true as const,
  };
}

export const T3_BUILD_REQUIRED_SKIP_BLOCKED: TrainingTask = {
  id: 'T3_build_required_skip_blocked',
  titleKey: 'trainingT3Title',
  steps: [
    {
      kind: 'user_move',
      expected: { positioning: 'B', build: { type: 'massive', gate: 2 } },
      labelKey: 'trainingT3Step1',
    },
  ],
  initialState: buildT3InitialState(),
};
