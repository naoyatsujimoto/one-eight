import { useEffect, useRef, useState } from 'react';
import { Board } from '../components/Board';
import { HowToPlay } from '../components/HowToPlay';
import { AnalyticsPanel } from '../components/AnalyticsPanel';
import { ImportRecord } from '../components/ImportRecord';
import { MoveHistory } from '../components/MoveHistory';
import { ResultModal } from '../components/ResultModal';
import { TurnInfo } from '../components/TurnInfo';
import { TitleScreen } from '../components/TitleScreen';
import { TutorialScreen } from '../components/TutorialScreen';
import { AuthGate } from '../components/AuthGate';
import { MyStats } from '../components/MyStats';
import { useAuth } from '../hooks/useAuth';
import { saveMatchLog } from '../lib/matchLog';
import { useLang } from '../lib/lang';
import { OnlineLobby } from '../components/OnlineLobby';
import { OnlineBoard } from '../components/OnlineBoard';
import { UserPage } from '../components/UserPage';

type Screen = 'title' | 'tutorial' | 'main' | 'profile';
import {
  applyMassiveBuild,
  applyQuadBuildForGates,
  applySelectiveBuild,
  applySelectiveBuildSingle,
  confirmPositionOnly,
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

const SCREENS: Screen[] = ['title', 'tutorial', 'main'];

export default function App() {
  const { user } = useAuth();
  const { t } = useLang();
  // statsOpen は UserPage 画面遷移に置き換え済み（削除）
  const [screen, setScreen] = useState<Screen>(() => {
    // Restore screen from sessionStorage to survive reloads
    try {
      const saved = sessionStorage.getItem('one_eight_screen');
      if (saved === 'main' || saved === 'tutorial' || saved === 'profile') return saved as Screen;
    } catch { /* sessionStorage unavailable */ }
    return 'title';
  });
  const [screenTransition, setScreenTransition] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);

  function goTo(next: Screen) {
    // Persist screen so reloads restore the correct screen
    try { sessionStorage.setItem('one_eight_screen', next); } catch { /* ignore */ }
    setScreenTransition(true);
    setTimeout(() => {
      setScreen(next);
      setScreenTransition(false);
    }, 300);
  }

  // Prevent browser swipe-back / history navigation from returning to title
  useEffect(() => {
    if (screen !== 'title') {
      // Push a sentinel history entry so browser back is absorbed
      history.pushState({ oneEightScreen: screen }, '');
    }

    function handlePopState() {
      // Swipe-back or browser back pressed — reload the current page in place
      if (screen !== 'title') {
        window.location.reload();
      }
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [screen]);

  function goNext() {
    const idx = SCREENS.indexOf(screen);
    const next = SCREENS[idx + 1];
    if (idx < SCREENS.length - 1 && next) goTo(next);
  }

  // Title: vertical swipe-up or click → tutorial
  function handleTitleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (t) { touchStartY.current = t.clientY; touchStartX.current = t.clientX; }
  }

  function handleTitleTouchEnd(e: React.TouchEvent) {
    if (touchStartY.current === null) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dy = t.clientY - touchStartY.current;
    touchStartY.current = null;
    touchStartX.current = null;
    if (dy < -50) goNext();
  }

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
    // Auto-save analytics when any game ends (Human vs CPU or Human vs Human)
    if (state.gameEnded) {
      const record = saveGameRecord(state);
      if (record) {
        updateAggregates(record);
        if (user) {
          saveMatchLog(record, user.id).catch(() => {/* silent */});
        }
      }
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

  function handleConfirmPosition() {
    if (isCpuTurn) return;
    setUndoStack((s) => [...s, state]);
    setState((prev) => confirmPositionOnly(prev));
    setBuildState(EMPTY_BUILD_STATE);
  }

  const modeLabel = state.cpuPlayer === null
    ? t.humanVsHuman
    : t.humanVsCpu;

  function handleClearSelection() {
    setState(prev => ({ ...prev, selectedPosition: null }));
    setBuildState(EMPTY_BUILD_STATE);
  }

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modeModalOpen, setModeModalOpen] = useState(false);
  const [onlineLobbyOpen, setOnlineLobbyOpen] = useState(false);
  const [onlineGameId, setOnlineGameId] = useState<string | null>(() => {
    try { return sessionStorage.getItem('one_eight_online_game_id') || null; } catch { return null; }
  });
  const [onlineRoomCode, setOnlineRoomCode] = useState<string | undefined>(() => {
    try { return sessionStorage.getItem('one_eight_online_room_code') || undefined; } catch { return undefined; }
  });

  // onlineGameId / onlineRoomCode を sessionStorage に同期（リロード後も復帰できるように）
  useEffect(() => {
    try {
      if (onlineGameId) {
        sessionStorage.setItem('one_eight_online_game_id', onlineGameId);
      } else {
        sessionStorage.removeItem('one_eight_online_game_id');
        sessionStorage.removeItem('one_eight_online_room_code');
      }
    } catch { /* ignore */ }
  }, [onlineGameId]);

  useEffect(() => {
    try {
      if (onlineRoomCode) {
        sessionStorage.setItem('one_eight_online_room_code', onlineRoomCode);
      } else {
        sessionStorage.removeItem('one_eight_online_room_code');
      }
    } catch { /* ignore */ }
  }, [onlineRoomCode]);

  function handleNewGameRequest() {
    setModeModalOpen(true);
  }

  function handleModeSelect(cpuPlayer: Player | null) {
    setModeModalOpen(false);
    handleNewGame(cpuPlayer);
  }

  function handleOnlineGameReady(gameId: string, _color: 'black' | 'white', roomCode?: string) {
    setOnlineLobbyOpen(false);
    setOnlineGameId(gameId);
    setOnlineRoomCode(roomCode);
  }

  // プロフィール画面
  if (screen === 'profile' && user) {
    return (
      <UserPage
        userId={user.id}
        userEmail={user.email ?? null}
        onBack={() => goTo('main')}
      />
    );
  }

  // オンライン対戦中は OnlineBoard を表示
  if (onlineGameId && user) {
    return (
      <OnlineBoard
        gameId={onlineGameId}
        myUserId={user.id}
        roomCode={onlineRoomCode}
        onExit={() => { setOnlineGameId(null); setOnlineRoomCode(undefined); }}
      />
    );
  }

  // Title / Tutorial screens
  if (screen === 'title') {
    return (
      <div
        className={`screen-wrapper${screenTransition ? ' screen-out' : ''}`}
        onTouchStart={handleTitleTouchStart}
        onTouchEnd={handleTitleTouchEnd}
        onClick={goNext}
      >
        <TitleScreen />
      </div>
    );
  }

  if (screen === 'tutorial') {
    return (
      <div className={`screen-wrapper${screenTransition ? ' screen-out' : ''}`}>
        <TutorialScreen
          onComplete={() => goTo('main')}
          onSkip={() => goTo('main')}
        />
      </div>
    );
  }

  return (
    <div
      className={`app-shell${screenTransition ? ' screen-out' : ''}`}
      style={{background:'#ffffff', minHeight:'100vh'}}
    >
      <header className="topbar-2row">
        {/* 1段目: タイトル + モード */}
        <div className="topbar-row1">
          <div className="wordmark" style={{cursor:'pointer'}} onClick={() => goTo('title')}>
            ONE EIGHT
          </div>
          <div className="meta-center">{modeLabel}</div>
        </div>
        {/* 2段目: メニューボタン */}
        <div className="topbar-row2">
          <button type="button" className="top-btn" onClick={handleUndo} disabled={!canUndo}>{t.undo}</button>
          <button type="button" className="top-btn" onClick={() => setDrawerOpen(true)}>
            {t.history} <span>{state.history.length}</span>
          </button>
          <div className="top-divider" />
          {user && (
            <button type="button" className="top-btn" onClick={() => goTo('profile')}>{t.stats}</button>
          )}
          {user && (
            <button type="button" className="top-btn" onClick={() => setOnlineLobbyOpen(true)}>{t.onlinePlay}</button>
          )}
          <button type="button" className="top-btn" onClick={handleNewGameRequest}>{t.newGame}</button>
        </div>
      </header>

      {isCpuTurn && <div className="cpu-thinking-banner">{t.cpuThinking}</div>}

      <main className="layout">
        <div className="board-stage">
          <Board
            state={state}
            buildState={buildState}
            onSelectPosition={handleSelectPosition}
            onLargePocketClick={handleLargePocketClick}
            onMiddlePocketClick={handleMiddlePocketClick}
            onSmallPocketClick={handleSmallPocketClick}
          />
        </div>
        <aside className="panel-col">
          <TurnInfo
            state={state}
            modeLabel={modeLabel}
            buildState={buildState}
            onSkip={handleSkip}
            onConfirmPosition={handleConfirmPosition}
            onQuadConfirm={handleQuadConfirm}
            onSelectiveConfirm={handleSelectiveConfirm}
            onClear={handleClearSelection}
          />
          <HowToPlay />
          <ImportRecord onImport={handleImport} />
          <AnalyticsPanel />
        </aside>
      </main>

      {/* History Drawer */}
      <div className={`backdrop${drawerOpen ? ' open' : ''}`} onClick={() => setDrawerOpen(false)} />
      <aside className={`drawer${drawerOpen ? ' open' : ''}`}>
        <div className="drawer-head">
          <span className="drawer-title">{t.moveHistory}</span>
          <button type="button" className="drawer-close" onClick={() => setDrawerOpen(false)}>✕</button>
        </div>
        <div className="drawer-body">
          <MoveHistory history={state.history} />
        </div>
      </aside>

      <ResultModal state={state} onReset={handleNewGameRequest} />

      {/* Online lobby modal */}
      {onlineLobbyOpen && user && (
        <OnlineLobby
          userId={user.id}
          onGameReady={handleOnlineGameReady}
          onCancel={() => setOnlineLobbyOpen(false)}
        />
      )}

      {/* Mode select modal */}
      {modeModalOpen && (
        <>
          <div className="backdrop open" onClick={() => setModeModalOpen(false)} />
          <div className="mode-modal">
            <div className="mode-modal-card">
              <div className="result-eyebrow">New Game</div>
              <div className="mode-modal-title">{t.selectMode}</div>
              <div className="mode-modal-actions">
                <button type="button" className="result-btn result-btn-primary" onClick={() => handleModeSelect(null)}>
                  {t.humanVsHuman}
                </button>
                <button type="button" className="result-btn" onClick={() => handleModeSelect('white')}>
                  {t.humanVsCpu}
                </button>
              </div>
              <button type="button" className="mode-modal-cancel" onClick={() => setModeModalOpen(false)}>
                {t.cancel}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
