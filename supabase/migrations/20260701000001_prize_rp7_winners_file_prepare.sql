-- ============================================================
-- RP-7: WINNERS FILE Prepare — 過去提出済みユーザーの新規Award対応
--
-- 背景:
--   税務情報は一度提出したら WINNERS FILE にオフライン保存される。
--   2回目以降の Award では DB 上に新しい submission_data がなくても、
--   Naoya が user_id で WINNERS FILE を確認したうえで payout を prepare できる。
--
-- 変更内容:
--   A. prize_payouts スキーマ
--      - recipient_email_snapshot / recipient_name_snapshot を nullable 化
--        （WINNERS FILE ベース prepare では DB に PII を持たない）
--      - winners_file_check_required boolean カラム追加
--
--   B. admin_check_user_prior_submission(p_user_id uuid)
--      ユーザーが過去に税務情報を提出済みかどうかを確認する軽量 RPC
--      PIIなし・PIIを返さない
--
--   C. admin_prepare_payout_winners_file(p_award_id uuid)
--      過去提出済み user_id の新規 Award に対して、
--      PII snapshot なし・WINNERS FILE 確認前提で prepared 化する RPC
--
--   D. admin_get_payout_detail 更新
--      - user_prior_submission_exists を追加
--      - user_prior_submission_count を追加
--      - pii_data_source に 'winners_file' を追加
--      - winners_file_check_required を追加
--
--   E. admin_list_payable_awards 更新
--      - display_label に 'Prior Sub on File' を追加
--        （過去提出済み user_id で新規 Award に submission がない場合）
--
-- 禁止:
--   - PayPal 送金実行
--   - PII をログ・archive log に保存
--   - 機微情報の復元・再保存
--   - RLS / policy 変更
--   - Prize / Payout 以外への接触
-- ============================================================

-- ============================================================
-- A-1. recipient_email_snapshot / recipient_name_snapshot を nullable 化
--      （WINNERS FILE ベース prepare では PII を DB に持たない）
-- ============================================================

ALTER TABLE prize_payouts
  ALTER COLUMN recipient_email_snapshot DROP NOT NULL;

ALTER TABLE prize_payouts
  ALTER COLUMN recipient_name_snapshot DROP NOT NULL;

COMMENT ON COLUMN prize_payouts.recipient_email_snapshot IS
  'PayPal email snapshot at prepare time. NULL when winners_file_check_required=true (PII is in offline WINNERS FILE).';

COMMENT ON COLUMN prize_payouts.recipient_name_snapshot IS
  'Legal name snapshot at prepare time. NULL when winners_file_check_required=true (PII is in offline WINNERS FILE).';

-- ============================================================
-- A-2. winners_file_check_required カラム追加
-- ============================================================

ALTER TABLE prize_payouts
  ADD COLUMN IF NOT EXISTS winners_file_check_required boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN prize_payouts.winners_file_check_required IS
  'true = WINNERS FILE ベースで prepare した。Naoya が user_id で WINNERS FILE を確認してから PayPal 手動送金を行う。';

-- ============================================================
-- B. admin_check_user_prior_submission(p_user_id uuid)
--    PIIなし。過去提出済み有無・件数のみを返す。
-- ============================================================

DROP FUNCTION IF EXISTS admin_check_user_prior_submission(uuid);

CREATE OR REPLACE FUNCTION admin_check_user_prior_submission(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_count    int;
  v_latest_status text;
BEGIN
  -- admin 確認
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

  -- 対象 user_id の提出済み submission 数を集計（PII は取得しない）
  SELECT COUNT(*)
    INTO v_count
    FROM prize_temp_tax_submissions pts
   WHERE pts.user_id = p_user_id
     AND pts.status IN ('submitted', 'reviewed', 'archived', 'data_cleared');

  -- 最新 status
  SELECT pts.status
    INTO v_latest_status
    FROM prize_temp_tax_submissions pts
   WHERE pts.user_id = p_user_id
     AND pts.status IN ('submitted', 'reviewed', 'archived', 'data_cleared')
   ORDER BY pts.created_at DESC
   LIMIT 1;

  RETURN jsonb_build_object(
    'user_id',                  p_user_id,
    'has_prior_submission',     v_count > 0,
    'submission_count',         v_count,
    'latest_submission_status', v_latest_status
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_check_user_prior_submission(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_check_user_prior_submission(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION admin_check_user_prior_submission(uuid) TO authenticated;

COMMENT ON FUNCTION admin_check_user_prior_submission(uuid) IS
  'Admin: 対象 user_id の過去提出済み件数を返す。PIIなし。WINNERS FILE prepare 前の確認用。';

-- ============================================================
-- C. admin_prepare_payout_winners_file(p_award_id uuid)
--    WINNERS FILE ベース prepare。PII snapshot なし。
--    - 今回の award_id に submission がないこと
--    - recipient_user_id に過去提出済みがあること
--    を確認してから payout を prepared で作成する。
-- ============================================================

DROP FUNCTION IF EXISTS admin_prepare_payout_winners_file(uuid);

CREATE OR REPLACE FUNCTION admin_prepare_payout_winners_file(
  p_award_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin    boolean;
  v_award       prize_awards%ROWTYPE;
  v_prior_count int;
  v_payout_id   uuid;
  v_now         timestamptz := now();
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

  -- ── 2. award 取得・ロック ──────────────────────────────────────────────
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

  -- ── 4. active payout 確認 ────────────────────────────────────────────
  IF EXISTS (
    SELECT 1
      FROM prize_payouts
     WHERE award_id = p_award_id
       AND status IN ('prepared', 'paid')
  ) THEN
    RAISE EXCEPTION 'active_payout_already_exists';
  END IF;

  -- ── 5. この award_id に submission_data があれば通常 prepare を使うよう拒否 ──
  IF EXISTS (
    SELECT 1
      FROM prize_temp_tax_submissions
     WHERE award_id = p_award_id
       AND user_id  = v_award.recipient_user_id
       AND submission_data IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'use_regular_prepare: submission_data exists for this award; use admin_prepare_payout instead';
  END IF;

  -- ── 6. user_id に過去提出済み submission があるか確認（必須）────────────
  SELECT COUNT(*)
    INTO v_prior_count
    FROM prize_temp_tax_submissions
   WHERE user_id = v_award.recipient_user_id
     AND status IN ('submitted', 'reviewed', 'archived', 'data_cleared');

  IF v_prior_count = 0 THEN
    RAISE EXCEPTION 'no_prior_submission: this user has no prior submission; use regular flow after user submits info';
  END IF;

  -- ── 7. payout INSERT（PII なし・WINNERS FILE 確認前提）───────────────
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
    winners_file_check_required,
    created_by_user_id,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_award_id,
    v_award.amount_cents,
    v_award.currency,
    NULL,     -- PII なし（WINNERS FILE で確認）
    NULL,     -- PII なし（WINNERS FILE で確認）
    NULL,
    NULL,
    'paypal_manual',
    'prepared',
    NULL,     -- source_submission_id なし（WINNERS FILE ベース）
    true,     -- WINNERS FILE 確認必須フラグ
    auth.uid(),
    v_now,
    v_now
  )
  RETURNING id INTO v_payout_id;

  -- ── 8. archive log（PII 不混入）──────────────────────────────────────
  INSERT INTO prize_archive_logs (
    event_type,
    entity_type,
    entity_id,
    actor_user_id,
    before_state,
    after_state,
    created_at
  ) VALUES (
    'payout_prepared',
    'payout',
    v_payout_id,
    auth.uid(),
    jsonb_build_object(
      'award_id',             p_award_id,
      'award_status',         v_award.status,
      'prepare_mode',         'winners_file',
      'prior_submission_count', v_prior_count
    ),
    jsonb_build_object(
      'award_id',                   p_award_id,
      'payout_id',                  v_payout_id,
      'payout_status',              'prepared',
      'payment_method',             'paypal_manual',
      'prepare_mode',               'winners_file',
      'winners_file_check_required', true,
      'recipient_user_id',          v_award.recipient_user_id,
      'amount_cents',               v_award.amount_cents,
      'currency',                   v_award.currency
    ),
    v_now
  );

  -- ── 9. 戻り値（PIIなし）──────────────────────────────────────────────
  RETURN jsonb_build_object(
    'ok',                          true,
    'payout_id',                   v_payout_id,
    'award_id',                    p_award_id,
    'status',                      'prepared',
    'prepared_at',                 v_now,
    'payment_method',              'paypal_manual',
    'winners_file_check_required', true
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_prepare_payout_winners_file(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_prepare_payout_winners_file(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION admin_prepare_payout_winners_file(uuid) TO authenticated;

COMMENT ON FUNCTION admin_prepare_payout_winners_file(uuid) IS
  'Admin: WINNERS FILE ベースで payout を prepared 化する。PII snapshot なし。'
  'Naoya が recipient_user_id で WINNERS FILE を確認してから PayPal 手動送金。';

-- ============================================================
-- D. admin_get_payout_detail 更新
--    user_prior_submission_exists / user_prior_submission_count /
--    winners_file_check_required / pii_data_source='winners_file' を追加
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
  v_caller_id              uuid;
  v_is_admin               boolean;
  v_award                  prize_awards%ROWTYPE;
  v_sub                    prize_temp_tax_submissions%ROWTYPE;
  v_pyt                    prize_payouts%ROWTYPE;
  v_legal_name             text;
  v_paypal_email           text;
  v_data_source            text;
  v_prior_count            int;
  v_prior_latest_status    text;
  v_winners_file_required  boolean;
  v_result                 jsonb;
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

  -- ── latest submission 取得（この award_id 限定）────────────
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

  -- ── user_id 単位での過去提出済み件数（PIIなし）────────────
  SELECT COUNT(*), MAX(pts.status)
    INTO v_prior_count, v_prior_latest_status
    FROM prize_temp_tax_submissions pts
   WHERE pts.user_id = v_award.recipient_user_id
     AND pts.status IN ('submitted', 'reviewed', 'archived', 'data_cleared');

  -- ── winners_file_check_required フラグ取得 ─────────────────
  v_winners_file_required := COALESCE(v_pyt.winners_file_check_required, false);

  -- ── PII 取得（条件付き）────────────────────────────────────
  -- 優先順: payout snapshot（非null） > submission_data > winners_file > 取得不可
  IF v_pyt.id IS NOT NULL AND v_pyt.recipient_email_snapshot IS NOT NULL THEN
    -- 通常 prepare からのスナップショット
    v_paypal_email := v_pyt.recipient_email_snapshot;
    v_legal_name   := v_pyt.recipient_name_snapshot;
    v_data_source  := 'payout_snapshot';
  ELSIF v_sub.id IS NOT NULL AND v_sub.submission_data IS NOT NULL THEN
    -- submission_data から取得（まだ prepare していない）
    v_paypal_email := v_sub.submission_data ->> 'paypal_email';
    v_legal_name   := v_sub.submission_data ->> 'legal_name';
    v_data_source  := 'submission_data';
  ELSIF v_winners_file_required THEN
    -- WINNERS FILE ベース prepare。DB に PII なし。Naoya が WINNERS FILE を確認する。
    v_paypal_email := NULL;
    v_legal_name   := NULL;
    v_data_source  := 'winners_file';
  ELSIF v_prior_count > 0 AND v_pyt.id IS NULL THEN
    -- payout 未作成だが過去提出済みユーザー → WINNERS FILE で prepare 可能
    v_paypal_email := NULL;
    v_legal_name   := NULL;
    v_data_source  := 'winners_file';
  ELSE
    -- データ消去済みかつ payout snapshot なし → 支払不能
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
    -- submission 情報（この award_id のみ・PIIなし）
    'latest_submission_id',           v_sub.id,
    'latest_submission_status',       v_sub.status,
    'latest_submission_submitted_at', v_sub.created_at,
    'latest_submission_delete_after', v_sub.delete_after,
    -- payout 情報（PIIなし）
    'latest_payout_id',               v_pyt.id,
    'latest_payout_status',           v_pyt.status,
    'latest_payout_paid_at',          v_pyt.paid_at,
    -- PII（表示専用・Console log 禁止）
    'legal_name',                     v_legal_name,
    'paypal_email',                   v_paypal_email,
    'pii_data_source',                v_data_source,
    -- user_id 単位の過去提出済み情報（PIIなし）
    'user_prior_submission_exists',   v_prior_count > 0,
    'user_prior_submission_count',    v_prior_count,
    'user_prior_latest_status',       v_prior_latest_status,
    -- WINNERS FILE フラグ
    'winners_file_check_required',    v_winners_file_required
  );

  -- ── detail_viewed archive log（PII 不混入）──────────────────
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
      'has_pii_response',          TRUE,
      'pii_data_source',           v_data_source,
      'view_context',              'payout_detail',
      'winners_file_check_required', v_winners_file_required
    ),
    jsonb_build_object(
      'has_pii_response',          TRUE,
      'pii_data_source',           v_data_source,
      'view_context',              'payout_detail',
      'winners_file_check_required', v_winners_file_required
    ),
    NULL
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION admin_get_payout_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_get_payout_detail(uuid) TO authenticated;

COMMENT ON FUNCTION admin_get_payout_detail(uuid) IS
  'Admin: award に紐づく payout 詳細を返す。PII 含む（表示専用）。'
  'RP-7追加: user_prior_submission_exists / winners_file_check_required フィールド追加。';

-- ============================================================
-- E. admin_list_payable_awards 更新
--    display_label に 'Prior Sub on File' を追加
--    （過去提出済み user_id で新規 Award に submission がない場合）
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
  display_label                     text,
  arena_code                        text,
  user_prior_submission_exists      boolean
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
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT is_admin INTO v_is_admin
    FROM profiles WHERE id = v_caller_id;
  IF NOT FOUND OR v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  RETURN QUERY
  WITH sub AS (
    SELECT DISTINCT ON (pts.award_id)
      pts.award_id,
      pts.id           AS submission_id,
      pts.status       AS submission_status,
      pts.created_at   AS submitted_at,
      pts.delete_after,
      pts.data_cleared_at
    FROM prize_temp_tax_submissions pts
    ORDER BY pts.award_id, pts.created_at DESC
  ),
  pyt AS (
    SELECT DISTINCT ON (pp.award_id)
      pp.award_id,
      pp.id           AS payout_id,
      pp.status       AS payout_status,
      pp.paid_at
    FROM prize_payouts pp
    ORDER BY pp.award_id,
      CASE pp.status
        WHEN 'paid'     THEN 1
        WHEN 'prepared' THEN 2
        WHEN 'failed'   THEN 3
        WHEN 'canceled' THEN 4
        ELSE 5
      END,
      pp.created_at DESC
  ),
  prior_sub AS (
    -- user_id 単位での過去提出済み件数（PIIなし）
    SELECT pts.user_id, COUNT(*) AS prior_count
    FROM prize_temp_tax_submissions pts
    WHERE pts.status IN ('submitted', 'reviewed', 'archived', 'data_cleared')
    GROUP BY pts.user_id
  )
  SELECT
    a.id                           AS award_id,
    a.recipient_user_id,
    p.display_name                 AS recipient_display_name,
    a.source_kind,
    a.source_arena_id,
    a.source_arena_event_id,
    a.source_arena_match_id,
    a.amount_cents,
    a.currency,
    a.prize_kind,
    a.status                       AS award_status,
    sub.submission_id              AS latest_submission_id,
    sub.submission_status          AS latest_submission_status,
    sub.submitted_at               AS latest_submission_submitted_at,
    sub.delete_after               AS latest_submission_delete_after,
    sub.data_cleared_at            AS latest_submission_data_cleared_at,
    pyt.payout_id                  AS latest_payout_id,
    pyt.payout_status              AS latest_payout_status,
    pyt.paid_at                    AS latest_payout_paid_at,
    a.created_at,
    -- display_label 判定（RP-7: Prior Sub on File 追加）
    CASE
      -- award 終端状態
      WHEN a.status = 'on_hold'   THEN 'On Hold'
      WHEN a.status = 'canceled'  THEN 'Canceled'
      WHEN a.status = 'expired'   THEN 'Expired'
      -- payout 状態優先
      WHEN pyt.payout_status = 'paid'     THEN 'Paid'
      WHEN pyt.payout_status = 'prepared' THEN 'Prepared'
      WHEN pyt.payout_status = 'failed'   THEN 'Failed'
      WHEN pyt.payout_status = 'canceled' THEN 'Canceled'
      -- submission 状態
      WHEN sub.submission_status IN ('submitted', 'reviewed') THEN 'Awaiting Archive'
      WHEN sub.submission_status = 'archived' THEN 'Ready for Prepare'
      -- submission なし・過去提出済み user_id → WINNERS FILE ベース prepare 可能
      WHEN a.status = 'eligible' AND sub.submission_id IS NULL
           AND COALESCE(ps.prior_count, 0) > 0 THEN 'Prior Sub on File'
      -- submission なし
      WHEN a.status = 'eligible' AND sub.submission_id IS NULL THEN 'Awaiting Submission'
      ELSE 'Awaiting Submission'
    END                            AS display_label,
    ae.arena_code,
    COALESCE(ps.prior_count, 0) > 0 AS user_prior_submission_exists
  FROM prize_awards a
  LEFT JOIN profiles p           ON p.id = a.recipient_user_id
  LEFT JOIN sub                  ON sub.award_id = a.id
  LEFT JOIN pyt                  ON pyt.award_id = a.id
  LEFT JOIN prize_arena_events ae ON ae.id = a.source_arena_event_id
  LEFT JOIN prior_sub ps         ON ps.user_id = a.recipient_user_id
  WHERE a.status NOT IN ('canceled', 'expired')
  ORDER BY a.created_at DESC
  LIMIT 200;
END;
$$;

REVOKE ALL ON FUNCTION admin_list_payable_awards() FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_list_payable_awards() FROM anon;
GRANT EXECUTE ON FUNCTION admin_list_payable_awards() TO authenticated;

COMMENT ON FUNCTION admin_list_payable_awards() IS
  'Admin: Payment Dashboard 用 award 一覧。PIIなし。'
  'RP-7追加: user_prior_submission_exists カラム / display_label: Prior Sub on File 追加。';
