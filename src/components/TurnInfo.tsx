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
    <section className="panel turn-info-panel">
      <h2 className="turn-info-heading">Turn Info</h2>

      {modeLabel && (
        <div className="game-mode-label">{modeLabel}</div>
      )}

      <div className="turn-info-player">
        <span className={`player-chip player-chip-${state.currentPlayer}`} />
        <strong className="turn-info-name">
          {state.currentPlayer}
        </strong>
        <span className="turn-info-move">— Move {state.moveNumber}</span>
      </div>

      <div className="turn-info-phase">
        <span className={`phase-badge phase-badge-${phase}`}>{PHASE_LABEL[phase]}</span>
        <span className="phase-hint">{PHASE_HINT[phase]}</span>
      </div>

      {state.selectedPosition !== null && (
        <p className="turn-info-selected">
          Selected: <strong className="turn-info-selected-id">{state.selectedPosition}</strong>
        </p>
      )}

      {/* Pass / Selective / Quad controls — integrated inside TurnInfo */}
      {buildState && state.selectedPosition && (
        <div className="control-group build-type-skip">
          {hint && <p className="build-hint">{hint}</p>}
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
