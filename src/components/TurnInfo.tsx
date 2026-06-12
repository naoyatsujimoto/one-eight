import { getBuildOptionsForSelected } from '../game/engine';
import type { GameState } from '../game/types';
import type { TimerConfig } from '../game/timerTypes';
import type { BoardBuildState } from '../app/App';
import { useLang } from '../lib/lang';

type Phase = 'select-position' | 'select-build' | 'finished';

function derivePhase(state: GameState): Phase {
  if (state.gameEnded) return 'finished';
  if (state.selectedPosition === null) return 'select-position';
  return 'select-build';
}

function formatMs(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function timerClass(ms: number): string {
  if (ms <= 10000) return ' timer-danger';
  if (ms <= 30000) return ' timer-warning';
  return '';
}

export function TurnInfo({
  state, modeLabel, buildState, onSkip, onClear,
  timerConfig, playerTimers, currentMoveRemainingMs, perspective,
}: {
  state: GameState;
  modeLabel?: string;
  buildState?: BoardBuildState;
  onSkip?: () => void;
  onClear?: () => void;
  timerConfig?: TimerConfig | null;
  playerTimers?: { black: number; white: number } | null;
  currentMoveRemainingMs?: number | null;
  perspective?: 'black' | 'white';
}) {
  const { t } = useLang();
  const phase = derivePhase(state);

  const PHASE_LABEL: Record<Phase, string> = {
    'select-position': t.phaseSelect,
    'select-build': t.phaseBuild,
    'finished': t.phaseFinished,
  };

  const options = buildState ? getBuildOptionsForSelected(state) : null;
  const canSkip = !options?.hasAny;
  // "Confirm Position" is shown when a position is selected and no build options exist
  const canConfirmPosition = !!state.selectedPosition && canSkip;
  const mode = buildState?.mode ?? 'none';
  const selectiveFirst = buildState?.selectiveFirst ?? null;
  const selectiveCanConfirm = buildState?.selectiveCanConfirm ?? false;
  const quadSelected = buildState?.quadSelected ?? [];
  const quadMax = buildState?.quadMax ?? 4;

  function getHint(): string {
    if (!state.selectedPosition) return t.hintSelectPos;
    if (mode === 'none') return t.hintBuildMode;
    if (mode === 'selective') {
      if (selectiveFirst === null) return t.hintSelectiveFirst;
      if (selectiveCanConfirm) return t.hintSelectiveConfirm(selectiveFirst);
      return t.hintSelectiveSecond(selectiveFirst);
    }
    if (mode === 'quad') {
      return quadSelected.length
        ? t.hintQuadConfirm(quadSelected.length, quadMax)
        : t.hintQuadPick;
    }
    return '';
  }

  const showQuadConfirm = mode === 'quad' && quadSelected.length > 0;
  const showSelectiveConfirm = mode === 'selective' && selectiveFirst !== null && selectiveCanConfirm;
  const hint = getHint();

  return (
    <>
      <div className="panel-section">
        <div className="section-eyebrow">{t.currentTurn}</div>
        <div className="turn-row">
          <span className={`turn-chip turn-chip-${state.currentPlayer}`} />
          <div style={{display:'flex', flexDirection:'column', gap:'2px'}}>
            <div className="turn-name">{state.currentPlayer}</div>
            <div className="turn-meta">
              {t.move} {state.moveNumber}
              <span style={{color:'var(--ink-4)'}}> · </span>
              {modeLabel ?? 'Human'}
            </div>
          </div>
        </div>
        <div className="phase-line">
          <span className={`phase-dot${phase === 'finished' ? ' phase-dot-finished' : phase === 'select-build' ? ' phase-dot-build' : ''}`} />
          <span className="phase-label-text">{PHASE_LABEL[phase]}</span>
          {state.selectedPosition && (
            <span className="phase-pos-tag">{state.selectedPosition}</span>
          )}
        </div>
        <div className="phase-hint-text">{hint}</div>

        {phase !== 'finished' && (
          <div className="turn-guide-label-diagram">
            <img
              src={`/label_guide_${perspective === 'white' ? 'white' : 'black'}.svg`}
              alt="label guide"
            />
          </div>
        )}
        {phase !== 'finished' && (
          <p className="turn-guide-label-caption">
            {perspective === 'white' ? t.labelGuideWhiteText : t.labelGuideBlackText}
          </p>
        )}

        {timerConfig && timerConfig.mode !== 'none' && (
          <div className="timer-panel">
            {timerConfig.mode === 'total_time' && playerTimers && (
              <>
                {(['black', 'white'] as const).map((p) => {
                  const ms = playerTimers[p];
                  const isActive = p === state.currentPlayer && !state.gameEnded;
                  return (
                    <div key={p} className={`timer-panel-row${isActive ? ' timer-panel-row-active' : ''}`}>
                      <span className={`turn-chip turn-chip-${p} timer-panel-chip`} />
                      <span className={`timer-panel-value${isActive ? timerClass(ms) : ' timer-panel-inactive'}`}>
                        {formatMs(ms)}
                      </span>
                    </div>
                  );
                })}
              </>
            )}
            {timerConfig.mode === 'per_move' && (() => {
              const ms = currentMoveRemainingMs ?? timerConfig.perMoveSeconds * 1000;
              return (
                <div className="timer-panel-row timer-panel-row-active">
                  <span className={`turn-chip turn-chip-${state.currentPlayer} timer-panel-chip`} />
                  <span className={`timer-panel-value${timerClass(ms)}`}>{formatMs(ms)}</span>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      <div className="panel-section">
        <div className="section-eyebrow">{t.actions}</div>
        <div className="actions-row">
          <button type="button" className="action-btn" onClick={onSkip} disabled={!canSkip || !!state.selectedPosition}>
            {t.pass}
          </button>
          {state.selectedPosition && (
            <button type="button" className="action-btn action-btn-ghost" onClick={onClear}>
              {t.clear}
            </button>
          )}
        </div>
        {!canSkip && state.selectedPosition && (
          <span style={{fontSize:'11px', color:'#e06c26', marginTop:'6px', display:'block'}}>
            {t.buildAvailable}
          </span>
        )}
      </div>
    </>
  );
}
