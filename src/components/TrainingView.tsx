import { useState, useCallback, useEffect, useRef } from 'react';
import { Board } from './Board';
import { selectPosition, applyMassiveBuild, applySelectiveBuild, applyQuadBuildForGates } from '../game/engine';
import { POSITION_TO_GATES } from '../game/constants';
import type { GateId, PositionId } from '../game/types';
import type { BoardBuildState } from '../app/App';
import { useLang } from '../lib/lang';
import { T1_BUILD_BASICS, T2_CAPTURE_BUILD, T7_DIAGONAL_GATES, T4_PARTIAL_BUILD, T6_ASSET_VALUES, TRAINING_TASK_META } from '../training/tasks/index';
import { validateMove } from '../training/validateMove';
import { applyFixedCpuMove } from '../training/applyFixedCpuMove';
import { saveTrainingProgress, isTaskCompleted } from '../training/trainingProgress';
import type { TrainingTaskId } from '../training/trainingProgress';
import type { TrainingSession, TrainingTask } from '../training/types';

const EMPTY_BUILD: BoardBuildState = {
  mode: 'none',
  selectiveFirst: null,
  selectiveCanConfirm: false,
  quadSelected: [],
  quadMax: 4,
};

function makeSession(task: TrainingTask): TrainingSession {
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

type ViewMode = 'intro' | 'task';

interface TrainingViewProps {
  onExit: () => void;
  userId?: string | null;
}

export function TrainingView({ onExit, userId = null }: TrainingViewProps) {
  // Keep a ref so advanceSession always reads the latest userId even in stale callbacks
  const userIdRef = useRef<string | null>(userId);
  useEffect(() => { userIdRef.current = userId ?? null; }, [userId]);
  const { t } = useLang();
  const [mode, setMode] = useState<ViewMode>('intro');
  const [session, setSession] = useState<TrainingSession>(() => makeSession(T1_BUILD_BASICS));
  const [buildState, setBuildState] = useState<BoardBuildState>(EMPTY_BUILD);

  // Completion state loaded from localStorage
  const [completedTasks, setCompletedTasks] = useState<Set<TrainingTaskId>>(() => {
    const set = new Set<TrainingTaskId>();
    if (isTaskCompleted('T1_build_basics')) set.add('T1_build_basics');
    if (isTaskCompleted('T2_capture_build')) set.add('T2_capture_build');
    if (isTaskCompleted('T7_diagonal_gates')) set.add('T7_diagonal_gates');
    if (isTaskCompleted('T4_partial_build')) set.add('T4_partial_build');
    if (isTaskCompleted('T6_asset_values')) set.add('T6_asset_values');
    return set;
  });

  // Re-read completion state whenever we return to intro
  useEffect(() => {
    if (mode === 'intro') {
      const set = new Set<TrainingTaskId>();
      if (isTaskCompleted('T1_build_basics')) set.add('T1_build_basics');
      if (isTaskCompleted('T2_capture_build')) set.add('T2_capture_build');
      if (isTaskCompleted('T7_diagonal_gates')) set.add('T7_diagonal_gates');
      if (isTaskCompleted('T4_partial_build')) set.add('T4_partial_build');
      if (isTaskCompleted('T6_asset_values')) set.add('T6_asset_values');
      setCompletedTasks(set);
    }
  }, [mode]);

  const currentStep = session.task.steps[session.stepIndex];

  // Advance past all consecutive cpu_fixed_move steps automatically
  function advanceSession(sess: TrainingSession): TrainingSession {
    let s = sess;
    while (s.status === 'playing') {
      const step = s.task.steps[s.stepIndex];
      if (!step) {
        // all steps done — save progress
        const taskId = s.task.id as TrainingTaskId;
        const newBest = s.attemptCount;
        saveTrainingProgress(userIdRef.current, {
          taskId,
          completedAt: new Date().toISOString(),
          attemptCount: s.attemptCount,
          bestAttemptCount: newBest,
          lastCompletedStep: s.task.steps.filter((st) => st.kind === 'user_move').length,
        });
        setCompletedTasks((prev) => new Set([...prev, taskId]));
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

  function startTask(task: TrainingTask) {
    setSession(makeSession(task));
    setBuildState(EMPTY_BUILD);
    setMode('task');
  }

  function handleBackToIntro() {
    setMode('intro');
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
        return prev;
      }

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

      if (!connectedGates.includes(gateId)) return prev;

      const current = prev.quadSelected;
      let next: GateId[];
      if (current.includes(gateId)) {
        next = current.filter((id) => id !== gateId);
        setBuildState({ mode: 'quad', selectiveFirst: null, selectiveCanConfirm: false, quadSelected: next, quadMax });
        return { ...prev, quadSelected: next };
      }
      next = [...current, gateId] as GateId[];

      if (next.length >= quadMax) {
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

      setBuildState({ mode: 'quad', selectiveFirst: null, selectiveCanConfirm: false, quadSelected: next, quadMax });
      return { ...prev, quadSelected: next, feedback: null };
    });
  }, [t]);

  const handleMiddleOrSelective = useCallback((gateId: GateId) => {
    setSession((prev) => {
      if (prev.status !== 'playing') return prev;
      const step = prev.task.steps[prev.stepIndex];
      if (!step || step.kind !== 'user_move') return prev;
      if (!prev.gameState.selectedPosition) return prev;

      if (prev.selectiveFirst !== null) {
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

      if (step.expected.build.type === 'selective') {
        setBuildState({ mode: 'selective', selectiveFirst: gateId, selectiveCanConfirm: false, quadSelected: [], quadMax: 4 });
        return { ...prev, selectiveFirst: gateId, feedback: null };
      }

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
    setSession(makeSession(session.task));
    setBuildState(EMPTY_BUILD);
  }

  function handleNextTraining() {
    // On task complete -> return to intro so the next task becomes available
    setMode('intro');
  }

  // ── Intro screen ─────────────────────────────────────────────────────────
  if (mode === 'intro') {
    return (
      <div style={{ background: '#ffffff', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #e8e0d8' }}>
          <button type="button" className="mode-modal-cancel" onClick={onExit} style={{ margin: 0 }}>
            {t.trainingBackToMenu}
          </button>
          <div style={{ flex: 1 }}>
            <div className="result-eyebrow">{t.trainingTitle}</div>
            <div style={{ fontWeight: 700, fontSize: '15px' }}>{t.trainingIntroSubtitle}</div>
          </div>
        </div>

        {/* Description */}
        <div style={{ padding: '16px', background: '#faf7f4', borderBottom: '1px solid #e8e0d8' }}>
          <div style={{ fontSize: '14px', color: '#555' }}>{t.trainingIntroDesc}</div>
        </div>

        {/* Task list */}
        <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {TRAINING_TASK_META.map((meta) => {
            const taskId = meta.task.id as TrainingTaskId;
            const isCompleted = completedTasks.has(taskId);
            const prerequisite = meta.prerequisite as TrainingTaskId | null;
            const isLocked = prerequisite !== null && !completedTasks.has(prerequisite);
            const statusLabel = isCompleted
              ? t.trainingTaskStatusComplete
              : isLocked
              ? t.trainingTaskStatusLocked
              : t.trainingTaskStatusAvailable;

            const descKeyMap: Record<TrainingTaskId, string> = {
              T1_build_basics: 'trainingT1Desc',
              T2_capture_build: 'trainingT2Desc',
              T7_diagonal_gates: 'trainingT7Desc',
              T4_partial_build: 'trainingT4Desc',
              T6_asset_values: 'trainingT6Desc',
            };
            const descKey = descKeyMap[taskId] ?? '';
            const descText = (t as Record<string, unknown>)[descKey] as string | undefined;

            return (
              <div
                key={taskId}
                style={{
                  border: '1px solid #e8e0d8',
                  borderRadius: '8px',
                  padding: '14px 16px',
                  background: isLocked ? '#f7f4f0' : '#ffffff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: isLocked ? '#aaa' : '#222' }}>
                    T{meta.order} — {(t as Record<string, unknown>)[meta.titleKey] as string}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: isCompleted ? '#4a7c4a' : isLocked ? '#aaa' : '#7a6a3a',
                    padding: '2px 8px',
                    border: `1px solid ${isCompleted ? '#4a7c4a' : isLocked ? '#ccc' : '#c0a060'}`,
                    borderRadius: '4px',
                    whiteSpace: 'nowrap',
                  }}>
                    {statusLabel}
                  </div>
                </div>
                {descText && (
                  <div style={{ fontSize: '13px', color: isLocked ? '#bbb' : '#666', marginBottom: '10px' }}>
                    {descText}
                  </div>
                )}
                {isLocked ? (
                  <div style={{ fontSize: '12px', color: '#aaa' }}>{t.trainingLockedMessage}</div>
                ) : (
                  <button
                    type="button"
                    className="result-btn result-btn-primary"
                    style={{ marginTop: '4px' }}
                    onClick={() => startTask(meta.task)}
                  >
                    {isCompleted ? t.trainingReplay : t.trainingStart}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Task screen ───────────────────────────────────────────────────────────
  const completeTitle: string = (() => {
    if (session.task.id === 'T2_capture_build') return t.trainingT2Complete;
    if (session.task.id === 'T7_diagonal_gates') return t.trainingT7Complete;
    if (session.task.id === 'T4_partial_build') return (t as Record<string, unknown>)['trainingT4Complete'] as string ?? 'Partial Build Complete';
    if (session.task.id === 'T6_asset_values') return (t as Record<string, unknown>)['trainingT6Complete'] as string ?? 'Asset Values Complete';
    return t.trainingCompleteTitle;
  })();

  const stepLabel: string = (() => {
    if (session.status === 'complete') return completeTitle;
    if (!currentStep || currentStep.kind !== 'user_move') return '';
    const key = currentStep.labelKey as keyof typeof t;
    return (t[key] as string) ?? currentStep.labelKey;
  })();

  const userStepNum = session.task.steps
    .slice(0, session.stepIndex + 1)
    .filter((s) => s.kind === 'user_move').length;
  const totalUserSteps = session.task.steps.filter((s) => s.kind === 'user_move').length;

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #e8e0d8' }}>
        <button type="button" className="mode-modal-cancel" onClick={handleBackToIntro} style={{ margin: 0 }}>
          {t.trainingBackToIntro}
        </button>
        <div style={{ flex: 1 }}>
          <div className="result-eyebrow">{t.trainingTitle}</div>
          <div style={{ fontWeight: 700, fontSize: '15px' }}>{t.trainingRecordeTitle} — {(t[session.task.titleKey as keyof typeof t] as string) ?? session.task.titleKey}</div>
        </div>
      </div>

      {/* Step instruction */}
      <div style={{ padding: '12px 16px', background: '#faf7f4', borderBottom: '1px solid #e8e0d8' }}>
        {session.status === 'complete' ? (
          <div style={{ fontWeight: 700, fontSize: '15px', textAlign: 'center' }}>{completeTitle}</div>
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
          <>
            {session.task.id !== 'T7_diagonal_gates' && session.task.id !== 'T6_asset_values' && (
              <button type="button" className="result-btn result-btn-primary" onClick={handleNextTraining}>
                {t.trainingNextTraining}
              </button>
            )}
            <button type="button" className="result-btn" onClick={handleRestart}>
              {t.trainingReplay}
            </button>
            <button type="button" className="result-btn" onClick={handleBackToIntro}>
              {t.trainingBackToIntro}
            </button>
          </>
        ) : (
          <button type="button" className="result-btn" onClick={handleRestartStep}>
            {t.trainingRestartStep}
          </button>
        )}
      </div>
    </div>
  );
}
