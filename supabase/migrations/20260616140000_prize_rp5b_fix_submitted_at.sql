-- ============================================================
-- Fix: admin_prepare_payout の submitted_at 参照エラー修正
--
-- 問題: prize_temp_tax_submissions テーブルに submitted_at カラムは
--        存在しない。正しいカラムは created_at。
-- 修正: ORDER BY submitted_at DESC → ORDER BY created_at DESC
-- ============================================================

DROP FUNCTION IF EXISTS admin_prepare_payout(uuid);

CREATE OR REPLACE FUNCTION admin_prepare_payout(
  p_award_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin        boolean;
  v_award           prize_awards%ROWTYPE;
  v_submission      prize_temp_tax_submissions%ROWTYPE;
  v_paypal_email    text;
  v_legal_name      text;
  v_normalized_email text;
  v_normalized_name  text;
  v_email_hash      text;
  v_name_hash       text;
  v_payout_id       uuid;
  v_now             timestamptz := now();
BEGIN
  -- ── 1. admin 確認 ──────────────────────────────────────────────────────
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT is_admin
    INTO v_is_admin
    FROM profiles
   WHERE id = auth.uid();

  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  -- ── 2. award 取得とロック ──────────────────────────────────────────────
  SELECT *
    INTO v_award
    FROM prize_awards
   WHERE id = p_award_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'award_not_found';
  END IF;

  -- ── 3. award.status 確認 ─────────────────────────────────────────────
  IF v_award.status != 'eligible' THEN
    RAISE EXCEPTION 'award_not_eligible: current status is %', v_award.status;
  END IF;

  -- ── 4. active payout 確認（prepared / paid が既にある場合は拒否） ──────
  IF EXISTS (
    SELECT 1
      FROM prize_payouts
     WHERE award_id = p_award_id
       AND status IN ('prepared', 'paid')
  ) THEN
    RAISE EXCEPTION 'active_payout_already_exists';
  END IF;

  -- ── 5. submission 取得（submission_data IS NOT NULL で判定） ──────────
  --   修正: submitted_at は存在しないカラム → created_at を使用
  SELECT *
    INTO v_submission
    FROM prize_temp_tax_submissions
   WHERE award_id = p_award_id
     AND user_id = v_award.recipient_user_id
     AND submission_data IS NOT NULL
   ORDER BY created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_submission_with_data_for_award';
  END IF;

  -- ── 6. submission user 確認 ──────────────────────────────────────────
  IF v_submission.user_id != v_award.recipient_user_id THEN
    RAISE EXCEPTION 'submission_user_mismatch';
  END IF;

  -- ── 7. snapshot 値取得 ──────────────────────────────────────────────
  v_paypal_email := v_submission.submission_data ->> 'paypal_email';
  v_legal_name   := v_submission.submission_data ->> 'legal_name';

  IF v_paypal_email IS NULL OR length(btrim(v_paypal_email)) = 0 THEN
    RAISE EXCEPTION 'submission_missing_paypal_email';
  END IF;

  IF v_legal_name IS NULL OR length(btrim(v_legal_name)) = 0 THEN
    RAISE EXCEPTION 'submission_missing_legal_name';
  END IF;

  -- ── 8. hash 計算 (pgcrypto) ────────────────────────────────────────
  v_normalized_email := lower(btrim(v_paypal_email));
  v_normalized_name  := lower(btrim(v_legal_name));

  v_email_hash := encode(digest(v_normalized_email, 'sha256'), 'hex');
  v_name_hash  := encode(digest(v_normalized_name,  'sha256'), 'hex');

  -- ── 9. prize_payouts INSERT ──────────────────────────────────────────
  INSERT INTO prize_payouts (
    id,
    award_id,
    amount_cents_snapshot,
    currency_snapshot,
    recipient_email_snapshot,
    recipient_name_snapshot,
    recipient_email_hash,
    recipient_name_hash,
    payment_method,
    status,
    source_submission_id,
    created_by_user_id,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_award_id,
    v_award.amount_cents,
    v_award.currency,
    v_paypal_email,
    v_legal_name,
    v_email_hash,
    v_name_hash,
    'paypal_manual',
    'prepared',
    v_submission.id,
    auth.uid(),
    v_now,
    v_now
  )
  RETURNING id INTO v_payout_id;

  -- ── 10. archive log INSERT (payout_prepared / PII不混入) ──────────────
  INSERT INTO prize_archive_logs (
    id,
    entity_type,
    entity_id,
    action,
    performed_by_user_id,
    before_state,
    after_state,
    created_at
  ) VALUES (
    gen_random_uuid(),
    'payout',
    v_payout_id,
    'payout_prepared',
    auth.uid(),
    jsonb_build_object(
      'award_id',              p_award_id,
      'award_status',          v_award.status,
      'active_payout_exists',  false,
      'submission_id',         v_submission.id,
      'submission_has_data',   true
    ),
    jsonb_build_object(
      'award_id',              p_award_id,
      'payout_id',             v_payout_id,
      'payout_status',         'prepared',
      'payment_method',        'paypal_manual',
      'amount_cents',          v_award.amount_cents,
      'currency',              v_award.currency,
      'source_submission_id',  v_submission.id,
      'has_recipient_snapshot', true,
      'has_recipient_hash',     true
    ),
    v_now
  );

  -- ── 11. 戻り値（PIIなし） ────────────────────────────────────────────
  RETURN jsonb_build_object(
    'ok',           true,
    'payout_id',    v_payout_id,
    'award_id',     p_award_id,
    'status',       'prepared',
    'prepared_at',  v_now,
    'payment_method', 'paypal_manual'
  );
END;
$$;

-- REVOKE / GRANT
REVOKE ALL ON FUNCTION admin_prepare_payout(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_prepare_payout(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION admin_prepare_payout(uuid) TO authenticated;

COMMENT ON FUNCTION admin_prepare_payout(uuid) IS
  'Admin: prepare a payout for an eligible award. Snapshots payment info from submission_data. Returns payout_id without PII. Fix: submitted_at → created_at (2026-06-16)';
