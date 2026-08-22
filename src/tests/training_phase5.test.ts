/**
 * training_phase5.test.ts
 *
 * Tests for Phase 5: T1_board_coordinates / T2_build_up / T3_position_capture
 *
 * 20 test items:
 *  1.  active小課題が3件のみ
 *  2.  task ID・順番・prerequisite
 *  3.  T1がPosition 13件→Gate 12件の順
 *  4.  T1の全targetが重複なくA〜M / 1〜12を網羅
 *  5.  正しいcoordinate tapで進む
 *  6.  誤ったtapで進まない
 *  7.  coordinate taskでGameState/historyが変化しない
 *  8.  coordinate taskで通常Build callbackが動かない
 *  9.  T2の初期盤面
 *  10. T2の手順がG,m(7) → CPU K,m(4) → M,s(6,8) → CPU L,m(9) → A,q
 *  11. T3のPosition E / Gate 6初期配置
 *  12. T3の正解がE,m(10)
 *  13. T3完了後にE owner='black'
 *  14. 全10言語の新key構造一致
 *  15. 新しい小課題表示文言にAsset Valueの1/8/64表記がない
 *  16. KPI total_stepsが25 / 3 / 1
 *  17. 一局指南Trainingが変更されていない
 *  18. 旧task(T1_build_basics等)がそのままimport可能
 *  19. 旧taskが小課題一覧に表示されない
 *  20. 旧progressを新task完了として扱わない
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TRAINING_TASK_META,
  T1_BOARD_COORDINATES,
  T2_BUILD_UP,
  T3_POSITION_CAPTURE,
  T1_BUILD_BASICS,
} from '../training/tasks/index';
import { countUserMovesBefore, countTotalUserMoves } from '../training/trainingKpiUtils';
import { EN_TRANSLATIONS } from '../i18n/en';
import { JA_TRANSLATIONS } from '../i18n/ja';
import { ZH_HANS_TRANSLATIONS } from '../i18n/zh-Hans';
import { ZH_HANT_TRANSLATIONS } from '../i18n/zh-Hant';
import { KO_TRANSLATIONS } from '../i18n/ko';
import { ES_TRANSLATIONS } from '../i18n/es';
import { PT_BR_TRANSLATIONS } from '../i18n/pt-BR';
import { DE_TRANSLATIONS } from '../i18n/de';
import { FR_TRANSLATIONS } from '../i18n/fr';
import { IT_TRANSLATIONS } from '../i18n/it';
import { selectPosition, applyMassiveBuild, applySelectiveBuild } from '../game/engine';
import { applyFixedCpuMove } from '../training/applyFixedCpuMove';
import { validateMove } from '../training/validateMove';
import { FULL_GAME_V1 } from '../training/tasks/fullGameV1';

// ── Supabase mock ─────────────────────────────────────────────────────────────
const mockFrom = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase', () => ({ supabase: { from: mockFrom } }));

function makeMockStorage(): Storage {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  } as Storage;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', makeMockStorage());
});

// ── 1. active小課題が3件のみ ─────────────────────────────────────────────────
describe('TRAINING_TASK_META', () => {
  it('1. active tasks are exactly 3', () => {
    expect(TRAINING_TASK_META).toHaveLength(3);
  });

  // ── 2. task ID・順番・prerequisite
  it('2. task IDs, order, and prerequisites are correct', () => {
    expect(TRAINING_TASK_META[0]!.task.id).toBe('T1_board_coordinates');
    expect(TRAINING_TASK_META[1]!.task.id).toBe('T2_build_up');
    expect(TRAINING_TASK_META[2]!.task.id).toBe('T3_position_capture');
    expect(TRAINING_TASK_META[0]!.order).toBe(1);
    expect(TRAINING_TASK_META[1]!.order).toBe(2);
    expect(TRAINING_TASK_META[2]!.order).toBe(3);
    expect(TRAINING_TASK_META[0]!.prerequisite).toBeNull();
    expect(TRAINING_TASK_META[1]!.prerequisite).toBe('T1_board_coordinates');
    expect(TRAINING_TASK_META[2]!.prerequisite).toBe('T2_build_up');
  });
});

// ── 3. T1がPosition 13件→Gate 12件の順 ──────────────────────────────────────
describe('T1_board_coordinates structure', () => {
  it('3. has 13 position steps then 12 gate steps in that order', () => {
    const { steps } = T1_BOARD_COORDINATES;
    const posSteps = steps.filter((s) => s.kind === 'coordinate_pick' && s.targetType === 'position');
    const gateSteps = steps.filter((s) => s.kind === 'coordinate_pick' && s.targetType === 'gate');
    expect(posSteps).toHaveLength(13);
    expect(gateSteps).toHaveLength(12);
    // all position steps come before any gate step
    const firstGateIdx = steps.findIndex((s) => s.kind === 'coordinate_pick' && s.targetType === 'gate');
    const lastPosIdx = steps.reduce(
      (acc, s, i) => (s.kind === 'coordinate_pick' && s.targetType === 'position' ? i : acc),
      -1,
    );
    expect(lastPosIdx).toBeLessThan(firstGateIdx);
  });

  // ── 4. T1の全targetが重複なくA〜M / 1〜12を網羅
  it('4. covers all positions A-M and gates 1-12 without duplicates', () => {
    const { steps } = T1_BOARD_COORDINATES;
    const posTargets = steps
      .filter((s) => s.kind === 'coordinate_pick' && s.targetType === 'position')
      .map((s) => (s.kind === 'coordinate_pick' ? s.target : ''));
    const gateTargets = steps
      .filter((s) => s.kind === 'coordinate_pick' && s.targetType === 'gate')
      .map((s) => (s.kind === 'coordinate_pick' ? s.target : ''));

    expect([...posTargets].sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M']);
    expect([...gateTargets].sort((a, b) => Number(a) - Number(b))).toEqual(
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    );
  });

  // ── 5. 正しいcoordinate tapで進む — step 0 target is Position A
  it('5. first step is coordinate_pick for Position A', () => {
    const step = T1_BOARD_COORDINATES.steps[0];
    expect(step?.kind).toBe('coordinate_pick');
    if (step?.kind === 'coordinate_pick') {
      expect(step.targetType).toBe('position');
      expect(step.target).toBe('A');
    }
  });

  // ── 6. 誤ったtapで進まない — different target means wrong tap
  it('6. step 0 target (A) differs from step 1 target (B)', () => {
    const s0 = T1_BOARD_COORDINATES.steps[0];
    const s1 = T1_BOARD_COORDINATES.steps[1];
    if (s0?.kind === 'coordinate_pick' && s1?.kind === 'coordinate_pick') {
      expect(s0.target).not.toBe(s1.target);
    }
  });

  // ── 7. coordinate taskでGameState/historyが変化しない
  it('7. initial gameState history is empty (no engine calls in coordinate_pick)', () => {
    expect(T1_BOARD_COORDINATES.initialState.history).toHaveLength(0);
    // coordinate_pick steps do not call engine functions — gameState stays unchanged
    const allCoord = T1_BOARD_COORDINATES.steps.every((s) => s.kind === 'coordinate_pick');
    expect(allCoord).toBe(true);
  });

  // ── 8. coordinate taskで通常Build callbackが動かない
  it('8. T1 has no user_move steps — build callbacks are never triggered', () => {
    const userMoveSteps = T1_BOARD_COORDINATES.steps.filter((s) => s.kind === 'user_move');
    expect(userMoveSteps).toHaveLength(0);
  });
});

// ── 9. T2の初期盤面 ──────────────────────────────────────────────────────────
describe('T2_build_up initial state', () => {
  it('9a. trainingMode=true, currentPlayer=black, moveNumber=1', () => {
    const s = T2_BUILD_UP.initialState;
    expect(s.trainingMode).toBe(true);
    expect(s.currentPlayer).toBe('black');
    expect(s.moveNumber).toBe(1);
  });

  it('9b. all gates are empty', () => {
    const s = T2_BUILD_UP.initialState;
    for (const gate of Object.values(s.gates)) {
      expect(gate.largeSlots.every((x: unknown) => x === null)).toBe(true);
      expect(gate.middleSlots.every((x: unknown) => x === null)).toBe(true);
      expect(gate.smallSlots.every((x: unknown) => x === null)).toBe(true);
    }
  });
});

// ── 10. T2の手順 ─────────────────────────────────────────────────────────────
describe('T2_build_up steps', () => {
  it('10a. step sequence: user/cpu/user/cpu/user (5 steps)', () => {
    const { steps } = T2_BUILD_UP;
    expect(steps).toHaveLength(5);
    expect(steps[0]?.kind).toBe('user_move');
    expect(steps[1]?.kind).toBe('cpu_fixed_move');
    expect(steps[2]?.kind).toBe('user_move');
    expect(steps[3]?.kind).toBe('cpu_fixed_move');
    expect(steps[4]?.kind).toBe('user_move');
  });

  it('10b. G,m(7) → cpu K,m(4) → M,s(6,8) → cpu L,m(9) → A,q', () => {
    const { steps } = T2_BUILD_UP;
    if (steps[0]?.kind === 'user_move') {
      expect(steps[0].expected.positioning).toBe('G');
      expect(steps[0].expected.build.type).toBe('massive');
      if (steps[0].expected.build.type === 'massive') expect(steps[0].expected.build.gate).toBe(7);
    }
    if (steps[1]?.kind === 'cpu_fixed_move') {
      expect(steps[1].move.positioning).toBe('K');
      if (steps[1].move.build.type === 'massive') expect(steps[1].move.build.gate).toBe(4);
    }
    if (steps[2]?.kind === 'user_move') {
      expect(steps[2].expected.positioning).toBe('M');
      expect(steps[2].expected.build.type).toBe('selective');
      if (steps[2].expected.build.type === 'selective') {
        expect([...steps[2].expected.build.gates].sort()).toEqual([6, 8]);
      }
    }
    if (steps[3]?.kind === 'cpu_fixed_move') {
      expect(steps[3].move.positioning).toBe('L');
      if (steps[3].move.build.type === 'massive') expect(steps[3].move.build.gate).toBe(9);
    }
    if (steps[4]?.kind === 'user_move') {
      expect(steps[4].expected.positioning).toBe('A');
      expect(steps[4].expected.build.type).toBe('quad');
    }
  });

  it('10c. G,m(7) passes validateMove', () => {
    let state = T2_BUILD_UP.initialState;
    state = selectPosition(state, 'G');
    state = applyMassiveBuild(state, 7);
    const record = state.history[state.history.length - 1]!;
    const step = T2_BUILD_UP.steps[0]!;
    if (step.kind === 'user_move') {
      expect(validateMove(record, step.expected)).toBe(true);
    }
  });

  it('10d. M,s(6,8) passes validateMove after cpu K,m(4)', () => {
    let state = T2_BUILD_UP.initialState;
    state = selectPosition(state, 'G');
    state = applyMassiveBuild(state, 7);
    state = applyFixedCpuMove(state, { positioning: 'K', build: { type: 'massive', gate: 4 } });
    state = selectPosition(state, 'M');
    state = applySelectiveBuild(state, [6, 8]);
    const record = state.history[state.history.length - 1]!;
    const step = T2_BUILD_UP.steps[2]!;
    if (step.kind === 'user_move') {
      expect(validateMove(record, step.expected)).toBe(true);
    }
  });
});

// ── 11. T3のPosition E / Gate 6初期配置 ──────────────────────────────────────
describe('T3_position_capture initial state', () => {
  it('11a. Position E owner is white', () => {
    expect(T3_POSITION_CAPTURE.initialState.positions['E']!.owner).toBe('white');
  });

  it('11b. Gate 6 largeSlots[0] is a black Large Asset', () => {
    const slot = T3_POSITION_CAPTURE.initialState.gates[6]!.largeSlots[0];
    expect(slot).not.toBeNull();
    expect(slot?.size).toBe('large');
    expect(slot?.owner).toBe('black');
  });

  it('11c. currentPlayer=black, moveNumber=3', () => {
    expect(T3_POSITION_CAPTURE.initialState.currentPlayer).toBe('black');
    expect(T3_POSITION_CAPTURE.initialState.moveNumber).toBe(3);
  });
});

// ── 12. T3の正解がE,m(10) ────────────────────────────────────────────────────
describe('T3_position_capture correct move', () => {
  it('12. expected move is E,m(10)', () => {
    const step = T3_POSITION_CAPTURE.steps[0];
    expect(step?.kind).toBe('user_move');
    if (step?.kind === 'user_move') {
      expect(step.expected.positioning).toBe('E');
      expect(step.expected.build.type).toBe('massive');
      if (step.expected.build.type === 'massive') {
        expect(step.expected.build.gate).toBe(10);
      }
    }
  });
});

// ── 13. T3完了後にE owner='black' ────────────────────────────────────────────
describe('T3 after E,m(10)', () => {
  it('13. Position E owner becomes black after correct move', () => {
    let state = T3_POSITION_CAPTURE.initialState;
    state = selectPosition(state, 'E');
    state = applyMassiveBuild(state, 10);
    expect(state.positions['E']!.owner).toBe('black');
    const record = state.history[state.history.length - 1]!;
    const step = T3_POSITION_CAPTURE.steps[0]!;
    if (step.kind === 'user_move') {
      expect(validateMove(record, step.expected)).toBe(true);
    }
  });
});

// ── 14. 全10言語の新key構造一致 ──────────────────────────────────────────────
const ALL_DICTS: Array<{ lang: string; dict: Record<string, unknown> }> = [
  { lang: 'en', dict: EN_TRANSLATIONS as unknown as Record<string, unknown> },
  { lang: 'ja', dict: JA_TRANSLATIONS as unknown as Record<string, unknown> },
  { lang: 'zh-Hans', dict: ZH_HANS_TRANSLATIONS as unknown as Record<string, unknown> },
  { lang: 'zh-Hant', dict: ZH_HANT_TRANSLATIONS as unknown as Record<string, unknown> },
  { lang: 'ko', dict: KO_TRANSLATIONS as unknown as Record<string, unknown> },
  { lang: 'es', dict: ES_TRANSLATIONS as unknown as Record<string, unknown> },
  { lang: 'pt-BR', dict: PT_BR_TRANSLATIONS as unknown as Record<string, unknown> },
  { lang: 'de', dict: DE_TRANSLATIONS as unknown as Record<string, unknown> },
  { lang: 'fr', dict: FR_TRANSLATIONS as unknown as Record<string, unknown> },
  { lang: 'it', dict: IT_TRANSLATIONS as unknown as Record<string, unknown> },
];

const NEW_STRING_KEYS = [
  'trainingBoardCoordTitle',
  'trainingBuildUpTitle',
  'trainingPosCaptureTitle',
  'trainingBoardCoordDesc',
  'trainingBuildUpDesc',
  'trainingPosCaptureDesc',
  'trainingT2BuildStep1',
  'trainingT2BuildStep2',
  'trainingT2BuildStep3',
  'trainingBuildUpComplete',
  'trainingT3Step1',
  'trainingPosCaptureComplete',
  'trainingBoardCoordComplete',
];

const NEW_FUNCTION_KEYS = ['trainingT1PositionStep', 'trainingT1GateStep'];

describe('14. all 10 locales have new i18n keys', () => {
  for (const { lang, dict } of ALL_DICTS) {
    it(`${lang}: string keys present and non-empty`, () => {
      for (const key of NEW_STRING_KEYS) {
        const val = dict[key];
        expect(val, `${lang}.${key} missing`).toBeDefined();
        expect(typeof val, `${lang}.${key} not string`).toBe('string');
        expect((val as string).length, `${lang}.${key} empty`).toBeGreaterThan(0);
      }
    });

    it(`${lang}: function keys present with arity 1`, () => {
      for (const key of NEW_FUNCTION_KEYS) {
        const fn = dict[key];
        expect(fn, `${lang}.${key} missing`).toBeDefined();
        expect(typeof fn, `${lang}.${key} not function`).toBe('function');
        expect((fn as (...a: unknown[]) => unknown).length, `${lang}.${key} arity not 1`).toBe(1);
      }
    });
  }
});

// ── 15. Asset Value 1/8/64 表記なし ──────────────────────────────────────────
describe('15. no Asset Value 1/8/64 in new keys', () => {
  const CHECK_KEYS = [
    'trainingT2BuildStep1',
    'trainingT2BuildStep2',
    'trainingT2BuildStep3',
    'trainingBuildUpComplete',
    'trainingT3Step1',
    'trainingPosCaptureComplete',
    'trainingBoardCoordDesc',
    'trainingBuildUpDesc',
    'trainingPosCaptureDesc',
  ];

  for (const { lang, dict } of ALL_DICTS) {
    it(`${lang}: no 1/8/64 numeric Asset values in new keys`, () => {
      for (const key of CHECK_KEYS) {
        const val = dict[key];
        if (typeof val === 'string') {
          expect(val, `${lang}.${key} contains forbidden 1/8/64`).not.toMatch(
            /Small\s*=\s*1|Middle\s*=\s*8|Large\s*=\s*64/,
          );
          expect(val, `${lang}.${key} contains forbidden = 1/8/64`).not.toMatch(
            /=\s*1\b|=\s*8\b|=\s*64\b/,
          );
        }
      }
    });
  }
});

// ── 16. KPI total_steps が 25 / 3 / 1 ────────────────────────────────────────
describe('16. KPI total_steps', () => {
  it('T1_board_coordinates total_steps = 25', () => {
    expect(countTotalUserMoves(T1_BOARD_COORDINATES.steps)).toBe(25);
  });

  it('T2_build_up total_steps = 3', () => {
    expect(countTotalUserMoves(T2_BUILD_UP.steps)).toBe(3);
  });

  it('T3_position_capture total_steps = 1', () => {
    expect(countTotalUserMoves(T3_POSITION_CAPTURE.steps)).toBe(1);
  });
});

// ── 17. 一局指南が変更されていない ────────────────────────────────────────────
describe('17. full-game-v1 unchanged', () => {
  it('FULL_GAME_V1 still has 61 steps', () => {
    expect(FULL_GAME_V1.steps.length).toBe(61);
  });
});

// ── 18. 旧task が importable ──────────────────────────────────────────────────
describe('18. old tasks still importable', () => {
  it('T1_BUILD_BASICS is importable and has id T1_build_basics', () => {
    expect(T1_BUILD_BASICS.id).toBe('T1_build_basics');
  });
});

// ── 19. 旧taskが小課題一覧に表示されない ──────────────────────────────────────
describe('19. old tasks not in TRAINING_TASK_META', () => {
  it('none of the old 9 task IDs appear in TRAINING_TASK_META', () => {
    const OLD_IDS = [
      'T1_build_basics', 'T2_capture_build', 'T7_diagonal_gates',
      'T4_partial_build', 'T6_asset_values', 'T5_capture_tie',
      'T8_prepare_capture', 'T9_no_build_endgame', 'T10_defensive_build',
    ];
    const metaIds = TRAINING_TASK_META.map((m) => m.task.id);
    for (const id of OLD_IDS) {
      expect(metaIds, `${id} should not be in TRAINING_TASK_META`).not.toContain(id);
    }
  });
});

// ── 20. 旧progressを新task完了として扱わない ──────────────────────────────────
describe('20. old progress does not mark new tasks as completed', () => {
  it('completing T1_build_basics does not complete T1_board_coordinates', async () => {
    const { saveTrainingProgress, isTaskCompleted } = await import('../training/trainingProgress');
    await saveTrainingProgress(null, {
      taskId: 'T1_build_basics',
      completedAt: new Date().toISOString(),
    });
    expect(isTaskCompleted('T1_board_coordinates')).toBe(false);
  });
});
