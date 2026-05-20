import type { TimerConfig } from '../game/timerTypes';

interface TimerDisplayProps {
  timerConfig: TimerConfig | null;
  /** total_time 用: 各プレイヤーの残り時間 (ms) */
  playerTimers: { black: number; white: number } | null;
  /** per_move 用: 現在手番の残り時間 (ms) */
  currentMoveRemainingMs: number | null;
  currentPlayer: 'black' | 'white';
}

function formatMs(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getTimerColor(ms: number): string {
  if (ms <= 10000) return '#e03a26';
  if (ms <= 30000) return '#e06c26';
  return 'inherit';
}

export function TimerDisplay({
  timerConfig,
  playerTimers,
  currentMoveRemainingMs,
  currentPlayer,
}: TimerDisplayProps) {
  if (!timerConfig || timerConfig.mode === 'none') return null;

  if (timerConfig.mode === 'total_time') {
    if (!playerTimers) return null;
    return (
      <div className="timer-display timer-display-total">
        {(['black', 'white'] as const).map((player) => {
          const remaining = playerTimers[player];
          const isActive = player === currentPlayer;
          const color = getTimerColor(remaining);
          return (
            <div
              key={player}
              className={`timer-player ${isActive ? 'timer-player-active' : 'timer-player-inactive'}`}
            >
              <span className="timer-label">{player === 'black' ? '●' : '○'}</span>
              <span
                className="timer-value"
                style={{ color: isActive ? color : undefined }}
              >
                {formatMs(remaining)}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  if (timerConfig.mode === 'per_move') {
    const remaining = currentMoveRemainingMs ?? timerConfig.perMoveSeconds * 1000;
    const color = getTimerColor(remaining);
    return (
      <div className="timer-display timer-display-per-move">
        <span className="timer-label">{currentPlayer === 'black' ? '●' : '○'}</span>
        <span className="timer-value" style={{ color }}>
          {formatMs(remaining)}
        </span>
      </div>
    );
  }

  return null;
}
