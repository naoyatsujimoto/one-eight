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
 *   Position C: owner=null (connects to Gates 3, 4, 5, 10)
 *
 * Tie check:
 *   mostBuilt = Gates with max total value = 64 → [Gate 4, Gate 9]
 *   Gate 4: compareGateDominance(black) = 'player'    → playerWins = 1
 *   Gate 9: compareGateDominance(black) = 'opponent'  → opponentWins = 1
 *   playerWins (1) === opponentWins (1) → canCapturePosition(black, K) = false
 *
 * Why Black cannot select K directly:
 *   K is owned by White and canCapturePosition(black, K) = false (tied),
 *   so K is NOT in getSelectablePositions for Black.
 *   Black must first use another selectable Position to build on Gate 10.
 *
 * Expected move: Position C + Massive Build on Gate 10
 *   Black selects Position C (owner=null, always selectable).
 *   Placing Large(64) into Gate 10 raises Gate 10 total to 64.
 *   Now mostBuilt = [Gate 4, Gate 9, Gate 10] (all total 64).
 *   Gate 4: Black wins → playerWins = 1
 *   Gate 9: White wins → opponentWins = 1
 *   Gate 10: Black wins (64 vs 0) → playerWins = 2
 *   playerWins (2) > opponentWins (1) → canCapturePosition(black, K) = true
 *   After this move, Black can capture Position K on the next turn.
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
      // Position K is NOT selectable for Black (White owns it, capture blocked by tie).
      // Black selects Position C (owner=null) and does Massive Build on Gate 10.
      // Gate 10 connects to both C and K, so this build breaks the tie for K capture.
      expected: { positioning: 'C', build: { type: 'massive', gate: 10 } },
      labelKey: 'trainingT5Step1',
    },
  ],
  initialState: buildT5InitialState(),
};
