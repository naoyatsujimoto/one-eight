import { createInitialState } from '../../game/initialState';
import type { TrainingTask } from '../types';

/**
 * T6: Asset Values
 *
 * Learning goal:
 *   Asset sizes have fixed values: Small=1, Middle=8, Large=64.
 *   One Large Asset dominates a Gate completely.
 *
 * Board setup (Position J → Gates: 1, 5, 7, 9):
 *   Gate 1: Black small(1) + White small(1) — tied at 1 each
 *   Gate 7: Black middle(8) + White small(1) — Black leads at 8 vs 1
 *   Gate 5: empty — target for Massive Build
 *   Gate 9: empty
 *
 * Expected move: Position J + Massive Build on Gate 5
 *   Placing Large Asset (64) into Gate 5 makes Black's Gate 5 value = 64,
 *   which dominates any combination of Middle(8) or Small(1) assets.
 */
function buildT6InitialState() {
  const base = createInitialState('white');

  const gates = {
    ...base.gates,
    // Gate 1: Black small + White small (tied)
    1: {
      ...base.gates[1],
      smallSlots: [
        { size: 'small' as const, owner: 'black' as const },
        { size: 'small' as const, owner: 'white' as const },
        null,
        null,
      ],
    },
    // Gate 7: Black middle + White small (Black leads 8 vs 1)
    7: {
      ...base.gates[7],
      middleSlots: [
        { size: 'middle' as const, owner: 'black' as const },
        null,
      ],
      smallSlots: [
        { size: 'small' as const, owner: 'white' as const },
        null,
        null,
        null,
      ],
    },
  };

  return {
    ...base,
    currentPlayer: 'black' as const,
    moveNumber: 4,
    cpuPlayer: 'white' as const,
    trainingMode: true as const,
    gates,
  };
}

export const T6_ASSET_VALUES: TrainingTask = {
  id: 'T6_asset_values',
  titleKey: 'trainingT6Title',
  steps: [
    {
      kind: 'user_move',
      // Position J connects to Gates [1, 5, 7, 9].
      // Apply Massive Build to Gate 5 — placing Large(64) shows its dominance.
      expected: { positioning: 'J', build: { type: 'massive', gate: 5 } },
      labelKey: 'trainingT6Step1',
    },
  ],
  initialState: buildT6InitialState(),
};
