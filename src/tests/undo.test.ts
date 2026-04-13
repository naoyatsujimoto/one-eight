/**
 * Undo logic unit tests.
 *
 * The undo stack is managed inside App (React state), so we test the pure engine
 * logic that Undo depends on: that states can be fully restored by keeping a
 * snapshot before each finalized turn.
 *
 * We simulate the same snapshot-and-restore pattern that App.tsx uses.
 */

import { describe, expect, it } from 'vitest';
import {
  applyMassiveBuild,
  applySelectiveBuild,
  resetGame,
  selectPosition,
  skipTurn,
} from '../game/engine';
import type { GameState } from '../game/types';

// ---------------------------------------------------------------------------
// Helper: pick the first massive-eligible gate for a given position
// ---------------------------------------------------------------------------
import { POSITION_TO_GATES } from '../game/constants';

function playOneTurn(state: GameState): { before: GameState; after: GameState } {
  const posId = 'A'; // A is always available at game start
  const after1 = selectPosition(state, posId);
  const gateId = POSITION_TO_GATES[posId][0]!;
  const after2 = applyMassiveBuild(after1, gateId);
  return { before: state, after: after2 };
}

// ---------------------------------------------------------------------------
describe('Undo – Human vs Human', () => {
  it('restores state after 1 turn', () => {
    const initial = resetGame(null);
    const { before, after } = playOneTurn(initial);

    // Stack before undo: [before]
    const stack: GameState[] = [before];

    // Undo: pop stack, restore
    const restored = stack[stack.length - 1]!;
    const newStack = stack.slice(0, -1);

    expect(restored.moveNumber).toBe(before.moveNumber);
    expect(restored.currentPlayer).toBe(before.currentPlayer);
    expect(restored.history.length).toBe(before.history.length);
    expect(newStack.length).toBe(0);

    // The state we got AFTER the turn is different
    expect(after.moveNumber).not.toBe(before.moveNumber);
  });

  it('restores state after 2 turns, one undo at a time', () => {
    const initial = resetGame(null);

    // Turn 1: black plays on 'A'
    const s0 = initial;
    const s1 = (() => {
      const sel = selectPosition(initial, 'A');
      return applyMassiveBuild(sel, POSITION_TO_GATES['A'][0]!);
    })();
    expect(s1.history.length).toBe(1);
    expect(s1.currentPlayer).toBe('white');

    // Turn 2: white skips (no selectedPosition → skip is always available)
    const s1b = s1; // snapshot before turn 2
    const s2 = skipTurn(s1);
    expect(s2.history.length).toBe(2); // sanity
    expect(s2.currentPlayer).toBe('black');

    const stack: GameState[] = [s0, s1b];

    // Undo turn 2
    const r2 = stack[stack.length - 1]!;
    const stack2 = stack.slice(0, -1);
    expect(r2.currentPlayer).toBe(s1.currentPlayer);
    expect(r2.history.length).toBe(s1.history.length);

    // Undo turn 1
    const r1 = stack2[stack2.length - 1]!;
    const stack3 = stack2.slice(0, -1);
    expect(r1.currentPlayer).toBe(initial.currentPlayer);
    expect(r1.history.length).toBe(0);
    expect(stack3.length).toBe(0);
  });

  it('selectedPosition is null after undo (start-of-turn snapshot)', () => {
    const initial = resetGame(null);
    // selectPosition does NOT push to undo stack (it's mid-turn UI state)
    const afterSelect = selectPosition(initial, 'A');
    expect(afterSelect.selectedPosition).toBe('A');

    // The snapshot in undo stack is initial (before select)
    const restored = initial;
    expect(restored.selectedPosition).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('Undo – Human vs CPU', () => {
  /**
   * Simulate one human turn + one CPU turn, building the undo stack
   * the same way App.tsx does:
   *   - push snapshot BEFORE human finalises → beforeHuman
   *   - push snapshot BEFORE CPU finalises   → beforeCpu
   *
   * On undo we scan backwards to find the first snapshot where
   * currentPlayer !== cpuPlayer.
   */
  it('restores to before human turn after one full round', () => {
    const cpuPlayer = 'white' as const;
    const initial = resetGame(cpuPlayer);

    // ── Human turn (black) ──
    const beforeHuman = initial; // snapshot pushed before human finalises
    const afterHuman = (() => {
      const s = selectPosition(initial, 'A');
      return applyMassiveBuild(s, POSITION_TO_GATES['A'][0]!);
    })();

    // ── CPU turn (white) ──
    const beforeCpu = afterHuman; // snapshot pushed before CPU finalises
    const afterCpu = (() => {
      const s = selectPosition(afterHuman, 'B');
      return applyMassiveBuild(s, POSITION_TO_GATES['B'][0]!);
    })();

    const stack: GameState[] = [beforeHuman, beforeCpu];

    // --- Undo logic (mirrors App.handleUndo for Human vs CPU) ---
    let targetIdx = stack.length - 1;
    while (targetIdx >= 0 && stack[targetIdx]?.currentPlayer === cpuPlayer) {
      targetIdx--;
    }
    expect(targetIdx).toBeGreaterThanOrEqual(0);
    const restored = stack[targetIdx]!;
    const newStack = stack.slice(0, targetIdx);

    // Should have restored to beforeHuman
    expect(restored.moveNumber).toBe(beforeHuman.moveNumber);
    expect(restored.currentPlayer).toBe('black');
    expect(restored.history.length).toBe(0);
    expect(newStack.length).toBe(0);

    // afterCpu has 2 history entries
    expect(afterCpu.history.length).toBe(2);
  });

  it('canUndo is false when stack is empty', () => {
    const stack: GameState[] = [];
    const canUndo = stack.length > 0;
    expect(canUndo).toBe(false);
  });

  it('history and gates are consistent after undo restore', () => {
    const cpuPlayer = 'white' as const;
    const initial = resetGame(cpuPlayer);

    const beforeHuman = initial;
    const s1 = selectPosition(initial, 'C');
    const afterHuman = applyMassiveBuild(s1, POSITION_TO_GATES['C'][0]!);

    const beforeCpu = afterHuman;
    const s2 = selectPosition(afterHuman, 'D');
    const afterCpu = applyMassiveBuild(s2, POSITION_TO_GATES['D'][0]!);

    expect(afterCpu.history.length).toBe(2);

    const stack: GameState[] = [beforeHuman, beforeCpu];
    let targetIdx = stack.length - 1;
    while (targetIdx >= 0 && stack[targetIdx]?.currentPlayer === cpuPlayer) {
      targetIdx--;
    }
    const restored = stack[targetIdx]!;

    // Gates should match the snapshot (no assets placed yet)
    expect(restored.gates).toEqual(beforeHuman.gates);
    expect(restored.positions).toEqual(beforeHuman.positions);
  });
});

// ---------------------------------------------------------------------------
describe('Undo – skip turn', () => {
  it('can undo a skipped turn (Human vs Human)', () => {
    const initial = resetGame(null);
    // skip requires no build options; force by keeping selectedPosition null
    const afterSkip = skipTurn(initial);
    expect(afterSkip.moveNumber).toBe(2);

    const stack: GameState[] = [initial];
    const restored = stack[stack.length - 1]!;
    expect(restored.moveNumber).toBe(1);
    expect(restored.currentPlayer).toBe('black');
  });
});

// ---------------------------------------------------------------------------
describe('Undo – selective build', () => {
  it('restores state after a selective build', () => {
    const initial = resetGame(null);
    // Position A connects to gates; use first two
    const gates = POSITION_TO_GATES['A'];
    if (gates.length < 2) return; // safety – skip if not enough gates

    const s1 = selectPosition(initial, 'A');
    const afterSelective = applySelectiveBuild(s1, [gates[0]!, gates[1]!]);
    expect(afterSelective.history.length).toBe(1);

    const stack: GameState[] = [initial];
    const restored = stack[0]!;
    expect(restored.history.length).toBe(0);
    expect(restored.currentPlayer).toBe('black');
  });
});
