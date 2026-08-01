/**
 * Types for the per-locale FullGame V1 Training text bundles.
 *
 * Each locale file exports a standalone FGTrainingText bundle.
 * These types are independent locale bundle definitions;
 * they are not derived from or mirroring any central bilingual type.
 */

/** Text bundle for a USER step (situation context, interactive prompts). */
export interface FGUserStepText {
  situation: string;
  question: string;
  hint: string;
  success: string;
}

/** Text bundle for an AUTO step (narration shown to learner). */
export interface FGAutoStepText {
  auto: string;
}

/** One selectable option in a post-step comprehension question. */
export type FGQuestionOption = string;

/** Comprehension question shown after a key step. */
export interface FGQuestionData {
  question: string;
  options: FGQuestionOption[];
  /** 0-based index into options[] that is the correct answer. */
  correctOptionIndex: number;
  hint: string;
  explanation: string;
}

/**
 * Localized text bundle for one step in the FullGame V1 Training.
 * Keyed by moveNumber (0–60).
 */
export interface FGStepText {
  moveNumber: number;
  learningPoint: string;
  introText?: string;
  userText?: FGUserStepText;
  autoText?: FGAutoStepText;
  postQuestion?: FGQuestionData;
  finalText?: string;
}

/** Course-level metadata. */
export interface FGCourseMeta {
  title: string;
  description: string;
  finalSummary: string;
}

/**
 * Top-level per-locale text data for FullGame V1 Training.
 * courseId must match 'full-game-v1'.
 */
export interface FGTrainingText {
  courseId: string;
  meta: FGCourseMeta;
  steps: FGStepText[];
}
