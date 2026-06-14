/**
 * prizeUser.ts — User Prize RPC wrappers
 *
 * 受賞者本人が使用する Prize 関連の RPC ラッパー。
 *
 * 安全方針:
 *   - submission_data は Console log 禁止
 *   - エラーメッセージに機微情報を含めない
 *   - localStorage に保存しない
 *   - URL query に機微情報を入れない
 */
import { supabase } from './supabase';

// ── Types ────────────────────────────────────────────────────────────────────

export interface UserPrizeAwardRow {
  award_id:             string;
  status:               string;
  amount_cents:         number;
  currency:             string;
  source_kind:          string | null;
  arena_code:           string | null;
  prize_kind:           string | null;
  notes:                string | null;
  created_at:           string;
  // payout
  payout_id:            string | null;
  payout_status:        string | null;
  paid_at:              string | null;
}

export interface SubmitTaxParams {
  award_id:                           string;
  legal_name:                         string;
  display_name:                       string;
  residence_country:                  string;
  address_line1:                      string;
  address_line2?:                     string | null;
  city:                               string;
  region?:                            string | null;
  postal_code:                        string;
  country:                            string;
  tax_residence_country:              string;
  domestic_or_foreign:                string;
  paypal_email:                       string;
  preferred_currency:                 string;
  user_confirmed_legal_responsibility: boolean;
  user_confirmed_paypal_name_match:    boolean;
}

/** submit_prize_tax_submission の戻り値（PIIなし） */
export interface SubmitTaxResult {
  submission_id: string;
  award_id:      string;
  status:        string;
  delete_after:  string;
}

// ── RPC wrappers ─────────────────────────────────────────────────────────────

/**
 * getUserAwards
 * 自分の award 一覧を prize_award_payment_state view から取得する。
 * RLS により自動的に自分の award のみ返される。
 */
export async function getUserAwards(): Promise<{
  data: UserPrizeAwardRow[] | null;
  error: string | null;
}> {
  // prize_award_payment_state view から直接取得する。
  // security_invoker = true の view なので RLS が呼び出し元ユーザーで評価され、
  // 自分の award のみ返される。
  // ※ prize_awards テーブルには source_kind / prize_kind カラムが存在しないため
  //    2次クエリは行わず、view の source カラムを source_kind にマッピングする。
  const { data, error } = await supabase
    .from('prize_award_payment_state')
    .select(
      'award_id, award_status, amount_cents, currency, source_kind, arena_code, payout_id, payout_status, paid_at, payout_created_at',
    )
    .order('award_id', { ascending: true });

  if (error) return { data: null, error: error.message };

  const rows: UserPrizeAwardRow[] = (data ?? []).map((r: Record<string, unknown>) => ({
    award_id:      r.award_id as string,
    status:        r.award_status as string,
    amount_cents:  r.amount_cents as number,
    currency:      r.currency as string,
    source_kind:   (r.source_kind as string | null) ?? null,
    arena_code:    (r.arena_code as string | null) ?? null,
    prize_kind:    null,
    notes:         null,
    created_at:    '',
    payout_id:     (r.payout_id as string | null) ?? null,
    payout_status: (r.payout_status as string | null) ?? null,
    paid_at:       (r.paid_at as string | null) ?? null,
  }));

  return { data: rows, error: null };
}

/**
 * getUserAwardSubmissions
 * 自分の submission 状態を取得する（PIIなし: submission_dataは除外）。
 * RLS により自動的に自分の submission のみ返される。
 */
export async function getUserAwardSubmissions(awardIds: string[]): Promise<{
  data: Record<string, { submission_id: string; status: string; delete_after: string | null; data_cleared_at: string | null }> | null;
  error: string | null;
}> {
  if (awardIds.length === 0) return { data: {}, error: null };

  const { data, error } = await supabase
    .from('prize_temp_tax_submissions')
    .select('id, award_id, status, delete_after, data_cleared_at')
    .in('award_id', awardIds)
    .order('created_at', { ascending: false });

  if (error) return { data: null, error: error.message };

  // award_id ごとに最新の1件を取得
  const map: Record<string, { submission_id: string; status: string; delete_after: string | null; data_cleared_at: string | null }> = {};
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    const awardId = r.award_id as string;
    if (!map[awardId]) {
      map[awardId] = {
        submission_id:   r.id as string,
        status:          r.status as string,
        delete_after:    (r.delete_after as string | null) ?? null,
        data_cleared_at: (r.data_cleared_at as string | null) ?? null,
      };
    }
  }
  return { data: map, error: null };
}

/**
 * submitPrizeTaxSubmission
 * 受賞者本人が支払・税務情報を提出する。
 * 戻り値は PIIなし（submission_id / award_id / status / delete_after のみ）。
 *
 * ⚠️ params の内容を Console log しないこと。
 */
export async function submitPrizeTaxSubmission(
  params: SubmitTaxParams,
): Promise<{ data: SubmitTaxResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('submit_prize_tax_submission', {
    p_award_id:                           params.award_id,
    p_legal_name:                         params.legal_name,
    p_display_name:                       params.display_name,
    p_residence_country:                  params.residence_country,
    p_address_line1:                      params.address_line1,
    p_address_line2:                      params.address_line2 ?? null,
    p_city:                               params.city,
    p_region:                             params.region ?? null,
    p_postal_code:                        params.postal_code,
    p_country:                            params.country,
    p_tax_residence_country:              params.tax_residence_country,
    p_domestic_or_foreign:                params.domestic_or_foreign,
    p_paypal_email:                       params.paypal_email,
    p_preferred_currency:                 params.preferred_currency,
    p_user_confirmed_legal_responsibility: params.user_confirmed_legal_responsibility,
    p_user_confirmed_paypal_name_match:    params.user_confirmed_paypal_name_match,
  });

  if (error) {
    // エラーに機微情報を含めない
    return { data: null, error: error.message };
  }

  // RPC は RETURNS TABLE なので data は配列
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { data: null, error: 'No result returned from RPC.' };

  return {
    data: {
      submission_id: (row as Record<string, unknown>).submission_id as string,
      award_id:      (row as Record<string, unknown>).award_id as string,
      status:        (row as Record<string, unknown>).status as string,
      delete_after:  (row as Record<string, unknown>).delete_after as string,
    },
    error: null,
  };
}
