import { useState, useCallback, useEffect, useRef } from 'react';
import { FullGameTrainingRunner } from './FullGameTrainingRunner';
import type { FullGameResumeState } from './FullGameTrainingRunner';
import { isFullGameCompleted } from '../training/fullGameUtils';
import { Board } from './Board';
import { selectPosition, applyMassiveBuild, applySelectiveBuild, applyQuadBuildForGates } from '../game/engine';
import { POSITION_TO_GATES } from '../game/constants';
import type { GateId, PositionId } from '../game/types';
import type { BoardBuildState } from '../app/App';
import { useLang } from '../lib/lang';
import { useSound } from '../hooks/useSound';
import { T1_BUILD_BASICS, T2_CAPTURE_BUILD, T7_DIAGONAL_GATES, T4_PARTIAL_BUILD, T6_ASSET_VALUES, T5_CAPTURE_TIE, T8_PREPARE_CAPTURE, T9_NO_BUILD_ENDGAME, TRAINING_TASK_META } from '../training/tasks/index';
import { validateMove } from '../training/validateMove';
import { applyFixedCpuMove } from '../training/applyFixedCpuMove';
import { saveTrainingProgress, isTaskCompleted } from '../training/trainingProgress';
import type { TrainingTaskId } from '../training/trainingProgress';
import type { TrainingSession, TrainingTask } from '../training/types';
import { track } from '../lib/kpiTracker';
import {
  generateTrainingRunId,
  taskMoveId,
  taskStep,
  taskMoveIndex,
  countUserMovesBefore,
  countTotalUserMoves,
  computeElapsedSeconds,
} from '../training/trainingKpiUtils';

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
  // KPI state refs (Phase 4-A) — individual training tasks
  const kpiRunIdRef = useRef<string>(generateTrainingRunId());
  const kpiRunStartedAtRef = useRef<string>(new Date().toISOString());
  const kpiTotalAttemptsRef = useRef<number>(0);
  // stepAttemptCounts: Map<stepIndex, count> for current step (reset per task)
  const kpiStepAttemptCountsRef = useRef<Map<number, number>>(new Map());
  const kpiReachedStepsRef = useRef<Set<number>>(new Set());
  const kpiCompletionSentRef = useRef<boolean>(false);
  const kpiStartedSentRef = useRef<boolean>(false);
  const { t, lang } = useLang();
  const { playSymbol, playAsset } = useSound();
  const [mode, setMode] = useState<ViewMode>('intro');
  // 一局指南の一時中断状態（同一セッション内でのresume用、リロード後は消える）
  const [fullGameResumeState, setFullGameResumeState] = useState<FullGameResumeState | null>(null);
  const [fullGameCompleted, setFullGameCompleted] = useState(() => isFullGameCompleted());
  const [session, setSession] = useState<TrainingSession>(() => makeSession(T1_BUILD_BASICS));
  const sessionRef = useRef<TrainingSession>(session);
  useEffect(() => { sessionRef.current = session; }, [session]);
  const commitSession = useCallback((next: TrainingSession) => {
    sessionRef.current = next;
    setSession(next);
  }, []);
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
        // all steps done — complete
        const taskId = s.task.id as TrainingTaskId;
        const totalUserMoves = countTotalUserMoves(s.task.steps);
        // KPI: training_completed (exactly once)
        if (!kpiCompletionSentRef.current) {
          kpiCompletionSentRef.current = true;
          const lastUserMoveIdx = totalUserMoves - 1;
          track('training_completed', {
            training_run_id: kpiRunIdRef.current,
            task_id: taskId as string,
            move_id: taskMoveId(taskId as string, lastUserMoveIdx),
            move_index: taskMoveIndex(lastUserMoveIdx),
            total_attempts: kpiTotalAttemptsRef.current,
            elapsed_seconds: computeElapsedSeconds(kpiRunStartedAtRef.current),
          });
        }
        saveTrainingProgress(userIdRef.current, {
          taskId,
          completedAt: new Date().toISOString(),
          attemptCount: s.attemptCount,
          bestAttemptCount: s.attemptCount,
          lastCompletedStep: totalUserMoves,
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
    // KPI: training_step_reached for the new user_move step (if not yet reached)
    if (s.status === 'playing') {
      const nextStep = s.task.steps[s.stepIndex];
      if (nextStep && nextStep.kind === 'user_move' && !kpiReachedStepsRef.current.has(s.stepIndex)) {
        kpiReachedStepsRef.current.add(s.stepIndex);
        const totalUserMoves = countTotalUserMoves(s.task.steps);
        const userMoveIdx = countUserMovesBefore(s.task.steps, s.stepIndex);
        const prevUserMoveIdx = userMoveIdx - 1;
        // training_step_advanced: from previous user step to this one
        if (prevUserMoveIdx >= 0) {
          track('training_step_advanced', {
            training_run_id: kpiRunIdRef.current,
            task_id: s.task.id as string,
            move_id: taskMoveId(s.task.id as string, prevUserMoveIdx),
            from_step: taskStep(prevUserMoveIdx),
            to_step: taskStep(userMoveIdx),
          });
        }
        track('training_step_reached', {
          training_run_id: kpiRunIdRef.current,
          task_id: s.task.id as string,
          move_id: taskMoveId(s.task.id as string, userMoveIdx),
          move_index: taskMoveIndex(userMoveIdx),
          step: taskStep(userMoveIdx),
          total_steps: totalUserMoves,
        });
      }
    }
    return s;
  }

  function startTask(task: TrainingTask) {
    // KPI: reset per-run state and send training_started
    const newRunId = generateTrainingRunId();
    const newRunStartedAt = new Date().toISOString();
    kpiRunIdRef.current = newRunId;
    kpiRunStartedAtRef.current = newRunStartedAt;
    kpiTotalAttemptsRef.current = 0;
    kpiStepAttemptCountsRef.current = new Map();
    kpiReachedStepsRef.current = new Set();
    kpiCompletionSentRef.current = false;
    kpiStartedSentRef.current = true;
    // user_move steps only — first step index 0
    const totalUserMoves = countTotalUserMoves(task.steps);
    const firstUserStep = task.steps.findIndex((s) => s.kind === 'user_move');
    track('training_started', {
      training_run_id: newRunId,
      task_id: task.id as string,
      move_id: taskMoveId(task.id as string, 0),
      move_index: 0,
      resumed: false,
    });
    // training_step_reached for first user step (if exists)
    if (firstUserStep >= 0 && totalUserMoves > 0) {
      kpiReachedStepsRef.current.add(firstUserStep);
      track('training_step_reached', {
        training_run_id: newRunId,
        task_id: task.id as string,
        move_id: taskMoveId(task.id as string, 0),
        move_index: 0,
        step: 1,
        total_steps: totalUserMoves,
      });
    }
    commitSession(makeSession(task));
    setBuildState(EMPTY_BUILD);
    setMode('task');
  }

  function handleBackToIntro() {
    setMode('intro');
  }

  const handleSelectPosition = useCallback((positionId: PositionId) => {
    const prev = sessionRef.current;
    if (prev.status !== 'playing') return;
    const step = prev.task.steps[prev.stepIndex];
    if (!step || step.kind !== 'user_move') return;
    const nextState = selectPosition(prev.gameState, positionId);
    const didSelect = nextState.selectedPosition !== null && nextState.selectedPosition !== prev.gameState.selectedPosition;
    commitSession({ ...prev, gameState: nextState, feedback: null });
    setBuildState(EMPTY_BUILD);
    if (didSelect) playSymbol();
  }, [playSymbol, commitSession]);

  // ── KPI helper: track attempt result for individual training steps ──────────────
  // Called via setTimeout to avoid calling track() inside setState updaters directly
  const kpiTrackAttemptResult = useCallback((
    taskId: string,
    steps: import('../training/types').TrainingStep[],
    stepIdx: number,
    isCorrect: boolean
  ) => {
    const userMoveIdx = countUserMovesBefore(steps, stepIdx);
    const totalUserMoves = countTotalUserMoves(steps);
    const attemptNum = (kpiStepAttemptCountsRef.current.get(stepIdx) ?? 0) + 1;
    kpiStepAttemptCountsRef.current.set(stepIdx, attemptNum);
    kpiTotalAttemptsRef.current += 1;
    const moveId = taskMoveId(taskId, userMoveIdx);
    const stepNum = taskStep(userMoveIdx);
    track('training_attempted', {
      training_run_id: kpiRunIdRef.current,
      task_id: taskId,
      move_id: moveId,
      step: stepNum,
      attempt_number: attemptNum,
      result: isCorrect ? 'correct' : 'incorrect',
    });
    if (!isCorrect) {
      track('training_incorrect', {
        training_run_id: kpiRunIdRef.current,
        task_id: taskId,
        move_id: moveId,
        step: stepNum,
        attempt_number: attemptNum,
      });
    }
  }, []);

  const handleMiddlePocketClick = useCallback((gateId: GateId) => {
    const prev = sessionRef.current;
    if (prev.status !== 'playing') return;
    const step = prev.task.steps[prev.stepIndex];
    if (!step || step.kind !== 'user_move') return;
    if (!prev.gameState.selectedPosition) return;

    // selective: first or second click
    if (prev.selectiveFirst === null) {
      // first click — store and wait
      commitSession({ ...prev, selectiveFirst: gateId, feedback: null });
      setBuildState({ mode: 'selective', selectiveFirst: gateId, selectiveCanConfirm: false, quadSelected: [], quadMax: 4 });
      return;
    }

    if (prev.selectiveFirst === gateId) {
      // deselect first click
      commitSession({ ...prev, selectiveFirst: null, feedback: null });
      setBuildState(EMPTY_BUILD);
      return;
    }

    // second click — apply selective build
    const gates: [GateId, GateId] = [prev.selectiveFirst, gateId];
    const nextState = applySelectiveBuild(prev.gameState, gates);
    const lastRecord = nextState.history[nextState.history.length - 1];
    if (!lastRecord) return; // no change

    const expected = step.expected;
    if (validateMove(lastRecord, expected)) {
      // KPI: track BEFORE advanceSession so final attempt is counted in total_attempts
      kpiTrackAttemptResult(prev.task.id as string, prev.task.steps, prev.stepIndex, true);
      const advanced = advanceSession({ ...prev, stepIndex: prev.stepIndex + 1, gameState: nextState, snapshot: nextState, selectiveFirst: null, feedback: t.trainingFeedbackCleared });
      commitSession(advanced);
      setBuildState(EMPTY_BUILD);
      playAsset();
    } else {
      // wrong move — rollback
      kpiTrackAttemptResult(prev.task.id as string, prev.task.steps, prev.stepIndex, false);
      commitSession({ ...prev, gameState: prev.snapshot, selectiveFirst: null, attemptCount: prev.attemptCount + 1, feedback: t.trainingFeedbackWrong });
      setBuildState(EMPTY_BUILD);
    }
  }, [t, playAsset, kpiTrackAttemptResult, advanceSession, commitSession]);

  const handleLargePocketClick = useCallback((gateId: GateId) => {
    const prev = sessionRef.current;
    if (prev.status !== 'playing') return;
    const step = prev.task.steps[prev.stepIndex];
    if (!step || step.kind !== 'user_move') return;
    if (!prev.gameState.selectedPosition) return;

    const nextState = applyMassiveBuild(prev.gameState, gateId);
    const lastRecord = nextState.history[nextState.history.length - 1];
    if (!lastRecord) return;

    const expected = step.expected;
    if (validateMove(lastRecord, expected)) {
      // KPI: track BEFORE advanceSession
      kpiTrackAttemptResult(prev.task.id as string, prev.task.steps, prev.stepIndex, true);
      const advanced = advanceSession({ ...prev, stepIndex: prev.stepIndex + 1, gameState: nextState, snapshot: nextState, selectiveFirst: null, feedback: t.trainingFeedbackCleared });
      commitSession(advanced);
      setBuildState(EMPTY_BUILD);
      playAsset();
    } else {
      kpiTrackAttemptResult(prev.task.id as string, prev.task.steps, prev.stepIndex, false);
      commitSession({ ...prev, gameState: prev.snapshot, selectiveFirst: null, attemptCount: prev.attemptCount + 1, feedback: t.trainingFeedbackWrong });
      setBuildState(EMPTY_BUILD);
    }
  }, [t, playAsset, kpiTrackAttemptResult, advanceSession, commitSession]);

  const handleMassiveMiddleClick = useCallback((gateId: GateId) => {
    const prev = sessionRef.current;
    if (prev.status !== 'playing') return;
    const step = prev.task.steps[prev.stepIndex];
    if (!step || step.kind !== 'user_move') return;
    if (!prev.gameState.selectedPosition) return;
    if (prev.selectiveFirst !== null) return;

    const nextState = applyMassiveBuild(prev.gameState, gateId);
    const lastRecord = nextState.history[nextState.history.length - 1];
    if (!lastRecord) return;

    const expected = step.expected;
    if (validateMove(lastRecord, expected)) {
      // KPI: track BEFORE advanceSession
      kpiTrackAttemptResult(prev.task.id as string, prev.task.steps, prev.stepIndex, true);
      const advanced = advanceSession({ ...prev, stepIndex: prev.stepIndex + 1, gameState: nextState, snapshot: nextState, selectiveFirst: null, feedback: t.trainingFeedbackCleared });
      commitSession(advanced);
      setBuildState(EMPTY_BUILD);
      playAsset();
    } else {
      kpiTrackAttemptResult(prev.task.id as string, prev.task.steps, prev.stepIndex, false);
      commitSession({ ...prev, gameState: prev.snapshot, selectiveFirst: null, attemptCount: prev.attemptCount + 1, feedback: t.trainingFeedbackWrong });
      setBuildState(EMPTY_BUILD);
    }
  }, [t, playAsset, kpiTrackAttemptResult, advanceSession, commitSession]);

  const handleSmallPocketClick = useCallback((gateId: GateId) => {
    const prev = sessionRef.current;
    if (prev.status !== 'playing') return;
    const step = prev.task.steps[prev.stepIndex];
    if (!step || step.kind !== 'user_move') return;
    const pos = prev.gameState.selectedPosition;
    if (!pos) return;
    if (step.expected.build.type !== 'quad') return;

    const connectedGates = POSITION_TO_GATES[pos];
    const quadMax = connectedGates.length;

    if (!connectedGates.includes(gateId)) return;

    const current = prev.quadSelected;
    let next: GateId[];
    if (current.includes(gateId)) {
      next = current.filter((id) => id !== gateId);
      commitSession({ ...prev, quadSelected: next });
      setBuildState({ mode: 'quad', selectiveFirst: null, selectiveCanConfirm: false, quadSelected: next, quadMax });
      return;
    }
    next = [...current, gateId] as GateId[];

    const minGates = step.expected.build.type === 'quad' ? step.expected.build.minGates : undefined;
    const autoCommitThreshold = minGates !== undefined ? Math.min(minGates, quadMax) : quadMax;
    if (next.length >= autoCommitThreshold) {
      const nextState = applyQuadBuildForGates(prev.gameState, next);
      const lastRecord = nextState.history[nextState.history.length - 1];
      if (!lastRecord) return;

      const expected = step.expected;
      if (validateMove(lastRecord, expected)) {
        // KPI: track BEFORE advanceSession
        kpiTrackAttemptResult(prev.task.id as string, prev.task.steps, prev.stepIndex, true);
        const advanced = advanceSession({ ...prev, stepIndex: prev.stepIndex + 1, gameState: nextState, snapshot: nextState, selectiveFirst: null, quadSelected: [], feedback: t.trainingFeedbackCleared });
        commitSession(advanced);
        setBuildState(EMPTY_BUILD);
        playAsset();
      } else {
        kpiTrackAttemptResult(prev.task.id as string, prev.task.steps, prev.stepIndex, false);
        commitSession({ ...prev, gameState: prev.snapshot, selectiveFirst: null, quadSelected: [], attemptCount: prev.attemptCount + 1, feedback: t.trainingFeedbackWrong });
        setBuildState(EMPTY_BUILD);
      }
      return;
    }

    commitSession({ ...prev, quadSelected: next, feedback: null });
    setBuildState({ mode: 'quad', selectiveFirst: null, selectiveCanConfirm: false, quadSelected: next, quadMax });
  }, [t, playAsset, kpiTrackAttemptResult, advanceSession, commitSession]);

  const handleMiddleOrSelective = useCallback((gateId: GateId) => {
    const prev = sessionRef.current;
    if (prev.status !== 'playing') return;
    const step = prev.task.steps[prev.stepIndex];
    if (!step || step.kind !== 'user_move') return;
    if (!prev.gameState.selectedPosition) return;

    if (prev.selectiveFirst !== null) {
      if (prev.selectiveFirst === gateId) {
        commitSession({ ...prev, selectiveFirst: null, feedback: null });
        setBuildState(EMPTY_BUILD);
        return;
      }
      const gates: [GateId, GateId] = [prev.selectiveFirst, gateId];
      const nextState = applySelectiveBuild(prev.gameState, gates);
      const lastRecord = nextState.history[nextState.history.length - 1];
      if (!lastRecord) return;
      const expected = step.expected;
      if (validateMove(lastRecord, expected)) {
        // KPI: track BEFORE advanceSession
        kpiTrackAttemptResult(prev.task.id as string, prev.task.steps, prev.stepIndex, true);
        const advanced = advanceSession({ ...prev, stepIndex: prev.stepIndex + 1, gameState: nextState, snapshot: nextState, selectiveFirst: null, feedback: t.trainingFeedbackCleared });
        commitSession(advanced);
        setBuildState(EMPTY_BUILD);
        playAsset();
      } else {
        kpiTrackAttemptResult(prev.task.id as string, prev.task.steps, prev.stepIndex, false);
        commitSession({ ...prev, gameState: prev.snapshot, selectiveFirst: null, attemptCount: prev.attemptCount + 1, feedback: t.trainingFeedbackWrong });
        setBuildState(EMPTY_BUILD);
      }
      return;
    }

    if (step.expected.build.type === 'selective') {
      commitSession({ ...prev, selectiveFirst: gateId, feedback: null });
      setBuildState({ mode: 'selective', selectiveFirst: gateId, selectiveCanConfirm: false, quadSelected: [], quadMax: 4 });
      return;
    }

    const nextState = applyMassiveBuild(prev.gameState, gateId);
    const lastRecord = nextState.history[nextState.history.length - 1];
    if (!lastRecord) return;
    const expected = step.expected;
    if (validateMove(lastRecord, expected)) {
      // KPI: track BEFORE advanceSession
      kpiTrackAttemptResult(prev.task.id as string, prev.task.steps, prev.stepIndex, true);
      const advanced = advanceSession({ ...prev, stepIndex: prev.stepIndex + 1, gameState: nextState, snapshot: nextState, selectiveFirst: null, feedback: t.trainingFeedbackCleared });
      commitSession(advanced);
      setBuildState(EMPTY_BUILD);
      playAsset();
    } else {
      kpiTrackAttemptResult(prev.task.id as string, prev.task.steps, prev.stepIndex, false);
      commitSession({ ...prev, gameState: prev.snapshot, selectiveFirst: null, attemptCount: prev.attemptCount + 1, feedback: t.trainingFeedbackWrong });
      setBuildState(EMPTY_BUILD);
    }
  }, [t, playAsset, kpiTrackAttemptResult, advanceSession, commitSession]);

  function handleRestartStep() {
    const next = {
      ...sessionRef.current,
      gameState: sessionRef.current.snapshot,
      selectiveFirst: null,
      quadSelected: [],
      feedback: null,
    };
    commitSession(next);
    setBuildState(EMPTY_BUILD);
  }

  function handleRestart() {
    // KPI: Replay = new run
    const newRunId = generateTrainingRunId();
    const newRunStartedAt = new Date().toISOString();
    kpiRunIdRef.current = newRunId;
    kpiRunStartedAtRef.current = newRunStartedAt;
    kpiTotalAttemptsRef.current = 0;
    kpiStepAttemptCountsRef.current = new Map();
    kpiReachedStepsRef.current = new Set();
    kpiCompletionSentRef.current = false;
    kpiStartedSentRef.current = true;
    const task = session.task;
    const totalUserMoves = countTotalUserMoves(task.steps);
    const firstUserStep = task.steps.findIndex((s) => s.kind === 'user_move');
    track('training_started', {
      training_run_id: newRunId,
      task_id: task.id as string,
      move_id: taskMoveId(task.id as string, 0),
      move_index: 0,
      resumed: false,
    });
    if (firstUserStep >= 0 && totalUserMoves > 0) {
      kpiReachedStepsRef.current.add(firstUserStep);
      track('training_step_reached', {
        training_run_id: newRunId,
        task_id: task.id as string,
        move_id: taskMoveId(task.id as string, 0),
        move_index: 0,
        step: 1,
        total_steps: totalUserMoves,
      });
    }
    commitSession(makeSession(task));
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
                {t.trainingGuidedGameSection}
              </span>
            </div>
            <span className="trn-section-sub">
              {t.trainingGuidedGameSectionDesc}
            </span>
          </div>

          {/* ── Full-game course card ────────────────────────────────── */}
          <div className="trn-card trn-card-featured">
            <div className="trn-card-head">
              <span className="trn-card-eyebrow">
                {t.trainingGuidedGameEyebrow}
              </span>
              <span className={`trn-status-badge ${fullGameCompleted ? 'trn-status-complete' : 'trn-status-available'}`}>
                {fullGameCompleted ? t.trainingTaskStatusComplete : t.trainingTaskStatusAvailable}
              </span>
            </div>
            <div className="trn-card-title">
              {t.trainingGuidedGameTitle}
            </div>
            <div className="trn-card-desc">
              {t.trainingGuidedGameCardDesc}
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
                {t.trainingTasksSection}
              </span>
            </div>
            <span className="trn-section-sub">
              {t.trainingTasksSectionDesc}
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
              'full-game-v1': 'trainingFullGameDesc',
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
    return (
      <FullGameTrainingRunner
        onComplete={() => { setFullGameResumeState(null); setMode('intro'); }}
        onExit={(state) => { setFullGameResumeState(state); setMode('intro'); }}
        resumeState={fullGameResumeState}
        userId={userId}
      />
    );
  }

  // ── Task screen (task mode render) ────────────────────────────────────────
  const completeTitle: string = (() => {
    if (session.task.id === 'T2_capture_build') return t.trainingT2Complete;
    if (session.task.id === 'T7_diagonal_gates') return t.trainingT7Complete;
    if (session.task.id === 'T4_partial_build') return t.trainingT4Complete;
    if (session.task.id === 'T6_asset_values') return t.trainingT6Complete;
    if (session.task.id === 'T5_capture_tie') return t.trainingT5Complete;
    if (session.task.id === 'T8_prepare_capture') return t.trainingT8Complete;
    if (session.task.id === 'T9_no_build_endgame') return t.trainingT9Complete;
    if (session.task.id === 'T10_defensive_build') return t.trainingT10Complete;
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
