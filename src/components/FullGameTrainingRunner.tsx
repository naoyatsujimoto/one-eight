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
  | 'auto'          // Auto step: move applied, showing narration, "次へ" button
  | 'user'          // User step: waiting for board interaction
  | 'success'       // User step succeeded: showing success text, "次へ"
  | 'question'      // postQuestion: awaiting answer
  | 'complete';     // All steps done: showing finalText

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

// ── Component ───────────────────────────────────────────────────────────────

interface FullGameTrainingRunnerProps {
  onComplete: () => void;
}

export function FullGameTrainingRunner({ onComplete }: FullGameTrainingRunnerProps) {
  const { lang } = useLang();

  // ── Core state ────────────────────────────────────────────────────────────
  const [stepIndex, setStepIndex] = useState(0);
  const [gameState, setGameState] = useState<GameState>(() => createInitialState(null));
  const [phase, setPhase] = useState<FGPhase>('user'); // Move 1 is user
  const [snapshotRef] = useState({ current: createInitialState(null) }); // rollback point
  const snapshot = useRef(createInitialState(null));

  // Build UI state
  const [buildState, setBuildState] = useState<BoardBuildState>(EMPTY_BUILD);
  const [selectiveFirst, setSelectiveFirst] = useState<GateId | null>(null);
  const [quadSelected, setQuadSelected] = useState<GateId[]>([]);

  // Feedback
  const [showHint, setShowHint] = useState(false);
  const [wrongAttempt, setWrongAttempt] = useState(false);

  // Question state (Move 21 postQuestion)
  const [questionSelected, setQuestionSelected] = useState<number | null>(null);
  const [questionShowHint, setQuestionShowHint] = useState(false);

  // Initialize: first step is user (Move 1)
  // snapshot starts as empty initial state
  useEffect(() => {
    snapshot.current = createInitialState(null);
  }, []);

  // ── Advance to a step index ───────────────────────────────────────────────
  const advanceToStep = useCallback((nextIndex: number, currentGameState: GameState) => {
    const steps = FULL_GAME_V1.steps;

    if (nextIndex >= steps.length) {
      setPhase('complete');
      return;
    }

    const nextStep = steps[nextIndex];
    setStepIndex(nextIndex);
    setShowHint(false);
    setWrongAttempt(false);
    setQuestionSelected(null);
    setQuestionShowHint(false);
    setBuildState(EMPTY_BUILD);
    setSelectiveFirst(null);
    setQuadSelected([]);

    if (nextStep.kind === 'auto') {
      // Apply the auto move immediately
      const newState = applyScriptedMove(currentGameState, nextStep.move);
      setGameState(newState);
      setPhase('auto');
      snapshot.current = newState;
    } else {
      // user step
      setGameState(currentGameState);
      snapshot.current = currentGameState;
      setPhase('user');
    }
  }, []);

  // ── Handle "次へ" (next) button ───────────────────────────────────────────
  const handleNext = useCallback(() => {
    const currentStep = FULL_GAME_V1.steps[stepIndex];

    if (phase === 'success') {
      const stepText = getStepText(currentStep.moveNumber);
      if (stepText?.postQuestion) {
        // Go to question phase
        setPhase('question');
        setQuestionSelected(null);
        setQuestionShowHint(false);
        return;
      }
      // No question: advance to next step
      advanceToStep(stepIndex + 1, gameState);
      return;
    }

    if (phase === 'auto' || phase === 'complete') {
      // complete → handled by handleFinish
      advanceToStep(stepIndex + 1, gameState);
      return;
    }
  }, [phase, stepIndex, gameState, advanceToStep]);

  // ── Handle question answer ────────────────────────────────────────────────
  const handleQuestionAnswer = useCallback((index: number) => {
    setQuestionSelected(index);
    const stepText = getStepText(FULL_GAME_V1.steps[stepIndex].moveNumber);
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
    setGameState((prev) => {
      const next = selectPosition(prev, positionId);
      return next;
    });
    setBuildState(EMPTY_BUILD);
    setSelectiveFirst(null);
    setQuadSelected([]);
    setWrongAttempt(false);
  }, [phase]);

  // Commit a move attempt: validate and advance or rollback
  const tryCommitMove = useCallback((newState: GameState) => {
    const currentStep = FULL_GAME_V1.steps[stepIndex];
    if (!currentStep || currentStep.kind !== 'user') return;

    const lastRecord = newState.history[newState.history.length - 1];
    if (!lastRecord) return;

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
      if (!currentStep || currentStep.kind !== 'user') return prev;
      const expected = scriptedMoveToExpected(currentStep.expectedMove);

      if (validateMove(lastRecord, expected)) {
        snapshot.current = newState;
        setBuildState(EMPTY_BUILD);
        setSelectiveFirst(null);
        setQuadSelected([]);
        setWrongAttempt(false);
        setShowHint(false);
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
      if (!currentStep || currentStep.kind !== 'user') return prev;
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
      if (!currentStep || currentStep.kind !== 'user') return prev;
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

        const expected = scriptedMoveToExpected(currentStep.expectedMove);
        if (validateMove(lastRecord, expected)) {
          snapshot.current = newState;
          setBuildState(EMPTY_BUILD);
          setSelectiveFirst(null);
          setQuadSelected([]);
          setWrongAttempt(false);
          setShowHint(false);
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

  // ── Render ────────────────────────────────────────────────────────────────

  // Board interaction is enabled only in 'user' phase
  const boardInteractive = phase === 'user';

  const noop = useCallback(() => {}, []);

  // ── Question section ──────────────────────────────────────────────────────
  if (phase === 'question' && stepText?.postQuestion) {
    const pq = stepText.postQuestion;
    const correctIndex = pq.correctOptionIndex;
    const isCorrect = questionSelected !== null && questionSelected === correctIndex;
    const isWrong = questionSelected !== null && questionSelected !== correctIndex;

    return (
      <div style={{ background: '#ffffff', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #e8e0d8' }}>
          <div style={{ flex: 1 }}>
            <div className="result-eyebrow">{lang === 'ja' ? '一局指南' : 'Guided Game'}</div>
            <div style={{ fontWeight: 700, fontSize: '15px' }}>
              Move {currentStep.moveNumber} — {lang === 'ja' ? '確認問題' : 'Question'}
            </div>
          </div>
        </div>

        {/* Question */}
        <div style={{ flex: 1, padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontSize: '15px', fontWeight: 600 }}>{L(pq.question)}</div>

          {/* Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {pq.options.map((opt, i) => {
              const optText = lang === 'ja' ? opt.ja : opt.en;
              const selected = questionSelected === i;
              const isThisCorrect = i === correctIndex;
              let borderColor = '#e8e0d8';
              let bg = '#fff';
              if (selected) {
                borderColor = isThisCorrect ? '#4a7c4a' : '#b05050';
                bg = isThisCorrect ? '#f0f8f0' : '#fdf0f0';
              }
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleQuestionAnswer(i)}
                  disabled={isCorrect}
                  style={{
                    padding: '12px 16px',
                    border: `2px solid ${borderColor}`,
                    borderRadius: '8px',
                    background: bg,
                    textAlign: 'left',
                    fontSize: '14px',
                    cursor: isCorrect ? 'default' : 'pointer',
                    fontWeight: selected ? 600 : 400,
                  }}
                >
                  {optText}
                </button>
              );
            })}
          </div>

          {/* Hint */}
          {questionShowHint && (
            <div style={{ padding: '10px 14px', background: '#faf7f0', border: '1px solid #e8d8a0', borderRadius: '6px', fontSize: '13px', color: '#7a6a2a' }}>
              {L(pq.hint)}
            </div>
          )}

          {/* Feedback / Explanation */}
          {isWrong && !questionShowHint && (
            <div style={{ fontSize: '13px', color: '#b05050' }}>
              {lang === 'ja' ? 'もう一度考えてみてください。' : 'Try again.'}
            </div>
          )}
          {isCorrect && (
            <div style={{ padding: '10px 14px', background: '#f0f8f0', border: '1px solid #4a7c4a', borderRadius: '6px', fontSize: '13px', color: '#3a5a3a' }}>
              {L(pq.explanation)}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ padding: '12px 16px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
          {isCorrect && (
            <button type="button" className="result-btn result-btn-primary" onClick={handleQuestionNext}>
              {lang === 'ja' ? '次へ' : 'Next'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Complete section ──────────────────────────────────────────────────────
  if (phase === 'complete') {
    const finalStep = FULL_GAME_V1.steps[FULL_GAME_V1.steps.length - 1];
    const finalStepText = getStepText(finalStep.moveNumber);
    const finalText = finalStepText?.finalText ? L(finalStepText.finalText) : '';
    const summaryText = L(meta.finalSummary);

    return (
      <div style={{ background: '#ffffff', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #e8e0d8' }}>
          <div style={{ flex: 1 }}>
            <div className="result-eyebrow">{lang === 'ja' ? '一局指南' : 'Guided Game'}</div>
            <div style={{ fontWeight: 700, fontSize: '15px' }}>
              {lang === 'ja' ? '完了' : 'Complete'}
            </div>
          </div>
        </div>

        {/* Board — final state */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
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

        {/* Text */}
        <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {finalText && (
            <div style={{ fontSize: '14px', color: '#444', lineHeight: 1.6 }}>{finalText}</div>
          )}
          <div style={{ fontSize: '13px', color: '#666', lineHeight: 1.6, padding: '12px', background: '#faf7f4', borderRadius: '6px' }}>
            {summaryText}
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: '12px 16px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button type="button" className="result-btn result-btn-primary" onClick={handleFinish}>
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

  if (currentStep && stepText) {
    if (phase === 'auto' && stepText.autoText) {
      autoNarration = L(stepText.autoText.auto);
    }
    if ((phase === 'user' || phase === 'success') && stepText.userText) {
      situationText = L(stepText.userText.situation);
      instructionText = L(stepText.userText.question);
      successText = L(stepText.userText.success);
    }
  }

  const progressLabel = `Move ${currentStep?.moveNumber ?? 1} / ${totalSteps}`;

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #e8e0d8' }}>
        <div style={{ flex: 1 }}>
          <div className="result-eyebrow">
            {lang === 'ja' ? '一局指南' : 'Guided Game'} — {progressLabel}
          </div>
          <div style={{ fontWeight: 700, fontSize: '15px' }}>{L(meta.title)}</div>
        </div>
      </div>

      {/* Instruction panel */}
      <div style={{ padding: '12px 16px', background: '#faf7f4', borderBottom: '1px solid #e8e0d8' }}>
        {phase === 'auto' && (
          <div style={{ fontSize: '14px', color: '#444', lineHeight: 1.6 }}>{autoNarration}</div>
        )}
        {phase === 'user' && (
          <>
            {situationText && (
              <div style={{ fontSize: '13px', color: '#666', marginBottom: '6px' }}>{situationText}</div>
            )}
            <div style={{ fontSize: '14px', fontWeight: 600 }}>{instructionText}</div>
            {wrongAttempt && (
              <div style={{ marginTop: '6px', fontSize: '13px', color: '#b05050' }}>
                {lang === 'ja' ? '不正解です。もう一度試してください。' : 'Incorrect. Please try again.'}
              </div>
            )}
            {showHint && stepText?.userText && (
              <div style={{ marginTop: '8px', padding: '8px 12px', background: '#faf7f0', border: '1px solid #e8d8a0', borderRadius: '6px', fontSize: '13px', color: '#7a6a2a' }}>
                {L(stepText.userText.hint)}
              </div>
            )}
          </>
        )}
        {phase === 'success' && (
          <div style={{ fontSize: '14px', color: '#3a5a3a', lineHeight: 1.6, fontWeight: 500 }}>{successText}</div>
        )}
      </div>

      {/* Board */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
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

      {/* Actions */}
      <div style={{ padding: '12px 16px', display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
        {(phase === 'auto' || phase === 'success') && (
          <button type="button" className="result-btn result-btn-primary" onClick={handleNext}>
            {lang === 'ja' ? '次へ' : 'Next'}
          </button>
        )}
        {phase === 'user' && !showHint && (
          <button
            type="button"
            className="result-btn"
            style={{ fontSize: '13px' }}
            onClick={() => setShowHint(true)}
          >
            {lang === 'ja' ? 'ヒントを見る' : 'Show Hint'}
          </button>
        )}
      </div>
    </div>
  );
}
