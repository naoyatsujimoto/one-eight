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

const BYOYOMI_OPTIONS = [
  { label: 'なし', seconds: 0 },
  { label: '10秒', seconds: 10 },
  { label: '30秒', seconds: 30 },
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

  function handleByoyomiSeconds(seconds: number) {
    onChange({ ...config, mode: 'total_time', byoyomiSeconds: seconds });
  }

  function handlePerMoveSeconds(seconds: number) {
    onChange({ ...config, mode: 'per_move', perMoveSeconds: seconds });
  }

  const modeOptions: { mode: TimeMode; label: string }[] = [
    { mode: 'none', label: 'なし' },
    { mode: 'total_time', label: '持ち時間制' },
    { mode: 'per_move', label: '1手制限' },
  ];

  return (
    <div className="cpu-settings-group">
      <div className="cpu-settings-label">タイムクロック</div>
      <div className="cpu-settings-row">
        {modeOptions.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            className={`cpu-settings-btn${config.mode === mode ? ' active' : ''}`}
            onClick={() => handleModeChange(mode)}
          >
            {label}
          </button>
        ))}
      </div>

      {config.mode === 'total_time' && (
        <>
          <div className="cpu-settings-row" style={{ marginTop: '8px' }}>
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
          <div className="cpu-settings-label" style={{ marginTop: '8px' }}>秒読み</div>
          <div className="cpu-settings-row">
            {BYOYOMI_OPTIONS.map(({ label, seconds }) => (
              <button
                key={seconds}
                type="button"
                className={`cpu-settings-btn${(config.byoyomiSeconds ?? 0) === seconds ? ' active' : ''}`}
                onClick={() => handleByoyomiSeconds(seconds)}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {config.mode === 'per_move' && (
        <div className="cpu-settings-row" style={{ marginTop: '8px' }}>
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
