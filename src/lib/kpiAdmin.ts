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
  p_tz: string;       // e.g. 'Asia/Tokyo'
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

/** パーセント表示（小数1桁） */
export function fmtPct(v: unknown): string {
  const n = safeNum(v);
  if (n === null) return '—';
  return `${(n * 100).toFixed(1)}%`;
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
    p_tz: params.p_tz,
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
  official_matches: unknown;
  arena_matches: unknown;
  end_normal: unknown;
  end_timeout: unknown;
  end_resign: unknown;
  end_draw: unknown;
  end_forfeit: unknown;
  end_no_contest: unknown;
  is_reference_period: unknown;
}

export async function adminGetKpiMatchSummary(params: KpiAdminParams) {
  return supabase.rpc('admin_get_kpi_match_summary', {
    p_from: params.p_from,
    p_to: params.p_to,
    p_tz: params.p_tz,
    p_include_internal: params.p_include_internal,
  });
}

// ---------------------------------------------------------------------------
// 3. admin_get_kpi_match_daily
// ---------------------------------------------------------------------------

export interface KpiMatchDailyRow {
  day: unknown;
  matches: unknown;
  completed: unknown;
  players: unknown;
}

export async function adminGetKpiMatchDaily(params: KpiAdminParams) {
  return supabase.rpc('admin_get_kpi_match_daily', {
    p_from: params.p_from,
    p_to: params.p_to,
    p_tz: params.p_tz,
    p_include_internal: params.p_include_internal,
  });
}

// ---------------------------------------------------------------------------
// 4. admin_get_kpi_arena_funnel
// ---------------------------------------------------------------------------

export interface KpiArenaFunnelRow {
  arena_id: unknown;
  arena_code: unknown;
  scheduled_at: unknown;
  entries: unknown;
  unique_entrants: unknown;
  matched_users: unknown;
  started: unknown;
  completed: unknown;
  entry_to_match_rate: unknown;
  completion_rate: unknown;
  no_show_rate: unknown;
}

export async function adminGetKpiArenaFunnel(params: KpiAdminParams) {
  return supabase.rpc('admin_get_kpi_arena_funnel', {
    p_from: params.p_from,
    p_to: params.p_to,
    p_tz: params.p_tz,
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
  mode_counts: unknown;
  error_counts: unknown;
  is_reference_period: unknown;
}

export async function adminGetKpiPostmortemSummary(params: KpiAdminParams) {
  return supabase.rpc('admin_get_kpi_postmortem_summary', {
    p_from: params.p_from,
    p_to: params.p_to,
    p_tz: params.p_tz,
    p_include_internal: params.p_include_internal,
  });
}

// ---------------------------------------------------------------------------
// 6. admin_get_kpi_system_health_summary
// ---------------------------------------------------------------------------

export interface KpiSystemHealthSummaryRow {
  sessions: unknown;
  frontend_errors: unknown;
  errors_per_100_sessions: unknown;
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
    p_tz: params.p_tz,
    p_include_internal: params.p_include_internal,
  });
}

// ---------------------------------------------------------------------------
// 7. admin_get_kpi_training_summary
// ---------------------------------------------------------------------------

export interface KpiTrainingSummaryRow {
  started_runs: unknown;
  unique_starters: unknown;
  completed_runs: unknown;
  completion_rate: unknown;
  abandoned_runs: unknown;
  abandonment_rate: unknown;
  attempt_events: unknown;
  incorrect_attempts: unknown;
  hint_users: unknown;
  full_game_started: unknown;
  full_game_completed: unknown;
  individual_started: unknown;
  individual_completed: unknown;
  is_reference_period: unknown;
}

export async function adminGetKpiTrainingSummary(params: KpiAdminParams) {
  return supabase.rpc('admin_get_kpi_training_summary', {
    p_from: params.p_from,
    p_to: params.p_to,
    p_tz: params.p_tz,
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
  completed_runs: unknown;
  completion_rate: unknown;
  abandoned_runs: unknown;
  abandonment_rate: unknown;
  attempt_events: unknown;
  incorrect_attempts: unknown;
  hint_users: unknown;
}

export async function adminGetKpiTrainingTaskSummary(params: KpiAdminParams) {
  return supabase.rpc('admin_get_kpi_training_task_summary', {
    p_from: params.p_from,
    p_to: params.p_to,
    p_tz: params.p_tz,
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
  advanced_or_completed_runs: unknown;
  abandoned_runs_at_step: unknown;
  progression_rate: unknown;
  share_of_task_abandonments: unknown;
}

export async function adminGetKpiTrainingStepFunnel(params: KpiAdminParams) {
  return supabase.rpc('admin_get_kpi_training_step_funnel', {
    p_from: params.p_from,
    p_to: params.p_to,
    p_tz: params.p_tz,
    p_include_internal: params.p_include_internal,
  });
}

// ---------------------------------------------------------------------------
// 10. admin_get_kpi_training_daily
// ---------------------------------------------------------------------------

export interface KpiTrainingDailyRow {
  day: unknown;
  started_runs: unknown;
  completed_runs: unknown;
  abandoned_runs: unknown;
}

export async function adminGetKpiTrainingDaily(params: KpiAdminParams) {
  return supabase.rpc('admin_get_kpi_training_daily', {
    p_from: params.p_from,
    p_to: params.p_to,
    p_tz: params.p_tz,
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
  ]);

  const errors: KpiDashboardSectionError = {};

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

  function extractSettingsSingle(
    result: PromiseSettledResult<{ data: KpiSettingsRow[] | null; error: unknown }>,
  ): KpiSettingsRow | null {
    if (result.status === 'rejected') {
      errors['settings'] = String(result.reason);
      return null;
    }
    if (result.value.error) {
      errors['settings'] = String((result.value.error as { message?: string }).message ?? result.value.error);
      return null;
    }
    const rows = result.value.data;
    if (!rows || rows.length === 0) return null;
    return rows[0] ?? null;
  }

  return {
    data: {
      settings: extractSettingsSingle(r_settings as PromiseSettledResult<{ data: KpiSettingsRow[] | null; error: unknown }>),
      acquisitionAuth: extractSingle<KpiAcquisitionAuthSummaryRow>(
        r_acq as PromiseSettledResult<{ data: KpiAcquisitionAuthSummaryRow[] | null; error: unknown }>,
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
    },
    errors,
  };
}
