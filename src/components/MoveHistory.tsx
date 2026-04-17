import { useEffect, useRef, useState } from 'react';
import { generateRecordText } from '../game/notation';
import type { MoveRecord } from '../game/types';

function buildLabel(record: MoveRecord): string {
  switch (record.build.type) {
    case 'massive':
      return record.build.gate === null ? 'm(-)' : `m(${record.build.gate})`;
    case 'selective':
      return `s(${record.build.gates[0]},${record.build.gates[1]})`;
    case 'quad':
      return 'q';
    default:
      return '';
  }
}

export function MoveHistory({ history }: { history: MoveRecord[] }) {
  const listRef = useRef<HTMLOListElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [history.length]);

  function handleCopy() {
    const text = generateRecordText(history);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <section className="panel move-history-panel">
      <div className="move-history-header">
        <h2>Move History</h2>
        <button
          type="button"
          className="btn-copy-record"
          onClick={handleCopy}
          disabled={history.length === 0}
        >
          {copied ? 'Copied' : 'Copy record'}
        </button>
      </div>
      <ol className="move-history-list" ref={listRef}>
        {history.map((record, index) => {
          const isLatest = index === history.length - 1;
          const isSkip = record.build.type === 'skip';
          return (
            <li
              key={`${record.moveNumber}-${index}`}
              className={[
                'move-entry',
                isLatest ? 'move-entry-latest' : '',
                isSkip ? 'move-entry-skip' : '',
              ].filter(Boolean).join(' ')}
            >
              <span className={`move-player-dot move-player-dot-${record.player}`} />
              <span className="move-number">{record.moveNumber}.</span>
              {isSkip ? (
                <span className="move-skip-label">Pass</span>
              ) : (
                <>
                  <span className="move-pos">{record.positioning}</span>
                  <span className="move-sep">, </span>
                  <span className={`move-build move-build-${record.build.type}`}>
                    {buildLabel(record)}
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
