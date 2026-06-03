/**
 * trainingProgress.ts — Phase T-1 stub
 *
 * Phase T-1: no-op stubs only.
 * DB access and localStorage writes are intentionally omitted.
 * Replace these stubs with real implementations in a future phase.
 */

export type TrainingTaskId = 'T1_build_basics';

export interface TrainingProgressRecord {
  taskId: TrainingTaskId;
  completedAt: string | null;
}

/**
 * Save training progress for a task.
 * Phase T-1: no-op.
 */
export async function saveTrainingProgress(
  _userId: string,
  _record: TrainingProgressRecord,
): Promise<void> {
  // Phase T-1: no-op
}

/**
 * Load training progress for a user.
 * Phase T-1: returns empty array.
 */
export async function loadTrainingProgress(
  _userId: string,
): Promise<TrainingProgressRecord[]> {
  // Phase T-1: no-op
  return [];
}

/**
 * Sync local training progress to the server after login.
 * Phase T-1: no-op.
 */
export async function syncTrainingProgressOnLogin(
  _userId: string,
): Promise<void> {
  // Phase T-1: no-op
}
