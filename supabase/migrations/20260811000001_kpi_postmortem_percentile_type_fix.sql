-- =============================================================================
-- 20260811000001_kpi_postmortem_percentile_type_fix.sql
-- KPI Postmortem RPC 戻り型不一致修正
--
-- 問題:
--   admin_get_kpi_postmortem_summary の RETURNS TABLE で
--   median_elapsed_seconds NUMERIC / p95_elapsed_seconds NUMERIC と宣言しているが、
--   percentile_cont() は double precision を返すため型不一致エラーが発生していた。
--
-- 修正:
--   percentile_cont(0.5) および percentile_cont(0.95) の結果を ::NUMERIC にキャスト。
--   AVG() は NUMERIC を返すため変更不要。
--   それ以外の定義はすべて維持。
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_kpi_postmortem_summary(
  p_from              TIMESTAMPTZ,
  p_to                TIMESTAMPTZ,
  p_timezone          TEXT    DEFAULT 'UTC',
  p_include_internal  BOOLEAN DEFAULT false
)
RETURNS TABLE (
  started                 BIGINT,
  completed               BIGINT,
  failed                  BIGINT,
  refreshed               BIGINT,
  candidates_opened       BIGINT,
  completion_rate         NUMERIC,
  failure_rate            NUMERIC,
  average_elapsed_seconds NUMERIC,
  median_elapsed_seconds  NUMERIC,
  p95_elapsed_seconds     NUMERIC,
  online_mode_count       BIGINT,
  official_mode_count     BIGINT,
  arena_mode_count        BIGINT,
  cpu_mode_count          BIGINT,
  unknown_mode_count      BIGINT,
  rpc_error_count         BIGINT,
  worker_error_count      BIGINT,
  parse_error_count       BIGINT,
  unknown_error_count     BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public._kpi_require_admin();

  IF p_from IS NULL THEN
    RAISE EXCEPTION 'p_from must not be NULL'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_to IS NULL THEN
    RAISE EXCEPTION 'p_to must not be NULL'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_from >= p_to THEN
    RAISE EXCEPTION 'p_from must be before p_to';
  END IF;
  IF p_to - p_from > INTERVAL '366 days' THEN
    RAISE EXCEPTION 'period too long (max 366 days)';
  END IF;
  BEGIN
    PERFORM now() AT TIME ZONE p_timezone;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'invalid timezone: %', p_timezone;
  END;

  RETURN QUERY
  WITH base AS (
    SELECT ke.*
    FROM public.kpi_events ke
    WHERE ke.occurred_at >= p_from AND ke.occurred_at < p_to
      AND ke.event_name IN (
        'postmortem_started',
        'postmortem_completed',
        'postmortem_failed',
        'postmortem_refreshed',
        'postmortem_candidates_opened'
      )
      AND ke.environment = 'production'
      AND (p_include_internal OR ke.user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id = ke.user_id
          AND (
            COALESCE(p2.is_admin, FALSE)
            OR COALESCE(p2.is_internal_test_account, FALSE)
            OR p2.internal_plan_override IS NOT NULL
          )
      ))
  )
  SELECT
    COUNT(*) FILTER (WHERE event_name = 'postmortem_started') AS started,
    COUNT(*) FILTER (WHERE event_name = 'postmortem_completed') AS completed,
    COUNT(*) FILTER (WHERE event_name = 'postmortem_failed') AS failed,
    COUNT(*) FILTER (WHERE event_name = 'postmortem_refreshed') AS refreshed,
    COUNT(*) FILTER (WHERE event_name = 'postmortem_candidates_opened') AS candidates_opened,
    CASE WHEN COUNT(*) FILTER (WHERE event_name = 'postmortem_started') > 0
      THEN ROUND(
        COUNT(*) FILTER (WHERE event_name = 'postmortem_completed')::NUMERIC
        / COUNT(*) FILTER (WHERE event_name = 'postmortem_started') * 100, 2
      )
      ELSE NULL
    END AS completion_rate,
    CASE WHEN COUNT(*) FILTER (WHERE event_name = 'postmortem_started') > 0
      THEN ROUND(
        COUNT(*) FILTER (WHERE event_name = 'postmortem_failed')::NUMERIC
        / COUNT(*) FILTER (WHERE event_name = 'postmortem_started') * 100, 2
      )
      ELSE NULL
    END AS failure_rate,
    AVG((properties->>'elapsed_seconds')::NUMERIC)
      FILTER (WHERE event_name = 'postmortem_completed' AND (properties->>'elapsed_seconds') IS NOT NULL),
    (percentile_cont(0.5) WITHIN GROUP (ORDER BY (properties->>'elapsed_seconds')::NUMERIC)
      FILTER (WHERE event_name = 'postmortem_completed' AND (properties->>'elapsed_seconds') IS NOT NULL))::NUMERIC,
    (percentile_cont(0.95) WITHIN GROUP (ORDER BY (properties->>'elapsed_seconds')::NUMERIC)
      FILTER (WHERE event_name = 'postmortem_completed' AND (properties->>'elapsed_seconds') IS NOT NULL))::NUMERIC,
    COUNT(*) FILTER (WHERE event_name = 'postmortem_completed' AND (properties->>'match_mode') = 'online') AS online_mode_count,
    COUNT(*) FILTER (WHERE event_name = 'postmortem_completed' AND (properties->>'match_mode') = 'official') AS official_mode_count,
    COUNT(*) FILTER (WHERE event_name = 'postmortem_completed' AND (properties->>'match_mode') = 'arena') AS arena_mode_count,
    COUNT(*) FILTER (WHERE event_name = 'postmortem_completed' AND (properties->>'match_mode') = 'human_vs_cpu') AS cpu_mode_count,
    COUNT(*) FILTER (
      WHERE event_name = 'postmortem_completed'
        AND ((properties->>'match_mode') = 'unknown' OR (properties->>'match_mode') IS NULL)
    ) AS unknown_mode_count,
    COUNT(*) FILTER (WHERE event_name = 'postmortem_failed' AND (properties->>'stage') = 'rpc') AS rpc_error_count,
    COUNT(*) FILTER (WHERE event_name = 'postmortem_failed' AND (properties->>'stage') = 'worker') AS worker_error_count,
    COUNT(*) FILTER (WHERE event_name = 'postmortem_failed' AND (properties->>'stage') = 'parse') AS parse_error_count,
    COUNT(*) FILTER (WHERE event_name = 'postmortem_failed' AND ((properties->>'stage') = 'unknown' OR (properties->>'stage') IS NULL)) AS unknown_error_count
  FROM base;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_kpi_postmortem_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_postmortem_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_postmortem_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO service_role, postgres;

COMMENT ON FUNCTION public.admin_get_kpi_postmortem_summary IS
  'KPI Phase 3 補正: Postmortem KPI集計。percentile_cont ::NUMERICキャスト修正。Admin専用。';
