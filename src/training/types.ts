import type { GameState, GateId, PositionId } from '../game/types';

export type TrainingTaskId = 'T1_build_basics' | 'T2_capture_build' | 'T7_diagonal_gates' | 'T4_partial_build' | 'T6_asset_values' | 'T5_capture_tie' | 'T8_prepare_capture' | 'T9_no_build_endgame' | 'T10_defensive_build';

export type ExpectedMove =
  | { positioning: PositionId; build: { type: 'massive'; gate: GateId; allowedGates?: GateId[] } }
  | { positioning: PositionId; build: { type: 'selective'; gates: [GateId, GateId] } }
  | { positioning: PositionId; build: { type: 'quad'; minGates?: number } };

export type FixedCpuMove =
  | { positioning: PositionId; build: { type: 'massive'; gate: GateId } }
  | { positioning: PositionId; build: { type: 'selective'; gates: [GateId, GateId] } }
  | { positioning: PositionId; build: { type: 'quad' } };

export type TrainingStep =
  | { kind: 'user_move'; expected: ExpectedMove; labelKey: string }
  | { kind: 'cpu_fixed_move'; move: FixedCpuMove };

export interface TrainingTask {
  id: TrainingTaskId;
  titleKey: string;
  steps: TrainingStep[];
  initialState: GameState;
}

// ---- Full Game Training types (Phase 1) ----

export type FullGameStepKind = 'auto' | 'user' | 'question' | 'intro' | 'select_only' | 'pass';

export interface ScriptedMove {
  position: string;          // e.g. 'E'
  buildType: 'massive' | 'selective' | 'quad' | 'selective_single' | 'pass';
  gates: number[];           // e.g. [6] or [1,2,7,12]
}

export interface FullGameTrainingStep {
  moveNumber: number;
  displayLabel: string;        // "M0", "M1-1", "M2" など
  player: 'black' | 'white' | 'none';
  kind: FullGameStepKind;
  move?: ScriptedMove;
  expectedMove?: ScriptedMove;
  expectedPosition?: string;   // select_only 用
  learningPoint: string;
  shortPrompt: string;
  explanation: string;
  capturesBefore?: string[];
  capturesAfter?: string[];
  note?: string;
}

export interface FullGameTrainingTask {
  id: string;
  title: string;
  description: string;
  perspective: 'black';
  steps: FullGameTrainingStep[];
}

// ---- Full Game Training localized text types (Phase 2a) ----

/** Bilingual string pair used for all UI-facing text in full-game Training. */
export interface LocalizedText {
  en: string;
  ja: string;
}

/** Text bundle for a USER step (situation context, interactive prompts). */
export interface FullGameUserStepText {
  situation: LocalizedText;
  question: LocalizedText;
  hint: LocalizedText;
  success: LocalizedText;
}

/** Text bundle for an AUTO step (narration shown to learner). */
export interface FullGameAutoStepText {
  auto: LocalizedText;
}

/** One selectable option in a post-step comprehension question. */
export interface FullGameQuestionOption {
  en: string;
  ja: string;
}

/** Comprehension question shown after a key step (e.g. Move 21 winning-judgment). */
export interface FullGameQuestionData {
  question: LocalizedText;
  options: FullGameQuestionOption[];
  /** 0-based index into options[] that is the correct answer. */
  correctOptionIndex: number;
  hint: LocalizedText;
  explanation: LocalizedText;
}

/**
 * Localized text bundle for one step in a full-game Training.
 * Keyed by moveNumber so it can be looked up independently of FullGameTrainingStep.
 */
export interface FullGameStepText {
  moveNumber: number;
  /** Comma-separated tag identifiers for the learning concept(s) in this step. */
  learningPoint: string;
  /** Present when step kind === 'intro'. */
  introText?: LocalizedText;
  /** Present when step kind === 'user'. */
  userText?: FullGameUserStepText;
  /** Present when step kind === 'auto'. */
  autoText?: FullGameAutoStepText;
  /**
   * Comprehension question displayed after the step resolves.
   */
  postQuestion?: FullGameQuestionData;
  /**
   * Summary text displayed after the final user step resolves (moveNumber 60).
   */
  finalText?: LocalizedText;
}

/** Course-level metadata for a full-game Training. */
export interface FullGameCourseMeta {
  title: LocalizedText;
  description: LocalizedText;
  finalSummary: LocalizedText;
}

/**
 * Top-level localized text data for a full-game Training.
 * Decoupled from FullGameTrainingTask so UI can load text
 * independently without re-parsing game logic.
 */
export interface FullGameTrainingText {
  /** Must match the corresponding FullGameTrainingTask.id */
  courseId: string;
  meta: FullGameCourseMeta;
  steps: FullGameStepText[];
}

// ---- Existing Training Session type ----

export interface TrainingSession {
  task: TrainingTask;
  stepIndex: number;
  gameState: GameState;
  snapshot: GameState;
  attemptCount: number;
  status: 'playing' | 'complete';
  feedback: string | null;
  selectiveFirst: GateId | null;
  quadSelected: GateId[];
}
