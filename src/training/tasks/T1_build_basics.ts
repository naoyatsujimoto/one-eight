import { createInitialState } from '../../game/initialState';
import type { TrainingTask } from '../types';

export const T1_BUILD_BASICS: TrainingTask = {
  id: 'T1_build_basics',
  titleKey: 'trainingT1Title',
  steps: [
    {
      kind: 'user_move',
      expected: { positioning: 'G', build: { type: 'massive', gate: 7 } },
      labelKey: 'trainingT1Step1',
    },
    {
      kind: 'cpu_fixed_move',
      move: { positioning: 'K', build: { type: 'massive', gate: 4 } },
    },
    {
      kind: 'user_move',
      expected: { positioning: 'M', build: { type: 'selective', gates: [6, 8] } },
      labelKey: 'trainingT1Step3',
    },
    {
      kind: 'cpu_fixed_move',
      move: { positioning: 'L', build: { type: 'massive', gate: 9 } },
    },
    {
      kind: 'user_move',
      expected: { positioning: 'A', build: { type: 'quad', minGates: 4 } },
      labelKey: 'trainingT1Step5',
    },
  ],
  initialState: { ...createInitialState('white'), trainingMode: true },
};
