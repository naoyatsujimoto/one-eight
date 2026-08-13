-- =============================================================================
-- OEJ KPI Phase 3-A fix: admin_get_kpi_oej_source_summary ambiguous column fix
-- Migration: 20260811000004_kpi_oej_phase3a_source_summary_fix.sql
--
-- Fix: "column reference traffic_source is ambiguous" (ERROR 42702)
-- Cause: unqualified traffic_source references in CTEs conflicted with
--        RETURNS TABLE output column of the same name.
-- Fix strategy: fully qualify all traffic_source references with table aliases.
--   - cta_attributed  : added aliases caa / cla on UNION branches
--   - list_by_src     : added alias le on list_events
--   - open_by_src     : added alias oe on open_events
--   - sess_by_src     : added alias ss on session_source
-- RETURNS TABLE signature, argument list, source 7-classification, and all
-- other logic are unchanged.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_kpi_oej_source_summary(
  p_from             TIMESTAMPTZ,
  p_to               TIMESTAMPTZ,
  p_timezone         TEXT    DEFAULT 'UTC',
  p_include_internal BOOLEAN DEFAULT false
)
RETURNS TABLE (
  traffic_source         TEXT,
  list_views             BIGINT,
  article_opens          BIGINT,
  unique_readers         BIGINT,
  sessions               BIGINT,
  engagement_events      BIGINT,
  completed_reads        BIGINT,
  completion_rate        NUMERIC,
  average_active_seconds NUMERIC,
  game_cta_clicks        BIGINT,
  game_cta_rate          NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_official_start TIMESTAMPTZ;
  v_is_reference   BOOLEAN;
  v_effective_from TIMESTAMPTZ;
  v_effective_to   TIMESTAMPTZ;
BEGIN
  -- Admin認証チェック
  PERFORM public._kpi_require_admin();

  -- NULL チェック
  IF p_from IS NULL THEN
    RAISE EXCEPTION 'p_from must not be NULL';
  END IF;
  IF p_to IS NULL THEN
    RAISE EXCEPTION 'p_to must not be NULL';
  END IF;

  -- 期間順序チェック
  IF p_from >= p_to THEN
    RAISE EXCEPTION 'p_from must be less than p_to';
  END IF;

  -- 366日上限チェック
  IF p_to - p_from > INTERVAL '366 days' THEN
    RAISE EXCEPTION 'Date range must not exceed 366 days';
  END IF;

  -- timezone検証
  BEGIN
    PERFORM now() AT TIME ZONE p_timezone;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid timezone: %', p_timezone;
  END;

  -- effective_from / effective_to の計算
  SELECT ks.official_kpi_start_at INTO v_official_start
  FROM public.kpi_settings ks WHERE ks.id = 1;

  v_is_reference   := (v_official_start IS NULL);
  v_effective_from := CASE WHEN v_official_start IS NOT NULL
                      THEN GREATEST(p_from, v_official_start)
                      ELSE p_from END;
  v_effective_to   := LEAST(p_to, now());

  RETURN QUERY
  WITH
    internal_users AS (
      SELECT pr.id AS user_id
      FROM public.profiles pr
      WHERE COALESCE(pr.is_admin, FALSE)
         OR COALESCE(pr.is_internal_test_account, FALSE)
         OR pr.internal_plan_override IS NOT NULL
    ),
    base_oej AS (
      SELECT ke.id, ke.event_name, ke.occurred_at, ke.user_id,
             ke.anonymous_id, ke.session_id, ke.properties
      FROM public.kpi_events ke
      WHERE ke.environment = 'production'
        AND ke.event_name IN (
          'journal_list_viewed','journal_article_impression','journal_article_opened',
          'journal_article_engagement','journal_reference_clicked','journal_language_changed',
          'journal_game_cta_clicked','journal_load_failed'
        )
        AND ke.occurred_at >= v_effective_from
        AND ke.occurred_at < v_effective_to
        AND (
          p_include_internal
          OR ke.user_id IS NULL
          OR ke.user_id NOT IN (SELECT iu.user_id FROM internal_users iu)
        )
    ),
    open_events AS (
      SELECT
        id,
        session_id,
        occurred_at,
        anonymous_id,
        properties->>'traffic_source' AS traffic_source,
        properties->>'article_slug'   AS article_slug
      FROM base_oej
      WHERE event_name = 'journal_article_opened'
        AND (properties->>'traffic_source') IS NOT NULL
    ),
    list_events AS (
      SELECT
        id,
        session_id,
        occurred_at,
        properties->>'traffic_source' AS traffic_source
      FROM base_oej
      WHERE event_name = 'journal_list_viewed'
        AND (properties->>'traffic_source') IS NOT NULL
    ),
    eng_events AS (
      SELECT
        id,
        session_id,
        occurred_at,
        properties->>'article_slug'          AS article_slug,
        (properties->>'completed')::BOOLEAN  AS is_completed,
        (properties->>'active_seconds')::NUMERIC AS active_seconds
      FROM base_oej
      WHERE event_name = 'journal_article_engagement'
    ),
    cta_events AS (
      SELECT
        id,
        session_id,
        occurred_at,
        properties->>'context'      AS ctx,
        properties->>'article_slug' AS article_slug
      FROM base_oej
      WHERE event_name = 'journal_game_cta_clicked'
    ),
    -- engagement attribution: nearest preceding article_opened with same session+slug
    eng_attributed AS (
      SELECT DISTINCT ON (e.id)
        e.id, e.is_completed, e.active_seconds,
        o.traffic_source
      FROM eng_events e
      JOIN open_events o
        ON o.session_id   = e.session_id
        AND o.article_slug = e.article_slug
        AND o.occurred_at <= e.occurred_at
      ORDER BY e.id, o.occurred_at DESC, o.id DESC
    ),
    -- article_footer CTA attribution
    cta_art_attributed AS (
      SELECT DISTINCT ON (e.id)
        e.id, o.traffic_source
      FROM cta_events e
      JOIN open_events o
        ON o.session_id   = e.session_id
        AND o.article_slug = e.article_slug
        AND o.occurred_at <= e.occurred_at
      WHERE e.ctx = 'article_footer'
        AND e.article_slug IS NOT NULL
      ORDER BY e.id, o.occurred_at DESC, o.id DESC
    ),
    -- list_footer CTA attribution
    cta_list_attributed AS (
      SELECT DISTINCT ON (e.id)
        e.id, l.traffic_source
      FROM cta_events e
      JOIN list_events l
        ON l.session_id   = e.session_id
        AND l.occurred_at <= e.occurred_at
      WHERE e.ctx = 'list_footer'
      ORDER BY e.id, l.occurred_at DESC, l.id DESC
    ),
    -- combined CTA attributed
    -- FIX: added aliases caa / cla to fully qualify traffic_source references
    cta_attributed AS (
      SELECT caa.id, caa.traffic_source FROM cta_art_attributed caa
      UNION ALL
      SELECT cla.id, cla.traffic_source FROM cta_list_attributed cla
    ),
    -- session source: earliest list/article event per session
    -- FIX: added aliases oe2 / le2 inside UNION to fully qualify traffic_source
    session_source AS (
      SELECT DISTINCT ON (combined.session_id)
        combined.session_id, combined.traffic_source
      FROM (
        SELECT oe2.session_id, oe2.occurred_at, oe2.id, oe2.traffic_source FROM open_events oe2
        UNION ALL
        SELECT le2.session_id, le2.occurred_at, le2.id, le2.traffic_source FROM list_events le2
      ) combined
      ORDER BY combined.session_id, combined.occurred_at ASC, combined.id ASC
    ),
    -- fixed sources: 7種類
    sources(src) AS (
      VALUES
        ('x'::TEXT),
        ('instagram'),
        ('google'),
        ('bing'),
        ('one_eight_internal'),
        ('direct'),
        ('other_external')
    ),
    -- per-source aggregates
    -- FIX: added alias le to fully qualify traffic_source reference
    list_by_src AS (
      SELECT le.traffic_source AS src, COUNT(*) AS cnt
      FROM list_events le
      GROUP BY 1
    ),
    -- FIX: added alias oe to fully qualify traffic_source / anonymous_id references
    open_by_src AS (
      SELECT
        oe.traffic_source AS src,
        COUNT(*) AS cnt,
        COUNT(DISTINCT oe.anonymous_id) AS uniq
      FROM open_events oe
      GROUP BY 1
    ),
    -- FIX: added alias ss to fully qualify traffic_source / session_id references
    sess_by_src AS (
      SELECT ss.traffic_source AS src, COUNT(DISTINCT ss.session_id) AS cnt
      FROM session_source ss
      GROUP BY 1
    ),
    eng_by_src AS (
      SELECT
        ea.traffic_source AS src,
        COUNT(*) AS cnt,
        COUNT(*) FILTER (WHERE ea.is_completed) AS comp,
        AVG(ea.active_seconds) AS avg_a
      FROM eng_attributed ea
      GROUP BY 1
    ),
    cta_by_src AS (
      SELECT ca.traffic_source AS src, COUNT(*) AS cnt
      FROM cta_attributed ca
      GROUP BY 1
    )
  SELECT
    s.src AS traffic_source,
    COALESCE(lb.cnt, 0)::BIGINT,
    COALESCE(ob.cnt, 0)::BIGINT,
    COALESCE(ob.uniq, 0)::BIGINT,
    COALESCE(sb.cnt, 0)::BIGINT,
    COALESCE(eb.cnt, 0)::BIGINT,
    COALESCE(eb.comp, 0)::BIGINT,
    CASE WHEN COALESCE(eb.cnt, 0) > 0 THEN ROUND(COALESCE(eb.comp, 0)::NUMERIC / eb.cnt * 100, 2) ELSE NULL END,
    eb.avg_a,
    COALESCE(cb.cnt, 0)::BIGINT,
    CASE WHEN COALESCE(ob.cnt, 0) > 0 THEN ROUND(COALESCE(cb.cnt, 0)::NUMERIC / ob.cnt * 100, 2) ELSE NULL END
  FROM sources s
  LEFT JOIN list_by_src lb ON lb.src = s.src
  LEFT JOIN open_by_src ob ON ob.src = s.src
  LEFT JOIN sess_by_src sb ON sb.src = s.src
  LEFT JOIN eng_by_src eb ON eb.src = s.src
  LEFT JOIN cta_by_src cb ON cb.src = s.src
  ORDER BY s.src;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_kpi_oej_source_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_kpi_oej_source_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_oej_source_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO authenticated, service_role, postgres;
