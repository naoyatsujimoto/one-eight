-- =============================================================================
-- 20260809195851_kpi_rate_limit_fix.sql
-- KPI Phase 1: rate-limit実装の補正
--
-- 依存: 20260809195846 (security: kpi_rate_limit table, _kpi_check_rate_limit)
--
-- 変更内容:
-- 1. _kpi_check_rate_limit の p_window_secs 引数を削除し、60秒固定を明確化
--    (既存はbucket計算でdate_trunc('minute')を使っており、p_window_secsは実際に未使用)
-- 2. 毎event古いrate-limit行をDELETEする方式を廃止
--    → cleanup をcleanup_old_kpi_eventsに相当する別途cleanupに分離
-- 3. INSERT ON CONFLICTの軽量カウント方式に統一
-- 4. _kpi_cleanup_rate_limit: 定期cleanup関数を新設（service_roleのみ）
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 旧 _kpi_check_rate_limit(TEXT, INTEGER, INTEGER) をリプレース
-- p_window_secs引数を削除（60秒固定・date_trunc('minute')方式を明確化）
-- 旧シグネチャも互換のためオーバーロードとして維持（p_window_secsを無視）
-- ---------------------------------------------------------------------------

-- 新シグネチャ（推奨）: p_window_secsなし
CREATE OR REPLACE FUNCTION public._kpi_check_rate_limit(
  p_bucket_key  TEXT,
  p_limit       INTEGER
)
RETURNS BOOLEAN  -- TRUE = allowed, FALSE = rate limited
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window  TIMESTAMPTZ;
  v_count   INTEGER;
BEGIN
  -- 1分ウィンドウの開始時刻（分単位切り捨て: 60秒固定）
  v_window := date_trunc('minute', now());

  -- INSERT ON CONFLICT: 軽量カウント方式
  -- 古い行の掃除はここでは行わない（_kpi_cleanup_rate_limitに分離）
  INSERT INTO kpi_rate_limit (bucket_key, window_start, request_count)
  VALUES (p_bucket_key, v_window, 1)
  ON CONFLICT (bucket_key, window_start) DO UPDATE
    SET request_count = kpi_rate_limit.request_count + 1
  RETURNING request_count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public._kpi_check_rate_limit(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._kpi_check_rate_limit(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public._kpi_check_rate_limit(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._kpi_check_rate_limit(TEXT, INTEGER)
  TO service_role, postgres;

-- 旧シグネチャ（互換維持: p_window_secsを受け取るが無視する）
CREATE OR REPLACE FUNCTION public._kpi_check_rate_limit(
  p_bucket_key  TEXT,
  p_limit       INTEGER,
  p_window_secs INTEGER DEFAULT 60
)
RETURNS BOOLEAN  -- TRUE = allowed, FALSE = rate limited
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- p_window_secsは無視（60秒固定であることを明確化）
  -- 実装は新シグネチャに委譲
  RETURN _kpi_check_rate_limit(p_bucket_key, p_limit);
END;
$$;

REVOKE ALL ON FUNCTION public._kpi_check_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._kpi_check_rate_limit(TEXT, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public._kpi_check_rate_limit(TEXT, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._kpi_check_rate_limit(TEXT, INTEGER, INTEGER)
  TO service_role, postgres;

-- ---------------------------------------------------------------------------
-- _kpi_cleanup_rate_limit: 古いrate-limit行の定期cleanup
--
-- cleanup_old_kpi_eventsと同様に、service_roleのみ実行可
-- pg_cronからcleanup_old_kpi_eventsと一緒に呼ぶこと
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._kpi_cleanup_rate_limit(
  p_older_than_hours INTEGER DEFAULT 2
)
RETURNS INTEGER  -- 削除件数
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  -- デフォルト: 2時間超の古い行を削除
  DELETE FROM kpi_rate_limit
    WHERE window_start < now() - (p_older_than_hours || ' hours')::INTERVAL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public._kpi_cleanup_rate_limit(INTEGER) IS
  'kpi_rate_limit テーブルの古い行を削除。service_roleのみ実行可。'
  'pg_cronからcleanup_old_kpi_eventsと一緒に定期実行すること。';

REVOKE ALL ON FUNCTION public._kpi_cleanup_rate_limit(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._kpi_cleanup_rate_limit(INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public._kpi_cleanup_rate_limit(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._kpi_cleanup_rate_limit(INTEGER)
  TO service_role, postgres;

-- ---------------------------------------------------------------------------
-- cleanup_old_kpi_events を更新: rate-limitのcleanupも一緒に行う
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cleanup_old_kpi_events()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_retention INTEGER;
  v_deleted   INTEGER;
  v_cutoff    TIMESTAMPTZ;
BEGIN
  SELECT raw_event_retention_days INTO v_retention
    FROM kpi_settings WHERE id = 1;

  v_cutoff := now() - (v_retention || ' days')::INTERVAL;

  DELETE FROM kpi_events
    WHERE occurred_at < v_cutoff;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- rate-limitの古い行もcleanup（2時間超）
  PERFORM _kpi_cleanup_rate_limit(2);

  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.cleanup_old_kpi_events IS
  'kpi_eventsの古いレコードを削除。raw_event_retention_days設定に基づく。'
  'kpi_rate_limitの古い行も一緒にcleanupする。pg_cronで定期実行推奨。';

REVOKE ALL ON FUNCTION public.cleanup_old_kpi_events() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_old_kpi_events() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_old_kpi_events() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_kpi_events()
  TO service_role, postgres;
