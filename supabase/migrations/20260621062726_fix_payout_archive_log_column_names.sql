-- ============================================================
-- fix_payout_archive_log_column_names
--
-- 問題:
--   admin_mark_payout_paid / admin_mark_payout_failed /
--   admin_cancel_payout / admin_retry_payout の
--   INSERT INTO prize_archive_logs が、存在しないカラム
--   「action」「performed_by_user_id」を参照していた。
--
-- 修正:
--   action          → event_type
--   performed_by_user_id → actor_user_id
--
-- 変更しないもの:
--   関数名 / 引数 / 戻り値 / Adminチェック / 状態遷移ロジック
--   SECURITY DEFINER / SET search_path = public
--   GRANT / REVOKE 方針
--   INSERT する値の意味・内容
--
-- 禁止事項（この migration は定義修正のみ）:
--   Payout 操作実行禁止
--   PayPal 送金禁止
--   prize_archive_logs への手動 INSERT/UPDATE/DELETE 禁止
-- ============================================================

-- ============================================================
-- 1. admin_mark_payout_paid
--    変更箇所: INSERT INTO prize_archive_logs の
--              action → event_type
--              performed_by_user_id → actor_user_id
-- ============================================================

DROP FUNCTION IF EXISTS admin_mark_payout_paid(uuid, text, timestamptz, int, int, int, numeric, text, text);

CREATE OR REPLACE FUNCTION admin_mark_payout_paid(
  p_payout_id         uuid,
  p_paypal_payout_id  text,
  p_paid_at           timestamptz DEFAULT NULL,
  p_gross_amount_cents int        DEFAULT NULL,
  p_fee_amount_cents  int         DEFAULT NULL,
  p_net_amount_cents  int         DEFAULT NULL,
  p_exchange_rate     numeric     DEFAULT NULL,
  p_exchange_currency text        DEFAULT NULL,
  p_admin_note        text        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin    boolean;
  v_payout      prize_payouts%ROWTYPE;
  v_paid_at     timestamptz;
  v_now         timestamptz := clock_timestamp();
BEGIN
  -- ── 1. 認証確認 ────────────────────────────────────────────────────────
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

  -- ── 2. payout 取得とロック ──────────────────────────────────────────────
  SELECT *
    INTO v_payout
    FROM prize_payouts
   WHERE id = p_payout_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout_not_found';
  END IF;

  -- ── 3. status 確認（prepared のみ許可） ────────────────────────────────
  IF v_payout.status != 'prepared' THEN
    RAISE EXCEPTION 'payout_not_in_prepared_status: current status is %', v_payout.status;
  END IF;

  -- ── 4. paypal_payout_id 必須チェック ──────────────────────────────────
  IF p_paypal_payout_id IS NULL OR length(btrim(p_paypal_payout_id)) = 0 THEN
    RAISE EXCEPTION 'paypal_payout_id_required';
  END IF;

  -- ── 5. paypal_payout_id 重複チェック ──────────────────────────────────
  IF EXISTS (
    SELECT 1
      FROM prize_payouts
     WHERE paypal_payout_id = p_paypal_payout_id
       AND id != p_payout_id
  ) THEN
    RAISE EXCEPTION 'paypal_payout_id_already_used';
  END IF;

  -- ── 6. paid_at 計算と範囲チェック ─────────────────────────────────────
  v_paid_at := COALESCE(p_paid_at, v_now);

  IF v_paid_at < v_now - interval '30 days' THEN
    RAISE EXCEPTION 'paid_at_too_far_in_past: must be within 30 days';
  END IF;

  IF v_paid_at > v_now + interval '5 minutes' THEN
    RAISE EXCEPTION 'paid_at_too_far_in_future: must be within +5 minutes';
  END IF;

  -- ── 7. gross / fee / net 非負チェック ─────────────────────────────────
  IF p_gross_amount_cents IS NOT NULL AND p_gross_amount_cents < 0 THEN
    RAISE EXCEPTION 'gross_amount_cents_must_be_non_negative';
  END IF;
  IF p_fee_amount_cents IS NOT NULL AND p_fee_amount_cents < 0 THEN
    RAISE EXCEPTION 'fee_amount_cents_must_be_non_negative';
  END IF;
  IF p_net_amount_cents IS NOT NULL AND p_net_amount_cents < 0 THEN
    RAISE EXCEPTION 'net_amount_cents_must_be_non_negative';
  END IF;

  -- ── 8. gross / fee / net 整合チェック（三つすべて揃っている場合） ──────
  IF p_gross_amount_cents IS NOT NULL
     AND p_fee_amount_cents IS NOT NULL
     AND p_net_amount_cents IS NOT NULL
  THEN
    IF abs(p_gross_amount_cents - (p_fee_amount_cents + p_net_amount_cents)) > 1 THEN
      RAISE EXCEPTION 'gross_fee_net_mismatch: abs(gross - (fee + net)) must be <= 1 cent';
    END IF;
  END IF;

  -- ── 9. gross と snapshot金額の一致チェック ────────────────────────────
  IF p_gross_amount_cents IS NOT NULL THEN
    IF abs(p_gross_amount_cents - v_payout.amount_cents_snapshot) > 1 THEN
      RAISE EXCEPTION 'gross_snapshot_mismatch: gross_amount_cents must match amount_cents_snapshot (±1 cent). snapshot=%, input=%',
        v_payout.amount_cents_snapshot, p_gross_amount_cents;
    END IF;
  END IF;

  -- ── 10. exchange_rate / exchange_currency ペアチェック ─────────────────
  IF (p_exchange_rate IS NULL) != (p_exchange_currency IS NULL) THEN
    RAISE EXCEPTION 'exchange_rate_currency_must_be_pair: both must be NULL or both NOT NULL';
  END IF;

  IF p_exchange_rate IS NOT NULL AND p_exchange_rate <= 0 THEN
    RAISE EXCEPTION 'exchange_rate_must_be_positive';
  END IF;

  IF p_exchange_currency IS NOT NULL AND length(p_exchange_currency) != 3 THEN
    RAISE EXCEPTION 'exchange_currency_must_be_3_chars';
  END IF;

  -- ── 11. admin_note 文字数チェック ─────────────────────────────────────
  IF p_admin_note IS NOT NULL AND length(p_admin_note) > 1000 THEN
    RAISE EXCEPTION 'admin_note_too_long: max 1000 chars';
  END IF;

  -- ── 12. UPDATE ─────────────────────────────────────────────────────────
  UPDATE prize_payouts
     SET status             = 'paid',
         paypal_payout_id   = p_paypal_payout_id,
         paid_at            = v_paid_at,
         gross_amount_cents = p_gross_amount_cents,
         fee_amount_cents   = p_fee_amount_cents,
         net_amount_cents   = p_net_amount_cents,
         exchange_rate      = p_exchange_rate,
         exchange_currency  = p_exchange_currency,
         admin_note         = p_admin_note,
         paid_by_user_id    = auth.uid(),
         updated_at         = v_now
   WHERE id = p_payout_id;

  -- ── 13. archive log INSERT（PIIなし / paypal_payout_id本文なし） ────────
  -- 修正: action → event_type / performed_by_user_id → actor_user_id
  INSERT INTO prize_archive_logs (
    id,
    event_type,
    entity_type,
    entity_id,
    actor_user_id,
    before_state,
    after_state,
    created_at
  ) VALUES (
    gen_random_uuid(),
    'payout_paid',
    'payout',
    p_payout_id,
    auth.uid(),
    jsonb_build_object(
      'award_id',       v_payout.award_id,
      'payout_status',  v_payout.status,
      'payment_method', v_payout.payment_method,
      'amount_cents',   v_payout.amount_cents_snapshot,
      'currency',       v_payout.currency_snapshot
    ),
    jsonb_build_object(
      'award_id',            v_payout.award_id,
      'payout_id',           p_payout_id,
      'payout_status',       'paid',
      'paid_at',             v_paid_at,
      'payment_method',      v_payout.payment_method,
      'amount_cents',        v_payout.amount_cents_snapshot,
      'currency',            v_payout.currency_snapshot,
      'has_paypal_payout_id', true,
      'has_paid_at',          true,
      'has_gross_recorded',   p_gross_amount_cents IS NOT NULL,
      'has_fee_recorded',     p_fee_amount_cents IS NOT NULL,
      'has_net_recorded',     p_net_amount_cents IS NOT NULL,
      'has_exchange',         p_exchange_rate IS NOT NULL,
      'gross_amount_cents',   p_gross_amount_cents,
      'fee_amount_cents',     p_fee_amount_cents,
      'net_amount_cents',     p_net_amount_cents
    ),
    v_now
  );

  -- ── 14. 戻り値（PIIなし） ───────────────────────────────────────────────
  RETURN jsonb_build_object(
    'ok',           true,
    'payout_id',    p_payout_id,
    'status',       'paid',
    'paid_at',      v_paid_at,
    'payment_method', v_payout.payment_method
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_mark_payout_paid(uuid, text, timestamptz, int, int, int, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_mark_payout_paid(uuid, text, timestamptz, int, int, int, numeric, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION admin_mark_payout_paid(uuid, text, timestamptz, int, int, int, numeric, text, text) TO authenticated;

COMMENT ON FUNCTION admin_mark_payout_paid(uuid, text, timestamptz, int, int, int, numeric, text, text) IS
  'Admin: mark a prepared payout as paid. Records PayPal Transaction ID, paid_at, and optional amounts. Returns result without PII.';

-- ============================================================
-- 2. admin_mark_payout_failed
--    変更箇所: INSERT INTO prize_archive_logs の
--              action → event_type
--              performed_by_user_id → actor_user_id
-- ============================================================

DROP FUNCTION IF EXISTS admin_mark_payout_failed(uuid, text, text);

CREATE OR REPLACE FUNCTION admin_mark_payout_failed(
  p_payout_id      uuid,
  p_failure_reason text,
  p_admin_note     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin     boolean;
  v_payout       prize_payouts%ROWTYPE;
  v_clean_reason text;
  v_now          timestamptz := clock_timestamp();
BEGIN
  -- ── 1. 認証確認 ────────────────────────────────────────────────────────
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

  -- ── 2. payout 取得とロック ──────────────────────────────────────────────
  SELECT *
    INTO v_payout
    FROM prize_payouts
   WHERE id = p_payout_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout_not_found';
  END IF;

  -- ── 3. status 確認（prepared のみ許可） ────────────────────────────────
  IF v_payout.status != 'prepared' THEN
    RAISE EXCEPTION 'payout_not_in_prepared_status: current status is %', v_payout.status;
  END IF;

  -- ── 4. failure_reason 必須 / 文字数チェック ───────────────────────────
  IF p_failure_reason IS NULL OR length(btrim(p_failure_reason)) = 0 THEN
    RAISE EXCEPTION 'failure_reason_required';
  END IF;

  v_clean_reason := btrim(p_failure_reason);

  IF length(v_clean_reason) < 3 THEN
    RAISE EXCEPTION 'failure_reason_too_short: minimum 3 chars';
  END IF;

  IF length(v_clean_reason) > 500 THEN
    RAISE EXCEPTION 'failure_reason_too_long: maximum 500 chars';
  END IF;

  -- ── 5. admin_note 文字数チェック ─────────────────────────────────────
  IF p_admin_note IS NOT NULL AND length(p_admin_note) > 1000 THEN
    RAISE EXCEPTION 'admin_note_too_long: max 1000 chars';
  END IF;

  -- ── 6. UPDATE ─────────────────────────────────────────────────────────
  UPDATE prize_payouts
     SET status           = 'failed',
         failed_at        = v_now,
         failure_reason   = v_clean_reason,
         failed_by_user_id = auth.uid(),
         admin_note       = p_admin_note,
         updated_at       = v_now
   WHERE id = p_payout_id;

  -- ── 7. archive log INSERT（PIIなし / failure_reason本文なし） ───────────
  -- 修正: action → event_type / performed_by_user_id → actor_user_id
  INSERT INTO prize_archive_logs (
    id,
    event_type,
    entity_type,
    entity_id,
    actor_user_id,
    before_state,
    after_state,
    created_at
  ) VALUES (
    gen_random_uuid(),
    'payout_failed',
    'payout',
    p_payout_id,
    auth.uid(),
    jsonb_build_object(
      'award_id',       v_payout.award_id,
      'payout_status',  v_payout.status,
      'payment_method', v_payout.payment_method,
      'amount_cents',   v_payout.amount_cents_snapshot,
      'currency',       v_payout.currency_snapshot
    ),
    jsonb_build_object(
      'award_id',              v_payout.award_id,
      'payout_id',             p_payout_id,
      'payout_status',         'failed',
      'failed_at',             v_now,
      'has_failure_reason',    true,
      'failure_reason_length', length(v_clean_reason),
      'payment_method',        v_payout.payment_method,
      'amount_cents',          v_payout.amount_cents_snapshot,
      'currency',              v_payout.currency_snapshot
    ),
    v_now
  );

  -- ── 8. 戻り値（PIIなし） ───────────────────────────────────────────────
  RETURN jsonb_build_object(
    'ok',           true,
    'payout_id',    p_payout_id,
    'status',       'failed',
    'failed_at',    v_now,
    'payment_method', v_payout.payment_method
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_mark_payout_failed(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_mark_payout_failed(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION admin_mark_payout_failed(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION admin_mark_payout_failed(uuid, text, text) IS
  'Admin: mark a prepared payout as failed. Records failure_reason and failed_at. Returns result without PII or failure_reason content.';

-- ============================================================
-- 3. admin_cancel_payout
--    変更箇所: INSERT INTO prize_archive_logs の
--              action → event_type
--              performed_by_user_id → actor_user_id
-- ============================================================

DROP FUNCTION IF EXISTS admin_cancel_payout(uuid, text, text);

CREATE OR REPLACE FUNCTION admin_cancel_payout(
  p_payout_id     uuid,
  p_cancel_reason text,
  p_admin_note    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin     boolean;
  v_payout       prize_payouts%ROWTYPE;
  v_clean_reason text;
  v_now          timestamptz := clock_timestamp();
BEGIN
  -- ── 1. 認証確認 ────────────────────────────────────────────────────────
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

  -- ── 2. payout 取得とロック ──────────────────────────────────────────────
  SELECT *
    INTO v_payout
    FROM prize_payouts
   WHERE id = p_payout_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout_not_found';
  END IF;

  -- ── 3. status 確認（prepared のみ許可） ────────────────────────────────
  IF v_payout.status != 'prepared' THEN
    RAISE EXCEPTION 'payout_not_in_prepared_status: current status is %, only prepared can be canceled', v_payout.status;
  END IF;

  -- ── 4. cancel_reason 必須 / 文字数チェック ───────────────────────────
  IF p_cancel_reason IS NULL OR length(btrim(p_cancel_reason)) = 0 THEN
    RAISE EXCEPTION 'cancel_reason_required';
  END IF;

  v_clean_reason := btrim(p_cancel_reason);

  IF length(v_clean_reason) < 3 THEN
    RAISE EXCEPTION 'cancel_reason_too_short: minimum 3 chars';
  END IF;

  IF length(v_clean_reason) > 500 THEN
    RAISE EXCEPTION 'cancel_reason_too_long: maximum 500 chars';
  END IF;

  -- ── 5. admin_note 文字数チェック ─────────────────────────────────────
  IF p_admin_note IS NOT NULL AND length(p_admin_note) > 1000 THEN
    RAISE EXCEPTION 'admin_note_too_long: max 1000 chars';
  END IF;

  -- ── 6. UPDATE ─────────────────────────────────────────────────────────
  UPDATE prize_payouts
     SET status               = 'canceled',
         canceled_at          = v_now,
         cancel_reason        = v_clean_reason,
         canceled_by_user_id  = auth.uid(),
         admin_note           = p_admin_note,
         updated_at           = v_now
   WHERE id = p_payout_id;

  -- ── 7. archive log INSERT（PIIなし / cancel_reason本文なし） ────────────
  -- 修正: action → event_type / performed_by_user_id → actor_user_id
  INSERT INTO prize_archive_logs (
    id,
    event_type,
    entity_type,
    entity_id,
    actor_user_id,
    before_state,
    after_state,
    created_at
  ) VALUES (
    gen_random_uuid(),
    'payout_canceled',
    'payout',
    p_payout_id,
    auth.uid(),
    jsonb_build_object(
      'award_id',       v_payout.award_id,
      'payout_status',  v_payout.status,
      'payment_method', v_payout.payment_method,
      'amount_cents',   v_payout.amount_cents_snapshot,
      'currency',       v_payout.currency_snapshot
    ),
    jsonb_build_object(
      'award_id',            v_payout.award_id,
      'payout_id',           p_payout_id,
      'payout_status',       'canceled',
      'canceled_at',         v_now,
      'has_cancel_reason',   true,
      'cancel_reason_length', length(v_clean_reason),
      'payment_method',      v_payout.payment_method,
      'amount_cents',        v_payout.amount_cents_snapshot,
      'currency',            v_payout.currency_snapshot
    ),
    v_now
  );

  -- ── 8. 戻り値（PIIなし） ───────────────────────────────────────────────
  RETURN jsonb_build_object(
    'ok',          true,
    'payout_id',   p_payout_id,
    'status',      'canceled',
    'canceled_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_cancel_payout(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_cancel_payout(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION admin_cancel_payout(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION admin_cancel_payout(uuid, text, text) IS
  'Admin: cancel a prepared payout. Sets status=canceled with canceled_at, cancel_reason, canceled_by_user_id. '
  'Returns result without PII or cancel_reason content. Only prepared status can be canceled.';

-- ============================================================
-- 4. admin_retry_payout
--    変更箇所: INSERT INTO prize_archive_logs の
--              action → event_type
--              performed_by_user_id → actor_user_id
-- ============================================================

DROP FUNCTION IF EXISTS admin_retry_payout(uuid, text, text);

CREATE OR REPLACE FUNCTION admin_retry_payout(
  p_source_payout_id uuid,
  p_retry_reason     text,
  p_admin_note       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin      boolean;
  v_source        prize_payouts%ROWTYPE;
  v_award         prize_awards%ROWTYPE;
  v_clean_reason  text;
  v_chain_depth   int;
  v_active_count  int;
  v_new_payout_id uuid;
  v_now           timestamptz := clock_timestamp();
BEGIN
  -- ── 1. 認証確認 ────────────────────────────────────────────────────────
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

  -- ── 2. source payout 取得とロック ─────────────────────────────────────
  SELECT *
    INTO v_source
    FROM prize_payouts
   WHERE id = p_source_payout_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source_payout_not_found';
  END IF;

  -- ── 3. source payout status 確認（failed / canceled のみ許可） ────────
  IF v_source.status NOT IN ('failed', 'canceled') THEN
    RAISE EXCEPTION 'source_payout_not_retriable: status is %, only failed or canceled can be retried', v_source.status;
  END IF;

  -- ── 4. source payout recipient snapshot 確認（redaction後は拒否） ─────
  IF v_source.recipient_email_snapshot IS NULL OR v_source.recipient_name_snapshot IS NULL THEN
    RAISE EXCEPTION 'source_redacted_cannot_retry: recipient snapshot has been redacted, cannot retry. A new submission flow is needed.';
  END IF;

  -- ── 5. payment_method 確認（paypal_manual のみ許可） ──────────────────
  IF v_source.payment_method != 'paypal_manual' THEN
    RAISE EXCEPTION 'unsupported_payment_method: only paypal_manual is supported for retry, got %', v_source.payment_method;
  END IF;

  -- ── 6. retry_reason 必須 / 文字数チェック ────────────────────────────
  IF p_retry_reason IS NULL OR length(btrim(p_retry_reason)) = 0 THEN
    RAISE EXCEPTION 'retry_reason_required';
  END IF;

  v_clean_reason := btrim(p_retry_reason);

  IF length(v_clean_reason) < 3 THEN
    RAISE EXCEPTION 'retry_reason_too_short: minimum 3 chars';
  END IF;

  IF length(v_clean_reason) > 500 THEN
    RAISE EXCEPTION 'retry_reason_too_long: maximum 500 chars';
  END IF;

  -- ── 7. admin_note 文字数チェック ─────────────────────────────────────
  IF p_admin_note IS NOT NULL AND length(p_admin_note) > 1000 THEN
    RAISE EXCEPTION 'admin_note_too_long: max 1000 chars';
  END IF;

  -- ── 8. award 取得とロック ─────────────────────────────────────────────
  SELECT *
    INTO v_award
    FROM prize_awards
   WHERE id = v_source.award_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'award_not_found';
  END IF;

  -- ── 9. award.status = eligible 再確認 ───────────────────────────────
  IF v_award.status != 'eligible' THEN
    RAISE EXCEPTION 'award_not_eligible: award status is %, must be eligible to retry', v_award.status;
  END IF;

  -- ── 10. active payout 存在チェック ───────────────────────────────────
  SELECT COUNT(*)
    INTO v_active_count
    FROM prize_payouts
   WHERE award_id = v_source.award_id
     AND status IN ('prepared', 'paid');

  IF v_active_count > 0 THEN
    RAISE EXCEPTION 'active_payout_exists: cannot retry while active (prepared or paid) payout exists for this award';
  END IF;

  -- ── 11. retry chain depth チェック ───────────────────────────────────
  WITH RECURSIVE chain AS (
    SELECT id, retry_source_payout_id, 1 AS depth
      FROM prize_payouts
     WHERE id = p_source_payout_id

    UNION ALL

    SELECT p.id, p.retry_source_payout_id, c.depth + 1
      FROM prize_payouts p
      JOIN chain c ON p.id = c.retry_source_payout_id
     WHERE c.depth < 12
  )
  SELECT MAX(depth) INTO v_chain_depth FROM chain;

  IF COALESCE(v_chain_depth, 0) >= 10 THEN
    RAISE EXCEPTION 'retry_chain_too_deep: retry chain depth is %, maximum is 9', v_chain_depth;
  END IF;

  -- ── 12. 新規 prepared payout を INSERT ───────────────────────────────
  v_new_payout_id := gen_random_uuid();

  INSERT INTO prize_payouts (
    id,
    award_id,
    status,
    amount_cents_snapshot,
    currency_snapshot,
    recipient_email_snapshot,
    recipient_name_snapshot,
    recipient_email_hash,
    recipient_name_hash,
    payment_method,
    source_submission_id,
    retry_source_payout_id,
    admin_note,
    created_by_user_id,
    created_at,
    updated_at
  ) VALUES (
    v_new_payout_id,
    v_source.award_id,
    'prepared',
    v_source.amount_cents_snapshot,
    v_source.currency_snapshot,
    v_source.recipient_email_snapshot,
    v_source.recipient_name_snapshot,
    v_source.recipient_email_hash,
    v_source.recipient_name_hash,
    v_source.payment_method,
    v_source.source_submission_id,
    v_source.id,
    p_admin_note,
    auth.uid(),
    v_now,
    v_now
  );

  -- ── 13. archive log INSERT（PIIなし / retry_reason本文なし） ────────────
  -- 修正: action → event_type / performed_by_user_id → actor_user_id
  INSERT INTO prize_archive_logs (
    id,
    event_type,
    entity_type,
    entity_id,
    actor_user_id,
    before_state,
    after_state,
    created_at
  ) VALUES (
    gen_random_uuid(),
    'payout_retried',
    'payout',
    v_new_payout_id,
    auth.uid(),
    jsonb_build_object(
      'source_payout_id',     p_source_payout_id,
      'source_payout_status', v_source.status,
      'award_id',             v_source.award_id,
      'payment_method',       v_source.payment_method,
      'amount_cents',         v_source.amount_cents_snapshot,
      'currency',             v_source.currency_snapshot
    ),
    jsonb_build_object(
      'source_payout_id',        p_source_payout_id,
      'new_payout_id',           v_new_payout_id,
      'new_status',              'prepared',
      'retry_source_payout_id',  v_source.id,
      'award_id',                v_source.award_id,
      'payment_method',          v_source.payment_method,
      'amount_cents',            v_source.amount_cents_snapshot,
      'currency',                v_source.currency_snapshot,
      'has_retry_reason',        true,
      'retry_reason_length',     length(v_clean_reason),
      'has_recipient_snapshot',  true,
      'has_recipient_hash',      (v_source.recipient_email_hash IS NOT NULL),
      'source_submission_id',    v_source.source_submission_id
    ),
    v_now
  );

  -- ── 14. 戻り値（PIIなし） ───────────────────────────────────────────────
  RETURN jsonb_build_object(
    'ok',             true,
    'new_payout_id',  v_new_payout_id,
    'source_payout_id', p_source_payout_id,
    'status',         'prepared',
    'payment_method', v_source.payment_method
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_retry_payout(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_retry_payout(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION admin_retry_payout(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION admin_retry_payout(uuid, text, text) IS
  'Admin: create a new prepared payout from a failed or canceled source payout. '
  'Snapshots are copied from source only — no re-fetch from submission_data, no admin re-input. '
  'Source payout is not modified. Returns result without PII or retry_reason content. '
  'Validates: source must be failed/canceled, snapshots not redacted, award eligible, no active payout, chain depth < 10.';
