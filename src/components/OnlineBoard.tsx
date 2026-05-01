/**
 * OnlineBoard.tsx — オンライン対戦中のゲーム画面
 *
 * - useOnlineGame フックで Realtime 同期
 * - 自分のターンのみ操作可
 * - 手を確定したら submitMove → apply_online_move RPC 経由で更新
 */
import { useEffect, useState } from 'react';
import { Board } from './Board';
import { TurnInfo } from './TurnInfo';
import { ConfirmModal } from './ConfirmModal';
import { MoveHistory } from './MoveHistory';
import { useOnlineGame } from '../hooks/useOnlineGame';
import { useLang } from '../lib/lang';
import {
  applyMassiveBuild,
  applyQuadBuildForGates,
  applySelectiveBuild,
  applySelectiveBuildSingle,
  confirmPositionOnly,
  getBuildOptionsForSelected,
  selectPosition,
  skipTurn,
} from '../game/engine';
import { POSITION_TO_GATES } from '../game/constants';
import type { GameState, GateId, Player, PositionId } from '../game/types';
import type { BoardBuildState } from '../app/App';

const EMPTY_BUILD_STATE: BoardBuildState = {
  mode: 'none',
  selectiveFirst: null,
  selectiveCanConfirm: false,
  quadSelected: [],
  quadMax: 4,
};

function calcQuadMax(state: GameState): number {
  if (!state.selectedPosition) return 4;
  const gateIds = POSITION_TO_GATES[state.selectedPosition];
  let freeCount = 0;
  for (const gid of gateIds) {
    const gate = state.gates[gid];
    if (gate) freeCount += gate.smallSlots.filter((s) => s === null).length;
  }
  return Math.min(freeCount, 4);
}

interface Props {
  gameId: string;
  myUserId: string;
  roomCode?: string;
  onExit: () => void;
}

export function OnlineBoard({ gameId, myUserId, roomCode, onExit }: Props) {
  const { t } = useLang();
  const { gameRow, myColor, isMyTurn, onlineStatus, errorMsg, submitMove } = useOnlineGame(gameId, myUserId);
  const [localState, setLocalState] = useState<GameState | null>(null);
  const [buildState, setBuildState] = useState<BoardBuildState>(EMPTY_BUILD_STATE);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; label: string; action: () => void }>({
    open: false, label: '', action: () => {},
  });

  function closeConfirmModal() {
    setConfirmModal((prev) => ({ ...prev, open: false }));
  }

  // gameRow が更新されたら localState も同期
  useEffect(() => {
    if (gameRow) {
      setLocalState(gameRow.game_state);
      setBuildState(EMPTY_BUILD_STATE);
    }
  }, [gameRow]);

  useEffect(() => {
    if (!localState) return;
    const qMax = calcQuadMax(localState);
    setBuildState({ ...EMPTY_BUILD_STATE, quadMax: qMax });

    if (localState.selectedPosition && !localState.gameEnded && !blocked) {
      const options = getBuildOptionsForSelected(localState);
      if (options && !options.hasAny) {
        const pos = localState.selectedPosition;
        setConfirmModal({
          open: true,
          label: `Confirm Position: ${pos}`,
          action: () => {
            finalize(confirmPositionOnly(localState));
          },
        });
      }
    }
  }, [localState?.selectedPosition]);

  if (!gameRow || !localState) {
    return <div style={styles.center}><p style={styles.muted}>Connecting…</p></div>;
  }

  const state = localState;
  const blocked = !isMyTurn || pendingSubmit || state.gameEnded;

  // 手が確定したら Supabase に送信
  async function finalize(newState: GameState) {
    setLocalState(newState);
    setBuildState(EMPTY_BUILD_STATE);
    if (newState.currentPlayer !== myColor) {
      // ターンが切り替わった = 自分の手が終わった
      setPendingSubmit(true);
      await submitMove(newState);
      setPendingSubmit(false);
    }
  }

  function handleSelectPosition(positionId: PositionId) {
    if (blocked) return;
    setLocalState((prev) => prev ? selectPosition(prev, positionId) : prev);
  }

  function handleLargePocketClick(gateId: GateId) {
    if (blocked) return;
    const next = applyMassiveBuild(state, gateId);
    finalize(next);
  }

  function handleMiddlePocketClick(gateId: GateId) {
    if (blocked) return;
    setBuildState((prev) => {
      if (prev.selectiveFirst === null) {
        const relatedGates = state.selectedPosition ? POSITION_TO_GATES[state.selectedPosition] : [];
        const otherHasOpen = relatedGates.some(
          (id) => id !== gateId && state.gates[id].middleSlots.some((s) => s === null)
        );
        if (!otherHasOpen) {
          setConfirmModal({
            open: true,
            label: `Selective Build: ${gateId}`,
            action: () => {
              finalize(applySelectiveBuildSingle(state, gateId));
              setBuildState(EMPTY_BUILD_STATE);
            },
          });
          return EMPTY_BUILD_STATE;
        }
        return { mode: 'selective', selectiveFirst: gateId, selectiveCanConfirm: false, quadSelected: [], quadMax: prev.quadMax };
      }
      if (prev.selectiveFirst === gateId) return EMPTY_BUILD_STATE;
      const first = prev.selectiveFirst;
      const gates: [GateId, GateId] = [first, gateId];
      setConfirmModal({
        open: true,
        label: `Selective Build: ${first} + ${gateId}`,
        action: () => {
          finalize(applySelectiveBuild(state, gates));
          setBuildState(EMPTY_BUILD_STATE);
        },
      });
      return EMPTY_BUILD_STATE;
    });
  }

  function handleSmallPocketClick(gateId: GateId) {
    if (blocked) return;
    setBuildState((prev) => {
      const currentMax = prev.mode === 'quad' ? prev.quadMax : calcQuadMax(state);
      if (prev.quadSelected.includes(gateId)) {
        const next = prev.quadSelected.filter((id) => id !== gateId);
        return next.length === 0
          ? EMPTY_BUILD_STATE
          : { mode: 'quad', selectiveFirst: null, selectiveCanConfirm: false, quadSelected: next, quadMax: currentMax };
      }
      const next = [...prev.quadSelected, gateId];
      if (next.length >= currentMax) {
        setConfirmModal({
          open: true,
          label: `Quad Build: ${next.join(', ')} (${next.length}/${currentMax})`,
          action: () => {
            finalize(applyQuadBuildForGates(state, next as GateId[]));
            setBuildState(EMPTY_BUILD_STATE);
          },
        });
        return EMPTY_BUILD_STATE;
      }
      return { mode: 'quad', selectiveFirst: null, selectiveCanConfirm: false, quadSelected: next, quadMax: currentMax };
    });
  }

  function handleSkip() {
    if (blocked) return;
    finalize(skipTurn(state));
  }

  function handleClearSelection() {
    setLocalState((prev) => prev ? { ...prev, selectedPosition: null } : prev);
    setBuildState(EMPTY_BUILD_STATE);
  }

  const myColorLabel = myColor === 'black' ? 'Black' : myColor === 'white' ? 'White' : '?';
  const turnLabel = isMyTurn ? t.onlineYourTurn : t.onlineOpponentTurn;
  const modeLabel = `Online · You: ${myColorLabel}`;

  return (
    <div className="app-shell" style={{ background: '#fff', minHeight: '100vh' }}>
      <header className="topbar">
        <div className="wordmark">ONE EIGHT</div>
        <div className="meta-center">{modeLabel}</div>
        <div className="topbar-actions">
          <button type="button" className="top-btn" onClick={() => setDrawerOpen(true)}>
            {t.history} <span>{state.history.length}</span>
          </button>
          <div className="top-divider" />
          <button type="button" className="top-btn" onClick={onExit}>{t.onlineExit}</button>
        </div>
      </header>

      {/* ステータスバナー */}
      {onlineStatus === 'waiting' && (
        <div style={styles.waitingBanner}>
          <span>{t.onlineWaitingForOpponent}</span>
          {roomCode && (
            <span style={styles.roomCodeInline}>
              {t.onlineRoomCode}:&nbsp;<strong style={styles.roomCodeText}>{roomCode}</strong>
            </span>
          )}
        </div>
      )}
      {onlineStatus === 'playing' && (
        <div style={{ ...styles.banner, background: isMyTurn ? '#e8f5e9' : '#f5f5f5', color: isMyTurn ? '#2e7d32' : '#555' }}>
          {pendingSubmit ? t.onlineSending : turnLabel}
        </div>
      )}
      {onlineStatus === 'finished' && (
        <div style={{ ...styles.banner, background: '#fff3e0', color: '#e65100', fontWeight: 700 }}>
          {gameRow.winner === myColor ? t.onlineYouWin : gameRow.winner === 'draw' ? t.onlineDraw : t.onlineYouLose}
        </div>
      )}
      {onlineStatus === 'error' && (
        <div style={{ ...styles.banner, background: '#ffebee', color: '#c62828' }}>
          Error: {errorMsg}
        </div>
      )}

      <main className="layout">
        <div className="board-stage">
          <Board
            state={state}
            buildState={buildState}
            onSelectPosition={handleSelectPosition}
            onLargePocketClick={handleLargePocketClick}
            onMiddlePocketClick={handleMiddlePocketClick}
            onSmallPocketClick={handleSmallPocketClick}
            labelPerspective={myColor === 'white' ? 'white' : 'black'}
          />
        </div>
        <aside className="panel-col">
          <TurnInfo
            state={state}
            modeLabel={modeLabel}
            buildState={buildState}
            onSkip={handleSkip}
            onClear={handleClearSelection}
          />
        </aside>
      </main>

      {/* 手順ドロワー */}
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

      <ConfirmModal
        open={confirmModal.open}
        label={confirmModal.label}
        onConfirm={() => { confirmModal.action(); closeConfirmModal(); }}
        onCancel={closeConfirmModal}
      />

      {/* 終局後に退出ボタン */}
      {onlineStatus === 'finished' && (
        <div style={styles.exitOverlay}>
          <button type="button" style={styles.exitBtn} onClick={onExit}>{t.onlineBackToMenu}</button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  center: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
  },
  muted: { color: '#999', fontSize: '0.9rem' },
  banner: {
    textAlign: 'center',
    padding: '0.5rem',
    fontSize: '0.85rem',
    background: '#f5f5f5',
    color: '#555',
    borderBottom: '1px solid #eee',
  },
  waitingBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1.5rem',
    padding: '0.6rem 1rem',
    fontSize: '0.85rem',
    background: '#f5f5f5',
    color: '#555',
    borderBottom: '1px solid #eee',
    flexWrap: 'wrap' as const,
  },
  roomCodeInline: {
    fontSize: '0.85rem',
    color: '#555',
  },
  roomCodeText: {
    fontFamily: 'monospace',
    fontSize: '1.1rem',
    letterSpacing: '0.25em',
    color: '#111',
  },
  exitOverlay: {
    position: 'fixed',
    bottom: 32,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    zIndex: 100,
  },
  exitBtn: {
    padding: '0.7rem 2rem',
    background: '#111',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: '0.95rem',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
  },
};
