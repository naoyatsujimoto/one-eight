-- ============================================================
-- Prize Winner File Fix: 機微情報欠落修正
--
-- 問題:
--   1. prize_payouts に payout_snapshot がなく、住所・税務情報が
--      submission_data 削除後に消失する
--   2. admin_prepare_payout が paypal_email / legal_name しか
--      snapshot しておらず、住所等が Winner File PDF に表示されない
--   3. admin_get_prize_submission_for_print が payout 情報を
--      含まないため Payout ID / Prepared At が表示されない
--   4. PrizeWinnerFilePrint.tsx のキー不一致（別途 TypeScript 修正）
--
-- 修正内容:
--   A. prize_payouts に payout_snapshot jsonb カラムを追加
--   B. admin_prepare_payout RPC: payout_snapshot に全情報をコピー
--   C. admin_get_prize_submission_for_print RPC: payout 情報を追加
--
-- 禁止事項:
--   - PayPal 送金実行
--   - Mark as Paid 実行
--   - Cancel Payout 実行
--   - payout / archive / submission data 削除
--   - 今回添付 PDF の内容を復元
--   - 削除済み機微情報の DB 復元
--   - console.log 等での個人情報出力
--   - archive log への PII 保存
-- ============================================================

-- ============================================================
-- A. prize_payouts に payout_snapshot jsonb カラムを追加
--    submission_data 削除後でも Winner File 再印刷できるように
--    prepare 時点の全情報を snapshot として保持する
-- ============================================================

ALTER TABLE prize_payouts
  ADD COLUMN IF NOT EXISTS payout_snapshot jsonb;

COMMENT ON COLUMN prize_payouts.payout_snapshot IS
  'Prepare 時点の submission_data 全フィールドを snapshot として保持。'
  'submission_data 削除後の Winner File 再印刷に使用。'
  'PII を含むため logs / reports に出力禁止。';

-- ============================================================
-- B. admin_prepare_payout RPC 更新
--    payout_snapshot に submission_data 全フィールドをコピー
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

  -- ── 8. hash 計算 (pgcrypto) ────────────────────────────────────────
  v_normalized_email := lower(btrim(v_paypal_email));
  v_normalized_name  := lower(btrim(v_legal_name));

  v_email_hash := encode(digest(v_normalized_email, 'sha256'), 'hex');
  v_name_hash  := encode(digest(v_normalized_name,  'sha256'), 'hex');

  -- ── 9. payout_snapshot 構築（submission_data 全フィールド + award 情報） ──
  -- submission_data が削除された後も Winner File を再印刷できるように
  -- 全フィールドを snapshot として保存する
  v_snapshot := jsonb_build_object(
    -- submission_data 全フィールド（機微情報）
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
    'snapshot_taken_at',       to_jsonb(v_now),
    'submission_id',           to_jsonb(v_submission.id),
    'submission_created_at',   to_jsonb(v_submission.created_at)
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
  'Fix (2026-06-16): payout_snapshot 全フィールド追加。';

-- ============================================================
-- C. admin_get_prize_submission_for_print RPC 拡張
--    submission_data が削除済みの場合は payout_snapshot を代替として返す
--    payout_id / prepared_at を追加で返す
-- ============================================================

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
  v_payout      prize_payouts%ROWTYPE;
  v_result      jsonb;
  v_print_data  jsonb;  -- submission_data または payout_snapshot のどちらか
  v_data_source text;
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

  -- ── submission 取得（status='data_cleared' でも取得する） ─────────────
  SELECT *
    INTO v_sub
    FROM prize_temp_tax_submissions
   WHERE id = p_submission_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'submission_not_found'
      USING DETAIL = 'Submission not found.';
  END IF;

  -- ── award 取得 ────────────────────────────────────────────
  SELECT *
    INTO v_award
    FROM prize_awards
   WHERE id = v_sub.award_id;

  -- ── payout 取得（source_submission_id で紐付け） ──────────────────────
  -- payout_snapshot が含まれるものを優先
  SELECT *
    INTO v_payout
    FROM prize_payouts
   WHERE source_submission_id = p_submission_id
     AND payout_snapshot IS NOT NULL
   ORDER BY created_at DESC
   LIMIT 1;

  -- payout_snapshot が見つからない場合は award_id で fallback
  IF NOT FOUND THEN
    SELECT *
      INTO v_payout
      FROM prize_payouts
     WHERE award_id = v_sub.award_id
     ORDER BY
       CASE status
         WHEN 'paid'     THEN 1
         WHEN 'prepared' THEN 2
         WHEN 'failed'   THEN 3
         WHEN 'canceled' THEN 4
       END,
       created_at DESC
     LIMIT 1;
  END IF;

  -- ── print_data 決定 ────────────────────────────────────────────────────
  -- 優先順: submission_data > payout_snapshot > NULL
  IF v_sub.submission_data IS NOT NULL THEN
    v_print_data  := v_sub.submission_data;
    v_data_source := 'submission_data';
  ELSIF v_payout.payout_snapshot IS NOT NULL THEN
    v_print_data  := v_payout.payout_snapshot;
    v_data_source := 'payout_snapshot';
  ELSE
    v_print_data  := NULL;
    v_data_source := 'unavailable';
  END IF;

  -- ── 結果構築 ──────────────────────────────────────────────
  v_result := jsonb_build_object(
    'submission_id',         v_sub.id,
    'award_id',              v_sub.award_id,
    'recipient_user_id',     v_sub.user_id,
    'submission_status',     v_sub.status,
    'submission_data',       v_print_data,
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
    'award_status',          v_award.status,
    -- payout 情報（新規追加）
    'payout_id',             v_payout.id,
    'payout_status',         v_payout.status,
    'prepared_at',           v_payout.created_at,
    'paid_at',               v_payout.paid_at,
    -- データソース（印刷時の表示用）
    'data_source',           v_data_source
  );

  RETURN v_result;
END;
$$;

-- GRANT: authenticated のみ / anon 不可
REVOKE ALL ON FUNCTION admin_get_prize_submission_for_print(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_get_prize_submission_for_print(uuid) TO authenticated;

COMMENT ON FUNCTION admin_get_prize_submission_for_print(uuid) IS
  'Admin: Winner File 印刷用。submission_data が削除済みの場合は '
  'payout_snapshot を代替として使用。payout_id / prepared_at を追加。'
  'Fix (2026-06-16): data_cleared 後も payout_snapshot から印刷可能に。';
