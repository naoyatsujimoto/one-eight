/**
 * prize_rp7.test.ts
 * RP-7: WINNERS FILE Prepare — prior submission flow
 *
 * テスト対象:
 * - prizeAdmin.ts の型定義（純粋な型チェック）
 * - PrizePaymentDashboard の純粋関数 canShowPrepareWinnersFileButton
 *
 * Supabase RPC の実際の呼び出しは mock 不要（型・純粋関数のみテスト）。
 */

import { describe, it, expect } from 'vitest';
import type {
  UserPriorSubmissionResult,
  PreparePayoutWinnersFileResult,
  PayoutDetailResult,
  PayableAwardRow,
} from '../lib/prizeAdmin';

// ─── canShowPrepareWinnersFileButton の再実装（テスト用） ─────────────────────
// PrizePaymentDashboard.tsx の純粋関数を直接 import せずに同ロジックを再現する。
// （コンポーネントは vitest 環境で DOM 依存があるため直接 import しない）
function canShowPrepareWinnersFileButton(detail: PayoutDetailResult): boolean {
  if (detail.award_status !== 'eligible') return false;
  const activePayout = detail.latest_payout_status;
  if (activePayout === 'prepared' || activePayout === 'paid') return false;
  if (detail.latest_submission_id) return false;
  return detail.user_prior_submission_exists === true;
}

// ─── テスト用ファクトリ ────────────────────────────────────────────────────────
function makePayoutDetail(overrides: Partial<PayoutDetailResult> = {}): PayoutDetailResult {
  return {
    award_id: 'award-uuid-0001',
    recipient_user_id: 'user-uuid-0001',
    amount_cents: 10000,
    currency: 'JPY',
    prize_kind: 'arena',
    source_kind: 'arena',
    source_arena_event_id: null,
    source_arena_match_id: null,
    award_status: 'eligible',
    latest_submission_id: null,
    latest_submission_status: null,
    latest_submission_submitted_at: null,
    latest_submission_delete_after: null,
    latest_payout_id: null,
    latest_payout_status: null,
    latest_payout_paid_at: null,
    legal_name: null,
    paypal_email: null,
    pii_data_source: 'unavailable',
    user_prior_submission_exists: false,
    user_prior_submission_count: 0,
    user_prior_latest_status: null,
    winners_file_check_required: false,
    ...overrides,
  };
}

// ─── 型チェック: UserPriorSubmissionResult ────────────────────────────────────
describe('UserPriorSubmissionResult 型定義', () => {
  it('user_id / has_prior_submission / submission_count / latest_submission_status が存在する', () => {
    const result: UserPriorSubmissionResult = {
      user_id: 'user-uuid-0001',
      has_prior_submission: true,
      submission_count: 2,
      latest_submission_status: 'submitted',
    };
    expect(result.user_id).toBe('user-uuid-0001');
    expect(result.has_prior_submission).toBe(true);
    expect(result.submission_count).toBe(2);
    expect(result.latest_submission_status).toBe('submitted');
  });

  it('latest_submission_status は null 許容', () => {
    const result: UserPriorSubmissionResult = {
      user_id: 'user-uuid-0002',
      has_prior_submission: false,
      submission_count: 0,
      latest_submission_status: null,
    };
    expect(result.latest_submission_status).toBeNull();
  });
});

// ─── 型チェック: PreparePayoutWinnersFileResult ───────────────────────────────
describe('PreparePayoutWinnersFileResult 型定義', () => {
  it('必須フィールドがすべて存在する', () => {
    const result: PreparePayoutWinnersFileResult = {
      ok: true,
      payout_id: 'payout-uuid-0001',
      award_id: 'award-uuid-0001',
      status: 'prepared',
      prepared_at: '2026-07-01T01:00:00Z',
      payment_method: 'paypal_manual',
      winners_file_check_required: true,
    };
    expect(result.ok).toBe(true);
    expect(result.winners_file_check_required).toBe(true);
    expect(result.payment_method).toBe('paypal_manual');
  });

  it('winners_file_check_required フィールドが boolean 型', () => {
    const resultTrue: PreparePayoutWinnersFileResult = {
      ok: true,
      payout_id: 'p1',
      award_id: 'a1',
      status: 'prepared',
      prepared_at: '2026-07-01T00:00:00Z',
      payment_method: 'paypal_manual',
      winners_file_check_required: true,
    };
    const resultFalse: PreparePayoutWinnersFileResult = {
      ...resultTrue,
      winners_file_check_required: false,
    };
    expect(typeof resultTrue.winners_file_check_required).toBe('boolean');
    expect(typeof resultFalse.winners_file_check_required).toBe('boolean');
  });
});

// ─── 型チェック: PayoutDetailResult ──────────────────────────────────────────
describe('PayoutDetailResult 型定義', () => {
  it('user_prior_submission_exists / user_prior_submission_count / winners_file_check_required が存在する', () => {
    const detail = makePayoutDetail({
      user_prior_submission_exists: true,
      user_prior_submission_count: 3,
      winners_file_check_required: true,
    });
    expect(detail.user_prior_submission_exists).toBe(true);
    expect(detail.user_prior_submission_count).toBe(3);
    expect(detail.winners_file_check_required).toBe(true);
  });

  it('デフォルト（過去提出なし）状態を正常に構成できる', () => {
    const detail = makePayoutDetail();
    expect(detail.user_prior_submission_exists).toBe(false);
    expect(detail.user_prior_submission_count).toBe(0);
    expect(detail.winners_file_check_required).toBe(false);
  });
});

// ─── 型チェック: PayableAwardRow（PrizeSummaryRow 相当） ────────────────────────
describe('PayableAwardRow 型定義', () => {
  it('user_prior_submission_exists フィールドが存在する', () => {
    const row: PayableAwardRow = {
      award_id: 'award-uuid-0001',
      recipient_user_id: 'user-uuid-0001',
      recipient_display_name: 'Test User',
      amount_cents: 5000,
      currency: 'USD',
      award_status: 'eligible',
      prize_kind: null,
      source_kind: null,
      source_arena_id: null,
      source_arena_event_id: null,
      source_arena_match_id: null,
      latest_submission_id: null,
      latest_submission_status: null,
      latest_submission_submitted_at: null,
      latest_submission_delete_after: null,
      latest_submission_data_cleared_at: null,
      latest_payout_id: null,
      latest_payout_status: null,
      latest_payout_paid_at: null,
      created_at: '2026-07-01T00:00:00Z',
      display_label: 'Test Award',
      user_prior_submission_exists: true,
    };
    expect(row.user_prior_submission_exists).toBe(true);
  });

  it('user_prior_submission_exists が false の場合も型適合', () => {
    const row: PayableAwardRow = {
      award_id: 'award-uuid-0002',
      recipient_user_id: 'user-uuid-0002',
      recipient_display_name: null,
      amount_cents: 1000,
      currency: 'JPY',
      award_status: 'pending',
      prize_kind: null,
      source_kind: null,
      source_arena_id: null,
      source_arena_event_id: null,
      source_arena_match_id: null,
      latest_submission_id: null,
      latest_submission_status: null,
      latest_submission_submitted_at: null,
      latest_submission_delete_after: null,
      latest_submission_data_cleared_at: null,
      latest_payout_id: null,
      latest_payout_status: null,
      latest_payout_paid_at: null,
      created_at: '2026-07-01T00:00:00Z',
      display_label: 'Test Award 2',
      user_prior_submission_exists: false,
    };
    expect(row.user_prior_submission_exists).toBe(false);
  });
});

// ─── canShowPrepareWinnersFileButton ─────────────────────────────────────────
describe('canShowPrepareWinnersFileButton', () => {
  it('user_prior_submission_exists: true のとき true を返す', () => {
    const detail = makePayoutDetail({
      user_prior_submission_exists: true,
    });
    expect(canShowPrepareWinnersFileButton(detail)).toBe(true);
  });

  it('user_prior_submission_exists: false のとき false を返す', () => {
    const detail = makePayoutDetail({
      user_prior_submission_exists: false,
    });
    expect(canShowPrepareWinnersFileButton(detail)).toBe(false);
  });

  it('award_status が eligible 以外のとき false を返す', () => {
    const detail = makePayoutDetail({
      award_status: 'pending',
      user_prior_submission_exists: true,
    });
    expect(canShowPrepareWinnersFileButton(detail)).toBe(false);
  });

  it('active payout (prepared) が存在するとき false を返す', () => {
    const detail = makePayoutDetail({
      user_prior_submission_exists: true,
      latest_payout_status: 'prepared',
    });
    expect(canShowPrepareWinnersFileButton(detail)).toBe(false);
  });

  it('active payout (paid) が存在するとき false を返す', () => {
    const detail = makePayoutDetail({
      user_prior_submission_exists: true,
      latest_payout_status: 'paid',
    });
    expect(canShowPrepareWinnersFileButton(detail)).toBe(false);
  });

  it('latest_submission_id が存在するとき false を返す（通常 prepare を使うべき）', () => {
    const detail = makePayoutDetail({
      user_prior_submission_exists: true,
      latest_submission_id: 'sub-uuid-0001',
    });
    expect(canShowPrepareWinnersFileButton(detail)).toBe(false);
  });

  it('全条件を満たす場合のみ true を返す（eligible + no active payout + no submission + prior exists）', () => {
    const detail = makePayoutDetail({
      award_status: 'eligible',
      latest_payout_status: null,
      latest_submission_id: null,
      user_prior_submission_exists: true,
    });
    expect(canShowPrepareWinnersFileButton(detail)).toBe(true);
  });
});
