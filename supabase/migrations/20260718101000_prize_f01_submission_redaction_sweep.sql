-- ============================================================
-- F-01: Prize Submission PII 自動 Redaction Sweep
--
-- 目的:
--   prize_temp_tax_submissions.submission_data を、
--   支払処理に必要な情報が payout 側へ安全に保存済みの場合に限り、
--   提出から 72 時間経過後に自動 redact する。
--
-- 追加:
--   Function: public.sweep_expired_prize_submission_data()
--   pg_cron:  prize-submission-redaction-sweep (18:10 UTC 毎日)
--
-- Redaction 内容は既存手動 archive (admin_mark_prize_submission_archived) と一致:
--   submission_data = NULL
--   status          = 'data_cleared'
--   archived_at     = COALESCE(archived_at, now())
--   data_cleared_at = now()
--   updated_at      = now()
--   prize_archive_logs INSERT (PII 不含)
--
-- 安全条件 (payout snapshot 必須):
--   prize_payouts.source_submission_id = prize_temp_tax_submissions.id
--   prize_payouts.payout_snapshot IS NOT NULL
--   prize_payouts.status IN ('prepared', 'paid', 'failed', 'canceled')
--
-- 禁止事項:
--   - prize_payouts の更新
--   - payout_snapshot の変更
--   - recipient snapshot の変更
--   - prize_awards の更新
--   - DELETE 文
--   - Edge Function
-- ============================================================

-- ============================================================
-- 1. sweep function
-- ============================================================

CREATE OR REPLACE FUNCTION public.sweep_expired_prize_submission_data()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now   timestamptz := now();
  v_ids   uuid[];
  v_id    uuid;
  v_sub   prize_temp_tax_submissions%ROWTYPE;
  v_before jsonb;
  v_after  jsonb;
  v_count  integer := 0;
BEGIN
  -- ── 対象 submission id を収集 ──────────────────────────────
  -- 基本条件:
  --   submission_data IS NOT NULL
  --   status <> 'data_cleared'
  --   delete_after <= now()
  -- 安全条件:
  --   対応 payout が存在し payout_snapshot IS NOT NULL
  --   かつ status IN ('prepared','paid','failed','canceled')
  SELECT ARRAY_AGG(pts.id)
    INTO v_ids
    FROM prize_temp_tax_submissions pts
   WHERE pts.submission_data IS NOT NULL
     AND pts.status <> 'data_cleared'
     AND pts.delete_after <= v_now
     AND EXISTS (
           SELECT 1
             FROM prize_payouts pp
            WHERE pp.source_submission_id = pts.id
              AND pp.payout_snapshot IS NOT NULL
              AND pp.status IN ('prepared', 'paid', 'failed', 'canceled')
         );

  IF v_ids IS NULL THEN
    RETURN 0;
  END IF;

  -- ── 各 submission を row-lock して redact ──────────────────
  FOREACH v_id IN ARRAY v_ids LOOP

    SELECT *
      INTO v_sub
      FROM prize_temp_tax_submissions
     WHERE id = v_id
       AND submission_data IS NOT NULL
       AND status <> 'data_cleared'
    FOR UPDATE SKIP LOCKED;   -- 他トランザクション実行中はスキップ（冪等）

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- ── archive log 用 before_state（PII 不可） ───────────────
    v_before := jsonb_build_object(
      'status',              v_sub.status,
      'has_submission_data', TRUE,
      'delete_after',        v_sub.delete_after
    );

    -- ── redact（手動 archive と完全同一） ──────────────────────
    UPDATE prize_temp_tax_submissions
       SET submission_data = NULL,
           status          = 'data_cleared',
           archived_at     = COALESCE(archived_at, v_now),
           data_cleared_at = v_now,
           updated_at      = v_now
     WHERE id = v_id;

    -- ── archive log 用 after_state（PII 不可） ────────────────
    v_after := jsonb_build_object(
      'status',              'data_cleared',
      'has_submission_data', FALSE,
      'data_cleared_at',     v_now,
      'sweep',               TRUE
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
      v_id,
      NULL,    -- 自動 sweep: auth context なし
      v_before,
      v_after,
      'auto-swept by sweep_expired_prize_submission_data'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ── 権限設定 ──────────────────────────────────────────────────
-- PUBLIC / anon / authenticated は実行不可
-- service_role / postgres は SECURITY DEFINER により実行可能
REVOKE ALL ON FUNCTION public.sweep_expired_prize_submission_data() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sweep_expired_prize_submission_data() FROM anon;
REVOKE ALL ON FUNCTION public.sweep_expired_prize_submission_data() FROM authenticated;

-- ============================================================
-- 2. pg_cron 登録（重複防止）
-- ============================================================

DO $$
BEGIN
  -- 同名 job が存在する場合は先に削除（migration 再実行時の増殖防止）
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prize-submission-redaction-sweep') THEN
    PERFORM cron.unschedule('prize-submission-redaction-sweep');
  END IF;

  -- 毎日 18:10 UTC = 03:10 JST
  PERFORM cron.schedule(
    'prize-submission-redaction-sweep',
    '10 18 * * *',
    'SELECT public.sweep_expired_prize_submission_data();'
  );
END $$;
