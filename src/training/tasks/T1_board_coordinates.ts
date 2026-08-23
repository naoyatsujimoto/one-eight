import { createInitialState } from '../../game/initialState';
import type { TrainingTask } from '../types';

const POSITION_ORDER = ['A','B','C','D','E','F','G','H','I','J','K','L','M'] as const;
const GATE_ORDER = [1,2,3,4,5,6,7,8,9,10,11,12] as const;

export const T1_BOARD_COORDINATES: TrainingTask = {
  id: 'T1_board_coordinates',
  titleKey: 'trainingBoardCoordTitle',
  steps: [
    // Explanation 1
    { kind: 'explanation', labelKey: 'trainingT1Exp1' },
    // Explanation 2
    { kind: 'explanation', labelKey: 'trainingT1Exp2' },
    // Position A–M (13 questions)
    ...POSITION_ORDER.map((pos) => ({
      kind: 'coordinate_pick' as const,
      targetType: 'position' as const,
      target: pos,
      labelKey: 'trainingT1PositionStep',
    })),
    // Explanation 3
    { kind: 'explanation', labelKey: 'trainingT1Exp3' },
    // Explanation 4
    { kind: 'explanation', labelKey: 'trainingT1Exp4' },
    // Explanation 5
    { kind: 'explanation', labelKey: 'trainingT1Exp5' },
    // Gate 1–12 (12 questions)
    ...GATE_ORDER.map((gate) => ({
      kind: 'coordinate_pick' as const,
      targetType: 'gate' as const,
      target: String(gate),
      labelKey: 'trainingT1GateStep',
    })),
  ],
  initialState: { ...createInitialState('white'), trainingMode: true },
};
