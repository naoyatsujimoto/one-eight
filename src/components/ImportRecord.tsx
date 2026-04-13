import { useState } from 'react';
import { importRecord } from '../game/importRecord';
import type { GameState } from '../game/types';

interface Props {
  onImport: (state: GameState) => void;
}

export function ImportRecord({ onImport }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleImport() {
    setError(null);
    setSuccess(false);
    const result = importRecord(text);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onImport(result.state);
    setSuccess(true);
    setText('');
    setTimeout(() => {
      setOpen(false);
      setSuccess(false);
    }, 800);
  }

  function handleToggle() {
    setOpen((v) => !v);
    setError(null);
    setSuccess(false);
  }

  return (
    <section className="panel import-record-panel">
      <button
        type="button"
        className="import-record-toggle"
        onClick={handleToggle}
        aria-expanded={open}
      >
        {open ? '▲ Import record' : '▼ Import record'}
      </button>

      {open && (
        <div className="import-record-body">
          <textarea
            className="import-record-textarea"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
              setSuccess(false);
            }}
            placeholder={'1. A, m(2)\n2. B, s(3,4)\n3. C, q\n4. P'}
            rows={6}
            spellCheck={false}
          />
          {error && (
            <p className="import-record-error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="import-record-success" role="status">
              Import successful
            </p>
          )}
          <button
            type="button"
            className="btn-import-record"
            onClick={handleImport}
            disabled={text.trim().length === 0}
          >
            Import record
          </button>
        </div>
      )}
    </section>
  );
}
