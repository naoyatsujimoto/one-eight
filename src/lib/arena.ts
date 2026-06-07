/**
 * arena.ts — Official Arena read-only client functions
 *
 * Phase E-1: read display only (no entry execution)
 * RPC wrappers for get_arena_overview / get_arena_detail
 */

import { supabase } from './supabase';

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
  // Rankings and history
  top_ranking: ArenaRankingRow[];
  recent_match_history: ArenaMatchHistoryRow[];
  recent_master_history: ArenaMasterHistoryRow[];
}

// ─── API wrappers ──────────────────────────────────────────────────────────────

/**
 * get_arena_overview() — Arena一覧取得
 * anon/authenticated どちらも呼べる
 */
export async function getArenaOverview(): Promise<
  ArenaOverviewItem[] | { error: string }
> {
  const { data, error } = await supabase.rpc('get_arena_overview');
  if (error) {
    return { error: error.message };
  }
  // RPC returns JSONB — supabase-js returns it parsed already
  if (!Array.isArray(data)) {
    return { error: 'Unexpected response format' };
  }
  return data as ArenaOverviewItem[];
}

/**
 * get_arena_detail(p_arena_id) — Arena詳細取得
 * anon/authenticated どちらも呼べる
 */
export async function getArenaDetail(
  arenaId: string
): Promise<ArenaDetailData | { error: string }> {
  const { data, error } = await supabase.rpc('get_arena_detail', {
    p_arena_id: arenaId,
  });
  if (error) {
    return { error: error.message };
  }
  if (!data || typeof data !== 'object') {
    return { error: 'Unexpected response format' };
  }
  const d = data as Record<string, unknown>;
  if (d['error']) {
    return { error: d['error'] as string };
  }
  return data as unknown as ArenaDetailData;
}
