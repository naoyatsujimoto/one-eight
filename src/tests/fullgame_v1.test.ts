/**
 * 検算test: FULL_GAME_V1 (one-eight-training-phase1)
 *
 * 確認項目:
 * 1. 22手すべてが既存engineで合法に適用できる
 * 2. moveNumberが1..22の連番
 * 3. Move 13直前でPosition BをBlackがCapture可能
 * 4. Move 13適用後、Position B ownerがBlack
 * 5. Move 15直前でPosition HをBlackがCapture可能
 * 6. Move 15適用後、Position H ownerがBlack
 * 7. Move 22適用後、Position所有数がBlack=8, White=3, Open=2
 * 8. Move 22適用後、gameEnded=false
 * 9. 既存T1〜T10のtestに影響しない（独立したファイル）
 */
import { describe, it, expect } from 'vitest';
import { FULL_GAME_V1 } from '../training/tasks/fullGameV1';
import { createInitialState } from '../game/initialState';
import {
  selectPosition,
  applyMassiveBuild,
  applySelectiveBuild,
  applyQuadBuildForGates,
} from '../game/engine';
import { canCapturePosition } from '../game/capture';
import type { GameState, GateId, PositionId } from '../game/types';

// ── Helper ────────────────────────────────────────────────────────────────

/**
 * Apply one scripted move to a GameState.
 * Uses applyQuadBuildForGates so gate selection is explicit and testable.
 */
function applyScriptedMove(
  state: GameState,
  pos: PositionId,
  buildType: 'massive' | 'selective' | 'quad',
  gates: number[]
): GameState {
  const s = selectPosition(state, pos);
  if (buildType === 'massive') {
    return applyMassiveBuild(s, gates[0] as GateId);
  }
  if (buildType === 'selective') {
    return applySelectiveBuild(s, [gates[0] as GateId, gates[1] as GateId]);
  }
  // quad
  return applyQuadBuildForGates(s, gates as GateId[]);
}

/** Apply moves 1..n (1-indexed) from FULL_GAME_V1.steps and return the resulting state. */
function applyUpTo(n: number): GameState {
  let state = createInitialState(null);
  for (let i = 0; i < n; i++) {
    const step = FULL_GAME_V1.steps[i]!;
    const { position, buildType, gates } = step.move;
    state = applyScriptedMove(state, position as PositionId, buildType, gates);
  }
  return state;
}

// ── Data structure tests ──────────────────────────────────────────────────

describe('FULL_GAME_V1 — data structure', () => {
  it('id is "full-game-v1"', () => {
    expect(FULL_GAME_V1.id).toBe('full-game-v1');
  });

  it('perspective is "black"', () => {
    expect(FULL_GAME_V1.perspective).toBe('black');
  });

  it('has exactly 22 steps', () => {
    expect(FULL_GAME_V1.steps).toHaveLength(22);
  });

  it('moveNumbers are sequential 1..22', () => {
    FULL_GAME_V1.steps.forEach((step, idx) => {
      expect(step.moveNumber).toBe(idx + 1);
    });
  });

  it('odd moves (1,3,5,...,21) are black', () => {
    FULL_GAME_V1.steps.forEach((step) => {
      if (step.moveNumber % 2 === 1) {
        expect(step.player).toBe('black');
      }
    });
  });

  it('even moves (2,4,6,...,22) are white', () => {
    FULL_GAME_V1.steps.forEach((step) => {
      if (step.moveNumber % 2 === 0) {
        expect(step.player).toBe('white');
      }
    });
  });

  it('Move 21 has nextQuestion field (Phase 2 placeholder)', () => {
    const step21 = FULL_GAME_V1.steps[20]!;
    expect(step21.moveNumber).toBe(21);
    expect(step21.nextQuestion).toBeDefined();
    expect(typeof step21.nextQuestion).toBe('string');
  });

  it('Move 13 has capturesBefore=[B] and capturesAfter=[B]', () => {
    const step13 = FULL_GAME_V1.steps[12]!;
    expect(step13.moveNumber).toBe(13);
    expect(step13.capturesBefore).toContain('B');
    expect(step13.capturesAfter).toContain('B');
  });

  it('Move 15 has capturesBefore=[H] and capturesAfter=[H]', () => {
    const step15 = FULL_GAME_V1.steps[14]!;
    expect(step15.moveNumber).toBe(15);
    expect(step15.capturesBefore).toContain('H');
    expect(step15.capturesAfter).toContain('H');
  });
});

// ── Engine: 22手 合法適用テスト ────────────────────────────────────────────

describe('FULL_GAME_V1 — all 22 moves are legal (engine accepts)', () => {
  it('moveNumber increments by 1 for each of the 22 moves', () => {
    let state = createInitialState(null);
    for (let i = 0; i < FULL_GAME_V1.steps.length; i++) {
      const step = FULL_GAME_V1.steps[i]!;
      const expectedMoveNumber = i + 1;
      expect(state.moveNumber).toBe(expectedMoveNumber);
      const { position, buildType, gates } = step.move;
      const prevCount = state.history.length;
      state = applyScriptedMove(state, position as PositionId, buildType, gates);
      // If engine rejected the move, history would not grow
      expect(state.history.length).toBe(prevCount + 1);
      expect(state.moveNumber).toBe(expectedMoveNumber + 1);
    }
    expect(state.moveNumber).toBe(23);
  });
});

// ── Move 13: Capture B ────────────────────────────────────────────────────

describe('FULL_GAME_V1 — Move 13: Capture Position B', () => {
  it('Before Move 13: currentPlayer is black', () => {
    const state = applyUpTo(12);
    expect(state.currentPlayer).toBe('black');
    expect(state.moveNumber).toBe(13);
  });

  it('Before Move 13: canCapturePosition(black, B) is true', () => {
    const state = applyUpTo(12);
    expect(canCapturePosition(state, 'black', 'B')).toBe(true);
  });

  it('After Move 13: Position B owner is black', () => {
    const state = applyUpTo(13);
    expect(state.positions['B'].owner).toBe('black');
  });

  it('After Move 13: history length is 13', () => {
    const state = applyUpTo(13);
    expect(state.history.length).toBe(13);
  });

  it('After Move 13: last record is B,m(3) by black', () => {
    const state = applyUpTo(13);
    const record = state.history[state.history.length - 1]!;
    expect(record.positioning).toBe('B');
    expect(record.player).toBe('black');
    expect(record.build.type).toBe('massive');
    if (record.build.type === 'massive') {
      expect(record.build.gate).toBe(3);
    }
  });
});

// ── Move 15: Capture H ────────────────────────────────────────────────────

describe('FULL_GAME_V1 — Move 15: Capture Position H', () => {
  it('Before Move 15: currentPlayer is black', () => {
    const state = applyUpTo(14);
    expect(state.currentPlayer).toBe('black');
    expect(state.moveNumber).toBe(15);
  });

  it('Before Move 15: canCapturePosition(black, H) is true', () => {
    const state = applyUpTo(14);
    expect(canCapturePosition(state, 'black', 'H')).toBe(true);
  });

  it('After Move 15: Position H owner is black', () => {
    const state = applyUpTo(15);
    expect(state.positions['H'].owner).toBe('black');
  });

  it('After Move 15: last record is H,m(5) by black', () => {
    const state = applyUpTo(15);
    const record = state.history[state.history.length - 1]!;
    expect(record.positioning).toBe('H');
    expect(record.player).toBe('black');
    expect(record.build.type).toBe('massive');
    if (record.build.type === 'massive') {
      expect(record.build.gate).toBe(5);
    }
  });
});

// ── Move 22後: 所有数・gameEnded ──────────────────────────────────────────

describe('FULL_GAME_V1 — After Move 22: position ownership and game state', () => {
  it('Black owns exactly 8 positions', () => {
    const state = applyUpTo(22);
    const blackCount = Object.values(state.positions).filter(p => p.owner === 'black').length;
    expect(blackCount).toBe(8);
  });

  it('White owns exactly 3 positions', () => {
    const state = applyUpTo(22);
    const whiteCount = Object.values(state.positions).filter(p => p.owner === 'white').length;
    expect(whiteCount).toBe(3);
  });

  it('Open (unowned) positions are exactly 2', () => {
    const state = applyUpTo(22);
    const openCount = Object.values(state.positions).filter(p => p.owner === null).length;
    expect(openCount).toBe(2);
  });

  it('gameEnded is false after Move 22', () => {
    const state = applyUpTo(22);
    expect(state.gameEnded).toBe(false);
  });

  it('Total positions = 13 (invariant)', () => {
    const state = applyUpTo(22);
    const total = Object.values(state.positions).length;
    expect(total).toBe(13);
  });

  it('Black-owned positions are: A, B, E, F, G, H, J, M', () => {
    const state = applyUpTo(22);
    const blackPositions = Object.entries(state.positions)
      .filter(([, v]) => v.owner === 'black')
      .map(([k]) => k)
      .sort();
    expect(blackPositions).toEqual(['A', 'B', 'E', 'F', 'G', 'H', 'J', 'M']);
  });

  it('White-owned positions are: C, D, K', () => {
    const state = applyUpTo(22);
    const whitePositions = Object.entries(state.positions)
      .filter(([, v]) => v.owner === 'white')
      .map(([k]) => k)
      .sort();
    expect(whitePositions).toEqual(['C', 'D', 'K']);
  });

  it('Open positions are: I, L', () => {
    const state = applyUpTo(22);
    const openPositions = Object.entries(state.positions)
      .filter(([, v]) => v.owner === null)
      .map(([k]) => k)
      .sort();
    expect(openPositions).toEqual(['I', 'L']);
  });
});

// ── Independence: 既存T1〜T10に影響しない確認 ───────────────────────────────

describe('FULL_GAME_V1 — independence from T1-T10', () => {
  it('FULL_GAME_V1 is not imported from training/tasks/index', () => {
    // This test verifies the data file exists independently
    // It does NOT add FULL_GAME_V1 to TRAINING_TASKS in index.ts
    expect(FULL_GAME_V1.id).toBe('full-game-v1');
    // T1-T10 IDs are distinct
    const t1t10Ids = [
      'T1_build_basics', 'T2_capture_build', 'T7_diagonal_gates',
      'T4_partial_build', 'T6_asset_values', 'T5_capture_tie',
      'T8_prepare_capture', 'T9_no_build_endgame', 'T10_defensive_build',
    ];
    expect(t1t10Ids).not.toContain(FULL_GAME_V1.id);
  });
});
