/**
 * trainingKpiUtils.ts — Training KPI canonical ID & utility helpers
 *
 * 設計:
 * - training_run_id: UUID per run (1 start/replay = 1 UUID)
 * - 一局指南: task_id = 'full-game-v1', move_id = 'move:{moveNumber}'
 * - 個別Training: task_id = task.id, move_id = '{taskId}:step:{userMoveIndex}'
 * - 全ハンドラで個別に文字列を組み立てない
 */

import type { TrainingStep } from './types';

// ---------------------------------------------------------------------------
// UUID generation
// ---------------------------------------------------------------------------

/**
 * Generate a new training_run_id (UUID v4).
 * Falls back to a simple random string in environments without crypto.randomUUID.
 */
export function generateTrainingRunId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fallback below
  }
  // Simple fallback: RFC4122 v4 UUID-like string
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Validate that a string is a valid UUID v4 (case-insensitive).
 */
export function isValidUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

// ---------------------------------------------------------------------------
// 一局指南 canonical ID helpers
// ---------------------------------------------------------------------------

/**
 * Canonical move_id for 一局指南.
 * moveNumber 0..60 → 'move:0' .. 'move:60'
 */
export function fullGameMoveId(moveNumber: number): string {
  return `move:${moveNumber}`;
}

/**
 * step number for 一局指南 (1-based: stepIndex + 1).
 */
export function fullGameStep(stepIndex: number): number {
  return stepIndex + 1;
}

/**
 * move_index for 一局指南 = stepIndex (0-based).
 */
export function fullGameMoveIndex(stepIndex: number): number {
  return stepIndex;
}

// ---------------------------------------------------------------------------
// 個別 Training canonical ID helpers
// ---------------------------------------------------------------------------

/**
 * Count user_move steps from the beginning up to (but not including) stepIndex.
 * This gives the 0-based userMoveIndex for the current user_move step.
 */
export function countUserMovesBefore(steps: TrainingStep[], stepIndex: number): number {
  return steps.slice(0, stepIndex).filter((s) => s.kind === 'user_move' || s.kind === 'coordinate_pick').length;
}

/**
 * Total number of user_move steps in a task.
 */
export function countTotalUserMoves(steps: TrainingStep[]): number {
  return steps.filter((s) => s.kind === 'user_move' || s.kind === 'coordinate_pick').length;
}

/**
 * Canonical move_id for 個別Training.
 * taskId:step:userMoveIndex  例: 'T1_build_basics:step:0'
 */
export function taskMoveId(taskId: string, userMoveIndex: number): string {
  return `${taskId}:step:${userMoveIndex}`;
}

/**
 * step number for 個別Training (1-based: userMoveIndex + 1).
 */
export function taskStep(userMoveIndex: number): number {
  return userMoveIndex + 1;
}

/**
 * move_index for 個別Training = userMoveIndex (0-based).
 */
export function taskMoveIndex(userMoveIndex: number): number {
  return userMoveIndex;
}

// ---------------------------------------------------------------------------
// elapsed_seconds helper
// ---------------------------------------------------------------------------

/**
 * Compute elapsed seconds from runStartedAt ISO string to now.
 * Clamped to [0, 86400].
 */
export function computeElapsedSeconds(runStartedAt: string): number {
  try {
    const start = new Date(runStartedAt).getTime();
    const now = Date.now();
    const raw = Math.round((now - start) / 1000);
    return Math.min(86400, Math.max(0, raw));
  } catch {
    return 0;
  }
}
