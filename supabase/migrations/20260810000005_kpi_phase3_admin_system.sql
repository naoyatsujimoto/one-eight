-- =============================================================================
-- 20260810000005_kpi_phase3_admin_system.sql
-- KPI Phase 3-D: admin_get_kpi_system_health_summary
--
-- System Health集計。kpi_events / kpi_sessions 正本。
-- 内部除外: profiles.is_admin=true OR is_internal_test_account=true
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_kpi_system_health_summary(
  p_from              TIMESTAMPTZ,
  p_to                TIMESTAMPTZ,
  p_timezone          TEXT    DEFAULT 'UTC',
  p_include_internal  BOOLEAN DEFAULT false
)
RETURNS TABLE (
  sessions                        BIGINT,
  frontend_errors                 BIGINT,
  frontend_errors_per_100_sessions NUMERIC,
  rpc_calls                       BIGINT,
  rpc_errors                      BIGINT,
  rpc_error_rate                  NUMERIC,
  realtime_reconnections          BIGINT,
  rpc_stats                       JSONB,
  performance_stats               JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sessions              BIGINT;
  v_fe_errors             BIGINT;
  v_fe_per_100            NUMERIC;
  v_rpc_calls             BIGINT;
  v_rpc_errors            BIGINT;
  v_rpc_error_rate        NUMERIC;
  v_rt_reconnects         BIGINT;
  v_rpc_stats             JSONB;
  v_perf_stats            JSONB;
BEGIN
  PERFORM public._kpi_require_admin();

  IF p_from >= p_to THEN
    RAISE EXCEPTION 'p_from must be before p_to';
  END IF;
  IF p_to - p_from > INTERVAL '366 days' THEN
    RAISE EXCEPTION 'period too long';
  END IF;
  BEGIN
    PERFORM now() AT TIME ZONE p_timezone;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'invalid timezone: %', p_timezone;
  END;

  -- ── セッション数 ──────────────────────────────────────────────────────────
  SELECT COUNT(*)
  INTO v_sessions
  FROM public.kpi_sessions ks
  WHERE ks.started_at >= p_from AND ks.started_at < p_to
    AND ks.environment = 'production'
    AND (p_include_internal OR ks.user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = ks.user_id
        AND (COALESCE(p2.is_admin, FALSE) OR COALESCE(p2.is_internal_test_account, FALSE))
    ));

  -- ── frontend_errors ────────────────────────────────────────────────────────
  SELECT COUNT(*)
  INTO v_fe_errors
  FROM public.kpi_events ke
  WHERE ke.occurred_at >= p_from AND ke.occurred_at < p_to
    AND ke.event_name = 'frontend_error'
    AND ke.environment = 'production'
    AND (p_include_internal OR ke.user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = ke.user_id
        AND (COALESCE(p2.is_admin, FALSE) OR COALESCE(p2.is_internal_test_account, FALSE))
    ));

  v_fe_per_100 := CASE WHEN COALESCE(v_sessions, 0) > 0
    THEN ROUND(v_fe_errors::NUMERIC / v_sessions * 100, 2)
    ELSE NULL
  END;

  -- ── rpc_call_completed ─────────────────────────────────────────────────────
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE (properties->>'outcome') = 'error')
  INTO v_rpc_calls, v_rpc_errors
  FROM public.kpi_events ke
  WHERE ke.occurred_at >= p_from AND ke.occurred_at < p_to
    AND ke.event_name = 'rpc_call_completed'
    AND ke.environment = 'production'
    AND (p_include_internal OR ke.user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = ke.user_id
        AND (COALESCE(p2.is_admin, FALSE) OR COALESCE(p2.is_internal_test_account, FALSE))
    ));

  v_rpc_error_rate := CASE WHEN COALESCE(v_rpc_calls, 0) > 0
    THEN ROUND(v_rpc_errors::NUMERIC / v_rpc_calls * 100, 2)
    ELSE NULL
  END;

  -- ── realtime_reconnected ───────────────────────────────────────────────────
  SELECT COUNT(*)
  INTO v_rt_reconnects
  FROM public.kpi_events ke
  WHERE ke.occurred_at >= p_from AND ke.occurred_at < p_to
    AND ke.event_name = 'realtime_reconnected'
    AND ke.environment = 'production'
    AND (p_include_internal OR ke.user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = ke.user_id
        AND (COALESCE(p2.is_admin, FALSE) OR COALESCE(p2.is_internal_test_account, FALSE))
    ));

  -- ── RPC名別統計 (JSONB) ────────────────────────────────────────────────────
  SELECT jsonb_object_agg(
    rpc_name,
    jsonb_build_object(
      'calls', calls,
      'errors', errors,
      'error_rate', CASE WHEN calls > 0 THEN ROUND(errors::NUMERIC / calls * 100, 2) ELSE NULL END,
      'p50_ms', p50_ms,
      'p95_ms', p95_ms
    )
  )
  INTO v_rpc_stats
  FROM (
    SELECT
      (properties->>'rpc_name') AS rpc_name,
      COUNT(*) AS calls,
      COUNT(*) FILTER (WHERE (properties->>'outcome') = 'error') AS errors,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY (properties->>'elapsed_ms')::NUMERIC) AS p50_ms,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY (properties->>'elapsed_ms')::NUMERIC) AS p95_ms
    FROM public.kpi_events ke
    WHERE ke.occurred_at >= p_from AND ke.occurred_at < p_to
      AND ke.event_name = 'rpc_call_completed'
      AND ke.environment = 'production'
      AND (properties->>'rpc_name') IS NOT NULL
      AND (p_include_internal OR ke.user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id = ke.user_id
          AND (COALESCE(p2.is_admin, FALSE) OR COALESCE(p2.is_internal_test_account, FALSE))
      ))
    GROUP BY (properties->>'rpc_name')
  ) rpc_agg;

  -- ── performance_measure 別統計 (JSONB) ────────────────────────────────────
  SELECT jsonb_object_agg(
    metric_name,
    jsonb_build_object(
      'count', cnt,
      'average', avg_ms,
      'p50', p50_ms,
      'p95', p95_ms
    )
  )
  INTO v_perf_stats
  FROM (
    SELECT
      (properties->>'metric_name') AS metric_name,
      COUNT(*) AS cnt,
      ROUND(AVG((properties->>'value_ms')::NUMERIC), 2) AS avg_ms,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY (properties->>'value_ms')::NUMERIC) AS p50_ms,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY (properties->>'value_ms')::NUMERIC) AS p95_ms
    FROM public.kpi_events ke
    WHERE ke.occurred_at >= p_from AND ke.occurred_at < p_to
      AND ke.event_name = 'performance_measure'
      AND ke.environment = 'production'
      AND (properties->>'metric_name') IS NOT NULL
      AND (p_include_internal OR ke.user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id = ke.user_id
          AND (COALESCE(p2.is_admin, FALSE) OR COALESCE(p2.is_internal_test_account, FALSE))
      ))
    GROUP BY (properties->>'metric_name')
  ) perf_agg;

  RETURN QUERY SELECT
    v_sessions,
    v_fe_errors,
    v_fe_per_100,
    v_rpc_calls,
    v_rpc_errors,
    v_rpc_error_rate,
    v_rt_reconnects,
    COALESCE(v_rpc_stats, '{}'::JSONB),
    COALESCE(v_perf_stats, '{}'::JSONB);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_kpi_system_health_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_system_health_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_system_health_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO service_role;

COMMENT ON FUNCTION public.admin_get_kpi_system_health_summary IS
  'KPI Phase 3-D: System Health集計（セッション・フロントエンドエラー・RPC・Realtime）。Admin専用。';
