/**
 * kpiAdmin.ts — KPI Admin RPC 呼び出し関数と型定義
 *
 * Phase 4-C: Admin KPI Dashboard 用
 * 既存RPCをimportして呼び出すだけ。DB schema・RPC・migration変更なし。
 */

import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// 共通パラメータ
// ---------------------------------------------------------------------------

export interface KpiAdminParams {
  p_from: string;     // ISO8601
  p_to: string;       // ISO8601
  p_timezone: string; // e.g. 'Asia/Tokyo'
  p_include_internal: boolean;
}

// ---------------------------------------------------------------------------
// 安全な数値変換ヘルパー
// ---------------------------------------------------------------------------

/** Supabaseから返るnumber/string/nullをnumberまたはnullに変換 */
export function safeNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/** safeNum の結果を表示文字列に変換（null → "—", 0 → "0"） */
export function fmtNum(v: unknown): string {
  const n = safeNum(v);
  if (n === null) return '—';
  return n.toLocaleString();
}

/** パーセント表示（小数1桁） — RPCはすでに0〜100の百分率で返すため100倍しない */
export function fmtPct(v: unknown): string {
  const n = safeNum(v);
  if (n === null) return '—';
  return `${n.toFixed(1)}%`;
}

/** 小数表示（小数2桁） */
export function fmtDec(v: unknown, digits = 2): string {
  const n = safeNum(v);
  if (n === null) return '—';
  return n.toFixed(digits);
}

// ---------------------------------------------------------------------------
// 1. admin_get_kpi_acquisition_auth_summary
// ---------------------------------------------------------------------------

export interface KpiAcquisitionAuthSummaryRow {
  login_page_views: unknown;
  unique_visitors: unknown;
  sessions: unknown;
  registrations: unknown;
  current_free_users: unknown;
  current_active_pro_users: unknown;
  auth_success_rate: unknown;
  auth_started: unknown;
  auth_succeeded: unknown;
  auth_failed: unknown;
  pro_started: unknown;
  pro_canceled: unknown;
  renewal_succeeded: unknown;
  renewal_failed: unknown;
  is_reference_period: unknown;
}

export async function adminGetKpiAcquisitionAuthSummary(params: KpiAdminParams) {
  return supabase.rpc('admin_get_kpi_acquisition_auth_summary', {
    p_from: params.p_from,
    p_to: params.p_to,
    p_timezone: params.p_timezone,
    p_include_internal: params.p_include_internal,
  });
}

// ---------------------------------------------------------------------------
// 2. admin_get_kpi_match_summary
// ---------------------------------------------------------------------------

export interface KpiMatchSummaryRow {
  total_matches: unknown;
  unique_players: unknown;
  completed_matches: unknown;
  completion_rate: unknown;
  cpu_matches: unknown;
  offline_pvp_matches: unknown;
  online_casual_matches: unknown;
  official_standalone_matches: unknown;
  arena_matches_count: unknown;
  normal_end_count: unknown;
  timeout_count: unknown;
  resign_count: unknown;
  draw_count: unknown;
  forfeit_count: unknown;
  no_contest_count: unknown;
  is_reference_period: unknown;
}

export async function adminGetKpiMatchSummary(params: KpiAdminParams) {
  return supabase.rpc('admin_get_kpi_match_summary', {
    p_from: params.p_from,
    p_to: params.p_to,
    p_timezone: params.p_timezone,
    p_include_internal: params.p_include_internal,
  });
}

// ---------------------------------------------------------------------------
// 3. admin_get_kpi_match_daily
// ---------------------------------------------------------------------------

export interface KpiMatchDailyRow {
  day: unknown;
  total_matches: unknown;
  cpu_matches: unknown;
  offline_pvp_matches: unknown;
  online_casual_matches: unknown;
  official_standalone_matches: unknown;
  arena_matches_count: unknown;
}

export async function adminGetKpiMatchDaily(params: KpiAdminParams) {
  return supabase.rpc('admin_get_kpi_match_daily', {
    p_from: params.p_from,
    p_to: params.p_to,
    p_timezone: params.p_timezone,
    p_include_internal: params.p_include_internal,
  });
}

// ---------------------------------------------------------------------------
// 4. admin_get_kpi_arena_funnel
// ---------------------------------------------------------------------------

export interface KpiArenaFunnelRow {
  arena_code: unknown;
  arena_event_id: unknown;
  scheduled_at: unknown;
  entries: unknown;
  unique_entrants: unknown;
  matched_users: unknown;
  assigned_matches: unknown;
  started_matches: unknown;
  completed_matches: unknown;
  no_show_matches: unknown;
  no_contest_matches: unknown;
  entry_to_match_rate: unknown;
  match_completion_rate: unknown;
  no_show_rate: unknown;
}

export async function adminGetKpiArenaFunnel(params: KpiAdminParams) {
  return supabase.rpc('admin_get_kpi_arena_funnel', {
    p_from: params.p_from,
    p_to: params.p_to,
    p_timezone: params.p_timezone,
    p_include_internal: params.p_include_internal,
  });
}

// ---------------------------------------------------------------------------
// 5. admin_get_kpi_postmortem_summary
// ---------------------------------------------------------------------------

export interface KpiPostmortemSummaryRow {
  started: unknown;
  completed: unknown;
  failed: unknown;
  completion_rate: unknown;
  failure_rate: unknown;
  average_elapsed_seconds: unknown;
  median_elapsed_seconds: unknown;
  p95_elapsed_seconds: unknown;
  refreshed: unknown;
  candidates_opened: unknown;
  online_mode_count: unknown;
  official_mode_count: unknown;
  arena_mode_count: unknown;
  cpu_mode_count: unknown;
  unknown_mode_count: unknown;
  rpc_error_count: unknown;
  worker_error_count: unknown;
  parse_error_count: unknown;
  unknown_error_count: unknown;
  is_reference_period: unknown;
}

export async function adminGetKpiPostmortemSummary(params: KpiAdminParams) {
  return supabase.rpc('admin_get_kpi_postmortem_summary', {
    p_from: params.p_from,
    p_to: params.p_to,
    p_timezone: params.p_timezone,
    p_include_internal: params.p_include_internal,
  });
}

// ---------------------------------------------------------------------------
// 6. admin_get_kpi_system_health_summary
// ---------------------------------------------------------------------------

export interface KpiSystemHealthSummaryRow {
  sessions: unknown;
  frontend_errors: unknown;
  frontend_errors_per_100_sessions: unknown;
  rpc_calls: unknown;
  rpc_errors: unknown;
  rpc_error_rate: unknown;
  realtime_reconnections: unknown;
  rpc_stats: unknown;
  performance_stats: unknown;
  is_reference_period: unknown;
}

export async function adminGetKpiSystemHealthSummary(params: KpiAdminParams) {
  return supabase.rpc('admin_get_kpi_system_health_summary', {
    p_from: params.p_from,
    p_to: params.p_to,
    p_timezone: params.p_timezone,
    p_include_internal: params.p_include_internal,
  });
}

// ---------------------------------------------------------------------------
// 7. admin_get_kpi_training_summary
// ---------------------------------------------------------------------------

export interface KpiTrainingSummaryRow {
  started_runs: unknown;
  unique_starters: unknown;
  cohort_completed_runs: unknown;
  cohort_completion_rate: unknown;
  abandoned_runs: unknown;
  abandonment_rate: unknown;
  attempt_events: unknown;
  incorrect_attempts: unknown;
  hinted_runs: unknown;
  full_game_started_runs: unknown;
  full_game_completed_runs: unknown;
  individual_started_runs: unknown;
  individual_completed_runs: unknown;
  is_reference_period: unknown;
}

export async function adminGetKpiTrainingSummary(params: KpiAdminParams) {
  return supabase.rpc('admin_get_kpi_training_summary', {
    p_from: params.p_from,
    p_to: params.p_to,
    p_timezone: params.p_timezone,
    p_include_internal: params.p_include_internal,
  });
}

// ---------------------------------------------------------------------------
// 8. admin_get_kpi_training_task_summary
// ---------------------------------------------------------------------------

export interface KpiTrainingTaskSummaryRow {
  task_id: unknown;
  training_kind: unknown;
  started_runs: unknown;
  cohort_completed_runs: unknown;
  completion_rate: unknown;
  abandoned_runs: unknown;
  abandonment_rate: unknown;
  attempt_events: unknown;
  incorrect_attempts: unknown;
  hinted_runs: unknown;
}

export async function adminGetKpiTrainingTaskSummary(params: KpiAdminParams) {
  return supabase.rpc('admin_get_kpi_training_task_summary', {
    p_from: params.p_from,
    p_to: params.p_to,
    p_timezone: params.p_timezone,
    p_include_internal: params.p_include_internal,
  });
}

// ---------------------------------------------------------------------------
// 9. admin_get_kpi_training_step_funnel
// ---------------------------------------------------------------------------

export interface KpiTrainingStepFunnelRow {
  task_id: unknown;
  step: unknown;
  move_id: unknown;
  move_index: unknown;
  total_steps: unknown;
  reached_runs: unknown;
  continued_or_completed_runs: unknown;
  abandoned_runs_at_step: unknown;
  progression_rate: unknown;
  share_of_task_abandonments: unknown;
}

export async function adminGetKpiTrainingStepFunnel(params: KpiAdminParams) {
  return supabase.rpc('admin_get_kpi_training_step_funnel', {
    p_from: params.p_from,
    p_to: params.p_to,
    p_timezone: params.p_timezone,
    p_include_internal: params.p_include_internal,
  });
}

// ---------------------------------------------------------------------------
// 10. admin_get_kpi_training_daily
// ---------------------------------------------------------------------------

export interface KpiTrainingDailyRow {
  day: unknown;
  started_runs: unknown;
  completion_events: unknown;
  abandoned_runs: unknown;
}

export async function adminGetKpiTrainingDaily(params: KpiAdminParams) {
  return supabase.rpc('admin_get_kpi_training_daily', {
    p_from: params.p_from,
    p_to: params.p_to,
    p_timezone: params.p_timezone,
    p_include_internal: params.p_include_internal,
  });
}

// ---------------------------------------------------------------------------
// 11. admin_get_kpi_settings
// ---------------------------------------------------------------------------

export interface KpiSettingsRow {
  official_kpi_start_at: unknown;
}

export async function adminGetKpiSettings() {
  return supabase.rpc('admin_get_kpi_settings');
}

// ---------------------------------------------------------------------------
// 12. admin_get_kpi_oej_summary
// ---------------------------------------------------------------------------

export interface KpiOejSummaryRow {
  list_views:                 unknown;
  article_opens:              unknown;
  unique_readers:             unknown;
  sessions:                   unknown;
  impressions:                unknown;
  engagement_events:          unknown;
  completed_reads:            unknown;
  completion_rate:            unknown;
  average_active_seconds:     unknown;
  median_active_seconds:      unknown;
  average_max_scroll_percent: unknown;
  game_cta_clicks:            unknown;
  game_cta_rate:              unknown;
  reference_clicks:           unknown;
  load_failures:              unknown;
  fallback_opens:             unknown;
  fallback_rate:              unknown;
  is_reference_period:        unknown;
  effective_from:             unknown;
  effective_to:               unknown;
}

export async function adminGetKpiOejSummary(params: KpiAdminParams) {
  return supabase.rpc('admin_get_kpi_oej_summary', {
    p_from: params.p_from,
    p_to: params.p_to,
    p_timezone: params.p_timezone,
    p_include_internal: params.p_include_internal,
  });
}

// ---------------------------------------------------------------------------
// 13. admin_get_kpi_oej_article_summary
// ---------------------------------------------------------------------------

export interface KpiOejArticleSummaryRow {
  article_slug:               unknown;
  article_opens:              unknown;
  unique_readers:             unknown;
  impressions:                unknown;
  list_to_open_rate:          unknown;
  engagement_events:          unknown;
  completed_reads:            unknown;
  completion_rate:            unknown;
  average_active_seconds:     unknown;
  median_active_seconds:      unknown;
  average_max_scroll_percent: unknown;
  reference_clicks:           unknown;
  game_cta_clicks:            unknown;
  game_cta_rate:              unknown;
  fallback_opens:             unknown;
  load_failures:              unknown;
}

export async function adminGetKpiOejArticleSummary(params: KpiAdminParams) {
  return supabase.rpc('admin_get_kpi_oej_article_summary', {
    p_from: params.p_from,
    p_to: params.p_to,
    p_timezone: params.p_timezone,
    p_include_internal: params.p_include_internal,
  });
}

// ---------------------------------------------------------------------------
// 14. admin_get_kpi_oej_source_summary
// ---------------------------------------------------------------------------

export interface KpiOejSourceSummaryRow {
  traffic_source:        unknown;
  list_views:            unknown;
  article_opens:         unknown;
  unique_readers:        unknown;
  sessions:              unknown;
  engagement_events:     unknown;
  completed_reads:       unknown;
  completion_rate:       unknown;
  average_active_seconds:unknown;
  game_cta_clicks:       unknown;
  game_cta_rate:         unknown;
}

export async function adminGetKpiOejSourceSummary(params: KpiAdminParams) {
  return supabase.rpc('admin_get_kpi_oej_source_summary', {
    p_from: params.p_from,
    p_to: params.p_to,
    p_timezone: params.p_timezone,
    p_include_internal: params.p_include_internal,
  });
}

// ---------------------------------------------------------------------------
// 15. admin_get_kpi_oej_daily
// ---------------------------------------------------------------------------

export interface KpiOejDailyRow {
  day:                     unknown;
  list_views:              unknown;
  article_opens:           unknown;
  unique_readers:          unknown;
  sessions:                unknown;
  engagement_events:       unknown;
  completed_reads:         unknown;
  completion_rate:         unknown;
  game_cta_clicks:         unknown;
  reference_clicks:        unknown;
  load_failures:           unknown;
  x_article_opens:         unknown;
  instagram_article_opens: unknown;
}

export async function adminGetKpiOejDaily(params: KpiAdminParams) {
  return supabase.rpc('admin_get_kpi_oej_daily', {
    p_from: params.p_from,
    p_to: params.p_to,
    p_timezone: params.p_timezone,
    p_include_internal: params.p_include_internal,
  });
}

// ---------------------------------------------------------------------------
// 16. admin_get_kpi_oej_attribution
// ---------------------------------------------------------------------------

export interface KpiOejAttributionRow {
  dimension_type:             unknown;
  dimension_value:            unknown;
  auth_started:               unknown;
  registrations:              unknown;
  unique_auth_users:          unknown;
  unique_registered_users:    unknown;
  auth_to_registration_rate:  unknown;
  attributed_auth_started:    unknown;
  attributed_registrations:   unknown;
  unattributed_auth_started:  unknown;
  unattributed_registrations: unknown;
  is_reference_period:        unknown;
  effective_from:             unknown;
  effective_to:               unknown;
}

export async function adminGetKpiOejAttribution(params: KpiAdminParams) {
  return supabase.rpc('admin_get_kpi_oej_attribution', {
    p_from: params.p_from,
    p_to: params.p_to,
    p_timezone: params.p_timezone,
    p_include_internal: params.p_include_internal,
  });
}

// ---------------------------------------------------------------------------
// ダッシュボード全RPCを一括取得
// ---------------------------------------------------------------------------

export interface KpiDashboardData {
  acquisitionAuth: KpiAcquisitionAuthSummaryRow | null;
  matchSummary: KpiMatchSummaryRow | null;
  matchDaily: KpiMatchDailyRow[];
  arenaFunnel: KpiArenaFunnelRow[];
  postmortem: KpiPostmortemSummaryRow | null;
  systemHealth: KpiSystemHealthSummaryRow | null;
  trainingSummary: KpiTrainingSummaryRow | null;
  trainingTaskSummary: KpiTrainingTaskSummaryRow[];
  trainingStepFunnel: KpiTrainingStepFunnelRow[];
  trainingDaily: KpiTrainingDailyRow[];
  settings: KpiSettingsRow | null;
  oejSummary: KpiOejSummaryRow | null;
  oejArticle: KpiOejArticleSummaryRow[];
  oejSource: KpiOejSourceSummaryRow[];
  oejDaily: KpiOejDailyRow[];
  oejAttribution: KpiOejAttributionRow[];
}

export interface KpiDashboardSectionError {
  acquisitionAuth?: string;
  matchSummary?: string;
  matchDaily?: string;
  arenaFunnel?: string;
  postmortem?: string;
  systemHealth?: string;
  trainingSummary?: string;
  trainingTaskSummary?: string;
  trainingStepFunnel?: string;
  trainingDaily?: string;
  settings?: string;
  oejSummary?: string;
  oejArticle?: string;
  oejSource?: string;
  oejDaily?: string;
  oejAttribution?: string;
}

export async function fetchKpiDashboard(params: KpiAdminParams): Promise<{
  data: KpiDashboardData;
  errors: KpiDashboardSectionError;
}> {
  const [
    r_settings,
    r_acq,
    r_matchSummary,
    r_matchDaily,
    r_arenaFunnel,
    r_postmortem,
    r_systemHealth,
    r_trainingSummary,
    r_trainingTaskSummary,
    r_trainingStepFunnel,
    r_trainingDaily,
    r_oejSummary,
    r_oejArticle,
    r_oejSource,
    r_oejDaily,
    r_oejAttribution,
  ] = await Promise.allSettled([
    adminGetKpiSettings(),
    adminGetKpiAcquisitionAuthSummary(params),
    adminGetKpiMatchSummary(params),
    adminGetKpiMatchDaily(params),
    adminGetKpiArenaFunnel(params),
    adminGetKpiPostmortemSummary(params),
    adminGetKpiSystemHealthSummary(params),
    adminGetKpiTrainingSummary(params),
    adminGetKpiTrainingTaskSummary(params),
    adminGetKpiTrainingStepFunnel(params),
    adminGetKpiTrainingDaily(params),
    adminGetKpiOejSummary(params),
    adminGetKpiOejArticleSummary(params),
    adminGetKpiOejSourceSummary(params),
    adminGetKpiOejDaily(params),
    adminGetKpiOejAttribution(params),
  ]);

  const errors: KpiDashboardSectionError = {};

  function extractJsonb<T>(
    result: PromiseSettledResult<{ data: T | null; error: unknown }>,
    key: keyof KpiDashboardSectionError,
  ): T | null {
    if (result.status === 'rejected') {
      errors[key] = String(result.reason);
      return null;
    }
    if (result.value.error) {
      errors[key] = String((result.value.error as { message?: string }).message ?? result.value.error);
      return null;
    }
    return result.value.data ?? null;
  }

  function extractSingle<T>(
    result: PromiseSettledResult<{ data: T[] | null; error: unknown }>,
    key: keyof KpiDashboardSectionError,
  ): T | null {
    if (result.status === 'rejected') {
      errors[key] = String(result.reason);
      return null;
    }
    if (result.value.error) {
      errors[key] = String((result.value.error as { message?: string }).message ?? result.value.error);
      return null;
    }
    const rows = result.value.data;
    if (!rows || rows.length === 0) return null;
    return rows[0] ?? null;
  }

  function extractArray<T>(
    result: PromiseSettledResult<{ data: T[] | null; error: unknown }>,
    key: keyof KpiDashboardSectionError,
  ): T[] {
    if (result.status === 'rejected') {
      errors[key] = String(result.reason);
      return [];
    }
    if (result.value.error) {
      errors[key] = String((result.value.error as { message?: string }).message ?? result.value.error);
      return [];
    }
    return result.value.data ?? [];
  }

  return {
    data: {
      settings: extractJsonb<KpiSettingsRow>(
        r_settings as PromiseSettledResult<{ data: KpiSettingsRow | null; error: unknown }>,
        'settings',
      ),
      acquisitionAuth: extractJsonb<KpiAcquisitionAuthSummaryRow>(
        r_acq as PromiseSettledResult<{ data: KpiAcquisitionAuthSummaryRow | null; error: unknown }>,
        'acquisitionAuth',
      ),
      matchSummary: extractSingle<KpiMatchSummaryRow>(
        r_matchSummary as PromiseSettledResult<{ data: KpiMatchSummaryRow[] | null; error: unknown }>,
        'matchSummary',
      ),
      matchDaily: extractArray<KpiMatchDailyRow>(
        r_matchDaily as PromiseSettledResult<{ data: KpiMatchDailyRow[] | null; error: unknown }>,
        'matchDaily',
      ),
      arenaFunnel: extractArray<KpiArenaFunnelRow>(
        r_arenaFunnel as PromiseSettledResult<{ data: KpiArenaFunnelRow[] | null; error: unknown }>,
        'arenaFunnel',
      ),
      postmortem: extractSingle<KpiPostmortemSummaryRow>(
        r_postmortem as PromiseSettledResult<{ data: KpiPostmortemSummaryRow[] | null; error: unknown }>,
        'postmortem',
      ),
      systemHealth: extractSingle<KpiSystemHealthSummaryRow>(
        r_systemHealth as PromiseSettledResult<{ data: KpiSystemHealthSummaryRow[] | null; error: unknown }>,
        'systemHealth',
      ),
      trainingSummary: extractSingle<KpiTrainingSummaryRow>(
        r_trainingSummary as PromiseSettledResult<{ data: KpiTrainingSummaryRow[] | null; error: unknown }>,
        'trainingSummary',
      ),
      trainingTaskSummary: extractArray<KpiTrainingTaskSummaryRow>(
        r_trainingTaskSummary as PromiseSettledResult<{ data: KpiTrainingTaskSummaryRow[] | null; error: unknown }>,
        'trainingTaskSummary',
      ),
      trainingStepFunnel: extractArray<KpiTrainingStepFunnelRow>(
        r_trainingStepFunnel as PromiseSettledResult<{ data: KpiTrainingStepFunnelRow[] | null; error: unknown }>,
        'trainingStepFunnel',
      ),
      trainingDaily: extractArray<KpiTrainingDailyRow>(
        r_trainingDaily as PromiseSettledResult<{ data: KpiTrainingDailyRow[] | null; error: unknown }>,
        'trainingDaily',
      ),
      oejSummary: extractSingle<KpiOejSummaryRow>(
        r_oejSummary as PromiseSettledResult<{ data: KpiOejSummaryRow[] | null; error: unknown }>,
        'oejSummary',
      ),
      oejArticle: extractArray<KpiOejArticleSummaryRow>(
        r_oejArticle as PromiseSettledResult<{ data: KpiOejArticleSummaryRow[] | null; error: unknown }>,
        'oejArticle',
      ),
      oejSource: extractArray<KpiOejSourceSummaryRow>(
        r_oejSource as PromiseSettledResult<{ data: KpiOejSourceSummaryRow[] | null; error: unknown }>,
        'oejSource',
      ),
      oejDaily: extractArray<KpiOejDailyRow>(
        r_oejDaily as PromiseSettledResult<{ data: KpiOejDailyRow[] | null; error: unknown }>,
        'oejDaily',
      ),
      oejAttribution: extractArray<KpiOejAttributionRow>(
        r_oejAttribution as PromiseSettledResult<{ data: KpiOejAttributionRow[] | null; error: unknown }>,
        'oejAttribution',
      ),
    },
    errors,
  };
}
