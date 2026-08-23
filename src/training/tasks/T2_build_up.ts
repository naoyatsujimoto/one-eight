import { createInitialState } from '../../game/initialState';
import type { TrainingTask } from '../types';

export const T2_BUILD_UP: TrainingTask = {
  id: 'T2_build_up',
  titleKey: 'trainingBuildUpTitle',
  steps: [
    // Explanation 1
    { kind: 'explanation', labelKey: 'trainingT2Exp1' },
    // Explanation 2
    { kind: 'explanation', labelKey: 'trainingT2Exp2' },
    // Explanation 3
    { kind: 'explanation', labelKey: 'trainingT2Exp3' },
    // Explanation 4
    { kind: 'explanation', labelKey: 'trainingT2Exp4' },
    // Explanation 5
    { kind: 'explanation', labelKey: 'trainingT2Exp5' },
    // User Step 1: G,m(7)
    {
      kind: 'user_move',
      expected: { positioning: 'G', build: { type: 'massive', gate: 7 } },
      labelKey: 'trainingT2BuildStep1',
    },
    // CPU: K,m(4)
    {
      kind: 'cpu_fixed_move',
      move: { positioning: 'K', build: { type: 'massive', gate: 4 } },
    },
    // Explanation 6
    { kind: 'explanation', labelKey: 'trainingT2Exp6' },
    // User Step 2: M,s(6,8)
    {
      kind: 'user_move',
      expected: { positioning: 'M', build: { type: 'selective', gates: [6, 8] } },
      labelKey: 'trainingT2BuildStep2',
    },
    // CPU: L,m(9)
    {
      kind: 'cpu_fixed_move',
      move: { positioning: 'L', build: { type: 'massive', gate: 9 } },
    },
    // Explanation 7
    { kind: 'explanation', labelKey: 'trainingT2Exp7' },
    // User Step 3: A,q
    {
      kind: 'user_move',
      expected: { positioning: 'A', build: { type: 'quad', minGates: 4 } },
      labelKey: 'trainingT2BuildStep3',
    },
  ],
  initialState: { ...createInitialState('white'), trainingMode: true },
};
