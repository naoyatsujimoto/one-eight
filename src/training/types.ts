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

// ---- Training Session type ----

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
