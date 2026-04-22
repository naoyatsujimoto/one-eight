/**
 * useOnlineGame.ts — オンライン対戦の状態管理フック
 *
 * - Supabase Realtime で online_games の変更を購読
 * - apply_online_move RPC 経由でのみ game_state を更新
 * - 競合（conflict）時は自動で再取得
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchOnlineGame, submitOnlineMove, type OnlineGameRow } from '../lib/onlineGame';
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
}

export function useOnlineGame(gameId: string | null, myUserId: string | null): UseOnlineGameResult {
  const [gameRow, setGameRow] = useState<OnlineGameRow | null>(null);
  const [onlineStatus, setOnlineStatus] = useState<OnlineStatus>('waiting');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // 初回フェッチ
  useEffect(() => {
    if (!gameId) return;
    fetchOnlineGame(gameId).then((row) => {
      if (row) {
        setGameRow(row);
        setOnlineStatus(row.status === 'finished' ? 'finished' : row.status === 'playing' ? 'playing' : 'waiting');
      }
    });
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

  // 自分の色を決定
  const myColor: Player | null = gameRow
    ? gameRow.black_player_id === myUserId
      ? 'black'
      : gameRow.white_player_id === myUserId
        ? 'white'
        : null
    : null;

  const isMyTurn =
    onlineStatus === 'playing' &&
    gameRow !== null &&
    gameRow.current_player_id === myUserId;

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

    const { error } = await submitOnlineMove(
      gameId,
      gameRow.move_number,
      newState,
      nextPlayerId,
      winner,
    );

    if (error) {
      if (error.includes('conflict')) {
        // 楽観ロック競合: 再取得して状態を更新
        setOnlineStatus('conflict');
        const fresh = await fetchOnlineGame(gameId);
        if (fresh) {
          setGameRow(fresh);
          setOnlineStatus('playing');
        }
      } else {
        setOnlineStatus('error');
        setErrorMsg(error);
      }
    }
  }, [gameId, gameRow, myUserId]);

  return { gameRow, myColor, isMyTurn, onlineStatus, errorMsg, submitMove };
}
