-- ============================================================
-- RP-4: Prize Winner Submission RPC
-- 受賞者本人による支払・税務情報提出フォーム
--
-- 追加:
--   RPC: submit_prize_tax_submission(...)
--   RPC: admin_list_prize_awards() — 戻り値拡張（latest_submission_* 追加）
--
-- 禁止事項 (RP-4 scope):
--   - PayPal CSV / PayPal API / payout row 作成 / payout status 変更
--   - prize_temp_tax_submissions の DELETE
--   - archive log への PII 保存
--   - profiles への PayPal メール等追加
--   - RP-1 物理ガード変更・削除
--   - RP-2 / RP-3 admin RPC 権限緩和
--   - pg_cron 変更
--   - Arena 処理変更
-- ============================================================

-- ============================================================
-- 1. submit_prize_tax_submission
--    受賞者本人が支払・税務情報を提出する RPC
--    - SECURITY DEFINER
--    - auth.uid() 基準で recipient_user_id を確認
--    - award.status が 'eligible' または 'pending' のみ許可
--    - 重複提出禁止（submitted/reviewed/archived/data_cleared のsubmissionが存在する場合）
--    - 戻り値は PIIなし（submission_id / award_id / status / delete_after のみ）
-- ============================================================

DROP FUNCTION IF EXISTS submit_prize_tax_submission(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean);

CREATE OR REPLACE FUNCTION submit_prize_tax_submission(
  p_award_id                         uuid,
  p_legal_name                       text,
  p_display_name                     text,
  p_residence_country                text,
  p_address_line1                    text,
  p_address_line2                    text    DEFAULT NULL,
  p_city                             text    DEFAULT NULL,
  p_region                           text    DEFAULT NULL,
  p_postal_code                      text    DEFAULT NULL,
  p_country                          text    DEFAULT NULL,
  p_tax_residence_country            text    DEFAULT NULL,
  p_domestic_or_foreign              text    DEFAULT NULL,
  p_paypal_email                     text    DEFAULT NULL,
  p_preferred_currency               text    DEFAULT 'USD',
  p_user_confirmed_legal_responsibility boolean DEFAULT FALSE,
  p_user_confirmed_paypal_name_match    boolean DEFAULT FALSE
)
RETURNS TABLE(
  submission_id uuid,
  award_id      uuid,
  status        text,
  delete_after  timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id   uuid;
  v_award       prize_awards%ROWTYPE;
  v_sub_id      uuid;
  v_delete_after timestamptz;
  v_data        jsonb;
BEGIN
  -- ── 認証確認 ─────────────────────────────────────────────
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING DETAIL = 'You must be authenticated to submit prize tax information.';
  END IF;

  -- ── award 取得 ─────────────────────────────────────────────
  SELECT *
    INTO v_award
    FROM prize_awards
   WHERE id = p_award_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'award_not_found'
      USING DETAIL = 'Prize award not found.';
  END IF;

  -- ── recipient 確認 ────────────────────────────────────────
  IF v_award.recipient_user_id <> v_caller_id THEN
    RAISE EXCEPTION 'permission_denied'
      USING DETAIL = 'You are not the recipient of this award.';
  END IF;

  -- ── award status 確認 ─────────────────────────────────────
  IF v_award.status NOT IN ('eligible', 'pending') THEN
    IF v_award.status = 'on_hold' THEN
      RAISE EXCEPTION 'award_on_hold'
        USING DETAIL = 'This award is currently on hold. Please contact admin.';
    ELSIF v_award.status = 'canceled' THEN
      RAISE EXCEPTION 'award_canceled'
        USING DETAIL = 'This award has been canceled.';
    ELSIF v_award.status = 'expired' THEN
      RAISE EXCEPTION 'award_expired'
        USING DETAIL = 'This award has expired.';
    ELSE
      RAISE EXCEPTION 'award_status_invalid'
        USING DETAIL = 'This award is not eligible for submission.';
    END IF;
  END IF;

  -- ── 重複提出チェック ─────────────────────────────────────
  PERFORM 1
    FROM prize_temp_tax_submissions
   WHERE award_id = p_award_id
     AND status IN ('submitted', 'reviewed', 'archived', 'data_cleared');

  IF FOUND THEN
    RAISE EXCEPTION 'submission_already_exists'
      USING DETAIL = 'A submission for this award already exists. Duplicate submissions are not allowed.';
  END IF;

  -- ── 必須フィールドバリデーション ─────────────────────────
  IF p_legal_name IS NULL OR trim(p_legal_name) = '' THEN
    RAISE EXCEPTION 'validation_error'
      USING DETAIL = 'legal_name is required.';
  END IF;

  IF p_residence_country IS NULL OR trim(p_residence_country) = '' THEN
    RAISE EXCEPTION 'validation_error'
      USING DETAIL = 'residence_country is required.';
  END IF;

  IF p_address_line1 IS NULL OR trim(p_address_line1) = '' THEN
    RAISE EXCEPTION 'validation_error'
      USING DETAIL = 'address_line1 is required.';
  END IF;

  IF p_city IS NULL OR trim(p_city) = '' THEN
    RAISE EXCEPTION 'validation_error'
      USING DETAIL = 'city is required.';
  END IF;

  IF p_postal_code IS NULL OR trim(p_postal_code) = '' THEN
    RAISE EXCEPTION 'validation_error'
      USING DETAIL = 'postal_code is required.';
  END IF;

  IF p_country IS NULL OR trim(p_country) = '' THEN
    RAISE EXCEPTION 'validation_error'
      USING DETAIL = 'country is required.';
  END IF;

  IF p_tax_residence_country IS NULL OR trim(p_tax_residence_country) = '' THEN
    RAISE EXCEPTION 'validation_error'
      USING DETAIL = 'tax_residence_country is required.';
  END IF;

  IF p_paypal_email IS NULL OR trim(p_paypal_email) = '' THEN
    RAISE EXCEPTION 'validation_error'
      USING DETAIL = 'paypal_email is required.';
  END IF;

  -- PayPal email 形式チェック（@ と . を含む最低限）
  IF p_paypal_email NOT LIKE '%@%.%' THEN
    RAISE EXCEPTION 'validation_error'
      USING DETAIL = 'paypal_email must be a valid email address.';
  END IF;

  -- ── 同意チェック ─────────────────────────────────────────
  IF p_user_confirmed_legal_responsibility IS NOT TRUE THEN
    RAISE EXCEPTION 'validation_error'
      USING DETAIL = 'user_confirmed_legal_responsibility must be true.';
  END IF;

  IF p_user_confirmed_paypal_name_match IS NOT TRUE THEN
    RAISE EXCEPTION 'validation_error'
      USING DETAIL = 'user_confirmed_paypal_name_match must be true.';
  END IF;

  -- ── submission_data 構築 ──────────────────────────────────
  -- 全フィールドと submitted_at を jsonb に格納
  v_delete_after := NOW() + INTERVAL '72 hours';
  v_data := jsonb_build_object(
    'legal_name',                         p_legal_name,
    'display_name',                       p_display_name,
    'residence_country',                  p_residence_country,
    'address_line1',                      p_address_line1,
    'address_line2',                      p_address_line2,
    'city',                               p_city,
    'region',                             p_region,
    'postal_code',                        p_postal_code,
    'country',                            p_country,
    'tax_residence_country',              p_tax_residence_country,
    'domestic_or_foreign',                p_domestic_or_foreign,
    'paypal_email',                       p_paypal_email,
    'preferred_currency',                 p_preferred_currency,
    'user_confirmed_legal_responsibility', p_user_confirmed_legal_responsibility,
    'user_confirmed_paypal_name_match',   p_user_confirmed_paypal_name_match,
    'submitted_at',                       NOW()
  );

  -- ── INSERT ────────────────────────────────────────────────
  INSERT INTO prize_temp_tax_submissions (
    award_id,
    user_id,
    status,
    submission_data,
    delete_after
  ) VALUES (
    p_award_id,
    v_caller_id,
    'submitted',
    v_data,
    v_delete_after
  )
  RETURNING id INTO v_sub_id;

  -- ── archive log（PII なし） ────────────────────────────────
  INSERT INTO prize_archive_logs (
    event_type,
    entity_type,
    entity_id,
    actor_user_id,
    after_state
  ) VALUES (
    'submission_created',
    'prize_temp_tax_submissions',
    v_sub_id,
    v_caller_id,
    jsonb_build_object(
      'award_id',      p_award_id,
      'status',        'submitted',
      'delete_after',  v_delete_after
    )
  );

  -- ── 戻り値（PIIなし） ─────────────────────────────────────
  RETURN QUERY
  SELECT
    v_sub_id      AS submission_id,
    p_award_id    AS award_id,
    'submitted'   AS status,
    v_delete_after AS delete_after;
END;
$$;

-- GRANT: authenticated のみ / anon 不可
REVOKE ALL ON FUNCTION submit_prize_tax_submission(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_prize_tax_submission(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean) TO authenticated;

-- ============================================================
-- 2. admin_list_prize_awards() — 戻り値拡張
--    latest_submission_* フィールドを LEFT JOIN で追加
--    PII を含まない（submission_data は返さない）
-- ============================================================

DROP FUNCTION IF EXISTS admin_list_prize_awards();

CREATE OR REPLACE FUNCTION admin_list_prize_awards()
RETURNS TABLE (
  award_id                          uuid,
  recipient_user_id                 uuid,
  recipient_display_name            text,
  source_kind                       text,
  source_arena_event_id             uuid,
  source_arena_match_id             uuid,
  amount_cents                      int,
  currency                          text,
  prize_kind                        text,
  award_status                      text,
  latest_payout_status              text,
  notes                             text,
  hold_reason                       text,
  cancel_reason                     text,
  canceled_at                       timestamptz,
  created_by_user_id                uuid,
  created_at                        timestamptz,
  -- RP-4 追加
  latest_submission_id              uuid,
  latest_submission_status          text,
  latest_submission_submitted_at    timestamptz,
  latest_submission_delete_after    timestamptz,
  latest_submission_data_cleared_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_is_admin  boolean;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT is_admin INTO v_is_admin
    FROM profiles WHERE id = v_caller_id;
  IF v_is_admin IS NULL OR v_is_admin = FALSE THEN
    RAISE EXCEPTION 'not_admin'
      USING DETAIL = 'Only admins can list prize awards.';
  END IF;

  RETURN QUERY
  SELECT
    a.id                    AS award_id,
    a.recipient_user_id,
    p.display_name          AS recipient_display_name,
    a.source_kind,
    a.source_arena_event_id,
    a.source_arena_match_id,
    a.amount_cents,
    a.currency,
    a.prize_kind,
    a.status                AS award_status,
    -- 最新 payout status (active: pending / in_csv / paid)
    (
      SELECT pp.status
      FROM prize_payouts pp
      WHERE pp.award_id = a.id
        AND pp.status IN ('pending','in_csv','paid')
      ORDER BY
        CASE pp.status
          WHEN 'paid'    THEN 1
          WHEN 'in_csv'  THEN 2
          WHEN 'pending' THEN 3
        END
      LIMIT 1
    )                       AS latest_payout_status,
    a.notes,
    a.hold_reason,
    a.cancel_reason,
    a.canceled_at,
    a.created_by_user_id,
    a.created_at,
    -- RP-4: latest submission（PII なし）
    sub.id                  AS latest_submission_id,
    sub.status              AS latest_submission_status,
    sub.created_at          AS latest_submission_submitted_at,
    sub.delete_after        AS latest_submission_delete_after,
    sub.data_cleared_at     AS latest_submission_data_cleared_at
  FROM prize_awards a
  LEFT JOIN profiles p ON p.id = a.recipient_user_id
  LEFT JOIN LATERAL (
    SELECT s.id, s.status, s.created_at, s.delete_after, s.data_cleared_at
    FROM prize_temp_tax_submissions s
    WHERE s.award_id = a.id
    ORDER BY s.created_at DESC
    LIMIT 1
  ) sub ON true
  ORDER BY a.created_at DESC
  LIMIT 100;
END;
$$;

REVOKE ALL ON FUNCTION admin_list_prize_awards() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_prize_awards() TO authenticated;
