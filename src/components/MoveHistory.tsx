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
    <div className="history-section">
      <div className="history-section-header">
        <div className="section-eyebrow" style={{margin:0}}>Move History</div>
        <button type="button" className="top-btn" style={{padding:'2px 0', fontSize:'9px'}}
          onClick={handleCopy} disabled={history.length === 0}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <ol className="history-list-new" ref={listRef}>
        {history.map((record, index) => {
          const isLatest = index === history.length - 1;
          const isSkip = record.build.type === 'skip';
          return (
            <li key={`${record.moveNumber}-${index}`}
              className={`hist-item-new${isLatest ? ' latest' : ''}`}>
              <span className="hist-n">{record.moveNumber}</span>
              <span className={`hist-dot-new hist-dot-${record.player}-new`} />
              <span className="hist-move-text">
                {isSkip ? 'P' : `${record.positioning},${buildLabel(record)}`}
              </span>
              <span className="hist-build-type">
                {!isSkip ? record.build.type.charAt(0) : ''}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
