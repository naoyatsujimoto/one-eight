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

const PHASE_HINT: Record<Phase, string> = {
  'select-position': 'Select a position',
  'select-build': 'Choose a build',
  'finished': 'Game finished',
};

export function TurnInfo({
  state,
  modeLabel,
  buildState,
  onSkip,
  onQuadConfirm,
  onSelectiveConfirm,
}: {
  state: GameState;
  modeLabel?: string;
  buildState?: BoardBuildState;
  onSkip?: () => void;
  onQuadConfirm?: () => void;
  onSelectiveConfirm?: () => void;
}) {
  const phase = derivePhase(state);

  // Build controls logic (moved from BuildControls)
  const options = buildState ? getBuildOptionsForSelected(state) : null;
  const canSkip = !options?.hasAny;

  const mode = buildState?.mode ?? 'none';
  const selectiveFirst = buildState?.selectiveFirst ?? null;
  const selectiveCanConfirm = buildState?.selectiveCanConfirm ?? false;
  const quadSelected = buildState?.quadSelected ?? [];
  const quadMax = buildState?.quadMax ?? 4;

  function getHint(): string {
    if (!state.selectedPosition) return '';
    if (mode === 'none') return 'Large → Massive / Middle → Selective / Small → Quad';
    if (mode === 'selective') {
      if (selectiveFirst === null) return 'Selective: 1つ目の Gate を選択中…';
      if (selectiveCanConfirm) return `Selective: Gate ${selectiveFirst} — Confirm で確定`;
      return `Selective: Gate ${selectiveFirst} 選択済み — 2つ目の Middle を選択`;
    }
    if (mode === 'quad') {
      if (quadSelected.length === 0) return 'Quad: Small ポケットを選択中…';
      return `Quad: Gate ${quadSelected.join(', ')} (${quadSelected.length}/${quadMax}) — Confirm で確定`;
    }
    return '';
  }

  const showQuadConfirm = mode === 'quad' && quadSelected.length > 0;
  const showSelectiveConfirm = mode === 'selective' && selectiveFirst !== null && selectiveCanConfirm;

  const hint = getHint();

  return (
    <section className="panel">
      <h2 style={{ marginTop: 0, fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#555', textAlign: 'center' }}>Turn Info</h2>

      {modeLabel && (
        <div className="game-mode-label" style={{ textAlign: 'center', marginBottom: '8px' }}>{modeLabel}</div>
      )}

      <div className="turn-info-player" style={{ justifyContent: 'center' }}>
        <span className={`player-chip player-chip-${state.currentPlayer}`} />
        <strong style={{ textTransform: 'capitalize', fontSize: '1.05rem' }}>
          {state.currentPlayer}
        </strong>
        <span style={{ color: '#888', fontSize: '0.85rem' }}>— Move {state.moveNumber}</span>
      </div>

      <div className="turn-info-phase" style={{ justifyContent: 'center' }}>
        <span className={`phase-badge phase-badge-${phase}`}>{PHASE_LABEL[phase]}</span>
        <span className="phase-hint">{PHASE_HINT[phase]}</span>
      </div>

      {state.selectedPosition !== null && (
        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#555', textAlign: 'center' }}>
          Selected: <strong style={{ color: '#1a1a2e' }}>{state.selectedPosition}</strong>
        </p>
      )}

      {/* Pass / Selective / Quad controls — integrated inside TurnInfo */}
      {buildState && state.selectedPosition && (
        <div className="control-group build-type-skip" style={{ marginTop: '10px' }}>
          {hint && <p className="build-hint" style={{ margin: '0 0 6px', fontSize: '0.82rem', color: '#666' }}>{hint}</p>}
          {showSelectiveConfirm && (
            <button
              type="button"
              onClick={onSelectiveConfirm}
              className="build-btn build-btn-confirm"
            >
              Confirm (Gate {selectiveFirst})
            </button>
          )}
          {showQuadConfirm && (
            <button
              type="button"
              onClick={onQuadConfirm}
              className="build-btn build-btn-confirm"
            >
              Confirm ({quadSelected.length}/{quadMax})
            </button>
          )}
          <button
            type="button"
            onClick={onSkip}
            disabled={!canSkip}
            className="build-btn build-btn-skip"
          >
            Pass
          </button>
          {!canSkip && (
            <span className="build-skip-hint">Build available — pass not allowed</span>
          )}
        </div>
      )}
    </section>
  );
}
