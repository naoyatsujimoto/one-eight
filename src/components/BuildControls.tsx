import { getBuildOptionsForSelected } from '../game/engine';
import type { GameState } from '../game/types';
import type { BoardBuildState } from '../app/App';

export function BuildControls({
  state,
  buildState,
  onSkip,
  onConfirmPosition,
  onQuadConfirm,
  onSelectiveConfirm,
}: {
  state: GameState;
  buildState: BoardBuildState;
  onSkip: () => void;
  onConfirmPosition?: () => void;
  onQuadConfirm: () => void;
  onSelectiveConfirm: () => void;
}) {
  const options = getBuildOptionsForSelected(state);
  const canSkip = !options?.hasAny;
  const canConfirmPosition = !!state.selectedPosition && canSkip;

  const { mode, selectiveFirst, selectiveCanConfirm, quadSelected, quadMax } = buildState;

  function getHint(): string {
    if (!state.selectedPosition) return 'ポジションを選択してください。';
    if (mode === 'none') return 'Gate のポケットをクリックしてください。Massive → Large Asset / Selective → Middle Asset / Quad → Small Asset';
    if (mode === 'selective') {
      if (selectiveFirst === null) return 'Selective: 1つ目の Gate を選択中…';
      if (selectiveCanConfirm) return `Selective: Gate ${selectiveFirst} 選択済み — 他に空き Middle なし。Confirm で確定してください。`;
      return `Selective: Gate ${selectiveFirst} 選択済み — 2つ目の Gate の Middle を選択してください。`;
    }
    if (mode === 'quad') {
      if (quadSelected.length === 0) return 'Quad: Small ポケットを選択中…';
      return `Quad: Gate ${quadSelected.join(', ')} 選択済み (${quadSelected.length}/${quadMax}) — Confirm で確定`;
    }
    return '';
  }

  const showQuadConfirm = mode === 'quad' && quadSelected.length > 0;
  const showSelectiveConfirm = mode === 'selective' && selectiveFirst !== null && selectiveCanConfirm;

  return (
    <section className="panel">
      <h2 className="build-controls-title">Build</h2>

      <p className="build-hint">{getHint()}</p>

      {state.selectedPosition && (
        <div className="control-group build-type-skip">
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
          {canConfirmPosition && (
            <button
              type="button"
              onClick={onConfirmPosition}
              className="build-btn build-btn-confirm"
            >
              Confirm Position
            </button>
          )}
          <button
            type="button"
            onClick={onSkip}
            disabled={!canSkip || !!state.selectedPosition}
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
