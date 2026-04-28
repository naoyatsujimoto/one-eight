/**
 * onlineGame.ts — Supabase online_games テーブルとの通信ラッパー
 */
import { supabase } from './supabase';
import { createInitialState } from '../game/initialState';
import type { GameState } from '../game/types';

export type OnlineGameRow = {
  id: string;
  room_code: string;
  black_player_id: string;
  white_player_id: string | null;
  current_player_id: string | null;
  status: 'waiting' | 'playing' | 'finished';
  game_state: GameState;
  move_number: number;
  winner: string | null;
  created_at: string;
  updated_at: string;
};

// ─── 6文字ルームコード生成 ────────────────────────────────────────────────────

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 紛らわしい文字を除外
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── ゲーム作成 ───────────────────────────────────────────────────────────────

export async function createOnlineGame(userId: string): Promise<{ gameId: string; roomCode: string } | { error: string }> {
  const initialState = createInitialState(null);

  // room_code 衝突時は最大5回リトライ
  for (let attempt = 0; attempt < 5; attempt++) {
    const roomCode = generateRoomCode();
    const { data, error } = await supabase
      .from('online_games')
      .insert({
        room_code: roomCode,
        black_player_id: userId,
        current_player_id: null, // 参加者待ち
        status: 'waiting',
        game_state: initialState,
        move_number: 1,
      })
      .select('id, room_code')
      .single();

    if (!error && data) {
      return { gameId: data.id as string, roomCode: data.room_code as string };
    }

    // 衝突以外のエラーは即リターン
    if (error && !error.message.includes('unique')) {
      return { error: error.message };
    }
  }
  return { error: 'Failed to generate unique room code' };
}

// ─── ゲーム参加 ───────────────────────────────────────────────────────────────

export async function joinOnlineGame(roomCode: string): Promise<{ gameId: string; color: 'white' } | { error: string }> {
  const { data, error } = await supabase.rpc('join_online_game', {
    p_room_code: roomCode.toUpperCase(),
  });

  if (error) return { error: error.message };
  const result = data as { game_id: string; color: 'white' };
  return { gameId: result.game_id, color: result.color };
}

// ─── ゲーム取得 ───────────────────────────────────────────────────────────────

export async function fetchOnlineGame(gameId: string): Promise<OnlineGameRow | null> {
  const { data, error } = await supabase
    .from('online_games')
    .select('*')
    .eq('id', gameId)
    .single();

  if (error || !data) return null;
  return data as OnlineGameRow;
}

// ─── ランダムマッチング ────────────────────────────────────────────────────────

/**
 * ランダムマッチング。
 * - waiting 状態の自分以外のゲームを検索 → あれば参加（白番）
 * - なければ新規作成して待機（黒番）
 */
export async function joinOrCreateRandomGame(
  userId: string,
): Promise<{ gameId: string; color: 'black' | 'white'; roomCode: string } | { error: string }> {
  const { data, error } = await supabase.rpc('join_or_create_random_game', {
    p_user_id: userId,
  });
  if (error) return { error: error.message };
  const result = data as { game_id: string; color: 'black' | 'white'; room_code: string };
  return { gameId: result.game_id, color: result.color, roomCode: result.room_code };
}

// ─── 手を送信 ─────────────────────────────────────────────────────────────────

export async function submitOnlineMove(
  gameId: string,
  expectedMoveNumber: number,
  newGameState: GameState,
  nextPlayerId: string,
  winner: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('apply_online_move', {
    p_game_id: gameId,
    p_expected_move_number: expectedMoveNumber,
    p_new_game_state: newGameState,
    p_next_player_id: nextPlayerId,
    p_winner: winner,
  });

  if (error) return { error: error.message };
  return { error: null };
}
