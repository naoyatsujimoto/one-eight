import { createInitialState } from '../../game/initialState';
import type { TrainingTask } from '../types';

/**
 * T10: Defensive Build
 *
 * Learning goal:
 *   When an opponent threatens to capture your Position,
 *   you can defend it by building on another connected Gate
 *   to create a tied dominance — which blocks the capture.
 *
 * Board setup:
 *   Position E: owned by Black (owner = black)
 *   Gate 2: largeSlots = [null, { size: 'large', owner: 'white' }]
 *            middleSlots = [null, null]
 *            smallSlots  = [null, null, null, null]
 *   All other Gates: all slots null
 *
 * POSITION_TO_GATES:
 *   E = [2, 4, 6, 10]
 *
 * Initial capture check:
 *   Gate 2: White Large (total=64, White dominates) → opponentWins=1
 *   Gates 4,6,10: empty (total=0) → not in mostBuilt
 *   maxValue = 64; mostBuilt = [Gate 2]
 *   playerWins=0, opponentWins=1 → canCapturePosition(white, E) = true
 *   → White can capture E on next turn.
 *
 * Correct move: E,m(4)
 *   Black re-selects Position E, then Massive Build on Gate 4.
 *   Gate 4 largeSlots[1] = { size: 'large', owner: 'black' }
 *   Gate 4 now has total=64, Black dominates.
 *   Gates 2 and 4 both have total=64 → mostBuilt = [Gate 2, Gate 4]
 *   Gate 2: White → opponentWins=1; Gate 4: Black → playerWins=1
 *   playerWins(1) === opponentWins(1) → canCapturePosition(white, E) = false
 *   → White can no longer capture E. Position E stays Black.
 *
 * currentPlayer: black
 * moveNumber: 5
 * cpuPlayer: white
 */
function buildT10InitialState() {
  const base = createInitialState('white');

  const positions = {
    ...base.positions,
    E: { ...base.positions['E']!, owner: 'black' as const },
  };

  const gates = {
    ...base.gates,
    2: {
      ...base.gates[2],
      largeSlots: [
        null,
        { size: 'large' as const, owner: 'white' as const },
      ] as [null | { size: 'large'; owner: 'black' | 'white' }, null | { size: 'large'; owner: 'black' | 'white' }],
      middleSlots: [null, null] as [null, null],
      smallSlots: [null, null, null, null] as [null, null, null, null],
    },
  };

  return {
    ...base,
    currentPlayer: 'black' as const,
    moveNumber: 5,
    cpuPlayer: 'white' as const,
    trainingMode: true as const,
    history: [],
    gameEnded: false,
    winner: null,
    endReason: null,
    selectedPosition: null,
    pendingPositionOwner: null,
    timerConfig: null,
    endedAt: null,
    positions,
    gates,
  };
}

export const T10_DEFENSIVE_BUILD: TrainingTask = {
  id: 'T10_defensive_build',
  titleKey: 'trainingT10Title',
  steps: [
    {
      kind: 'user_move',
      expected: { positioning: 'E', build: { type: 'massive', gate: 4 } },
      labelKey: 'trainingT10Step1',
    },
  ],
  initialState: buildT10InitialState(),
};
