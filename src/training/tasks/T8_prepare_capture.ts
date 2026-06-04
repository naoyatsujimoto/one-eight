import { createInitialState } from '../../game/initialState';
import type { TrainingTask } from '../types';

/**
 * T8: Prepare Capture
 *
 * Learning goal:
 *   When you cannot capture a Position directly due to a tie in gate dominance,
 *   you need to first build on a connected Gate to gain enough dominance,
 *   then capture on the following turn.
 *
 * Board setup:
 *   Position D: owned by White (target for capture)
 *   Gate 3: White Large at largeSlots[1]  — White dominates
 *   Gate 7: Black Large at largeSlots[0]  — Black dominates
 *
 * POSITION_TO_GATES:
 *   D = [1, 3, 7, 11]
 *   F = [3, 8, 11, 12]
 *   E = [2, 4, 6, 10]
 *
 * Initial capture check for D:
 *   Gate 3: White dominates → opponentWins = 1
 *   Gate 7: Black dominates → playerWins = 1
 *   Gates 1, 11: empty (total=0, tie with 0 each → counted as tie, not included in mostBuilt)
 *   mostBuilt total = 64; only Gate 3 and Gate 7 qualify
 *   playerWins (1) === opponentWins (1) → canCapturePosition(black, D) = false
 *
 * Step 1 — user expected: F,m(11)
 *   Black selects Position F, applies Massive Build to Gate 11.
 *   Gate 11 now has Black Large (total 64). Black dominates Gate 11.
 *   D's connected Gates with max total: Gate 3 (64, White), Gate 7 (64, Black), Gate 11 (64, Black)
 *   playerWins = 2, opponentWins = 1 → canCapturePosition(black, D) = true
 *
 * CPU fixed move: E,m(2)
 *   White selects Position E, applies Massive Build to Gate 2.
 *   Gate 2 is NOT in D's connected gates [1,3,7,11], so D's dominance is unchanged.
 *   canCapturePosition(black, D) remains true.
 *
 * Step 2 — user expected: D,m(1)
 *   Black selects Position D (now capturable), applies Massive Build to Gate 1.
 *   Position D owner becomes Black (capture + build).
 *   Training complete.
 */
function buildT8InitialState() {
  const base = createInitialState('white');

  const gates = {
    ...base.gates,
    // Gate 3: White Large at largeSlots[1] — White dominates
    3: {
      ...base.gates[3],
      largeSlots: [
        null,
        { size: 'large' as const, owner: 'white' as const },
      ],
    },
    // Gate 7: Black Large at largeSlots[0] — Black dominates
    7: {
      ...base.gates[7],
      largeSlots: [
        { size: 'large' as const, owner: 'black' as const },
        null,
      ],
    },
  };

  const positions = {
    ...base.positions,
    // Position D: owned by White (target for capture)
    D: {
      ...base.positions['D'],
      owner: 'white' as const,
    },
  };

  return {
    ...base,
    currentPlayer: 'black' as const,
    moveNumber: 3,
    cpuPlayer: 'white' as const,
    trainingMode: true as const,
    gates,
    positions,
  };
}

export const T8_PREPARE_CAPTURE: TrainingTask = {
  id: 'T8_prepare_capture',
  titleKey: 'trainingT8Title',
  steps: [
    {
      kind: 'user_move',
      expected: { positioning: 'F', build: { type: 'massive', gate: 11 } },
      labelKey: 'trainingT8Step1',
    },
    {
      kind: 'cpu_fixed_move',
      move: { positioning: 'E', build: { type: 'massive', gate: 2 } },
    },
    {
      kind: 'user_move',
      expected: { positioning: 'D', build: { type: 'massive', gate: 1 } },
      labelKey: 'trainingT8Step2',
    },
  ],
  initialState: buildT8InitialState(),
};
