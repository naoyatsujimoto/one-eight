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

  const resultLabel =
    state.winner === 'draw' ? '引き分け / Draw' : `Winner: ${state.winner}`;

  function handleCopy() {
    const text = generateRecordText(state.history);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <section className="panel result-panel">
      <h2>Result</h2>
      <p>
        <strong>{resultLabel}</strong>
      </p>
      <div className="result-actions">
        <button
          type="button"
          className="btn-copy-record"
          onClick={handleCopy}
          disabled={state.history.length === 0}
        >
          {copied ? 'Copied' : 'Copy record'}
        </button>
        <button type="button" className="btn-new-game" onClick={onReset}>
          New Game
        </button>
      </div>
    </section>
  );
}
