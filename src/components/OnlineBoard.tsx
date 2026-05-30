/**
 * OnlineBoard.tsx - オンライン対戦中のゲーム画面
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
import { OnlineTimerDisplay } from './OnlineTimerDisplay';
import { GameBoardHeader } from './GameBoardHeader';
import { useLang } from '../lib/lang';
import { getPublicProfile, getProfile, isProActive } from '../lib/profile';
import { fetchGhostMoves } from '../lib/matchLog';
import type { GhostMove } from '../lib/matchLog';
import { computeCanonicalHashString } from '../game/zobrist';
import { UserPage } from './UserPage';
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
  /** OM-1c: 公式戦由来ゲームかどうか。Ghost Mode 無効化制御に使用。 */
  isOfficialMatch?: boolean;
  /** OM-1c: 公式戦の開始時刻(ISO)。定刻前待機表示に使用。 */
  officialStartsAt?: string | null;
}

export function OnlineBoard({ gameId, myUserId, roomCode, onExit, isOfficialMatch, officialStartsAt }: Props) {
  const { t } = useLang();
  const {
    gameRow,
    myColor,
    isMyTurn,
    onlineStatus,
    errorMsg,
    submitMove,
    blackRemainingMs,
    whiteRemainingMs,
    turnStartedAt,
    serverUpdatedAt,
    isBeforeOfficialStart,
  } = useOnlineGame(gameId, myUserId);

  // OM-1c: 定刻前待機時刻表示用 state
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    if (!isOfficialMatch || !officialStartsAt) return;
    const ms = new Date(officialStartsAt).getTime() - Date.now();
    if (ms <= 0) return;
    // starts_at まで毎秒更新してカウントダウンを表示
    const id = setInterval(() => {
      if (new Date(officialStartsAt).getTime() <= Date.now()) {
        clearInterval(id);
      }
      forceUpdate((n) => n + 1);
    }, 500);
    return () => clearInterval(id);
  }, [isOfficialMatch, officialStartsAt]);
  const [localState, setLocalState] = useState<GameState | null>(null);
  const [buildState, setBuildState] = useState<BoardBuildState>(EMPTY_BUILD_STATE);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(false);

  // ── Ghost Mode (online_pvp) ─────────────────────────────────────────────
  const [proActive, setProActive] = useState(false);
  const [ghostModeActive, setGhostModeActive] = useState(false);
  const [ghostMoves, setGhostMoves] = useState<GhostMove[]>([]);

  // pro状態を取得
  useEffect(() => {
    getProfile(myUserId).then((profile) => {
      if (profile) setProActive(isProActive(profile));
    });
  }, [myUserId]);

  // online_pvp は常に showGhostToggle = proActive
  // OM-1c: 公式戦では Ghost Mode 無効
  const showGhostToggle = proActive && !isOfficialMatch;

  // OM-1c: 公式戦の場合 ghostModeActive を強制 OFF
  useEffect(() => {
    if (isOfficialMatch && ghostModeActive) {
      setGhostModeActive(false);
    }
  }, [isOfficialMatch, ghostModeActive]);

  // Ghost Mode ON かつ自分の手番のときのみ fetch
  useEffect(() => {
    const state = localState;
    if (!ghostModeActive || !showGhostToggle || !state) {
      setGhostMoves([]);
      return;
    }
    // 自分の手番チェック
    if (!isMyTurn) {
      setGhostMoves([]);
      return;
    }
    void (async () => {
      try {
        const hash = computeCanonicalHashString(state);
        const moves = await fetchGhostMoves(hash, myColor ?? null, state.history.length);
        setGhostMoves(moves);
      } catch {
        setGhostMoves([]);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghostModeActive, showGhostToggle, isMyTurn, localState?.history.length]);

  const [confirmModal, setConfirmModal] = useState<{ open: boolean; label: string; action: () => void }>({
    open: false, label: '', action: () => {},
  });
  // 対戦相手のプロフィール
  const [opponentProfile, setOpponentProfile] = useState<{ display_name: string | null; stats_public: boolean } | null>(null);
  const [showOpponentStats, setShowOpponentStats] = useState(false);

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

  // 対戦相手のプロフィールを取得
  // white_player_id は waiting→playing で確定するため、両プレイヤーIDを依存配列に含める
  const opponentId = gameRow
    ? (gameRow.black_player_id === myUserId ? gameRow.white_player_id : gameRow.black_player_id)
    : null;
  useEffect(() => {
    if (!opponentId) return;
    getPublicProfile(opponentId).then((profile) => {
      setOpponentProfile({
        display_name: profile?.display_name ?? null,
        stats_public: profile?.stats_public ?? false,
      });
    });
  }, [opponentId]);

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
    return <div style={styles.center}><p style={styles.muted}>Connecting...</p></div>;
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
  const opponentName = opponentProfile?.display_name ?? 'Opponent';
  const opponentIsPublic = opponentProfile?.stats_public ?? false;
  const modeLabel = `Online · You: ${myColorLabel}`;

  return (
    <div className="app-shell" style={{ background: '#fff', minHeight: '100vh' }}>
      {/* 相手の STATS オーバーレイ */}
      {showOpponentStats && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300 }}>
          <UserPage
            userId={myUserId}
            userEmail={null}
            onBack={() => setShowOpponentStats(false)}
            viewOnly
            targetUserId={opponentId ?? undefined}
          />
        </div>
      )}

      <header className="topbar">
        <div className="wordmark">ONE EIGHT</div>
        <div className="meta-center" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{modeLabel}</span>
          {opponentProfile && (
            <>
              <span style={{ color: '#bbb' }}>·</span>
              {opponentIsPublic ? (
                <button
                  type="button"
                  style={styles.opponentNameBtn}
                  onClick={() => setShowOpponentStats(true)}
                  title={t.opponentStats}
                >
                  {opponentName}
                </button>
              ) : (
                <span style={styles.opponentNameText}>{opponentName}</span>
              )}
            </>
          )}
        </div>
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
      {onlineStatus === 'playing' && !isBeforeOfficialStart && (() => {
        // OM-1d: Whiteのみ入室時に Black 未入室メッセージを表示
        // 条件: 公式戦 + 自分が White + 相手(Black)の手番 + 手数 1(未着手)
        const isOfficialWaitingForBlack =
          isOfficialMatch &&
          myColor === 'white' &&
          gameRow !== null &&
          gameRow.current_player_id === gameRow.black_player_id &&
          gameRow.move_number === 1;
        if (isOfficialWaitingForBlack) {
          return (
            <div style={{ ...styles.banner, background: '#e8f0fe', color: '#3949ab', fontWeight: 600 }}>
              Waiting for Black’s first move. Black’s clock is running.
            </div>
          );
        }
        return (
          <div style={{ ...styles.banner, background: isMyTurn ? '#e8f5e9' : '#f5f5f5', color: isMyTurn ? '#2e7d32' : '#555' }}>
            {pendingSubmit ? t.onlineSending : turnLabel}
          </div>
        );
      })()}
      {onlineStatus === 'finished' && (
        <div style={{ ...styles.banner, background: '#fff3e0', color: '#e65100', fontWeight: 700 }}>
          {(() => {
            const isTimeout = gameRow.end_reason === 'timeout';
            if (isTimeout) {
              if (gameRow.winner === myColor) return t.onlineTimeoutWin;
              if (gameRow.winner === 'draw') return t.onlineTimeoutDraw;
              return t.onlineTimeoutLose;
            }
            if (gameRow.winner === myColor) return t.onlineYouWin;
            if (gameRow.winner === 'draw') return t.onlineDraw;
            return t.onlineYouLose;
          })()}
        </div>
      )}
      {onlineStatus === 'error' && (
        <div style={{ ...styles.banner, background: '#ffebee', color: '#c62828' }}>
          Error: {errorMsg}
        </div>
      )}

      <main className="layout">
        <div className="board-col">
          {/* Phase T-2a: タイムクロック - V5 Arc Progress ヘッダー */}
          <GameBoardHeader
            mode="online"
            timerConfig={gameRow.timer_config ?? null}
            currentPlayer={state.currentPlayer}
            gameFinished={onlineStatus === 'finished'}
            blackRemainingMs={blackRemainingMs}
            whiteRemainingMs={whiteRemainingMs}
            turnStartedAt={turnStartedAt}
            serverUpdatedAt={serverUpdatedAt}
            frozenUntil={gameRow.official_starts_at ?? null}
            isMyTurn={isMyTurn}
            isBeforeOfficialStart={isBeforeOfficialStart}
          />
          <div className="board-stage">
            <Board
              state={state}
              buildState={buildState}
              onSelectPosition={handleSelectPosition}
              onLargePocketClick={handleLargePocketClick}
              onMiddlePocketClick={handleMiddlePocketClick}
              onSmallPocketClick={handleSmallPocketClick}
              labelPerspective={myColor === 'white' ? 'white' : 'black'}
              ghostMoves={ghostMoves}
              ghostModeActive={ghostModeActive}
              showGhostToggle={showGhostToggle}
              onGhostModeToggle={() => setGhostModeActive(v => !v)}
            />
          </div>
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
  opponentNameBtn: {
    background: 'none',
    border: 'none',
    padding: '0 2px',
    cursor: 'pointer',
    color: '#333',
    fontSize: 'inherit',
    fontWeight: 600,
    textDecoration: 'underline',
    textDecorationStyle: 'dotted' as const,
  },
  opponentNameText: {
    color: '#555',
    fontSize: 'inherit',
  },
};
