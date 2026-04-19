import { useRef, useState, useMemo } from 'react';
import { Board } from './Board';
import { createInitialState } from '../game/initialState';
import {
  selectPosition,
  applyMassiveBuild,
  applySelectiveBuild,
  applyQuadBuildForGates,
} from '../game/engine';
import type { GameState } from '../game/types';
import type { BoardBuildState } from '../app/App';

// ── Build scripted game states ────────────────────────────────────────────────

function buildStates(): GameState[] {
  const s0 = createInitialState();
  const states: GameState[] = [s0];

  // Step 1: Black selects position G
  const s1 = selectPosition(s0, 'G');
  states.push(s1);

  // Step 2: Black massive @ gate 1
  const s2 = applyMassiveBuild(s1, 1);
  states.push(s2);

  // Step 3: White selects position H
  const s3 = selectPosition(s2, 'H');
  states.push(s3);

  // Step 4: White massive @ gate 2
  const s4 = applyMassiveBuild(s3, 2);
  states.push(s4);

  // Step 5: Black selects position A → selective @ gates 2,7
  const s5 = selectPosition(s4, 'A');
  states.push(s5);

  // Step 6: Black selective @ gates 2,7
  const s6 = applySelectiveBuild(s5, [2, 7]);
  states.push(s6);

  // Step 7: White selects position C → quad @ gates 3,4,5,10
  const s7 = selectPosition(s6, 'C');
  states.push(s7);

  // Step 8: White quad @ gates 3,4,5,10
  const s8 = applyQuadBuildForGates(s7, [3, 4, 5, 10]);
  states.push(s8);

  // Step 9: Black selects position G again (already owns it — re-builds)
  // Actually try to capture H: Black needs to dominate gate 2
  // Black already has middle@2 from selective. White has large@2.
  // Let's build Black quad on gates shared with H to show dominance attempt
  const s9 = selectPosition(s8, 'G');
  states.push(s9);

  // Step 10: Black selective @ gates 1,4 (G's gates: 1,4,7,10)
  const s10 = applySelectiveBuild(s9, [1, 4]);
  states.push(s10);

  // Step 11: highlight — Black tries to capture H
  const s11 = selectPosition(s10, 'H');
  states.push(s11);

  // Step 12: Black massive @ gate 9 (H's gates: 2,5,6,9) — building toward capture
  const s12 = applyMassiveBuild(s11, 9);
  states.push(s12);

  return states;
}

// ── Step definitions ──────────────────────────────────────────────────────────

interface StepDef {
  stateIdx: number;
  caption: string;
  sub: string;
  duration: number;
  buildOverride?: BoardBuildState;
}

const EMPTY_BUILD: BoardBuildState = {
  mode: 'none',
  selectiveFirst: null,
  selectiveCanConfirm: false,
  quadSelected: [],
  quadMax: 4,
};

const STEPS: StepDef[] = [
  {
    stateIdx: 0,
    caption: 'WIN THE POSITIONS',
    sub: 'This game is a battle over Positions. The player who holds more Positions at the end wins.',
    duration: 3000,
  },
  {
    stateIdx: 0,
    caption: 'THE BOARD',
    sub: 'The board has 13 Positions and 12 Gates. Each Position is connected to 4 Gates.',
    duration: 3000,
  },
  {
    stateIdx: 0,
    caption: 'EACH TURN',
    sub: 'Each turn has two steps: select a Position, then perform a Build up.',
    duration: 3000,
  },
  {
    stateIdx: 1,
    caption: 'SELECT A POSITION',
    sub: 'Selecting a Position lights up its 4 connected Gates. Those 4 Gates are your targets for that turn.',
    duration: 3000,
  },
  {
    stateIdx: 2,
    caption: 'MASSIVE',
    sub: 'Massive places 1 Large asset into a Gate. A strong, focused investment.',
    duration: 3000,
  },
  {
    stateIdx: 6,
    caption: 'SELECTIVE',
    sub: 'Selective places 1 Middle asset into each of 2 Gates. Split your build across two Gates.',
    duration: 3000,
  },
  {
    stateIdx: 8,
    caption: 'QUAD',
    sub: 'Quad places up to 4 Small assets — one per Gate. Spread wide across the board.',
    duration: 3000,
  },
  {
    stateIdx: 8,
    caption: 'SIZE VALUES',
    sub: 'Small = 1 · Middle = 8 · Large = 64. Larger assets dominate a Gate more powerfully.',
    duration: 3000,
  },
  {
    stateIdx: 8,
    caption: 'SHARED GATES',
    sub: 'Both players can build in the same Gate. Gates become contested battlegrounds.',
    duration: 3000,
  },
  {
    stateIdx: 11,
    caption: 'CAPTURE',
    sub: "You can take your opponent's Position. The outcome depends on the Gates connected to it.",
    duration: 3000,
  },
  {
    stateIdx: 11,
    caption: 'MOST-BUILT GATE',
    sub: 'To capture, look at the most built-up Gate linked to that Position. Dominate it — and the Position is yours.',
    duration: 3000,
  },
  {
    stateIdx: 12,
    caption: 'END OF GAME',
    sub: 'The game ends when all 12 Gates are full. The player with more Positions wins.',
    duration: 3000,
  },
  {
    stateIdx: 0,
    caption: 'START PLAYING',
    sub: 'Play a game. The fastest way to learn is to play.',
    duration: 3000,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface TutorialScreenProps {
  onComplete: () => void;
  onSkip: () => void;
}

export function TutorialScreen({ onComplete, onSkip }: TutorialScreenProps) {
  const states = useMemo(() => buildStates(), []);
  const [step, setStep] = useState(0);
  const [fade, setFade] = useState(true);
  const touchStartX = useRef<number | null>(null);

  function advance(dir: 'next' | 'prev') {
    setFade(false);
    setTimeout(() => {
      setStep(prev => {
        const next = dir === 'next' ? prev + 1 : Math.max(0, prev - 1);
        if (next >= STEPS.length) { onComplete(); return prev; }
        return next;
      });
      setFade(true);
    }, 300);
  }

  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (t) touchStartX.current = t.clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - touchStartX.current;
    touchStartX.current = null;
    if (dx < -50) advance('next');
    else if (dx > 50) advance('prev');
  }

  // PC: click left half = prev, right half = next
  function handleClick(e: React.MouseEvent) {
    const half = window.innerWidth / 2;
    if (e.clientX > half) advance('next');
    else advance('prev');
  }

  const currentStep = STEPS[Math.min(step, STEPS.length - 1)]!;
  const gameState = states[currentStep.stateIdx] ?? states[0]!;
  const buildState: BoardBuildState = currentStep.buildOverride ?? EMPTY_BUILD;
  const progress = (step + 1) / STEPS.length;

  return (
    <div
      className="tutorial-screen"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
    >
      {/* Progress bar */}
      <div className="tut-progress-bar">
        <div className="tut-progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>

      {/* Skip */}
      <button type="button" className="tut-skip" onClick={e => { e.stopPropagation(); onSkip(); }}>Skip</button>

      {/* Click area hints */}
      <div className="tut-click-prev" aria-hidden="true">‹</div>
      <div className="tut-click-next" aria-hidden="true">›</div>

      {/* Real board — read-only (no handlers) */}
      <div className="tut-board-area">
        <Board
          state={gameState}
          buildState={buildState}
          onSelectPosition={() => {}}
          onLargePocketClick={() => {}}
          onMiddlePocketClick={() => {}}
          onSmallPocketClick={() => {}}
        />
      </div>

      {/* Caption */}
      <div className={`tut-caption${fade ? '' : ' tut-caption-fade'}`}>
        <div className="tut-caption-title">{currentStep.caption}</div>
        <div className="tut-caption-sub">{currentStep.sub}</div>
        {step === STEPS.length - 1 && (
          <button
            type="button"
            className="tut-start-btn"
            onClick={e => { e.stopPropagation(); onComplete(); }}
          >
            Start Playing →
          </button>
        )}
      </div>

      {/* Step dots */}
      <div className="tut-dots">
        {STEPS.map((_, i) => (
          <span key={i} className={`tut-dot-nav${i === step ? ' active' : i < step ? ' done' : ''}`} />
        ))}
      </div>
    </div>
  );
}
