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
  | 'forfeited'
  | 'no_contest';

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
  /** Phase C-2c: standalone のみが通常カレンダーに表示される（arena は RPC 側でフィルタ済み）。
   *  この値は参照用のみ。RPC が 'standalone' 固定を返すため常に 'standalone' または undefined になる。
   */
  source_kind?: 'standalone' | 'arena';
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
 * @param includeArena true の場合、Arena由来（source_kind='arena'）のofficial_matchも含める。
 *   通常カレンダー（デフォルト）は false で Arena由来を除外する。
 *   Arena画面・Arenaカレンダーは true を渡す。
 */
export async function listMyOfficialMatches(params?: {
  from?: string;
  to?: string;
  status?: OfficialMatchStatus[];
  includeArena?: boolean;
}): Promise<OfficialMatchListItem[] | { error: string }> {
  const { data, error } = await supabase.rpc('list_my_official_matches', {
    p_from: params?.from ?? null,
    p_to: params?.to ?? null,
    p_status: params?.status ?? null,
    p_include_arena: params?.includeArena ?? false,
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
): Promise<{ onlineGameId: string; color: 'black' | 'white'; isOfficial: true; startsAt: string } | { error: string }> {
  // initialState はフロントエンドで生成して渡す（game_state NOT NULL 対策）
  const initialState = createInitialState(null);

  const { data, error } = await supabase.rpc('enter_official_match', {
    p_match_id: matchId,
    p_initial_state: initialState,
  });

  if (error) return { error: error.message };
  // Supabase JS v2 では RETURNS json の RPC が data=null を返すバグがある。
  // joinOrCreateRandomGame と同様のフォールバック対応を実施する。
  const raw = data as { online_game_id?: string; color?: string; is_official?: boolean; starts_at?: string } | null;
  const nested = (data as { data?: { online_game_id?: string; color?: string; is_official?: boolean; starts_at?: string } } | null)?.data;
  const onlineGameId = raw?.online_game_id ?? nested?.online_game_id;
  const color = (raw?.color ?? nested?.color) as 'black' | 'white' | undefined;
  const startsAt = raw?.starts_at ?? nested?.starts_at ?? new Date().toISOString();
  if (!onlineGameId || !color) {
    return { error: `enter_official_match returned unexpected data: ${JSON.stringify(data)}` };
  }
  return { onlineGameId, color, isOfficial: true, startsAt };
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
// OM-1d: 入室ウィンドウ上限は totalSeconds ベースに変更（旧: 30分固定）
// → Black の持ち時間 = starts_at 後の入室猶予。超過後は no_contest。

/**
 * 現在時刻と starts_at を比較し、入室ウィンドウ内かを判定する（クライアント側）。
 * 実際の権限チェックはサーバー側 enter_official_match で行う。
 *
 * @param startsAt    公式戦の開始時刻 (ISO)
 * @param totalSeconds timer_config.totalSeconds（デフォルト 600 = 10分）
 */
export function isEnterWindowOpen(startsAt: string, totalSeconds = 600): boolean {
  const now = Date.now();
  const start = new Date(startsAt).getTime();
  const joinableFrom  = start - JOINABLE_BEFORE_MIN * 60 * 1000;
  const joinableUntil = start + totalSeconds * 1000;
  return now >= joinableFrom && now <= joinableUntil;
}

/**
 * 残り時間（ミリ秒）を返す。負値は経過時間。
 */
export function msUntilStart(startsAt: string): number {
  return new Date(startsAt).getTime() - Date.now();
}

/**
 * 両者未入室かつ starts_at + totalSeconds 超過時に no_contest を確定させる RPC。
 * User Page ロード時などに参加者のクライアントから呼び出す（冪等）。
 */
export async function checkOfficialMatchExpiry(
  matchId: string,
): Promise<{ ok: boolean; status?: string; reason?: string }> {
  const { data, error } = await supabase.rpc('check_official_match_expiry', {
    p_match_id: matchId,
  });
  if (error) return { ok: false, reason: error.message };
  return (data as { ok: boolean; status?: string; reason?: string }) ?? { ok: false };
}
