/**
 * trainingProgress.ts — Phase T-4 localStorage implementation
 *
 * Stores per-task completion state in localStorage.
 * Key: one_eight_training_progress
 * Future phases will replace save/load with Supabase calls;
 * syncTrainingProgressOnLogin is a no-op stub for that migration path.
 */

export type TrainingTaskId = 'T1_build_basics' | 'T2_capture_build';

export interface TrainingProgressRecord {
  taskId: TrainingTaskId;
  completedAt: string | null;
  attemptCount?: number;
  bestAttemptCount?: number;
  lastCompletedStep?: number;
}

const LS_KEY = 'one_eight_training_progress';

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

/**
 * Save training progress for a task.
 * Phase T-4: persists to localStorage.
 * userId is reserved for future DB sync; not used here.
 */
export async function saveTrainingProgress(
  _userId: string,
  record: TrainingProgressRecord,
): Promise<void> {
  const all = readFromStorage();
  const idx = all.findIndex((r) => r.taskId === record.taskId);

  if (idx === -1) {
    all.push(record);
  } else {
    const existing = all[idx]!;
    // bestAttemptCount: keep the smaller value
    const bestAttemptCount =
      record.bestAttemptCount !== undefined && existing.bestAttemptCount !== undefined
        ? Math.min(existing.bestAttemptCount, record.bestAttemptCount)
        : record.bestAttemptCount ?? existing.bestAttemptCount;

    all[idx] = {
      ...existing,
      ...record,
      bestAttemptCount,
    };
  }
  writeToStorage(all);
}

/**
 * Load training progress for a user.
 * Phase T-4: reads from localStorage.
 */
export async function loadTrainingProgress(
  _userId: string,
): Promise<TrainingProgressRecord[]> {
  return readFromStorage();
}

/**
 * Sync local training progress to the server after login.
 * Phase T-4: no-op. Placeholder for future Supabase sync.
 */
export async function syncTrainingProgressOnLogin(
  _userId: string,
): Promise<void> {
  // Phase T-4: no-op
}

/**
 * Synchronous helper: check if a task is completed (for UI use).
 */
export function isTaskCompleted(taskId: TrainingTaskId): boolean {
  const records = readFromStorage();
  const rec = records.find((r) => r.taskId === taskId);
  return !!(rec && rec.completedAt);
}
