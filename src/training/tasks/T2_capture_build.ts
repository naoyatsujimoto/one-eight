import { createInitialState } from '../../game/initialState';
import type { TrainingTask } from '../types';

function buildT2InitialState() {
  const base = createInitialState('white');

  // Position E: owned by white
  const positions = {
    ...base.positions,
    E: { ...base.positions.E, owner: 'white' as const },
  };

  // Gate 6: Black large asset in largeSlots[0]
  const gates = {
    ...base.gates,
    6: {
      ...base.gates[6],
      largeSlots: [
        { size: 'large' as const, owner: 'black' as const },
        null,
      ],
    },
  };

  return {
    ...base,
    currentPlayer: 'black' as const,
    moveNumber: 3,
    cpuPlayer: 'white' as const,
    trainingMode: true as const,
    positions,
    gates,
  };
}

export const T2_CAPTURE_BUILD: TrainingTask = {
  id: 'T2_capture_build',
  titleKey: 'trainingT2Title',
  steps: [
    {
      kind: 'user_move',
      expected: { positioning: 'E', build: { type: 'massive', gate: 10 } },
      labelKey: 'trainingT2Step1',
    },
  ],
  initialState: buildT2InitialState(),
};
