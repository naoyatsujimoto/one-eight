import { createInitialState } from '../../game/initialState';
import type { TrainingTask } from '../types';

/**
 * T4: Partial Build / Slot Shortage
 *
 * Learning goal:
 *   Even when some slots in target Gates are already filled,
 *   Build still places assets in the remaining empty slots.
 *
 * Board setup (Position F → Gates: 3, 8, 11, 12):
 *   Gate 8:  smallSlots all filled (4/4) — no room
 *   Gate 3:  smallSlots 3 filled, 1 empty
 *   Gate 11: smallSlots all empty
 *   Gate 12: smallSlots all empty
 *
 * Expected move: Position F + Quad Build
 *   Gate 8 is skipped (full). Assets are placed in Gates 3, 11, 12 only.
 *   minGates: 3 confirms placement happened in at least 3 gates.
 */
function buildT4InitialState() {
  const base = createInitialState('white');

  const gates = {
    ...base.gates,
    // Gate 8: all small slots filled (no room for Quad)
    8: {
      ...base.gates[8],
      smallSlots: [
        { size: 'small' as const, owner: 'white' as const },
        { size: 'small' as const, owner: 'black' as const },
        { size: 'small' as const, owner: 'white' as const },
        { size: 'small' as const, owner: 'black' as const },
      ],
    },
    // Gate 3: 3 small slots filled, 1 empty
    3: {
      ...base.gates[3],
      smallSlots: [
        { size: 'small' as const, owner: 'white' as const },
        { size: 'small' as const, owner: 'black' as const },
        { size: 'small' as const, owner: 'white' as const },
        null,
      ],
    },
  };

  return {
    ...base,
    currentPlayer: 'black' as const,
    moveNumber: 5,
    cpuPlayer: 'white' as const,
    trainingMode: true as const,
    gates,
  };
}

export const T4_PARTIAL_BUILD: TrainingTask = {
  id: 'T4_partial_build',
  titleKey: 'trainingT4Title',
  steps: [
    {
      kind: 'user_move',
      // Position F connects to Gates [3, 8, 11, 12].
      // Gate 8 is full; Gate 3 has 1 empty slot; Gates 11 and 12 are empty.
      // Quad build fills available slots: 3, 11, 12 (Gate 8 skipped).
      expected: { positioning: 'F', build: { type: 'quad', minGates: 3 } },
      labelKey: 'trainingT4Step1',
    },
  ],
  initialState: buildT4InitialState(),
};
