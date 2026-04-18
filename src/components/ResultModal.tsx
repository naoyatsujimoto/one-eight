import { useState } from 'react';
import { generateRecordText } from '../game/notation';
import type { GameState } from '../game/types';

export function ResultModal({
  state,
  onReset,
}: {
  state: GameState;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (!state.gameEnded) return null;

  const winnerLabel =
    state.winner === 'draw'
      ? 'Draw'
      : `${state.winner ? state.winner.charAt(0).toUpperCase() + state.winner.slice(1) : ''} Wins`;

  const subLabel = `Game ended after ${state.history.length} moves`;

  function handleCopy() {
    const text = generateRecordText(state.history);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="result-modal">
      <div className="result-card">
        <div className="result-eyebrow">Game Finished</div>
        <div className="result-title">{winnerLabel}</div>
        <div className="result-sub">{subLabel}</div>
        <div className="result-actions">
          <button type="button" className="result-btn result-btn-primary" onClick={onReset}>
            New Game
          </button>
          <button
            type="button"
            className="result-btn"
            onClick={handleCopy}
            disabled={state.history.length === 0}
          >
            {copied ? 'Copied' : 'Copy record'}
          </button>
        </div>
      </div>
    </div>
  );
}
