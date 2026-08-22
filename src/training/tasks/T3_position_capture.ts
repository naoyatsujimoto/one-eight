import { createInitialState } from '../../game/initialState';
import type { TrainingTask } from '../types';

function makeT3InitialState() {
  const state = createInitialState('white');
  state.trainingMode = true;
  state.currentPlayer = 'black';
  state.moveNumber = 3;
  state.positions['E']!.owner = 'white';
  state.gates[6]!.largeSlots[0] = { size: 'large', owner: 'black' };
  return state;
}

export const T3_POSITION_CAPTURE: TrainingTask = {
  id: 'T3_position_capture',
  titleKey: 'trainingPosCaptureTitle',
  steps: [
    {
      kind: 'user_move',
      expected: { positioning: 'E', build: { type: 'massive', gate: 10 } },
      labelKey: 'trainingT3Step1',
    },
  ],
  initialState: makeT3InitialState(),
};
