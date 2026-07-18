-- ============================================================
-- F-03: Prize Recipient Snapshot 自動 Redaction Sweep
--
-- 目的:
--   prize_payouts.recipient_email_snapshot /
--   prize_payouts.recipient_name_snapshot を、
--   支払処理・retry処理が完全に終了した後、
--   30日経過時点で自動 redact する。
--
-- 追加:
--   Function: public.sweep_expired_prize_recipient_snapshots()
--   pg_cron:  prize-recipient-snapshot-redaction-sweep
--             (15 18 * * * = 毎日 03:15 JST)
--
-- redaction 対象条件:
--
--   対象A: paid payout 自身
--     status = 'paid'
--     AND paid_at IS NOT NULL
--     AND paid_at <= now() - interval '30 days'
--     AND (recipient_email_snapshot IS NOT NULL
--          OR recipient_name_snapshot IS NOT NULL)
--
--   対象B: failed / canceled の retry 元 payout
--     status IN ('failed', 'canceled')
--     AND recipient snapshot が残っている
--     AND 子孫 retry チェーンに paid payout が存在する
--     AND その paid_at が 30 日以上前
--     AND チェーン内に prepared 等の未完了 payout が存在しない
--     ※ recursive CTE で多段 retry を追跡する
--
-- 安全原則:
--   - prepared payout は絶対に対象にしない
--   - paid 後 30 日未満は対象にしない
--   - retry 未実施・retry 途中・最終支払未完了は対象にしない
--   - failed / canceled のみで終わったチェーンは対象にしない
--   - payout_snapshot は変更しない
--   - status / paid_at / failed_at / canceled_at は変更しない
--   - retry_source_payout_id は変更しない
--   - DELETE 文なし
--   - 手動実行なし（pg_cron のみ）
--   - ログに PII 実値を含めない
--
-- immutability trigger 対応:
--   prevent_paid_payout_mutation() (RP-5d) にて
--   paid / failed / canceled のすべてで
--   recipient_email_snapshot / recipient_name_snapshot の
--   NULL 化（redaction）のみ明示許可済み。
--
-- F-01 cron / function は変更しない。
-- ============================================================

-- ============================================================
-- 1. sweep function
-- ============================================================

CREATE OR REPLACE FUNCTION public.sweep_expired_prize_recipient_snapshots()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now    timestamptz := now();
  v_ids    uuid[];
  v_id     uuid;
  v_payout prize_payouts%ROWTYPE;
  v_before jsonb;
  v_after  jsonb;
  v_count  integer := 0;
BEGIN
  -- ────────────────────────────────────────────────────────────
  -- 対象 payout id を収集
  --
  -- 対象A: paid payout で paid_at から 30 日経過
  -- 対象B: failed / canceled payout で、
  --        子孫 retry チェーンに paid payout が存在し、
  --        その paid_at から 30 日経過しており、
  --        チェーン内に 'prepared' 等の未完了 payout がない
  -- ────────────────────────────────────────────────────────────
  WITH

  -- 子孫チェーン展開（子 → 親 方向が retry_source_payout_id）
  -- 起点: すべての payout を root として子孫を展開する
  -- 方向: 子の retry_source_payout_id = 親.id
  --       つまり「誰が自分を親として指しているか」= 子一覧
  descendants AS (
    -- 各 payout の直接の子（retry 先）を辿る
    SELECT
      p.id           AS root_id,   -- 探索起点（failed/canceled 候補）
      child.id       AS node_id,
      child.status   AS node_status,
      child.paid_at  AS node_paid_at,
      1              AS depth
    FROM prize_payouts p
    JOIN prize_payouts child
      ON child.retry_source_payout_id = p.id
    WHERE p.status IN ('failed', 'canceled')

    UNION ALL

    SELECT
      d.root_id,
      grandchild.id,
      grandchild.status,
      grandchild.paid_at,
      d.depth + 1
    FROM descendants d
    JOIN prize_payouts grandchild
      ON grandchild.retry_source_payout_id = d.node_id
    WHERE d.depth < 12  -- retry chain depth 上限 (RP-5d: max 9)
  ),

  -- failed / canceled per root: チェーン内の未完了有無・paid 存在・paid_at を集約
  chain_summary AS (
    SELECT
      root_id,
      BOOL_OR(node_status = 'paid')                        AS has_paid_descendant,
      BOOL_OR(node_status NOT IN ('paid','failed','canceled')) AS has_incomplete,
      MAX(node_paid_at) FILTER (WHERE node_status = 'paid') AS latest_paid_at
    FROM descendants
    GROUP BY root_id
  ),

  -- 対象 A: paid 自身 (30 日経過)
  target_paid AS (
    SELECT p.id
    FROM prize_payouts p
    WHERE p.status = 'paid'
      AND p.paid_at IS NOT NULL
      AND p.paid_at <= v_now - interval '30 days'
      AND (
        p.recipient_email_snapshot IS NOT NULL
        OR p.recipient_name_snapshot IS NOT NULL
      )
  ),

  -- 対象 B: failed / canceled (子孫 paid 30 日経過 + チェーン完了確認)
  target_fc AS (
    SELECT p.id
    FROM prize_payouts p
    JOIN chain_summary cs ON cs.root_id = p.id
    WHERE p.status IN ('failed', 'canceled')
      AND cs.has_paid_descendant = TRUE
      AND cs.has_incomplete = FALSE
      AND cs.latest_paid_at IS NOT NULL
      AND cs.latest_paid_at <= v_now - interval '30 days'
      AND (
        p.recipient_email_snapshot IS NOT NULL
        OR p.recipient_name_snapshot IS NOT NULL
      )
  )

  SELECT ARRAY_AGG(id)
    INTO v_ids
    FROM (
      SELECT id FROM target_paid
      UNION
      SELECT id FROM target_fc
    ) combined;

  IF v_ids IS NULL THEN
    RETURN 0;
  END IF;

  -- ────────────────────────────────────────────────────────────
  -- 各 payout を row-lock して redact
  -- ────────────────────────────────────────────────────────────
  FOREACH v_id IN ARRAY v_ids LOOP

    SELECT *
      INTO v_payout
      FROM prize_payouts
     WHERE id = v_id
       AND (
         recipient_email_snapshot IS NOT NULL
         OR recipient_name_snapshot IS NOT NULL
       )
    FOR UPDATE SKIP LOCKED;   -- 他トランザクション実行中はスキップ（冪等）

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- ── archive log 用 before_state（PII 不可） ───────────────
    v_before := jsonb_build_object(
      'status',                        v_payout.status,
      'had_recipient_email_snapshot',  (v_payout.recipient_email_snapshot IS NOT NULL),
      'had_recipient_name_snapshot',   (v_payout.recipient_name_snapshot  IS NOT NULL)
    );

    -- ── redact: snapshot 2 列のみ NULL 化 ─────────────────────
    -- immutability trigger により NULL 化のみ許可済み（RP-5d）
    -- payout_snapshot / status / paid_at 等は変更しない
    UPDATE prize_payouts
       SET recipient_email_snapshot = NULL,
           recipient_name_snapshot  = NULL,
           updated_at               = v_now
     WHERE id = v_id;

    -- ── archive log 用 after_state（PII 不可） ────────────────
    v_after := jsonb_build_object(
      'status',                            v_payout.status,
      'recipient_email_snapshot_cleared',  TRUE,
      'recipient_name_snapshot_cleared',   TRUE,
      'sweep',                             TRUE
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
      'recipient_snapshot_redacted',
      'prize_payouts',
      v_id,
      NULL,    -- 自動 sweep: auth context なし
      v_before,
      v_after,
      'auto-swept by sweep_expired_prize_recipient_snapshots'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ── 権限設定 ──────────────────────────────────────────────────
-- PUBLIC / anon / authenticated は実行不可
-- service_role / postgres は SECURITY DEFINER により実行可能
REVOKE ALL ON FUNCTION public.sweep_expired_prize_recipient_snapshots() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sweep_expired_prize_recipient_snapshots() FROM anon;
REVOKE ALL ON FUNCTION public.sweep_expired_prize_recipient_snapshots() FROM authenticated;

-- ============================================================
-- 2. pg_cron 登録（重複防止）
-- ============================================================

DO $$
BEGIN
  -- 同名 job が存在する場合は先に削除（migration 再実行時の増殖防止）
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prize-recipient-snapshot-redaction-sweep') THEN
    PERFORM cron.unschedule('prize-recipient-snapshot-redaction-sweep');
  END IF;

  -- 毎日 18:15 UTC = 03:15 JST
  PERFORM cron.schedule(
    'prize-recipient-snapshot-redaction-sweep',
    '15 18 * * *',
    'SELECT public.sweep_expired_prize_recipient_snapshots();'
  );
END $$;
