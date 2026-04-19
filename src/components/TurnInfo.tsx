import { getBuildOptionsForSelected } from '../game/engine';
import type { GameState } from '../game/types';
import type { BoardBuildState } from '../app/App';
import { useLang } from '../lib/lang';

type Phase = 'select-position' | 'select-build' | 'finished';

function derivePhase(state: GameState): Phase {
  if (state.gameEnded) return 'finished';
  if (state.selectedPosition === null) return 'select-position';
  return 'select-build';
}

export function TurnInfo({
  state, modeLabel, buildState, onSkip, onQuadConfirm, onSelectiveConfirm, onClear,
}: {
  state: GameState;
  modeLabel?: string;
  buildState?: BoardBuildState;
  onSkip?: () => void;
  onQuadConfirm?: () => void;
  onSelectiveConfirm?: () => void;
  onClear?: () => void;
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
      </div>

      <div className="panel-section">
        <div className="section-eyebrow">{t.actions}</div>
        <div className="actions-row">
          {showSelectiveConfirm && (
            <button type="button" className="action-btn action-btn-primary" onClick={onSelectiveConfirm}>
              {t.confirm}
            </button>
          )}
          {showQuadConfirm && (
            <button type="button" className="action-btn action-btn-primary" onClick={onQuadConfirm}>
              {t.confirm} ({quadSelected.length}/{quadMax})
            </button>
          )}
          <button type="button" className="action-btn" onClick={onSkip} disabled={!canSkip}>
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
