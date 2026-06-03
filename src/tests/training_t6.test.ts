import { describe, it, expect } from 'vitest';
import { T6_ASSET_VALUES } from '../training/tasks/T6_asset_values';
import { validateMove } from '../training/validateMove';
import { applyMassiveBuild } from '../game/engine';
import { gatePlayerValue, assetValue } from '../game/build';

describe('T6_asset_values', () => {
  const task = T6_ASSET_VALUES;

  it('task structure is valid', () => {
    expect(task.id).toBe('T6_asset_values');
    expect(task.steps).toHaveLength(1);
    const s = task.steps[0];
    expect(s).toBeDefined();
    expect(s!.kind).toBe('user_move');
  });

  it('asset value constants: Small=1, Middle=8, Large=64', () => {
    expect(assetValue('small')).toBe(1);
    expect(assetValue('middle')).toBe(8);
    expect(assetValue('large')).toBe(64);
  });

  it('initialState has Gate 1 with Black small and White small (value 1 each)', () => {
    const gate1 = task.initialState.gates[1];
    const blackVal = gatePlayerValue(gate1, 'black');
    const whiteVal = gatePlayerValue(gate1, 'white');
    expect(blackVal).toBe(1);
    expect(whiteVal).toBe(1);
  });

  it('initialState has Gate 7 with Black middle(8) and White small(1)', () => {
    const gate7 = task.initialState.gates[7];
    const blackVal = gatePlayerValue(gate7, 'black');
    const whiteVal = gatePlayerValue(gate7, 'white');
    expect(blackVal).toBe(8);
    expect(whiteVal).toBe(1);
  });

  it('initialState Gate 5 is empty', () => {
    const gate5 = task.initialState.gates[5];
    const total = gatePlayerValue(gate5, 'black') + gatePlayerValue(gate5, 'white');
    expect(total).toBe(0);
  });

  it('correct move: Position J + Massive Build to Gate 5 passes validation', () => {
    const s = task.steps[0];
    if (!s || s.kind !== 'user_move') return;

    const stateWithPos = {
      ...task.initialState,
      selectedPosition: 'J' as const,
    };
    const nextState = applyMassiveBuild(stateWithPos, 5);
    const lastRecord = nextState.history[nextState.history.length - 1];
    expect(lastRecord).toBeDefined();
    if (!lastRecord) return;

    const result = validateMove(lastRecord, s.expected);
    expect(result).toBe(true);
  });

  it('after correct move, Gate 5 Black value equals 64', () => {
    const stateWithPos = {
      ...task.initialState,
      selectedPosition: 'J' as const,
    };
    const nextState = applyMassiveBuild(stateWithPos, 5);
    const gate5 = nextState.gates[5];
    const blackVal = gatePlayerValue(gate5, 'black');
    expect(blackVal).toBe(64);
  });

  it('Large(64) outweighs any combination of Middle(8) and Small(1)', () => {
    // Max possible without Large: 2*Middle + 4*Small = 16 + 4 = 20 per gate per player
    const maxWithoutLarge = 2 * assetValue('middle') + 4 * assetValue('small');
    expect(assetValue('large')).toBeGreaterThan(maxWithoutLarge);
  });

  it('wrong move: Massive to Gate 7 instead of Gate 5 is rejected', () => {
    const s = task.steps[0];
    if (!s || s.kind !== 'user_move') return;

    const stateWithPos = {
      ...task.initialState,
      selectedPosition: 'J' as const,
    };
    const nextState = applyMassiveBuild(stateWithPos, 7);
    const lastRecord = nextState.history[nextState.history.length - 1];
    if (!lastRecord) return;
    const result = validateMove(lastRecord, s.expected);
    expect(result).toBe(false);
  });

  it('wrong move: different position is rejected', () => {
    const s = task.steps[0];
    if (!s || s.kind !== 'user_move') return;

    const stateWithPos = {
      ...task.initialState,
      selectedPosition: 'H' as const,
    };
    const nextState = applyMassiveBuild(stateWithPos, 5);
    const lastRecord = nextState.history[nextState.history.length - 1];
    if (!lastRecord) return;
    const result = validateMove(lastRecord, s.expected);
    expect(result).toBe(false);
  });
});
