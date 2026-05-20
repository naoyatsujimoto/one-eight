import type { TimerConfig, TimeMode } from '../game/timerTypes';
import { DEFAULT_TIMER_CONFIG } from '../game/timerTypes';

interface TimerSettingsProps {
  config: TimerConfig;
  onChange: (config: TimerConfig) => void;
}

const TOTAL_TIME_OPTIONS = [
  { label: '5分', seconds: 300 },
  { label: '10分', seconds: 600 },
];

const PER_MOVE_OPTIONS = [
  { label: '30秒', seconds: 30 },
  { label: '60秒', seconds: 60 },
];

export function TimerSettings({ config, onChange }: TimerSettingsProps) {
  function handleModeChange(mode: TimeMode) {
    onChange({ ...DEFAULT_TIMER_CONFIG, mode });
  }

  function handleTotalSeconds(seconds: number) {
    onChange({ ...config, mode: 'total_time', totalSeconds: seconds });
  }

  function handlePerMoveSeconds(seconds: number) {
    onChange({ ...config, mode: 'per_move', perMoveSeconds: seconds });
  }

  return (
    <div className="timer-settings">
      <div className="timer-settings-label">タイムクロック</div>
      <div className="timer-settings-modes">
        {(['none', 'total_time', 'per_move'] as TimeMode[]).map((mode) => (
          <label key={mode} className="timer-settings-mode-option">
            <input
              type="radio"
              name="timer-mode"
              checked={config.mode === mode}
              onChange={() => handleModeChange(mode)}
            />
            <span>
              {mode === 'none' ? 'なし' : mode === 'total_time' ? '持ち時間制' : '1手制限'}
            </span>
          </label>
        ))}
      </div>

      {config.mode === 'total_time' && (
        <div className="timer-settings-options">
          {TOTAL_TIME_OPTIONS.map(({ label, seconds }) => (
            <button
              key={seconds}
              type="button"
              className={`cpu-settings-btn${config.totalSeconds === seconds ? ' active' : ''}`}
              onClick={() => handleTotalSeconds(seconds)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {config.mode === 'per_move' && (
        <div className="timer-settings-options">
          {PER_MOVE_OPTIONS.map(({ label, seconds }) => (
            <button
              key={seconds}
              type="button"
              className={`cpu-settings-btn${config.perMoveSeconds === seconds ? ' active' : ''}`}
              onClick={() => handlePerMoveSeconds(seconds)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
