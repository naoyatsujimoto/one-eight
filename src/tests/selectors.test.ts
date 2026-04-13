import { describe, expect, it } from 'vitest';
import { getAvailableBuildOptions, getWinner, isGameEnded } from '../game/selectors';
import { createInitialState } from '../game/initialState';
import type { Asset, GameState, GateState, Player } from '../game/types';

// ---------- helpers ----------

function fillGate(gate: GateState, owner: Player): GateState {
  return {
    ...gate,
    largeSlots: gate.largeSlots.map(() => ({ size: 'large', owner } as Asset)),
    middleSlots: gate.middleSlots.map(() => ({ size: 'middle', owner } as Asset)),
    smallSlots: gate.smallSlots.map(() => ({ size: 'small', owner } as Asset)),
  };
}

function fillAllGates(state: GameState, owner: Player): GameState {
  const gates = Object.fromEntries(
    Object.entries(state.gates).map(([id, gate]) => [id, fillGate(gate as GateState, owner)])
  ) as GameState['gates'];
  return { ...state, gates };
}

// ---------- isGameEnded ----------

describe('isGameEnded', () => {
  it('returns false when no gates are filled', () => {
    const state = createInitialState();
    expect(isGameEnded(state)).toBe(false);
  });

  it('returns false when only some gates are filled', () => {
    const state = createInitialState();
    const next: GameState = {
      ...state,
      gates: {
        ...state.gates,
        1: fillGate(state.gates[1], 'black'),
        2: fillGate(state.gates[2], 'black'),
      }
    };
    expect(isGameEnded(next)).toBe(false);
  });

  it('returns true only when all 12 gates are full', () => {
    const state = fillAllGates(createInitialState(), 'black');
    expect(isGameEnded(state)).toBe(true);
  });
});

// ---------- getWinner ----------

describe('getWinner', () => {
  it('returns null when game has not ended', () => {
    const state = createInitialState();
    expect(getWinner(state)).toBeNull();
  });

  it('returns draw when black and white own equal positions', () => {
    // 13 positions total → fill 6 black, 6 white, 1 null → tie impossible, use 6 each + null
    // Actually 13 is odd so true equal-ownership draw would be 6 vs 6 with 1 unowned
    // For strict draw test: even split is not possible with 13. Use positions directly.
    // Set 6 black, 6 white, 1 null (null not counted) → 6 vs 6 → draw
    const state = fillAllGates(createInitialState(), 'black');
    const positions = { ...state.positions };
    const posIds = Object.keys(positions) as Array<keyof typeof positions>;
    posIds.slice(0, 6).forEach((id) => { positions[id] = { ...positions[id], owner: 'black' }; });
    posIds.slice(6, 12).forEach((id) => { positions[id] = { ...positions[id], owner: 'white' }; });
    positions[posIds[12]!] = { ...positions[posIds[12]!], owner: null };
    const next: GameState = { ...state, positions };
    expect(getWinner(next)).toBe('draw');
  });

  it('returns black when black owns more positions', () => {
    const state = fillAllGates(createInitialState(), 'black');
    const positions = { ...state.positions };
    const posIds = Object.keys(positions) as Array<keyof typeof positions>;
    posIds.forEach((id) => { positions[id] = { ...positions[id], owner: 'black' }; });
    expect(getWinner({ ...state, positions })).toBe('black');
  });

  it('returns white when white owns more positions', () => {
    const state = fillAllGates(createInitialState(), 'white');
    const positions = { ...state.positions };
    const posIds = Object.keys(positions) as Array<keyof typeof positions>;
    posIds.forEach((id) => { positions[id] = { ...positions[id], owner: 'white' }; });
    expect(getWinner({ ...state, positions })).toBe('white');
  });
});

// ---------- getAvailableBuildOptions (skip guard boundary) ----------

describe('getAvailableBuildOptions — boundary for skip guard', () => {
  it('reports hasAny=true when all gates of a position have open large slots', () => {
    const state = createInitialState();
    const opts = getAvailableBuildOptions(state, 'A');
    expect(opts.hasAny).toBe(true);
    expect(opts.massiveGateIds.length).toBeGreaterThan(0);
  });

  it('reports hasAny=false when all gates of position A are completely filled', () => {
    const state = createInitialState();
    // Position A → gates [1, 2, 7, 12]
    const next: GameState = {
      ...state,
      gates: {
        ...state.gates,
        1: fillGate(state.gates[1], 'black'),
        2: fillGate(state.gates[2], 'black'),
        7: fillGate(state.gates[7], 'black'),
        12: fillGate(state.gates[12], 'black'),
      }
    };
    const opts = getAvailableBuildOptions(next, 'A');
    expect(opts.hasAny).toBe(false);
    expect(opts.massiveGateIds).toHaveLength(0);
    expect(opts.selectivePairs).toHaveLength(0);
    expect(opts.quadAvailable).toBe(false);
  });

  it('selectivePairs includes pair where only one gate has a middle slot', () => {
    const state = createInitialState();
    // Fill gate 1 middle slots completely, gate 2 still has space
    const gate1Full = {
      ...state.gates[1],
      middleSlots: [{ size: 'middle', owner: 'black' }, { size: 'middle', owner: 'black' }] as Asset[],
    };
    const next: GameState = {
      ...state,
      gates: { ...state.gates, 1: gate1Full }
    };
    const opts = getAvailableBuildOptions(next, 'A');
    // Pairs involving gate 2 (which has empty middle slots) should exist
    const pairsWithGate2 = opts.selectivePairs.filter((p) => p.includes(2));
    expect(pairsWithGate2.length).toBeGreaterThan(0);
  });

  it('quadAvailable=true when at least one gate has a small slot', () => {
    const state = createInitialState();
    // Fill small slots of gates 1, 2, 7 but not 12 (Position A)
    const fillSmall = (gate: GateState): GateState => ({
      ...gate,
      smallSlots: gate.smallSlots.map(() => ({ size: 'small', owner: 'black' } as Asset)),
    });
    const next: GameState = {
      ...state,
      gates: {
        ...state.gates,
        1: fillSmall(state.gates[1]),
        2: fillSmall(state.gates[2]),
        7: fillSmall(state.gates[7]),
        // gate 12 still has small slots
      }
    };
    const opts = getAvailableBuildOptions(next, 'A');
    expect(opts.quadAvailable).toBe(true);
  });

  it('quadAvailable=false when all gates of position have no small slots', () => {
    const state = createInitialState();
    const fillSmall = (gate: GateState): GateState => ({
      ...gate,
      smallSlots: gate.smallSlots.map(() => ({ size: 'small', owner: 'black' } as Asset)),
    });
    const next: GameState = {
      ...state,
      gates: {
        ...state.gates,
        1: fillSmall(state.gates[1]),
        2: fillSmall(state.gates[2]),
        7: fillSmall(state.gates[7]),
        12: fillSmall(state.gates[12]),
      }
    };
    const opts = getAvailableBuildOptions(next, 'A');
    expect(opts.quadAvailable).toBe(false);
  });
});
