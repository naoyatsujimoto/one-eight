-- ============================================================
-- RP-3: Prize Archive RPCs + archived_at column
-- Winner File印刷・Archive完了・機微情報削除
--
-- 追加:
--   Column: prize_temp_tax_submissions.archived_at
--   RPC:    admin_get_prize_submission_for_print(uuid)
--   RPC:    admin_mark_prize_submission_archived(uuid, text)
--
-- 禁止事項 (RP-3 scope):
--   - PayPal CSV / PayPal API
--   - Edge Function
--   - payout row 作成 / payout status 変更
--   - prize_temp_tax_submissions の DELETE
--   - archive log の UPDATE / DELETE
--   - archive log への PII 保存
--   - profiles への PayPal メール等追加
--   - RP-1 物理ガード変更・削除
--   - RP-2 admin RPC 権限緩和
-- ============================================================

-- ============================================================
-- 1. prize_temp_tax_submissions に archived_at 列を追加
--    (まだ存在しない場合のみ)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'prize_temp_tax_submissions'
      AND column_name  = 'archived_at'
  ) THEN
    ALTER TABLE prize_temp_tax_submissions
      ADD COLUMN archived_at timestamptz;
  END IF;
END $$;

-- ============================================================
-- 2. admin_get_prize_submission_for_print
--    目的: admin が Winner File 印刷用に submission_data を取得
--    - SECURITY DEFINER
--    - authenticated のみ
--    - RPC 内部で is_admin 再確認
--    - status = 'data_cleared' の場合は機微情報を返さない
-- ============================================================

-- 既存定義があれば DROP
DROP FUNCTION IF EXISTS admin_get_prize_submission_for_print(uuid);

CREATE OR REPLACE FUNCTION admin_get_prize_submission_for_print(
  p_submission_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin    boolean;
  v_sub         prize_temp_tax_submissions%ROWTYPE;
  v_award       prize_awards%ROWTYPE;
  v_result      jsonb;
BEGIN
  -- ── admin 確認 ────────────────────────────────────────────
  SELECT is_admin
    INTO v_is_admin
    FROM profiles
   WHERE id = auth.uid();

  IF NOT FOUND OR v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'permission_denied'
      USING DETAIL = 'admin_get_prize_submission_for_print requires is_admin';
  END IF;

  -- ── submission 取得 ───────────────────────────────────────
  SELECT *
    INTO v_sub
    FROM prize_temp_tax_submissions
   WHERE id = p_submission_id
     AND status IN ('submitted', 'reviewed', 'archived');

  -- data_cleared または存在しない場合はエラー
  IF NOT FOUND THEN
    -- data_cleared かどうかを確認して適切なエラーを返す
    PERFORM 1
      FROM prize_temp_tax_submissions
     WHERE id = p_submission_id
       AND status = 'data_cleared';

    IF FOUND THEN
      RAISE EXCEPTION 'data_already_cleared'
        USING DETAIL = 'Sensitive data has already been deleted from this submission.';
    ELSE
      RAISE EXCEPTION 'submission_not_found'
        USING DETAIL = 'Submission not found or not in a printable status.';
    END IF;
  END IF;

  -- ── award 取得 ────────────────────────────────────────────
  SELECT *
    INTO v_award
    FROM prize_awards
   WHERE id = v_sub.award_id;

  -- ── 結果構築 ──────────────────────────────────────────────
  -- 注意: submission_data はここで含める（印刷用）
  -- Console log には出力しないこと（フロント責務）
  v_result := jsonb_build_object(
    'submission_id',         v_sub.id,
    'award_id',              v_sub.award_id,
    'recipient_user_id',     v_sub.user_id,
    'submission_status',     v_sub.status,
    'submission_data',       v_sub.submission_data,
    'submitted_at',          v_sub.created_at,
    'delete_after',          v_sub.delete_after,
    'archived_at',           v_sub.archived_at,
    'data_cleared_at',       v_sub.data_cleared_at,
    -- award 情報
    'amount_cents',          v_award.amount_cents,
    'currency',              v_award.currency,
    'source_kind',           v_award.source_kind,
    'source_arena_event_id', v_award.source_arena_event_id,
    'source_arena_match_id', v_award.source_arena_match_id,
    'prize_kind',            v_award.prize_kind,
    'award_status',          v_award.status
  );

  RETURN v_result;
END;
$$;

-- GRANT: authenticated のみ / anon 不可
REVOKE ALL ON FUNCTION admin_get_prize_submission_for_print(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_get_prize_submission_for_print(uuid) TO authenticated;

-- ============================================================
-- 3. admin_mark_prize_submission_archived
--    目的: Winner File の PDF 保存・印刷・オフライン保管完了後、
--           オンライン DB 上の機微情報を削除
--    - SECURITY DEFINER
--    - authenticated のみ
--    - RPC 内部で is_admin 再確認
--    - prize_temp_tax_submissions.submission_data = NULL にクリア
--    - status = 'data_cleared' に変更
--    - prize_awards.status は変更しない（案A: eligible のまま）
--    - archive log に data_cleared / archived log を INSERT（PII 不可）
-- ============================================================

-- 既存定義があれば DROP
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

  -- ── archive log 用 before_state（PII 不可） ───────────────
  v_before := jsonb_build_object(
    'status',               v_sub.status,
    'has_submission_data',  TRUE,
    'delete_after',         v_sub.delete_after
  );

  -- ── prize_temp_tax_submissions 更新 ───────────────────────
  -- submission_data = NULL / status = 'data_cleared'
  -- archived_at = COALESCE(archived_at, now()) / data_cleared_at = now()
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
  -- 禁止: legal_name / address / paypal_email / submission_data の中身
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

-- GRANT: authenticated のみ / anon 不可
REVOKE ALL ON FUNCTION admin_mark_prize_submission_archived(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_mark_prize_submission_archived(uuid, text) TO authenticated;
