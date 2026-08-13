-- =============================================================================
-- 20260811000005_kpi_oej_phase3b_attribution.sql
-- OEJ KPI Phase 3-B: OEJからの認証・新規登録 Attribution集計 Admin RPC
--
-- 追加RPC:
--   admin_get_kpi_oej_attribution
--
-- Attribution定義:
--   - 7日間・直近接触（anonymous_id一致）
--   - touch: journal_article_opened / journal_list_viewed
--   - conversion: auth_started / auth_succeeded(新規登録)
--   - 新規登録はauth.usersで正規確認
--
-- 依存: 20260811000004 (kpi_oej_phase3a_source_summary_fix)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_kpi_oej_attribution(
  p_from             TIMESTAMPTZ,
  p_to               TIMESTAMPTZ,
  p_timezone         TEXT    DEFAULT 'UTC',
  p_include_internal BOOLEAN DEFAULT false
)
RETURNS TABLE (
  dimension_type             TEXT,
  dimension_value            TEXT,
  auth_started               BIGINT,
  registrations              BIGINT,
  unique_auth_users          BIGINT,
  unique_registered_users    BIGINT,
  auth_to_registration_rate  NUMERIC,
  attributed_auth_started    BIGINT,
  attributed_registrations   BIGINT,
  unattributed_auth_started  BIGINT,
  unattributed_registrations BIGINT,
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

  -- effective_from / effective_to
  SELECT ks.official_kpi_start_at INTO v_official_start
  FROM public.kpi_settings ks WHERE ks.id = 1;

  v_is_reference   := (v_official_start IS NULL);
  v_effective_from := CASE WHEN v_official_start IS NOT NULL
                      THEN GREATEST(p_from, v_official_start)
                      ELSE p_from END;
  v_effective_to   := LEAST(p_to, now());

  RETURN QUERY
  WITH
    -- -----------------------------------------------------------------------
    -- 1. internal users
    -- -----------------------------------------------------------------------
    internal_users AS (
      SELECT pr.id AS user_id
      FROM public.profiles pr
      WHERE COALESCE(pr.is_admin, FALSE)
         OR COALESCE(pr.is_internal_test_account, FALSE)
         OR pr.internal_plan_override IS NOT NULL
    ),

    -- -----------------------------------------------------------------------
    -- 2. auth_started conversion events
    -- -----------------------------------------------------------------------
    conv_as AS (
      SELECT
        ke.id,
        ke.anonymous_id,
        ke.user_id,
        ke.occurred_at
      FROM public.kpi_events ke
      WHERE ke.environment = 'production'
        AND ke.event_name = 'auth_started'
        AND ke.occurred_at >= v_effective_from
        AND ke.occurred_at < v_effective_to
        AND (ke.route IS NULL OR ke.route NOT LIKE '/ai-check-login%')
        AND (
          p_include_internal
          OR ke.user_id IS NULL
          OR ke.user_id NOT IN (SELECT iu.user_id FROM internal_users iu)
        )
    ),

    -- -----------------------------------------------------------------------
    -- 3. auth_succeeded → new registration candidates (event-level)
    -- -----------------------------------------------------------------------
    conv_as_raw AS (
      SELECT
        ke.id,
        ke.anonymous_id,
        ke.user_id,
        ke.occurred_at
      FROM public.kpi_events ke
      WHERE ke.environment = 'production'
        AND ke.event_name = 'auth_succeeded'
        AND ke.properties @> '{"is_new_user": true}'
        AND ke.user_id IS NOT NULL
        AND ke.occurred_at >= v_effective_from
        AND ke.occurred_at < v_effective_to
        AND (ke.route IS NULL OR ke.route NOT LIKE '/ai-check-login%')
        AND (
          p_include_internal
          OR ke.user_id NOT IN (SELECT iu.user_id FROM internal_users iu)
        )
    ),

    -- -----------------------------------------------------------------------
    -- 4. validated registrations: auth.users正規確認 + 重複排除 (1行/user_id)
    -- -----------------------------------------------------------------------
    conv_reg AS (
      SELECT DISTINCT ON (r.user_id)
        r.user_id,
        r.anonymous_id,
        r.occurred_at,
        r.id
      FROM conv_as_raw r
      JOIN auth.users au
        ON au.id = r.user_id
       AND au.deleted_at IS NULL
       AND au.created_at >= r.occurred_at - INTERVAL '24 hours'
       AND au.created_at <= r.occurred_at + INTERVAL '24 hours'
      ORDER BY r.user_id, r.occurred_at ASC
    ),

    -- -----------------------------------------------------------------------
    -- 5. OEJ touch candidates (occurrence前7日以内のみで後でフィルタ)
    -- -----------------------------------------------------------------------
    oej_touches AS (
      SELECT
        ke.id,
        ke.anonymous_id,
        ke.event_name,
        ke.occurred_at,
        ke.properties->>'traffic_source' AS traffic_source,
        CASE WHEN ke.event_name = 'journal_article_opened'
             THEN ke.properties->>'article_slug'
             ELSE NULL
        END AS article_slug
      FROM public.kpi_events ke
      WHERE ke.environment = 'production'
        AND ke.event_name IN ('journal_article_opened', 'journal_list_viewed')
        AND (v_official_start IS NULL OR ke.occurred_at >= v_official_start)
        AND (ke.route IS NULL OR ke.route NOT LIKE '/ai-check-login%')
        AND (
          p_include_internal
          OR ke.user_id IS NULL
          OR ke.user_id NOT IN (SELECT iu.user_id FROM internal_users iu)
        )
    ),

    -- -----------------------------------------------------------------------
    -- 6. auth_started attribution: 1 conversion につき直近touch 1件
    --    優先: occurred_at DESC → article_opened優先 → id DESC
    -- -----------------------------------------------------------------------
    as_attributed AS (
      SELECT DISTINCT ON (cas.id)
        cas.id            AS conv_id,
        cas.anonymous_id,
        cas.user_id,
        cas.occurred_at,
        t.traffic_source,
        t.article_slug
      FROM conv_as cas
      JOIN oej_touches t
        ON t.anonymous_id = cas.anonymous_id
       AND t.occurred_at <= cas.occurred_at
       AND t.occurred_at >= cas.occurred_at - INTERVAL '7 days'
      WHERE cas.anonymous_id IS NOT NULL
      ORDER BY
        cas.id,
        t.occurred_at DESC,
        CASE t.event_name WHEN 'journal_article_opened' THEN 0 ELSE 1 END ASC,
        t.id DESC
    ),

    -- auth_started full set with attribution flag
    as_full AS (
      SELECT
        cas.id,
        cas.anonymous_id,
        cas.user_id,
        cas.occurred_at,
        aa.traffic_source,
        aa.article_slug,
        (aa.conv_id IS NOT NULL) AS has_touch
      FROM conv_as cas
      LEFT JOIN as_attributed aa ON aa.conv_id = cas.id
    ),

    -- -----------------------------------------------------------------------
    -- 7. registration attribution: 1 user_id につき直近touch 1件
    -- -----------------------------------------------------------------------
    reg_attributed AS (
      SELECT DISTINCT ON (cr.user_id)
        cr.user_id,
        cr.anonymous_id,
        cr.occurred_at,
        t.traffic_source,
        t.article_slug
      FROM conv_reg cr
      JOIN oej_touches t
        ON t.anonymous_id = cr.anonymous_id
       AND t.occurred_at <= cr.occurred_at
       AND t.occurred_at >= cr.occurred_at - INTERVAL '7 days'
      WHERE cr.anonymous_id IS NOT NULL
      ORDER BY
        cr.user_id,
        t.occurred_at DESC,
        CASE t.event_name WHEN 'journal_article_opened' THEN 0 ELSE 1 END ASC,
        t.id DESC
    ),

    -- registration full set with attribution flag
    reg_full AS (
      SELECT
        cr.user_id,
        cr.anonymous_id,
        cr.occurred_at,
        ra.traffic_source,
        ra.article_slug,
        (ra.user_id IS NOT NULL) AS has_touch
      FROM conv_reg cr
      LEFT JOIN reg_attributed ra ON ra.user_id = cr.user_id
    ),

    -- -----------------------------------------------------------------------
    -- 8. overall aggregation
    -- -----------------------------------------------------------------------
    overall_as_agg AS (
      SELECT
        COUNT(*)::BIGINT AS total,
        (
          COUNT(DISTINCT af.user_id) FILTER (WHERE af.user_id IS NOT NULL)
          + COUNT(DISTINCT af.anonymous_id) FILTER (WHERE af.user_id IS NULL)
        )::BIGINT AS unique_users,
        COUNT(*) FILTER (WHERE af.has_touch)::BIGINT AS attributed,
        COUNT(*) FILTER (WHERE NOT af.has_touch)::BIGINT AS unattributed
      FROM as_full af
    ),
    overall_reg_agg AS (
      SELECT
        COUNT(DISTINCT rf.user_id)::BIGINT AS total,
        COUNT(DISTINCT rf.user_id)::BIGINT AS unique_users,
        COUNT(DISTINCT rf.user_id) FILTER (WHERE rf.has_touch)::BIGINT AS attributed,
        COUNT(DISTINCT rf.user_id) FILTER (WHERE NOT rf.has_touch)::BIGINT AS unattributed
      FROM reg_full rf
    ),
    overall_row AS (
      SELECT
        'overall'::TEXT AS dimension_type,
        'all'::TEXT     AS dimension_value,
        oa.total        AS auth_started,
        ore.total       AS registrations,
        oa.unique_users AS unique_auth_users,
        ore.unique_users AS unique_registered_users,
        CASE WHEN oa.total > 0
          THEN ROUND(ore.total::NUMERIC / oa.total * 100, 2)
          ELSE NULL
        END AS auth_to_registration_rate,
        oa.attributed   AS attributed_auth_started,
        ore.attributed  AS attributed_registrations,
        oa.unattributed AS unattributed_auth_started,
        ore.unattributed AS unattributed_registrations
      FROM overall_as_agg oa, overall_reg_agg ore
    ),

    -- -----------------------------------------------------------------------
    -- 9. source aggregation (7固定source、データ0でも必ず出力)
    -- -----------------------------------------------------------------------
    valid_sources (src) AS (
      VALUES
        ('x'::TEXT),
        ('instagram'),
        ('google'),
        ('bing'),
        ('one_eight_internal'),
        ('direct'),
        ('other_external')
    ),
    source_as_agg AS (
      SELECT
        af.traffic_source AS src,
        COUNT(*)::BIGINT AS total,
        (
          COUNT(DISTINCT af.user_id) FILTER (WHERE af.user_id IS NOT NULL)
          + COUNT(DISTINCT af.anonymous_id) FILTER (WHERE af.user_id IS NULL)
        )::BIGINT AS unique_users
      FROM as_full af
      WHERE af.has_touch
        AND af.traffic_source IN (
          'x','instagram','google','bing','one_eight_internal','direct','other_external'
        )
      GROUP BY af.traffic_source
    ),
    source_reg_agg AS (
      SELECT
        rf.traffic_source AS src,
        COUNT(DISTINCT rf.user_id)::BIGINT AS total,
        COUNT(DISTINCT rf.user_id)::BIGINT AS unique_users
      FROM reg_full rf
      WHERE rf.has_touch
        AND rf.traffic_source IN (
          'x','instagram','google','bing','one_eight_internal','direct','other_external'
        )
      GROUP BY rf.traffic_source
    ),
    source_rows AS (
      SELECT
        'source'::TEXT AS dimension_type,
        vs.src         AS dimension_value,
        COALESCE(saa.total, 0)::BIGINT AS auth_started,
        COALESCE(sra.total, 0)::BIGINT AS registrations,
        COALESCE(saa.unique_users, 0)::BIGINT AS unique_auth_users,
        COALESCE(sra.unique_users, 0)::BIGINT AS unique_registered_users,
        CASE WHEN COALESCE(saa.total, 0) > 0
          THEN ROUND(COALESCE(sra.total, 0)::NUMERIC / saa.total * 100, 2)
          ELSE NULL
        END AS auth_to_registration_rate,
        COALESCE(saa.total, 0)::BIGINT AS attributed_auth_started,
        COALESCE(sra.total, 0)::BIGINT AS attributed_registrations,
        0::BIGINT AS unattributed_auth_started,
        0::BIGINT AS unattributed_registrations
      FROM valid_sources vs
      LEFT JOIN source_as_agg saa ON saa.src = vs.src
      LEFT JOIN source_reg_agg sra ON sra.src = vs.src
    ),

    -- -----------------------------------------------------------------------
    -- 10. article aggregation (帰属実績ありのslugのみ)
    -- -----------------------------------------------------------------------
    article_as_agg AS (
      SELECT
        af.article_slug AS slug,
        COUNT(*)::BIGINT AS total,
        (
          COUNT(DISTINCT af.user_id) FILTER (WHERE af.user_id IS NOT NULL)
          + COUNT(DISTINCT af.anonymous_id) FILTER (WHERE af.user_id IS NULL)
        )::BIGINT AS unique_users
      FROM as_full af
      WHERE af.has_touch
        AND af.article_slug IS NOT NULL
        AND af.article_slug <> ''
      GROUP BY af.article_slug
    ),
    article_reg_agg AS (
      SELECT
        rf.article_slug AS slug,
        COUNT(DISTINCT rf.user_id)::BIGINT AS total,
        COUNT(DISTINCT rf.user_id)::BIGINT AS unique_users
      FROM reg_full rf
      WHERE rf.has_touch
        AND rf.article_slug IS NOT NULL
        AND rf.article_slug <> ''
      GROUP BY rf.article_slug
    ),
    article_slugs AS (
      SELECT slug FROM article_as_agg
      UNION
      SELECT slug FROM article_reg_agg
    ),
    article_rows AS (
      SELECT
        'article'::TEXT AS dimension_type,
        ars.slug        AS dimension_value,
        COALESCE(aaa.total, 0)::BIGINT AS auth_started,
        COALESCE(ara.total, 0)::BIGINT AS registrations,
        COALESCE(aaa.unique_users, 0)::BIGINT AS unique_auth_users,
        COALESCE(ara.unique_users, 0)::BIGINT AS unique_registered_users,
        CASE WHEN COALESCE(aaa.total, 0) > 0
          THEN ROUND(COALESCE(ara.total, 0)::NUMERIC / aaa.total * 100, 2)
          ELSE NULL
        END AS auth_to_registration_rate,
        COALESCE(aaa.total, 0)::BIGINT AS attributed_auth_started,
        COALESCE(ara.total, 0)::BIGINT AS attributed_registrations,
        0::BIGINT AS unattributed_auth_started,
        0::BIGINT AS unattributed_registrations
      FROM article_slugs ars
      LEFT JOIN article_as_agg aaa ON aaa.slug = ars.slug
      LEFT JOIN article_reg_agg ara ON ara.slug = ars.slug
    )

  -- -----------------------------------------------------------------------
  -- 11. UNION ALL: overall + source + article
  -- -----------------------------------------------------------------------
  SELECT
    r.dimension_type,
    r.dimension_value,
    r.auth_started,
    r.registrations,
    r.unique_auth_users,
    r.unique_registered_users,
    r.auth_to_registration_rate,
    r.attributed_auth_started,
    r.attributed_registrations,
    r.unattributed_auth_started,
    r.unattributed_registrations,
    v_is_reference,
    v_effective_from,
    v_effective_to
  FROM (
    SELECT * FROM overall_row
    UNION ALL
    SELECT * FROM source_rows
    UNION ALL
    SELECT * FROM article_rows
  ) r
  ORDER BY
    CASE r.dimension_type
      WHEN 'overall' THEN 0
      WHEN 'source'  THEN 1
      WHEN 'article' THEN 2
    END,
    r.dimension_value;

END;
$$;

-- セキュリティ
REVOKE ALL ON FUNCTION public.admin_get_kpi_oej_attribution(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_kpi_oej_attribution(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_oej_attribution(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN)
  TO authenticated, service_role, postgres;

COMMENT ON FUNCTION public.admin_get_kpi_oej_attribution(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) IS
  'OEJ Phase 3-B: OEJ接触後の認証開始・新規登録Attribution集計。7日間・直近接触。auth.users正規確認。';
