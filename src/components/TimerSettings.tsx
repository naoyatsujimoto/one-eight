import type { TimerConfig, TimeMode } from '../game/timerTypes';
import { DEFAULT_TIMER_CONFIG } from '../game/timerTypes';
import { useLang } from '../lib/lang';

interface TimerSettingsProps {
  config: TimerConfig;
  onChange: (config: TimerConfig) => void;
}

export function TimerSettings({ config, onChange }: TimerSettingsProps) {
  const { t } = useLang();

  const TOTAL_TIME_OPTIONS = [
    { label: t.timerMin5, seconds: 300 },
    { label: t.timerMin10, seconds: 600 },
  ];

  const BYOYOMI_OPTIONS = [
    { label: t.timerNone, seconds: 0 },
    { label: t.timerSec10, seconds: 10 },
    { label: t.timerSec30, seconds: 30 },
  ];

  const PER_MOVE_OPTIONS = [
    { label: t.timerSec30, seconds: 30 },
    { label: t.timerSec60, seconds: 60 },
  ];

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
    { mode: 'none', label: t.timerModeNone },
    { mode: 'total_time', label: t.timerModeTotal },
    { mode: 'per_move', label: t.timerModePerMove },
  ];

  return (
    <div className="cpu-settings-group">
      <div className="cpu-settings-label">{t.timerClock}</div>
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
          <div className="cpu-settings-label" style={{ marginTop: '8px' }}>{t.timerByoyomi}</div>
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
