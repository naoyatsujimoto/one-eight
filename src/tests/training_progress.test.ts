/**
 * training_progress.test.ts — Phase T-5
 *
 * Covers:
 *  - localStorage save / load (userId = null)
 *  - bestAttemptCount keeps smaller value
 *  - userId present → Supabase upsert is called
 *  - Supabase load success → localStorage cache updated
 *  - Supabase load failure → localStorage fallback
 *  - syncTrainingProgressOnLogin upserts local progress to Supabase
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Supabase mock (hoisted) ───────────────────────────────────────────────────

const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

// Chain helper: returns a thenable query builder
function makeChain(data: unknown, error: { message: string } | null = null) {
  const chain: Record<string, unknown> = {};
  chain['select'] = vi.fn().mockReturnValue(chain);
  chain['eq'] = vi.fn().mockReturnValue(chain);
  chain['single'] = vi.fn().mockResolvedValue({ data, error });
  chain['upsert'] = vi.fn().mockResolvedValue({ data: null, error });
  // Make the chain thenable so `await chain.eq(...)` resolves correctly
  chain['then'] = (resolve: (v: { data: unknown; error: typeof error }) => unknown) =>
    Promise.resolve({ data, error }).then(resolve);
  return chain;
}

import {
  saveTrainingProgress,
  loadTrainingProgress,
  syncTrainingProgressOnLogin,
  isTaskCompleted,
} from '../training/trainingProgress';
import type { TrainingProgressRecord } from '../training/trainingProgress';

// ── localStorage mock ─────────────────────────────────────────────────────────

const LS_KEY = 'one_eight_training_progress';

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

// ── localStorage path (userId = null) ────────────────────────────────────────

describe('saveTrainingProgress — localStorage (userId null)', () => {
  it('saves a record to localStorage', async () => {
    const record: TrainingProgressRecord = {
      taskId: 'T1_build_basics',
      completedAt: '2026-06-03T00:00:00.000Z',
    };
    await saveTrainingProgress(null, record);

    const raw = localStorage.getItem(LS_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as TrainingProgressRecord[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.taskId).toBe('T1_build_basics');
    expect(parsed[0]?.completedAt).toBe('2026-06-03T00:00:00.000Z');
  });

  it('updates an existing record for the same taskId', async () => {
    await saveTrainingProgress(null, {
      taskId: 'T1_build_basics',
      completedAt: '2026-06-01T00:00:00.000Z',
      attemptCount: 3,
      bestAttemptCount: 3,
    });
    await saveTrainingProgress(null, {
      taskId: 'T1_build_basics',
      completedAt: '2026-06-03T00:00:00.000Z',
      attemptCount: 1,
      bestAttemptCount: 1,
    });

    const records = await loadTrainingProgress(null);
    expect(records).toHaveLength(1);
    expect(records[0]?.completedAt).toBe('2026-06-03T00:00:00.000Z');
  });

  it('stores multiple distinct tasks', async () => {
    await saveTrainingProgress(null, { taskId: 'T1_build_basics', completedAt: '2026-06-01T00:00:00.000Z' });
    await saveTrainingProgress(null, { taskId: 'T2_capture_build', completedAt: '2026-06-02T00:00:00.000Z' });

    const records = await loadTrainingProgress(null);
    expect(records).toHaveLength(2);
  });

  it('does not call Supabase', async () => {
    await saveTrainingProgress(null, { taskId: 'T1_build_basics', completedAt: '2026-06-03T00:00:00.000Z' });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('loadTrainingProgress — localStorage (userId null)', () => {
  it('returns empty array when nothing saved', async () => {
    const records = await loadTrainingProgress(null);
    expect(records).toEqual([]);
  });

  it('returns saved records', async () => {
    await saveTrainingProgress(null, {
      taskId: 'T1_build_basics',
      completedAt: '2026-06-03T00:00:00.000Z',
    });

    const records = await loadTrainingProgress(null);
    expect(records).toHaveLength(1);
    expect(records[0]?.taskId).toBe('T1_build_basics');
  });

  it('does not call Supabase', async () => {
    await loadTrainingProgress(null);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ── bestAttemptCount keeps smaller value ─────────────────────────────────────

describe('bestAttemptCount keeps the smaller value', () => {
  it('retains original bestAttemptCount when new is larger', async () => {
    await saveTrainingProgress(null, { taskId: 'T1_build_basics', completedAt: '2026-06-01T00:00:00.000Z', attemptCount: 2, bestAttemptCount: 2 });
    await saveTrainingProgress(null, { taskId: 'T1_build_basics', completedAt: '2026-06-02T00:00:00.000Z', attemptCount: 5, bestAttemptCount: 5 });

    const records = await loadTrainingProgress(null);
    expect(records[0]?.bestAttemptCount).toBe(2);
  });

  it('updates bestAttemptCount when new is smaller', async () => {
    await saveTrainingProgress(null, { taskId: 'T1_build_basics', completedAt: '2026-06-01T00:00:00.000Z', attemptCount: 5, bestAttemptCount: 5 });
    await saveTrainingProgress(null, { taskId: 'T1_build_basics', completedAt: '2026-06-02T00:00:00.000Z', attemptCount: 1, bestAttemptCount: 1 });

    const records = await loadTrainingProgress(null);
    expect(records[0]?.bestAttemptCount).toBe(1);
  });
});

// ── Supabase path (userId present) ───────────────────────────────────────────

describe('saveTrainingProgress — Supabase (userId present)', () => {
  it('calls supabase upsert', async () => {
    // First from: select existing (no existing row)
    const selectChain = makeChain(null);
    // Second from: upsert
    const upsertChain = makeChain(null);
    mockFrom.mockReturnValueOnce(selectChain).mockReturnValueOnce(upsertChain);

    await saveTrainingProgress('user-123', {
      taskId: 'T1_build_basics',
      completedAt: '2026-06-03T00:00:00.000Z',
      attemptCount: 2,
      bestAttemptCount: 2,
      lastCompletedStep: 3,
    });

    expect(mockFrom).toHaveBeenCalledWith('training_progress');
    // Upsert chain should have been called
    expect(upsertChain['upsert']).toHaveBeenCalled();
    const upsertCall = (upsertChain['upsert'] as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const row = upsertCall[0] as Record<string, unknown>;
    expect(row['user_id']).toBe('user-123');
    expect(row['task_id']).toBe('T1_build_basics');
  });

  it('updates localStorage cache after Supabase save', async () => {
    const selectChain = makeChain(null);
    const upsertChain = makeChain(null);
    mockFrom.mockReturnValueOnce(selectChain).mockReturnValueOnce(upsertChain);

    await saveTrainingProgress('user-123', {
      taskId: 'T1_build_basics',
      completedAt: '2026-06-03T00:00:00.000Z',
      attemptCount: 1,
      bestAttemptCount: 1,
    });

    // localStorage cache should be updated
    const raw = localStorage.getItem(LS_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as TrainingProgressRecord[];
    expect(parsed.some((r) => r.taskId === 'T1_build_basics')).toBe(true);
  });

  it('bestAttemptCount keeps smaller value vs Supabase existing', async () => {
    // Existing Supabase row has best_attempt_count = 2
    const existingRow = { best_attempt_count: 2 };
    const selectChain = makeChain(existingRow);
    const upsertChain = makeChain(null);
    mockFrom.mockReturnValueOnce(selectChain).mockReturnValueOnce(upsertChain);

    await saveTrainingProgress('user-123', {
      taskId: 'T1_build_basics',
      completedAt: '2026-06-03T00:00:00.000Z',
      attemptCount: 5,
      bestAttemptCount: 5, // worse than existing 2
    });

    const upsertCall = (upsertChain['upsert'] as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const row = upsertCall[0] as Record<string, unknown>;
    // Should keep 2 (the smaller)
    expect(row['best_attempt_count']).toBe(2);
  });
});

// ── loadTrainingProgress — Supabase ───────────────────────────────────────────

describe('loadTrainingProgress — Supabase (userId present)', () => {
  it('returns records from Supabase on success', async () => {
    const dbRows = [
      { user_id: 'user-123', task_id: 'T1_build_basics', completed_at: '2026-06-03T00:00:00.000Z', attempt_count: 2, best_attempt_count: 2, last_completed_step: 3 },
    ];
    const chain = makeChain(dbRows);
    mockFrom.mockReturnValueOnce(chain);

    const records = await loadTrainingProgress('user-123');
    expect(records).toHaveLength(1);
    expect(records[0]?.taskId).toBe('T1_build_basics');
    expect(records[0]?.bestAttemptCount).toBe(2);
  });

  it('updates localStorage cache on Supabase success', async () => {
    const dbRows = [
      { user_id: 'user-123', task_id: 'T2_capture_build', completed_at: '2026-06-04T00:00:00.000Z', attempt_count: 1, best_attempt_count: 1, last_completed_step: 2 },
    ];
    const chain = makeChain(dbRows);
    mockFrom.mockReturnValueOnce(chain);

    await loadTrainingProgress('user-123');

    const raw = localStorage.getItem(LS_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as TrainingProgressRecord[];
    expect(parsed.some((r) => r.taskId === 'T2_capture_build')).toBe(true);
  });

  it('falls back to localStorage when Supabase returns error', async () => {
    // Pre-populate localStorage
    await saveTrainingProgress(null, {
      taskId: 'T1_build_basics',
      completedAt: '2026-06-01T00:00:00.000Z',
      bestAttemptCount: 3,
    });

    // Supabase returns error
    const chain = makeChain(null, { message: 'network error' });
    mockFrom.mockReturnValueOnce(chain);

    const records = await loadTrainingProgress('user-123');
    expect(records).toHaveLength(1);
    expect(records[0]?.taskId).toBe('T1_build_basics');
  });
});

// ── syncTrainingProgressOnLogin ───────────────────────────────────────────────

describe('syncTrainingProgressOnLogin', () => {
  it('does nothing when localStorage is empty', async () => {
    await syncTrainingProgressOnLogin('user-123');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('upserts each local record to Supabase', async () => {
    // Pre-populate localStorage
    await saveTrainingProgress(null, { taskId: 'T1_build_basics', completedAt: '2026-06-01T00:00:00.000Z', bestAttemptCount: 2 });
    await saveTrainingProgress(null, { taskId: 'T2_capture_build', completedAt: '2026-06-02T00:00:00.000Z', bestAttemptCount: 1 });

    // Each saveTrainingProgress(userId) call does 2 from() calls (select + upsert)
    for (let i = 0; i < 4; i++) {
      mockFrom.mockReturnValueOnce(makeChain(null));
    }

    await syncTrainingProgressOnLogin('user-123');

    // 2 tasks × 2 from() calls each = 4 total
    expect(mockFrom).toHaveBeenCalledTimes(4);
  });

  it('does not throw when Supabase fails', async () => {
    await saveTrainingProgress(null, { taskId: 'T1_build_basics', completedAt: '2026-06-01T00:00:00.000Z' });

    // Simulate failure on both from() calls for saveTrainingProgress
    const errChain = makeChain(null, { message: 'DB error' });
    mockFrom.mockReturnValueOnce(errChain).mockReturnValueOnce(errChain);

    await expect(syncTrainingProgressOnLogin('user-123')).resolves.not.toThrow();
  });
});

// ── snake_case DB ↔ camelCase app mapping ───────────────────────────────────

describe('snake_case DB <-> camelCase app mapping', () => {
  it('rowToRecord: all DB snake_case fields map to camelCase correctly', async () => {
    const dbRow = {
      user_id: 'user-abc',
      task_id: 'T2_capture_build',
      completed_at: '2026-06-05T12:00:00.000Z',
      attempt_count: 4,
      best_attempt_count: 2,
      last_completed_step: 5,
    };
    const chain = makeChain([dbRow]);
    mockFrom.mockReturnValueOnce(chain);

    const records = await loadTrainingProgress('user-abc');
    expect(records).toHaveLength(1);
    const r = records[0]!;
    expect(r.taskId).toBe('T2_capture_build');
    expect(r.completedAt).toBe('2026-06-05T12:00:00.000Z');
    expect(r.attemptCount).toBe(4);
    expect(r.bestAttemptCount).toBe(2);
    expect(r.lastCompletedStep).toBe(5);
  });

  it('upsert row: all camelCase app fields map to snake_case correctly', async () => {
    const selectChain = makeChain(null); // no existing row
    const upsertChain = makeChain(null);
    mockFrom.mockReturnValueOnce(selectChain).mockReturnValueOnce(upsertChain);

    await saveTrainingProgress('user-abc', {
      taskId: 'T2_capture_build',
      completedAt: '2026-06-05T12:00:00.000Z',
      attemptCount: 4,
      bestAttemptCount: 2,
      lastCompletedStep: 5,
    });

    const upsertFn = upsertChain['upsert'] as ReturnType<typeof vi.fn>;
    const row = (upsertFn.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(row['user_id']).toBe('user-abc');
    expect(row['task_id']).toBe('T2_capture_build');
    expect(row['completed_at']).toBe('2026-06-05T12:00:00.000Z');
    expect(row['attempt_count']).toBe(4);
    expect(row['best_attempt_count']).toBe(2);
    expect(row['last_completed_step']).toBe(5);
  });
});

// ── lock / available state ────────────────────────────────────────────────────

describe('T1/T2 lock and available state', () => {
  it('T2 is locked when T1 is not completed', async () => {
    const records = await loadTrainingProgress(null);
    const t1 = records.find((r) => r.taskId === 'T1_build_basics');
    expect(!!(t1 && t1.completedAt)).toBe(false);
  });

  it('T2 is available after T1 is completed', async () => {
    await saveTrainingProgress(null, { taskId: 'T1_build_basics', completedAt: '2026-06-03T00:00:00.000Z' });

    const records = await loadTrainingProgress(null);
    const t1 = records.find((r) => r.taskId === 'T1_build_basics');
    expect(!!(t1 && t1.completedAt)).toBe(true);
  });

  it('isTaskCompleted returns false before save', () => {
    expect(isTaskCompleted('T1_build_basics')).toBe(false);
  });

  it('isTaskCompleted returns true after save', async () => {
    await saveTrainingProgress(null, { taskId: 'T1_build_basics', completedAt: '2026-06-03T00:00:00.000Z' });
    expect(isTaskCompleted('T1_build_basics')).toBe(true);
  });
});
