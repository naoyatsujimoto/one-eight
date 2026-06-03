import type { GameState, GateId, PositionId } from '../game/types';

export type TrainingTaskId = 'T1_build_basics' | 'T2_capture_build' | 'T7_diagonal_gates' | 'T4_partial_build' | 'T6_asset_values' | 'T5_capture_tie';

export type ExpectedMove =
  | { positioning: PositionId; build: { type: 'massive'; gate: GateId } }
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
