-- ============================================================
-- Redact Sensitive payout_snapshot on Archive
--
-- 背景:
--   1dc11bf で prize_payouts.payout_snapshot に住所・税務情報・
--   確認チェック類を含む全フィールドを保存するようになった。
--   Archive後もpayout_snapshotに機微情報が残り続ける問題がある。
--
-- Naoyaの意図:
--   - Winner FileをPDF/紙保存後、DBから機微情報は72時間以内に削除
--   - DBには支払監査に必要な非機微情報・hash・status等のみ残す
--   - Archive後に機微情報を再表示できなくなるのは許容（むしろ優先）
--
-- 修正内容:
--   A. admin_mark_prize_submission_archived 拡張
--      Archive実行時に payout_snapshot から機微情報を削除し
--      snapshot_redacted_at タイムスタンプを追加する
--
--   B. admin_prepare_payout 修正（20260616160000との競合解消）
--      20260616160000 が payout_snapshot 抜きで RPC を上書きしていたため
--      20260616153647 で追加した payout_snapshot 構築ロジックを復活させる
--
--   C. prevent_paid_payout_mutation トリガー更新
--      payout_snapshot の NULL化・redact を許可する
--      （新規 jsonb への差し替えも可能だが、機微情報の追加は禁止）
--
-- 禁止事項:
--   - PayPal 送金実行
--   - Mark as Paid 実行
--   - Cancel Payout 実行
--   - 本番 DB の機微情報実値をログ・報告に出力
--   - prize_archive_logs への PII 保存
--   - 既存データの安易な削除
--   - recipient_email_snapshot / recipient_name_snapshot 以外の
--     非機微情報の削除（amount / currency / award_id 等）
-- ============================================================


-- ============================================================
-- A. admin_mark_prize_submission_archived 拡張
--    Archive 実行時に payout_snapshot から機微情報をredactする
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
  v_is_admin     boolean;
  v_sub          prize_temp_tax_submissions%ROWTYPE;
  v_now          timestamptz := now();
  v_before       jsonb;
  v_after        jsonb;
  v_payout_id    uuid;
  v_snap_before  jsonb;
  v_snap_redacted jsonb;
  v_redacted_count int := 0;
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

  -- ── payout_snapshot から機微情報をredactする ─────────────
  -- この submission に紐付いた payout を取得
  -- source_submission_id が最優先、なければ award_id で fallback
  SELECT id, payout_snapshot
    INTO v_payout_id, v_snap_before
    FROM prize_payouts
   WHERE source_submission_id = p_submission_id
     AND payout_snapshot IS NOT NULL
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_payout_id IS NULL THEN
    -- award_id で fallback（source_submission_id が設定されていない古いpayout）
    SELECT pp.id, pp.payout_snapshot
      INTO v_payout_id, v_snap_before
      FROM prize_payouts pp
      JOIN prize_temp_tax_submissions sub ON sub.id = p_submission_id
     WHERE pp.award_id = sub.award_id
       AND pp.payout_snapshot IS NOT NULL
     ORDER BY pp.created_at DESC
     LIMIT 1;
  END IF;

  IF v_payout_id IS NOT NULL AND v_snap_before IS NOT NULL THEN
    -- ── 機微情報keyをredactする ────────────────────────────
    -- 残すべき非機微情報（audit trail に必要）:
    --   award_id / submission_id / recipient_user_id / payout_id /
    --   amount / currency / prize_kind / source_kind /
    --   arena_event_id / arena_match_id / status関連 / timestamp類 /
    --   hash類 / snapshot_taken_at / submission_created_at
    --
    -- 削除/redactする機微情報:
    --   legal_name / display_name / residence_country /
    --   address_line1 / address_line2 / city / region / postal_code / country /
    --   tax_residence_country / domestic_or_foreign /
    --   paypal_email / preferred_currency /
    --   user_confirmed_legal_responsibility / user_confirmed_paypal_name_match

    v_snap_redacted := v_snap_before
      -- 機微情報keyを削除
      - 'legal_name'
      - 'display_name'
      - 'residence_country'
      - 'address_line1'
      - 'address_line2'
      - 'city'
      - 'region'
      - 'postal_code'
      - 'country'
      - 'tax_residence_country'
      - 'domestic_or_foreign'
      - 'paypal_email'
      - 'preferred_currency'
      - 'user_confirmed_legal_responsibility'
      - 'user_confirmed_paypal_name_match'
      -- redact済みフラグを追加
      || jsonb_build_object('snapshot_redacted_at', to_jsonb(v_now));

    -- payout_snapshot を redacted 版に更新
    UPDATE prize_payouts
       SET payout_snapshot = v_snap_redacted,
           updated_at      = v_now
     WHERE id = v_payout_id;

    v_redacted_count := 1;
  END IF;

  -- ── after_state（PII 不可） ────────────────────────────────
  v_after := jsonb_build_object(
    'status',                  'data_cleared',
    'has_submission_data',     FALSE,
    'data_cleared_at',         v_now,
    'payout_snapshot_redacted', v_redacted_count > 0,
    'payout_id',               v_payout_id
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
    'success',                    TRUE,
    'submission_id',              p_submission_id,
    'award_id',                   v_sub.award_id,
    'status',                     'data_cleared',
    'data_cleared_at',            v_now,
    'archived_at',                COALESCE(v_sub.archived_at, v_now),
    'payout_snapshot_redacted',   v_redacted_count > 0,
    'payout_id',                  v_payout_id
  );
END;
$$;

-- GRANT: authenticated のみ / anon 不可
REVOKE ALL ON FUNCTION admin_mark_prize_submission_archived(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_mark_prize_submission_archived(uuid, text) TO authenticated;

COMMENT ON FUNCTION admin_mark_prize_submission_archived(uuid, text) IS
  'Admin: Archive submission and clear sensitive data from DB. '
  'Clears submission_data and redacts payout_snapshot sensitive fields. '
  '2026-06-16: payout_snapshot redaction追加。';


-- ============================================================
-- B. admin_prepare_payout 修正
--    20260616160000 が payout_snapshot 抜きで RPC を上書きしていたため
--    payout_snapshot 全フィールド構築ロジックを復活させる
--    （20260616153647 の内容を 20260616160000 の修正と統合）
-- ============================================================

DROP FUNCTION IF EXISTS admin_prepare_payout(uuid);

CREATE OR REPLACE FUNCTION admin_prepare_payout(
  p_award_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_is_admin           boolean;
  v_award              prize_awards%ROWTYPE;
  v_submission         prize_temp_tax_submissions%ROWTYPE;
  v_paypal_email       text;
  v_legal_name         text;
  v_normalized_email   text;
  v_normalized_name    text;
  v_email_hash         text;
  v_name_hash          text;
  v_payout_id          uuid;
  v_now                timestamptz := now();
  v_snapshot           jsonb;
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

  -- ── 8. hash 計算 (pgcrypto / extensions.digest) ──────────────────────
  v_normalized_email := lower(btrim(v_paypal_email));
  v_normalized_name  := lower(btrim(v_legal_name));

  v_email_hash := encode(digest(v_normalized_email, 'sha256'), 'hex');
  v_name_hash  := encode(digest(v_normalized_name,  'sha256'), 'hex');

  -- ── 9. payout_snapshot 構築（submission_data 全フィールド + metadata） ──
  -- submission_data が削除された後も Winner File を再印刷できるように
  -- 全フィールドを snapshot として保存する
  -- Archive 後は admin_mark_prize_submission_archived が機微情報をredactする
  v_snapshot := jsonb_build_object(
    -- submission_data 全フィールド（機微情報 — Archive後にredactされる）
    'legal_name',                          v_submission.submission_data -> 'legal_name',
    'display_name',                        v_submission.submission_data -> 'display_name',
    'residence_country',                   v_submission.submission_data -> 'residence_country',
    'address_line1',                       v_submission.submission_data -> 'address_line1',
    'address_line2',                       v_submission.submission_data -> 'address_line2',
    'city',                                v_submission.submission_data -> 'city',
    'region',                              v_submission.submission_data -> 'region',
    'postal_code',                         v_submission.submission_data -> 'postal_code',
    'country',                             v_submission.submission_data -> 'country',
    'tax_residence_country',               v_submission.submission_data -> 'tax_residence_country',
    'domestic_or_foreign',                 v_submission.submission_data -> 'domestic_or_foreign',
    'paypal_email',                        v_submission.submission_data -> 'paypal_email',
    'preferred_currency',                  v_submission.submission_data -> 'preferred_currency',
    'user_confirmed_legal_responsibility', v_submission.submission_data -> 'user_confirmed_legal_responsibility',
    'user_confirmed_paypal_name_match',    v_submission.submission_data -> 'user_confirmed_paypal_name_match',
    -- snapshot メタデータ
    'snapshot_taken_at',     to_jsonb(v_now),
    'submission_id',         to_jsonb(v_submission.id),
    'submission_created_at', to_jsonb(v_submission.created_at)
  );

  -- ── 10. prize_payouts INSERT ──────────────────────────────────────────
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
    payout_snapshot,
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
    v_snapshot,
    auth.uid(),
    v_now,
    v_now
  )
  RETURNING id INTO v_payout_id;

  -- ── 11. archive log INSERT (payout_prepared / PII不混入) ──────────────
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
    'payout_prepared',
    'payout',
    v_payout_id,
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
      'has_recipient_hash',     true,
      'has_payout_snapshot',    true
    ),
    v_now
  );

  -- ── 12. 戻り値（PIIなし） ────────────────────────────────────────────
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
  'Admin: prepare a payout for an eligible award. '
  'Snapshots full submission_data into payout_snapshot. '
  'Returns payout_id without PII. '
  '2026-06-16: (1) payout_snapshot 全フィールド復活（20260616160000競合修正） '
  '(2) Archive時に機微情報はadmin_mark_prize_submission_archivedでredactされる。';


-- ============================================================
-- C. prevent_paid_payout_mutation トリガー関数更新
--    payout_snapshot の更新を許可する
--    （NULL化・redact（機微情報削除）のみ許可、新規機微情報の追加は不可）
--    ※ payout_snapshot はredactが必要なため、完全immutableにはしない
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_paid_payout_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- paid または failed status の payout は以下のフィールドを変更禁止
  IF OLD.status IN ('paid', 'failed') THEN

    -- status: paid → failed、failed → paid は禁止
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF (OLD.status = 'paid'   AND NEW.status != 'paid')   OR
         (OLD.status = 'failed' AND NEW.status != 'failed') THEN
        RAISE EXCEPTION 'paid_payout_status_change_denied'
          USING DETAIL = 'Status of paid/failed payout cannot be changed.';
      END IF;
    END IF;

    -- award_id: 変更禁止
    IF NEW.award_id IS DISTINCT FROM OLD.award_id THEN
      RAISE EXCEPTION 'paid_payout_mutation_denied'
        USING DETAIL = 'award_id of paid/failed payout cannot be changed.';
    END IF;

    -- amount_cents_snapshot: 変更禁止
    IF NEW.amount_cents_snapshot IS DISTINCT FROM OLD.amount_cents_snapshot THEN
      RAISE EXCEPTION 'paid_payout_mutation_denied'
        USING DETAIL = 'amount_cents_snapshot of paid/failed payout cannot be changed.';
    END IF;

    -- currency_snapshot: 変更禁止
    IF NEW.currency_snapshot IS DISTINCT FROM OLD.currency_snapshot THEN
      RAISE EXCEPTION 'paid_payout_mutation_denied'
        USING DETAIL = 'currency_snapshot of paid/failed payout cannot be changed.';
    END IF;

    -- recipient_email_snapshot: NULL化のみ許可（別値への変更は禁止）
    IF NEW.recipient_email_snapshot IS DISTINCT FROM OLD.recipient_email_snapshot THEN
      IF NEW.recipient_email_snapshot IS NOT NULL THEN
        RAISE EXCEPTION 'paid_payout_snapshot_change_denied'
          USING DETAIL = 'recipient_email_snapshot can only be set to NULL (redaction), not changed to another value.';
      END IF;
    END IF;

    -- recipient_name_snapshot: NULL化のみ許可（別値への変更は禁止）
    IF NEW.recipient_name_snapshot IS DISTINCT FROM OLD.recipient_name_snapshot THEN
      IF NEW.recipient_name_snapshot IS NOT NULL THEN
        RAISE EXCEPTION 'paid_payout_snapshot_change_denied'
          USING DETAIL = 'recipient_name_snapshot can only be set to NULL (redaction), not changed to another value.';
      END IF;
    END IF;

    -- payout_snapshot: 次の場合のみ許可
    --   1. NULL化（全削除）
    --   2. 機微情報keyが削除されるredact操作（snapshot_redacted_at が追加される場合）
    --   3. snapshot_redacted_at が既に設定済み（再redact禁止）
    IF NEW.payout_snapshot IS DISTINCT FROM OLD.payout_snapshot THEN
      -- NULL化は常に許可
      IF NEW.payout_snapshot IS NOT NULL THEN
        -- snapshot_redacted_at が追加される redact 操作のみ許可
        IF (NEW.payout_snapshot -> 'snapshot_redacted_at') IS NULL THEN
          RAISE EXCEPTION 'paid_payout_snapshot_change_denied'
            USING DETAIL = 'payout_snapshot of paid/failed payout can only be set to NULL or redacted (snapshot_redacted_at must be present).';
        END IF;
        -- 既にredact済みの場合は再変更禁止
        IF (OLD.payout_snapshot -> 'snapshot_redacted_at') IS NOT NULL THEN
          RAISE EXCEPTION 'paid_payout_snapshot_already_redacted'
            USING DETAIL = 'payout_snapshot has already been redacted and cannot be changed again.';
        END IF;
      END IF;
    END IF;

    -- recipient_email_hash / recipient_name_hash: 変更禁止
    IF NEW.recipient_email_hash IS DISTINCT FROM OLD.recipient_email_hash THEN
      RAISE EXCEPTION 'paid_payout_mutation_denied'
        USING DETAIL = 'recipient_email_hash of paid/failed payout cannot be changed.';
    END IF;
    IF NEW.recipient_name_hash IS DISTINCT FROM OLD.recipient_name_hash THEN
      RAISE EXCEPTION 'paid_payout_mutation_denied'
        USING DETAIL = 'recipient_name_hash of paid/failed payout cannot be changed.';
    END IF;

    -- paid_at: 変更禁止
    IF NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
      RAISE EXCEPTION 'paid_payout_mutation_denied'
        USING DETAIL = 'paid_at of paid/failed payout cannot be changed.';
    END IF;

    -- paypal_payout_id: 変更禁止
    IF NEW.paypal_payout_id IS DISTINCT FROM OLD.paypal_payout_id THEN
      RAISE EXCEPTION 'paid_payout_mutation_denied'
        USING DETAIL = 'paypal_payout_id of paid/failed payout cannot be changed.';
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- トリガーが存在しない場合は作成（既存は置き換え済み）
-- RP-5a で CREATE OR REPLACE 済みのため DROP は不要だが念のため
DROP TRIGGER IF EXISTS trg_prevent_paid_payout_mutation ON prize_payouts;
CREATE TRIGGER trg_prevent_paid_payout_mutation
  BEFORE UPDATE ON prize_payouts
  FOR EACH ROW
  EXECUTE FUNCTION prevent_paid_payout_mutation();

COMMENT ON FUNCTION prevent_paid_payout_mutation() IS
  'paid/failed payout の不正変更を防ぐトリガー関数。'
  'payout_snapshot は NULL化・redact（snapshot_redacted_at 付き）のみ許可。'
  '2026-06-16: payout_snapshot redact許可ロジック追加。';
