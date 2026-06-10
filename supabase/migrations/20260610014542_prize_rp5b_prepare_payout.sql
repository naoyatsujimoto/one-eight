-- ============================================================
-- RP-5b: Reward / Prize — Prepare Payout RPC + UI
--
-- A. Alignment migration
--    1. pgcrypto 有効化
--    2. payment_method CHECK: paypal_manual 追加
--    3. source_submission_id 追加 (prize_payouts → prize_temp_tax_submissions)
--
-- B. admin_prepare_payout(p_award_id uuid) RPC
--    - SECURITY DEFINER / authenticated / is_admin 再確認
--    - submission 判定: submission_data IS NOT NULL (status 文字列不使用)
--    - payment_method = 'paypal_manual' で INSERT
--    - source_submission_id 保存
--    - archive log: payout_prepared (PII不混入)
--    - 戻り値: PIIなし
--
-- 禁止事項:
--   - PayPal API実装
--   - CSV生成
--   - PayPal送金実行
--   - Mark as Paid / Failed / Cancel / Retry RPC
--   - payout result recording
--   - bulk prepare / 自動prepare
--   - cron / pg_cron
--   - Edge Function
--   - submission status文字列によるprepare可否判定
--   - paypal_csv を新規payoutで使用
--   - submission_data の自動clear
--   - archive logへのPII保存
--   - RP-1〜RP-5aの権限緩和
-- ============================================================

-- ============================================================
-- A-1. pgcrypto 有効化
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- A-2. payment_method CHECK に paypal_manual を追加
-- ============================================================

ALTER TABLE prize_payouts
  DROP CONSTRAINT IF EXISTS prize_payouts_payment_method_check;

ALTER TABLE prize_payouts
  ADD CONSTRAINT prize_payouts_payment_method_check
  CHECK (payment_method IN (
    'paypal_csv',
    'paypal_api',
    'paypal_manual',
    'bank_transfer',
    'manual'
  ));

COMMENT ON COLUMN prize_payouts.payment_method IS
  'paypal_manual = AdminPageで記録する手動PayPal送金。paypal_csvは廃止済み・既存互換のみ。';

-- ============================================================
-- A-3. source_submission_id を prize_payouts に追加
-- ============================================================

ALTER TABLE prize_payouts
  ADD COLUMN IF NOT EXISTS source_submission_id uuid
  REFERENCES prize_temp_tax_submissions(id);

COMMENT ON COLUMN prize_payouts.source_submission_id IS
  '本payoutのsnapshotを取得した元submissionへの参照。data_cleared後も保持する。';

CREATE INDEX IF NOT EXISTS idx_prize_payouts_source_submission
  ON prize_payouts(source_submission_id)
  WHERE source_submission_id IS NOT NULL;

-- ============================================================
-- B. admin_prepare_payout RPC
-- ============================================================

-- 既存 DROP（戻り値型変更に備えて）
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

  -- ── 5. submission 取得（最重要：status文字列ではなく submission_data IS NOT NULL で判定） ──
  SELECT *
    INTO v_submission
    FROM prize_temp_tax_submissions
   WHERE award_id = p_award_id
     AND user_id = v_award.recipient_user_id
     AND submission_data IS NOT NULL
   ORDER BY submitted_at DESC
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
  'Admin: prepare a payout for an eligible award. Snapshots payment info from submission_data. Returns payout_id without PII.';
