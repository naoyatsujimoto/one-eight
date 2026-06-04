import { createInitialState } from '../../game/initialState';
import type { GateState, Asset } from '../../game/types';
import type { TrainingTask } from '../types';

/**
 * T9: No-build Endgame
 *
 * Learning goal:
 *   Understand how a ONE EIGHT game ends and how the winner is decided.
 *   The game ends when all 12 Gates have every slot filled.
 *   The winner is the player who owns more Positions at endgame.
 *   Gate asset value does NOT affect the winner.
 *
 * Board setup:
 *   Black owns: A, B, C, E, F, G  (6 positions)
 *   White owns: H, I, J, K, L, M  (6 positions)
 *   null:       D only             (1 position — the last empty)
 *
 *   Gate 1: largeSlots = [null, {large,white}]
 *            middleSlots = [{middle,white}, {middle,white}]
 *            smallSlots  = [{small,white}x4]
 *   Gate 2..12: all fully filled with white assets
 *
 *   moveNumber: 49, currentPlayer: black, cpuPlayer: white
 *
 * Correct move: D,m(1)
 *   - Position D owner becomes black
 *   - Gate 1 largeSlots[0] = { size: 'large', owner: 'black' }
 *   - All Gates are now full → gameEnded = true
 *   - Black: 7 positions, White: 6 positions → winner = 'black'
 *   - endReason = null (normal endgame, not timeout/resign)
 */

function fullGateAllWhite(id: GateState['id']): GateState {
  const white = 'white' as const;
  const large = { size: 'large' as const, owner: white };
  const middle = { size: 'middle' as const, owner: white };
  const small = { size: 'small' as const, owner: white };
  return {
    id,
    largeSlots: [large, large],
    middleSlots: [middle, middle],
    smallSlots: [small, small, small, small],
  };
}

function buildT9InitialState() {
  const base = createInitialState('white');

  // Position owners
  const blackOwned = ['A', 'B', 'C', 'E', 'F', 'G'] as const;
  const whiteOwned = ['H', 'I', 'J', 'K', 'L', 'M'] as const;

  const positions = { ...base.positions };
  for (const id of blackOwned) {
    positions[id] = { ...positions[id]!, owner: 'black' as const };
  }
  for (const id of whiteOwned) {
    positions[id] = { ...positions[id]!, owner: 'white' as const };
  }
  // D remains null (the only unowned position)

  // Gates
  const white = 'white' as const;
  const large: Asset = { size: 'large', owner: white };
  const middle: Asset = { size: 'middle', owner: white };
  const small: Asset = { size: 'small', owner: white };

  const gate1: GateState = {
    id: 1,
    largeSlots: [null, large],
    middleSlots: [middle, middle],
    smallSlots: [small, small, small, small],
  };

  const gates = { ...base.gates };
  gates[1] = gate1;
  for (let i = 2; i <= 12; i++) {
    gates[i as keyof typeof gates] = fullGateAllWhite(i as GateState['id']);
  }

  return {
    ...base,
    currentPlayer: 'black' as const,
    moveNumber: 49,
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

export const T9_NO_BUILD_ENDGAME: TrainingTask = {
  id: 'T9_no_build_endgame',
  titleKey: 'trainingT9Title',
  steps: [
    {
      kind: 'user_move',
      expected: { positioning: 'D', build: { type: 'massive', gate: 1 } },
      labelKey: 'trainingT9Step1',
    },
  ],
  initialState: buildT9InitialState(),
};
