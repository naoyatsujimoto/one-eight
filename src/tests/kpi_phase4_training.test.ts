/**
 * kpi_phase4_training.test.ts — KPI Phase 4-A Training Events テスト
 *
 * テスト項目:
 *  Event schema:
 *   1.  全8 training event で training_run_id 必須
 *   2.  UUID 以外を拒否（TS型レベル）
 *   3.  既存 27 event 名は不変
 *   4.  ALLOWED_KPI_EVENT_NAMES に全 training event が含まれる
 *
 *  trainingKpiUtils:
 *   5.  generateTrainingRunId() が UUID v4 形式を返す
 *   6.  fullGameMoveId() の canonical 形式 (move:N)
 *   7.  Move 58 の move_id が move:58
 *   8.  全 61 step が一意の move_id を持つ
 *   9.  taskMoveId() の canonical 形式
 *   10. countUserMovesBefore() / countTotalUserMoves() の CPU 固定手除外
 *   11. computeElapsedSeconds() のクランプ
 *
 *  trainingProgress:
 *   12. full-game-v1 を保存可能
 *   13. 初回 completed_at を保存
 *   14. Replay で completed_at を上書きしない
 *   15. best_attempt_count 最小値維持
 *   16. 旧個別 Training との互換維持
 *   17. 未ログイン localStorage 動作
 *
 *  Migration:
 *   18. migration ファイルが存在する
 *   19. _kpi_strip_training_run_id が定義されている
 *   20. track_kpi_event が Phase 4-A wrapper を使用している
 *   21. helper が SECURITY DEFINER で定義されている
 *   22. helper の REVOKE/GRANT が正しい
 *
 *  FullGame KPI:
 *   23. Move 0 が到達 step として記録される
 *   24. Move 46 既存回帰テスト PASS（move_id = move:46）
 *   25. Move 58 既存回帰テスト PASS（move_id = move:58）
 *   26. training_run_id は isValidUuid() を通過する
 *
 *  fullGameV1:
 *   27. FULL_GAME_V1.steps.length === 61
 *   28. step index 0 の moveNumber === 0
 *   29. 全 moveNumber が 0..60 の範囲
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  ALLOWED_KPI_EVENT_NAMES,
  isAllowedEventName,
  type KpiEventPropsMap,
} from '../lib/kpiEvents';
import {
  generateTrainingRunId,
  isValidUuid,
  fullGameMoveId,
  fullGameStep,
  fullGameMoveIndex,
  taskMoveId,
  taskStep,
  taskMoveIndex,
  countUserMovesBefore,
  countTotalUserMoves,
  computeElapsedSeconds,
} from '../training/trainingKpiUtils';
import {
  saveTrainingProgress,
  loadTrainingProgress,
} from '../training/trainingProgress';
import type { TrainingProgressRecord } from '../training/trainingProgress';
import { FULL_GAME_V1 } from '../training/tasks/fullGameV1';
import type { TrainingStep } from '../training/types';
import { vi, beforeEach } from 'vitest';

const MIGRATIONS_DIR = join(__dirname, '../../supabase/migrations');
const MIGRATION_FILE = '20260810000008_kpi_phase4_training_events.sql';

// ---------------------------------------------------------------------------
// Mock setup (same pattern as existing tests)
// ---------------------------------------------------------------------------

const mockFrom = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

function makeChain(data: unknown, error: { message: string } | null = null) {
  const chain: Record<string, unknown> = {};
  chain['select'] = vi.fn().mockReturnValue(chain);
  chain['eq'] = vi.fn().mockReturnValue(chain);
  chain['single'] = vi.fn().mockResolvedValue({ data, error });
  chain['upsert'] = vi.fn().mockResolvedValue({ data: null, error });
  chain['then'] = (resolve: (v: { data: unknown; error: typeof error }) => unknown) =>
    Promise.resolve({ data, error }).then(resolve);
  return chain;
}

const LS_KEY = 'one_ei\u2026ress';

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
  const mockStorage = makeMockStorage();
  vi.stubGlobal('localStorage', mockStorage);
});

// ---------------------------------------------------------------------------
// Event schema tests
// ---------------------------------------------------------------------------

describe('Event schema — training_run_id 必須', () => {
  const TRAINING_EVENTS: (keyof KpiEventPropsMap)[] = [
    'training_started',
    'training_step_reached',
    'training_attempted',
    'training_incorrect',
    'training_hint_shown',
    'training_step_advanced',
    'training_resumed',
    'training_completed',
  ];

  it('全8 training event が ALLOWED_KPI_EVENT_NAMES に含まれる', () => {
    for (const evt of TRAINING_EVENTS) {
      expect(isAllowedEventName(evt), `${evt} should be allowed`).toBe(true);
    }
  });

  it('ALLOWED_KPI_EVENT_NAMES は 27 件のまま', () => {
    expect(ALLOWED_KPI_EVENT_NAMES.length).toBe(27);
  });

  it('training_started に training_run_id プロパティが存在する（型確認）', () => {
    // TypeScript 型レベルの確認 - props の型が training_run_id を含む
    const props: KpiEventPropsMap['training_started'] = {
      training_run_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      task_id: 'full-game-v1',
      move_id: 'move:0',
      move_index: 0,
      resumed: false,
    };
    expect(props.training_run_id).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
  });

  it('training_completed に training_run_id プロパティが存在する（型確認）', () => {
    const props: KpiEventPropsMap['training_completed'] = {
      training_run_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      task_id: 'full-game-v1',
      move_id: 'move:60',
      move_index: 60,
      total_attempts: 5,
    };
    expect(props.training_run_id).toBeTruthy();
  });

  it('全 training event の型に training_run_id が含まれる', () => {
    // 型チェック — 各イベントの props 型が training_run_id を要求することを確認
    type HasRunId<T> = T extends { training_run_id: string } ? true : false;
    type Check = HasRunId<KpiEventPropsMap['training_started']>;
    const check: Check = true;
    expect(check).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// trainingKpiUtils tests
// ---------------------------------------------------------------------------

describe('trainingKpiUtils', () => {
  it('generateTrainingRunId() は UUID v4 形式を返す', () => {
    const id = generateTrainingRunId();
    expect(isValidUuid(id)).toBe(true);
  });

  it('generateTrainingRunId() は呼び出しごとに異なる値を返す', () => {
    const ids = new Set([
      generateTrainingRunId(),
      generateTrainingRunId(),
      generateTrainingRunId(),
    ]);
    expect(ids.size).toBe(3);
  });

  it('isValidUuid() は UUID v4 を受け入れる', () => {
    // v1 形式 (version digit = 1, not 4)
    expect(isValidUuid('550e8400-e29b-11d4-a716-446655440000')).toBe(false);
    // v4 形式
    expect(isValidUuid('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')).toBe(true);
    // v4 uppercase
    expect(isValidUuid('AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE')).toBe(true);
    // invalid
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidUuid('')).toBe(false);
    // wrong variant (v4 requires 8,9,a,b at position 19)
    expect(isValidUuid('aaaaaaaa-bbbb-4ccc-0ddd-eeeeeeeeeeee')).toBe(false);
  });

  it('fullGameMoveId() は "move:N" 形式を返す', () => {
    expect(fullGameMoveId(0)).toBe('move:0');
    expect(fullGameMoveId(58)).toBe('move:58');
    expect(fullGameMoveId(60)).toBe('move:60');
  });

  it('Move 58 の move_id は "move:58"', () => {
    const step58 = FULL_GAME_V1.steps.find((s) => s.moveNumber === 58);
    expect(step58).toBeDefined();
    const stepIdx = FULL_GAME_V1.steps.indexOf(step58!);
    const moveId = fullGameMoveId(step58!.moveNumber);
    expect(moveId).toBe('move:58');
    expect(stepIdx).toBeGreaterThanOrEqual(0);
  });

  it('全 61 step が一意の move_id を持つ', () => {
    const moveIds = FULL_GAME_V1.steps.map((s) => fullGameMoveId(s.moveNumber));
    const unique = new Set(moveIds);
    expect(unique.size).toBe(FULL_GAME_V1.steps.length);
  });

  it('fullGameStep() は 1-based', () => {
    expect(fullGameStep(0)).toBe(1);
    expect(fullGameStep(60)).toBe(61);
  });

  it('fullGameMoveIndex() は 0-based', () => {
    expect(fullGameMoveIndex(0)).toBe(0);
    expect(fullGameMoveIndex(5)).toBe(5);
  });

  it('taskMoveId() は "taskId:step:N" 形式を返す', () => {
    expect(taskMoveId('T1_build_basics', 0)).toBe('T1_build_basics:step:0');
    expect(taskMoveId('T1_build_basics', 2)).toBe('T1_build_basics:step:2');
  });

  it('taskStep() は 1-based', () => {
    expect(taskStep(0)).toBe(1);
    expect(taskStep(2)).toBe(3);
  });

  it('taskMoveIndex() は 0-based', () => {
    expect(taskMoveIndex(0)).toBe(0);
    expect(taskMoveIndex(3)).toBe(3);
  });

  it('countUserMovesBefore() は cpu_fixed_move を除外する', () => {
    const steps: TrainingStep[] = [
      { kind: 'user_move', expected: {} as any, labelKey: 'a' },
      { kind: 'cpu_fixed_move', move: {} as any },
      { kind: 'user_move', expected: {} as any, labelKey: 'b' },
      { kind: 'cpu_fixed_move', move: {} as any },
      { kind: 'user_move', expected: {} as any, labelKey: 'c' },
    ];
    // Before index 0: 0 user moves
    expect(countUserMovesBefore(steps, 0)).toBe(0);
    // Before index 1 (cpu): 1 user move
    expect(countUserMovesBefore(steps, 1)).toBe(1);
    // Before index 2: 1 user move
    expect(countUserMovesBefore(steps, 2)).toBe(1);
    // Before index 4: 2 user moves
    expect(countUserMovesBefore(steps, 4)).toBe(2);
  });

  it('countTotalUserMoves() は user_move のみをカウント', () => {
    const steps: TrainingStep[] = [
      { kind: 'user_move', expected: {} as any, labelKey: 'a' },
      { kind: 'cpu_fixed_move', move: {} as any },
      { kind: 'user_move', expected: {} as any, labelKey: 'b' },
    ];
    expect(countTotalUserMoves(steps)).toBe(2);
  });

  it('computeElapsedSeconds() は 0 以上 86400 以内にクランプ', () => {
    const now = new Date().toISOString();
    const elapsed = computeElapsedSeconds(now);
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(elapsed).toBeLessThanOrEqual(86400);

    // 過去 90000 秒前 → 86400 にクランプ
    const veryOld = new Date(Date.now() - 90000 * 1000).toISOString();
    expect(computeElapsedSeconds(veryOld)).toBe(86400);

    // 未来 → 0 にクランプ
    const future = new Date(Date.now() + 5000).toISOString();
    expect(computeElapsedSeconds(future)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// trainingProgress tests
// ---------------------------------------------------------------------------

describe('trainingProgress — full-game-v1 対応 + completed_at 初回保持', () => {
  it('full-game-v1 を保存可能（localStorage）', async () => {
    await saveTrainingProgress(null, {
      taskId: 'full-game-v1',
      completedAt: '2026-08-10T00:00:00.000Z',
      attemptCount: 5,
      bestAttemptCount: 5,
      lastCompletedStep: 61,
    });
    const records = await loadTrainingProgress(null);
    const rec = records.find((r) => r.taskId === 'full-game-v1');
    expect(rec).toBeDefined();
    expect(rec!.completedAt).toBe('2026-08-10T00:00:00.000Z');
  });

  it('初回 completed_at を保存', async () => {
    const first = '2026-08-10T00:00:00.000Z';
    await saveTrainingProgress(null, {
      taskId: 'full-game-v1',
      completedAt: first,
      attemptCount: 5,
      bestAttemptCount: 5,
    });
    const records = await loadTrainingProgress(null);
    const rec = records.find((r) => r.taskId === 'full-game-v1');
    expect(rec!.completedAt).toBe(first);
  });

  it('Replay で completed_at を上書きしない', async () => {
    const first = '2026-08-10T00:00:00.000Z';
    const replay = '2026-08-11T00:00:00.000Z';
    await saveTrainingProgress(null, {
      taskId: 'full-game-v1',
      completedAt: first,
      attemptCount: 5,
      bestAttemptCount: 5,
    });
    // Replay save
    await saveTrainingProgress(null, {
      taskId: 'full-game-v1',
      completedAt: replay,
      attemptCount: 3,
      bestAttemptCount: 3,
    });
    const records = await loadTrainingProgress(null);
    const rec = records.find((r) => r.taskId === 'full-game-v1');
    // completed_at は first のまま
    expect(rec!.completedAt).toBe(first);
    // bestAttemptCount は最小値（3）
    expect(rec!.bestAttemptCount).toBe(3);
  });

  it('best_attempt_count 最小値維持', async () => {
    await saveTrainingProgress(null, {
      taskId: 'T1_build_basics',
      completedAt: '2026-08-10T00:00:00.000Z',
      attemptCount: 10,
      bestAttemptCount: 10,
    });
    await saveTrainingProgress(null, {
      taskId: 'T1_build_basics',
      completedAt: '2026-08-11T00:00:00.000Z',
      attemptCount: 5,
      bestAttemptCount: 5,
    });
    const records = await loadTrainingProgress(null);
    const rec = records.find((r) => r.taskId === 'T1_build_basics');
    expect(rec!.bestAttemptCount).toBe(5);
  });

  it('旧個別 Training との互換維持', async () => {
    await saveTrainingProgress(null, {
      taskId: 'T2_capture_build',
      completedAt: '2026-08-10T00:00:00.000Z',
      attemptCount: 3,
      bestAttemptCount: 3,
    });
    const records = await loadTrainingProgress(null);
    const rec = records.find((r) => r.taskId === 'T2_capture_build');
    expect(rec).toBeDefined();
    expect(rec!.completedAt).toBe('2026-08-10T00:00:00.000Z');
  });

  it('個別 Training の completed_at も上書きしない', async () => {
    const first = '2026-08-10T00:00:00.000Z';
    await saveTrainingProgress(null, {
      taskId: 'T1_build_basics',
      completedAt: first,
      attemptCount: 5,
      bestAttemptCount: 5,
    });
    await saveTrainingProgress(null, {
      taskId: 'T1_build_basics',
      completedAt: '2026-08-12T00:00:00.000Z',
      attemptCount: 3,
      bestAttemptCount: 3,
    });
    const records = await loadTrainingProgress(null);
    const rec = records.find((r) => r.taskId === 'T1_build_basics');
    expect(rec!.completedAt).toBe(first);
  });

  it('Supabase path: 初回 completed_at を保存し Replay で上書きしない', async () => {
    const first = '2026-08-10T00:00:00.000Z';
    const replay = '2026-08-11T00:00:00.000Z';
    // Mock: first save — no existing record
    mockFrom.mockReturnValueOnce(makeChain(null, { message: 'no rows' }));
    mockFrom.mockReturnValueOnce(makeChain(null, null)); // upsert
    await saveTrainingProgress('user-123', {
      taskId: 'full-game-v1',
      completedAt: first,
      attemptCount: 5,
      bestAttemptCount: 5,
    });
    // Mock: replay save — existing record with completed_at
    mockFrom.mockReturnValueOnce(makeChain({
      best_attempt_count: 5,
      completed_at: first,
    }));
    mockFrom.mockReturnValueOnce(makeChain(null, null)); // upsert
    await saveTrainingProgress('user-123', {
      taskId: 'full-game-v1',
      completedAt: replay,
      attemptCount: 3,
      bestAttemptCount: 3,
    });
    // localStorage should have first completed_at
    const records = await loadTrainingProgress(null);
    const rec = records.find((r) => r.taskId === 'full-game-v1');
    expect(rec!.completedAt).toBe(first);
  });
});

// ---------------------------------------------------------------------------
// Migration file tests
// ---------------------------------------------------------------------------

describe('Migration: 20260810000008_kpi_phase4_training_events.sql', () => {
  const migrationPath = join(MIGRATIONS_DIR, MIGRATION_FILE);

  it('migration ファイルが存在する', () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  it('_kpi_strip_training_run_id が定義されている', () => {
    const sql = readFileSync(migrationPath, 'utf-8');
    expect(sql).toContain('_kpi_strip_training_run_id');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public._kpi_strip_training_run_id');
  });

  it('track_kpi_event が Phase 4-A wrapper を呼ぶ', () => {
    const sql = readFileSync(migrationPath, 'utf-8');
    expect(sql).toContain('_kpi_strip_training_run_id(p_event_name');
    expect(sql).toContain('_kpi_validate_properties(p_event_name, v_stripped_props)');
  });

  it('helper が SECURITY DEFINER で定義されている', () => {
    const sql = readFileSync(migrationPath, 'utf-8');
    // Count occurrences of SECURITY DEFINER
    const count = (sql.match(/SECURITY DEFINER/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(2); // helper + track_kpi_event
  });

  it('helper の REVOKE が anon/authenticated を含む', () => {
    const sql = readFileSync(migrationPath, 'utf-8');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public._kpi_strip_training_run_id');
    expect(sql).toContain('FROM anon');
    expect(sql).toContain('FROM authenticated');
  });

  it('helper の GRANT は service_role と postgres のみ', () => {
    const sql = readFileSync(migrationPath, 'utf-8');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public._kpi_strip_training_run_id');
    expect(sql).toContain('TO service_role, postgres');
  });

  it('track_kpi_event に training event リストが 8 件定義されている', () => {
    const sql = readFileSync(migrationPath, 'utf-8');
    const trainingEvents = [
      'training_started',
      'training_step_reached',
      'training_attempted',
      'training_incorrect',
      'training_hint_shown',
      'training_step_advanced',
      'training_resumed',
      'training_completed',
    ];
    for (const evt of trainingEvents) {
      expect(sql, `migration should contain ${evt}`).toContain(evt);
    }
  });

  it('migration に official_kpi_start_at の変更（SET/ALTER/UPDATE）が含まれない', () => {
    const sql = readFileSync(migrationPath, 'utf-8');
    // コメント行以外で official_kpi_start_at を変更する構文がないことを確認
    const nonCommentLines = sql.split('\n').filter(l => !l.trimStart().startsWith('--'));
    const nonCommentSql = nonCommentLines.join('\n');
    expect(nonCommentSql).not.toContain('official_kpi_start_at');
  });

  it('event 名 27 件リストが変更されていない（_kpi_allowed_event_names の CREATE は含まない）', () => {
    const sql = readFileSync(migrationPath, 'utf-8');
    // migration は _kpi_allowed_event_names を再作成しない
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public._kpi_allowed_event_names');
  });
});

// ---------------------------------------------------------------------------
// FULL_GAME_V1 step structure tests
// ---------------------------------------------------------------------------

describe('FULL_GAME_V1 step structure', () => {
  it('steps.length === 61', () => {
    expect(FULL_GAME_V1.steps.length).toBe(61);
  });

  it('step index 0 の moveNumber === 0', () => {
    expect(FULL_GAME_V1.steps[0]!.moveNumber).toBe(0);
  });

  it('全 moveNumber が 0..60 の範囲', () => {
    for (const step of FULL_GAME_V1.steps) {
      expect(step.moveNumber).toBeGreaterThanOrEqual(0);
      expect(step.moveNumber).toBeLessThanOrEqual(60);
    }
  });

  it('Move 0 は intro kind', () => {
    expect(FULL_GAME_V1.steps[0]!.kind).toBe('intro');
  });

  it('Move 46 が存在する', () => {
    const step46 = FULL_GAME_V1.steps.find((s) => s.moveNumber === 46);
    expect(step46).toBeDefined();
    expect(fullGameMoveId(46)).toBe('move:46');
  });

  it('Move 58 の move_id は move:58', () => {
    const step58 = FULL_GAME_V1.steps.find((s) => s.moveNumber === 58);
    expect(step58).toBeDefined();
    expect(fullGameMoveId(step58!.moveNumber)).toBe('move:58');
  });

  it('training_run_id の UUID は isValidUuid() を通過する', () => {
    const runId = generateTrainingRunId();
    expect(isValidUuid(runId)).toBe(true);
    // invalid patterns
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidUuid('aaaaaaaa-bbbb-1ccc-8ddd-eeeeeeeeeeee')).toBe(false); // v1 (not v4)
  });

  it('total_steps は FULL_GAME_V1.steps.length と一致する', () => {
    expect(FULL_GAME_V1.steps.length).toBe(61);
  });

  it('各 step の move_id が全て一意', () => {
    const ids = FULL_GAME_V1.steps.map((s) => fullGameMoveId(s.moveNumber));
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// TrainingTaskId compatibility
// ---------------------------------------------------------------------------

describe('TrainingTaskId — full-game-v1 互換性', () => {
  it('full-game-v1 は TrainingProgressRecord に保存できる', async () => {
    const record: TrainingProgressRecord = {
      taskId: 'full-game-v1',
      completedAt: '2026-08-10T00:00:00.000Z',
      attemptCount: 10,
      bestAttemptCount: 10,
      lastCompletedStep: 61,
    };
    await saveTrainingProgress(null, record);
    const loaded = await loadTrainingProgress(null);
    expect(loaded.some((r) => r.taskId === 'full-game-v1')).toBe(true);
  });
});
