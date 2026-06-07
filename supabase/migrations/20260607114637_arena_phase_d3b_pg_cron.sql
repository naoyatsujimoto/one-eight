-- =============================================================================
-- Official Arena Phase D-3b — pg_cron scheduled jobs (自律実行)
--
-- 前提:
--   - pg_cron が Supabase Dashboard で有効化済み（schema: pg_catalog）
--   - ensure_next_arena_events()   (Phase C-1)   GRANT済み
--   - generate_arena_matches(uuid) (Phase C-2b)   GRANT未設定 → 本 migration で補完
--   - process_arena_results()      (Phase D-2.1)  GRANT済み
--
-- 実装内容:
--   1. generate_arena_matches GRANT 補完 (service_role / postgres)
--   2. run_pending_arena_match_generation() ラッパー関数
--      エントリ締切を通過した scheduled イベントを自動検出し
--      generate_arena_matches を呼び出す
--   3. pg_cron ジョブ 3件 (idempotent)
--      - arena-ensure-events    : 6時間毎 (UTC 0:00/6:00/12:00/18:00)
--      - arena-generate-matches : 10分毎
--      - arena-process-results  : 10分毎
--
-- 方針:
--   - 2G / Mac mini / OpenClaw cron に一切依存しない
--   - Supabase DB 内で完結して Arena を自律継続開催する
-- =============================================================================


-- ================================================================
-- 1. generate_arena_matches(uuid) — GRANT 補完
--    SECURITY DEFINER だが REVOKE PUBLIC 済みのため明示 GRANT 要
-- ================================================================
GRANT EXECUTE ON FUNCTION generate_arena_matches(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION generate_arena_matches(uuid) TO postgres;


-- ================================================================
-- 2. run_pending_arena_match_generation()
--
--    役割:
--      - status = 'scheduled' かつ エントリ締切通過済み かつ
--        matches_generated_at IS NULL のイベントを自動検出
--      - 各イベントに対して generate_arena_matches(event_id) を呼び出す
--      - 個別エラーは result に格納し、他イベントの処理を継続する
--
--    冪等性:
--      - generate_arena_matches 側に already_handled ガードあり
--      - matches_generated_at が設定された行は WHERE 条件で除外される
--
--    返り値: { ok: true, processed: N, results: [...] }
-- ================================================================
CREATE OR REPLACE FUNCTION run_pending_arena_match_generation()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event        RECORD;
  v_result       jsonb;
  v_results_out  jsonb := '[]'::jsonb;
  v_processed    int   := 0;
BEGIN
  -- エントリ締切を通過したが matches 未生成のイベントを昇順で取得
  FOR v_event IN
    SELECT
      e.id                                                            AS event_id,
      e.scheduled_at,
      d.entry_deadline_hours,
      e.scheduled_at - (d.entry_deadline_hours * INTERVAL '1 hour') AS entry_deadline
    FROM  arena_events e
    JOIN  arena_definitions d ON d.id = e.arena_id
    WHERE e.status              = 'scheduled'
      AND e.matches_generated_at IS NULL
      AND (e.scheduled_at - (d.entry_deadline_hours * INTERVAL '1 hour')) < now()
    ORDER BY e.scheduled_at ASC
  LOOP
    BEGIN
      v_result := generate_arena_matches(v_event.event_id);

      v_results_out := v_results_out || jsonb_build_array(
        jsonb_build_object(
          'event_id',       v_event.event_id,
          'scheduled_at',   v_event.scheduled_at,
          'entry_deadline', v_event.entry_deadline,
          'result',         v_result
        )
      );
      v_processed := v_processed + 1;

    EXCEPTION WHEN OTHERS THEN
      -- 個別イベントのエラーを記録して次へ進む
      v_results_out := v_results_out || jsonb_build_array(
        jsonb_build_object(
          'event_id',       v_event.event_id,
          'scheduled_at',   v_event.scheduled_at,
          'entry_deadline', v_event.entry_deadline,
          'error',          SQLERRM
        )
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',        true,
    'processed', v_processed,
    'results',   v_results_out
  );
END;
$$;

-- GRANT / REVOKE
REVOKE EXECUTE ON FUNCTION run_pending_arena_match_generation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION run_pending_arena_match_generation() FROM anon;
REVOKE EXECUTE ON FUNCTION run_pending_arena_match_generation() FROM authenticated;
GRANT  EXECUTE ON FUNCTION run_pending_arena_match_generation() TO service_role;
GRANT  EXECUTE ON FUNCTION run_pending_arena_match_generation() TO postgres;


-- ================================================================
-- 3. pg_cron ジョブ登録 (idempotent)
--    既存同名ジョブがあれば先に削除してから再登録
-- ================================================================

-- 既存ジョブ削除（存在しない場合はゼロ行 → エラーなし）
SELECT cron.unschedule(jobid)
FROM   cron.job
WHERE  jobname IN (
  'arena-ensure-events',
  'arena-generate-matches',
  'arena-process-results'
);

-- ----------------------------------------------------------------
-- Job 1: ensure_next_arena_events — 6時間毎
--   UTC 0:00 / 6:00 / 12:00 / 18:00
--   役割: 直近の scheduled イベントが未作成なら自動 INSERT
-- ----------------------------------------------------------------
SELECT cron.schedule(
  'arena-ensure-events',
  '0 */6 * * *',
  $$SELECT ensure_next_arena_events()$$
);

-- ----------------------------------------------------------------
-- Job 2: run_pending_arena_match_generation — 10分毎
--   役割: エントリ締切通過イベントを検出し matches を生成
-- ----------------------------------------------------------------
SELECT cron.schedule(
  'arena-generate-matches',
  '*/10 * * * *',
  $$SELECT run_pending_arena_match_generation()$$
);

-- ----------------------------------------------------------------
-- Job 3: process_arena_results — 10分毎
--   役割: 完了済み arena_matches の結果を集計・ポイント反映
-- ----------------------------------------------------------------
SELECT cron.schedule(
  'arena-process-results',
  '*/10 * * * *',
  $$SELECT process_arena_results()$$
);
