import type { GameState } from '../game/types';

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

export function TurnInfo({ state, modeLabel }: { state: GameState; modeLabel?: string }) {
  const phase = derivePhase(state);

  return (
    <section className="panel">
      <h2 style={{ marginTop: 0, fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#555' }}>Turn Info</h2>

      {modeLabel && (
        <div className="game-mode-label" style={{ textAlign: 'left', marginBottom: '8px' }}>{modeLabel}</div>
      )}

      <div className="turn-info-player">
        <span className={`player-chip player-chip-${state.currentPlayer}`} />
        <strong style={{ textTransform: 'capitalize', fontSize: '1.05rem' }}>
          {state.currentPlayer}
        </strong>
        <span style={{ color: '#888', fontSize: '0.85rem' }}>— Move {state.moveNumber}</span>
      </div>

      <div className="turn-info-phase">
        <span className={`phase-badge phase-badge-${phase}`}>{PHASE_LABEL[phase]}</span>
        <span className="phase-hint">{PHASE_HINT[phase]}</span>
      </div>

      {state.selectedPosition !== null && (
        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#555' }}>
          Selected: <strong style={{ color: '#1a1a2e' }}>{state.selectedPosition}</strong>
        </p>
      )}
    </section>
  );
}
