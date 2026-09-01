import { createInitialState } from '../../game/initialState';
import type { TrainingTask } from '../types';

function makeT3InitialState() {
  const state = createInitialState('white');
  state.trainingMode = true;
  state.currentPlayer = 'black';
  state.moveNumber = 17;

  // A mid-game board makes the capture comparison visible in context.
  state.positions['A']!.owner = 'black';
  state.positions['C']!.owner = 'white';
  state.positions['E']!.owner = 'white';
  state.positions['G']!.owner = 'black';
  state.positions['I']!.owner = 'white';
  state.positions['K']!.owner = 'black';
  state.positions['M']!.owner = 'white';

  state.gates[1]!.smallSlots[0] = { size: 'small', owner: 'black' };
  state.gates[1]!.smallSlots[1] = { size: 'small', owner: 'black' };
  state.gates[1]!.smallSlots[2] = { size: 'small', owner: 'white' };

  // Position E's Diagonal Gates are 2, 4, 6, and 10. Gate 6 is the
  // uniquely most-built Gate and is controlled by Black.
  state.gates[2]!.middleSlots[0] = { size: 'middle', owner: 'white' };
  state.gates[2]!.smallSlots[0] = { size: 'small', owner: 'black' };
  state.gates[2]!.smallSlots[1] = { size: 'small', owner: 'black' };
  state.gates[4]!.middleSlots[0] = { size: 'middle', owner: 'black' };
  state.gates[4]!.smallSlots[0] = { size: 'small', owner: 'white' };
  state.gates[4]!.smallSlots[1] = { size: 'small', owner: 'white' };
  state.gates[4]!.smallSlots[2] = { size: 'small', owner: 'white' };
  state.gates[6]!.largeSlots[0] = { size: 'large', owner: 'black' };
  state.gates[6]!.middleSlots[0] = { size: 'middle', owner: 'white' };
  state.gates[10]!.middleSlots[0] = { size: 'middle', owner: 'white' };
  state.gates[10]!.smallSlots[0] = { size: 'small', owner: 'black' };

  state.gates[3]!.middleSlots[0] = { size: 'middle', owner: 'black' };
  state.gates[5]!.middleSlots[0] = { size: 'middle', owner: 'white' };
  state.gates[7]!.smallSlots[0] = { size: 'small', owner: 'white' };
  state.gates[7]!.smallSlots[1] = { size: 'small', owner: 'white' };
  state.gates[7]!.smallSlots[2] = { size: 'small', owner: 'white' };
  state.gates[8]!.middleSlots[0] = { size: 'middle', owner: 'black' };
  state.gates[8]!.smallSlots[0] = { size: 'small', owner: 'white' };
  state.gates[9]!.middleSlots[0] = { size: 'middle', owner: 'white' };
  state.gates[9]!.smallSlots[0] = { size: 'small', owner: 'black' };
  state.gates[9]!.smallSlots[1] = { size: 'small', owner: 'black' };
  state.gates[11]!.smallSlots[0] = { size: 'small', owner: 'black' };
  state.gates[11]!.smallSlots[1] = { size: 'small', owner: 'black' };
  state.gates[11]!.smallSlots[2] = { size: 'small', owner: 'black' };
  state.gates[11]!.smallSlots[3] = { size: 'small', owner: 'black' };
  state.gates[12]!.middleSlots[0] = { size: 'middle', owner: 'white' };
  return state;
}

export const T3_POSITION_CAPTURE: TrainingTask = {
  id: 'T3_position_capture',
  titleKey: 'trainingPosCaptureTitle',
  steps: [
    // Explanation 1
    { kind: 'explanation', labelKey: 'trainingT3Exp1' },
    // Explanation 2
    { kind: 'explanation', labelKey: 'trainingT3Exp2' },
    // Explanation 3
    { kind: 'explanation', labelKey: 'trainingT3Exp3' },
    // Explanation 4
    { kind: 'explanation', labelKey: 'trainingT3Exp4' },
    // Explanation 5
    { kind: 'explanation', labelKey: 'trainingT3Exp5' },
    // User Step: E,m(10)
    {
      kind: 'user_move',
      expected: { positioning: 'E', build: { type: 'massive', gate: 10 } },
      labelKey: 'trainingT3Step1',
    },
  ],
  initialState: makeT3InitialState(),
};
