/**
 * useOnlineGame.ts — オンライン対戦の状態管理フック
 *
 * - Supabase Realtime で online_games の変更を購読
 * - apply_online_move RPC 経由でのみ game_state を更新
 * - 競合（conflict）時は自動で再取得
 * - iOS Safari 対策: Realtime が届かない場合のフォールバックポーリング
 *   - waiting 中: 3秒ごとに status を確認
 *   - playing 中: 3秒ごとに move_number を確認（相手の手番更新を検知）
 * - Phase T-2a: タイムクロック対応
 *   - タイマー状態管理 (black/white_remaining_ms, turn_started_at, server_updated_at)
 *   - claim_timeout ポーリング（5秒間隔）
 * - OM-1c 追加: timeout 自動確定
 *   - 画面上で残り 0 になった瞬間に claimTimeout を自動呼び出し
 *   - 手番プレイヤー・非手番プレイヤー両者のクライアントが呼べる
 *   - claim_timeout RPC は DB 時刻基準で検証するため虚偽申告にはならない
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchOnlineGame, submitOnlineMove, claimTimeout, type OnlineGameRow } from '../lib/onlineGame';
import { getWinner, isGameEnded } from '../game/selectors';
import type { GameState, Player } from '../game/types';

export type OnlineStatus =
  | 'waiting'    // 相手待ち
  | 'playing'    // 対戦中
  | 'finished'   // 終局
  | 'conflict'   // 競合（一瞬だけ）
  | 'error';

export interface UseOnlineGameResult {
  gameRow: OnlineGameRow | null;
  myColor: Player | null;
  isMyTurn: boolean;
  onlineStatus: OnlineStatus;
  errorMsg: string | null;
  submitMove: (newState: GameState) => Promise<void>;
  // Phase T-2a: タイマー情報
  blackRemainingMs: number | null;
  whiteRemainingMs: number | null;
  turnStartedAt: string | null;
  serverUpdatedAt: string | null;
  // OM-1c: 公式戦が定刻前かどうか
  isBeforeOfficialStart: boolean;
}

export function useOnlineGame(gameId: string | null, myUserId: string | null): UseOnlineGameResult {
  const [gameRow, setGameRow] = useState<OnlineGameRow | null>(null);
  const [onlineStatus, setOnlineStatus] = useState<OnlineStatus>('waiting');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const gameRowRef = useRef<OnlineGameRow | null>(null);

  // Phase T-2a: タイマー状態
  const [blackRemainingMs, setBlackRemainingMs] = useState<number | null>(null);
  const [whiteRemainingMs, setWhiteRemainingMs] = useState<number | null>(null);
  const [turnStartedAt, setTurnStartedAt] = useState<string | null>(null);
  const [serverUpdatedAt, setServerUpdatedAt] = useState<string | null>(null);

  // タイマー状態を gameRow から同期するヘルパー
  function syncTimerFromRow(row: OnlineGameRow) {
    setBlackRemainingMs(row.black_remaining_ms ?? null);
    setWhiteRemainingMs(row.white_remaining_ms ?? null);
    setTurnStartedAt(row.turn_started_at ?? null);
    setServerUpdatedAt(row.server_updated_at ?? null);
  }

  // gameRowRef を gameRow と同期
  useEffect(() => {
    gameRowRef.current = gameRow;
  }, [gameRow]);

  // 初回フェッチ
  useEffect(() => {
    if (!gameId) return;
    fetchOnlineGame(gameId).then((row) => {
      if (row) {
        setGameRow(row);
        syncTimerFromRow(row);
        setOnlineStatus(row.status === 'finished' ? 'finished' : row.status === 'playing' ? 'playing' : 'waiting');
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  // Realtime 購読
  useEffect(() => {
    if (!gameId) return;

    const channel = supabase
      .channel(`online_game:${gameId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'online_games', filter: `id=eq.${gameId}` },
        (payload) => {
          const updated = payload.new as OnlineGameRow;
          setGameRow(updated);
          syncTimerFromRow(updated);
          if (updated.status === 'finished') {
            setOnlineStatus('finished');
          } else if (updated.status === 'playing') {
            setOnlineStatus('playing');
          }
        },
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const fresh = await fetchOnlineGame(gameId);
          if (fresh) {
            setGameRow(fresh);
            syncTimerFromRow(fresh);
            setOnlineStatus(
              fresh.status === 'finished' ? 'finished'
              : fresh.status === 'playing' ? 'playing'
              : 'waiting'
            );
          }
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [gameId]);

  // waiting 中のフォールバックポーリング（iOS Safari 対策: Realtime 漏れ対策）
  useEffect(() => {
    if (onlineStatus !== 'waiting' || !gameId) return;

    const id = setInterval(async () => {
      const fresh = await fetchOnlineGame(gameId);
      if (fresh?.status === 'playing') {
        setGameRow(fresh);
        syncTimerFromRow(fresh);
        setOnlineStatus('playing');
        clearInterval(id);
      }
    }, 3000);

    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineStatus, gameId]);

  // playing 中のフォールバックポーリング（iOS Safari 対策: 相手手番更新の Realtime 漏れ対策）
  // move_number 変化 OR status 変化（timeout終局）どちらも検知する
  useEffect(() => {
    if (onlineStatus !== 'playing' || !gameId) return;

    const id = setInterval(async () => {
      const fresh = await fetchOnlineGame(gameId);
      if (!fresh) return;
      // status が finished になったら即遷移（move_number 変化なし timeout でも検知）
      if (fresh.status === 'finished') {
        setGameRow(fresh);
        syncTimerFromRow(fresh);
        setOnlineStatus('finished');
        clearInterval(id);
        return;
      }
      if (fresh.move_number !== gameRowRef.current?.move_number) {
        setGameRow(fresh);
        syncTimerFromRow(fresh);
      }
    }, 3000);

    return () => clearInterval(id);
  }, [onlineStatus, gameId]);

  // Phase T-2a: claim_timeout ポーリング（5秒間隔）
  // - playing 中、常時 5秒ごとに gameRowRef から最新状態を確認
  // - 相手の手番かつタイマー設定ありの時のみ claim_timeout RPC を呼び出す
  // - DB側の標準時刻で検証するため、虚偽申告は不可
  // 注意: onlineStatusは依存配列に含めるが、手番変更時の再起動はしない
  //         インターバル内部で gameRowRef を動的に専照することでカバーする
  useEffect(() => {
    if (onlineStatus !== 'playing' || !gameId || !myUserId) return;

    const id = setInterval(async () => {
      const row = gameRowRef.current;
      if (!row || row.status !== 'playing') return;
      // 相手の手番かつタイマー設定ありの時のみ
      if (row.current_player_id === myUserId) return;
      if (!row.timer_config || row.timer_config.mode === 'none') return;

      const result = await claimTimeout(gameId);
      if ('error' in result) {
        // 'not_timed_out_yet' は正常なエラー（まだ時間切れでない） → 無視
        // 'game_not_active': ゲームが既に終了している → 終局状態をフェッチして遷移
        if (
          result.error.includes('game_not_active') ||
          result.error.includes('not_active')
        ) {
          const fresh = await fetchOnlineGame(gameId);
          if (fresh && fresh.status === 'finished') {
            setGameRow(fresh);
            syncTimerFromRow(fresh);
            setOnlineStatus('finished');
          }
        }
        return;
      }
      // timeout確定: 最新状態をフェッチ
      const fresh = await fetchOnlineGame(gameId);
      if (fresh) {
        setGameRow(fresh);
        syncTimerFromRow(fresh);
        setOnlineStatus('finished');
      }
    }, 5000);

    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineStatus, gameId, myUserId]);

  // OM-1c: 残り時間 0 での timeout 自動確定
  // 画面上で currentPlayer の残り時間が 0 以下になった瞬間に claimTimeout を呼び出す。
  // 手番プレイヤー・非手番プレイヤー両者のクライアントから呼び出せる。
  // claim_timeout RPC は DB 時刻基準検証を行うため、実際に時間切れでなければエラーとなり無視される。
  const autoClaimCalledRef = useRef(false);
  useEffect(() => {
    if (onlineStatus !== 'playing' || !gameId || !myUserId) return;
    autoClaimCalledRef.current = false;

    const id = setInterval(() => {
      if (autoClaimCalledRef.current) return;
      const row = gameRowRef.current;
      if (!row || row.status !== 'playing') return;
      if (!row.timer_config || row.timer_config.mode === 'none') return;
      if (!row.turn_started_at) return;

      const now = Date.now();
      const elapsedMs = now - new Date(row.turn_started_at).getTime();
      const mode = row.timer_config.mode as string;
      const moverColor = row.current_player_id === row.black_player_id ? 'black' : 'white';

      let remaining = Infinity;
      if (mode === 'per_move') {
        const limitMs = (row.timer_config as { perMoveSeconds?: number }).perMoveSeconds ?? 60;
        remaining = limitMs * 1000 - elapsedMs;
      } else if (mode === 'total_time') {
        const moverMs = moverColor === 'black'
          ? (row.black_remaining_ms ?? 0)
          : (row.white_remaining_ms ?? 0);
        // BY-4: byoyomiSeconds を加算して秒読み分も考慮する
        const byoyomiMs = ((row.timer_config as { byoyomiSeconds?: number })?.byoyomiSeconds ?? 0) * 1000;
        remaining = moverMs + byoyomiMs - elapsedMs;
      }

      if (remaining > 0) return;

      // 残り時間 0 以下: 自動 claimTimeout
      // ただし手番者が自分の場合は自分のタイムアウトを自ら申告しない。
      // 相手クライアントが 5 秒ポーリング（Phase T-2a）または
      // この OM-1c ブロックで claimTimeout を呼ぶ。
      // これにより「入室していない相手側のタイムアウトを自分が申告する」
      // ケースのみに限定でき、自分のタイムアウトを誤って確定させるバグを防ぐ。
      if (row.current_player_id === myUserId) return;

      autoClaimCalledRef.current = true;
      void (async () => {
        const result = await claimTimeout(gameId);
        if ('error' in result) {
          // not_timed_out_yet: DB側はまだ時間切れでない → 再試行を許可
          if (result.error.includes('not_timed_out_yet')) {
            autoClaimCalledRef.current = false;
            return;
          }
          // game_not_active: 既に終局済み → 最新状態を取得
          if (result.error.includes('game_not_active') || result.error.includes('not_active')) {
            const fresh = await fetchOnlineGame(gameId);
            if (fresh && fresh.status === 'finished') {
              setGameRow(fresh);
              syncTimerFromRow(fresh);
              setOnlineStatus('finished');
            }
          }
          return;
        }
        // timeout 確定: 最新状態を取得して終局遷移
        const fresh = await fetchOnlineGame(gameId);
        if (fresh) {
          setGameRow(fresh);
          syncTimerFromRow(fresh);
          setOnlineStatus('finished');
        }
      })();
    }, 200);

    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineStatus, gameId, myUserId]);

  // 自分の色を決定
  const myColor: Player | null = gameRow
    ? gameRow.black_player_id === myUserId
      ? 'black'
      : gameRow.white_player_id === myUserId
        ? 'white'
        : null
    : null;

  // OM-1c: 公式戦の定刻前フラグ（クライアント側チェック。サーバー側でも拒否される）
  const isBeforeOfficialStart: boolean =
    gameRow?.official_starts_at != null &&
    Date.now() < new Date(gameRow.official_starts_at).getTime();

  // 定刻前は着手不可（isMyTurn=false として扱う）
  const isMyTurn =
    onlineStatus === 'playing' &&
    gameRow !== null &&
    gameRow.current_player_id === myUserId &&
    !isBeforeOfficialStart;

  // 手を送信
  const submitMove = useCallback(async (newState: GameState) => {
    if (!gameId || !gameRow || !myUserId) return;

    // 次の手番プレイヤーID
    const nextColor: Player = gameRow.game_state.currentPlayer === 'black' ? 'white' : 'black';
    const nextPlayerId = nextColor === 'black'
      ? gameRow.black_player_id
      : (gameRow.white_player_id ?? myUserId);

    // 終局判定
    const ended = isGameEnded(newState);
    const winner = ended ? (getWinner(newState) ?? null) : null;

    const result = await submitOnlineMove(
      gameId,
      gameRow.move_number,
      newState,
      nextPlayerId,
      winner,
    );

    if (result.error) {
      if (result.error.includes('conflict')) {
        // 楽観ロック競合: 再取得して状態を更新
        setOnlineStatus('conflict');
        const fresh = await fetchOnlineGame(gameId);
        if (fresh) {
          setGameRow(fresh);
          syncTimerFromRow(fresh);
          if (fresh.status === 'finished') {
            setOnlineStatus('finished');
          } else {
            setOnlineStatus('playing');
          }
        }
      } else if (result.error.includes('game_not_active') || result.error.includes('not_active')) {
        // game_not_active: DB から最新状態を取得して終局UIへ遷移
        const fresh = await fetchOnlineGame(gameId);
        if (fresh && fresh.status === 'finished') {
          setGameRow(fresh);
          syncTimerFromRow(fresh);
          setOnlineStatus('finished');
        } else {
          // 万一 finished でなければ error 扱い
          setOnlineStatus('error');
          setErrorMsg(result.error);
        }
      } else {
        setOnlineStatus('error');
        setErrorMsg(result.error);
      }
    } else {
      // 成功: RPC返却値でタイマー状態を即座反映（Realtime補完用）
      if (result.turnStartedAt !== undefined) {
        setTurnStartedAt(result.turnStartedAt ?? null);
      }
      if (result.serverUpdatedAt !== undefined) {
        setServerUpdatedAt(result.serverUpdatedAt ?? null);
      }
      if (result.blackRemainingMs !== undefined) {
        setBlackRemainingMs(result.blackRemainingMs ?? null);
      }
      if (result.whiteRemainingMs !== undefined) {
        setWhiteRemainingMs(result.whiteRemainingMs ?? null);
      }
      // timeout確定: 終局処理
      if (result.timedOut) {
        const fresh = await fetchOnlineGame(gameId);
        if (fresh) {
          setGameRow(fresh);
          syncTimerFromRow(fresh);
          setOnlineStatus('finished');
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, gameRow, myUserId]);

  return {
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
  };
}
