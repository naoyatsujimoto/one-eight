import { useRef, useState, useMemo, useCallback } from 'react';
import { Board } from './Board';
import { createInitialState } from '../game/initialState';
import {
  selectPosition,
  applyMassiveBuild,
  applySelectiveBuild,
  applyQuadBuildForGates,
} from '../game/engine';
import type { GameState, GateId } from '../game/types';
import type { BoardBuildState } from '../app/App';
import { useLang } from '../lib/lang';

// ── Build scripted game states ────────────────────────────────────────────────

function buildStates(): GameState[] {
  const s0 = createInitialState();
  const states: GameState[] = [s0];

  // s1: Black selects G
  const s1 = selectPosition(s0, 'G');
  states.push(s1);

  // s2: Black massive @ gate 1
  const s2 = applyMassiveBuild(s1, 1);
  states.push(s2);

  // s3: White selects H
  const s3 = selectPosition(s2, 'H');
  states.push(s3);

  // s4: White massive @ gate 2
  const s4 = applyMassiveBuild(s3, 2);
  states.push(s4);

  // s5: Black selects A (for selective)
  const s5 = selectPosition(s4, 'A');
  states.push(s5);

  // s6: Black selective @ gates 2,7
  const s6 = applySelectiveBuild(s5, [2, 7]);
  states.push(s6);

  // s7: White selects C (for quad)
  const s7 = selectPosition(s6, 'C');
  states.push(s7);

  // s8: White quad @ gates 3,4,5,10
  const s8 = applyQuadBuildForGates(s7, [3, 4, 5, 10]);
  states.push(s8);

  // s9: Black selects G
  const s9 = selectPosition(s8, 'G');
  states.push(s9);

  // s10: Black selective @ gates 1,4
  const s10 = applySelectiveBuild(s9, [1, 4]);
  states.push(s10);

  // s11: Black selects H (capture attempt)
  const s11 = selectPosition(s10, 'H');
  states.push(s11);

  // s12: Black massive @ gate 9
  const s12 = applyMassiveBuild(s11, 9);
  states.push(s12);

  return states;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EMPTY_BUILD: BoardBuildState = {
  mode: 'none',
  selectiveFirst: null,
  selectiveCanConfirm: false,
  quadSelected: [],
  quadMax: 4,
};

// State index for each of the 19 tutorial steps
// 0:WIN_POS 1:BUILD_UP 2:BOARD 3:BLACK_FIRST 4:EACH_TURN 5:SELECT_POS
// 6:MASSIVE 7:SELECTIVE 8:QUAD 9:SIZE 10:SHARED 11:PASS_RULE
// 12:NO_BUILD 13:CAPTURE 14:EMPTY_POS 15:MOST_BUILT 16:TIED_GATES 17:END 18:START
const STEP_STATE_INDICES = [4, 2, 0, 0, 0, 1, 2, 6, 8, 8, 8, 8, 12, 11, 0, 11, 11, 12, 0];

// Gate highlights per step (null = none)
const STEP_GATE_HIGHLIGHTS: (GateId[] | null)[] = [
  null,          // 0: WIN_POS — show positions
  [1],           // 1: BUILD_UP — gate 1 has a Large asset
  null,          // 2: BOARD
  null,          // 3: BLACK_FIRST
  null,          // 4: EACH_TURN (interactive)
  [1, 4, 7, 10], // 5: SELECT_POS — G's gates
  [1],           // 6: MASSIVE — gate 1 built
  [2, 7],        // 7: SELECTIVE — gates 2,7 have Middle assets
  [3, 4, 5, 10], // 8: QUAD — white's quad gates
  null,          // 9: SIZE
  [2],           // 10: SHARED — gate 2 shared by both
  null,          // 11: PASS_RULE
  null,          // 12: NO_BUILD
  [2, 5, 6, 9],  // 13: CAPTURE — H's gates
  null,          // 14: EMPTY_POS
  [2],           // 15: MOST_BUILT — gate 2 most built
  null,          // 16: TIED_GATES
  null,          // 17: END
  null,          // 18: START
];

// Which steps highlight all positions
const STEP_HIGHLIGHT_ALL_POSITIONS = new Set([0]); // WIN_POS

// Which steps are interactive (user can click board)
const STEP_INTERACTIVE = new Set([4]); // EACH_TURN

// ── Component ─────────────────────────────────────────────────────────────────

interface TutorialScreenProps {
  onComplete: () => void;
  onSkip: () => void;
}

export function TutorialScreen({ onComplete, onSkip }: TutorialScreenProps) {
  const { t, lang } = useLang();
  const steps = t.tutSteps;
  const scriptedStates = useMemo(() => buildStates(), []);

  const [step, setStep] = useState(0);
  const [fade, setFade] = useState(true);
  const touchStartX = useRef<number | null>(null);

  // Interactive board state (used only on step 2: EACH_TURN)
  const [interactiveState, setInteractiveState] = useState<GameState>(() => createInitialState());
  const [interactiveBuild, setInteractiveBuild] = useState<BoardBuildState>(EMPTY_BUILD);

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

  function handleClick(e: React.MouseEvent) {
    if (STEP_INTERACTIVE.has(step)) return; // don't advance on interactive steps
    const half = window.innerWidth / 2;
    if (e.clientX > half) advance('next');
    else advance('prev');
  }

  // Interactive handlers for EACH_TURN step
  const handleSelectPosition = useCallback((posId: import('../game/types').PositionId) => {
    setInteractiveState(prev => selectPosition(prev, posId));
    setInteractiveBuild(EMPTY_BUILD);
  }, []);

  const handleLargePocket = useCallback((gateId: GateId) => {
    setInteractiveState(prev => {
      const next = applyMassiveBuild(prev, gateId);
      return next;
    });
    setInteractiveBuild(EMPTY_BUILD);
  }, []);

  const handleMiddlePocket = useCallback((gateId: GateId) => {
    setInteractiveBuild(prev => {
      if (prev.selectiveFirst === null) {
        return { ...prev, mode: 'selective', selectiveFirst: gateId, selectiveCanConfirm: true };
      }
      if (prev.selectiveFirst === gateId) {
        return EMPTY_BUILD;
      }
      const gates: [GateId, GateId] = [prev.selectiveFirst, gateId];
      setInteractiveState(s => applySelectiveBuild(s, gates));
      return EMPTY_BUILD;
    });
  }, []);

  const handleSmallPocket = useCallback((gateId: GateId) => {
    setInteractiveBuild(prev => {
      if (prev.quadSelected.includes(gateId)) {
        const next = prev.quadSelected.filter(id => id !== gateId);
        return next.length === 0 ? EMPTY_BUILD : { ...prev, quadSelected: next };
      }
      const next = [...prev.quadSelected, gateId];
      if (next.length >= 4) {
        setInteractiveState(s => applyQuadBuildForGates(s, next as GateId[]));
        return EMPTY_BUILD;
      }
      return { ...prev, mode: 'quad', quadSelected: next };
    });
  }, []);

  const stateIdx = STEP_STATE_INDICES[Math.min(step, STEP_STATE_INDICES.length - 1)] ?? 0;
  const isInteractive = STEP_INTERACTIVE.has(step);
  const gameState = isInteractive ? interactiveState : (scriptedStates[stateIdx] ?? scriptedStates[0]!);
  const buildState = isInteractive ? interactiveBuild : EMPTY_BUILD;

  const gateHlArray = STEP_GATE_HIGHLIGHTS[step] ?? null;
  const tutorialGateHighlights = gateHlArray ? new Set<GateId>(gateHlArray) : undefined;
  const tutorialHighlightAllPositions = STEP_HIGHLIGHT_ALL_POSITIONS.has(step);

  const currentStep = steps[Math.min(step, steps.length - 1)]!;
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
      <button type="button" className="tut-skip" onClick={e => { e.stopPropagation(); onSkip(); }}>
        {t.tutSkip}
      </button>

      {/* Click area hints (hidden on interactive step) */}
      {!isInteractive && <div className="tut-click-prev" aria-hidden="true">‹</div>}
      {!isInteractive && <div className="tut-click-next" aria-hidden="true">›</div>}

      {/* Board */}
      <div className="tut-board-area" onClick={e => { if (isInteractive) e.stopPropagation(); }}>
        <Board
          state={gameState}
          buildState={buildState}
          onSelectPosition={isInteractive ? handleSelectPosition : () => {}}
          onLargePocketClick={isInteractive ? handleLargePocket : () => {}}
          onMiddlePocketClick={isInteractive ? handleMiddlePocket : () => {}}
          onSmallPocketClick={isInteractive ? handleSmallPocket : () => {}}
          tutorialGateHighlights={tutorialGateHighlights}
          tutorialHighlightAllPositions={tutorialHighlightAllPositions}
          showLabelToggle={false}
          defaultLabels={false}
        />
      </div>

      {/* Caption */}
      <div className={`tut-caption${fade ? '' : ' tut-caption-fade'}`}>
        <div className="tut-caption-title">{currentStep.caption}</div>
        <div className="tut-caption-sub">{currentStep.sub}</div>
        {isInteractive && (
          <button
            type="button"
            className="tut-start-btn"
            style={{ marginTop: 12, background: '#555', fontSize: 13 }}
            onClick={e => { e.stopPropagation(); advance('next'); }}
          >
            {lang === 'ja' ? '次へ →' : 'Next →'}
          </button>
        )}
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
