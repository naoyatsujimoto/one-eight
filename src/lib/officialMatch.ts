/**
 * officialMatch.ts — Official Matches (OM-1a) クライアント関数
 *
 * 公式戦（事前予定対局）の作成・一覧取得・入室・キャンセルを担当。
 * 通常フレンドマッチ / ランダムマッチとは完全に独立した経路。
 */

import { supabase } from './supabase';
import { createInitialState } from '../game/initialState';

// ─── 型定義 ──────────────────────────────────────────────────────────────────

export type OfficialMatchStatus =
  | 'scheduled'
  | 'joinable'
  | 'live'
  | 'completed'
  | 'cancelled'
  | 'forfeited';

/** list_my_official_matches RPC の返却行 */
export type OfficialMatchListItem = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  status: OfficialMatchStatus;
  timer_config: Record<string, unknown>;
  online_game_id: string | null;
  result: 'black' | 'white' | 'draw' | null;
  winner: 'black_user' | 'white_user' | 'draw' | null;
  end_reason: string | null;
  my_color: 'black' | 'white';
  opponent_id: string;
  opponent_display_name: string | null;
  tournament_id: string | null;
  round_id: string | null;
  created_at: string;
  updated_at: string;
};

// ─── RPC ラッパー ─────────────────────────────────────────────────────────────

/**
 * 公式戦を作成する（admin のみ）。
 */
export async function createOfficialMatch(params: {
  blackUserId: string;
  whiteUserId: string;
  startsAt: string; // ISO timestamptz
  endsAt?: string | null;
  timerConfig: Record<string, unknown>; // mode: 'total_time' | 'per_move' 必須
  tournamentId?: string | null;
  roundId?: string | null;
}): Promise<{ matchId: string; status: 'scheduled' } | { error: string }> {
  const { data, error } = await supabase.rpc('create_official_match', {
    p_black_user_id: params.blackUserId,
    p_white_user_id: params.whiteUserId,
    p_starts_at: params.startsAt,
    p_ends_at: params.endsAt ?? null,
    p_timer_config: params.timerConfig,
    p_tournament_id: params.tournamentId ?? null,
    p_round_id: params.roundId ?? null,
  });

  if (error) return { error: error.message };
  const result = data as { match_id: string; status: 'scheduled' };
  return { matchId: result.match_id, status: result.status };
}

/**
 * 自分が参加する公式戦一覧を取得する。
 */
export async function listMyOfficialMatches(params?: {
  from?: string;
  to?: string;
  status?: OfficialMatchStatus[];
}): Promise<OfficialMatchListItem[] | { error: string }> {
  const { data, error } = await supabase.rpc('list_my_official_matches', {
    p_from: params?.from ?? null,
    p_to: params?.to ?? null,
    p_status: params?.status ?? null,
  });

  if (error) return { error: error.message };
  return (data as OfficialMatchListItem[]) ?? [];
}

/**
 * 公式戦に入室する（参加者のみ・時間条件内）。
 * online_game_id が返されたら、既存の useOnlineGame を用いて対局画面へ遷移する。
 */
export async function enterOfficialMatch(
  matchId: string,
): Promise<{ onlineGameId: string; color: 'black' | 'white' } | { error: string }> {
  // initialState はフロントエンドで生成して渡す（game_state NOT NULL 対策）
  const initialState = createInitialState(null);

  const { data, error } = await supabase.rpc('enter_official_match', {
    p_match_id: matchId,
    p_initial_state: initialState,
  });

  if (error) return { error: error.message };
  const result = data as { online_game_id: string; color: 'black' | 'white' };
  return { onlineGameId: result.online_game_id, color: result.color };
}

/**
 * 公式戦をキャンセルする（admin のみ）。
 */
export async function cancelOfficialMatch(
  matchId: string,
  reason?: string,
): Promise<{ ok: true } | { error: string }> {
  const { data, error } = await supabase.rpc('cancel_official_match', {
    p_match_id: matchId,
    p_reason: reason ?? null,
  });

  if (error) return { error: error.message };
  const result = data as { ok: boolean };
  return result.ok ? { ok: true } : { error: 'cancel failed' };
}

// ─── ユーティリティ ───────────────────────────────────────────────────────────

const JOINABLE_BEFORE_MIN = 15; // 試合開始 N 分前から入室可能
const LATE_JOIN_MAX_MIN = 30;   // 試合開始 N 分後まで入室可能

/**
 * 現在時刻と starts_at を比較し、入室ウィンドウ内かを判定する（クライアント側）。
 * 実際の権限チェックはサーバー側 enter_official_match で行う。
 */
export function isEnterWindowOpen(startsAt: string): boolean {
  const now = Date.now();
  const start = new Date(startsAt).getTime();
  const joinableFrom = start - JOINABLE_BEFORE_MIN * 60 * 1000;
  const joinableUntil = start + LATE_JOIN_MAX_MIN * 60 * 1000;
  return now >= joinableFrom && now <= joinableUntil;
}

/**
 * 残り時間（ミリ秒）を返す。負値は経過時間。
 */
export function msUntilStart(startsAt: string): number {
  return new Date(startsAt).getTime() - Date.now();
}
