-- =============================================================================
-- OEJ KPI Phase 3-A: 閲覧・記事・流入元・日次 集計Admin RPC
-- Migration: 20260811000003_kpi_oej_phase3a_rpcs.sql
-- =============================================================================

-- =============================================================================
-- RPC 1: admin_get_kpi_oej_summary
-- 期間全体のOEJ KPI集計
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_kpi_oej_summary(
  p_from             TIMESTAMPTZ,
  p_to               TIMESTAMPTZ,
  p_timezone         TEXT    DEFAULT 'UTC',
  p_include_internal BOOLEAN DEFAULT false
)
RETURNS TABLE (
  list_views                 BIGINT,
  article_opens              BIGINT,
  unique_readers             BIGINT,
  sessions                   BIGINT,
  impressions                BIGINT,
  engagement_events          BIGINT,
  completed_reads            BIGINT,
  completion_rate            NUMERIC,
  average_active_seconds     NUMERIC,
  median_active_seconds      NUMERIC,
  average_max_scroll_percent NUMERIC,
  game_cta_clicks            BIGINT,
  game_cta_rate              NUMERIC,
  reference_clicks           BIGINT,
  load_failures              BIGINT,
  fallback_opens             BIGINT,
  fallback_rate              NUMERIC,
  is_reference_period        BOOLEAN,
  effective_from             TIMESTAMPTZ,
  effective_to               TIMESTAMPTZ
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
    lv AS (
      SELECT COUNT(*) AS cnt
      FROM base_oej
      WHERE event_name = 'journal_list_viewed'
    ),
    ao AS (
      SELECT
        COUNT(*) AS cnt,
        COUNT(DISTINCT anonymous_id) AS uniq,
        COUNT(*) FILTER (WHERE properties->>'fallback' = 'true') AS fb
      FROM base_oej
      WHERE event_name = 'journal_article_opened'
    ),
    sa AS (
      SELECT COUNT(DISTINCT session_id) AS cnt
      FROM base_oej
    ),
    im AS (
      SELECT COUNT(*) AS cnt
      FROM base_oej
      WHERE event_name = 'journal_article_impression'
    ),
    ea AS (
      SELECT
        COUNT(*) AS cnt,
        COUNT(*) FILTER (WHERE (properties->>'completed')::BOOLEAN) AS comp,
        AVG((properties->>'active_seconds')::NUMERIC) AS avg_a,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (properties->>'active_seconds')::NUMERIC)::NUMERIC AS med_a,
        AVG((properties->>'max_scroll_percent')::NUMERIC) AS avg_s
      FROM base_oej
      WHERE event_name = 'journal_article_engagement'
    ),
    ca AS (
      SELECT COUNT(*) AS cnt
      FROM base_oej
      WHERE event_name = 'journal_game_cta_clicked'
    ),
    ra AS (
      SELECT COUNT(*) AS cnt
      FROM base_oej
      WHERE event_name = 'journal_reference_clicked'
    ),
    fa AS (
      SELECT COUNT(*) AS cnt
      FROM base_oej
      WHERE event_name = 'journal_load_failed'
    )
  SELECT
    lv.cnt::BIGINT,
    ao.cnt::BIGINT,
    ao.uniq::BIGINT,
    sa.cnt::BIGINT,
    im.cnt::BIGINT,
    ea.cnt::BIGINT,
    ea.comp::BIGINT,
    CASE WHEN ea.cnt > 0 THEN ROUND(ea.comp::NUMERIC / ea.cnt * 100, 2) ELSE NULL END,
    ea.avg_a,
    ea.med_a,
    ea.avg_s,
    ca.cnt::BIGINT,
    CASE WHEN ao.cnt > 0 THEN ROUND(ca.cnt::NUMERIC / ao.cnt * 100, 2) ELSE NULL END,
    ra.cnt::BIGINT,
    fa.cnt::BIGINT,
    ao.fb::BIGINT,
    CASE WHEN ao.cnt > 0 THEN ROUND(ao.fb::NUMERIC / ao.cnt * 100, 2) ELSE NULL END,
    v_is_reference,
    v_effective_from,
    v_effective_to
  FROM lv, ao, sa, im, ea, ca, ra, fa;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_kpi_oej_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_kpi_oej_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_oej_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO authenticated, service_role, postgres;

-- =============================================================================
-- RPC 2: admin_get_kpi_oej_article_summary
-- 記事別OEJ KPI集計
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_kpi_oej_article_summary(
  p_from             TIMESTAMPTZ,
  p_to               TIMESTAMPTZ,
  p_timezone         TEXT    DEFAULT 'UTC',
  p_include_internal BOOLEAN DEFAULT false
)
RETURNS TABLE (
  article_slug               TEXT,
  article_opens              BIGINT,
  unique_readers             BIGINT,
  impressions                BIGINT,
  list_to_open_rate          NUMERIC,
  engagement_events          BIGINT,
  completed_reads            BIGINT,
  completion_rate            NUMERIC,
  average_active_seconds     NUMERIC,
  median_active_seconds      NUMERIC,
  average_max_scroll_percent NUMERIC,
  reference_clicks           BIGINT,
  game_cta_clicks            BIGINT,
  game_cta_rate              NUMERIC,
  fallback_opens             BIGINT,
  load_failures              BIGINT
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
    all_slugs AS (
      SELECT DISTINCT properties->>'article_slug' AS article_slug
      FROM base_oej
      WHERE event_name IN (
        'journal_article_impression','journal_article_opened',
        'journal_article_engagement','journal_reference_clicked',
        'journal_game_cta_clicked','journal_load_failed'
      )
        AND (properties->>'article_slug') IS NOT NULL
        AND (properties->>'article_slug') <> ''
    ),
    imp_agg AS (
      SELECT properties->>'article_slug' AS slug, COUNT(*) AS cnt
      FROM base_oej
      WHERE event_name = 'journal_article_impression'
        AND (properties->>'article_slug') IS NOT NULL
      GROUP BY 1
    ),
    open_agg AS (
      SELECT
        properties->>'article_slug' AS slug,
        COUNT(*) AS cnt,
        COUNT(DISTINCT anonymous_id) AS uniq,
        COUNT(*) FILTER (WHERE properties->>'fallback' = 'true') AS fb
      FROM base_oej
      WHERE event_name = 'journal_article_opened'
        AND (properties->>'article_slug') IS NOT NULL
      GROUP BY 1
    ),
    eng_agg AS (
      SELECT
        properties->>'article_slug' AS slug,
        COUNT(*) AS cnt,
        COUNT(*) FILTER (WHERE (properties->>'completed')::BOOLEAN) AS comp,
        AVG((properties->>'active_seconds')::NUMERIC) AS avg_a,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (properties->>'active_seconds')::NUMERIC)::NUMERIC AS med_a,
        AVG((properties->>'max_scroll_percent')::NUMERIC) AS avg_s
      FROM base_oej
      WHERE event_name = 'journal_article_engagement'
        AND (properties->>'article_slug') IS NOT NULL
      GROUP BY 1
    ),
    ref_agg AS (
      SELECT properties->>'article_slug' AS slug, COUNT(*) AS cnt
      FROM base_oej
      WHERE event_name = 'journal_reference_clicked'
        AND (properties->>'article_slug') IS NOT NULL
      GROUP BY 1
    ),
    cta_agg AS (
      SELECT properties->>'article_slug' AS slug, COUNT(*) AS cnt
      FROM base_oej
      WHERE event_name = 'journal_game_cta_clicked'
        AND (properties->>'article_slug') IS NOT NULL
      GROUP BY 1
    ),
    fail_agg AS (
      SELECT properties->>'article_slug' AS slug, COUNT(*) AS cnt
      FROM base_oej
      WHERE event_name = 'journal_load_failed'
        AND (properties->>'article_slug') IS NOT NULL
      GROUP BY 1
    )
  SELECT
    s.article_slug,
    COALESCE(oa.cnt, 0)::BIGINT,
    COALESCE(oa.uniq, 0)::BIGINT,
    COALESCE(ia.cnt, 0)::BIGINT,
    CASE WHEN COALESCE(ia.cnt, 0) > 0 THEN ROUND(COALESCE(oa.cnt, 0)::NUMERIC / ia.cnt * 100, 2) ELSE NULL END,
    COALESCE(ea.cnt, 0)::BIGINT,
    COALESCE(ea.comp, 0)::BIGINT,
    CASE WHEN COALESCE(ea.cnt, 0) > 0 THEN ROUND(COALESCE(ea.comp, 0)::NUMERIC / ea.cnt * 100, 2) ELSE NULL END,
    ea.avg_a,
    ea.med_a,
    ea.avg_s,
    COALESCE(ra.cnt, 0)::BIGINT,
    COALESCE(ca.cnt, 0)::BIGINT,
    CASE WHEN COALESCE(oa.cnt, 0) > 0 THEN ROUND(COALESCE(ca.cnt, 0)::NUMERIC / oa.cnt * 100, 2) ELSE NULL END,
    COALESCE(oa.fb, 0)::BIGINT,
    COALESCE(fa.cnt, 0)::BIGINT
  FROM all_slugs s
  LEFT JOIN imp_agg ia ON ia.slug = s.article_slug
  LEFT JOIN open_agg oa ON oa.slug = s.article_slug
  LEFT JOIN eng_agg ea ON ea.slug = s.article_slug
  LEFT JOIN ref_agg ra ON ra.slug = s.article_slug
  LEFT JOIN cta_agg ca ON ca.slug = s.article_slug
  LEFT JOIN fail_agg fa ON fa.slug = s.article_slug
  ORDER BY COALESCE(oa.cnt, 0) DESC, s.article_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_kpi_oej_article_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_kpi_oej_article_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_oej_article_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO authenticated, service_role, postgres;

-- =============================================================================
-- RPC 3: admin_get_kpi_oej_source_summary
-- 流入元別OEJ KPI集計
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
    cta_attributed AS (
      SELECT id, traffic_source FROM cta_art_attributed
      UNION ALL
      SELECT id, traffic_source FROM cta_list_attributed
    ),
    -- session source: earliest list/article event per session
    session_source AS (
      SELECT DISTINCT ON (combined.session_id)
        combined.session_id, combined.traffic_source
      FROM (
        SELECT session_id, occurred_at, id, traffic_source FROM open_events
        UNION ALL
        SELECT session_id, occurred_at, id, traffic_source FROM list_events
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
    list_by_src AS (
      SELECT traffic_source AS src, COUNT(*) AS cnt
      FROM list_events
      GROUP BY 1
    ),
    open_by_src AS (
      SELECT
        traffic_source AS src,
        COUNT(*) AS cnt,
        COUNT(DISTINCT anonymous_id) AS uniq
      FROM open_events
      GROUP BY 1
    ),
    sess_by_src AS (
      SELECT traffic_source AS src, COUNT(DISTINCT session_id) AS cnt
      FROM session_source
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

-- =============================================================================
-- RPC 4: admin_get_kpi_oej_daily
-- 日次OEJ KPI集計
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_kpi_oej_daily(
  p_from             TIMESTAMPTZ,
  p_to               TIMESTAMPTZ,
  p_timezone         TEXT    DEFAULT 'UTC',
  p_include_internal BOOLEAN DEFAULT false
)
RETURNS TABLE (
  day                     DATE,
  list_views              BIGINT,
  article_opens           BIGINT,
  unique_readers          BIGINT,
  sessions                BIGINT,
  engagement_events       BIGINT,
  completed_reads         BIGINT,
  completion_rate         NUMERIC,
  game_cta_clicks         BIGINT,
  reference_clicks        BIGINT,
  load_failures           BIGINT,
  x_article_opens         BIGINT,
  instagram_article_opens BIGINT
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
    daily_base AS (
      SELECT
        (ke.occurred_at AT TIME ZONE p_timezone)::DATE AS day,
        ke.event_name,
        ke.user_id,
        ke.anonymous_id,
        ke.session_id,
        ke.properties
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
    )
  SELECT
    d.day,
    COUNT(*) FILTER (WHERE d.event_name = 'journal_list_viewed')::BIGINT,
    COUNT(*) FILTER (WHERE d.event_name = 'journal_article_opened')::BIGINT,
    COUNT(DISTINCT CASE WHEN d.event_name = 'journal_article_opened' THEN d.anonymous_id END)::BIGINT,
    COUNT(DISTINCT d.session_id)::BIGINT,
    COUNT(*) FILTER (WHERE d.event_name = 'journal_article_engagement')::BIGINT,
    COUNT(*) FILTER (WHERE d.event_name = 'journal_article_engagement' AND (d.properties->>'completed')::BOOLEAN)::BIGINT,
    CASE WHEN COUNT(*) FILTER (WHERE d.event_name = 'journal_article_engagement') > 0
      THEN ROUND(
        COUNT(*) FILTER (WHERE d.event_name = 'journal_article_engagement' AND (d.properties->>'completed')::BOOLEAN)::NUMERIC
        / COUNT(*) FILTER (WHERE d.event_name = 'journal_article_engagement') * 100, 2)
      ELSE NULL END,
    COUNT(*) FILTER (WHERE d.event_name = 'journal_game_cta_clicked')::BIGINT,
    COUNT(*) FILTER (WHERE d.event_name = 'journal_reference_clicked')::BIGINT,
    COUNT(*) FILTER (WHERE d.event_name = 'journal_load_failed')::BIGINT,
    COUNT(*) FILTER (WHERE d.event_name = 'journal_article_opened' AND d.properties->>'traffic_source' = 'x')::BIGINT,
    COUNT(*) FILTER (WHERE d.event_name = 'journal_article_opened' AND d.properties->>'traffic_source' = 'instagram')::BIGINT
  FROM daily_base d
  GROUP BY d.day
  ORDER BY d.day;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_kpi_oej_daily(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_kpi_oej_daily(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_oej_daily(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO authenticated, service_role, postgres;
