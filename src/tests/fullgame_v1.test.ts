/**
 * 検算test: FULL_GAME_V1 (61ステップ、moveNumber 0..60)
 *
 * 確認項目:
 * 1. 61ステップのデータ構造確認
 * 2. user/auto/pass kindのmoveのみ applyScriptedMove を実行し合法確認
 * 3. intro / select_only はゲーム状態変化なし確認
 * 4. M51後: gameEnded=true / Black=9 / White=4
 * 5. 「ポケット」という文字列がテキストファイルに存在しないこと
 */
import { describe, it, expect } from 'vitest';
import { FULL_GAME_V1 } from '../training/tasks/fullGameV1';
import { FULL_GAME_V1_TEXT } from '../training/tasks/fullGameV1Text';
import { createInitialState } from '../game/initialState';
import { applyScriptedMove } from '../training/fullGameUtils';
import type { GameState } from '../game/types';

// ── Helper ────────────────────────────────────────────────────────────────

/**
 * Apply all moves up to (but not including) stepIndex.
 * intro / select_only steps are skipped (no game state change).
 * pass steps apply applyAutoPass via applyScriptedMove.
 */
function applyUpTo(stepCount: number): GameState {
  let state = createInitialState(null);
  for (let i = 0; i < stepCount && i < FULL_GAME_V1.steps.length; i++) {
    const step = FULL_GAME_V1.steps[i]!;
    if (step.kind === 'intro' || step.kind === 'select_only') continue;
    if (!step.move) continue;
    state = applyScriptedMove(state, step.move);
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

  it('has exactly 61 steps', () => {
    expect(FULL_GAME_V1.steps).toHaveLength(61);
  });

  it('moveNumbers are 0..60', () => {
    FULL_GAME_V1.steps.forEach((step, idx) => {
      expect(step.moveNumber).toBe(idx);
    });
  });

  it('step 0 (M0) is intro with player none', () => {
    const step = FULL_GAME_V1.steps[0]!;
    expect(step.kind).toBe('intro');
    expect(step.player).toBe('none');
  });

  it('M50 (moveNumber 59) is pass kind', () => {
    const step = FULL_GAME_V1.steps[59]!;
    expect(step.moveNumber).toBe(59);
    expect(step.kind).toBe('pass');
  });

  it('M51 (moveNumber 60) is user kind', () => {
    const step = FULL_GAME_V1.steps[60]!;
    expect(step.moveNumber).toBe(60);
    expect(step.kind).toBe('user');
  });

  it('user steps have expectedMove defined', () => {
    FULL_GAME_V1.steps
      .filter(s => s.kind === 'user')
      .forEach(s => {
        expect(s.expectedMove).toBeDefined();
      });
  });

  it('select_only steps have expectedPosition defined', () => {
    FULL_GAME_V1.steps
      .filter(s => s.kind === 'select_only')
      .forEach(s => {
        expect(s.expectedPosition).toBeDefined();
      });
  });

  it('auto steps have move defined', () => {
    FULL_GAME_V1.steps
      .filter(s => s.kind === 'auto')
      .forEach(s => {
        expect(s.move).toBeDefined();
      });
  });
});

// ── Engine: 全ムーブ合法適用テスト ──────────────────────────────────────────

describe('FULL_GAME_V1 — all moves are legal (engine accepts)', () => {
  it('applying all user/auto/pass moves produces a valid history', () => {
    let state = createInitialState(null);
    let histCount = 0;
    for (const step of FULL_GAME_V1.steps) {
      if (step.kind === 'intro' || step.kind === 'select_only') continue;
      if (!step.move) continue;
      const prev = state.history.length;
      state = applyScriptedMove(state, step.move);
      // pass steps may or may not add history depending on engine impl
      if (step.kind !== 'pass') {
        expect(state.history.length).toBeGreaterThan(prev);
      }
      histCount++;
    }
    expect(histCount).toBeGreaterThan(0);
  });
});

// ── M51後: gameEnded/スコア確認 ────────────────────────────────────────────

describe('FULL_GAME_V1 — After M51 (all 61 steps applied): game ended and scores', () => {
  it('gameEnded is true after M51', () => {
    const state = applyUpTo(61);
    expect(state.gameEnded).toBe(true);
  });

  it('Black owns exactly 9 positions', () => {
    const state = applyUpTo(61);
    const blackCount = Object.values(state.positions).filter(p => p.owner === 'black').length;
    expect(blackCount).toBe(9);
  });

  it('White owns exactly 4 positions', () => {
    const state = applyUpTo(61);
    const whiteCount = Object.values(state.positions).filter(p => p.owner === 'white').length;
    expect(whiteCount).toBe(4);
  });

  it('Total positions = 13 (invariant)', () => {
    const state = applyUpTo(61);
    const total = Object.values(state.positions).length;
    expect(total).toBe(13);
  });
});

// ── intro/select_only はゲーム状態変化なし確認 ────────────────────────────

describe('FULL_GAME_V1 — intro/select_only do not change game state', () => {
  it('step 0 (intro) has no move', () => {
    const step = FULL_GAME_V1.steps[0]!;
    expect(step.move).toBeUndefined();
  });

  it('select_only steps have no move', () => {
    FULL_GAME_V1.steps
      .filter(s => s.kind === 'select_only')
      .forEach(s => {
        expect(s.move).toBeUndefined();
      });
  });
});

// ── 「ポケット」禁止チェック ────────────────────────────────────────────────

describe('FULL_GAME_V1_TEXT — no "ポケット" in text', () => {
  it('fullGameV1Text contains no "ポケット"', () => {
    const allText = JSON.stringify(FULL_GAME_V1_TEXT);
    expect(allText).not.toContain('ポケット');
  });
});

// ── independence ────────────────────────────────────────────────────────────

describe('FULL_GAME_V1 — independence from T1-T10', () => {
  it('id is distinct from T1-T10 IDs', () => {
    const t1t10Ids = [
      'T1_build_basics', 'T2_capture_build', 'T7_diagonal_gates',
      'T4_partial_build', 'T6_asset_values', 'T5_capture_tie',
      'T8_prepare_capture', 'T9_no_build_endgame', 'T10_defensive_build',
    ];
    expect(t1t10Ids).not.toContain(FULL_GAME_V1.id);
  });
});
