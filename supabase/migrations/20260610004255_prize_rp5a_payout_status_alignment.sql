-- ============================================================
-- RP-5a: Reward / Prize — Read-only Payment Dashboard + Payout Status Alignment
--
-- A. Payout status alignment migration
--    - pending / in_csv → prepared
--    - status CHECK: prepared / paid / failed / canceled
--    - partial UNIQUE index: active = prepared / paid
--    - 支払記録用カラム追加
--    - paypal_payout_id unique index
--    - paid requires constraint
--    - prevent_paid_payout_mutation() 強化
--
-- B. RP-3 archive/clear RPC 安全強化
--    - admin_mark_prize_submission_archived: prepared/paid payout 確認チェック追加
--
-- C. Read-only payment dashboard RPC
--    - admin_list_payable_awards()
--    - admin_get_payout_detail(p_award_id uuid)
--
-- 禁止事項:
--   - PayPal API実装
--   - CSV生成
--   - payout row作成
--   - payout status変更
--   - Edge Function
--   - archive logへのPII保存
--   - RP-1〜RP-4の権限緩和
-- ============================================================

-- ============================================================
-- A-1. prize_payouts status migration: pending/in_csv → prepared
-- ============================================================

-- まず既存データの想定外 status を確認 (想定外があればエラーで止まる)
DO $$
DECLARE
  unexpected_count int;
  unexpected_statuses text;
BEGIN
  SELECT COUNT(*), string_agg(DISTINCT status, ', ')
    INTO unexpected_count, unexpected_statuses
    FROM prize_payouts
   WHERE status NOT IN ('pending', 'in_csv', 'paid', 'failed', 'canceled');

  IF unexpected_count > 0 THEN
    RAISE EXCEPTION 'Unexpected payout statuses found: % (count: %)',
      unexpected_statuses, unexpected_count
      USING DETAIL = 'Migration aborted. Review prize_payouts.status values before proceeding.';
  END IF;
END $$;

-- pending / in_csv → prepared に移行
UPDATE prize_payouts
   SET status = 'prepared',
       updated_at = now()
 WHERE status IN ('pending', 'in_csv');

-- A-2. 旧 partial UNIQUE index を削除
DROP INDEX IF EXISTS prize_payouts_one_active_per_award;

-- A-3. status CHECK 制約を差し替え
-- まず旧 CHECK 制約を削除
ALTER TABLE prize_payouts
  DROP CONSTRAINT IF EXISTS prize_payouts_status_check;

-- 新 CHECK 制約: prepared / paid / failed / canceled
ALTER TABLE prize_payouts
  ADD CONSTRAINT prize_payouts_status_check
    CHECK (status IN ('prepared', 'paid', 'failed', 'canceled'));

-- A-4. 支払記録用カラムを追加
ALTER TABLE prize_payouts
  ADD COLUMN IF NOT EXISTS paypal_payout_id      text,
  ADD COLUMN IF NOT EXISTS fee_amount_cents       int  CHECK (fee_amount_cents >= 0),
  ADD COLUMN IF NOT EXISTS net_amount_cents       int  CHECK (net_amount_cents >= 0),
  ADD COLUMN IF NOT EXISTS exchange_rate          numeric(20,8),
  ADD COLUMN IF NOT EXISTS exchange_currency      text CHECK (exchange_currency IS NULL OR length(exchange_currency) = 3),
  ADD COLUMN IF NOT EXISTS admin_note             text,
  ADD COLUMN IF NOT EXISTS recipient_email_hash   text,
  ADD COLUMN IF NOT EXISTS recipient_name_hash    text;

-- A-5. 新 partial UNIQUE index: active status = prepared / paid
CREATE UNIQUE INDEX IF NOT EXISTS prize_payouts_one_active_per_award
  ON prize_payouts (award_id)
  WHERE status IN ('prepared', 'paid');

-- A-6. paypal_payout_id の unique index (NOT NULL の場合のみ)
CREATE UNIQUE INDEX IF NOT EXISTS prize_payouts_paypal_payout_id_unique
  ON prize_payouts (paypal_payout_id)
  WHERE paypal_payout_id IS NOT NULL;

-- A-7. paid requires paypal_payout_id AND paid_at constraint
ALTER TABLE prize_payouts
  DROP CONSTRAINT IF EXISTS prize_payouts_paid_requires_payout_id;

ALTER TABLE prize_payouts
  ADD CONSTRAINT prize_payouts_paid_requires_payout_id
    CHECK (
      status != 'paid'
      OR (paypal_payout_id IS NOT NULL AND paid_at IS NOT NULL)
    );

-- A-8. prize_award_payment_state view を新 status に合わせて更新
DROP VIEW IF EXISTS prize_award_payment_state;

CREATE OR REPLACE VIEW prize_award_payment_state
  WITH (security_invoker = true)
AS
SELECT
  a.id                    AS award_id,
  a.recipient_user_id,
  a.status                AS award_status,
  a.amount_cents,
  a.currency,
  a.source_kind,
  -- 最新 active payout（paid > prepared 優先）
  p.id                    AS payout_id,
  p.status                AS payout_status,
  p.paid_at,
  p.created_at            AS payout_created_at
FROM prize_awards a
LEFT JOIN LATERAL (
  SELECT pp.id, pp.status, pp.paid_at, pp.created_at
  FROM prize_payouts pp
  WHERE pp.award_id = a.id
    AND pp.status IN ('prepared', 'paid')
  ORDER BY
    CASE pp.status
      WHEN 'paid'     THEN 1
      WHEN 'prepared' THEN 2
    END
  LIMIT 1
) p ON true;

GRANT SELECT ON prize_award_payment_state TO authenticated;

-- A-9. prevent_paid_payout_mutation() 強化 (Opus監査方針)
-- paid後の重要項目変更禁止
-- recipient_email_snapshot / recipient_name_snapshot はNULL化のみ許可
-- failed / canceled の復活禁止維持
CREATE OR REPLACE FUNCTION prevent_paid_payout_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- ── paid payout の critical fields は変更禁止 ──────────────
  IF OLD.status = 'paid' THEN
    -- status / amount / currency / payment_method / paid_at / award_id は変更禁止
    IF (
      NEW.status                IS DISTINCT FROM OLD.status OR
      NEW.amount_cents_snapshot IS DISTINCT FROM OLD.amount_cents_snapshot OR
      NEW.currency_snapshot     IS DISTINCT FROM OLD.currency_snapshot OR
      NEW.payment_method        IS DISTINCT FROM OLD.payment_method OR
      NEW.paid_at               IS DISTINCT FROM OLD.paid_at OR
      NEW.award_id              IS DISTINCT FROM OLD.award_id OR
      NEW.paypal_payout_id      IS DISTINCT FROM OLD.paypal_payout_id
    ) THEN
      RAISE EXCEPTION 'paid_payout_critical_fields_immutable'
        USING DETAIL = 'A paid payout row critical fields cannot be modified.';
    END IF;

    -- recipient_email_snapshot: NULL化のみ許可、別値への変更は禁止
    IF NEW.recipient_email_snapshot IS DISTINCT FROM OLD.recipient_email_snapshot THEN
      IF NEW.recipient_email_snapshot IS NOT NULL THEN
        RAISE EXCEPTION 'paid_payout_snapshot_change_denied'
          USING DETAIL = 'recipient_email_snapshot can only be set to NULL (redaction), not changed to another value.';
      END IF;
      -- NULL化は許可（redaction）
    END IF;

    -- recipient_name_snapshot: NULL化のみ許可、別値への変更は禁止
    IF NEW.recipient_name_snapshot IS DISTINCT FROM OLD.recipient_name_snapshot THEN
      IF NEW.recipient_name_snapshot IS NOT NULL THEN
        RAISE EXCEPTION 'paid_payout_snapshot_change_denied'
          USING DETAIL = 'recipient_name_snapshot can only be set to NULL (redaction), not changed to another value.';
      END IF;
      -- NULL化は許可（redaction）
    END IF;
  END IF;

  -- ── failed / canceled payout は別 status への復活禁止 ──────
  IF OLD.status IN ('failed', 'canceled') AND NEW.status != OLD.status THEN
    RAISE EXCEPTION 'terminated_payout_immutable'
      USING DETAIL = 'A failed or canceled payout cannot change status.';
  END IF;

  RETURN NEW;
END;
$$;

-- trigger は既に存在するため再作成不要（関数の置き換えのみ）
-- prize_payouts_paid_immutable trigger は RP-1 で作成済み

-- ============================================================
-- B. RP-3 admin_mark_prize_submission_archived の安全強化
--    prepared / paid payout が存在しない場合に submission_data をクリアしない
-- ============================================================

DROP FUNCTION IF EXISTS admin_mark_prize_submission_archived(uuid, text);

CREATE OR REPLACE FUNCTION admin_mark_prize_submission_archived(
  p_submission_id uuid,
  p_note          text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin    boolean;
  v_sub         prize_temp_tax_submissions%ROWTYPE;
  v_now         timestamptz := now();
  v_before      jsonb;
  v_after       jsonb;
  v_payout_ok   boolean;
BEGIN
  -- ── admin 確認 ────────────────────────────────────────────
  SELECT is_admin
    INTO v_is_admin
    FROM profiles
   WHERE id = auth.uid();

  IF NOT FOUND OR v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'permission_denied'
      USING DETAIL = 'admin_mark_prize_submission_archived requires is_admin';
  END IF;

  -- ── submission 取得（ロック）────────────────────────────
  SELECT *
    INTO v_sub
    FROM prize_temp_tax_submissions
   WHERE id = p_submission_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'submission_not_found'
      USING DETAIL = 'Submission not found.';
  END IF;

  -- ── status チェック ───────────────────────────────────────
  IF v_sub.status NOT IN ('submitted', 'reviewed', 'archived') THEN
    IF v_sub.status = 'data_cleared' THEN
      RAISE EXCEPTION 'already_cleared'
        USING DETAIL = 'Submission data has already been cleared.';
    ELSE
      RAISE EXCEPTION 'invalid_status'
        USING DETAIL = 'Submission status must be submitted, reviewed, or archived.';
    END IF;
  END IF;

  -- ── submission_data が NULL でないことを確認 ──────────────
  IF v_sub.submission_data IS NULL THEN
    RAISE EXCEPTION 'submission_data_already_null'
      USING DETAIL = 'submission_data is already NULL.';
  END IF;

  -- ── RP-5a 安全チェック: award_id がある場合、prepared/paid payout の存在確認 ──
  -- submission_data を削除する前に、該当 award の prepared または paid payout が
  -- 存在することを DB 側で確認する。
  -- 存在しない場合は支払不能になるため拒否する。
  IF v_sub.award_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1
        FROM prize_payouts
       WHERE award_id = v_sub.award_id
         AND status IN ('prepared', 'paid')
    ) INTO v_payout_ok;

    IF NOT v_payout_ok THEN
      RAISE EXCEPTION 'cannot_clear_data_before_payout_prepared'
        USING DETAIL = 'A prepared or paid payout must exist for this award before submission data can be cleared. '
                    || 'Create a prepared payout first (available in RP-5b+).';
    END IF;
  END IF;

  -- ── archive log 用 before_state（PII 不可） ───────────────
  v_before := jsonb_build_object(
    'status',               v_sub.status,
    'has_submission_data',  TRUE,
    'delete_after',         v_sub.delete_after
  );

  -- ── prize_temp_tax_submissions 更新 ───────────────────────
  UPDATE prize_temp_tax_submissions
     SET submission_data = NULL,
         status          = 'data_cleared',
         archived_at     = COALESCE(archived_at, v_now),
         data_cleared_at = v_now,
         updated_at      = v_now
   WHERE id = p_submission_id;

  -- ── after_state（PII 不可） ────────────────────────────────
  v_after := jsonb_build_object(
    'status',              'data_cleared',
    'has_submission_data', FALSE,
    'data_cleared_at',     v_now
  );

  -- ── archive log INSERT（PII を含まないこと） ───────────────
  INSERT INTO prize_archive_logs (
    event_type,
    entity_type,
    entity_id,
    actor_user_id,
    before_state,
    after_state,
    notes
  ) VALUES (
    'data_cleared',
    'prize_temp_tax_submissions',
    p_submission_id,
    auth.uid(),
    v_before,
    v_after,
    p_note
  );

  -- ── 戻り値 ────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'success',          TRUE,
    'submission_id',    p_submission_id,
    'award_id',         v_sub.award_id,
    'status',           'data_cleared',
    'data_cleared_at',  v_now,
    'archived_at',      COALESCE(v_sub.archived_at, v_now)
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_mark_prize_submission_archived(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_mark_prize_submission_archived(uuid, text) TO authenticated;

-- ============================================================
-- C-1. admin_list_payable_awards()
-- Read-only Payment Dashboard 一覧 RPC
-- PII を返さない（PayPal email / legal name / submission_data 禁止）
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
  display_label                     text
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
    RAISE EXCEPTION 'not_authenticated'
      USING DETAIL = 'You must be authenticated.';
  END IF;

  SELECT is_admin INTO v_is_admin
    FROM profiles WHERE id = v_caller_id;
  IF NOT FOUND OR v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'permission_denied'
      USING DETAIL = 'Only admins can access the payment dashboard.';
  END IF;

  RETURN QUERY
  SELECT
    a.id                      AS award_id,
    a.recipient_user_id,
    pr.display_name           AS recipient_display_name,
    a.source_kind,
    a.source_arena_id,
    a.source_arena_event_id,
    a.source_arena_match_id,
    a.amount_cents,
    a.currency,
    a.prize_kind,
    a.status                  AS award_status,
    -- latest submission（PIIなし）
    sub.id                    AS latest_submission_id,
    sub.status                AS latest_submission_status,
    sub.created_at            AS latest_submission_submitted_at,
    sub.delete_after          AS latest_submission_delete_after,
    sub.data_cleared_at       AS latest_submission_data_cleared_at,
    -- latest payout
    pyt.id                    AS latest_payout_id,
    pyt.status                AS latest_payout_status,
    pyt.paid_at               AS latest_payout_paid_at,
    a.created_at,
    -- display_label 判定
    CASE
      -- award 終端状態
      WHEN a.status = 'on_hold'   THEN 'On Hold'
      WHEN a.status = 'canceled'  THEN 'Canceled'
      WHEN a.status = 'expired'   THEN 'Expired'
      -- payout 状態優先
      WHEN pyt.status = 'paid'     THEN 'Paid'
      WHEN pyt.status = 'prepared' THEN 'Prepared'
      WHEN pyt.status = 'failed'   THEN 'Failed'
      WHEN pyt.status = 'canceled' THEN 'Canceled'
      -- submission data cleared かつ payout なし → 支払不能
      WHEN sub.status = 'data_cleared' AND pyt.id IS NULL THEN 'Cannot Pay: data cleared too early'
      -- submission あり
      WHEN sub.status IN ('submitted', 'reviewed') THEN 'Awaiting Archive'
      WHEN sub.status = 'archived' THEN 'Ready for Prepare'
      -- submission なし / award eligible
      WHEN a.status = 'eligible' AND sub.id IS NULL THEN 'Awaiting Submission'
      ELSE 'Awaiting Submission'
    END                       AS display_label
  FROM prize_awards a
  LEFT JOIN profiles pr ON pr.id = a.recipient_user_id
  LEFT JOIN LATERAL (
    SELECT s.id, s.status, s.created_at, s.delete_after, s.data_cleared_at
    FROM prize_temp_tax_submissions s
    WHERE s.award_id = a.id
    ORDER BY s.created_at DESC
    LIMIT 1
  ) sub ON true
  LEFT JOIN LATERAL (
    SELECT pp.id, pp.status, pp.paid_at
    FROM prize_payouts pp
    WHERE pp.award_id = a.id
    ORDER BY
      CASE pp.status
        WHEN 'paid'     THEN 1
        WHEN 'prepared' THEN 2
        WHEN 'failed'   THEN 3
        WHEN 'canceled' THEN 4
      END,
      pp.created_at DESC
    LIMIT 1
  ) pyt ON true
  ORDER BY a.created_at DESC
  LIMIT 200;
END;
$$;

REVOKE ALL ON FUNCTION admin_list_payable_awards() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_payable_awards() TO authenticated;

-- ============================================================
-- C-2. admin_get_payout_detail(p_award_id uuid)
-- 支払詳細確認画面 RPC
-- 必要最小限の PII を返す（legal_name / paypal_email）
-- 呼び出し毎に detail_viewed を archive log に INSERT
-- ============================================================

DROP FUNCTION IF EXISTS admin_get_payout_detail(uuid);

CREATE OR REPLACE FUNCTION admin_get_payout_detail(
  p_award_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id   uuid;
  v_is_admin    boolean;
  v_award       prize_awards%ROWTYPE;
  v_sub         prize_temp_tax_submissions%ROWTYPE;
  v_pyt         prize_payouts%ROWTYPE;
  v_legal_name  text;
  v_paypal_email text;
  v_data_source text;
  v_result      jsonb;
BEGIN
  -- ── admin 確認 ────────────────────────────────────────────
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING DETAIL = 'You must be authenticated.';
  END IF;

  SELECT is_admin INTO v_is_admin
    FROM profiles WHERE id = v_caller_id;
  IF NOT FOUND OR v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'permission_denied'
      USING DETAIL = 'Only admins can access payout detail.';
  END IF;

  -- ── award 取得 ─────────────────────────────────────────────
  SELECT * INTO v_award
    FROM prize_awards
   WHERE id = p_award_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'award_not_found'
      USING DETAIL = 'Prize award not found.';
  END IF;

  -- ── latest submission 取得 ────────────────────────────────
  SELECT * INTO v_sub
    FROM prize_temp_tax_submissions
   WHERE award_id = p_award_id
   ORDER BY created_at DESC
   LIMIT 1;

  -- ── latest payout 取得（prepared/paid 優先）────────────────
  SELECT * INTO v_pyt
    FROM prize_payouts
   WHERE award_id = p_award_id
   ORDER BY
     CASE status
       WHEN 'paid'     THEN 1
       WHEN 'prepared' THEN 2
       WHEN 'failed'   THEN 3
       WHEN 'canceled' THEN 4
     END,
     created_at DESC
   LIMIT 1;

  -- ── PII 取得（条件付き）────────────────────────────────────
  -- 優先順: payout snapshot > submission_data > 取得不可
  IF v_pyt.id IS NOT NULL AND v_pyt.recipient_email_snapshot IS NOT NULL THEN
    -- payout snapshot から取得
    v_paypal_email := v_pyt.recipient_email_snapshot;
    v_legal_name   := v_pyt.recipient_name_snapshot;
    v_data_source  := 'payout_snapshot';
  ELSIF v_sub.id IS NOT NULL AND v_sub.submission_data IS NOT NULL THEN
    -- submission_data から取得
    v_paypal_email := v_sub.submission_data ->> 'paypal_email';
    v_legal_name   := v_sub.submission_data ->> 'legal_name';
    v_data_source  := 'submission_data';
  ELSE
    -- data cleared かつ payout snapshot なし → 支払不能
    v_paypal_email := NULL;
    v_legal_name   := NULL;
    v_data_source  := 'unavailable';
  END IF;

  -- ── 結果構築 ──────────────────────────────────────────────
  v_result := jsonb_build_object(
    -- award 情報
    'award_id',                       v_award.id,
    'recipient_user_id',              v_award.recipient_user_id,
    'amount_cents',                   v_award.amount_cents,
    'currency',                       v_award.currency,
    'prize_kind',                     v_award.prize_kind,
    'source_kind',                    v_award.source_kind,
    'source_arena_event_id',          v_award.source_arena_event_id,
    'source_arena_match_id',          v_award.source_arena_match_id,
    'award_status',                   v_award.status,
    -- submission 情報（PIIなし）
    'latest_submission_id',           v_sub.id,
    'latest_submission_status',       v_sub.status,
    'latest_submission_submitted_at', v_sub.created_at,
    'latest_submission_delete_after', v_sub.delete_after,
    -- payout 情報（PIIなし）
    'latest_payout_id',               v_pyt.id,
    'latest_payout_status',           v_pyt.status,
    'latest_payout_paid_at',          v_pyt.paid_at,
    -- PII（必要最小限）
    'legal_name',                     v_legal_name,
    'paypal_email',                   v_paypal_email,
    'pii_data_source',                v_data_source
  );

  -- ── detail_viewed archive log INSERT（PII を含まないこと）───
  -- before_state / after_state に legal_name / paypal_email は絶対に入れない
  INSERT INTO prize_archive_logs (
    event_type,
    entity_type,
    entity_id,
    actor_user_id,
    before_state,
    after_state,
    notes
  ) VALUES (
    'detail_viewed',
    'award',
    p_award_id,
    v_caller_id,
    jsonb_build_object(
      'has_pii_response', TRUE,
      'view_context',     'payout_detail'
    ),
    jsonb_build_object(
      'has_pii_response', TRUE,
      'view_context',     'payout_detail'
    ),
    NULL
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION admin_get_payout_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_get_payout_detail(uuid) TO authenticated;
