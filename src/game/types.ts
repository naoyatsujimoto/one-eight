import type { TimerConfig } from './timerTypes';

export type Player = 'black' | 'white';

export type PositionId =
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'
  | 'H' | 'I' | 'J' | 'K' | 'L' | 'M';

export type GateId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export type AssetSize = 'large' | 'middle' | 'small';
export type BuildType = 'massive' | 'selective' | 'quad' | 'no-build';

export type Asset = { size: AssetSize; owner: Player };

export type PositionState = { id: PositionId; owner: Player | null };

export type GateState = {
  id: GateId;
  largeSlots: Array<Asset | null>;
  middleSlots: Array<Asset | null>;
  smallSlots: Array<Asset | null>;
};

export type MoveRecord = {
  moveNumber: number;
  player: Player;
  positioning: PositionId | 'P';
  build:
    | { type: 'massive'; gate: GateId | null; placed: number }
    | { type: 'selective'; gates: [GateId | 0, GateId | 0]; placed: number }
    | { type: 'quad'; placedGateIds: GateId[]; placed: number }
    | { type: 'skip' }
    | { type: 'no-build' };
  /**
   * Step F-2: C4-canonical Zobrist hash of the game state AFTER this move is committed.
   * Optional for backward compatibility — older saved records may lack this field.
   * Use ensureCanonicalHash() in storage.ts to on-demand compute when missing.
   */
  canonical_hash?: string;
  /** C4-normalized position-ownership hash (optional, backward compat) */
  symmetry_group_id?: string;
  /** Phase T-1 optional: この手を指すのに使った時間（ミリ秒）。per_move / total_time 時のみ記録 */
  time_used_ms?: number;
  /** Phase M-1: medium_pattern_id (Position所有 + corner gate dominance) of the state AFTER this move */
  medium_pattern_id?: string;
};

export type GameState = {
  currentPlayer: Player;
  moveNumber: number;
  selectedPosition: PositionId | null;
  /** Preview owner for the currently selected position (committed on finalizeTurn). */
  pendingPositionOwner: Player | null;
  positions: Record<PositionId, PositionState>;
  gates: Record<GateId, GateState>;
  history: MoveRecord[];
  gameEnded: boolean;
  winner: Player | 'draw' | null;
  /** Which player (if any) is controlled by the CPU. null = Human vs Human. */
  cpuPlayer: Player | null;
  /** ISO 8601 timestamp when the game started (first move or new game). */
  startedAt: string | null;
  /** ISO 8601 timestamp when the game ended (gameEnded became true). */
  endedAt: string | null;
  /** Phase T-1: タイマー設定。null = タイマーなし（後方互換） */
  timerConfig: TimerConfig | null;
  /** Phase T-1: 終了理由。null = 後方互換 */
  endReason: 'normal' | 'timeout' | null;
};
