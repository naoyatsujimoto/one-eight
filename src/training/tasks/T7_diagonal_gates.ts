import { createInitialState } from '../../game/initialState';
import type { TrainingTask } from '../types';

// POSITION_TO_GATES.H = [2, 5, 6, 9]
// Position H is connected to Gates 2, 5, 6, and 9.
// Expected move: Select Position H and apply Massive Build to Gate 5.

function buildT7InitialState() {
  const base = createInitialState('white');

  return {
    ...base,
    currentPlayer: 'black' as const,
    moveNumber: 2,
    cpuPlayer: 'white' as const,
    trainingMode: true as const,
  };
}

export const T7_DIAGONAL_GATES: TrainingTask = {
  id: 'T7_diagonal_gates',
  titleKey: 'trainingT7Title',
  steps: [
    {
      kind: 'user_move',
      // H is connected to gates [2, 5, 6, 9]; gate 5 chosen as expected
      expected: { positioning: 'H', build: { type: 'massive', gate: 5 } },
      labelKey: 'trainingT7Step1',
    },
  ],
  initialState: buildT7InitialState(),
};
