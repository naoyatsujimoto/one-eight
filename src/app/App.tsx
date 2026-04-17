import { useEffect, useRef, useState } from 'react';
import { Board } from '../components/Board';
import { BuildControls } from '../components/BuildControls';
import { HowToPlay } from '../components/HowToPlay';
import { AnalyticsPanel } from '../components/AnalyticsPanel';
import { ImportRecord } from '../components/ImportRecord';
import { MoveHistory } from '../components/MoveHistory';
import { ResultModal } from '../components/ResultModal';
import { TurnInfo } from '../components/TurnInfo';
import {
  applyMassiveBuild,
  applyQuadBuildForGates,
  applySelectiveBuild,
  applySelectiveBuildSingle,
  resetGame,
  selectPosition,
  skipTurn,
} from '../game/engine';
import { selectCpuMove } from '../game/ai';
import { clearState, hasSavedState, loadState, saveState } from '../game/storage';
import { saveGameRecord, updateAggregates } from '../game/analytics';
import { POSITION_TO_GATES } from '../game/constants';
import type { GateId, GameState, Player, PositionId } from '../game/types';

export type BuildMode = 'none' | 'massive' | 'selective' | 'quad';

export interface BoardBuildState {
  mode: BuildMode;
  selectiveFirst: GateId | null;
  /** True when selectiveFirst is set but no other related gate has an open middle slot */
  selectiveCanConfirm: boolean;
  quadSelected: GateId[];
  quadMax: number;
}

const EMPTY_BUILD_STATE: BoardBuildState = {
  mode: 'none',
  selectiveFirst: null,
  selectiveCanConfirm: false,
  quadSelected: [],
  quadMax: 4,
};

/** 選択ポジションの全 Gate の空き small スロット数を計算（quadMax 用） */
function calcQuadMax(state: GameState): number {
  if (!state.selectedPosition) return 4;
  const gateIds = POSITION_TO_GATES[state.selectedPosition];
  let freeCount = 0;
  for (const gid of gateIds) {
    const gate = state.gates[gid];
    if (gate) freeCount += gate.smallSlots.filter((s) => s === null).length;
  }
  // 空きスロット数を Gate 数上限（4）でクランプ
  return Math.min(freeCount, 4);
}

/** Delay (ms) before CPU executes its move — gives the player a moment to see the board */
const CPU_MOVE_DELAY_MS = 600;

export default function App() {
  const [state, setState] = useState<GameState>(() => {
    const saved = loadState();
    // Migrate saved state that lacks cpuPlayer field
    if (saved.cpuPlayer === undefined) {
      return { ...saved, cpuPlayer: null };
    }
    return saved;
  });
  const [hasSaved, setHasSaved] = useState<boolean>(() => hasSavedState());
  const [buildState, setBuildState] = useState<BoardBuildState>(EMPTY_BUILD_STATE);

  /**
   * Undo stack: stores complete GameState snapshots BEFORE each finalized turn.
   * - Human vs Human: each entry = one finalized turn
   * - Human vs CPU: entries alternate (human turn, then CPU turn)
   * On Undo (H vs H): pop 1. On Undo (H vs CPU): pop until we reach a human-turn state.
   */
  const [undoStack, setUndoStack] = useState<GameState[]>([]);

  const cpuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist state to localStorage on every change
  useEffect(() => {
    saveState(state);
    setHasSaved(true);
    // Auto-save analytics when CPU game ends
    if (state.gameEnded && state.cpuPlayer !== null) {
      const record = saveGameRecord(state);
      if (record) updateAggregates(record);
    }
  }, [state]);

  // Reset build state whenever selectedPosition changes
  useEffect(() => {
    const qMax = calcQuadMax(state);
    setBuildState({ ...EMPTY_BUILD_STATE, quadMax: qMax });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedPosition]);

  // CPU auto-move
  useEffect(() => {
    if (state.gameEnded) return;
    if (state.cpuPlayer === null) return;
    if (state.currentPlayer !== state.cpuPlayer) return;

    // Schedule CPU move after short delay
    cpuTimerRef.current = setTimeout(() => {
      setState((prev) => {
        if (prev.gameEnded) return prev;
        if (prev.currentPlayer !== prev.cpuPlayer) return prev;

        // Push snapshot BEFORE CPU applies its move (for Undo)
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        setUndoStack((s) => [...s, prev]);

        const move = selectCpuMove(prev, prev.cpuPlayer!);

        if (move.type === 'pass') {
          const POSITION_IDS = ['A','B','C','D','E','F','G','H','I','J','K','L','M'] as PositionId[];
          let interim = prev;
          for (const posId of POSITION_IDS) {
            const candidate = selectPosition(prev, posId);
            if (candidate.selectedPosition === posId) {
              interim = candidate;
              break;
            }
          }
          return skipTurn(interim);
        }

        const afterSelect = selectPosition(prev, move.positionId);

        if (move.type === 'massive') {
          return applyMassiveBuild(afterSelect, move.gateId);
        }
        if (move.type === 'selective') {
          return applySelectiveBuild(afterSelect, move.gates);
        }
        if (move.type === 'quad') {
          return applyQuadBuildForGates(afterSelect, move.gateIds);
        }
        return prev;
      });
    }, CPU_MOVE_DELAY_MS);

    return () => {
      if (cpuTimerRef.current !== null) {
        clearTimeout(cpuTimerRef.current);
        cpuTimerRef.current = null;
      }
    };
  }, [state.currentPlayer, state.cpuPlayer, state.gameEnded]);

  function handleNewGame(cpuPlayer: Player | null = null) {
    if (cpuTimerRef.current !== null) {
      clearTimeout(cpuTimerRef.current);
      cpuTimerRef.current = null;
    }
    clearState();
    setHasSaved(false);
    setState(resetGame(cpuPlayer));
    setBuildState(EMPTY_BUILD_STATE);
    setUndoStack([]);
  }

  function handleClearSaved() {
    clearState();
    setHasSaved(false);
  }

  function handleImport(importedState: GameState) {
    if (cpuTimerRef.current !== null) {
      clearTimeout(cpuTimerRef.current);
      cpuTimerRef.current = null;
    }
    setState(importedState);
    setBuildState(EMPTY_BUILD_STATE);
    setUndoStack([]);
  }

  // Block human interaction during CPU turn
  const isCpuTurn = !state.gameEnded && state.cpuPlayer !== null && state.currentPlayer === state.cpuPlayer;

  // ── Undo ──────────────────────────────────────────────────
  function handleUndo() {
    if (isCpuTurn) return;
    if (undoStack.length === 0) return;

    // Cancel any pending CPU timer
    if (cpuTimerRef.current !== null) {
      clearTimeout(cpuTimerRef.current);
      cpuTimerRef.current = null;
    }

    if (state.cpuPlayer === null) {
      // Human vs Human: restore 1 turn
      const prev = undoStack[undoStack.length - 1];
      if (prev === undefined) return;
      setUndoStack((s) => s.slice(0, -1));
      setState(prev);
    } else {
      // Human vs CPU: pop back until we reach a state where it's the human's turn.
      // In normal play the stack looks like: [..., beforeHumanTurn, beforeCpuTurn]
      // We want to restore to beforeHumanTurn.
      let targetIdx = undoStack.length - 1;
      while (targetIdx >= 0 && undoStack[targetIdx]?.currentPlayer === state.cpuPlayer) {
        targetIdx--;
      }
      if (targetIdx < 0) return;
      const prev = undoStack[targetIdx];
      if (prev === undefined) return;
      setUndoStack((s) => s.slice(0, targetIdx));
      setState(prev);
    }
    setBuildState(EMPTY_BUILD_STATE);
  }

  const canUndo = !isCpuTurn && undoStack.length > 0 && !state.gameEnded;

  // ── Human action handlers ──────────────────────────────────

  function handleSelectPosition(positionId: PositionId) {
    if (isCpuTurn) return;
    setState((prev) => selectPosition(prev, positionId));
  }

  function handleLargePocketClick(gateId: GateId) {
    if (isCpuTurn) return;
    // Push snapshot before finalizing turn
    setUndoStack((s) => [...s, state]);
    setState((prev) => applyMassiveBuild(prev, gateId));
    setBuildState(EMPTY_BUILD_STATE);
  }

  function handleMiddlePocketClick(gateId: GateId) {
    if (isCpuTurn) return;
    setBuildState((prev) => {
      if (prev.selectiveFirst === null) {
        // 1st pick: check if any other related gate has an open middle slot
        const relatedGates = state.selectedPosition ? POSITION_TO_GATES[state.selectedPosition] : [];
        const otherHasOpen = relatedGates.some(
          (id) => id !== gateId && state.gates[id].middleSlots.some((s) => s === null)
        );
        return {
          mode: 'selective',
          selectiveFirst: gateId,
          selectiveCanConfirm: !otherHasOpen,
          quadSelected: [],
          quadMax: prev.quadMax,
        };
      }
      if (prev.selectiveFirst === gateId) {
        return EMPTY_BUILD_STATE;
      }
      const gates: [GateId, GateId] = [prev.selectiveFirst, gateId];
      // Push snapshot before finalizing turn
      setUndoStack((s) => [...s, state]);
      setState((gs) => applySelectiveBuild(gs, gates));
      return EMPTY_BUILD_STATE;
    });
  }

  function handleSelectiveConfirm() {
    if (isCpuTurn) return;
    const { selectiveFirst } = buildState;
    if (!selectiveFirst) return;
    setUndoStack((s) => [...s, state]);
    setState((gs) => applySelectiveBuildSingle(gs, selectiveFirst));
    setBuildState(EMPTY_BUILD_STATE);
  }

  function handleSmallPocketClick(gateId: GateId) {
    if (isCpuTurn) return;
    setBuildState((prev) => {
      const currentMax = prev.mode === 'quad' ? prev.quadMax : calcQuadMax(state);
      if (prev.quadSelected.includes(gateId)) {
        const next = prev.quadSelected.filter((id) => id !== gateId);
        return next.length === 0
          ? EMPTY_BUILD_STATE
          : { mode: 'quad', selectiveFirst: null, selectiveCanConfirm: false, quadSelected: next, quadMax: currentMax };
      }
      const next = [...prev.quadSelected, gateId];
      // 上限に達したら Confirm 待ち（自動確定しない）
      return { mode: 'quad', selectiveFirst: null, selectiveCanConfirm: false, quadSelected: next, quadMax: currentMax };
    });
  }

  function handleQuadConfirm() {
    if (isCpuTurn) return;
    const { quadSelected } = buildState;
    if (quadSelected.length === 0) return;
    setUndoStack((s) => [...s, state]);
    setState((gs) => applyQuadBuildForGates(gs, quadSelected as GateId[]));
    setBuildState(EMPTY_BUILD_STATE);
  }

  function handleSkip() {
    if (isCpuTurn) return;
    // Push snapshot before finalizing turn
    setUndoStack((s) => [...s, state]);
    setState((prev) => skipTurn(prev));
    setBuildState(EMPTY_BUILD_STATE);
  }

  const [menuOpen, setMenuOpen] = useState(false);

  const modeLabel = state.cpuPlayer === null
    ? 'Human vs Human'
    : `Human (Black) vs CPU (White)`;

  return (
    <div className="app-shell" onClick={() => setMenuOpen(false)}>
      <header className="app-header">
        <h1>ONE EIGHT Web MVP</h1>
        <div className="hamburger-wrapper" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`hamburger-btn${menuOpen ? ' hamburger-btn-open' : ''}`}
            aria-label="Menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span /><span /><span />
          </button>
          {menuOpen && (
            <div className="hamburger-menu">
              {hasSaved && <span className="saved-badge menu-saved-badge">Saved</span>}
              {hasSaved && (
                <button type="button" className="btn-clear-saved menu-item" onClick={() => { handleClearSaved(); setMenuOpen(false); }}>
                  Clear save
                </button>
              )}
              <button
                type="button"
                className="btn-undo menu-item"
                onClick={() => { handleUndo(); setMenuOpen(false); }}
                disabled={!canUndo}
              >
                ↩ Undo
              </button>
              <hr className="menu-divider" />
              <button type="button" className="menu-item" onClick={() => { handleNewGame(null); setMenuOpen(false); }}>
                Human vs Human
              </button>
              <button type="button" className="menu-item" onClick={() => { handleNewGame('white'); setMenuOpen(false); }}>
                vs CPU
              </button>
            </div>
          )}
        </div>
      </header>

      {isCpuTurn && (
        <div className="cpu-thinking-banner">CPU is thinking…</div>
      )}

      <div className="game-mode-label">{modeLabel}</div>

      <main className="layout">
        <div className="left-column">
          <Board
            state={state}
            buildState={buildState}
            onSelectPosition={handleSelectPosition}
            onLargePocketClick={handleLargePocketClick}
            onMiddlePocketClick={handleMiddlePocketClick}
            onSmallPocketClick={handleSmallPocketClick}
          />
        </div>
        <div className="right-column">
          <HowToPlay />
          <TurnInfo state={state} />
          <BuildControls
            state={state}
            buildState={buildState}
            onSkip={handleSkip}
            onQuadConfirm={handleQuadConfirm}
            onSelectiveConfirm={handleSelectiveConfirm}
          />
          <MoveHistory history={state.history} />
          <AnalyticsPanel />
          <ImportRecord onImport={handleImport} />
          <ResultModal state={state} onReset={() => handleNewGame(state.cpuPlayer)} />
        </div>
      </main>
    </div>
  );
}
