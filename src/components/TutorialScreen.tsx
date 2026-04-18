import { useEffect, useRef, useState, useMemo } from 'react';
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
    caption: 'The Board',
    sub: '13 positions (A–M) connected to 12 gates. Each turn: select a position, then build.',
    duration: 3000,
  },
  {
    stateIdx: 1,
    caption: 'Select a Position',
    sub: 'Black selects position G. The 4 linked gates light up.',
    duration: 2500,
  },
  {
    stateIdx: 2,
    caption: 'MASSIVE — Large pocket',
    sub: 'Black places on the large diamond at Gate 1. Powerful, but only once per gate.',
    duration: 2800,
  },
  {
    stateIdx: 3,
    caption: 'White\'s turn',
    sub: 'White selects position H — an adjacent square sharing Gate 2.',
    duration: 2500,
  },
  {
    stateIdx: 4,
    caption: 'White builds at Gate 2',
    sub: 'White plays Massive at Gate 2. Both players now share that gate.',
    duration: 2800,
  },
  {
    stateIdx: 5,
    caption: 'SELECTIVE — Middle × 2',
    sub: 'Black selects A. Selective places in middle pockets at two gates simultaneously.',
    duration: 2800,
  },
  {
    stateIdx: 6,
    caption: 'Gates 2 & 7 built',
    sub: 'Black\'s middle assets at 2 & 7 increase dominance over those gates.',
    duration: 2800,
  },
  {
    stateIdx: 7,
    caption: 'QUAD — Small × up to 4',
    sub: 'White selects C. Quad spreads small assets across up to 4 gates at once.',
    duration: 2800,
  },
  {
    stateIdx: 8,
    caption: 'White spreads wide',
    sub: 'Small assets at Gates 3, 4, 5, 10 — covering many positions at once.',
    duration: 2800,
  },
  {
    stateIdx: 9,
    caption: 'Can you Capture?',
    sub: 'To take an opponent\'s position, you must dominate the most-built gate linked to it.',
    duration: 3200,
  },
  {
    stateIdx: 10,
    caption: 'Black builds toward H',
    sub: 'More assets at shared gates tips the dominance balance.',
    duration: 2800,
  },
  {
    stateIdx: 11,
    caption: 'Challenge — select H',
    sub: 'Black selects White\'s position H. If dominant on the highest gate — capture succeeds.',
    duration: 3000,
  },
  {
    stateIdx: 12,
    caption: 'Control the board',
    sub: 'Every build, every position matters. Dominate the gates. Win the board.',
    duration: 3200,
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (step >= STEPS.length) {
      onComplete();
      return;
    }
    const s = STEPS[step]!;
    timerRef.current = setTimeout(() => {
      setFade(false);
      setTimeout(() => {
        setStep(prev => prev + 1);
        setFade(true);
      }, 350);
    }, s.duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [step, onComplete]);

  const currentStep = STEPS[Math.min(step, STEPS.length - 1)]!;
  const gameState = states[currentStep.stateIdx] ?? states[0]!;
  const buildState: BoardBuildState = currentStep.buildOverride ?? EMPTY_BUILD;
  const progress = step / STEPS.length;

  return (
    <div className="tutorial-screen">
      {/* Progress bar */}
      <div className="tut-progress-bar">
        <div className="tut-progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>

      {/* Skip */}
      <button type="button" className="tut-skip" onClick={onSkip}>Skip</button>

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
