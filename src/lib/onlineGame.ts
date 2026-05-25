/**
 * onlineGame.ts — Supabase online_games テーブルとの通信ラッパー
 */
import { supabase } from './supabase';
import { createInitialState } from '../game/initialState';
import type { GameState } from '../game/types';
import type { TimerConfig } from '../game/timerTypes';

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
  // Phase T-2a: タイムクロック
  timer_config: TimerConfig | null;
  black_remaining_ms: number | null;
  white_remaining_ms: number | null;
  turn_started_at: string | null;
  end_reason: 'normal' | 'timeout' | 'resign' | 'draw_agreement' | null;
  timeout_player: 'black' | 'white' | null;
  server_updated_at: string | null;
  // OM-1c: 公式戦ゲームのみ設定。starts_at 前はタイマー停止・着手不可。
  official_starts_at: string | null;
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

export async function createOnlineGame(
  userId: string,
  timerConfig?: TimerConfig | null,
): Promise<{ gameId: string; roomCode: string } | { error: string }> {
  const initialState = createInitialState(null);

  // room_code 衝突時は最大5回リトライ
  for (let attempt = 0; attempt < 5; attempt++) {
    const roomCode = generateRoomCode();

    // timer_config: noneまたはnullの場合はNULLを保存（既存動作準拠）
    const resolvedTimerConfig =
      timerConfig && timerConfig.mode !== 'none' ? timerConfig : null;

    const { data, error } = await supabase
      .from('online_games')
      .insert({
        room_code: roomCode,
        black_player_id: userId,
        current_player_id: null, // 参加者待ち
        status: 'waiting',
        game_state: initialState,
        move_number: 1,
        timer_config: resolvedTimerConfig,
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
 * - なければ initialState を渡して新規作成して待機（黒番）
 * initialState はフロント側の createInitialState() で生成する
 */
export async function joinOrCreateRandomGame(
  userId: string,
  initialState: GameState,
): Promise<{ gameId: string; color: 'black' | 'white'; roomCode: string } | { error: string }> {
  const { data, error } = await supabase.rpc('join_or_create_random_game', {
    p_user_id: userId,
    p_initial_state: initialState,
  });
  if (error) return { error: error.message };
  // Supabase JS v2 では RETURNS json の RPC が data=null を返すバグがある。
  // ネストされた形式 ({ data: { game_id, ... } }) にも対応する。
  const raw = data as { game_id?: string; color?: string; room_code?: string } | null;
  const nested = (data as { data?: { game_id?: string; color?: string; room_code?: string } } | null)?.data;
  const gameId = raw?.game_id ?? nested?.game_id;
  const color = (raw?.color ?? nested?.color) as 'black' | 'white' | undefined;
  const roomCode = raw?.room_code ?? nested?.room_code ?? '';
  if (!gameId || !color) {
    return { error: `join_or_create_random_game returned unexpected data: ${JSON.stringify(data)}` };
  }
  return { gameId, color, roomCode };
}

// ─── 手を送信 ─────────────────────────────────────────────────────────────────

export type SubmitMoveResult = {
  error: string | null;
  timedOut?: boolean;
  winner?: string | null;
  blackRemainingMs?: number | null;
  whiteRemainingMs?: number | null;
  turnStartedAt?: string | null;
  serverUpdatedAt?: string | null;
};

export async function submitOnlineMove(
  gameId: string,
  expectedMoveNumber: number,
  newGameState: GameState,
  nextPlayerId: string,
  winner: string | null,
): Promise<SubmitMoveResult> {
  const { data, error } = await supabase.rpc('apply_online_move', {
    p_game_id: gameId,
    p_expected_move_number: expectedMoveNumber,
    p_new_game_state: newGameState,
    p_next_player_id: nextPlayerId,
    p_winner: winner,
  });

  if (error) return { error: error.message };

  const result = data as {
    ok: boolean;
    timed_out: boolean;
    winner: string | null;
    black_remaining_ms: number | null;
    white_remaining_ms: number | null;
    turn_started_at: string | null;
    server_updated_at: string | null;
  };

  return {
    error: null,
    timedOut: result?.timed_out ?? false,
    winner: result?.winner ?? null,
    blackRemainingMs: result?.black_remaining_ms ?? null,
    whiteRemainingMs: result?.white_remaining_ms ?? null,
    turnStartedAt: result?.turn_started_at ?? null,
    serverUpdatedAt: result?.server_updated_at ?? null,
  };
}

// ─── タイムアウト宣言 ─────────────────────────────────────────────────────────

export async function claimTimeout(
  gameId: string,
): Promise<{ winner: string; timeoutPlayer: string } | { error: string }> {
  const { data, error } = await supabase.rpc('claim_timeout', {
    p_game_id: gameId,
  });
  if (error) return { error: error.message };
  const result = data as { winner: string; timeout_player: string };
  return { winner: result.winner, timeoutPlayer: result.timeout_player };
}
