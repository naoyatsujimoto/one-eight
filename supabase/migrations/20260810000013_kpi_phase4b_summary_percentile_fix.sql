-- =============================================================================
-- 20260810000013_kpi_phase4b_summary_percentile_fix.sql
-- KPI Phase 4-B summary percentile型修正
--
-- M12のadmin_get_kpi_training_summaryにて
-- percentile_cont() が double precision を返すが RETURNS TABLE では NUMERIC を期待するため
-- エラー: "Returned type double precision does not match expected type numeric in column 18"
-- 修正: ::NUMERIC キャストを追加
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_kpi_training_summary(
  p_from              TIMESTAMPTZ,
  p_to                TIMESTAMPTZ,
  p_timezone          TEXT    DEFAULT 'Asia/Tokyo',
  p_include_internal  BOOLEAN DEFAULT false
)
RETURNS TABLE (
  started_runs                          BIGINT,
  unique_starters                       BIGINT,
  completion_events_in_period           BIGINT,
  cohort_completed_runs                 BIGINT,
  cohort_completion_rate                NUMERIC,
  eligible_for_abandonment_runs         BIGINT,
  abandoned_runs                        BIGINT,
  abandonment_rate                      NUMERIC,
  active_incomplete_runs                BIGINT,
  resumed_runs                          BIGINT,
  attempt_events                        BIGINT,
  incorrect_attempts                    BIGINT,
  incorrect_rate                        NUMERIC,
  hinted_runs                           BIGINT,
  average_attempts_per_started_run      NUMERIC,
  average_attempts_per_completed_run    NUMERIC,
  average_elapsed_seconds               NUMERIC,
  median_elapsed_seconds                NUMERIC,
  p95_elapsed_seconds                   NUMERIC,
  full_game_started_runs                BIGINT,
  full_game_completed_runs              BIGINT,
  individual_started_runs               BIGINT,
  individual_completed_runs             BIGINT,
  registered_users_first_completed_in_period BIGINT,
  unknown_step_abandoned_runs           BIGINT,
  orphan_training_events                BIGINT,
  duplicate_started_runs                BIGINT,
  duplicate_completed_runs              BIGINT,
  invalid_training_run_id_events        BIGINT,
  is_reference_period                   BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_official_start      TIMESTAMPTZ;
  v_effective_from      TIMESTAMPTZ;
  v_effective_as_of     TIMESTAMPTZ;
  v_is_reference        BOOLEAN;
BEGIN
  PERFORM public._kpi_require_admin();

  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'p_from and p_to must not be NULL';
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

  SELECT ks.official_kpi_start_at
  INTO v_official_start
  FROM public.kpi_settings ks
  WHERE ks.id = 1;

  v_is_reference    := (v_official_start IS NULL);
  v_effective_from  := CASE WHEN v_official_start IS NOT NULL
                        THEN GREATEST(p_from, v_official_start)
                        ELSE p_from END;
  v_effective_as_of := LEAST(p_to, now());

  RETURN QUERY
  WITH

  base_events AS (
    SELECT
      ke.id,
      ke.occurred_at,
      ke.event_name,
      ke.user_id,
      ke.anonymous_id,
      ke.properties->>'training_run_id'  AS run_id,
      ke.properties->>'task_id'          AS task_id,
      ke.route
    FROM public.kpi_events ke
    WHERE ke.environment = 'production'
      AND ke.event_name IN (
        'training_started','training_step_reached','training_attempted',
        'training_incorrect','training_hint_shown','training_step_advanced',
        'training_resumed','training_completed'
      )
      AND (ke.properties->>'training_run_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      AND ke.occurred_at < v_effective_as_of
  ),

  canonical_start AS (
    SELECT DISTINCT ON (be.run_id)
      be.run_id,
      be.task_id,
      be.user_id,
      be.anonymous_id,
      be.occurred_at AS started_at,
      be.route        AS start_route
    FROM base_events be
    WHERE be.event_name = 'training_started'
    ORDER BY be.run_id, be.occurred_at ASC, be.id ASC
  ),

  started_count_per_run AS (
    SELECT run_id, COUNT(*) AS started_count
    FROM base_events
    WHERE event_name = 'training_started'
    GROUP BY run_id
  ),

  cohort_runs AS (
    SELECT
      cs.run_id,
      cs.task_id,
      cs.user_id,
      cs.anonymous_id,
      cs.started_at,
      scp.started_count
    FROM canonical_start cs
    JOIN started_count_per_run scp USING (run_id)
    WHERE cs.started_at >= v_effective_from
      AND cs.started_at < p_to
      AND COALESCE(cs.start_route, '') != '/ai-check-login'
      AND (p_include_internal OR cs.user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles pr
        WHERE pr.id = cs.user_id
          AND (
            COALESCE(pr.is_admin, FALSE)
            OR COALESCE(pr.is_internal_test_account, FALSE)
            OR pr.internal_plan_override IS NOT NULL
          )
      ))
  ),

  completed_events AS (
    SELECT
      run_id,
      MIN(occurred_at) AS completed_at,
      COUNT(*) AS completed_count
    FROM base_events
    WHERE event_name = 'training_completed'
    GROUP BY run_id
  ),

  last_activity AS (
    SELECT run_id, MAX(occurred_at) AS last_at
    FROM base_events
    GROUP BY run_id
  ),

  resumed_runs_set AS (
    SELECT DISTINCT run_id
    FROM base_events
    WHERE event_name = 'training_resumed'
  ),

  cohort_with_status AS (
    SELECT
      cr.run_id,
      cr.task_id,
      cr.user_id,
      cr.anonymous_id,
      cr.started_at,
      cr.started_count,
      ce.completed_at,
      la.last_at AS last_activity_at,
      CASE WHEN ce.completed_at IS NOT NULL
             AND ce.completed_at < v_effective_as_of
           THEN true ELSE false END AS is_completed,
      CASE
        WHEN ce.completed_at IS NOT NULL THEN false
        WHEN cr.started_at > v_effective_as_of - INTERVAL '24 hours' THEN false
        WHEN COALESCE(la.last_at, cr.started_at) > v_effective_as_of - INTERVAL '24 hours' THEN false
        ELSE true
      END AS is_abandoned
    FROM cohort_runs cr
    LEFT JOIN completed_events ce USING (run_id)
    LEFT JOIN last_activity la USING (run_id)
  ),

  -- [BUG-1 FIX] last_step_reached: kpi_eventsにrun_idカラムは存在しないため
  -- ke.properties->>'training_run_id' を使う
  last_step_reached AS (
    SELECT DISTINCT ON (ke.properties->>'training_run_id')
      ke.properties->>'training_run_id'  AS run_id,
      (ke.properties->>'step')::INT       AS step_num
    FROM public.kpi_events ke
    WHERE ke.environment = 'production'
      AND ke.event_name = 'training_step_reached'
      AND (ke.properties->>'training_run_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      AND (ke.properties->>'step') ~ '^[0-9]+$'
    ORDER BY ke.properties->>'training_run_id', ke.occurred_at DESC
  ),

  attempt_agg AS (
    SELECT
      COUNT(*) AS total_attempts,
      COUNT(*) FILTER (WHERE event_name = 'training_incorrect') AS incorrect_cnt
    FROM base_events be
    JOIN cohort_runs cr USING (run_id)
    WHERE be.event_name IN ('training_attempted', 'training_incorrect')
  ),

  elapsed_agg AS (
    SELECT
      (ke.properties->>'elapsed_seconds')::NUMERIC AS elapsed_sec
    FROM public.kpi_events ke
    JOIN cohort_with_status cws ON cws.run_id = (ke.properties->>'training_run_id')
    WHERE ke.environment = 'production'
      AND ke.event_name = 'training_completed'
      AND cws.is_completed
      AND (ke.properties->>'elapsed_seconds') ~ '^[0-9]+(\.[0-9]+)?$'
  ),

  hinted_agg AS (
    SELECT COUNT(DISTINCT be.run_id) AS hinted_cnt
    FROM base_events be
    JOIN cohort_runs cr USING (run_id)
    WHERE be.event_name = 'training_hint_shown'
  ),

  reg_users_first_completed AS (
    SELECT COUNT(DISTINCT tp.user_id) AS cnt
    FROM public.training_progress tp
    WHERE tp.completed_at >= v_effective_from
      AND tp.completed_at < p_to
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles pr
        WHERE pr.id = tp.user_id
          AND (
            COALESCE(pr.is_admin, FALSE)
            OR COALESCE(pr.is_internal_test_account, FALSE)
            OR pr.internal_plan_override IS NOT NULL
          )
      ))
  ),

  orphan_agg AS (
    SELECT COUNT(DISTINCT be.run_id) AS orphan_cnt
    FROM base_events be
    WHERE NOT EXISTS (
      SELECT 1 FROM canonical_start cs WHERE cs.run_id = be.run_id
    )
  ),

  invalid_run_id_agg AS (
    SELECT COUNT(*) AS invalid_cnt
    FROM public.kpi_events ke
    WHERE ke.environment = 'production'
      AND ke.event_name IN (
        'training_started','training_step_reached','training_attempted',
        'training_incorrect','training_hint_shown','training_step_advanced',
        'training_resumed','training_completed'
      )
      AND (
        (ke.properties->>'training_run_id') IS NULL
        OR (ke.properties->>'training_run_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      )
  )

  SELECT
    (SELECT COUNT(*) FROM cohort_runs)::BIGINT,
    (SELECT COUNT(*) FROM (
      SELECT COALESCE(cr.user_id::TEXT, cr.anonymous_id::TEXT) AS identity_key
      FROM cohort_runs cr
      GROUP BY COALESCE(cr.user_id::TEXT, cr.anonymous_id::TEXT)
    ) u)::BIGINT,
    (SELECT COUNT(DISTINCT be.run_id)
     FROM base_events be
     WHERE be.event_name = 'training_completed'
       AND be.occurred_at >= v_effective_from
       AND be.occurred_at < v_effective_as_of
       AND EXISTS (SELECT 1 FROM canonical_start cs WHERE cs.run_id = be.run_id)
    )::BIGINT,
    (SELECT COUNT(*) FROM cohort_with_status cws WHERE cws.is_completed)::BIGINT,
    CASE WHEN (SELECT COUNT(*) FROM cohort_runs) > 0
      THEN ROUND((SELECT COUNT(*) FROM cohort_with_status WHERE is_completed)::NUMERIC
                 / (SELECT COUNT(*) FROM cohort_runs) * 100, 2)
      ELSE NULL END,
    (SELECT COUNT(*) FROM cohort_with_status cws
     WHERE NOT cws.is_completed
       AND cws.started_at <= v_effective_as_of - INTERVAL '24 hours')::BIGINT,
    (SELECT COUNT(*) FROM cohort_with_status cws WHERE cws.is_abandoned)::BIGINT,
    CASE WHEN (SELECT COUNT(*) FROM cohort_with_status
               WHERE NOT is_completed
                 AND started_at <= v_effective_as_of - INTERVAL '24 hours') > 0
      THEN ROUND((SELECT COUNT(*) FROM cohort_with_status WHERE is_abandoned)::NUMERIC
                 / (SELECT COUNT(*) FROM cohort_with_status
                    WHERE NOT is_completed
                      AND started_at <= v_effective_as_of - INTERVAL '24 hours') * 100, 2)
      ELSE NULL END,
    (SELECT COUNT(*) FROM cohort_with_status cws
     WHERE NOT cws.is_completed AND NOT cws.is_abandoned)::BIGINT,
    (SELECT COUNT(DISTINCT rr.run_id) FROM resumed_runs_set rr
     JOIN cohort_runs cr USING (run_id))::BIGINT,
    (SELECT aa.total_attempts FROM attempt_agg aa),
    (SELECT aa.incorrect_cnt FROM attempt_agg aa),
    CASE WHEN (SELECT aa.total_attempts FROM attempt_agg aa) > 0
      THEN ROUND((SELECT aa.incorrect_cnt FROM attempt_agg aa)::NUMERIC
                 / (SELECT aa.total_attempts FROM attempt_agg aa) * 100, 2)
      ELSE NULL END,
    (SELECT ha.hinted_cnt FROM hinted_agg ha),
    CASE WHEN (SELECT COUNT(*) FROM cohort_runs) > 0
      THEN ROUND((SELECT aa.total_attempts FROM attempt_agg aa)::NUMERIC
                 / (SELECT COUNT(*) FROM cohort_runs), 2)
      ELSE NULL END,
    CASE WHEN (SELECT COUNT(*) FROM cohort_with_status WHERE is_completed) > 0
      THEN ROUND((SELECT COUNT(*) FROM base_events be
                  JOIN cohort_with_status cws USING (run_id)
                  WHERE be.event_name = 'training_attempted' AND cws.is_completed)::NUMERIC
                 / (SELECT COUNT(*) FROM cohort_with_status WHERE is_completed), 2)
      ELSE NULL END,
    (SELECT ROUND(AVG(ea.elapsed_sec), 2) FROM elapsed_agg ea),
    -- [PERCENTILE FIX] ::NUMERIC キャストでdouble precision→numeric変換
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ea.elapsed_sec)::NUMERIC FROM elapsed_agg ea),
    (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY ea.elapsed_sec)::NUMERIC FROM elapsed_agg ea),
    (SELECT COUNT(*) FROM cohort_runs cr WHERE cr.task_id = 'full-game-v1')::BIGINT,
    (SELECT COUNT(*) FROM cohort_with_status cws WHERE cws.task_id = 'full-game-v1' AND cws.is_completed)::BIGINT,
    (SELECT COUNT(*) FROM cohort_runs cr WHERE cr.task_id != 'full-game-v1')::BIGINT,
    (SELECT COUNT(*) FROM cohort_with_status cws WHERE cws.task_id != 'full-game-v1' AND cws.is_completed)::BIGINT,
    (SELECT rfc.cnt FROM reg_users_first_completed rfc),
    (SELECT COUNT(*) FROM cohort_with_status cws
     WHERE cws.is_abandoned
       AND NOT EXISTS (
         SELECT 1 FROM last_step_reached lsr WHERE lsr.run_id = cws.run_id
       ))::BIGINT,
    (SELECT oa.orphan_cnt FROM orphan_agg oa),
    (SELECT COUNT(DISTINCT run_id) FROM started_count_per_run WHERE started_count > 1)::BIGINT,
    (SELECT COUNT(*) FROM completed_events ce WHERE ce.completed_count > 1)::BIGINT,
    (SELECT ira.invalid_cnt FROM invalid_run_id_agg ira),
    v_is_reference;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_kpi_training_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_kpi_training_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.admin_get_kpi_training_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_training_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN)
  TO service_role, postgres, authenticated;

COMMENT ON FUNCTION public.admin_get_kpi_training_summary IS
  'KPI Phase 4-B Bugfix (M13): percentile_contにNUMERICキャスト追加。Bug1+M12修正を継承。';
