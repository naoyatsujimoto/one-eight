/**
 * prizeAdmin.ts — Admin Prize Award RPC wrappers
 *
 * 全 RPC は SECURITY DEFINER + is_admin 再確認。
 * フロントの is_admin フラグは UI 表示補助にすぎない。
 *
 * RP-3 追加:
 *   adminGetPrizeSubmissionForPrint — Winner File 印刷用データ取得
 *   adminMarkPrizeSubmissionArchived — archive 完了・機微情報削除
 *
 * RP-5a 追加:
 *   adminListPayableAwards — Payment Dashboard 一覧（PIIなし）
 *   adminGetPayoutDetail — 支払詳細確認（legal_name / paypal_email を含む）
 *
 * ⚠️ RP-5a は read-only。Prepare / Paid / Failed / Cancel / Retry は RP-5b 以降。
 */
import { supabase } from './supabase';

// ── Types ────────────────────────────────────────────────────────────────────

export type SourceKind = 'arena_master' | 'tournament' | 'manual_admin' | 'other';
export type PrizeKind  = 'cash' | 'merchandise' | 'title_only';
export type AwardStatus = 'pending' | 'eligible' | 'on_hold' | 'canceled' | 'expired';

export interface AdminPrizeAwardRow {
  award_id:               string;
  recipient_user_id:      string;
  recipient_display_name: string | null;
  source_kind:            string | null;
  source_arena_event_id:  string | null;
  source_arena_match_id:  string | null;
  amount_cents:           number;
  currency:               string;
  prize_kind:             string | null;
  award_status:           string;
  latest_payout_status:   string | null;
  notes:                  string | null;
  hold_reason:            string | null;
  cancel_reason:          string | null;
  canceled_at:            string | null;
  created_by_user_id:     string | null;
  created_at:             string;
  // RP-4 追加: latest submission 情報（PIIなし）
  latest_submission_id:              string | null;
  latest_submission_status:          string | null;
  latest_submission_submitted_at:    string | null;
  latest_submission_delete_after:    string | null;
  latest_submission_data_cleared_at: string | null;
}

export interface CreateAwardParams {
  recipient_user_id:      string;
  source_kind:            SourceKind;
  amount_cents:           number;
  currency:               string;
  source_arena_id?:       string | null;
  source_arena_event_id?: string | null;
  source_arena_match_id?: string | null;
  prize_kind?:            PrizeKind;
  notes?:                 string | null;
}

// ── RPC wrappers ─────────────────────────────────────────────────────────────

/**
 * admin_create_prize_award
 * 成功時は作成した prize_awards の jsonb を返す。
 */
export async function adminCreatePrizeAward(
  params: CreateAwardParams,
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_create_prize_award', {
    p_recipient_user_id:     params.recipient_user_id,
    p_source_kind:           params.source_kind,
    p_amount_cents:          params.amount_cents,
    p_currency:              params.currency,
    p_source_arena_id:       params.source_arena_id ?? null,
    p_source_arena_event_id: params.source_arena_event_id ?? null,
    p_source_arena_match_id: params.source_arena_match_id ?? null,
    p_prize_kind:            params.prize_kind ?? 'cash',
    p_notes:                 params.notes ?? null,
  });
  if (error) return { data: null, error: error.message };
  return { data: data as Record<string, unknown>, error: null };
}

/**
 * admin_update_prize_award_status
 * 許可 status: eligible / on_hold / canceled
 */
export async function adminUpdatePrizeAwardStatus(
  awardId: string,
  status: 'eligible' | 'on_hold' | 'canceled',
  reason?: string | null,
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_update_prize_award_status', {
    p_award_id: awardId,
    p_status:   status,
    p_reason:   reason ?? null,
  });
  if (error) return { data: null, error: error.message };
  return { data: data as Record<string, unknown>, error: null };
}

/**
 * admin_list_prize_awards
 * 直近 100 件を降順で返す。
 */
export async function adminListPrizeAwards(): Promise<{
  data: AdminPrizeAwardRow[] | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('admin_list_prize_awards');
  if (error) return { data: null, error: error.message };
  return { data: data as AdminPrizeAwardRow[], error: null };
}

// ── RP-3: Winner File 印刷 / Archive 完了 ────────────────────────────────────

export interface PrintSubmissionResult {
  submission_id:         string;
  award_id:              string;
  recipient_user_id:     string;
  submission_status:     string;
  /** 機微情報を含む。Console log 禁止。 */
  submission_data:       Record<string, unknown> | null;
  submitted_at:          string | null;
  delete_after:          string | null;
  archived_at:           string | null;
  data_cleared_at:       string | null;
  // award
  amount_cents:          number;
  currency:              string;
  source_kind:           string | null;
  source_arena_event_id: string | null;
  source_arena_match_id: string | null;
  prize_kind:            string | null;
  award_status:          string;
}

export interface ArchiveResult {
  success:         boolean;
  submission_id:   string;
  award_id:        string;
  status:          string;
  data_cleared_at: string;
  archived_at:     string;
}

// ── RP-5a: Payment Dashboard ─────────────────────────────────────────────────

/**
 * admin_list_payable_awards の戻り値型（PII を含まない）
 */
export interface PayableAwardRow {
  award_id:                          string;
  recipient_user_id:                 string;
  recipient_display_name:            string | null;
  source_kind:                       string | null;
  source_arena_id:                   string | null;
  source_arena_event_id:             string | null;
  source_arena_match_id:             string | null;
  amount_cents:                      number;
  currency:                          string;
  prize_kind:                        string | null;
  award_status:                      string;
  latest_submission_id:              string | null;
  latest_submission_status:          string | null;
  latest_submission_submitted_at:    string | null;
  latest_submission_delete_after:    string | null;
  latest_submission_data_cleared_at: string | null;
  latest_payout_id:                  string | null;
  latest_payout_status:              string | null;
  latest_payout_paid_at:             string | null;
  created_at:                        string;
  display_label:                     string;
}

/**
 * admin_get_payout_detail の戻り値型
 * ⚠️ legal_name / paypal_email を含む。Console log 禁止。localStorage 禁止。URL 禁止。
 */
export interface PayoutDetailResult {
  // award
  award_id:                       string;
  recipient_user_id:              string;
  amount_cents:                   number;
  currency:                       string;
  prize_kind:                     string | null;
  source_kind:                    string | null;
  source_arena_event_id:          string | null;
  source_arena_match_id:          string | null;
  award_status:                   string;
  // submission
  latest_submission_id:           string | null;
  latest_submission_status:       string | null;
  latest_submission_submitted_at: string | null;
  latest_submission_delete_after: string | null;
  // payout
  latest_payout_id:               string | null;
  latest_payout_status:           string | null;
  latest_payout_paid_at:          string | null;
  // PII — 表示専用。Console log 禁止。
  legal_name:                     string | null;
  paypal_email:                   string | null;
  pii_data_source:                'payout_snapshot' | 'submission_data' | 'unavailable';
}

/**
 * admin_get_prize_submission_for_print
 * Winner File 印刷用に submission_data を含む情報を返す。
 * status='data_cleared' の場合はエラーを返す。
 *
 * ⚠️ 機微情報 (submission_data) を含む。Console log 禁止。
 */
export async function adminGetPrizeSubmissionForPrint(
  submissionId: string,
): Promise<{ data: PrintSubmissionResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_get_prize_submission_for_print', {
    p_submission_id: submissionId,
  });
  if (error) return { data: null, error: error.message };
  return { data: data as PrintSubmissionResult, error: null };
}

/**
 * admin_mark_prize_submission_archived
 * Winner File の PDF 保存・印刷・オフライン保管完了後に呼ぶ。
 * オンライン DB 上の機微情報 (submission_data) を削除する。
 * この操作は取り消せない。
 * RP-5a 以降: prepared/paid payout が存在しない場合は拒否される。
 */
export async function adminMarkPrizeSubmissionArchived(
  submissionId: string,
  note?: string | null,
): Promise<{ data: ArchiveResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_mark_prize_submission_archived', {
    p_submission_id: submissionId,
    p_note:          note ?? null,
  });
  if (error) return { data: null, error: error.message };
  return { data: data as ArchiveResult, error: null };
}

// ── RP-5a: Payment Dashboard RPCs ────────────────────────────────────────────

/**
 * admin_list_payable_awards
 * Payment Dashboard 一覧を返す（PIIなし）。
 * 最大 200 件、作成日時降順。
 */
export async function adminListPayableAwards(): Promise<{
  data: PayableAwardRow[] | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('admin_list_payable_awards');
  if (error) return { data: null, error: error.message };
  return { data: data as PayableAwardRow[], error: null };
}

/**
 * admin_get_payout_detail
 * 支払詳細確認画面用。legal_name / paypal_email を含む。
 * 呼び出し毎に prize_archive_logs に detail_viewed が記録される。
 *
 * ⚠️ 返却値を console.log / localStorage / sessionStorage / URL に出さないこと。
 */
export async function adminGetPayoutDetail(
  awardId: string,
): Promise<{ data: PayoutDetailResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_get_payout_detail', {
    p_award_id: awardId,
  });
  if (error) return { data: null, error: error.message };
  return { data: data as PayoutDetailResult, error: null };
}
