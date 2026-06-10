import { useState } from 'react';
import { generateRecordText } from '../game/notation';
import type { GameState } from '../game/types';
import { useLang } from '../lib/lang';

export function ResultModal({
  state,
  onReset,
}: {
  state: GameState;
  onReset: () => void;
}) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);

  if (!state.gameEnded) return null;

  const isTimeout = state.endReason === 'timeout';
  const winnerLabel =
    state.winner === 'draw'
      ? t.resultDraw
      : state.winner === 'black'
        ? `${t.resultBlackWins}${isTimeout ? ` (${t.resultTimeOut})` : ''}`
        : `${t.resultWhiteWins}${isTimeout ? ` (${t.resultTimeOut})` : ''}`;

  const subLabel = isTimeout
    ? `${t.resultTimeOut} — ${state.history.length} moves`
    : `Game ended after ${state.history.length} moves`;

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
        <div className="result-eyebrow">{t.resultGameFinished}</div>
        <div className="result-title">{winnerLabel}</div>
        <div className="result-sub">{subLabel}</div>
        <div className="result-actions">
          <button type="button" className="result-btn result-btn-primary" onClick={onReset}>
            {t.newGame}
          </button>
          <button
            type="button"
            className="result-btn"
            onClick={handleCopy}
            disabled={state.history.length === 0}
          >
            {copied ? t.copiedBtn : 'Copy record'}
          </button>
        </div>
      </div>
    </div>
  );
}
