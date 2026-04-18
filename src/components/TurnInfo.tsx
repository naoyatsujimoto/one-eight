import { getBuildOptionsForSelected } from '../game/engine';
import type { GameState } from '../game/types';
import type { BoardBuildState } from '../app/App';

type Phase = 'select-position' | 'select-build' | 'finished';

function derivePhase(state: GameState): Phase {
  if (state.gameEnded) return 'finished';
  if (state.selectedPosition === null) return 'select-position';
  return 'select-build';
}

const PHASE_LABEL: Record<Phase, string> = {
  'select-position': 'Position',
  'select-build': 'Build',
  'finished': 'Finished',
};

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
  const phase = derivePhase(state);
  const options = buildState ? getBuildOptionsForSelected(state) : null;
  const canSkip = !options?.hasAny;
  const mode = buildState?.mode ?? 'none';
  const selectiveFirst = buildState?.selectiveFirst ?? null;
  const selectiveCanConfirm = buildState?.selectiveCanConfirm ?? false;
  const quadSelected = buildState?.quadSelected ?? [];
  const quadMax = buildState?.quadMax ?? 4;

  function getHint(): string {
    if (!state.selectedPosition) return 'Select a position on the board';
    if (mode === 'none') return 'Large → Massive · Middle → Selective · Small → Quad';
    if (mode === 'selective') {
      if (selectiveFirst === null) return 'Selective — pick first middle pocket';
      if (selectiveCanConfirm) return `Selective: Gate ${selectiveFirst} — Confirm or pick 2nd`;
      return `Selective: Gate ${selectiveFirst} selected — pick second`;
    }
    if (mode === 'quad') {
      return quadSelected.length
        ? `Quad: ${quadSelected.length}/${quadMax} — Confirm to commit`
        : 'Quad — pick small pockets';
    }
    return '';
  }

  const showQuadConfirm = mode === 'quad' && quadSelected.length > 0;
  const showSelectiveConfirm = mode === 'selective' && selectiveFirst !== null && selectiveCanConfirm;
  const hint = getHint();

  return (
    <>
      <div className="panel-section">
        <div className="section-eyebrow">Current Turn</div>
        <div className="turn-row">
          <span className={`turn-chip turn-chip-${state.currentPlayer}`} />
          <div style={{display:'flex', flexDirection:'column', gap:'2px'}}>
            <div className="turn-name">{state.currentPlayer}</div>
            <div className="turn-meta">
              Move {state.moveNumber}
              <span style={{color:'var(--ink-4)'}}> · </span>
              {modeLabel ?? 'Human'}
            </div>
          </div>
        </div>
        <div className="phase-line">
          <span className={`phase-dot${phase === 'finished' ? ' phase-dot-finished' : ''}`} />
          <span className="phase-label-text">{PHASE_LABEL[phase]}</span>
          {state.selectedPosition && (
            <span className="phase-pos-tag">{state.selectedPosition}</span>
          )}
        </div>
        <div className="phase-hint-text">{hint}</div>
      </div>

      <div className="panel-section">
        <div className="section-eyebrow">Actions</div>
        <div className="actions-row">
          {showSelectiveConfirm && (
            <button type="button" className="action-btn action-btn-primary" onClick={onSelectiveConfirm}>
              Confirm
            </button>
          )}
          {showQuadConfirm && (
            <button type="button" className="action-btn action-btn-primary" onClick={onQuadConfirm}>
              Confirm ({quadSelected.length}/{quadMax})
            </button>
          )}
          <button type="button" className="action-btn" onClick={onSkip} disabled={!canSkip}>
            Pass
          </button>
          {state.selectedPosition && (
            <button type="button" className="action-btn action-btn-ghost" onClick={onClear}>
              Clear
            </button>
          )}
        </div>
        {!canSkip && state.selectedPosition && (
          <span style={{fontSize:'11px', color:'#e06c26', marginTop:'6px', display:'block'}}>
            Build available — pass not allowed
          </span>
        )}
      </div>
    </>
  );
}
