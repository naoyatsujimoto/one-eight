/**
 * training_progress.test.ts — Phase T-4
 * Tests for localStorage-based training progress persistence.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveTrainingProgress, loadTrainingProgress, isTaskCompleted } from '../training/trainingProgress';
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
  const mock = makeMockStorage();
  vi.stubGlobal('localStorage', mock);
});

// ── saveTrainingProgress ──────────────────────────────────────────────────────

describe('saveTrainingProgress', () => {
  it('saves a record to localStorage', async () => {
    const record: TrainingProgressRecord = {
      taskId: 'T1_build_basics',
      completedAt: '2026-06-03T00:00:00.000Z',
    };
    await saveTrainingProgress('unused', record);

    const raw = localStorage.getItem(LS_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as TrainingProgressRecord[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.taskId).toBe('T1_build_basics');
    expect(parsed[0]?.completedAt).toBe('2026-06-03T00:00:00.000Z');
  });

  it('updates an existing record for the same taskId', async () => {
    await saveTrainingProgress('unused', {
      taskId: 'T1_build_basics',
      completedAt: '2026-06-01T00:00:00.000Z',
      attemptCount: 3,
      bestAttemptCount: 3,
    });
    await saveTrainingProgress('unused', {
      taskId: 'T1_build_basics',
      completedAt: '2026-06-03T00:00:00.000Z',
      attemptCount: 1,
      bestAttemptCount: 1,
    });

    const records = await loadTrainingProgress('unused');
    expect(records).toHaveLength(1);
    expect(records[0]?.completedAt).toBe('2026-06-03T00:00:00.000Z');
  });

  it('stores multiple distinct tasks', async () => {
    await saveTrainingProgress('unused', {
      taskId: 'T1_build_basics',
      completedAt: '2026-06-01T00:00:00.000Z',
    });
    await saveTrainingProgress('unused', {
      taskId: 'T2_capture_build',
      completedAt: '2026-06-02T00:00:00.000Z',
    });

    const records = await loadTrainingProgress('unused');
    expect(records).toHaveLength(2);
  });
});

// ── loadTrainingProgress ──────────────────────────────────────────────────────

describe('loadTrainingProgress', () => {
  it('returns empty array when nothing saved', async () => {
    const records = await loadTrainingProgress('unused');
    expect(records).toEqual([]);
  });

  it('returns saved records', async () => {
    await saveTrainingProgress('unused', {
      taskId: 'T1_build_basics',
      completedAt: '2026-06-03T00:00:00.000Z',
    });

    const records = await loadTrainingProgress('unused');
    expect(records).toHaveLength(1);
    expect(records[0]?.taskId).toBe('T1_build_basics');
  });
});

// ── bestAttemptCount ──────────────────────────────────────────────────────────

describe('bestAttemptCount keeps the smaller value', () => {
  it('retains original bestAttemptCount when new is larger', async () => {
    await saveTrainingProgress('unused', {
      taskId: 'T1_build_basics',
      completedAt: '2026-06-01T00:00:00.000Z',
      attemptCount: 2,
      bestAttemptCount: 2,
    });
    await saveTrainingProgress('unused', {
      taskId: 'T1_build_basics',
      completedAt: '2026-06-02T00:00:00.000Z',
      attemptCount: 5,
      bestAttemptCount: 5,
    });

    const records = await loadTrainingProgress('unused');
    expect(records[0]?.bestAttemptCount).toBe(2);
  });

  it('updates bestAttemptCount when new is smaller', async () => {
    await saveTrainingProgress('unused', {
      taskId: 'T1_build_basics',
      completedAt: '2026-06-01T00:00:00.000Z',
      attemptCount: 5,
      bestAttemptCount: 5,
    });
    await saveTrainingProgress('unused', {
      taskId: 'T1_build_basics',
      completedAt: '2026-06-02T00:00:00.000Z',
      attemptCount: 1,
      bestAttemptCount: 1,
    });

    const records = await loadTrainingProgress('unused');
    expect(records[0]?.bestAttemptCount).toBe(1);
  });
});

// ── lock / available判定 ──────────────────────────────────────────────────────

describe('T1/T2 lock and available state', () => {
  it('T2 is locked when T1 is not completed', async () => {
    // T1 not saved
    const records = await loadTrainingProgress('unused');
    const t1 = records.find((r) => r.taskId === 'T1_build_basics');
    const t1Completed = !!(t1 && t1.completedAt);
    // T2 prerequisite is T1 — locked when T1 not completed
    expect(t1Completed).toBe(false);
  });

  it('T2 is available after T1 is completed', async () => {
    await saveTrainingProgress('unused', {
      taskId: 'T1_build_basics',
      completedAt: '2026-06-03T00:00:00.000Z',
    });

    const records = await loadTrainingProgress('unused');
    const t1 = records.find((r) => r.taskId === 'T1_build_basics');
    const t1Completed = !!(t1 && t1.completedAt);
    expect(t1Completed).toBe(true);
  });

  it('isTaskCompleted returns false before save', () => {
    expect(isTaskCompleted('T1_build_basics')).toBe(false);
  });

  it('isTaskCompleted returns true after save', async () => {
    await saveTrainingProgress('unused', {
      taskId: 'T1_build_basics',
      completedAt: '2026-06-03T00:00:00.000Z',
    });
    expect(isTaskCompleted('T1_build_basics')).toBe(true);
  });
});
