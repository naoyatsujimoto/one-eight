import { useState } from 'react';

export function HowToPlay() {
  const [open, setOpen] = useState(false);

  return (
    <section className="panel collapsible-panel how-to-play-panel">
      <button
        type="button"
        className="collapsible-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="collapsible-arrow">{open ? '▾' : '▸'}</span>
        <span className="collapsible-label">How to Play</span>
      </button>

      {open && (
        <div className="how-to-play-content">
          <dl className="htp-list">
            <dt>Goal</dt>
            <dd>Take more Positions than your opponent.</dd>

            <dt>Each turn</dt>
            <dd>
              1. Click a <strong>Position</strong> on the board.<br />
              2. Click a <strong>Gate pocket</strong> to Build.
            </dd>

            <dt>Build types</dt>
            <dd>
              <span className="htp-build htp-build-large">Large</span> → Massive (build 1 gate)<br />
              <span className="htp-build htp-build-middle">Middle</span> → Selective (choose any 2 gates)<br />
              <span className="htp-build htp-build-small">Small</span> → Quad (choose any 4 gates)
            </dd>

            <dt>Selective / Quad</dt>
            <dd>Click to select, click again to deselect. Build fires when all required gates are chosen.</dd>

            <dt>Pass</dt>
            <dd>Available only when no Build is possible.</dd>

            <dt>Also</dt>
            <dd>Game auto-saves · ↩ Undo available · Copy record to share.</dd>
          </dl>
        </div>
      )}
    </section>
  );
}
