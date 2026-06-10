-- ============================================================
-- RP-5d: Reward / Prize — Cancel / Retry RPC + UI
--
-- A. Alignment migration
--    1. canceled_at / cancel_reason / canceled_by_user_id 列追加
--    2. retry_source_payout_id 列追加
--    3. prize_payouts_canceled_requires CHECK制約
--    4. index追加 (retry_source / canceled_at)
--    5. COMMENTのPII禁止明記
--    6. prevent_paid_payout_mutation() 拡張
--       - canceled terminal immutability
--       - retry_source_payout_id INSERT後 immutable
--
-- B. admin_cancel_payout(p_payout_id, p_cancel_reason, p_admin_note) RPC
-- C. admin_retry_payout(p_source_payout_id, p_retry_reason, p_admin_note) RPC
--
-- 禁止事項:
--   - PayPal API実装 / PayPal credential保存
--   - CSV生成 / CSV download/upload
--   - PayPal送金実行
--   - paid payout の cancel
--   - paid payout の retry
--   - canceled → prepared へのUPDATE
--   - failed → prepared へのUPDATE
--   - source payout のstatus変更 / snapshot変更
--   - retry時のrecipient情報再入力
--   - retry時のsubmission_data再取得
--   - retry時のpayment_method変更 / amount変更
--   - bulk cancel / bulk retry / 自動cancel / 自動retry
--   - Edge Function / cron / pg_cron
--   - redaction sweep
--   - submission_data操作 / Winner File archive操作
--   - award status自動変更
--   - retry chain深度無制限
--   - archive logへのPII保存
--   - cancel_reason / retry_reason本文のarchive log保存
--   - RP-1〜RP-5cの権限緩和
--   - RP-5a partial UNIQUE条件変更
--   - RP-5b prepare RPC変更
--   - RP-5c paid/failed RPC変更
-- ============================================================

-- ============================================================
-- A-1. cancel関連列追加
-- ============================================================

ALTER TABLE prize_payouts
  ADD COLUMN IF NOT EXISTS canceled_at          timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason        text,
  ADD COLUMN IF NOT EXISTS canceled_by_user_id  uuid REFERENCES auth.users(id);

COMMENT ON COLUMN prize_payouts.canceled_at IS
  'admin_cancel_payoutが呼ばれた時刻。canceled状態のときのみ値を持つ。';
COMMENT ON COLUMN prize_payouts.cancel_reason IS
  'キャンセル理由（3〜500文字）。PII禁止。archive logには本文を保存しない。';
COMMENT ON COLUMN prize_payouts.canceled_by_user_id IS
  'Cancel操作を実行したadminのuser_id。';

-- ============================================================
-- A-2. retry chain列追加
-- ============================================================

ALTER TABLE prize_payouts
  ADD COLUMN IF NOT EXISTS retry_source_payout_id uuid
    REFERENCES prize_payouts(id);

COMMENT ON COLUMN prize_payouts.retry_source_payout_id IS
  'この prepared payoutが、どのfailed/canceled payoutから作られたかを追跡する列。'
  'admin_retry_payout RPCでINSERTされ、その後は immutable（INSERT後変更禁止）。';

-- ============================================================
-- A-3. canceled必須CHECK制約
-- ============================================================

ALTER TABLE prize_payouts
  DROP CONSTRAINT IF EXISTS prize_payouts_canceled_requires;

ALTER TABLE prize_payouts
  ADD CONSTRAINT prize_payouts_canceled_requires
    CHECK (
      status != 'canceled'
      OR (
        canceled_at IS NOT NULL
        AND cancel_reason IS NOT NULL
        AND length(btrim(cancel_reason)) >= 3
      )
    );

-- ============================================================
-- A-4. index追加
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_prize_payouts_retry_source
  ON prize_payouts(retry_source_payout_id)
  WHERE retry_source_payout_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prize_payouts_canceled_at
  ON prize_payouts(canceled_at)
  WHERE canceled_at IS NOT NULL;

-- ============================================================
-- A-5. prevent_paid_payout_mutation() 拡張
--      RP-5d: canceled terminal immutability + retry_source_payout_id immutable
--
--      この関数は paid / failed / canceled のすべての terminal 状態を保護する。
--      canceled も paid / failed と同様に重要項目変更を禁止し、
--      recipient_email_snapshot / recipient_name_snapshot のNULL化（redaction）のみ許可する。
--      retry_source_payout_id はINSERT後 immutable（prepared状態でも変更不可）。
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

  -- ── canceled payout: terminal immutability ────────────────────────────
  -- paid / failed と同様に重要項目変更を禁止する
  IF OLD.status = 'canceled' THEN
    IF (
      NEW.status                IS DISTINCT FROM OLD.status               OR
      NEW.award_id              IS DISTINCT FROM OLD.award_id             OR
      NEW.amount_cents_snapshot IS DISTINCT FROM OLD.amount_cents_snapshot OR
      NEW.currency_snapshot     IS DISTINCT FROM OLD.currency_snapshot     OR
      NEW.recipient_email_hash  IS DISTINCT FROM OLD.recipient_email_hash   OR
      NEW.recipient_name_hash   IS DISTINCT FROM OLD.recipient_name_hash    OR
      NEW.payment_method        IS DISTINCT FROM OLD.payment_method          OR
      NEW.source_submission_id  IS DISTINCT FROM OLD.source_submission_id   OR
      NEW.canceled_at           IS DISTINCT FROM OLD.canceled_at            OR
      NEW.cancel_reason         IS DISTINCT FROM OLD.cancel_reason          OR
      NEW.canceled_by_user_id   IS DISTINCT FROM OLD.canceled_by_user_id    OR
      NEW.admin_note            IS DISTINCT FROM OLD.admin_note             OR
      NEW.created_at            IS DISTINCT FROM OLD.created_at             OR
      NEW.created_by_user_id    IS DISTINCT FROM OLD.created_by_user_id     OR
      NEW.retry_source_payout_id IS DISTINCT FROM OLD.retry_source_payout_id
    ) THEN
      RAISE EXCEPTION 'canceled_payout_critical_fields_immutable'
        USING DETAIL = 'A canceled payout row critical fields cannot be modified.';
    END IF;

    -- recipient_email_snapshot: NULL化（redaction）のみ許可
    IF NEW.recipient_email_snapshot IS DISTINCT FROM OLD.recipient_email_snapshot THEN
      IF NEW.recipient_email_snapshot IS NOT NULL THEN
        RAISE EXCEPTION 'canceled_payout_snapshot_change_denied'
          USING DETAIL = 'recipient_email_snapshot can only be set to NULL (redaction), not changed to another value.';
      END IF;
    END IF;

    -- recipient_name_snapshot: NULL化（redaction）のみ許可
    IF NEW.recipient_name_snapshot IS DISTINCT FROM OLD.recipient_name_snapshot THEN
      IF NEW.recipient_name_snapshot IS NOT NULL THEN
        RAISE EXCEPTION 'canceled_payout_snapshot_change_denied'
          USING DETAIL = 'recipient_name_snapshot can only be set to NULL (redaction), not changed to another value.';
      END IF;
    END IF;
  END IF;

  -- ── retry_source_payout_id: INSERT後 immutable ────────────────────────
  -- prepared状態でも後から変更不可
  IF OLD.retry_source_payout_id IS NOT NULL AND
     NEW.retry_source_payout_id IS DISTINCT FROM OLD.retry_source_payout_id THEN
    RAISE EXCEPTION 'retry_source_payout_id_immutable'
      USING DETAIL = 'retry_source_payout_id cannot be changed after INSERT.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION prevent_paid_payout_mutation() IS
  'Trigger function: paid / failed / canceled のすべての terminal 状態を保護する。'
  'paid: 金融記録全項目 immutable / failed: 失敗記録全項目 immutable / canceled: キャンセル記録全項目 immutable。'
  'すべての terminal 状態で recipient_email_snapshot / recipient_name_snapshot はredaction用NULL化のみ許可。'
  'retry_source_payout_id はINSERT後 immutable（status問わず）。';

-- ============================================================
-- B. admin_cancel_payout RPC
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
    'payout_canceled',
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
-- C. admin_retry_payout RPC
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
  -- snapshot は source からコピーのみ。submission_data 再取得なし。
  -- paid_at / failed_at / canceled_at / paypal_payout_id はコピーしない。
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
    v_new_payout_id,
    'payout_retried',
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
