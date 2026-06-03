import { useState, useCallback } from 'react';
import { Board } from './Board';
import { selectPosition, applyMassiveBuild, applySelectiveBuild, applyQuadBuildForGates } from '../game/engine';
import { POSITION_TO_GATES } from '../game/constants';
import type { GateId, PositionId } from '../game/types';
import type { BoardBuildState } from '../app/App';
import { useLang } from '../lib/lang';
import { T1_BUILD_BASICS } from '../training/tasks/index';
import { validateMove } from '../training/validateMove';
import { applyFixedCpuMove } from '../training/applyFixedCpuMove';
import { saveTrainingProgress } from '../training/trainingProgress';
import type { TrainingSession } from '../training/types';

const EMPTY_BUILD: BoardBuildState = {
  mode: 'none',
  selectiveFirst: null,
  selectiveCanConfirm: false,
  quadSelected: [],
  quadMax: 4,
};

function makeInitialSession(): TrainingSession {
  const task = T1_BUILD_BASICS;
  return {
    task,
    stepIndex: 0,
    gameState: { ...task.initialState },
    snapshot: { ...task.initialState },
    attemptCount: 0,
    status: 'playing',
    feedback: null,
    selectiveFirst: null,
    quadSelected: [],
  };
}

interface TrainingViewProps {
  onExit: () => void;
}

export function TrainingView({ onExit }: TrainingViewProps) {
  const { t } = useLang();
  const [session, setSession] = useState<TrainingSession>(makeInitialSession);
  const [buildState, setBuildState] = useState<BoardBuildState>(EMPTY_BUILD);

  const currentStep = session.task.steps[session.stepIndex];

  // Advance past all consecutive cpu_fixed_move steps automatically
  function advanceSession(sess: TrainingSession): TrainingSession {
    let s = sess;
    while (s.status === 'playing') {
      const step = s.task.steps[s.stepIndex];
      if (!step) {
        // all steps done
        saveTrainingProgress(null as unknown as string, { taskId: 'T1_build_basics', completedAt: new Date().toISOString() });
        return { ...s, status: 'complete', feedback: null };
      }
      if (step.kind !== 'cpu_fixed_move') break;
      // auto-apply CPU move
      const nextState = applyFixedCpuMove(s.gameState, step.move);
      s = {
        ...s,
        stepIndex: s.stepIndex + 1,
        gameState: nextState,
        snapshot: nextState,
        feedback: null,
      };
    }
    return s;
  }

  const handleSelectPosition = useCallback((positionId: PositionId) => {
    setSession((prev) => {
      if (prev.status !== 'playing') return prev;
      const step = prev.task.steps[prev.stepIndex];
      if (!step || step.kind !== 'user_move') return prev;
      const nextState = selectPosition(prev.gameState, positionId);
      return { ...prev, gameState: nextState, feedback: null };
    });
    setBuildState(EMPTY_BUILD);
  }, []);

  const handleMiddlePocketClick = useCallback((gateId: GateId) => {
    setSession((prev) => {
      if (prev.status !== 'playing') return prev;
      const step = prev.task.steps[prev.stepIndex];
      if (!step || step.kind !== 'user_move') return prev;
      if (!prev.gameState.selectedPosition) return prev;

      // selective: first or second click
      if (prev.selectiveFirst === null) {
        // first click — store and wait
        setBuildState({ mode: 'selective', selectiveFirst: gateId, selectiveCanConfirm: false, quadSelected: [], quadMax: 4 });
        return { ...prev, selectiveFirst: gateId, feedback: null };
      }

      if (prev.selectiveFirst === gateId) {
        // deselect first click
        setBuildState(EMPTY_BUILD);
        return { ...prev, selectiveFirst: null, feedback: null };
      }

      // second click — apply selective build
      const gates: [GateId, GateId] = [prev.selectiveFirst, gateId];
      const nextState = applySelectiveBuild(prev.gameState, gates);
      const lastRecord = nextState.history[nextState.history.length - 1];
      if (!lastRecord) return prev; // no change

      const expected = step.expected;
      if (validateMove(lastRecord, expected)) {
        const advanced = advanceSession({ ...prev, stepIndex: prev.stepIndex + 1, gameState: nextState, snapshot: nextState, selectiveFirst: null, feedback: t.trainingFeedbackCleared });
        setBuildState(EMPTY_BUILD);
        return advanced;
      } else {
        // wrong move — rollback
        setBuildState(EMPTY_BUILD);
        return { ...prev, gameState: prev.snapshot, selectiveFirst: null, attemptCount: prev.attemptCount + 1, feedback: t.trainingFeedbackWrong };
      }
    });
  }, [t]);

  const handleLargePocketClick = useCallback((gateId: GateId) => {
    setSession((prev) => {
      if (prev.status !== 'playing') return prev;
      const step = prev.task.steps[prev.stepIndex];
      if (!step || step.kind !== 'user_move') return prev;
      if (!prev.gameState.selectedPosition) return prev;

      const nextState = applyMassiveBuild(prev.gameState, gateId);
      const lastRecord = nextState.history[nextState.history.length - 1];
      if (!lastRecord) return prev;

      const expected = step.expected;
      if (validateMove(lastRecord, expected)) {
        const advanced = advanceSession({ ...prev, stepIndex: prev.stepIndex + 1, gameState: nextState, snapshot: nextState, selectiveFirst: null, feedback: t.trainingFeedbackCleared });
        setBuildState(EMPTY_BUILD);
        return advanced;
      } else {
        setBuildState(EMPTY_BUILD);
        return { ...prev, gameState: prev.snapshot, selectiveFirst: null, attemptCount: prev.attemptCount + 1, feedback: t.trainingFeedbackWrong };
      }
    });
  }, [t]);

  const handleMassiveMiddleClick = useCallback((gateId: GateId) => {
    setSession((prev) => {
      if (prev.status !== 'playing') return prev;
      const step = prev.task.steps[prev.stepIndex];
      if (!step || step.kind !== 'user_move') return prev;
      if (!prev.gameState.selectedPosition) return prev;
      if (prev.selectiveFirst !== null) {
        // in selective flow — delegate to selective handler (handled above)
        return prev;
      }

      // Try massive build on middle pocket
      const nextState = applyMassiveBuild(prev.gameState, gateId);
      const lastRecord = nextState.history[nextState.history.length - 1];
      if (!lastRecord) return prev;

      const expected = step.expected;
      if (validateMove(lastRecord, expected)) {
        const advanced = advanceSession({ ...prev, stepIndex: prev.stepIndex + 1, gameState: nextState, snapshot: nextState, selectiveFirst: null, feedback: t.trainingFeedbackCleared });
        setBuildState(EMPTY_BUILD);
        return advanced;
      } else {
        setBuildState(EMPTY_BUILD);
        return { ...prev, gameState: prev.snapshot, selectiveFirst: null, attemptCount: prev.attemptCount + 1, feedback: t.trainingFeedbackWrong };
      }
    });
  }, [t]);

  const handleSmallPocketClick = useCallback((gateId: GateId) => {
    setSession((prev) => {
      if (prev.status !== 'playing') return prev;
      const step = prev.task.steps[prev.stepIndex];
      if (!step || step.kind !== 'user_move') return prev;
      const pos = prev.gameState.selectedPosition;
      if (!pos) return prev;
      if (step.expected.build.type !== 'quad') return prev;

      const connectedGates = POSITION_TO_GATES[pos];
      const quadMax = connectedGates.length;

      // Only allow connected gates
      if (!connectedGates.includes(gateId)) return prev;

      // Toggle selection
      const current = prev.quadSelected;
      let next: GateId[];
      if (current.includes(gateId)) {
        next = current.filter((id) => id !== gateId);
        setBuildState({ mode: 'quad', selectiveFirst: null, selectiveCanConfirm: false, quadSelected: next, quadMax });
        return { ...prev, quadSelected: next };
      }
      next = [...current, gateId] as GateId[];

      if (next.length >= quadMax) {
        // All gates selected — apply build and validate
        const nextState = applyQuadBuildForGates(prev.gameState, next);
        const lastRecord = nextState.history[nextState.history.length - 1];
        if (!lastRecord) return prev;

        const expected = step.expected;
        if (validateMove(lastRecord, expected)) {
          const advanced = advanceSession({ ...prev, stepIndex: prev.stepIndex + 1, gameState: nextState, snapshot: nextState, selectiveFirst: null, quadSelected: [], feedback: t.trainingFeedbackCleared });
          setBuildState(EMPTY_BUILD);
          return advanced;
        } else {
          setBuildState(EMPTY_BUILD);
          return { ...prev, gameState: prev.snapshot, selectiveFirst: null, quadSelected: [], attemptCount: prev.attemptCount + 1, feedback: t.trainingFeedbackWrong };
        }
      }

      // Accumulate — not all gates selected yet
      setBuildState({ mode: 'quad', selectiveFirst: null, selectiveCanConfirm: false, quadSelected: next, quadMax });
      return { ...prev, quadSelected: next, feedback: null };
    });
  }, [t]);

  // Combined middle pocket handler: routes to selective or massive
  const handleMiddleOrSelective = useCallback((gateId: GateId) => {
    setSession((prev) => {
      if (prev.status !== 'playing') return prev;
      const step = prev.task.steps[prev.stepIndex];
      if (!step || step.kind !== 'user_move') return prev;
      if (!prev.gameState.selectedPosition) return prev;

      if (prev.selectiveFirst !== null) {
        // second selective pick
        if (prev.selectiveFirst === gateId) {
          setBuildState(EMPTY_BUILD);
          return { ...prev, selectiveFirst: null, feedback: null };
        }
        const gates: [GateId, GateId] = [prev.selectiveFirst, gateId];
        const nextState = applySelectiveBuild(prev.gameState, gates);
        const lastRecord = nextState.history[nextState.history.length - 1];
        if (!lastRecord) return prev;
        const expected = step.expected;
        if (validateMove(lastRecord, expected)) {
          const advanced = advanceSession({ ...prev, stepIndex: prev.stepIndex + 1, gameState: nextState, snapshot: nextState, selectiveFirst: null, feedback: t.trainingFeedbackCleared });
          setBuildState(EMPTY_BUILD);
          return advanced;
        } else {
          setBuildState(EMPTY_BUILD);
          return { ...prev, gameState: prev.snapshot, selectiveFirst: null, attemptCount: prev.attemptCount + 1, feedback: t.trainingFeedbackWrong };
        }
      }

      // first click: check if expected is selective
      if (step.expected.build.type === 'selective') {
        setBuildState({ mode: 'selective', selectiveFirst: gateId, selectiveCanConfirm: false, quadSelected: [], quadMax: 4 });
        return { ...prev, selectiveFirst: gateId, feedback: null };
      }

      // massive
      const nextState = applyMassiveBuild(prev.gameState, gateId);
      const lastRecord = nextState.history[nextState.history.length - 1];
      if (!lastRecord) return prev;
      const expected = step.expected;
      if (validateMove(lastRecord, expected)) {
        const advanced = advanceSession({ ...prev, stepIndex: prev.stepIndex + 1, gameState: nextState, snapshot: nextState, selectiveFirst: null, feedback: t.trainingFeedbackCleared });
        setBuildState(EMPTY_BUILD);
        return advanced;
      } else {
        setBuildState(EMPTY_BUILD);
        return { ...prev, gameState: prev.snapshot, selectiveFirst: null, attemptCount: prev.attemptCount + 1, feedback: t.trainingFeedbackWrong };
      }
    });
  }, [t]);

  function handleRestartStep() {
    setSession((prev) => ({
      ...prev,
      gameState: prev.snapshot,
      selectiveFirst: null,
      quadSelected: [],
      feedback: null,
    }));
    setBuildState(EMPTY_BUILD);
  }

  function handleRestart() {
    setSession(makeInitialSession());
    setBuildState(EMPTY_BUILD);
  }

  // Step label for current user step
  const stepLabel: string = (() => {
    if (session.status === 'complete') return t.trainingCompleteTitle;
    if (!currentStep || currentStep.kind !== 'user_move') return '';
    const key = currentStep.labelKey as keyof typeof t;
    return (t[key] as string) ?? currentStep.labelKey;
  })();

  // Step number (1-indexed among user_move steps)
  const userStepNum = session.task.steps
    .slice(0, session.stepIndex + 1)
    .filter((s) => s.kind === 'user_move').length;
  const totalUserSteps = session.task.steps.filter((s) => s.kind === 'user_move').length;

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #e8e0d8' }}>
        <button type="button" className="mode-modal-cancel" onClick={onExit} style={{ margin: 0 }}>
          {t.trainingBackToMenu}
        </button>
        <div style={{ flex: 1 }}>
          <div className="result-eyebrow">{t.trainingTitle}</div>
          <div style={{ fontWeight: 700, fontSize: '15px' }}>{t.trainingRecordeTitle} — {t.trainingT1Title}</div>
        </div>
      </div>

      {/* Step instruction */}
      <div style={{ padding: '12px 16px', background: '#faf7f4', borderBottom: '1px solid #e8e0d8' }}>
        {session.status === 'complete' ? (
          <div style={{ fontWeight: 700, fontSize: '15px', textAlign: 'center' }}>{t.trainingCompleteTitle}</div>
        ) : (
          <>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
              Step {userStepNum} / {totalUserSteps}
            </div>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>{stepLabel}</div>
          </>
        )}
        {session.feedback && (
          <div style={{ marginTop: '6px', fontSize: '13px', color: session.feedback === t.trainingFeedbackWrong ? '#b05050' : '#4a7c4a' }}>
            {session.feedback}
          </div>
        )}
      </div>

      {/* Board */}
      {session.status !== 'complete' && (
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
          <Board
            state={session.gameState}
            buildState={buildState}
            onSelectPosition={handleSelectPosition}
            onLargePocketClick={handleLargePocketClick}
            onMiddlePocketClick={handleMiddleOrSelective}
            onSmallPocketClick={handleSmallPocketClick}
            showLabelToggle={false}
            defaultLabels={true}
            labelPerspective="black"
          />
        </div>
      )}

      {/* Actions */}
      <div style={{ padding: '12px 16px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
        {session.status === 'complete' ? (
          <button type="button" className="result-btn result-btn-primary" onClick={handleRestart}>
            Restart
          </button>
        ) : (
          <button type="button" className="result-btn" onClick={handleRestartStep}>
            {t.trainingRestartStep}
          </button>
        )}
      </div>
    </div>
  );
}
