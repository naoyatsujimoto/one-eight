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
import { useLang } from '../lib/lang';

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

const EMPTY_BUILD: BoardBuildState = {
  mode: 'none',
  selectiveFirst: null,
  selectiveCanConfirm: false,
  quadSelected: [],
  quadMax: 4,
};

// State index for each of the 13 tutorial steps (matches tutSteps array order)
const STEP_STATE_INDICES = [0, 0, 0, 1, 2, 6, 8, 8, 8, 11, 11, 12, 0];

// ── Component ─────────────────────────────────────────────────────────────────

interface TutorialScreenProps {
  onComplete: () => void;
  onSkip: () => void;
}

export function TutorialScreen({ onComplete, onSkip }: TutorialScreenProps) {
  const { t } = useLang();
  const steps = t.tutSteps;
  const states = useMemo(() => buildStates(), []);
  const [step, setStep] = useState(0);
  const [fade, setFade] = useState(true);
  const touchStartX = useRef<number | null>(null);

  function advance(dir: 'next' | 'prev') {
    setFade(false);
    setTimeout(() => {
      setStep(prev => {
        const next = dir === 'next' ? prev + 1 : Math.max(0, prev - 1);
        if (next >= steps.length) { onComplete(); return prev; }
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

  const currentStep = steps[Math.min(step, steps.length - 1)]!;
  const stateIdx = STEP_STATE_INDICES[Math.min(step, STEP_STATE_INDICES.length - 1)] ?? 0;
  const gameState = states[stateIdx] ?? states[0]!;
  const buildState: BoardBuildState = EMPTY_BUILD;
  const progress = (step + 1) / steps.length;

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
      <button type="button" className="tut-skip" onClick={e => { e.stopPropagation(); onSkip(); }}>{t.tutSkip}</button>

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
        {step === steps.length - 1 && (
          <button
            type="button"
            className="tut-start-btn"
            onClick={e => { e.stopPropagation(); onComplete(); }}
          >
            {t.tutStartBtn}
          </button>
        )}
      </div>

      {/* Step dots */}
      <div className="tut-dots">
        {steps.map((_, i) => (
          <span key={i} className={`tut-dot-nav${i === step ? ' active' : i < step ? ' done' : ''}`} />
        ))}
      </div>
    </div>
  );
}
