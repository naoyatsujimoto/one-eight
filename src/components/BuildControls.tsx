import { getBuildOptionsForSelected } from '../game/engine';
import type { GameState } from '../game/types';
import type { BoardBuildState } from '../app/App';

export function BuildControls({
  state,
  buildState,
  onSkip,
  onQuadConfirm,
}: {
  state: GameState;
  buildState: BoardBuildState;
  onSkip: () => void;
  onQuadConfirm: () => void;
}) {
  const options = getBuildOptionsForSelected(state);
  const canSkip = !options?.hasAny;

  const { mode, selectiveFirst, quadSelected, quadMax } = buildState;

  function getHint(): string {
    if (!state.selectedPosition) return 'ポジションを選択してください。';
    if (mode === 'none') return 'Gate のポケットをクリックしてください。Large → Massive / Middle → Selective / Small → Quad';
    if (mode === 'selective') {
      if (selectiveFirst === null) return 'Selective: 1つ目の Gate を選択中…';
      return `Selective: Gate ${selectiveFirst} 選択済み — 2つ目の Gate の Middle を選択してください。`;
    }
    if (mode === 'quad') {
      if (quadSelected.length === 0) return 'Quad: Small ポケットを選択中…';
      return `Quad: Gate ${quadSelected.join(', ')} 選択済み (${quadSelected.length}/${quadMax}) — Confirm で確定`;
    }
    return '';
  }

  const showQuadConfirm = mode === 'quad' && quadSelected.length > 0;

  return (
    <section className="panel">
      <h2 className="build-controls-title">Build</h2>

      <p className="build-hint">{getHint()}</p>

      {state.selectedPosition && (
        <div className="control-group build-type-skip">
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
