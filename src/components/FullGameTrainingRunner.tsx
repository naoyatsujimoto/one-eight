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
  // If situation is non-empty, it's the narration; question is the instruction
  if (situation.trim()) {
    return { narration: situation.trim(), instruction: question };
  }
  // Check question for \n\n separation: text before last \n\n = narration, after = instruction
  const lastDblIdx = question.lastIndexOf('\n\n');
  if (lastDblIdx !== -1) {
    const narration = question.substring(0, lastDblIdx).trim();
    const instruction = question.substring(lastDblIdx + 2).trim();
    if (narration && instruction) {
      return { narration, instruction };
    }
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
}

export function FullGameTrainingRunner({ onComplete }: FullGameTrainingRunnerProps) {
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

  // Question state (Move 21 postQuestion)
  const [questionSelected, setQuestionSelected] = useState<number | null>(null);
  const [questionShowHint, setQuestionShowHint] = useState(false);

  // Initialize: first step is intro (Move 0)
  // snapshot starts as empty initial state
  useEffect(() => {
    snapshot.current = createInitialState(null);
    // Move 0 is intro kind
    setPhase('intro');
    setIntroSentenceIndex(0);
  }, []);

  // ── Advance to a step index ───────────────────────────────────────────────
  const advanceToStep = useCallback((nextIndex: number, currentGameState: GameState) => {
    const steps = FULL_GAME_V1.steps;

    if (nextIndex >= steps.length) {
      setPhase('complete');
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

  // ── Handle "次へ" (next) button ───────────────────────────────────────────
  const handleNext = useCallback(() => {
    const currentStep = FULL_GAME_V1.steps[stepIndex];
    if (!currentStep) return;

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
  }, [phase, stepIndex, gameState, advanceToStep, introSentenceIndex, sentenceIndex, lang]);

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
          <div style={{ width: '80px' }} />
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
    const finalStep = FULL_GAME_V1.steps[FULL_GAME_V1.steps.length - 1]!;
    const finalStepText = getStepText(finalStep.moveNumber);
    const finalText = finalStepText?.finalText ? L(finalStepText.finalText) : '';
    const summaryText = L(meta.finalSummary);

    return (
      <div className="trn-screen">
        {/* Header */}
        <div className="trn-topbar">
          <div style={{ width: '80px' }} />
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

        {/* Text */}
        <div className="trn-text-body">
          {finalText && (
            <div className="trn-narration">{finalText}</div>
          )}
          <div className="trn-summary-box">
            {summaryText}
          </div>
        </div>

        {/* Actions */}
        <div className="trn-actions-sticky">
          <button type="button" className="action-btn action-btn-primary" onClick={handleFinish}>
            {lang === 'ja' ? '完了' : 'Finish'}
          </button>
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

  return (
    <div className="trn-screen">
      {/* Header */}
      <div className="trn-topbar">
        <div style={{ width: '80px' }} />
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

      {/* Instruction panel */}
      {(() => {
        const isTappable = phase === 'intro' || phase === 'auto' || phase === 'success' || phase === 'select_success' || phase === 'user_narration';
        // tapガイドは最終文以外の時に表示
        const isLastSentence =
          phase === 'intro' ? isLastIntroSentence
          : phase === 'auto' ? isLastAutoSentence
          : phase === 'user_narration' ? isLastUserNarrationSentence
          : isLastSuccessSentence;
        const showTapGuide = isTappable && !isLastSentence;
        return (
      <div
        className={`trn-instruction-band${isTappable ? ' trn-instruction-band--tappable' : ''}`}
        onClick={isTappable ? handleNext : undefined}
      >
        {phase === 'intro' && (
          <>
            <div className="trn-narration trn-intro-sentence" style={{ whiteSpace: 'pre-wrap' }}>
              {currentIntroSentence}
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
            <div className="trn-narration" style={{ whiteSpace: 'pre-wrap' }}>{currentAutoSentence}</div>
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
            <div className="trn-narration" style={{ whiteSpace: 'pre-wrap' }}>{currentUserNarrationSentence}</div>
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
            <div className="trn-instruction-text" style={{ whiteSpace: 'pre-wrap' }}>{instructionText}</div>
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
            <div className="trn-success-text" style={{ whiteSpace: 'pre-wrap' }}>{currentSuccessSentence}</div>
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
        {showTapGuide && (
          <div className="trn-tap-guide" aria-hidden="true">tap ›</div>
        )}
      </div>
        );
      })()}

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

      {/* Actions */}
      <div className="trn-actions-sticky">
        {(phase === 'intro' || phase === 'auto' || phase === 'success' || phase === 'select_success' || phase === 'user_narration') && (
          <button type="button" className="action-btn action-btn-primary" onClick={handleNext}>
            {phase === 'intro'
              ? isLastIntroSentence
                ? (lang === 'ja' ? 'はじめる' : 'Start')
                : (lang === 'ja' ? '次へ' : 'Next')
              : phase === 'auto'
                ? isLastAutoSentence
                  ? (lang === 'ja' ? '次へ' : 'Next')
                  : (lang === 'ja' ? '次へ' : 'Next')
              : phase === 'user_narration'
                ? (lang === 'ja' ? '次へ' : 'Next')
              : isLastSuccessSentence
                ? (lang === 'ja' ? '次へ' : 'Next')
                : (lang === 'ja' ? '次へ' : 'Next')}
          </button>
        )}
        {phase === 'user' && !showHint && (
          <button
            type="button"
            className="action-btn action-btn-ghost"
            onClick={() => setShowHint(true)}
          >
            {lang === 'ja' ? 'ヒントを見る' : 'Show Hint'}
          </button>
        )}
      </div>
    </div>
  );
}
