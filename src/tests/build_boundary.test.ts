import { describe, expect, it } from 'vitest';
import {
  applyMassiveToGate,
  applyQuadToGate,
  applySelectiveToGate,
  canMassiveBuild,
  canQuadBuild,
  canSelectiveBuild,
} from '../game/build';
import { createInitialState } from '../game/initialState';
import type { Asset, GateState } from '../game/types';

// ---------- Massive build boundary ----------

describe('Massive build — boundary', () => {
  it('placed=0 when both large slots are already occupied', () => {
    const state = createInitialState();
    let gate = state.gates[1];
    gate = applyMassiveToGate(gate, 'black').gate;
    gate = applyMassiveToGate(gate, 'black').gate;
    const result = applyMassiveToGate(gate, 'black');
    expect(result.placed).toBe(0);
  });

  it('canMassiveBuild returns false when both large slots are full', () => {
    const state = createInitialState();
    const gate: GateState = {
      ...state.gates[1],
      largeSlots: [
        { size: 'large', owner: 'black' } as Asset,
        { size: 'large', owner: 'white' } as Asset,
      ]
    };
    expect(canMassiveBuild(gate)).toBe(false);
  });

  it('canMassiveBuild returns true when one large slot is free', () => {
    const state = createInitialState();
    const gate: GateState = {
      ...state.gates[1],
      largeSlots: [{ size: 'large', owner: 'black' } as Asset, null],
    };
    expect(canMassiveBuild(gate)).toBe(true);
  });
});

// ---------- Selective build boundary ----------

describe('Selective build — boundary', () => {
  it('canSelectiveBuild returns false for the same gate id', () => {
    const state = createInitialState();
    expect(canSelectiveBuild(state.gates[1], state.gates[1])).toBe(false);
  });

  it('canSelectiveBuild returns false when both gates have no middle slots', () => {
    const fillMiddle = (gate: GateState): GateState => ({
      ...gate,
      middleSlots: gate.middleSlots.map(() => ({ size: 'middle', owner: 'black' } as Asset)),
    });
    const state = createInitialState();
    const gateA = fillMiddle(state.gates[1]);
    const gateB = fillMiddle(state.gates[2]);
    expect(canSelectiveBuild(gateA, gateB)).toBe(false);
  });

  it('canSelectiveBuild returns true when only one gate has a free middle slot', () => {
    const state = createInitialState();
    const fillMiddle = (gate: GateState): GateState => ({
      ...gate,
      middleSlots: gate.middleSlots.map(() => ({ size: 'middle', owner: 'black' } as Asset)),
    });
    const gateA = fillMiddle(state.gates[1]); // no middle slots available
    const gateB = state.gates[2]; // has middle slots available
    expect(canSelectiveBuild(gateA, gateB)).toBe(true);
  });

  it('applySelectiveToGate placed=0 when middle slots are all full', () => {
    const state = createInitialState();
    let gate = state.gates[1];
    gate = applySelectiveToGate(gate, 'black').gate;
    gate = applySelectiveToGate(gate, 'black').gate;
    const result = applySelectiveToGate(gate, 'black');
    expect(result.placed).toBe(0);
  });

  it('applySelectiveToGate placed=1 when one middle slot is free', () => {
    const state = createInitialState();
    let gate = state.gates[1];
    gate = applySelectiveToGate(gate, 'black').gate; // fills first slot
    const result = applySelectiveToGate(gate, 'black'); // fills second slot
    expect(result.placed).toBe(1);
  });
});

// ---------- Quad build boundary ----------

describe('Quad build — boundary', () => {
  it('canQuadBuild returns false when all gates have no small slots', () => {
    const state = createInitialState();
    const fillSmall = (gate: GateState): GateState => ({
      ...gate,
      smallSlots: gate.smallSlots.map(() => ({ size: 'small', owner: 'black' } as Asset)),
    });
    const gates = Object.values(state.gates).map(fillSmall);
    expect(canQuadBuild(gates)).toBe(false);
  });

  it('canQuadBuild returns true when at least one gate has a small slot', () => {
    const state = createInitialState();
    const fillSmall = (gate: GateState): GateState => ({
      ...gate,
      smallSlots: gate.smallSlots.map(() => ({ size: 'small', owner: 'black' } as Asset)),
    });
    const gates = Object.values(state.gates).map((g, i) => (i === 0 ? g : fillSmall(g)));
    expect(canQuadBuild(gates)).toBe(true);
  });

  it('applyQuadToGate placed=0 when all small slots are full', () => {
    const state = createInitialState();
    let gate = state.gates[1];
    for (let i = 0; i < 4; i += 1) gate = applyQuadToGate(gate, 'black').gate;
    const result = applyQuadToGate(gate, 'black');
    expect(result.placed).toBe(0);
    expect(gate.smallSlots.every(Boolean)).toBe(true);
  });

  it('fills exactly 4 small slots on a gate', () => {
    const state = createInitialState();
    let gate = state.gates[1];
    let total = 0;
    for (let i = 0; i < 4; i += 1) {
      const r = applyQuadToGate(gate, 'black');
      total += r.placed;
      gate = r.gate;
    }
    expect(total).toBe(4);
  });
});
