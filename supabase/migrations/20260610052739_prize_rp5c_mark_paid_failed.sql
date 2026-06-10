-- ============================================================
-- RP-5c: Reward / Prize — Mark as Paid / Failed RPC + UI
--
-- A. Alignment migration
--    1. gross_amount_cents / failed_at / failure_reason /
--       failed_by_user_id / paid_by_user_id 列追加
--    2. prize_payouts_gross_check CHECK制約
--    3. prize_payouts_failed_requires CHECK制約
--    4. paypal_payout_id COMMENT更新
--    5. prevent_paid_payout_mutation() 拡張（RP-5b/RP-5c列を含む）
--
-- B. admin_mark_payout_paid(...) RPC
-- C. admin_mark_payout_failed(...) RPC
--
-- 禁止事項:
--   - PayPal API実装
--   - CSV生成
--   - PayPal送金実行
--   - Cancel / Retry RPC
--   - bulk Mark as Paid / Failed
--   - 自動 Mark as Paid
--   - Edge Function / cron / pg_cron
--   - submission_data操作
--   - Winner File archive操作
--   - award status変更
--   - paid → failed / failed → paid / paid → prepared / failed → prepared
--   - paid後のadmin_note編集
--   - failed後のfailure_reason編集
--   - paypal_payout_id事後変更
--   - paid_at事後変更
--   - archive logへのPII保存
--   - paypal_payout_id本文のarchive log保存
--   - failure_reason本文のarchive log保存
--   - prize_payoutsへの直接INSERT/UPDATE/DELETE policy追加
--   - RP-1〜RP-5bの権限緩和
--   - RP-5a partial UNIQUE条件変更
--   - RP-5b prepare RPC変更
-- ============================================================

-- ============================================================
-- A-1. 列追加
-- ============================================================

ALTER TABLE prize_payouts
  ADD COLUMN IF NOT EXISTS gross_amount_cents   int,
  ADD COLUMN IF NOT EXISTS failed_at            timestamptz,
  ADD COLUMN IF NOT EXISTS failure_reason       text,
  ADD COLUMN IF NOT EXISTS failed_by_user_id    uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS paid_by_user_id      uuid REFERENCES auth.users(id);

COMMENT ON COLUMN prize_payouts.gross_amount_cents IS
  'adminが記録した送金総額（cents）。PayPal送金実行後に入力。fee_amount_cents + net_amount_cents との整合が必要（±1 cent）。';
COMMENT ON COLUMN prize_payouts.failed_at IS
  'admin_mark_payout_failedが呼ばれた時刻。';
COMMENT ON COLUMN prize_payouts.failure_reason IS
  '失敗理由（3〜500文字）。PII禁止。archive logには本文を保存しない。';
COMMENT ON COLUMN prize_payouts.failed_by_user_id IS
  'Mark as Failedを実行したadminのuser_id。';
COMMENT ON COLUMN prize_payouts.paid_by_user_id IS
  'Mark as Paidを実行したadminのuser_id。';

-- ============================================================
-- A-2. gross_amount_cents CHECK制約
-- ============================================================

ALTER TABLE prize_payouts
  DROP CONSTRAINT IF EXISTS prize_payouts_gross_check;

ALTER TABLE prize_payouts
  ADD CONSTRAINT prize_payouts_gross_check
    CHECK (gross_amount_cents IS NULL OR gross_amount_cents >= 0);

-- ============================================================
-- A-3. failed_requires CHECK制約
-- ============================================================

ALTER TABLE prize_payouts
  DROP CONSTRAINT IF EXISTS prize_payouts_failed_requires;

ALTER TABLE prize_payouts
  ADD CONSTRAINT prize_payouts_failed_requires
    CHECK (
      status != 'failed'
      OR (
        failed_at IS NOT NULL
        AND failure_reason IS NOT NULL
        AND length(btrim(failure_reason)) >= 3
      )
    );

-- ============================================================
-- A-4. paypal_payout_id COMMENT更新
-- ============================================================

COMMENT ON COLUMN prize_payouts.paypal_payout_id IS
  'PayPal取引識別子。手動運用時はPayPal管理画面のTransaction ID。将来PayPal Payouts API統合時はpayout_item_idを格納。UNIQUE制約により全payoutで唯一性保証。';

-- ============================================================
-- A-5. prevent_paid_payout_mutation() 拡張
--      RP-5b/RP-5c列を含む全 immutable フィールドをカバー
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_paid_payout_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- ── paid payout: critical fields は変更禁止 ───────────────────────────
  IF OLD.status = 'paid' THEN
    IF (
      NEW.status                IS DISTINCT FROM OLD.status               OR
      NEW.award_id              IS DISTINCT FROM OLD.award_id             OR
      NEW.amount_cents_snapshot IS DISTINCT FROM OLD.amount_cents_snapshot OR
      NEW.currency_snapshot     IS DISTINCT FROM OLD.currency_snapshot     OR
      NEW.payment_method        IS DISTINCT FROM OLD.payment_method        OR
      NEW.source_submission_id  IS DISTINCT FROM OLD.source_submission_id  OR
      NEW.paypal_payout_id      IS DISTINCT FROM OLD.paypal_payout_id      OR
      NEW.paid_at               IS DISTINCT FROM OLD.paid_at               OR
      NEW.gross_amount_cents    IS DISTINCT FROM OLD.gross_amount_cents     OR
      NEW.fee_amount_cents      IS DISTINCT FROM OLD.fee_amount_cents       OR
      NEW.net_amount_cents      IS DISTINCT FROM OLD.net_amount_cents       OR
      NEW.exchange_rate         IS DISTINCT FROM OLD.exchange_rate          OR
      NEW.exchange_currency     IS DISTINCT FROM OLD.exchange_currency      OR
      NEW.admin_note            IS DISTINCT FROM OLD.admin_note             OR
      NEW.paid_by_user_id       IS DISTINCT FROM OLD.paid_by_user_id        OR
      NEW.created_at            IS DISTINCT FROM OLD.created_at             OR
      NEW.created_by_user_id    IS DISTINCT FROM OLD.created_by_user_id     OR
      NEW.recipient_email_hash  IS DISTINCT FROM OLD.recipient_email_hash   OR
      NEW.recipient_name_hash   IS DISTINCT FROM OLD.recipient_name_hash
    ) THEN
      RAISE EXCEPTION 'paid_payout_critical_fields_immutable'
        USING DETAIL = 'A paid payout row critical fields cannot be modified.';
    END IF;

    -- recipient_email_snapshot: NULL化（redaction）のみ許可、別値への変更は禁止
    IF NEW.recipient_email_snapshot IS DISTINCT FROM OLD.recipient_email_snapshot THEN
      IF NEW.recipient_email_snapshot IS NOT NULL THEN
        RAISE EXCEPTION 'paid_payout_snapshot_change_denied'
          USING DETAIL = 'recipient_email_snapshot can only be set to NULL (redaction), not changed to another value.';
      END IF;
    END IF;

    -- recipient_name_snapshot: NULL化（redaction）のみ許可、別値への変更は禁止
    IF NEW.recipient_name_snapshot IS DISTINCT FROM OLD.recipient_name_snapshot THEN
      IF NEW.recipient_name_snapshot IS NOT NULL THEN
        RAISE EXCEPTION 'paid_payout_snapshot_change_denied'
          USING DETAIL = 'recipient_name_snapshot can only be set to NULL (redaction), not changed to another value.';
      END IF;
    END IF;
  END IF;

  -- ── failed payout: critical fields は変更禁止 ─────────────────────────
  IF OLD.status = 'failed' THEN
    IF (
      NEW.status                IS DISTINCT FROM OLD.status               OR
      NEW.award_id              IS DISTINCT FROM OLD.award_id             OR
      NEW.amount_cents_snapshot IS DISTINCT FROM OLD.amount_cents_snapshot OR
      NEW.currency_snapshot     IS DISTINCT FROM OLD.currency_snapshot     OR
      NEW.payment_method        IS DISTINCT FROM OLD.payment_method        OR
      NEW.source_submission_id  IS DISTINCT FROM OLD.source_submission_id  OR
      NEW.failed_at             IS DISTINCT FROM OLD.failed_at             OR
      NEW.failure_reason        IS DISTINCT FROM OLD.failure_reason         OR
      NEW.failed_by_user_id     IS DISTINCT FROM OLD.failed_by_user_id      OR
      NEW.admin_note            IS DISTINCT FROM OLD.admin_note             OR
      NEW.created_at            IS DISTINCT FROM OLD.created_at             OR
      NEW.created_by_user_id    IS DISTINCT FROM OLD.created_by_user_id     OR
      NEW.recipient_email_hash  IS DISTINCT FROM OLD.recipient_email_hash   OR
      NEW.recipient_name_hash   IS DISTINCT FROM OLD.recipient_name_hash
    ) THEN
      RAISE EXCEPTION 'failed_payout_critical_fields_immutable'
        USING DETAIL = 'A failed payout row critical fields cannot be modified.';
    END IF;

    -- recipient_email_snapshot: NULL化（redaction）のみ許可
    IF NEW.recipient_email_snapshot IS DISTINCT FROM OLD.recipient_email_snapshot THEN
      IF NEW.recipient_email_snapshot IS NOT NULL THEN
        RAISE EXCEPTION 'failed_payout_snapshot_change_denied'
          USING DETAIL = 'recipient_email_snapshot can only be set to NULL (redaction), not changed to another value.';
      END IF;
    END IF;

    -- recipient_name_snapshot: NULL化（redaction）のみ許可
    IF NEW.recipient_name_snapshot IS DISTINCT FROM OLD.recipient_name_snapshot THEN
      IF NEW.recipient_name_snapshot IS NOT NULL THEN
        RAISE EXCEPTION 'failed_payout_snapshot_change_denied'
          USING DETAIL = 'recipient_name_snapshot can only be set to NULL (redaction), not changed to another value.';
      END IF;
    END IF;
  END IF;

  -- ── canceled payout: status変更禁止 ──────────────────────────────────
  IF OLD.status = 'canceled' AND NEW.status != OLD.status THEN
    RAISE EXCEPTION 'terminated_payout_immutable'
      USING DETAIL = 'A canceled payout cannot change status.';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- B. admin_mark_payout_paid RPC
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
    p_payout_id,
    'payout_paid',
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
-- C. admin_mark_payout_failed RPC
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
    p_payout_id,
    'payout_failed',
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
