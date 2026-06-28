import { useState, useCallback, useRef, useEffect } from 'react';
import { Board } from './Board';
import { selectPosition, applyMassiveBuild, applySelectiveBuild, applyQuadBuildForGates } from '../game/engine';
import { POSITION_TO_GATES } from '../game/constants';
import { createInitialState } from '../game/initialState';
import type { GateId, PositionId, GameState } from '../game/types';
import type { BoardBuildState } from '../app/App';
import { useLang } from '../lib/lang';
import { FULL_GAME_V1 } from '../training/tasks/fullGameV1';
import { FULL_GAME_V1_TEXT } from '../training/tasks/fullGameV1Text';
import { validateMove } from '../training/validateMove';
import { applyScriptedMove, scriptedMoveToExpected, markFullGameCompleted } from '../training/fullGameUtils';
import type { FullGameStepText, LocalizedText } from '../training/types';

// ── Types ──────────────────────────────────────────────────────────────────

type FGPhase =
  | 'intro'          // M0: テキスト表示、board非interactive、次へボタン
  | 'auto'           // Auto step: move applied, showing narration, "次へ" button
  | 'user_narration' // NEW: user操作前の前段説明表示フェーズ（ボード非インタラクティブ）
  | 'user'           // User step: waiting for board interaction
  | 'select_success' // select_only で正しいPositionをタップ後
  | 'success'        // User step succeeded: showing success text, "次へ"
  | 'question'       // postQuestion: awaiting answer
  | 'complete';      // All steps done: showing finalText

const EMPTY_BUILD: BoardBuildState = {
  mode: 'none',
  selectiveFirst: null,
  selectiveCanConfirm: false,
  quadSelected: [],
  quadMax: 4,
};

// ── Helper: pick lang string ────────────────────────────────────────────────
function pick(text: LocalizedText, lang: 'en' | 'ja'): string {
  return lang === 'ja' ? text.ja : text.en;
}

// ── Step text lookup ────────────────────────────────────────────────────────
function getStepText(moveNumber: number): FullGameStepText | undefined {
  return FULL_GAME_V1_TEXT.steps.find((s) => s.moveNumber === moveNumber);
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

function getUserNarrationSentences(stepText: FullGameStepText, lang: 'en' | 'ja'): string[] {
  if (!stepText.userText) return [];
  const situation = pick(stepText.userText.situation, lang);
  const question = pick(stepText.userText.question, lang);
  const { narration } = extractUserNarrationAndInstruction(situation, question);
  if (!narration) return [];
  return splitIntoSentences(narration);
}

function getUserInstructionText(stepText: FullGameStepText, lang: 'en' | 'ja'): string {
  if (!stepText.userText) return '';
  const situation = pick(stepText.userText.situation, lang);
  const question = pick(stepText.userText.question, lang);
  const { instruction } = extractUserNarrationAndInstruction(situation, question);
  return instruction;
}

// ── Helper: split intro text into sentences ───────────────────────────────
function splitIntoSentences(text: string): string[] {
  // Split on 。(Japanese) or . (English) followed by optional whitespace
  // Preserve the delimiter by using a lookahead split pattern
  const raw = text
    .split(/(?<=。)|(?<=\.)(?=\s|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return raw.length > 0 ? raw : [text];
}

// ── Component ───────────────────────────────────────────────────────────────

interface FullGameTrainingRunnerProps {
  onComplete: () => void;
  onExit?: () => void;
}

export function FullGameTrainingRunner({ onComplete, onExit }: FullGameTrainingRunnerProps) {
  const { lang } = useLang();

  // ── Core state ────────────────────────────────────────────────────────────
  const [stepIndex, setStepIndex] = useState(0);
  const [gameState, setGameState] = useState<GameState>(() => createInitialState(null));
  const [phase, setPhase] = useState<FGPhase>('intro'); // Move 0 is intro
  const [snapshotRef] = useState({ current: createInitialState(null) }); // rollback point
  const snapshot = useRef(createInitialState(null));

  // Build UI state
  const [buildState, setBuildState] = useState<BoardBuildState>(EMPTY_BUILD);
  const [selectiveFirst, setSelectiveFirst] = useState<GateId | null>(null);
  const [quadSelected, setQuadSelected] = useState<GateId[]>([]);

  // Feedback
  const [showHint, setShowHint] = useState(false);
  const [wrongAttempt, setWrongAttempt] = useState(false);

  // Intro sentence navigation (Phase 4)
  const [introSentenceIndex, setIntroSentenceIndex] = useState(0);

  // M1以降の文章ブロック用 sentence navigation
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [animTick, setAnimTick] = useState(0);

  // Question state (Move 21 postQuestion)
  const [questionSelected, setQuestionSelected] = useState<number | null>(null);
  const [questionShowHint, setQuestionShowHint] = useState(false);

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
  const [completeSentIdx, setCompleteSentIdx] = useState(0);

  // Initialize: first step is intro (Move 0)
  // snapshot starts as empty initial state
  useEffect(() => {
    snapshot.current = createInitialState(null);
    // Move 0 is intro kind
    setPhase('intro');
    setIntroSentenceIndex(0);
  }, []);

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
    const st = FULL_GAME_V1_TEXT.steps.find((s) => s.moveNumber === step.moveNumber);

    let text = '';

    if (phase === 'intro') {
      const introFull = st?.introText ? pick(st.introText, lang) : '';
      const sentences = splitIntoSentences(introFull);
      text = sentences[introSentenceIndex] ?? '';
    } else if (phase === 'auto') {
      const fullText = st?.autoText ? pick(st.autoText.auto, lang) : '';
      const sentences = splitIntoSentences(fullText);
      text = sentences[sentenceIndex] ?? fullText;
    } else if (phase === 'user_narration') {
      if (st?.userText) {
        const situation = pick(st.userText.situation, lang);
        const sentences = situation.trim() ? splitIntoSentences(situation.trim()) : [];
        text = sentences[sentenceIndex] ?? '';
      }
    } else if (phase === 'user') {
      if (st?.userText) {
        const situation = pick(st.userText.situation, lang);
        const question = pick(st.userText.question, lang);
        const { instruction } = extractUserNarrationAndInstruction(situation, question);
        text = instruction;
      }
    } else if (phase === 'success' || phase === 'select_success') {
      const fullText = st?.userText ? pick(st.userText.success, lang) : '';
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
    const finalStepText = FULL_GAME_V1_TEXT.steps.find((s) => s.moveNumber === finalStep.moveNumber);

    if (completeSentIdx === 0) {
      const text = finalStepText?.finalText ? pick(finalStepText.finalText, lang) : '';
      startTypewriter(text);
    } else if (completeSentIdx === 1) {
      const text = pick(FULL_GAME_V1_TEXT.meta.finalSummary, lang);
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

    const nextStep = steps[nextIndex]!;
    setStepIndex(nextIndex);
    setShowHint(false);
    setWrongAttempt(false);
    setQuestionSelected(null);
    setQuestionShowHint(false);
    setBuildState(EMPTY_BUILD);
    setSelectiveFirst(null);
    setQuadSelected([]);

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
      const nextStepText = getStepText(nextStep.moveNumber);
      const hasPre = nextStepText ? getUserNarrationSentences(nextStepText, lang).length > 0 : false;
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
      const nextStepText = getStepText(nextStep.moveNumber);
      const hasPre = nextStepText ? getUserNarrationSentences(nextStepText, lang).length > 0 : false;
      setPhase(hasPre ? 'user_narration' : 'user');
    }
  }, [lang]);

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
      const stepText = getStepText(currentStep.moveNumber);
      const sentences = stepText ? getUserNarrationSentences(stepText, lang) : [];
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
      const stepText = getStepText(currentStep.moveNumber);
      const fullText = stepText?.userText ? pick(stepText.userText.success, lang) : '';
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
      const stepText = getStepText(FULL_GAME_V1.steps[stepIndex]?.moveNumber ?? 0);
      const introFull = stepText?.introText ? pick(stepText.introText, lang) : '';
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
      const stepText = getStepText(currentStep.moveNumber);
      const fullText = stepText?.userText ? pick(stepText.userText.success, lang) : '';
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
      const stepText = getStepText(currentStep.moveNumber);
      const fullText = stepText?.autoText ? pick(stepText.autoText.auto, lang) : '';
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
    const stepText = getStepText(FULL_GAME_V1.steps[stepIndex]!.moveNumber);
    const correctIndex = stepText?.postQuestion?.correctOptionIndex ?? 0;
    if (index !== correctIndex) {
      setQuestionShowHint(true);
    }
  }, [stepIndex]);

  const handleQuestionNext = useCallback(() => {
    advanceToStep(stepIndex + 1, gameState);
  }, [stepIndex, gameState, advanceToStep]);

  // ── Handle finish (complete phase) ───────────────────────────────────────
  const handleFinish = useCallback(() => {
    markFullGameCompleted();
    onComplete();
  }, [onComplete]);

  const handleExit = useCallback(() => {
    // typewriter cleanup
    if (typeIntervalRef.current !== null) {
      clearInterval(typeIntervalRef.current);
      typeIntervalRef.current = null;
    }
    onExit?.();
  }, [onExit]);

  // ── Board handlers ────────────────────────────────────────────────────────

  const handleSelectPosition = useCallback((positionId: PositionId) => {
    if (phase !== 'user') return;
    const currentStep = FULL_GAME_V1.steps[stepIndex];

    // select_only: 正しいPositionをタップしたら select_success へ
    if (currentStep?.kind === 'select_only') {
      setGameState((prev) => selectPosition(prev, positionId));
      if (positionId === currentStep.expectedPosition) {
        setSentenceIndex(0);
        setPhase('select_success');
      }
      return;
    }

    // 通常の user step
    setGameState((prev) => {
      const next = selectPosition(prev, positionId);
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

      const current = quadSelected;
      let next: GateId[];

      if (current.includes(gateId)) {
        // deselect
        next = current.filter((id) => id !== gateId);
        setQuadSelected(next);
        setBuildState({ mode: 'quad', selectiveFirst: null, selectiveCanConfirm: false, quadSelected: next, quadMax: connectedGates.length });
        return prev;
      }

      next = [...current, gateId];
      const maxGates = connectedGates.length;
      const minGates = currentStep.expectedMove.gates.length;
      const autoCommitThreshold = Math.min(minGates, maxGates);

      if (next.length >= autoCommitThreshold) {
        const newState = applyQuadBuildForGates(prev, next);
        const lastRecord = newState.history[newState.history.length - 1];
        if (!lastRecord) return prev;

        const expected = scriptedMoveToExpected(currentStep.expectedMove!);
        if (validateMove(lastRecord, expected)) {
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
          setQuadSelected([]);
          setWrongAttempt(true);
          return snapshot.current;
        }
      }

      setQuadSelected(next);
      setBuildState({ mode: 'quad', selectiveFirst: null, selectiveCanConfirm: false, quadSelected: next, quadMax: maxGates });
      return prev;
    });
  }, [phase, stepIndex, quadSelected]);

  // ── Derived values ────────────────────────────────────────────────────────
  const currentStep = FULL_GAME_V1.steps[stepIndex];
  const stepText = currentStep ? getStepText(currentStep.moveNumber) : undefined;
  const totalSteps = FULL_GAME_V1.steps.length;
  const userStepsDone = FULL_GAME_V1.steps.slice(0, stepIndex + 1).filter((s) => s.kind === 'user').length;
  const totalUserSteps = FULL_GAME_V1.steps.filter((s) => s.kind === 'user').length;

  // Language helpers
  const L = (text: LocalizedText) => pick(text, lang);
  const meta = FULL_GAME_V1_TEXT.meta;

  // Intro sentences (Phase 4)
  const introSentences = (currentStep && stepText?.introText)
    ? splitIntoSentences(L(stepText.introText))
    : [];
  const currentIntroSentence = introSentences[introSentenceIndex] ?? '';
  const isLastIntroSentence = introSentenceIndex >= introSentences.length - 1;

  // user_narration sentences
  const userNarrationSentences = (currentStep && stepText && (phase === 'user_narration' || phase === 'user'))
    ? getUserNarrationSentences(stepText, lang)
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
              {lang === 'ja' ? '← 戻る' : '← Back'}
            </button>
          </div>
          <div className="trn-topbar-center">
            <span className="trn-eyebrow">{lang === 'ja' ? '一局指南' : 'Guided Game'}</span>
            <span className="trn-topbar-title">Move {currentStep.moveNumber} — {lang === 'ja' ? '確認問題' : 'Question'}</span>
          </div>
          <div style={{ width: '80px' }} />
        </div>

        {/* Question */}
        <div className="trn-question-body">
          <div className="trn-question-text">{L(pq.question)}</div>

          {/* Options */}
          <div className="trn-options">
            {pq.options.map((opt, i) => {
              const optText = lang === 'ja' ? opt.ja : opt.en;
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
                  {optText}
                </button>
              );
            })}
          </div>

          {/* Hint */}
          {questionShowHint && (
            <div className="trn-hint-box">
              {L(pq.hint)}
            </div>
          )}

          {/* Feedback / Explanation */}
          {isWrong && !questionShowHint && (
            <div className="trn-feedback trn-feedback-wrong">
              {lang === 'ja' ? 'もう一度考えてみてください。' : 'Try again.'}
            </div>
          )}
          {isCorrect && (
            <div className="trn-explanation-box">
              {L(pq.explanation)}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="trn-actions-sticky">
          {isCorrect && (
            <button type="button" className="action-btn action-btn-primary" onClick={handleQuestionNext}>
              {lang === 'ja' ? '次へ' : 'Next'}
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
              {lang === 'ja' ? '← 戻る' : '← Back'}
            </button>
          </div>
          <div className="trn-topbar-center">
            <span className="trn-eyebrow">{lang === 'ja' ? '一局指南' : 'Guided Game'}</span>
            <span className="trn-topbar-title">{lang === 'ja' ? '完了' : 'Complete'}</span>
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
              {lang === 'ja' ? '完了' : 'Finish'}
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
      introNarration = L(stepText.introText);
    }
    if (phase === 'auto' && stepText.autoText) {
      autoNarration = L(stepText.autoText.auto);
    }
    if ((phase === 'user' || phase === 'user_narration' || phase === 'success' || phase === 'select_success') && stepText.userText) {
      situationText = ''; // narration is handled by user_narration phase
      // In user phase, show only the instruction part (after narration is done)
      if (phase === 'user' || phase === 'user_narration') {
        instructionText = getUserInstructionText(stepText, lang);
      } else {
        instructionText = L(stepText.userText.question);
      }
      successText = L(stepText.userText.success);
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
            {lang === 'ja' ? '← 戻る' : '← Back'}
          </button>
        </div>
        <div className="trn-topbar-center">
          <span className="trn-eyebrow">
            {lang === 'ja' ? '一局指南' : 'Guided Game'}
          </span>
          <span className="trn-topbar-title">{L(meta.title)}</span>
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
                {lang === 'ja' ? '不正解です。もう一度試してください。' : 'Incorrect. Please try again.'}
              </div>
            )}
            {showHint && stepText?.userText && (
              <div className="trn-hint-box">
                {L(stepText.userText.hint)}
              </div>
            )}
          </>
        )}
        {(phase === 'select_success' || phase === 'success') && (
          <>
            <div className="trn-instruction-card trn-instruction-card--success">
              <span className="trn-instruction-good">Good</span>
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
              {canGoBack ? (lang === 'ja' ? 'Tapして戻る' : 'Tap to go back') : ''}
            </span>
            <span className="trn-tap-forward" aria-hidden="true">
              {lang === 'ja' ? 'Tapして進む' : 'Tap to continue'}
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
            {lang === 'ja' ? 'ヒントを見る' : 'Show Hint'}
          </button>
        </div>
      )}
    </div>
  );
}
