/**
 * arena.ts — Official Arena client functions
 *
 * Phase E-1: read display only
 * Phase E-2: Entry confirmation modal + enter_arena_event execution
 * RPC wrappers for get_arena_overview / get_arena_detail / enter_arena_event
 */

import { supabase } from './supabase';
import { track, trackRpcCall } from './kpiTracker';

const _arenaRoute = typeof window !== 'undefined' ? window.location.pathname : '/arena';

/** シンプルなRPC計測ヘルパー ({data, error}形式用) */
function _trackRpcResult(
  rpcName: string,
  route: string,
  hasError: boolean,
  startMs: number,
): void {
  const elapsedMs = Math.min(Math.round(performance.now() - startMs), 300_000);
  const outcome: 'success' | 'error' = hasError ? 'error' : 'success';
  try {
    track('rpc_call_completed', { rpc_name: rpcName, outcome, elapsed_ms: elapsedMs, route });
  } catch { /* KPI失敗は無視 */ }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ArenaOverviewItem {
  arena_id: string;
  code: string;
  display_name: string;
  title_name: string;
  weekday: number;
  start_time_jst: string;
  entry_deadline_hours: number;
  timer_config: Record<string, unknown> | null;
  display_order: number;
  // Master reward (Phase 1)
  master_reward_amount_cents: number | null;
  master_reward_currency: string | null;
  // Master
  current_master_user_id: string | null;
  current_master_display_name: string | null;
  // Interim Master
  current_interim_master_user_id: string | null;
  current_interim_master_display_name: string | null;
  // Next event
  event_id: string | null;
  event_datetime: string | null;
  entry_deadline: string | null;
  event_status: string | null;
  entry_count: number;
  // My entry
  my_entry_status: string | null;
  my_entered_at: string | null;
  // Previous event results pending (true = previous event has unprocessed arena_matches)
  previous_results_pending: boolean;
}

export interface ArenaRankingRow {
  user_id: string;
  display_name: string | null;
  points: number;
  wins: number;
  losses: number;
  no_show_losses: number;
  participations: number;
  matches_played: number;
}

export interface ArenaMatchHistoryRow {
  event_datetime: string | null;
  match_no: number | null;
  match_kind: string | null;
  black_display_name: string | null;
  white_display_name: string | null;
  winner_display_name: string | null;
  end_reason: string | null;
  black_point_delta: number;
  white_point_delta: number;
  master_effect: string | null;
  played_at: string | null;
}

export interface ArenaMasterHistoryRow {
  user_id: string;
  display_name: string | null;
  status: 'current' | 'former';
  reason: string | null;
  started_at: string;
  ended_at: string | null;
}

export interface ArenaDetailData {
  arena_id: string;
  code: string;
  display_name: string;
  title_name: string;
  weekday: number;
  start_time_jst: string;
  entry_deadline_hours: number;
  timer_config: Record<string, unknown> | null;
  // Master reward (Phase 1)
  master_reward_amount_cents: number | null;
  master_reward_currency: string | null;
  // Master
  current_master_user_id: string | null;
  current_master_display_name: string | null;
  current_interim_master_user_id: string | null;
  current_interim_master_display_name: string | null;
  // Next event
  next_event: {
    event_id: string;
    event_datetime: string;
    entry_deadline: string;
    event_status: string;
    entry_count: number;
  } | null;
  // My entry
  my_entry_status: string | null;
  my_entered_at: string | null;
  my_match: Record<string, unknown> | null;
  // Previous event results pending (true = previous event has unprocessed arena_matches)
  previous_results_pending: boolean;
  // Rankings and history
  top_ranking: ArenaRankingRow[];
  recent_match_history: ArenaMatchHistoryRow[];
  recent_master_history: ArenaMasterHistoryRow[];
}

// ─── Entry result type ──────────────────────────────────────────────────────────

export type EnterArenaEventResult =
  | { ok: true; entry_id?: string; arena_event_id?: string; entered_at?: string }
  | { ok: false; reason: string; [key: string]: unknown };

// ─── API wrappers ──────────────────────────────────────────────────────────────

/**
 * get_arena_overview() — Arena一覧取得
 * anon/authenticated どちらも呼べる
 */
export async function getArenaOverview(): Promise<
  ArenaOverviewItem[] | { error: string }
> {
  const route = _arenaRoute;
  return trackRpcCall(
    'get_arena_overview',
    async () => {
      const { data, error } = await supabase.rpc('get_arena_overview');
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      if (!Array.isArray(data)) throw new Error('Unexpected response format');
      return data as ArenaOverviewItem[];
    },
    route,
  ).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  });
}

/**
 * get_arena_detail(p_arena_id) — Arena詳細取得
 * anon/authenticated どちらも呼べる
 */
export async function getArenaDetail(
  arenaId: string
): Promise<ArenaDetailData | { error: string }> {
  const route = _arenaRoute;
  return trackRpcCall(
    'get_arena_detail',
    async () => {
      const { data, error } = await supabase.rpc('get_arena_detail', { p_arena_id: arenaId });
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      if (!data || typeof data !== 'object') throw new Error('Unexpected response format');
      const d = data as Record<string, unknown>;
      if (d['error']) throw new Error(d['error'] as string);
      return data as unknown as ArenaDetailData;
    },
    route,
  ).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  });
}

/**
 * enter_arena_event(p_arena_event_id) — Arena Entry実行
 * 認証済みユーザーのみ呼べる
 * Entry後キャンセル不可
 */
export async function enterArenaEvent(
  eventId: string
): Promise<EnterArenaEventResult> {
  const startMs = performance.now();
  const route = _arenaRoute;
  const { data, error } = await supabase.rpc('enter_arena_event', {
    p_arena_event_id: eventId,
  });
  _trackRpcResult('enter_arena_event', route, !!error, startMs);
  if (error) {
    // Supabase RPC error — try to extract reason from message
    const msg = error.message ?? 'unknown_error';
    // Map known error messages to reason strings
    const reasonMap: Record<string, string> = {
      'not authenticated': 'not_authenticated',
      'not_authenticated': 'not_authenticated',
      'event not found': 'event_not_found',
      'event_not_found': 'event_not_found',
      'event not open': 'event_not_open',
      'event_not_open': 'event_not_open',
      'entry deadline passed': 'entry_deadline_passed',
      'entry_deadline_passed': 'entry_deadline_passed',
      'no profile': 'no_profile',
      'no_profile': 'no_profile',
      'pro required': 'pro_required',
      'pro_required': 'pro_required',
      'already entered': 'already_entered',
      'already_entered': 'already_entered',
      'previous results pending': 'previous_results_pending',
      'previous_results_pending': 'previous_results_pending',
    };
    const lc = msg.toLowerCase();
    let reason = 'unknown_error';
    for (const [key, val] of Object.entries(reasonMap)) {
      if (lc.includes(key)) { reason = val; break; }
    }
    return { ok: false, reason, raw: msg };
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, reason: 'unexpected_response' };
  }
  const d = data as Record<string, unknown>;
  if (d['ok'] === false || d['error'] || d['reason']) {
    return {
      ok: false,
      reason: (d['reason'] as string) ?? (d['error'] as string) ?? 'unknown_error',
      ...d,
    };
  }
  return {
    ok: true,
    entry_id: d['entry_id'] as string | undefined,
    arena_event_id: d['arena_event_id'] as string | undefined,
    entered_at: d['entered_at'] as string | undefined,
  };
}

// ─── Arena titles type ─────────────────────────────────────────────────────────

export interface ArenaTitle {
  arena_id: string;
  arena_code: string;
  title_name: string;
  status: 'official';
  started_at: string;
}

/**
 * get_my_arena_titles() — 自分が現在保持しているArena称号一覧
 * authenticated専用。未ログイン時は空配列を返す。
 */
export async function getMyArenaTitles(): Promise<ArenaTitle[]> {
  const startMs = performance.now();
  const route = _arenaRoute;
  const { data, error } = await supabase.rpc('get_my_arena_titles');
  _trackRpcResult('get_my_arena_titles', route, !!error, startMs);
  if (error) {
    console.warn('[arena] get_my_arena_titles error:', error.message);
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data as ArenaTitle[];
}
