import { useEffect, useRef, useState, useCallback } from 'react';
import { Board } from '../components/Board';
import { TimerSettings } from '../components/TimerSettings';
import { HowToPlay } from '../components/HowToPlay';
import { ImportRecord } from '../components/ImportRecord';
import { MoveHistory } from '../components/MoveHistory';
import { ResultModal } from '../components/ResultModal';
import { TurnInfo } from '../components/TurnInfo';
import { TitleScreen } from '../components/TitleScreen';
import { TutorialScreen } from '../components/TutorialScreen';
import { AuthGate } from '../components/AuthGate';
import { MyStats } from '../components/MyStats';
import { useAuth } from '../hooks/useAuth';
import { saveMatchLog, fetchGhostMoves } from '../lib/matchLog';
import type { GhostMove } from '../lib/matchLog';
import { computeCanonicalHashString } from '../game/zobrist';
import { useLang } from '../lib/lang';
import { getProfile, upsertProfile, isProActive } from '../lib/profile';
import type { Lang } from '../lib/lang';
import { OnlineLobby } from '../components/OnlineLobby';
import { OnlineBoard } from '../components/OnlineBoard';
import { UserPage } from '../components/UserPage';
import { AdminInbox } from '../components/AdminInbox';
import { CpuProfile } from '../components/CpuProfile';
import { ConfirmModal } from '../components/ConfirmModal';
import { useUnreadCount } from '../hooks/useUnreadCount';
// import { useSound } from '../hooks/useSound'; // SOUND OFF

type Screen = 'title' | 'tutorial' | 'main' | 'profile';
import {
  applyMassiveBuild,
  applyQuadBuildForGates,
  applySelectiveBuild,
  applySelectiveBuildSingle,
  confirmPositionOnly,
  getBuildOptionsForSelected,
  resetGame,
  selectPosition,
  skipTurn,
} from '../game/engine';
import { selectCpuMove, CpuDifficulty } from '../game/ai';
import { clearState, hasSavedState, loadState, saveState } from '../game/storage';
import { saveGameRecord, updateAggregates } from '../game/analytics';
// postmortemPrecompute: auto-precompute on game end is disabled (trigger via Analyze button in STATS)
import { POSITION_TO_GATES } from '../game/constants';
import type { GateId, GameState, Player, PositionId } from '../game/types';
import type { TimerConfig } from '../game/timerTypes';
import { DEFAULT_TIMER_CONFIG } from '../game/timerTypes';

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
  // 空き small スロットが1つ以上あるゲートの数をカウント
  let gateWithFreeCount = 0;
  for (const gid of gateIds) {
    const gate = state.gates[gid];
    if (gate && gate.smallSlots.some((s) => s === null)) gateWithFreeCount++;
  }
  return gateWithFreeCount;
}

/** Delay (ms) before CPU executes its move — gives the player a moment to see the board */
const CPU_MOVE_DELAY_MS = 600;

const SCREENS: Screen[] = ['title', 'tutorial', 'main'];

export default function App() {
  const { user } = useAuth();
  const { t, setLang, setUserId } = useLang();
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
      if (next === 'main') refreshUnread();
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
  // precomputeScheduledRef: removed (auto-precompute disabled)

  // ── Phase T-1: Timer state ─────────────────────────────────────────────────
  /** timerConfig 設定（New Game 時に渡す） */
  const [pendingTimerConfig, setPendingTimerConfig] = useState<TimerConfig>(DEFAULT_TIMER_CONFIG);
  /** total_time 用: 各プレイヤーの残り時間 (ms) */
  const [playerTimers, setPlayerTimers] = useState<{ black: number; white: number } | null>(null);
  /** per_move 用: 手番開始時刻 (Date.now()) */
  const moveTimerStartedAtRef = useRef<number | null>(null);
  /** per_move 用: UI 表示用残り時間 (ms) */
  const [currentMoveRemainingMs, setCurrentMoveRemainingMs] = useState<number | null>(null);
  /** タイマー一時停止フラグ (Page Visibility) */
  const [timerPaused, setTimerPaused] = useState(false);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** total_time: 手番開始時刻 (Date.now()) - elapsed 計算用 */
  const turnStartedAtRef = useRef<number | null>(null);
  /** total_time: 手番開始時の残り時間 snapshot */
  const turnStartRemainingRef = useRef<number>(0);

  // Persist state to localStorage on every change
  useEffect(() => {
    saveState(state);
    setHasSaved(true);
    // Auto-save analytics when any game ends (Human vs CPU or Human vs Human)
    if (state.gameEnded) {
      const record = saveGameRecord(state, state.cpuPlayer !== null ? cpuDifficulty : undefined);
      if (record) {
        updateAggregates(record);
        if (user) {
          saveMatchLog(record, user.id).catch(() => {/* silent */});
        }
        // Postmortem auto-precompute: disabled. Analysis runs on Analyze button press in STATS.
      }
    }
  }, [state]);

  // Reset build state whenever selectedPosition changes
  // Also auto-trigger ConfirmModal when the selected position has no build options
  useEffect(() => {
    const qMax = calcQuadMax(state);
    setBuildState({ ...EMPTY_BUILD_STATE, quadMax: qMax });

    if (state.selectedPosition && !state.gameEnded) {
      const options = getBuildOptionsForSelected(state);
      if (options && !options.hasAny) {
        const pos = state.selectedPosition;
        setConfirmModal({
          open: true,
          label: `Confirm Position: ${pos}`,
          action: () => {
            setUndoStack((s) => [...s, state]);
            setState((prev) => confirmPositionOnly(prev));
            setBuildState(EMPTY_BUILD_STATE);
          },
        });
      }
    }
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

        const move = selectCpuMove(prev, prev.cpuPlayer!, cpuDifficulty);

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

  function handleNewGame(cpuPlayer: Player | null = null, timerConfig?: TimerConfig) {
    if (cpuTimerRef.current !== null) {
      clearTimeout(cpuTimerRef.current);
      cpuTimerRef.current = null;
    }
    if (timerIntervalRef.current !== null) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    // Postmortem auto-precompute: disabled (no cancellation needed)
    clearState();
    setHasSaved(false);
    const config = timerConfig ?? pendingTimerConfig;
    const newState: GameState = { ...resetGame(cpuPlayer), timerConfig: config.mode === 'none' ? null : config };
    setState(newState);
    setBuildState(EMPTY_BUILD_STATE);
    setUndoStack([]);
    // タイマー初期化
    if (config.mode === 'total_time') {
      setPlayerTimers({ black: config.totalSeconds * 1000, white: config.totalSeconds * 1000 });
      turnStartedAtRef.current = Date.now();
      turnStartRemainingRef.current = config.totalSeconds * 1000;
    } else if (config.mode === 'per_move') {
      setPlayerTimers(null);
      setCurrentMoveRemainingMs(config.perMoveSeconds * 1000);
      moveTimerStartedAtRef.current = Date.now();
    } else {
      setPlayerTimers(null);
      setCurrentMoveRemainingMs(null);
      moveTimerStartedAtRef.current = null;
      turnStartedAtRef.current = null;
    }
    setTimerPaused(false);
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

    let restoredState: GameState | undefined;
    let newUndoStack: GameState[];

    if (state.cpuPlayer === null) {
      // Human vs Human: restore 1 turn
      const prev = undoStack[undoStack.length - 1];
      if (prev === undefined) return;
      newUndoStack = undoStack.slice(0, -1);
      setUndoStack(newUndoStack);
      setState(prev);
      restoredState = prev;
    } else {
      // Human vs CPU: pop back until we reach a state where it's the human's turn.
      let targetIdx = undoStack.length - 1;
      while (targetIdx >= 0 && undoStack[targetIdx]?.currentPlayer === state.cpuPlayer) {
        targetIdx--;
      }
      if (targetIdx < 0) return;
      const prev = undoStack[targetIdx];
      if (prev === undefined) return;
      newUndoStack = undoStack.slice(0, targetIdx);
      setUndoStack(newUndoStack);
      setState(prev);
      restoredState = prev;
    }

    // タイマー時間復元 (Phase T-1)
    if (restoredState && state.timerConfig) {
      const config = state.timerConfig;
      const undoneMove = state.history[state.history.length - 1];
      if (config.mode === 'total_time' && undoneMove?.time_used_ms) {
        const undonePlayer = undoneMove.player;
        setPlayerTimers((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            [undonePlayer]: prev[undonePlayer] + undoneMove.time_used_ms!,
          };
        });
      } else if (config.mode === 'per_move') {
        moveTimerStartedAtRef.current = Date.now();
        setCurrentMoveRemainingMs(config.perMoveSeconds * 1000);
      }
      // total_time: 手番切り替え後の turnStartedAt をリセット
      turnStartedAtRef.current = Date.now();
      if (restoredState && config.mode === 'total_time') {
        const curPlayer = restoredState.currentPlayer;
        setPlayerTimers((prev) => {
          if (!prev) return prev;
          turnStartRemainingRef.current = prev[curPlayer];
          return prev;
        });
      }
    }

    setBuildState(EMPTY_BUILD_STATE);
  }

  /** 時間切れ処理 */
  const handleTimeout = useCallback((timedOutPlayer: 'black' | 'white') => {
    const winner: Player = timedOutPlayer === 'black' ? 'white' : 'black';
    setState((prev) => {
      if (prev.gameEnded) return prev;
      return {
        ...prev,
        gameEnded: true,
        winner,
        endReason: 'timeout',
        endedAt: new Date().toISOString(),
      };
    });
    if (timerIntervalRef.current !== null) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  const canUndo = !isCpuTurn && undoStack.length > 0 && !state.gameEnded;

  // ── Phase T-1: 手番切り替え時のタイマー処理 ─────────────────────────────────
  // state.currentPlayer 変化時（手番切り替わり）にタイマーを切り替える
  useEffect(() => {
    if (!state.timerConfig || state.timerConfig.mode === 'none' || state.gameEnded) return;
    const config = state.timerConfig;
    if (config.mode === 'total_time') {
      // 手番開始時刻をリセット
      turnStartedAtRef.current = Date.now();
      setPlayerTimers((prev) => {
        if (!prev) return prev;
        turnStartRemainingRef.current = prev[state.currentPlayer];
        return prev;
      });
    } else if (config.mode === 'per_move') {
      // per_move: 手番開始でリセット
      moveTimerStartedAtRef.current = Date.now();
      setCurrentMoveRemainingMs(config.perMoveSeconds * 1000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentPlayer, state.gameEnded]);

  // ── Phase T-1: タイマー tick (100ms interval) ──────────────────────────
  useEffect(() => {
    if (!state.timerConfig || state.timerConfig.mode === 'none' || state.gameEnded || timerPaused) {
      if (timerIntervalRef.current !== null) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      return;
    }
    const config = state.timerConfig;
    const currentPlayer = state.currentPlayer;

    // PvC: CPU 手番中はタイマーを動かさない
    if (state.cpuPlayer !== null && currentPlayer === state.cpuPlayer) {
      if (timerIntervalRef.current !== null) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      return;
    }

    timerIntervalRef.current = setInterval(() => {
      if (config.mode === 'total_time') {
        const startedAt = turnStartedAtRef.current;
        if (startedAt === null) return;
        const elapsed = Date.now() - startedAt;
        const newRemaining = Math.max(0, turnStartRemainingRef.current - elapsed);
        setPlayerTimers((prev) => {
          if (!prev) return prev;
          const updated = { ...prev, [currentPlayer]: newRemaining };
          if (newRemaining <= 0) {
            // 時間切れ
            setTimeout(() => handleTimeout(currentPlayer), 0);
          }
          return updated;
        });
      } else if (config.mode === 'per_move') {
        const startedAt = moveTimerStartedAtRef.current;
        if (startedAt === null) return;
        const elapsed = Date.now() - startedAt;
        const newRemaining = Math.max(0, config.perMoveSeconds * 1000 - elapsed);
        setCurrentMoveRemainingMs(newRemaining);
        if (newRemaining <= 0) {
          setTimeout(() => handleTimeout(currentPlayer), 0);
        }
      }
    }, 100);

    return () => {
      if (timerIntervalRef.current !== null) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentPlayer, state.gameEnded, state.timerConfig, timerPaused, handleTimeout]);

  // ── Phase T-1: Page Visibility 自動 pause ───────────────────────────────
  useEffect(() => {
    function handleVisibilityChange() {
      if (!state.timerConfig || state.timerConfig.mode === 'none' || state.gameEnded) return;
      if (document.visibilityState === 'hidden') {
        setTimerPaused(true);
      } else {
        setTimerPaused(false);
        // per_move: バックグラウンド時間を除外するため、startedAt をリセット
        if (state.timerConfig.mode === 'per_move') {
          const config = state.timerConfig;
          const current = currentMoveRemainingMs ?? config.perMoveSeconds * 1000;
          moveTimerStartedAtRef.current = Date.now() - (config.perMoveSeconds * 1000 - current);
        }
        if (state.timerConfig.mode === 'total_time') {
          // 手番開始時刻を現在の残り時間から再計算
          setPlayerTimers((prev) => {
            if (!prev) return prev;
            turnStartedAtRef.current = Date.now();
            turnStartRemainingRef.current = prev[state.currentPlayer];
            return prev;
          });
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.timerConfig, state.gameEnded, state.currentPlayer, currentMoveRemainingMs]);

  // ── Phase T-1: 手番確定時に time_used_ms を MoveRecord に記録 ────────────────
  // 手番確定後は history の最後の MoveRecord に time_used_ms を patch する
  useEffect(() => {
    if (!state.timerConfig || state.timerConfig.mode === 'none') return;
    if (state.history.length === 0) return;
    const lastMove = state.history[state.history.length - 1];
    if (!lastMove || lastMove.time_used_ms !== undefined) return;

    const config = state.timerConfig;
    let timeUsed: number | undefined;

    if (config.mode === 'total_time') {
      // 直前の手番プレイヤーの使用時間: turnStartRemainingRef - 現在の残り時間
      const prevRemaining = turnStartRemainingRef.current;
      const curRemaining = playerTimers?.[lastMove.player] ?? 0;
      timeUsed = Math.max(0, prevRemaining - curRemaining);
    } else if (config.mode === 'per_move') {
      const perMoveSec = config.perMoveSeconds * 1000;
      const remaining = currentMoveRemainingMs ?? 0;
      timeUsed = Math.max(0, perMoveSec - remaining);
    }

    if (timeUsed !== undefined) {
      setState((prev) => {
        const hist = [...prev.history];
        const last = hist[hist.length - 1];
        if (!last || last.time_used_ms !== undefined) return prev;
        hist[hist.length - 1] = { ...last, time_used_ms: timeUsed! };
        return { ...prev, history: hist };
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.history.length]);

  // ── Human action handlers ─────────────────────────────────────────────────

  function handleSelectPosition(positionId: PositionId) {
    if (isCpuTurn) return;
    playSymbol();
    setState((prev) => selectPosition(prev, positionId));
  }

  function handleLargePocketClick(gateId: GateId) {
    if (isCpuTurn) return;
    playAsset();
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
        const canConfirm = !otherHasOpen;
        if (canConfirm) {
          // No other open middle slot → auto-trigger confirm modal
          setConfirmModal({
            open: true,
            label: `Selective Build: ${gateId}`,
            action: () => {
              playAsset();
              setUndoStack((s) => [...s, state]);
              setState((gs) => applySelectiveBuildSingle(gs, gateId));
              setBuildState(EMPTY_BUILD_STATE);
            },
          });
          return EMPTY_BUILD_STATE;
        }
        return {
          mode: 'selective',
          selectiveFirst: gateId,
          selectiveCanConfirm: false,
          quadSelected: [],
          quadMax: prev.quadMax,
        };
      }
      if (prev.selectiveFirst === gateId) {
        return EMPTY_BUILD_STATE;
      }
      // 2nd pick → auto-trigger confirm modal
      const first = prev.selectiveFirst;
      const gates: [GateId, GateId] = [first, gateId];
      setConfirmModal({
        open: true,
        label: `Selective Build: ${first} + ${gateId}`,
        action: () => {
          playAsset();
          setUndoStack((s) => [...s, state]);
          setState((gs) => applySelectiveBuild(gs, gates));
          setBuildState(EMPTY_BUILD_STATE);
        },
      });
      return EMPTY_BUILD_STATE;
    });
  }

  // ── Confirm Modal ─────────────────────────────────────────
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; label: string; action: () => void }>({
    open: false,
    label: '',
    action: () => {},
  });

  function closeConfirmModal() {
    setConfirmModal((prev) => ({ ...prev, open: false }));
  }

  function handleSelectiveConfirm() {
    if (isCpuTurn) return;
    const { selectiveFirst } = buildState;
    if (!selectiveFirst) return;
    setConfirmModal({
      open: true,
      label: `Selective Build: ${selectiveFirst}`,
      action: () => {
        playAsset();
        setUndoStack((s) => [...s, state]);
        setState((gs) => applySelectiveBuildSingle(gs, selectiveFirst));
        setBuildState(EMPTY_BUILD_STATE);
      },
    });
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
      // 上限に達したら自動でConfirmモーダルを表示
      if (next.length >= currentMax) {
        setConfirmModal({
          open: true,
          label: `Quad Build: ${next.join(', ')} (${next.length}/${currentMax})`,
          action: () => {
            playAsset();
            setUndoStack((s) => [...s, state]);
            setState((gs) => applyQuadBuildForGates(gs, next as GateId[]));
            setBuildState(EMPTY_BUILD_STATE);
          },
        });
        return EMPTY_BUILD_STATE;
      }
      return { mode: 'quad', selectiveFirst: null, selectiveCanConfirm: false, quadSelected: next, quadMax: currentMax };
    });
  }

  function handleQuadConfirm() {
    if (isCpuTurn) return;
    const { quadSelected } = buildState;
    if (quadSelected.length === 0) return;
    setConfirmModal({
      open: true,
      label: `Quad Build: ${quadSelected.join(', ')} (${quadSelected.length}/${buildState.quadMax})`,
      action: () => {
        playAsset();
        setUndoStack((s) => [...s, state]);
        setState((gs) => applyQuadBuildForGates(gs, quadSelected as GateId[]));
        setBuildState(EMPTY_BUILD_STATE);
      },
    });
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
    const pos = state.selectedPosition;
    setConfirmModal({
      open: true,
      label: `Confirm Position: ${pos ?? ''}`,
      action: () => {
        setUndoStack((s) => [...s, state]);
        setState((prev) => confirmPositionOnly(prev));
        setBuildState(EMPTY_BUILD_STATE);
      },
    });
  }

  const modeLabel = state.cpuPlayer === null
    ? t.humanVsHuman
    : t.humanVsCpu;

  function handleClearSelection() {
    setState(prev => ({ ...prev, selectedPosition: null }));
    setBuildState(EMPTY_BUILD_STATE);
  }

  const playSymbol = () => {}; // SOUND OFF
  const playAsset  = () => {}; // SOUND OFF
  const [inboxOpen, setInboxOpen] = useState(false);
  const [unreadCount, refreshUnread] = useUnreadCount(
    user?.id ?? null,
    user?.email_confirmed_at ?? user?.created_at,
  );

  // ログイン後にprofileを読み込み、言語をLangProviderに反映
  useEffect(() => {
    if (!user) {
      setUserId(null);
      return;
    }
    setUserId(user.id);
    getProfile(user.id).then((profile) => {
      if (profile?.lang) setLang(profile.lang as Lang);
      // display_name が未設定の場合、ローカル名 or メール prefix で初期化
      if (!profile?.display_name) {
        const localName =
          (() => { try { return localStorage.getItem(`one8_username_${user.id}`); } catch { return null; } })();
        const fallback = user.email ? user.email.split('@')[0] : 'Player';
        const nameToSync = localName || fallback;
        upsertProfile(user.id, { display_name: nameToSync }).catch(() => {/* silent */});
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // メイン画面表示中は未読数を取得（リロード・初期表示含む）
  useEffect(() => {
    if (screen === 'main' && user) refreshUnread();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, user?.id]);
  // ── Ghost Mode ────────────────────────────────────────────────────────────────
  const [proActive, setProActive] = useState(false);
  const [ghostModeActive, setGhostModeActive] = useState(false);
  const [ghostMoves, setGhostMoves] = useState<GhostMove[]>([]);

  // pro状態をログイン後に取得
  useEffect(() => {
    if (!user) { setProActive(false); return; }
    getProfile(user.id).then((profile) => {
      if (profile) setProActive(isProActive(profile));
    });
  }, [user?.id]);

  // Ghost Mode: 自分の手番になったときに fetchGhostMoves
  const humanColor: 'black' | 'white' | null = state.cpuPlayer !== null
    ? (state.cpuPlayer === 'black' ? 'white' : 'black')  // PvC: cpuが blackなら humanは white
    : null;

  const isHumanTurn = !state.gameEnded
    && state.cpuPlayer !== null
    && state.currentPlayer !== state.cpuPlayer;

  const gameMode: string = state.cpuPlayer !== null ? 'human_vs_cpu' : 'human_vs_human';

  // showGhostToggle: proユーザー、かつ PvP 以外のモードでのみ表示
  const showGhostToggle = proActive && gameMode !== 'human_vs_human';

  useEffect(() => {
    if (!ghostModeActive || !showGhostToggle) {
      setGhostMoves([]);
      return;
    }
    // 自分の手番のときのみ fetch（PvCのみ対象、相手手番はスキップ）
    if (!isHumanTurn && state.cpuPlayer !== null) {
      setGhostMoves([]);
      return;
    }
    // 現局面の canonical_hash を算出して Ghost Move を取得
    void (async () => {
      try {
        const hash = computeCanonicalHashString(state);
        const moves = await fetchGhostMoves(hash, humanColor, state.history.length);
        setGhostMoves(moves);
      } catch {
        setGhostMoves([]);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghostModeActive, showGhostToggle, state.history.length, state.currentPlayer]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modeModalOpen, setModeModalOpen] = useState(false);
  const [cpuSettingsOpen, setCpuSettingsOpen] = useState(false);
  const [cpuDifficulty, setCpuDifficulty] = useState<CpuDifficulty>('normal');
  const [cpuProfileOpen, setCpuProfileOpen] = useState(false);
  const cpuDiffLabel = cpuDifficulty === 'normal' ? t.cpuDiffNormal
    : cpuDifficulty === 'hard' ? t.cpuDiffHard
    : t.cpuDiffVeryHard;
  const [cpuColorChoice, setCpuColorChoice] = useState<'black' | 'white'>('black');
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
    if (cpuPlayer !== null) {
      // vsCPU: open settings panel
      setCpuSettingsOpen(true);
    } else {
      // PvP: タイマー設定を渡す
      handleNewGame(null, pendingTimerConfig);
    }
  }

  function handleCpuStart() {
    setCpuSettingsOpen(false);
    // cpuColorChoice is the human's color, so CPU gets the opposite
    const cpuPlayer: Player = cpuColorChoice === 'black' ? 'white' : 'black';
    handleNewGame(cpuPlayer, pendingTimerConfig);
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
          <div className="meta-center">
            {state.cpuPlayer !== null ? (
              <button
                type="button"
                className="cpu-name-chip"
                onClick={() => setCpuProfileOpen(true)}
              >
                OPPONENT · {cpuDiffLabel}
              </button>
            ) : modeLabel}
          </div>
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
          {user && (
            <button
              type="button"
              className="top-btn"
              style={unreadCount > 0 ? { color: '#c62828', fontWeight: 700 } : undefined}
              onClick={() => setInboxOpen(true)}
            >
              MAIL
            </button>
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
            ghostMoves={ghostMoves}
            ghostModeActive={ghostModeActive}
            showGhostToggle={showGhostToggle}
            onGhostModeToggle={() => setGhostModeActive(v => !v)}
          />
        </div>
        <aside className="panel-col">
          <TurnInfo
            state={state}
            modeLabel={modeLabel}
            buildState={buildState}
            onSkip={handleSkip}
            onClear={handleClearSelection}
            timerConfig={state.timerConfig}
            playerTimers={playerTimers}
            currentMoveRemainingMs={currentMoveRemainingMs}
          />
          <HowToPlay />
          <ImportRecord onImport={handleImport} />
        </aside>
      </main>

      {/* Site footer */}
      <footer className="site-footer">
        <a href="/pricing.html">Pricing</a>
        <a href="/terms.html">Terms</a>
        <a href="/privacy.html">Privacy</a>
        <a href="/refund.html">Refund</a>
        <a href="mailto:contact@oneeightgame.com">Contact</a>
      </footer>

      {/* Admin Inbox */}
      {inboxOpen && user && (
        <AdminInbox
          userId={user.id}
          userConfirmedAt={user.email_confirmed_at ?? user.created_at}
          onClose={() => { setInboxOpen(false); refreshUnread(); }}
          onUnreadChange={refreshUnread}
        />
      )}

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

      <ConfirmModal
        open={confirmModal.open}
        label={confirmModal.label}
        onConfirm={() => { confirmModal.action(); closeConfirmModal(); }}
        onCancel={closeConfirmModal}
      />

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
              <TimerSettings
                config={pendingTimerConfig}
                onChange={setPendingTimerConfig}
              />
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

      {/* CPU name stats modal */}
      {cpuProfileOpen && state.cpuPlayer !== null && (
        <CpuProfile difficulty={cpuDifficulty} onClose={() => setCpuProfileOpen(false)} />
      )}

      {/* CPU settings modal */}
      {cpuSettingsOpen && (
        <>
          <div className="backdrop open" onClick={() => setCpuSettingsOpen(false)} />
          <div className="mode-modal">
            <div className="mode-modal-card">
              <div className="result-eyebrow">vs CPU</div>
              <div className="mode-modal-title">{t.cpuSettings}</div>

              <div className="cpu-settings-group">
                <div className="cpu-settings-label">{t.cpuDifficulty}</div>
                <div className="cpu-settings-row">
                  {(['normal', 'hard', 'very_hard'] as CpuDifficulty[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`cpu-settings-btn${cpuDifficulty === d ? ' active' : ''}`}
                      onClick={() => setCpuDifficulty(d)}
                    >
                      {d === 'normal' ? t.cpuDiffNormal : d === 'hard' ? t.cpuDiffHard : t.cpuDiffVeryHard}
                    </button>
                  ))}
                </div>
              </div>

              <div className="cpu-settings-group">
                <div className="cpu-settings-label">{t.cpuColor}</div>
                <div className="cpu-settings-row">
                  {(['black', 'white'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`cpu-settings-btn${cpuColorChoice === c ? ' active' : ''}`}
                      onClick={() => setCpuColorChoice(c)}
                    >
                      {c === 'black' ? t.cpuColorBlack : t.cpuColorWhite}
                    </button>
                  ))}
                </div>
              </div>

              <TimerSettings
                config={pendingTimerConfig}
                onChange={setPendingTimerConfig}
              />

              <div className="mode-modal-actions" style={{ marginTop: '16px' }}>
                <button type="button" className="result-btn result-btn-primary" onClick={handleCpuStart}>
                  {t.startGame}
                </button>
              </div>
              <button type="button" className="mode-modal-cancel" onClick={() => setCpuSettingsOpen(false)}>
                {t.cancel}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
