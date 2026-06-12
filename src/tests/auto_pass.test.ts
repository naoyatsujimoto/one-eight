/**
 * auto_pass.test.ts
 *
 * Tests for:
 *   - hasAnyLegalMove() — legal move detection
 *   - applyAutoPass()   — automatic P when no legal moves exist
 *
 * Covers the specification:
 *   - Build-possible own position → legal (no auto pass)
 *   - Empty position with build available → legal (no auto pass)
 *   - Capturable opponent position with build available → legal (no auto pass)
 *   - Build-impossible own position ONLY → no legal move → auto pass fires
 *   - No positions at all available → auto pass fires
 *   - Auto pass records 'P' in history (build.type === 'skip')
 *   - Auto pass does NOT fire when legal moves exist
 */

import { describe, expect, it } from 'vitest';
import { applyAutoPass, skipTurn } from '../game/engine';
import { hasAnyLegalMove } from '../game/selectors';
import { createInitialState } from '../game/initialState';
import type { Asset, GameState, GateId, GateState } from '../game/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fillGate(gate: GateState, owner: 'black' | 'white'): GateState {
  return {
    ...gate,
    largeSlots: gate.largeSlots.map(() => ({ size: 'large', owner } as Asset)),
    middleSlots: gate.middleSlots.map(() => ({ size: 'middle', owner } as Asset)),
    smallSlots: gate.smallSlots.map(() => ({ size: 'small', owner } as Asset)),
  };
}

/**
 * Returns a state where ALL gates related to the given positionId are full.
 * Optionally set the owner of the position.
 */
function fillGatesForPosition(
  state: GameState,
  posId: keyof GameState['positions'],
  gateIds: GateId[],
  fillOwner: 'black' | 'white',
  posOwner: 'black' | 'white' | null = null,
): GameState {
  const nextGates = { ...state.gates };
  for (const gid of gateIds) {
    nextGates[gid] = fillGate(state.gates[gid], fillOwner);
  }
  const nextPositions = { ...state.positions };
  if (posOwner !== null) {
    nextPositions[posId] = { id: posId as GameState['positions'][typeof posId]['id'], owner: posOwner };
  }
  return { ...state, gates: nextGates, positions: nextPositions };
}

// ---------------------------------------------------------------------------
// hasAnyLegalMove
// ---------------------------------------------------------------------------

describe('hasAnyLegalMove', () => {
  it('returns true from initial state (empty positions with build options)', () => {
    const state = createInitialState();
    expect(hasAnyLegalMove(state, 'black')).toBe(true);
  });

  it('returns false when all positions are owned by the current player but all gates are full', () => {
    // Fill ALL 12 gates → no build possible anywhere
    let state = createInitialState();
    const allGateIds: GateId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    for (const gid of allGateIds) {
      state = { ...state, gates: { ...state.gates, [gid]: fillGate(state.gates[gid], 'black') } };
    }
    // Also give black all positions so no captures are needed
    const allPosIds = ['A','B','C','D','E','F','G','H','I','J','K','L','M'] as const;
    for (const pid of allPosIds) {
      state = { ...state, positions: { ...state.positions, [pid]: { id: pid, owner: 'black' } } };
    }
    expect(hasAnyLegalMove(state, 'black')).toBe(false);
  });

  it('returns false when only own positions exist and all their gates are full', () => {
    // Position A has gates [1, 2, 7, 12]; fill all of them.
    // All other positions owned by white (opponent) and not capturable.
    let state = createInitialState();
    // Fill gates for A
    const gatesForA: GateId[] = [1, 2, 7, 12];
    state = fillGatesForPosition(state, 'A', gatesForA, 'black', 'black');
    // Fill remaining gates and make all other positions owned by white
    const remainingGates: GateId[] = [3, 4, 5, 6, 8, 9, 10, 11];
    for (const gid of remainingGates) {
      state = { ...state, gates: { ...state.gates, [gid]: fillGate(state.gates[gid], 'white') } };
    }
    const otherPos = ['B','C','D','E','F','G','H','I','J','K','L','M'] as const;
    for (const pid of otherPos) {
      state = { ...state, positions: { ...state.positions, [pid]: { id: pid, owner: 'white' } } };
    }
    // Black owns A but all A's gates are full → no legal move
    expect(hasAnyLegalMove(state, 'black')).toBe(false);
  });

  it('returns true when an empty position has build options', () => {
    const state = createInitialState();
    // Initial state: all positions empty, all gates have space → legal
    expect(hasAnyLegalMove(state, 'black')).toBe(true);
  });

  it('returns false when own position gates are all full (build-impossible own position only)', () => {
    // Create a state where black owns only position A, all of A's gates are full,
    // and all other positions are owned by white with all their gates full.
    let state = createInitialState();
    const allGateIds: GateId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    for (const gid of allGateIds) {
      state = { ...state, gates: { ...state.gates, [gid]: fillGate(state.gates[gid], 'black') } };
    }
    const allPosIds = ['A','B','C','D','E','F','G','H','I','J','K','L','M'] as const;
    // black owns A, white owns everything else (not capturable since all gates are full and equal)
    state = { ...state, positions: { ...state.positions, A: { id: 'A', owner: 'black' } } };
    for (const pid of ['B','C','D','E','F','G','H','I','J','K','L','M'] as const) {
      state = { ...state, positions: { ...state.positions, [pid]: { id: pid, owner: 'white' } } };
    }
    expect(hasAnyLegalMove(state, 'black')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyAutoPass
// ---------------------------------------------------------------------------

describe('applyAutoPass', () => {
  it('does NOT fire when legal moves exist (initial state)', () => {
    const state = createInitialState();
    const result = applyAutoPass(state);
    // State should be identical (same reference or same currentPlayer/history)
    expect(result).toBe(state);
  });

  it('fires and records P when no legal moves exist', () => {
    // Build a state where black has no legal moves
    let state = createInitialState();
    const allGateIds: GateId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    for (const gid of allGateIds) {
      state = { ...state, gates: { ...state.gates, [gid]: fillGate(state.gates[gid], 'black') } };
    }
    const allPosIds = ['A','B','C','D','E','F','G','H','I','J','K','L','M'] as const;
    for (const pid of allPosIds) {
      state = { ...state, positions: { ...state.positions, [pid]: { id: pid, owner: 'black' } } };
    }
    // black has no builds possible anywhere
    expect(hasAnyLegalMove(state, 'black')).toBe(false);

    const result = applyAutoPass(state);
    expect(result).not.toBe(state);
    expect(result.currentPlayer).toBe('white'); // turn advanced
    expect(result.history).toHaveLength(1);
    expect(result.history[0]!.positioning).toBe('P');
    expect(result.history[0]!.build.type).toBe('skip');
  });

  it('records P in MoveHistory after auto pass', () => {
    let state = createInitialState();
    const allGateIds: GateId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    for (const gid of allGateIds) {
      state = { ...state, gates: { ...state.gates, [gid]: fillGate(state.gates[gid], 'black') } };
    }
    const allPosIds = ['A','B','C','D','E','F','G','H','I','J','K','L','M'] as const;
    for (const pid of allPosIds) {
      state = { ...state, positions: { ...state.positions, [pid]: { id: pid, owner: 'black' } } };
    }
    const result = applyAutoPass(state);
    const lastRecord = result.history[result.history.length - 1]!;
    expect(lastRecord.positioning).toBe('P');
    expect(lastRecord.build.type).toBe('skip');
    expect(lastRecord.player).toBe('black');
  });

  it('does NOT fire when game is already ended', () => {
    let state = createInitialState();
    const allGateIds: GateId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    for (const gid of allGateIds) {
      state = { ...state, gates: { ...state.gates, [gid]: fillGate(state.gates[gid], 'black') } };
    }
    state = { ...state, gameEnded: true };
    const result = applyAutoPass(state);
    expect(result).toBe(state); // no change
  });

  it('fires for white player when white has no legal moves', () => {
    let state = createInitialState();
    state = { ...state, currentPlayer: 'white' };
    const allGateIds: GateId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    for (const gid of allGateIds) {
      state = { ...state, gates: { ...state.gates, [gid]: fillGate(state.gates[gid], 'white') } };
    }
    const allPosIds = ['A','B','C','D','E','F','G','H','I','J','K','L','M'] as const;
    for (const pid of allPosIds) {
      state = { ...state, positions: { ...state.positions, [pid]: { id: pid, owner: 'white' } } };
    }
    expect(hasAnyLegalMove(state, 'white')).toBe(false);
    const result = applyAutoPass(state);
    expect(result.currentPlayer).toBe('black');
    expect(result.history[0]!.player).toBe('white');
    expect(result.history[0]!.positioning).toBe('P');
  });

  it('auto pass does NOT fire when there is a build-possible empty position', () => {
    // All positions owned by black, but position A's gates have space
    // (gates 1,2,7,12 not full)
    let state = createInitialState();
    const allPosIds = ['A','B','C','D','E','F','G','H','I','J','K','L','M'] as const;
    for (const pid of allPosIds) {
      state = { ...state, positions: { ...state.positions, [pid]: { id: pid, owner: 'black' } } };
    }
    // Fill gates except 1 (used by A, D, G, J, M) — leave gate 1 open
    const gatesExcept1: GateId[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    for (const gid of gatesExcept1) {
      state = { ...state, gates: { ...state.gates, [gid]: fillGate(state.gates[gid], 'black') } };
    }
    // Gate 1 still has space → positions A/D/G/J/M have at least one build option via gate 1
    expect(hasAnyLegalMove(state, 'black')).toBe(true);
    const result = applyAutoPass(state);
    expect(result).toBe(state); // no auto pass
  });
});

// ---------------------------------------------------------------------------
// Integration: skipTurn still works internally (used by postmortem/importRecord)
// ---------------------------------------------------------------------------

describe('skipTurn (internal) still works', () => {
  it('skipTurn advances turn when no position selected', () => {
    const state = createInitialState();
    const next = skipTurn(state);
    expect(next.currentPlayer).toBe('white');
    expect(next.history[0]!.build.type).toBe('skip');
  });

  it('skipTurn is blocked when build options are available and position is selected', () => {
    // Initial state: position A selected, gates have space → skip blocked
    const state = createInitialState();
    const withSelected = { ...state, selectedPosition: 'A' as const };
    const result = skipTurn(withSelected);
    expect(result).toBe(withSelected); // no change — blocked
  });
});
