-- ============================================================
-- Fix: submit_prize_tax_submission — award_id ambiguous 修正
--
-- PERFORM句の prize_temp_tax_submissions に table alias を付与し、
-- award_id の曖昧な参照を解消する。
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

  -- ── 重複提出チェック（table alias で ambiguous 解消）─────
  PERFORM 1
    FROM prize_temp_tax_submissions pts
   WHERE pts.award_id = p_award_id
     AND pts.status IN ('submitted', 'reviewed', 'archived', 'data_cleared');

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

  -- PayPal email 形式チェック
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
    v_sub_id       AS submission_id,
    p_award_id     AS award_id,
    'submitted'::text AS status,
    v_delete_after AS delete_after;
END;
$$;

-- GRANT
REVOKE ALL ON FUNCTION submit_prize_tax_submission(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_prize_tax_submission(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean) TO authenticated;
