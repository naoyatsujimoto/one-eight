import { useState, useCallback, useEffect, useRef } from 'react';
import { FullGameTrainingRunner } from './FullGameTrainingRunner';
import { isFullGameCompleted } from '../training/fullGameUtils';
import { Board } from './Board';
import { selectPosition, applyMassiveBuild, applySelectiveBuild, applyQuadBuildForGates } from '../game/engine';
import { POSITION_TO_GATES } from '../game/constants';
import type { GateId, PositionId } from '../game/types';
import type { BoardBuildState } from '../app/App';
import { useLang } from '../lib/lang';
import { T1_BUILD_BASICS, T2_CAPTURE_BUILD, T7_DIAGONAL_GATES, T4_PARTIAL_BUILD, T6_ASSET_VALUES, T5_CAPTURE_TIE, T8_PREPARE_CAPTURE, T9_NO_BUILD_ENDGAME, TRAINING_TASK_META } from '../training/tasks/index';
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

type ViewMode = 'intro' | 'task' | 'fullgame';

interface TrainingViewProps {
  onExit: () => void;
  userId?: string | null;
}

export function TrainingView({ onExit, userId = null }: TrainingViewProps) {
  // Keep a ref so advanceSession always reads the latest userId even in stale callbacks
  const userIdRef = useRef<string | null>(userId);
  useEffect(() => { userIdRef.current = userId ?? null; }, [userId]);
  const { t, lang } = useLang();
  const [mode, setMode] = useState<ViewMode>('intro');
  const [fullGameCompleted, setFullGameCompleted] = useState(() => isFullGameCompleted());
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
    if (isTaskCompleted('T5_capture_tie')) set.add('T5_capture_tie');
    if (isTaskCompleted('T8_prepare_capture')) set.add('T8_prepare_capture');
    if (isTaskCompleted('T9_no_build_endgame')) set.add('T9_no_build_endgame');
    if (isTaskCompleted('T10_defensive_build')) set.add('T10_defensive_build');
    return set;
  });

  // Re-read completion state whenever we return to intro
  useEffect(() => {
    if (mode === 'intro') {
      setFullGameCompleted(isFullGameCompleted());
      const set = new Set<TrainingTaskId>();
      if (isTaskCompleted('T1_build_basics')) set.add('T1_build_basics');
      if (isTaskCompleted('T2_capture_build')) set.add('T2_capture_build');
      if (isTaskCompleted('T7_diagonal_gates')) set.add('T7_diagonal_gates');
      if (isTaskCompleted('T4_partial_build')) set.add('T4_partial_build');
      if (isTaskCompleted('T6_asset_values')) set.add('T6_asset_values');
      if (isTaskCompleted('T5_capture_tie')) set.add('T5_capture_tie');
      if (isTaskCompleted('T8_prepare_capture')) set.add('T8_prepare_capture');
      if (isTaskCompleted('T9_no_build_endgame')) set.add('T9_no_build_endgame');
      if (isTaskCompleted('T10_defensive_build')) set.add('T10_defensive_build');
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

      const minGates = step.expected.build.type === 'quad' ? step.expected.build.minGates : undefined;
      const autoCommitThreshold = minGates !== undefined ? Math.min(minGates, quadMax) : quadMax;
      if (next.length >= autoCommitThreshold) {
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
      <div className="trn-screen">
        {/* Header */}
        <div className="trn-topbar">
          <button type="button" className="top-btn" onClick={onExit}>
            ← {t.trainingBackToMenu}
          </button>
          <div className="trn-topbar-center">
            <span className="trn-eyebrow">{t.trainingTitle}</span>
            <span className="trn-topbar-title">{t.trainingIntroSubtitle}</span>
          </div>
          <div style={{ width: '80px' }} />
        </div>

        {/* Description */}
        <div className="trn-desc-band">
          <p className="trn-desc-text">{t.trainingIntroDesc}</p>
        </div>

        {/* Task list */}
        <div className="trn-list">

          {/* ── Section 1: 一局通し Training ───────────────────────── */}
          <div className="trn-section-head">
            <div className="trn-section-eyebrow-row">
              <span className="trn-eyebrow-dot" />
              <span className="trn-section-title">
                {lang === 'ja' ? '一局通し Training' : 'Guided Game'}
              </span>
            </div>
            <span className="trn-section-sub">
              {lang === 'ja'
                ? 'Blackとして1局の流れを追いながら、Build、防衛、Capture、勝勢判断を学びます。'
                : 'Play through one guided game as Black and learn build timing, defense, capture, and winning judgment.'}
            </span>
          </div>

          {/* ── Full-game course card ────────────────────────────────── */}
          <div className="trn-card trn-card-featured">
            <div className="trn-card-head">
              <span className="trn-card-eyebrow">
                {lang === 'ja' ? '1局通し' : 'Guided Game'}
              </span>
              <span className={`trn-status-badge ${fullGameCompleted ? 'trn-status-complete' : 'trn-status-available'}`}>
                {fullGameCompleted ? t.trainingTaskStatusComplete : t.trainingTaskStatusAvailable}
              </span>
            </div>
            <div className="trn-card-title">
              {lang === 'ja' ? '一局指南' : 'Guided Game'}
            </div>
            <div className="trn-card-desc">
              {lang === 'ja'
                ? '実戦の流れでONE EIGHTの全体戦略を学ぶコース。Black番で22手を指し切ります。'
                : 'Learn ONE EIGHT strategy through the flow of one guided game. Play 22 moves as Black.'}
            </div>
            <button
              type="button"
              className="action-btn action-btn-primary"
              onClick={() => setMode('fullgame')}
            >
              {fullGameCompleted ? t.trainingReplay : t.trainingStart}
            </button>
          </div>

          {/* ── Section 2: 小課題 Training ──────────────────────────── */}
          <div className="trn-section-head trn-section-head-ruled">
            <div className="trn-section-eyebrow-row">
              <span className="trn-eyebrow-dot" />
              <span className="trn-section-title">
                {lang === 'ja' ? '小課題 Training' : 'Training Tasks'}
              </span>
            </div>
            <span className="trn-section-sub">
              {lang === 'ja'
                ? '基本操作・Capture・終局などを短い課題で学びます。'
                : 'Learn basic actions, capture, and endgame rules through short exercises.'}
            </span>
          </div>

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
              T5_capture_tie: 'trainingT5Desc',
              T8_prepare_capture: 'trainingT8Desc',
              T9_no_build_endgame: 'trainingT9Desc',
              T10_defensive_build: 'trainingT10Desc',
            };
            const descKey = descKeyMap[taskId] ?? '';
            const descText = (t as Record<string, unknown>)[descKey] as string | undefined;

            return (
              <div
                key={taskId}
                className={`trn-card ${isLocked ? 'trn-card-locked' : ''}`}
              >
                <div className="trn-card-head">
                  <span className={`trn-card-title-sm ${isLocked ? 'trn-card-title-locked' : ''}`}>
                    T{meta.order} — {(t as Record<string, unknown>)[meta.titleKey] as string}
                  </span>
                  <span className={`trn-status-badge ${
                    isCompleted ? 'trn-status-complete' : isLocked ? 'trn-status-locked' : 'trn-status-available'
                  }`}>
                    {statusLabel}
                  </span>
                </div>
                {descText && (
                  <div className={`trn-card-desc ${isLocked ? 'trn-card-desc-locked' : ''}`}>
                    {descText}
                  </div>
                )}
                {isLocked ? (
                  <div className="trn-locked-msg">{t.trainingLockedMessage}</div>
                ) : (
                  <button
                    type="button"
                    className="action-btn action-btn-primary"
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

  // ── Full-game screen ───────────────────────────────────────────────────────
  if (mode === 'fullgame') {
    return <FullGameTrainingRunner onComplete={() => setMode('intro')} />;
  }

  // ── Task screen (task mode render) ────────────────────────────────────────
  const completeTitle: string = (() => {
    if (session.task.id === 'T2_capture_build') return t.trainingT2Complete;
    if (session.task.id === 'T7_diagonal_gates') return t.trainingT7Complete;
    if (session.task.id === 'T4_partial_build') return (t as Record<string, unknown>)['trainingT4Complete'] as string ?? 'Partial Build Complete';
    if (session.task.id === 'T6_asset_values') return (t as Record<string, unknown>)['trainingT6Complete'] as string ?? 'Asset Values Complete';
    if (session.task.id === 'T5_capture_tie') return (t as Record<string, unknown>)['trainingT5Complete'] as string ?? 'Capture Tie Complete';
    if (session.task.id === 'T8_prepare_capture') return (t as Record<string, unknown>)['trainingT8Complete'] as string ?? 'Prepare Capture Complete';
    if (session.task.id === 'T9_no_build_endgame') return (t as Record<string, unknown>)['trainingT9Complete'] as string ?? 'No-build Endgame Complete';
    if (session.task.id === 'T10_defensive_build') return (t as Record<string, unknown>)['trainingT10Complete'] as string ?? 'Defensive Build Complete';
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
    <div className="trn-screen">
      {/* Header */}
      <div className="trn-topbar">
        <button type="button" className="top-btn" onClick={handleBackToIntro}>
          ← {t.trainingBackToIntro}
        </button>
        <div className="trn-topbar-center">
          <span className="trn-eyebrow">{t.trainingTitle}</span>
          <span className="trn-topbar-title">{(t[session.task.titleKey as keyof typeof t] as string) ?? session.task.titleKey}</span>
        </div>
        <div style={{ width: '80px' }} />
      </div>

      {/* Step progress bar */}
      {session.status !== 'complete' && (
        <div className="trn-progress-section">
          <div className="trn-progress-label-row">
            <span className="trn-progress-label">Step</span>
            <span className="trn-progress-value">
              <strong>{String(userStepNum).padStart(2, '0')}</strong> / {totalUserSteps}
            </span>
          </div>
          <div className="trn-progress-track">
            <div
              className="trn-progress-fill"
              style={{ width: `${Math.max(4, totalUserSteps > 0 ? (userStepNum / totalUserSteps) * 100 : 0)}%` }}
            />
          </div>
        </div>
      )}

      {/* Step instruction */}
      <div className="trn-instruction-band">
        {session.status === 'complete' ? (
          <div className="trn-complete-title">{completeTitle}</div>
        ) : (
          <>
            <div className="trn-step-counter">Step {userStepNum} / {totalUserSteps}</div>
            <div className="trn-instruction-text">{stepLabel}</div>
          </>
        )}
        {session.feedback && (
          <div className={`trn-feedback ${session.feedback === t.trainingFeedbackWrong ? 'trn-feedback-wrong' : 'trn-feedback-ok'}`}>
            {session.feedback}
          </div>
        )}
      </div>

      {/* Board */}
      {session.status !== 'complete' && (
        <div className="trn-board-area">
          <div className="trn-board-wrap">
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
        </div>
      )}

      {/* Actions */}
      <div className="trn-actions-sticky">
        {session.status === 'complete' ? (
          <>
            {session.task.id !== 'T7_diagonal_gates' && session.task.id !== 'T6_asset_values' && session.task.id !== 'T5_capture_tie' && session.task.id !== 'T8_prepare_capture' && session.task.id !== 'T9_no_build_endgame' && session.task.id !== 'T10_defensive_build' && (
              <button type="button" className="action-btn action-btn-primary" onClick={handleNextTraining}>
                {t.trainingNextTraining}
              </button>
            )}
            <button type="button" className="action-btn action-btn-ghost" onClick={handleRestart}>
              {t.trainingReplay}
            </button>
            <button type="button" className="action-btn action-btn-ghost" onClick={handleBackToIntro}>
              {t.trainingBackToIntro}
            </button>
          </>
        ) : (
          <button type="button" className="action-btn action-btn-ghost" onClick={handleRestartStep}>
            {t.trainingRestartStep}
          </button>
        )}
      </div>
    </div>
  );
}
