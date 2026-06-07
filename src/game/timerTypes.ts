export type TimeMode = 'none' | 'total_time' | 'per_move';

export interface TimerConfig {
  mode: TimeMode;
  /** total_time 用: 各プレイヤーの総持ち時間（秒）*/
  totalSeconds: number;
  /** per_move 用: 1手あたりの制限時間（秒）*/
  perMoveSeconds: number;
  /** total_time 用: 秒読み時間（秒）。0 または未指定の場合は秒読みなし */
  byoyomiSeconds?: number;
}

export interface PlayerTimer {
  player: 'black' | 'white';
  remainingMs: number;
  isRunning: boolean;
  startedAt: number | null;
}

export const DEFAULT_TIMER_CONFIG: TimerConfig = {
  mode: 'none',
  totalSeconds: 300,
  perMoveSeconds: 60,
};
