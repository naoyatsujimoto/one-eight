import { createInitialState } from '../../game/initialState';
import type { TrainingTask } from '../types';

/**
 * T5: Capture Tie
 *
 * Learning goal:
 *   When the most-built Gates are tied between Black and White,
 *   neither player can capture. You need to break the tie first
 *   by building to gain dominance in more of those tied Gates.
 *
 * Board setup (Position K → Gates: 4, 9, 10, 11):
 *   Gate 4:  Black Large(64) — Black dominates (64 vs 0)
 *   Gate 9:  White Large(64) — White dominates (0 vs 64)
 *   Gate 10: empty
 *   Gate 11: empty
 *   Position K: owned by White
 *
 * Tie check:
 *   mostBuilt = Gates with max total value = 64 → [Gate 4, Gate 9]
 *   Gate 4: compareGateDominance(black) = 'player'    → playerWins = 1
 *   Gate 9: compareGateDominance(black) = 'opponent'  → opponentWins = 1
 *   playerWins (1) === opponentWins (1) → canCapturePosition = false
 *
 * Expected move: Position K + Massive Build on Gate 10
 *   Placing Large(64) into Gate 10 makes Black's Gate 10 value = 64,
 *   which creates a new tied most-built Gate dominated by Black.
 *   After this build, the next turn Black can capture Position K.
 */
function buildT5InitialState() {
  const base = createInitialState('white');

  const gates = {
    ...base.gates,
    // Gate 4: Black Large — Black dominates (total 64)
    4: {
      ...base.gates[4],
      largeSlots: [
        { size: 'large' as const, owner: 'black' as const },
        null,
      ],
    },
    // Gate 9: White Large — White dominates (total 64)
    9: {
      ...base.gates[9],
      largeSlots: [
        { size: 'large' as const, owner: 'white' as const },
        null,
      ],
    },
  };

  const positions = {
    ...base.positions,
    // Position K is owned by White (target for capture)
    K: {
      ...base.positions['K'],
      owner: 'white' as const,
    },
  };

  return {
    ...base,
    currentPlayer: 'black' as const,
    moveNumber: 4,
    cpuPlayer: 'white' as const,
    trainingMode: true as const,
    gates,
    positions,
  };
}

export const T5_CAPTURE_TIE: TrainingTask = {
  id: 'T5_capture_tie',
  titleKey: 'trainingT5Title',
  steps: [
    {
      kind: 'user_move',
      // Position K connects to Gates [4, 9, 10, 11].
      // Gate 4 (Black Large) and Gate 9 (White Large) are tied as most-built.
      // Capture is blocked by the tie. Build Gate 10 with Massive to break it.
      expected: { positioning: 'K', build: { type: 'massive', gate: 10 } },
      labelKey: 'trainingT5Step1',
    },
  ],
  initialState: buildT5InitialState(),
};
