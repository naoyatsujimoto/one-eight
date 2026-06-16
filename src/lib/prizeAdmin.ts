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
 * RP-5b 追加:
 *   adminPreparePayout — eligible award に対して prize_payouts row を prepared で作成
 *                        戻り値に PII を含まない。
 *
 * RP-5c 追加:
 *   adminMarkPayoutPaid — prepared payout を paid に変更。PayPal Transaction ID 等を記録。
 *   adminMarkPayoutFailed — prepared payout を failed に変更。failure_reason を記録。
 *
 * ⚠️ Cancel / Retry は RP-5d 以降。
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
  arena_code:             string | null;
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
  /** 機微情報を含む。Console log 禁止。
   * submission_data が data_cleared の場合は payout_snapshot から補完される。
   * data_source フィールドで出典を確認できる。 */
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
  // payout（2026-06-16 追加）
  payout_id:             string | null;
  payout_status:         string | null;
  prepared_at:           string | null;
  paid_at:               string | null;
  /** 機微情報の出典: 'submission_data' | 'payout_snapshot' | 'unavailable' */
  data_source:           string | null;
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

// ── RP-5b: Prepare Payout ─────────────────────────────────────────────────────

/**
 * admin_prepare_payout の戻り値型（PIIなし）
 */
export interface PreparePayoutResult {
  ok:             boolean;
  payout_id:      string;
  award_id:       string;
  status:         string;
  prepared_at:    string;
  payment_method: string;
}

/**
 * adminPreparePayout
 * eligible award に対して prize_payouts row を status='prepared' で作成する。
 * submission_data から PayPal email / legal name を snapshot として固定する。
 * 戻り値に PII を含まない。
 *
 * 実際の PayPal 送金はこの関数では行わない。
 * Naoya が PayPal 管理画面で手動実行する。
 */
export async function adminPreparePayout(
  awardId: string,
): Promise<{ data: PreparePayoutResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_prepare_payout', {
    p_award_id: awardId,
  });
  if (error) return { data: null, error: error.message };
  return { data: data as PreparePayoutResult, error: null };
}

// ── RP-5c: Mark as Paid / Failed ─────────────────────────────────────────────

/**
 * admin_mark_payout_paid の引数型
 */
export interface MarkPayoutPaidParams {
  /** 対象 payout の id */
  payout_id:           string;
  /** PayPal Transaction ID（必須）。⚠️ console.log / localStorage 禁止。 */
  paypal_payout_id:    string;
  /** 支払時刻。省略時は RPC 内で clock_timestamp() を使用。 */
  paid_at?:            string | null;
  /** 送金総額（cents）。PayPal 管理画面の gross amount。 */
  gross_amount_cents?: number | null;
  /** PayPal 手数料（cents）。 */
  fee_amount_cents?:   number | null;
  /** 受取額（cents）。gross - fee。 */
  net_amount_cents?:   number | null;
  /** 為替レート。異通貨の場合のみ。 */
  exchange_rate?:      number | null;
  /** 送金通貨コード（3文字）。exchange_rate とペアで指定。 */
  exchange_currency?:  string | null;
  /** 管理者メモ（1000文字以内）。PII 禁止。 */
  admin_note?:         string | null;
}

/**
 * admin_mark_payout_paid の戻り値型（PIIなし）
 */
export interface MarkPayoutPaidResult {
  ok:             boolean;
  payout_id:      string;
  status:         'paid';
  paid_at:        string;
  payment_method: string;
}

/**
 * admin_mark_payout_failed の引数型
 */
export interface MarkPayoutFailedParams {
  /** 対象 payout の id */
  payout_id:       string;
  /** 失敗理由（3〜500文字）。PII 禁止。archive log には本文を保存しない。 */
  failure_reason:  string;
  /** 管理者メモ（1000文字以内）。PII 禁止。 */
  admin_note?:     string | null;
}

/**
 * admin_mark_payout_failed の戻り値型（PIIなし）
 */
export interface MarkPayoutFailedResult {
  ok:             boolean;
  payout_id:      string;
  status:         'failed';
  failed_at:      string;
  payment_method: string;
}

/**
 * adminMarkPayoutPaid
 * prepared payout を status='paid' に変更する。
 * PayPal Transaction ID / paid_at / 金額明細を記録する。
 * 戻り値に PII を含まない。
 *
 * ⚠️ この関数は PayPal 送金を実行しない。
 * 送金後に手動で呼ぶこと。
 */
export async function adminMarkPayoutPaid(
  params: MarkPayoutPaidParams,
): Promise<{ data: MarkPayoutPaidResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_mark_payout_paid', {
    p_payout_id:          params.payout_id,
    p_paypal_payout_id:   params.paypal_payout_id,
    p_paid_at:            params.paid_at ?? null,
    p_gross_amount_cents: params.gross_amount_cents ?? null,
    p_fee_amount_cents:   params.fee_amount_cents ?? null,
    p_net_amount_cents:   params.net_amount_cents ?? null,
    p_exchange_rate:      params.exchange_rate ?? null,
    p_exchange_currency:  params.exchange_currency ?? null,
    p_admin_note:         params.admin_note ?? null,
  });
  if (error) return { data: null, error: error.message };
  return { data: data as MarkPayoutPaidResult, error: null };
}

/**
 * adminMarkPayoutFailed
 * prepared payout を status='failed' に変更する。
 * failure_reason / failed_at を記録する。
 * 戻り値に PII を含まない。
 *
 * ⚠️ failed 後は同 payout row を再利用できない。
 * retry は RP-5d で新規 payout row を作成する。
 */
export async function adminMarkPayoutFailed(
  params: MarkPayoutFailedParams,
): Promise<{ data: MarkPayoutFailedResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_mark_payout_failed', {
    p_payout_id:      params.payout_id,
    p_failure_reason: params.failure_reason,
    p_admin_note:     params.admin_note ?? null,
  });
  if (error) return { data: null, error: error.message };
  return { data: data as MarkPayoutFailedResult, error: null };
}

// ── RP-6: Auto Generate Arena Prize Awards ──────────────────────────────────────

/**
 * admin_generate_arena_prize_awards の戻り値型（1行＝1 award）
 * skipped_reason が 'already_exists' の場合は重複でスキップされた既存 award。
 */
export interface GenerateArenaAwardRow {
  award_id:          string;
  arena_id:          string;
  arena_code:        string | null;
  arena_event_id:    string;
  arena_match_id:    string;
  recipient_user_id: string;
  amount_cents:      number;
  currency:          string;
  prize_kind:        string;
  status:            string;
  skipped_reason:    string | null;
}

/**
 * adminGenerateArenaAwards
 * 指定 Arena event の match_kind='master' 勝者を対象に prize_awards を自動生成する。
 * 重複の場合は既存 award を返し新規作成しない（skipped_reason='already_exists'）。
 * 対象が 0 件の場合は空配列を返す。
 *
 * 生成対象条件:
 *   - arena_match_history.match_kind = 'master'
 *   - winner_user_id IS NOT NULL
 *   - end_reason NOT IN ('no_show', 'no_contest', 'cancelled')
 *   - arena_matches.status = 'processed'
 */
export async function adminGenerateArenaAwards(
  arenaEventId: string,
  amountCents:  number,
  currency:     string,
  prizeKind:    PrizeKind,
): Promise<{ data: GenerateArenaAwardRow[] | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_generate_arena_prize_awards', {
    p_arena_event_id: arenaEventId,
    p_amount_cents:   amountCents,
    p_currency:       currency,
    p_prize_kind:     prizeKind,
  });
  if (error) return { data: null, error: error.message };
  return { data: (data as GenerateArenaAwardRow[]) ?? [], error: null };
}

// ── RP-5d: Cancel / Retry ─────────────────────────────────────────────────────

/**
 * admin_cancel_payout の引数型
 */
export interface CancelPayoutParams {
  /** 対象 payout の id */
  payout_id:      string;
  /** キャンセル理由（3〜500文字）。PII 禁止。archive log には本文を保存しない。 */
  cancel_reason:  string;
  /** 管理者メモ（1000文字以内）。PII 禁止。 */
  admin_note?:    string | null;
}

/**
 * admin_cancel_payout の戻り値型（PIIなし）
 */
export interface CancelPayoutResult {
  ok:          boolean;
  payout_id:   string;
  status:      'canceled';
  canceled_at: string;
}

/**
 * admin_retry_payout の引数型
 */
export interface RetryPayoutParams {
  /** retry 元の payout の id（failed または canceled） */
  source_payout_id: string;
  /** retry 理由（3〜500文字）。PII 禁止。archive log には本文を保存しない。 */
  retry_reason:     string;
  /** 管理者メモ（1000文字以内）。PII 禁止。 */
  admin_note?:      string | null;
}

/**
 * admin_retry_payout の戻り値型（PIIなし）
 */
export interface RetryPayoutResult {
  ok:               boolean;
  new_payout_id:    string;
  source_payout_id: string;
  status:           'prepared';
  payment_method:   string;
}

/**
 * adminCancelPayout
 * prepared payout を status='canceled' に変更する。
 * cancel_reason / canceled_at / canceled_by_user_id を記録する。
 * 戻り値に PII を含まない。
 *
 * ⚠️ canceled 後は同 payout row を再利用できない。
 * retry は adminRetryPayout で新規 payout row を作成する。
 */
export async function adminCancelPayout(
  params: CancelPayoutParams,
): Promise<{ data: CancelPayoutResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_cancel_payout', {
    p_payout_id:     params.payout_id,
    p_cancel_reason: params.cancel_reason,
    p_admin_note:    params.admin_note ?? null,
  });
  if (error) return { data: null, error: error.message };
  return { data: data as CancelPayoutResult, error: null };
}

/**
 * adminRetryPayout
 * failed または canceled の payout から新規 prepared payout を作成する。
 * snapshot は source payout からコピーのみ（submission_data 再取得なし）。
 * source payout は変更しない。
 * 戻り値に PII を含まない。
 *
 * ⚠️ この関数は PayPal 送金を実行しない。
 * 新規 prepared payout を作成するのみ。
 */
export async function adminRetryPayout(
  params: RetryPayoutParams,
): Promise<{ data: RetryPayoutResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_retry_payout', {
    p_source_payout_id: params.source_payout_id,
    p_retry_reason:     params.retry_reason,
    p_admin_note:       params.admin_note ?? null,
  });
  if (error) return { data: null, error: error.message };
  return { data: data as RetryPayoutResult, error: null };
}
