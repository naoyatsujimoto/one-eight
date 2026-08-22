import { createInitialState } from '../../game/initialState';
import type { TrainingTask } from '../types';

export const T2_BUILD_UP: TrainingTask = {
  id: 'T2_build_up',
  titleKey: 'trainingBuildUpTitle',
  steps: [
    {
      kind: 'user_move',
      expected: { positioning: 'G', build: { type: 'massive', gate: 7 } },
      labelKey: 'trainingT2BuildStep1',
    },
    {
      kind: 'cpu_fixed_move',
      move: { positioning: 'K', build: { type: 'massive', gate: 4 } },
    },
    {
      kind: 'user_move',
      expected: { positioning: 'M', build: { type: 'selective', gates: [6, 8] } },
      labelKey: 'trainingT2BuildStep2',
    },
    {
      kind: 'cpu_fixed_move',
      move: { positioning: 'L', build: { type: 'massive', gate: 9 } },
    },
    {
      kind: 'user_move',
      expected: { positioning: 'A', build: { type: 'quad', minGates: 4 } },
      labelKey: 'trainingT2BuildStep3',
    },
  ],
  initialState: { ...createInitialState('white'), trainingMode: true },
};
