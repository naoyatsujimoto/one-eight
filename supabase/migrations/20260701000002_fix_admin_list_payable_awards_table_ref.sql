-- ============================================================
-- Migration: 20260701000002
-- Purpose:   admin_list_payable_awards の prize_arena_events 参照を修正
--            prize_arena_events は存在しないテーブル。
--            正しいテーブル: arena_events → arena_definitions (code)
-- ============================================================

DROP FUNCTION IF EXISTS admin_list_payable_awards();

CREATE OR REPLACE FUNCTION admin_list_payable_awards()
RETURNS TABLE (
  award_id                          uuid,
  recipient_user_id                 uuid,
  recipient_display_name            text,
  source_kind                       text,
  source_arena_id                   uuid,
  source_arena_event_id             uuid,
  source_arena_match_id             uuid,
  amount_cents                      int,
  currency                          text,
  prize_kind                        text,
  award_status                      text,
  latest_submission_id              uuid,
  latest_submission_status          text,
  latest_submission_submitted_at    timestamptz,
  latest_submission_delete_after    timestamptz,
  latest_submission_data_cleared_at timestamptz,
  latest_payout_id                  uuid,
  latest_payout_status              text,
  latest_payout_paid_at             timestamptz,
  created_at                        timestamptz,
  display_label                     text,
  arena_code                        text,
  user_prior_submission_exists      boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_is_admin  boolean;
BEGIN
  -- ── admin 確認 ────────────────────────────────────────────
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT is_admin INTO v_is_admin
    FROM profiles WHERE id = v_caller_id;
  IF NOT FOUND OR v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  RETURN QUERY
  WITH sub AS (
    SELECT DISTINCT ON (pts.award_id)
      pts.award_id,
      pts.id           AS submission_id,
      pts.status       AS submission_status,
      pts.created_at   AS submitted_at,
      pts.delete_after,
      pts.data_cleared_at
    FROM prize_temp_tax_submissions pts
    ORDER BY pts.award_id, pts.created_at DESC
  ),
  pyt AS (
    SELECT DISTINCT ON (pp.award_id)
      pp.award_id,
      pp.id           AS payout_id,
      pp.status       AS payout_status,
      pp.paid_at
    FROM prize_payouts pp
    ORDER BY pp.award_id,
      CASE pp.status
        WHEN 'paid'     THEN 1
        WHEN 'prepared' THEN 2
        WHEN 'failed'   THEN 3
        WHEN 'canceled' THEN 4
        ELSE 5
      END,
      pp.created_at DESC
  ),
  prior_sub AS (
    -- user_id 単位での過去提出済み件数（PIIなし）
    SELECT pts.user_id, COUNT(*) AS prior_count
    FROM prize_temp_tax_submissions pts
    WHERE pts.status IN ('submitted', 'reviewed', 'archived', 'data_cleared')
    GROUP BY pts.user_id
  )
  SELECT
    a.id                           AS award_id,
    a.recipient_user_id,
    p.display_name                 AS recipient_display_name,
    a.source_kind,
    a.source_arena_id,
    a.source_arena_event_id,
    a.source_arena_match_id,
    a.amount_cents,
    a.currency,
    a.prize_kind,
    a.status                       AS award_status,
    sub.submission_id              AS latest_submission_id,
    sub.submission_status          AS latest_submission_status,
    sub.submitted_at               AS latest_submission_submitted_at,
    sub.delete_after               AS latest_submission_delete_after,
    sub.data_cleared_at            AS latest_submission_data_cleared_at,
    pyt.payout_id                  AS latest_payout_id,
    pyt.payout_status              AS latest_payout_status,
    pyt.paid_at                    AS latest_payout_paid_at,
    a.created_at,
    -- display_label 判定（RP-7: Prior Sub on File 追加）
    CASE
      -- award 終端状態
      WHEN a.status = 'on_hold'   THEN 'On Hold'
      WHEN a.status = 'canceled'  THEN 'Canceled'
      WHEN a.status = 'expired'   THEN 'Expired'
      -- payout 状態優先
      WHEN pyt.payout_status = 'paid'     THEN 'Paid'
      WHEN pyt.payout_status = 'prepared' THEN 'Prepared'
      WHEN pyt.payout_status = 'failed'   THEN 'Failed'
      WHEN pyt.payout_status = 'canceled' THEN 'Canceled'
      -- submission 状態
      WHEN sub.submission_status IN ('submitted', 'reviewed') THEN 'Awaiting Archive'
      WHEN sub.submission_status = 'archived' THEN 'Ready for Prepare'
      -- submission なし・過去提出済み user_id → WINNERS FILE ベース prepare 可能
      WHEN a.status = 'eligible' AND sub.submission_id IS NULL
           AND COALESCE(prior_sub.prior_count, 0) > 0 THEN 'Prior Sub on File'
      -- submission なし
      WHEN a.status = 'eligible' AND sub.submission_id IS NULL THEN 'Awaiting Submission'
      ELSE 'Awaiting Submission'
    END                            AS display_label,
    -- arena_code: prize_arena_events は存在しないため
    --   arena_events → arena_definitions.code を参照する
    ad.code                        AS arena_code,
    COALESCE(prior_sub.prior_count, 0) > 0 AS user_prior_submission_exists
  FROM prize_awards a
  LEFT JOIN profiles p             ON p.id = a.recipient_user_id
  LEFT JOIN sub                    ON sub.award_id = a.id
  LEFT JOIN pyt                    ON pyt.award_id = a.id
  LEFT JOIN arena_events ae        ON ae.id = a.source_arena_event_id
  LEFT JOIN arena_definitions ad   ON ad.id = ae.arena_id
  LEFT JOIN prior_sub              ON prior_sub.user_id = a.recipient_user_id
  WHERE a.status NOT IN ('canceled', 'expired')
  ORDER BY a.created_at DESC
  LIMIT 200;
END;
$$;

REVOKE ALL ON FUNCTION admin_list_payable_awards() FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_list_payable_awards() FROM anon;
GRANT EXECUTE ON FUNCTION admin_list_payable_awards() TO authenticated;

COMMENT ON FUNCTION admin_list_payable_awards() IS
  'Admin: Payment Dashboard 用 award 一覧。PIIなし。'
  'RP-7追加: user_prior_submission_exists カラム / display_label: Prior Sub on File 追加。'
  'Fix: prize_arena_events (存在しない) → arena_events + arena_definitions に修正。';
