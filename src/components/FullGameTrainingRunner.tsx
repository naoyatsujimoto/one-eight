import { useState, useCallback, useRef, useEffect } from 'react';
import { Board } from './Board';
import { ConfirmModal } from './ConfirmModal';
import { selectPosition, applyMassiveBuild, applySelectiveBuild, applyQuadBuildForGates } from '../game/engine';
import { POSITION_TO_GATES } from '../game/constants';
import { createInitialState } from '../game/initialState';
import type { GateId, PositionId, GameState } from '../game/types';
import type { BoardBuildState } from '../app/App';
import { useLang } from '../lib/lang';
import { useSound } from '../hooks/useSound';
import { FULL_GAME_V1 } from '../training/tasks/fullGameV1';
import { resolveFullGameV1Text } from '../training/i18n/fullGameV1/index';
import type { FGStepText, FGTrainingText } from '../training/i18n/fullGameV1/types';
import { validateMove } from '../training/validateMove';
import { applyScriptedMove, scriptedMoveToExpected, markFullGameCompleted } from '../training/fullGameUtils';
import { splitIntoSentences } from '../training/splitIntoSentences';
import { saveTrainingProgress } from '../training/trainingProgress';
import {
  generateTrainingRunId,
  fullGameMoveId,
  fullGameMoveIndex,
  fullGameStep,
  computeElapsedSeconds,
} from '../training/trainingKpiUtils';
import { track } from '../lib/kpiTracker';

// ── Types ──────────────────────────────────────────────────────────────────

export type FGPhase =
  | 'intro'          // M0: テキスト表示、board非interactive、次へボタン
  | 'auto'           // Auto step: move applied, showing narration, "次へ" button
  | 'user_narration' // NEW: user操作前の前段説明表示フェーズ（ボード非インタラクティブ）
  | 'user'           // User step: waiting for board interaction
  | 'select_success' // select_only で正しいPositionをタップ後
  | 'success'        // User step succeeded: showing success text, "次へ"
  | 'question'       // postQuestion: awaiting answer
  | 'complete';      // All steps done: showing finalText

/** 一局指南の一時中断状態（同一セッション内でのresume用） */
export type FullGameResumeState = {
  stepIndex: number;
  gameState: import('../game/types').GameState;
  snapshotState: import('../game/types').GameState;
  phase: FGPhase;
  sentenceIndex: number;
  introSentenceIndex: number;
  buildState: import('../app/App').BoardBuildState;
  selectiveFirst: import('../game/types').GateId | null;
  quadSelected: import('../game/types').GateId[];
  showHint: boolean;
  wrongAttempt: boolean;
  questionSelected: number | null;
  questionShowHint: boolean;
  completeSentIdx: number;
  /** KPI state (Phase 4-A): preserved across resume */
  kpi: {
    trainingRunId: string;
    runStartedAt: string;
    totalAttempts: number;
    stepAttemptCounts: [number, number][];  // [stepIndex, count][]
    reachedSteps: number[];
    hintShownSteps: number[];
    completionSent: boolean;
    lastCompletedStep: number;  // last step that was fully advanced (1-based; 0 if none)
  };
};

const EMPTY_BUILD: BoardBuildState = {
  mode: 'none',
  selectiveFirst: null,
  selectiveCanConfirm: false,
  quadSelected: [],
  quadMax: 4,
};

// ── Step text lookup ────────────────────────────────────────────────────────
function getStepText(textBundle: FGTrainingText, moveNumber: number): FGStepText | undefined {
  return textBundle.steps.find((s) => s.moveNumber === moveNumber);
}

// ── Helper: extract narration and instruction from user step ─────────────
function extractUserNarrationAndInstruction(
  situation: string,
  question: string
): { narration: string; instruction: string } {
  if (situation.trim()) {
    return { narration: situation.trim(), instruction: question };
  }
  return { narration: '', instruction: question };
}

function getUserNarrationSentences(stepText: FGStepText): string[] {
  if (!stepText.userText) return [];
  const situation = stepText.userText.situation;
  const question = stepText.userText.question;
  const { narration } = extractUserNarrationAndInstruction(situation, question);
  if (!narration) return [];
  return splitIntoSentences(narration);
}

function getUserInstructionText(stepText: FGStepText): string {
  if (!stepText.userText) return '';
  const situation = stepText.userText.situation;
  const question = stepText.userText.question;
  const { instruction } = extractUserNarrationAndInstruction(situation, question);
  return instruction;
}


interface FullGameTrainingRunnerProps {
  onComplete: () => void;
  onExit?: (state: FullGameResumeState) => void;
  resumeState?: FullGameResumeState | null;
  userId?: string | null;
}

export function FullGameTrainingRunner({ onComplete, onExit, resumeState, userId = null }: FullGameTrainingRunnerProps) {
  const { lang, t } = useLang();
  const { playSymbol, playAsset } = useSound();
  // Resolve per-locale text bundle for all 10 supported locales
  const fullGameText = resolveFullGameV1Text(lang);

  // ── KPI state refs (Phase 4-A) ─────────────────────────────────────────────
  const kpiRunIdRef = useRef<string>(resumeState?.kpi?.trainingRunId ?? generateTrainingRunId());
  const kpiRunStartedAtRef = useRef<string>(resumeState?.kpi?.runStartedAt ?? new Date().toISOString());
  const kpiTotalAttemptsRef = useRef<number>(resumeState?.kpi?.totalAttempts ?? 0);
  const kpiStepAttemptCountsRef = useRef<Map<number, number>>(
    new Map(resumeState?.kpi?.stepAttemptCounts ?? [])
  );
  const kpiReachedStepsRef = useRef<Set<number>>(new Set(resumeState?.kpi?.reachedSteps ?? []));
  const kpiHintShownStepsRef = useRef<Set<number>>(new Set(resumeState?.kpi?.hintShownSteps ?? []));
  const kpiCompletionSentRef = useRef<boolean>(resumeState?.kpi?.completionSent ?? false);
  const kpiLastCompletedStepRef = useRef<number>(resumeState?.kpi?.lastCompletedStep ?? 0);
  const kpiMountEventSentRef = useRef<boolean>(false);

  // ── Core state ────────────────────────────────────────────────────────────
  const [stepIndex, setStepIndex] = useState(resumeState?.stepIndex ?? 0);
  const [gameState, setGameState] = useState<GameState>(() => resumeState?.gameState ?? createInitialState(null));
  const [phase, setPhase] = useState<FGPhase>(resumeState?.phase ?? 'intro'); // Move 0 is intro
  const [snapshotRef] = useState({ current: createInitialState(null) }); // rollback point
  const snapshot = useRef(createInitialState(null));

  // Build UI state
  const [buildState, setBuildState] = useState<BoardBuildState>(resumeState?.buildState ?? EMPTY_BUILD);
  const [selectiveFirst, setSelectiveFirst] = useState<GateId | null>(resumeState?.selectiveFirst ?? null);
  const [quadSelected, setQuadSelected] = useState<GateId[]>(resumeState?.quadSelected ?? []);

  // Feedback
  const [showHint, setShowHint] = useState(resumeState?.showHint ?? false);
  const [wrongAttempt, setWrongAttempt] = useState(resumeState?.wrongAttempt ?? false);

  // Intro sentence navigation (Phase 4)
  const [introSentenceIndex, setIntroSentenceIndex] = useState(resumeState?.introSentenceIndex ?? 0);

  // M1以降の文章ブロック用 sentence navigation
  const [sentenceIndex, setSentenceIndex] = useState(resumeState?.sentenceIndex ?? 0);
  const [animTick, setAnimTick] = useState(0);

  // Question state (Move 21 postQuestion)
  const [questionSelected, setQuestionSelected] = useState<number | null>(resumeState?.questionSelected ?? null);
  const [questionShowHint, setQuestionShowHint] = useState(resumeState?.questionShowHint ?? false);

  // Partial Quad Build confirm modal state
  // pendingQuadGates: gates waiting for user confirmation before applyQuadBuildForGates
  const [quadConfirmOpen, setQuadConfirmOpen] = useState(false);
  const [pendingQuadGates, setPendingQuadGates] = useState<GateId[]>([]);
  const [pendingQuadState, setPendingQuadState] = useState<GameState | null>(null);
  // Guard against double-tap / rapid confirm
  const quadConfirmInFlightRef = useRef(false);

  // ── Typewriter state ─────────────────────────────────────────────────────
  const [visibleText, setVisibleText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const typeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentTargetRef = useRef<string>('');
  const reducedMotionRef = useRef<boolean>(
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );

  // Complete phase: 0=finalText, 1=summaryText
  const [completeSentIdx, setCompleteSentIdx] = useState(resumeState?.completeSentIdx ?? 0);

  // resume用: mount時の初期 resumeState を一度だけ捕捉する ref
  const initResumeRef = useRef(resumeState ?? null);

  // Initialize: first step is intro (Move 0)
  // snapshot starts as empty initial state
  useEffect(() => {
    if (initResumeRef.current) {
      // Resume: snapshot ref を保存済み state から復元（phase/sentenceIndex は useState で初期化済み）
      snapshot.current = initResumeRef.current.snapshotState;
    } else {
      snapshot.current = createInitialState(null);
      // Move 0 is intro kind
      setPhase('intro');
      setIntroSentenceIndex(0);
    }
  }, []);

  // ── KPI: mount-time event (training_started or training_resumed) ──────────────────
  useEffect(() => {
    if (kpiMountEventSentRef.current) return;
    kpiMountEventSentRef.current = true;
    const step0 = FULL_GAME_V1.steps[0];
    const moveNum0 = step0?.moveNumber ?? 0;
    if (initResumeRef.current) {
      // Resume: same run_id, send training_resumed
      const resumedStepIdx = initResumeRef.current.stepIndex;
      const resumedStep = FULL_GAME_V1.steps[resumedStepIdx];
      const resumedMoveNum = resumedStep?.moveNumber ?? 0;
      track('training_resumed', {
        training_run_id: kpiRunIdRef.current,
        task_id: FULL_GAME_V1.id,
        move_id: fullGameMoveId(resumedMoveNum),
        move_index: fullGameMoveIndex(resumedStepIdx),
        step: fullGameStep(resumedStepIdx),
        last_completed_step: kpiLastCompletedStepRef.current,
      });
    } else {
      // Fresh start
      track('training_started', {
        training_run_id: kpiRunIdRef.current,
        task_id: FULL_GAME_V1.id,
        move_id: fullGameMoveId(moveNum0),
        move_index: 0,
        resumed: false,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── KPI: training_step_reached (exactly-once per step per run) ───────────────────
  useEffect(() => {
    // Skip question and complete phases (step not yet advanced)
    if (phase === 'question' || phase === 'complete') return;
    if (kpiReachedStepsRef.current.has(stepIndex)) return;
    kpiReachedStepsRef.current.add(stepIndex);
    const step = FULL_GAME_V1.steps[stepIndex];
    if (!step) return;
    track('training_step_reached', {
      training_run_id: kpiRunIdRef.current,
      task_id: FULL_GAME_V1.id,
      move_id: fullGameMoveId(step.moveNumber),
      move_index: fullGameMoveIndex(stepIndex),
      step: fullGameStep(stepIndex),
      total_steps: FULL_GAME_V1.steps.length,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, phase]);

  // ── KPI: training_hint_shown (exactly-once per step per run) ─────────────────────
  useEffect(() => {
    if (!showHint) return;
    if (kpiHintShownStepsRef.current.has(stepIndex)) return;
    kpiHintShownStepsRef.current.add(stepIndex);
    const step = FULL_GAME_V1.steps[stepIndex];
    if (!step) return;
    track('training_hint_shown', {
      training_run_id: kpiRunIdRef.current,
      task_id: FULL_GAME_V1.id,
      move_id: fullGameMoveId(step.moveNumber),
      step: fullGameStep(stepIndex),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHint, stepIndex]);

  // ── Typewriter helpers ────────────────────────────────────────────────────
  const startTypewriter = useCallback((text: string) => {
    if (typeIntervalRef.current !== null) {
      clearInterval(typeIntervalRef.current);
      typeIntervalRef.current = null;
    }
    currentTargetRef.current = text;

    if (!text || text.length === 0) {
      setVisibleText('');
      setIsTyping(false);
      return;
    }
    if (reducedMotionRef.current || text.length <= 1) {
      setVisibleText(text);
      setIsTyping(false);
      return;
    }

    const duration = Math.min(Math.max(text.length * 10, 200), 600);
    const intervalMs = Math.max(1, Math.round(duration / text.length));

    setVisibleText('');
    setIsTyping(true);

    let count = 0;
    typeIntervalRef.current = setInterval(() => {
      count++;
      if (count >= text.length) {
        setVisibleText(text);
        setIsTyping(false);
        if (typeIntervalRef.current !== null) {
          clearInterval(typeIntervalRef.current);
          typeIntervalRef.current = null;
        }
      } else {
        setVisibleText(text.slice(0, count));
      }
    }, intervalMs);
  }, []);

  const skipTypewriter = useCallback(() => {
    if (typeIntervalRef.current !== null) {
      clearInterval(typeIntervalRef.current);
      typeIntervalRef.current = null;
    }
    setVisibleText(currentTargetRef.current);
    setIsTyping(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typeIntervalRef.current !== null) {
        clearInterval(typeIntervalRef.current);
      }
    };
  }, []);

  // ── Typewriter trigger ────────────────────────────────────────────────────
  // Fires when displayed sentence changes (phase / step / sentence index change)
  useEffect(() => {
    if (phase === 'complete' || phase === 'question') return;

    const step = FULL_GAME_V1.steps[stepIndex];
    if (!step) return;
    const st = getStepText(fullGameText, step.moveNumber);

    let text = '';

    if (phase === 'intro') {
      const introFull = st?.introText ?? '';
      const sentences = splitIntoSentences(introFull);
      text = sentences[introSentenceIndex] ?? '';
    } else if (phase === 'auto') {
      const fullText = st?.autoText?.auto ?? '';
      const sentences = splitIntoSentences(fullText);
      text = sentences[sentenceIndex] ?? fullText;
    } else if (phase === 'user_narration') {
      if (st?.userText) {
        const situation = st.userText.situation;
        const sentences = situation.trim() ? splitIntoSentences(situation.trim()) : [];
        text = sentences[sentenceIndex] ?? '';
      }
    } else if (phase === 'user') {
      if (st?.userText) {
        text = getUserInstructionText(st);
      }
    } else if (phase === 'success' || phase === 'select_success') {
      const fullText = st?.userText?.success ?? '';
      const sentences = splitIntoSentences(fullText);
      text = sentences[sentenceIndex] ?? fullText;
    }

    startTypewriter(text);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, stepIndex, introSentenceIndex, sentenceIndex, lang]);

  // ── Typewriter trigger: complete phase ────────────────────────────────────
  useEffect(() => {
    if (phase !== 'complete') return;
    const finalStep = FULL_GAME_V1.steps[FULL_GAME_V1.steps.length - 1];
    if (!finalStep) return;
    const finalStepText = getStepText(fullGameText, finalStep.moveNumber);

    if (completeSentIdx === 0) {
      const text = finalStepText?.finalText ?? '';
      startTypewriter(text);
    } else if (completeSentIdx === 1) {
      const text = fullGameText.meta.finalSummary;
      startTypewriter(text);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, completeSentIdx, lang]);

  // ── Advance to a step index ───────────────────────────────────────────────
  const advanceToStep = useCallback((nextIndex: number, currentGameState: GameState) => {
    const steps = FULL_GAME_V1.steps;

    if (nextIndex >= steps.length) {
      setPhase('complete');
      setCompleteSentIdx(0);
      return;
    }

    // KPI: training_step_advanced (last step → next step; skip if going to complete)
    // We record from the current stepIndex → nextIndex
    // This is called when the user presses Next on auto/intro/success/select_success/question
    {
      const fromStep = fullGameStep(nextIndex - 1); // 1-based from-step
      const toStep = fullGameStep(nextIndex);        // 1-based to-step
      const fromStepObj = steps[nextIndex - 1];
      if (fromStepObj && fromStep >= 1) {
        kpiLastCompletedStepRef.current = fromStep;
        track('training_step_advanced', {
          training_run_id: kpiRunIdRef.current,
          task_id: FULL_GAME_V1.id,
          move_id: fullGameMoveId(fromStepObj.moveNumber),
          from_step: fromStep,
          to_step: toStep,
        });
      }
    }

    const nextStep = steps[nextIndex]!;
    setStepIndex(nextIndex);
    setShowHint(false);
    setWrongAttempt(false);
    setQuestionSelected(null);
    setQuestionShowHint(false);
    setBuildState(EMPTY_BUILD);
    setSelectiveFirst(null);
    setQuadSelected([]);
    setQuadConfirmOpen(false);
    setPendingQuadGates([]);
    setPendingQuadState(null);
    quadConfirmInFlightRef.current = false;

    if (nextStep.kind === 'intro') {
      setGameState(currentGameState);
      snapshot.current = currentGameState;
      setPhase('intro');
      setIntroSentenceIndex(0);
      setSentenceIndex(0);
    } else if (nextStep.kind === 'select_only') {
      setGameState(currentGameState);
      snapshot.current = currentGameState;
      setSentenceIndex(0);
      const nextStepText = getStepText(fullGameText, nextStep.moveNumber);
      const hasPre = nextStepText ? getUserNarrationSentences(nextStepText).length > 0 : false;
      setPhase(hasPre ? 'user_narration' : 'user');
    } else if (nextStep.kind === 'pass') {
      const newState = applyScriptedMove(currentGameState, { position: '', buildType: 'pass', gates: [] });
      setGameState(newState);
      snapshot.current = newState;
      setPhase('auto'); // auto と同じ表示（次へボタン）
      setSentenceIndex(0);
    } else if (nextStep.kind === 'auto') {
      // Apply the auto move immediately
      const newState = applyScriptedMove(currentGameState, nextStep.move!);
      setGameState(newState);
      setPhase('auto');
      snapshot.current = newState;
      setSentenceIndex(0);
    } else {
      // user step
      setGameState(currentGameState);
      snapshot.current = currentGameState;
      setSentenceIndex(0);
      const nextStepText = getStepText(fullGameText, nextStep.moveNumber);
      const hasPre = nextStepText ? getUserNarrationSentences(nextStepText).length > 0 : false;
      setPhase(hasPre ? 'user_narration' : 'user');
    }
  }, [lang, fullGameText]);

  // ── Quad Build confirm / cancel handlers ────────────────────────────────

  const handleQuadConfirm = useCallback(() => {
    // Guard against double-tap / rapid confirm
    if (quadConfirmInFlightRef.current) return;
    quadConfirmInFlightRef.current = true;

    setQuadConfirmOpen(false);

    const prevState = pendingQuadState;
    const gates = pendingQuadGates;
    setPendingQuadGates([]);
    setPendingQuadState(null);

    if (!prevState) {
      quadConfirmInFlightRef.current = false;
      return;
    }

    const currentStep = FULL_GAME_V1.steps[stepIndex];
    if (!currentStep || currentStep.kind !== 'user' || !currentStep.expectedMove) {
      quadConfirmInFlightRef.current = false;
      return;
    }

    const newState = applyQuadBuildForGates(prevState, gates);
    const lastRecord = newState.history[newState.history.length - 1];
    if (!lastRecord) {
      quadConfirmInFlightRef.current = false;
      return;
    }

    const expected = scriptedMoveToExpected(currentStep.expectedMove);
    if (validateMove(lastRecord, expected)) {
      // KPI: training_attempted (correct)
      const qAttemptNum = (kpiStepAttemptCountsRef.current.get(stepIndex) ?? 0) + 1;
      kpiStepAttemptCountsRef.current.set(stepIndex, qAttemptNum);
      kpiTotalAttemptsRef.current += 1;
      track('training_attempted', {
        training_run_id: kpiRunIdRef.current,
        task_id: FULL_GAME_V1.id,
        move_id: fullGameMoveId(currentStep.moveNumber),
        step: fullGameStep(stepIndex),
        attempt_number: qAttemptNum,
        result: 'correct',
      });
      playAsset();
      setGameState(newState);
      snapshot.current = newState;
      setBuildState(EMPTY_BUILD);
      setSelectiveFirst(null);
      setQuadSelected([]);
      setWrongAttempt(false);
      setShowHint(false);
      setSentenceIndex(0);
      setPhase('success');
    } else {
      // KPI: training_attempted (incorrect) + training_incorrect
      const qAttemptNum = (kpiStepAttemptCountsRef.current.get(stepIndex) ?? 0) + 1;
      kpiStepAttemptCountsRef.current.set(stepIndex, qAttemptNum);
      kpiTotalAttemptsRef.current += 1;
      track('training_attempted', {
        training_run_id: kpiRunIdRef.current,
        task_id: FULL_GAME_V1.id,
        move_id: fullGameMoveId(currentStep.moveNumber),
        step: fullGameStep(stepIndex),
        attempt_number: qAttemptNum,
        result: 'incorrect',
      });
      track('training_incorrect', {
        training_run_id: kpiRunIdRef.current,
        task_id: FULL_GAME_V1.id,
        move_id: fullGameMoveId(currentStep.moveNumber),
        step: fullGameStep(stepIndex),
        attempt_number: qAttemptNum,
      });
      setGameState(snapshot.current);
      setBuildState(EMPTY_BUILD);
      setSelectiveFirst(null);
      setQuadSelected([]);
      setWrongAttempt(true);
    }
    quadConfirmInFlightRef.current = false;
  }, [stepIndex, pendingQuadState, pendingQuadGates]);

  const handleQuadCancel = useCallback(() => {
    // Cancel: close dialog, stay on Move 46, allow re-selection
    setQuadConfirmOpen(false);
    setPendingQuadGates([]);
    setPendingQuadState(null);
    setQuadSelected([]);
    setBuildState(EMPTY_BUILD);
    quadConfirmInFlightRef.current = false;
  }, []);

  // ── Handle "戻る" (back) button ──────────────────────────────────────────
  const handleBack = useCallback((e: React.MouseEvent) => {
    // If typewriter is running, skip to end instead of going back
    if (isTyping) {
      e.stopPropagation();
      skipTypewriter();
      return;
    }
    e.stopPropagation();
    setAnimTick((t) => t + 1);
    if (phase === 'intro') {
      if (introSentenceIndex > 0) setIntroSentenceIndex((prev) => prev - 1);
    } else if (
      phase === 'user_narration' ||
      phase === 'auto' ||
      phase === 'success' ||
      phase === 'select_success'
    ) {
      if (sentenceIndex > 0) setSentenceIndex((prev) => prev - 1);
    }
  }, [phase, introSentenceIndex, sentenceIndex, isTyping, skipTypewriter]);

  // ── Handle "次へ" (next) button ───────────────────────────────────────────
  const handleNext = useCallback(() => {
    // If typewriter is still running, skip to end instead of advancing
    if (isTyping) {
      skipTypewriter();
      return;
    }
    const currentStep = FULL_GAME_V1.steps[stepIndex];
    if (!currentStep) return;
    setAnimTick((t) => t + 1);

    if (phase === 'user_narration') {
      const stepText = getStepText(fullGameText, currentStep.moveNumber);
      const sentences = stepText ? getUserNarrationSentences(stepText) : [];
      if (sentenceIndex < sentences.length - 1) {
        setSentenceIndex((prev) => prev + 1);
      } else {
        setSentenceIndex(0);
        setPhase('user');
      }
      return;
    }

    if (phase === 'select_success') {
      // select_success: successText を1文送り。最終文なら次ステップへ。
      const stepText = getStepText(fullGameText, currentStep.moveNumber);
      const fullText = stepText?.userText?.success ?? '';
      const sentences = splitIntoSentences(fullText);
      if (sentenceIndex < sentences.length - 1) {
        setSentenceIndex((prev) => prev + 1);
      } else {
        setSentenceIndex(0);
        // 選択状態を維持したまま次ステップへ進む（rollback しない）
        advanceToStep(stepIndex + 1, gameState);
      }
      return;
    }

    if (phase === 'intro') {
      // Phase 4: sentence-by-sentence navigation
      const stepText = getStepText(fullGameText, FULL_GAME_V1.steps[stepIndex]?.moveNumber ?? 0);
      const introFull = stepText?.introText ?? '';
      const sentences = splitIntoSentences(introFull);
      if (introSentenceIndex < sentences.length - 1) {
        // Advance to next sentence
        setIntroSentenceIndex((prev) => prev + 1);
      } else {
        // Last sentence reached — advance to next step
        advanceToStep(stepIndex + 1, gameState);
      }
      return;
    }

    if (phase === 'success') {
      const stepText = getStepText(fullGameText, currentStep.moveNumber);
      const fullText = stepText?.userText?.success ?? '';
      const sentences = splitIntoSentences(fullText);
      if (sentenceIndex < sentences.length - 1) {
        // success テキストを1文送り
        setSentenceIndex((prev) => prev + 1);
      } else {
        setSentenceIndex(0);
        if (stepText?.postQuestion) {
          // Go to question phase
          setPhase('question');
          setQuestionSelected(null);
          setQuestionShowHint(false);
        } else {
          // No question: advance to next step
          advanceToStep(stepIndex + 1, gameState);
        }
      }
      return;
    }

    if (phase === 'auto') {
      // auto narration を1文送り。最終文なら次ステップへ。
      const stepText = getStepText(fullGameText, currentStep.moveNumber);
      const fullText = stepText?.autoText?.auto ?? '';
      const sentences = splitIntoSentences(fullText);
      if (sentenceIndex < sentences.length - 1) {
        setSentenceIndex((prev) => prev + 1);
      } else {
        setSentenceIndex(0);
        advanceToStep(stepIndex + 1, gameState);
      }
      return;
    }

    if (phase === 'complete') {
      // complete → handled by handleFinish
      advanceToStep(stepIndex + 1, gameState);
      return;
    }
  }, [phase, stepIndex, gameState, advanceToStep, introSentenceIndex, sentenceIndex, lang, isTyping, skipTypewriter]);

  // ── Tap handler for user phase (typewriter skip only, never advance) ────
  const handleUserTextTap = useCallback(() => {
    if (isTyping) {
      skipTypewriter();
    }
    // user phase では文章タップで進めない
  }, [isTyping, skipTypewriter]);

  // ── Handle question answer ────────────────────────────────────────────────
  const handleQuestionAnswer = useCallback((index: number) => {
    setQuestionSelected(index);
    const currentStepObj = FULL_GAME_V1.steps[stepIndex];
    const stepText = currentStepObj ? getStepText(fullGameText, currentStepObj.moveNumber) : undefined;
    const correctIndex = stepText?.postQuestion?.correctOptionIndex ?? 0;
    const isCorrect = index === correctIndex;
    // KPI: question attempt
    const qAttemptNum = (kpiStepAttemptCountsRef.current.get(stepIndex) ?? 0) + 1;
    kpiStepAttemptCountsRef.current.set(stepIndex, qAttemptNum);
    kpiTotalAttemptsRef.current += 1;
    if (currentStepObj) {
      track('training_attempted', {
        training_run_id: kpiRunIdRef.current,
        task_id: FULL_GAME_V1.id,
        move_id: fullGameMoveId(currentStepObj.moveNumber),
        step: fullGameStep(stepIndex),
        attempt_number: qAttemptNum,
        result: isCorrect ? 'correct' : 'incorrect',
      });
      if (!isCorrect) {
        track('training_incorrect', {
          training_run_id: kpiRunIdRef.current,
          task_id: FULL_GAME_V1.id,
          move_id: fullGameMoveId(currentStepObj.moveNumber),
          step: fullGameStep(stepIndex),
          attempt_number: qAttemptNum,
        });
        // question hint shown on wrong answer — fire hint event
        if (!kpiHintShownStepsRef.current.has(stepIndex)) {
          kpiHintShownStepsRef.current.add(stepIndex);
          track('training_hint_shown', {
            training_run_id: kpiRunIdRef.current,
            task_id: FULL_GAME_V1.id,
            move_id: fullGameMoveId(currentStepObj.moveNumber),
            step: fullGameStep(stepIndex),
          });
        }
      }
    }
    if (!isCorrect) {
      setQuestionShowHint(true);
    }
  }, [stepIndex]);

  const handleQuestionNext = useCallback(() => {
    advanceToStep(stepIndex + 1, gameState);
  }, [stepIndex, gameState, advanceToStep]);

  // ── Handle finish (complete phase) ───────────────────────────────────────
  const handleFinish = useCallback(() => {
    if (!kpiCompletionSentRef.current) {
      kpiCompletionSentRef.current = true;
      const finalStepObj = FULL_GAME_V1.steps[FULL_GAME_V1.steps.length - 1];
      const finalMoveNum = finalStepObj?.moveNumber ?? 0;
      const finalStepIdx = FULL_GAME_V1.steps.length - 1;
      track('training_completed', {
        training_run_id: kpiRunIdRef.current,
        task_id: FULL_GAME_V1.id,
        move_id: fullGameMoveId(finalMoveNum),
        move_index: fullGameMoveIndex(finalStepIdx),
        total_attempts: kpiTotalAttemptsRef.current,
        elapsed_seconds: computeElapsedSeconds(kpiRunStartedAtRef.current),
      });
    }
    markFullGameCompleted();
    // Save to training_progress (full-game-v1 as canonical record)
    saveTrainingProgress(userId ?? null, {
      taskId: 'full-game-v1',
      completedAt: new Date().toISOString(),
      attemptCount: kpiTotalAttemptsRef.current,
      bestAttemptCount: kpiTotalAttemptsRef.current,
      lastCompletedStep: FULL_GAME_V1.steps.length,
    });
    onComplete();
  }, [onComplete, userId]);

  const handleExit = useCallback(() => {
    // typewriter cleanup
    if (typeIntervalRef.current !== null) {
      clearInterval(typeIntervalRef.current);
      typeIntervalRef.current = null;
    }
    // 現在の進行状態を保存して呼び出し元へ渡す（KPI状態も含む）
    onExit?.({
      stepIndex,
      gameState,
      snapshotState: snapshot.current,
      phase,
      sentenceIndex,
      introSentenceIndex,
      buildState,
      selectiveFirst,
      quadSelected,
      showHint,
      wrongAttempt,
      questionSelected,
      questionShowHint,
      completeSentIdx,
      kpi: {
        trainingRunId: kpiRunIdRef.current,
        runStartedAt: kpiRunStartedAtRef.current,
        totalAttempts: kpiTotalAttemptsRef.current,
        stepAttemptCounts: Array.from(kpiStepAttemptCountsRef.current.entries()),
        reachedSteps: Array.from(kpiReachedStepsRef.current),
        hintShownSteps: Array.from(kpiHintShownStepsRef.current),
        completionSent: kpiCompletionSentRef.current,
        lastCompletedStep: kpiLastCompletedStepRef.current,
      },
    });
  }, [onExit, stepIndex, gameState, phase, sentenceIndex, introSentenceIndex, buildState, selectiveFirst, quadSelected, showHint, wrongAttempt, questionSelected, questionShowHint, completeSentIdx]);

  // ── Board handlers ────────────────────────────────────────────────────────

  const handleSelectPosition = useCallback((positionId: PositionId) => {
    if (phase !== 'user') return;
    const currentStep = FULL_GAME_V1.steps[stepIndex];

    // select_only: 正しいPositionをタップしたら select_success へ
    if (currentStep?.kind === 'select_only') {
      setGameState((prev) => selectPosition(prev, positionId));
      if (positionId === currentStep.expectedPosition) {
        // KPI: training_attempted (correct)
        const sAttemptNum = (kpiStepAttemptCountsRef.current.get(stepIndex) ?? 0) + 1;
        kpiStepAttemptCountsRef.current.set(stepIndex, sAttemptNum);
        kpiTotalAttemptsRef.current += 1;
        track('training_attempted', {
          training_run_id: kpiRunIdRef.current,
          task_id: FULL_GAME_V1.id,
          move_id: fullGameMoveId(currentStep.moveNumber),
          step: fullGameStep(stepIndex),
          attempt_number: sAttemptNum,
          result: 'correct',
        });
        playSymbol();
        setWrongAttempt(false);
        setSentenceIndex(0);
        setPhase('select_success');
      } else {
        // KPI: training_attempted (incorrect) + training_incorrect
        const sAttemptNum = (kpiStepAttemptCountsRef.current.get(stepIndex) ?? 0) + 1;
        kpiStepAttemptCountsRef.current.set(stepIndex, sAttemptNum);
        kpiTotalAttemptsRef.current += 1;
        track('training_attempted', {
          training_run_id: kpiRunIdRef.current,
          task_id: FULL_GAME_V1.id,
          move_id: fullGameMoveId(currentStep.moveNumber),
          step: fullGameStep(stepIndex),
          attempt_number: sAttemptNum,
          result: 'incorrect',
        });
        track('training_incorrect', {
          training_run_id: kpiRunIdRef.current,
          task_id: FULL_GAME_V1.id,
          move_id: fullGameMoveId(currentStep.moveNumber),
          step: fullGameStep(stepIndex),
          attempt_number: sAttemptNum,
        });
        setWrongAttempt(true);
      }
      return;
    }

    // 通常の user step
    setGameState((prev) => {
      const next = selectPosition(prev, positionId);
      if (next.selectedPosition !== null && next.selectedPosition !== prev.selectedPosition) {
        playSymbol();
      }
      return next;
    });
    setBuildState(EMPTY_BUILD);
    setSelectiveFirst(null);
    setQuadSelected([]);
    setWrongAttempt(false);
  }, [phase, stepIndex]);

  // Commit a move attempt: validate and advance or rollback
  const tryCommitMove = useCallback((newState: GameState) => {
    const currentStep = FULL_GAME_V1.steps[stepIndex];
    if (!currentStep || currentStep.kind !== 'user') return;

    const lastRecord = newState.history[newState.history.length - 1];
    if (!lastRecord) return;

    if (!currentStep.expectedMove) return;
    const expected = scriptedMoveToExpected(currentStep.expectedMove);
    if (validateMove(lastRecord, expected)) {
      // Correct!
      // KPI: training_attempted (correct)
      const attemptNum = (kpiStepAttemptCountsRef.current.get(stepIndex) ?? 0) + 1;
      kpiStepAttemptCountsRef.current.set(stepIndex, attemptNum);
      kpiTotalAttemptsRef.current += 1;
      track('training_attempted', {
        training_run_id: kpiRunIdRef.current,
        task_id: FULL_GAME_V1.id,
        move_id: fullGameMoveId(currentStep.moveNumber),
        step: fullGameStep(stepIndex),
        attempt_number: attemptNum,
        result: 'correct',
      });
      playAsset();
      setGameState(newState);
      snapshot.current = newState;
      setBuildState(EMPTY_BUILD);
      setSelectiveFirst(null);
      setQuadSelected([]);
      setWrongAttempt(false);
      setShowHint(false);
      setSentenceIndex(0);
      setPhase('success');
    } else {
      // Wrong — rollback
      // KPI: training_attempted (incorrect) + training_incorrect
      const attemptNum = (kpiStepAttemptCountsRef.current.get(stepIndex) ?? 0) + 1;
      kpiStepAttemptCountsRef.current.set(stepIndex, attemptNum);
      kpiTotalAttemptsRef.current += 1;
      track('training_attempted', {
        training_run_id: kpiRunIdRef.current,
        task_id: FULL_GAME_V1.id,
        move_id: fullGameMoveId(currentStep.moveNumber),
        step: fullGameStep(stepIndex),
        attempt_number: attemptNum,
        result: 'incorrect',
      });
      track('training_incorrect', {
        training_run_id: kpiRunIdRef.current,
        task_id: FULL_GAME_V1.id,
        move_id: fullGameMoveId(currentStep.moveNumber),
        step: fullGameStep(stepIndex),
        attempt_number: attemptNum,
      });
      setGameState(snapshot.current);
      setBuildState(EMPTY_BUILD);
      setSelectiveFirst(null);
      setQuadSelected([]);
      setWrongAttempt(true);
    }
  }, [stepIndex]);

  // Large pocket (Massive build)
  const handleLargePocketClick = useCallback((gateId: GateId) => {
    if (phase !== 'user') return;
    setGameState((prev) => {
      if (!prev.selectedPosition) return prev;
      if (selectiveFirst !== null) return prev;
      const newState = applyMassiveBuild(prev, gateId);
      const lastRecord = newState.history[newState.history.length - 1];
      if (!lastRecord) return prev;

      const currentStep = FULL_GAME_V1.steps[stepIndex];
      if (!currentStep || currentStep.kind !== 'user' || !currentStep.expectedMove) return prev;
      const expected = scriptedMoveToExpected(currentStep.expectedMove);

      if (validateMove(lastRecord, expected)) {
        setTimeout(() => playAsset(), 0);
        snapshot.current = newState;
        setBuildState(EMPTY_BUILD);
        setSelectiveFirst(null);
        setQuadSelected([]);
        setWrongAttempt(false);
        setShowHint(false);
        setSentenceIndex(0);
        setTimeout(() => setPhase('success'), 0);
        return newState;
      } else {
        setBuildState(EMPTY_BUILD);
        setSelectiveFirst(null);
        setWrongAttempt(true);
        return snapshot.current;
      }
    });
  }, [phase, stepIndex, selectiveFirst]);

  // Middle pocket — handles both selective (first/second click) and massive middle
  const handleMiddlePocketClick = useCallback((gateId: GateId) => {
    if (phase !== 'user') return;

    setGameState((prev) => {
      if (!prev.selectedPosition) return prev;

      const currentStep = FULL_GAME_V1.steps[stepIndex];
      if (!currentStep || currentStep.kind !== 'user' || !currentStep.expectedMove) return prev;
      const expected = scriptedMoveToExpected(currentStep.expectedMove);

      // Selective build handling
      if (expected.build.type === 'selective') {
        if (selectiveFirst === null) {
          // First click
          setSelectiveFirst(gateId);
          setBuildState({ mode: 'selective', selectiveFirst: gateId, selectiveCanConfirm: false, quadSelected: [], quadMax: 4 });
          return { ...prev, selectiveFirst: gateId };
        }
        if (selectiveFirst === gateId) {
          // Deselect
          setSelectiveFirst(null);
          setBuildState(EMPTY_BUILD);
          return { ...prev, selectiveFirst: null };
        }
        // Second click — apply selective
        const gates: [GateId, GateId] = [selectiveFirst, gateId];
        const newState = applySelectiveBuild(prev, gates);
        const lastRecord = newState.history[newState.history.length - 1];
        if (!lastRecord) return prev;

        if (validateMove(lastRecord, expected)) {
          setTimeout(() => playAsset(), 0);
          snapshot.current = newState;
          setBuildState(EMPTY_BUILD);
          setSelectiveFirst(null);
          setQuadSelected([]);
          setWrongAttempt(false);
          setShowHint(false);
          setSentenceIndex(0);
          setTimeout(() => setPhase('success'), 0);
          return newState;
        } else {
          setBuildState(EMPTY_BUILD);
          setSelectiveFirst(null);
          setWrongAttempt(true);
          return snapshot.current;
        }
      }

      // Massive build via middle pocket
      if (selectiveFirst !== null) return prev;
      const newState = applyMassiveBuild(prev, gateId);
      const lastRecord = newState.history[newState.history.length - 1];
      if (!lastRecord) return prev;

      if (validateMove(lastRecord, expected)) {
        setTimeout(() => playAsset(), 0);
        snapshot.current = newState;
        setBuildState(EMPTY_BUILD);
        setSelectiveFirst(null);
        setWrongAttempt(false);
        setShowHint(false);
        setSentenceIndex(0);
        setTimeout(() => setPhase('success'), 0);
        return newState;
      } else {
        setBuildState(EMPTY_BUILD);
        setSelectiveFirst(null);
        setWrongAttempt(true);
        return snapshot.current;
      }
    });
  }, [phase, stepIndex, selectiveFirst]);

  // Small pocket (Quad build)
  const handleSmallPocketClick = useCallback((gateId: GateId) => {
    if (phase !== 'user') return;

    setGameState((prev) => {
      if (!prev.selectedPosition) return prev;
      const currentStep = FULL_GAME_V1.steps[stepIndex];
      if (!currentStep || currentStep.kind !== 'user' || !currentStep.expectedMove) return prev;
      if (currentStep.expectedMove.buildType !== 'quad') return prev;

      const connectedGates = POSITION_TO_GATES[prev.selectedPosition];
      if (!connectedGates.includes(gateId)) return prev;

      // Calculate buildable gates: connected gates that have at least one empty small slot.
      // This correctly handles partial quad scenarios (e.g. Move 46 where Gate 11 is full).
      const buildableGateIds = connectedGates.filter(
        (gId) => prev.gates[gId].smallSlots.some((s) => s === null)
      );

      const current = quadSelected;
      let next: GateId[];

      // Only allow selection of gates that are actually buildable
      if (!buildableGateIds.includes(gateId)) return prev;

      if (current.includes(gateId)) {
        // deselect
        next = current.filter((id) => id !== gateId);
        setQuadSelected(next);
        setBuildState({ mode: 'quad', selectiveFirst: null, selectiveCanConfirm: false, quadSelected: next, quadMax: buildableGateIds.length });
        return prev;
      }

      next = [...current, gateId];
      // Use the number of buildable gates (not expectedMove.gates.length or connectedGates.length)
      // as the threshold. This ensures partial quad scenarios work correctly.
      const autoCommitThreshold = buildableGateIds.length;

      if (next.length >= autoCommitThreshold) {
        // When all buildable gates are selected, show confirm dialog before committing.
        // Store the pending state for use in the confirm handler.
        setPendingQuadGates(next);
        setPendingQuadState(prev);
        setQuadSelected(next);
        setBuildState({ mode: 'quad', selectiveFirst: null, selectiveCanConfirm: false, quadSelected: next, quadMax: buildableGateIds.length });
        quadConfirmInFlightRef.current = false;
        setQuadConfirmOpen(true);
        return prev;
      }

      setQuadSelected(next);
      setBuildState({ mode: 'quad', selectiveFirst: null, selectiveCanConfirm: false, quadSelected: next, quadMax: buildableGateIds.length });
      return prev;
    });
  }, [phase, stepIndex, quadSelected]);

  // ── Derived values ────────────────────────────────────────────────────────
  const currentStep = FULL_GAME_V1.steps[stepIndex];
  const stepText = currentStep ? getStepText(fullGameText, currentStep.moveNumber) : undefined;
  const totalSteps = FULL_GAME_V1.steps.length;
  const userStepsDone = FULL_GAME_V1.steps.slice(0, stepIndex + 1).filter((s) => s.kind === 'user').length;
  const totalUserSteps = FULL_GAME_V1.steps.filter((s) => s.kind === 'user').length;

  // Language helpers
  const meta = fullGameText.meta;

  // Intro sentences (Phase 4)
  const introSentences = (currentStep && stepText?.introText)
    ? splitIntoSentences(stepText.introText)
    : [];
  const currentIntroSentence = introSentences[introSentenceIndex] ?? '';
  const isLastIntroSentence = introSentenceIndex >= introSentences.length - 1;

  // user_narration sentences
  const userNarrationSentences = (currentStep && stepText && (phase === 'user_narration' || phase === 'user'))
    ? getUserNarrationSentences(stepText)
    : [];
  const currentUserNarrationSentence = userNarrationSentences[sentenceIndex] ?? '';
  const isLastUserNarrationSentence = sentenceIndex >= userNarrationSentences.length - 1;

  // ── Render ────────────────────────────────────────────────────────────────

  // Board interaction is enabled only in 'user' phase
  // intro / select_success / auto / complete は非interactive
  const boardInteractive = phase === 'user';

  const noop = useCallback(() => {}, []);

  // ── Question section ──────────────────────────────────────────────────────
  if (phase === 'question' && currentStep && stepText?.postQuestion) {
    const pq = stepText.postQuestion;
    const correctIndex = pq.correctOptionIndex;
    const isCorrect = questionSelected !== null && questionSelected === correctIndex;
    const isWrong = questionSelected !== null && questionSelected !== correctIndex;

    return (
      <div className="trn-screen">
        {/* Header */}
        <div className="trn-topbar">
          <div style={{ width: '80px' }}>
            <button type="button" className="trn-exit-btn" onClick={handleExit}>
              {t.trainingBackBtn}
            </button>
          </div>
          <div className="trn-topbar-center">
            <span className="trn-eyebrow">{t.trainingGuidedGame}</span>
            <span className="trn-topbar-title">Move {currentStep.moveNumber} — {t.trainingQuestion}</span>
          </div>
          <div style={{ width: '80px' }} />
        </div>

        {/* Question */}
        <div className="trn-question-body">
          <div className="trn-question-text">{pq.question}</div>

          {/* Options */}
          <div className="trn-options">
            {pq.options.map((opt, i) => {
              const selected = questionSelected === i;
              const isThisCorrect = i === correctIndex;
              let optClass = 'trn-option-btn';
              if (selected) optClass += isThisCorrect ? ' trn-option-correct' : ' trn-option-wrong';
              return (
                <button
                  key={i}
                  type="button"
                  className={optClass}
                  onClick={() => handleQuestionAnswer(i)}
                  disabled={isCorrect}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          {/* Hint */}
          {questionShowHint && (
            <div className="trn-hint-box">
              {pq.hint}
            </div>
          )}

          {/* Feedback / Explanation */}
          {isWrong && !questionShowHint && (
            <div className="trn-feedback trn-feedback-wrong">
              {t.trainingTryAgain}
            </div>
          )}
          {isCorrect && (
            <div className="trn-explanation-box">
              {pq.explanation}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="trn-actions-sticky">
          {isCorrect && (
            <button type="button" className="action-btn action-btn-primary" onClick={handleQuestionNext}>
              {t.trainingNextBtn}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Complete section ──────────────────────────────────────────────────────
  if (phase === 'complete') {
    const handleCompleteTap = () => {
      if (isTyping) {
        skipTypewriter();
        return;
      }
      if (completeSentIdx === 0) {
        setCompleteSentIdx(1);
      }
    };

    return (
      <div className="trn-screen">
        {/* Header */}
        <div className="trn-topbar">
          <div style={{ width: '80px' }}>
            <button type="button" className="trn-exit-btn" onClick={handleExit}>
              {t.trainingBackBtn}
            </button>
          </div>
          <div className="trn-topbar-center">
            <span className="trn-eyebrow">{t.trainingGuidedGame}</span>
            <span className="trn-topbar-title">{t.trainingCompleteLabel}</span>
          </div>
          <div style={{ width: '80px' }} />
        </div>

        {/* Board — final state */}
        <div className="trn-board-area">
          <div className="trn-board-wrap">
            <Board
              state={gameState}
              buildState={EMPTY_BUILD}
              onSelectPosition={noop}
              onLargePocketClick={noop}
              onMiddlePocketClick={noop}
              onSmallPocketClick={noop}
              showLabelToggle={false}
              defaultLabels={true}
              labelPerspective="black"
            />
          </div>
        </div>

        {/* Text: sequential typewriter */}
        <div className="trn-text-body" onClick={completeSentIdx < 1 ? handleCompleteTap : undefined}>
          {completeSentIdx === 0 && (
            <div className="trn-narration" style={{ whiteSpace: 'pre-wrap' }}>{visibleText}</div>
          )}
          {completeSentIdx === 1 && (
            <div className="trn-summary-box" style={{ whiteSpace: 'pre-wrap' }}>{visibleText}</div>
          )}
        </div>

        {/* Actions */}
        <div className="trn-actions-sticky">
          {completeSentIdx >= 1 && !isTyping && (
            <button type="button" className="action-btn action-btn-primary" onClick={handleFinish}>
              {t.trainingFinishBtn}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Main layout (auto / user / success) ──────────────────────────────────

  // Instruction text
  let instructionText = '';
  let situationText = '';
  let successText = '';
  let autoNarration = '';
  let introNarration = '';

  if (currentStep && stepText) {
    if (phase === 'intro' && stepText.introText) {
      introNarration = stepText.introText;
    }
    if (phase === 'auto' && stepText.autoText) {
      autoNarration = stepText.autoText.auto;
    }
    if ((phase === 'user' || phase === 'user_narration' || phase === 'success' || phase === 'select_success') && stepText.userText) {
      situationText = ''; // narration is handled by user_narration phase
      // In user phase, show only the instruction part (after narration is done)
      if (phase === 'user' || phase === 'user_narration') {
        instructionText = getUserInstructionText(stepText);
      } else {
        instructionText = stepText.userText.question;
      }
      successText = stepText.userText.success;
    }
  }

  // auto フェーズの1文送り
  const autoSentences = (phase === 'auto' && autoNarration)
    ? splitIntoSentences(autoNarration)
    : [];
  const currentAutoSentence = autoSentences[sentenceIndex] ?? autoNarration;
  const isLastAutoSentence = sentenceIndex >= autoSentences.length - 1;

  // success / select_success フェーズの1文送り
  const successSentences = ((phase === 'success' || phase === 'select_success') && successText)
    ? splitIntoSentences(successText)
    : [];
  const currentSuccessSentence = successSentences[sentenceIndex] ?? successText;
  const isLastSuccessSentence = sentenceIndex >= successSentences.length - 1;

  const moveNumber = currentStep?.moveNumber ?? 1;
  const progressPct = totalSteps > 1 ? Math.max(2, (stepIndex / (totalSteps - 1)) * 100) : 2;
  const animClass = animTick % 2 === 0 ? 'trn-ta-a' : 'trn-ta-b';

  return (
    <div className="trn-screen">
      {/* Header */}
      <div className="trn-topbar">
        <div style={{ width: '80px' }}>
          <button type="button" className="trn-exit-btn" onClick={handleExit}>
            {t.trainingBackBtn}
          </button>
        </div>
        <div className="trn-topbar-center">
          <span className="trn-eyebrow">
            {t.trainingGuidedGame}
          </span>
          <span className="trn-topbar-title">{meta.title}</span>
        </div>
        <div style={{ width: '80px' }} />
      </div>

      {/* Progress bar */}
      <div className="trn-progress-section">
        <div className="trn-progress-label-row">
          <span className="trn-progress-label">Move</span>
          <span className="trn-progress-value">
            <strong>{String(moveNumber).padStart(2, '0')}</strong> / {totalSteps}
          </span>
        </div>
        <div className="trn-progress-track">
          <div className="trn-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Board */}
      <div className="trn-board-area">
        <div className="trn-board-wrap">
          <Board
            state={gameState}
            buildState={boardInteractive ? buildState : EMPTY_BUILD}
            onSelectPosition={boardInteractive ? handleSelectPosition : noop}
            onLargePocketClick={boardInteractive ? handleLargePocketClick : noop}
            onMiddlePocketClick={boardInteractive ? handleMiddlePocketClick : noop}
            onSmallPocketClick={boardInteractive ? handleSmallPocketClick : noop}
            showLabelToggle={false}
            defaultLabels={true}
            labelPerspective="black"
          />
        </div>
      </div>

      {/* Instruction panel */}
      {(() => {
        const isTappable = phase === 'intro' || phase === 'auto' || phase === 'success' || phase === 'select_success' || phase === 'user_narration';
        // 戻れるかどうか
        const canGoBack =
          (phase === 'intro' && introSentenceIndex > 0) ||
          ((phase === 'user_narration' || phase === 'auto' || phase === 'success' || phase === 'select_success') && sentenceIndex > 0);
        return (
      <div
        className={`trn-instruction-band${isTappable ? ' trn-instruction-band--tappable' : ''}`}
        onClick={isTappable ? handleNext : (phase === 'user' ? handleUserTextTap : undefined)}
      >
        {phase === 'intro' && (
          <>
            <div className="trn-narration trn-intro-sentence" style={{ whiteSpace: 'pre-wrap' }}>
              {visibleText}
            </div>
            {introSentences.length > 1 && (
              <div className="trn-intro-dots" aria-hidden="true">
                {introSentences.map((_, i) => (
                  <span
                    key={i}
                    className={`trn-intro-dot${i === introSentenceIndex ? ' trn-intro-dot-active' : ''}`}
                  />
                ))}
              </div>
            )}
          </>
        )}
        {phase === 'auto' && (
          <>
            <div className="trn-narration" style={{ whiteSpace: 'pre-wrap' }}>{visibleText}</div>
            {autoSentences.length > 1 && (
              <div className="trn-intro-dots" aria-hidden="true">
                {autoSentences.map((_, i) => (
                  <span
                    key={i}
                    className={`trn-intro-dot${i === sentenceIndex ? ' trn-intro-dot-active' : ''}`}
                  />
                ))}
              </div>
            )}
          </>
        )}
        {phase === 'user_narration' && (
          <>
            <div className="trn-narration" style={{ whiteSpace: 'pre-wrap' }}>{visibleText}</div>
            {userNarrationSentences.length > 1 && (
              <div className="trn-intro-dots" aria-hidden="true">
                {userNarrationSentences.map((_, i) => (
                  <span
                    key={i}
                    className={`trn-intro-dot${i === sentenceIndex ? ' trn-intro-dot-active' : ''}`}
                  />
                ))}
              </div>
            )}
          </>
        )}
        {phase === 'user' && (
          <>
            <div className={`trn-instruction-card${wrongAttempt ? ' trn-instruction-card--error' : ' trn-instruction-card--default'}`}>
              <div className="trn-instruction-text" style={{ whiteSpace: 'pre-wrap' }}>{visibleText}</div>
            </div>
            {wrongAttempt && (
              <div className="trn-feedback trn-feedback-wrong">
                {t.trainingIncorrectRetry}
              </div>
            )}
            {showHint && stepText?.userText && (
              <div className="trn-hint-box">
                {stepText.userText.hint}
              </div>
            )}
          </>
        )}
        {(phase === 'select_success' || phase === 'success') && (
          <>
            <div className="trn-instruction-card trn-instruction-card--success">
              <span className="trn-instruction-good">{t.trainingGood}</span>
            </div>
            <div className="trn-success-text" style={{ whiteSpace: 'pre-wrap', marginTop: '10px' }}>{visibleText}</div>
            {successSentences.length > 1 && (
              <div className="trn-intro-dots" aria-hidden="true">
                {successSentences.map((_, i) => (
                  <span
                    key={i}
                    className={`trn-intro-dot${i === sentenceIndex ? ' trn-intro-dot-active' : ''}`}
                  />
                ))}
              </div>
            )}
          </>
        )}
        {isTappable && (
          <div className="trn-tap-hints">
            <span
              className={`trn-tap-back${canGoBack ? ' trn-tap-back--active' : ''}`}
              onClick={canGoBack ? handleBack : undefined}
              aria-hidden="true"
            >
              {canGoBack ? t.trainingTapToGoBack : ''}
            </span>
            <span className="trn-tap-forward" aria-hidden="true">
              {t.trainingTapToContinue}
            </span>
          </div>
        )}
      </div>
        );
      })()}

      {/* ヒントボタンのみ表示（次へ/はじめるボタンは廃止） */}
      {phase === 'user' && !showHint && (
        <div className="trn-actions-sticky">
          <button
            type="button"
            className="action-btn action-btn-ghost"
            onClick={() => setShowHint(true)}
          >
            {t.trainingShowHint}
          </button>
        </div>
      )}

      {/* Quad Build 確認ダイアログ */}
      {quadConfirmOpen && (
        <ConfirmModal
          open={quadConfirmOpen}
          label={`Quad Build\nGate ${pendingQuadGates.join(', ​Gate ')}\n${pendingQuadGates.length}/${pendingQuadGates.length}`}
          onConfirm={handleQuadConfirm}
          onCancel={handleQuadCancel}
        />
      )}
    </div>
  );
}
