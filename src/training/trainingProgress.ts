/**
 * trainingProgress.ts — Phase T-5
 *
 * Persists per-task training completion state.
 *
 * Strategy:
 *   userId = null  → localStorage only (unauthenticated)
 *   userId set     → Supabase primary + localStorage cache
 *
 * Key: one_eight_training_progress
 */

import { supabase } from '../lib/supabase';

export type TrainingTaskId = 'T1_build_basics' | 'T2_capture_build';

export interface TrainingProgressRecord {
  taskId: TrainingTaskId;
  completedAt: string | null;
  attemptCount?: number;
  bestAttemptCount?: number;
  lastCompletedStep?: number;
}

const LS_KEY = 'one_eight_training_progress';

// ── localStorage helpers ───────────────────────────────────────────────────────

function readFromStorage(): TrainingProgressRecord[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as TrainingProgressRecord[];
  } catch {
    return [];
  }
}

function writeToStorage(records: TrainingProgressRecord[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(records));
  } catch {
    // noop — storage may be unavailable in some environments
  }
}

/** Merge a single record into localStorage, preserving bestAttemptCount (keep smaller). */
function mergeIntoStorage(record: TrainingProgressRecord): void {
  const all = readFromStorage();
  const idx = all.findIndex((r) => r.taskId === record.taskId);
  if (idx === -1) {
    all.push(record);
  } else {
    const existing = all[idx]!;
    const bestAttemptCount =
      record.bestAttemptCount !== undefined && existing.bestAttemptCount !== undefined
        ? Math.min(existing.bestAttemptCount, record.bestAttemptCount)
        : record.bestAttemptCount ?? existing.bestAttemptCount;
    all[idx] = { ...existing, ...record, bestAttemptCount };
  }
  writeToStorage(all);
}

// ── DB row type ────────────────────────────────────────────────────────────────

interface DbRow {
  user_id: string;
  task_id: string;
  completed_at: string;
  attempt_count: number;
  best_attempt_count: number;
  last_completed_step: number;
}

function rowToRecord(row: DbRow): TrainingProgressRecord {
  return {
    taskId: row.task_id as TrainingTaskId,
    completedAt: row.completed_at,
    attemptCount: row.attempt_count,
    bestAttemptCount: row.best_attempt_count,
    lastCompletedStep: row.last_completed_step,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Save training progress for a task.
 *
 * userId = null → localStorage only.
 * userId set   → Supabase upsert (bestAttemptCount: keep smaller); localStorage cache updated.
 */
export async function saveTrainingProgress(
  userId: string | null,
  record: TrainingProgressRecord,
): Promise<void> {
  if (!userId) {
    // localStorage path
    const all = readFromStorage();
    const idx = all.findIndex((r) => r.taskId === record.taskId);
    if (idx === -1) {
      all.push(record);
    } else {
      const existing = all[idx]!;
      const bestAttemptCount =
        record.bestAttemptCount !== undefined && existing.bestAttemptCount !== undefined
          ? Math.min(existing.bestAttemptCount, record.bestAttemptCount)
          : record.bestAttemptCount ?? existing.bestAttemptCount;
      all[idx] = { ...existing, ...record, bestAttemptCount };
    }
    writeToStorage(all);
    return;
  }

  // Supabase path — read existing to preserve bestAttemptCount
  const { data: existing } = await supabase
    .from('training_progress')
    .select('best_attempt_count')
    .eq('user_id', userId)
    .eq('task_id', record.taskId)
    .single();

  const existingBest: number | undefined =
    existing && typeof (existing as DbRow).best_attempt_count === 'number'
      ? (existing as DbRow).best_attempt_count
      : undefined;

  const finalBest =
    record.bestAttemptCount !== undefined && existingBest !== undefined
      ? Math.min(existingBest, record.bestAttemptCount)
      : record.bestAttemptCount ?? existingBest ?? 0;

  const row: DbRow = {
    user_id: userId,
    task_id: record.taskId,
    completed_at: record.completedAt ?? new Date().toISOString(),
    attempt_count: record.attemptCount ?? 0,
    best_attempt_count: finalBest,
    last_completed_step: record.lastCompletedStep ?? 0,
  };

  const { error } = await supabase
    .from('training_progress')
    .upsert(row, { onConflict: 'user_id,task_id' });

  if (error) {
    console.warn('[trainingProgress] save failed:', error.message);
  }

  // Always update localStorage cache
  mergeIntoStorage({ ...record, bestAttemptCount: finalBest });
}

/**
 * Load training progress for a user.
 *
 * userId = null → localStorage.
 * userId set   → Supabase; on error fallback to localStorage.
 *               On success, localStorage cache is updated.
 */
export async function loadTrainingProgress(
  userId: string | null,
): Promise<TrainingProgressRecord[]> {
  if (!userId) {
    return readFromStorage();
  }

  const { data, error } = await supabase
    .from('training_progress')
    .select('*')
    .eq('user_id', userId);

  if (error || !data) {
    console.warn('[trainingProgress] load failed, using localStorage fallback:', error?.message);
    return readFromStorage();
  }

  const records = (data as DbRow[]).map(rowToRecord);
  // Update localStorage cache
  for (const r of records) {
    mergeIntoStorage(r);
  }
  return records;
}

/**
 * Sync local training progress to Supabase after login.
 *
 * - Reads localStorage and upserts each record to Supabase.
 * - Preserves bestAttemptCount (keeps smaller value).
 * - Failure is silent (console.warn only); never throws.
 * - localStorage is preserved after sync.
 */
export async function syncTrainingProgressOnLogin(userId: string): Promise<void> {
  const local = readFromStorage();
  if (local.length === 0) return;

  for (const record of local) {
    try {
      await saveTrainingProgress(userId, record);
    } catch (err) {
      console.warn('[trainingProgress] sync failed for', record.taskId, err);
    }
  }
}

/**
 * Synchronous helper: check if a task is completed (for UI use).
 * Reads from localStorage only (synchronous, no async needed for UI gate).
 */
export function isTaskCompleted(taskId: TrainingTaskId): boolean {
  const records = readFromStorage();
  const rec = records.find((r) => r.taskId === taskId);
  return !!(rec && rec.completedAt);
}
