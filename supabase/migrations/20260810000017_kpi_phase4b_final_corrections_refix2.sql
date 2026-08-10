-- =============================================================================
-- 20260810000017_kpi_phase4b_final_corrections.sql
-- KPI Phase 4-B Final Corrections (Migration 14 → 16 (refix2: task_id ambiguity, last_step_reached alias) (bugfix: last_step_reached, summary reapply))
--
-- 修正内容:
--   C. attempt二重計上: attempt_events=training_attemptedのみ
--                       incorrect_attempts=training_incorrectのみ
--                       average_attempts=training_attemptedのみ
--   D. eligible_canonical_runs: 期間に関係なくInternal/AI除外を適用した共通集合
--   E. effective_as_of境界の完全適用: base_eventsにoccurred_at < v_effective_as_of追加
--   F. last stepは時刻で決定: ORDER BY occurred_at DESC, event_id DESC
--   G. Step metadataのcanonical化: eligible cohort runのreached eventのoccurred_at ASC,id ASCで最初の正常eventを採用
--   H. completed step解決: canonical completed=同run_idの最初のtraining_completedのみ
--   I. elapsed統計: runごとのcanonical completed event 1件使用、eligible canonical runのみ
--   J. DailyのInternal除外: eligible_canonical_runsへ結合
--   K. identity key衝突防止: 'u:'||user_id, 'a:'||anonymous_id (RPCからは返さない)
--
-- official_kpi_start_at = NULL維持（変更SQL禁止）
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. admin_get_kpi_training_summary — 全体サマリー（Final Corrections）
-- ---------------------------------------------------------------------------

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
  -- [FIX-E] effective_as_of = LEAST(p_to, now())
  v_effective_as_of := LEAST(p_to, now());

  RETURN QUERY
  WITH

  -- [FIX-E] base_events: occurred_at < v_effective_as_of
  base_events AS (
    SELECT
      ke.id         AS event_id,
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
      AND ke.occurred_at < v_effective_as_of  -- [FIX-E]
  ),

  -- canonical_start: run_idごとに最初のtraining_startedを1件に確定
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
    ORDER BY be.run_id, be.occurred_at ASC, be.event_id ASC
  ),

  -- [FIX-D] eligible_canonical_runs: 期間に関係なくInternal/AI除外を適用した共通集合
  eligible_canonical_runs AS (
    SELECT cs.*
    FROM canonical_start cs
    WHERE cs.start_route != '/ai-check-login'
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

  -- started_count_per_run: 重複started数を計測（diagnostic用）
  started_count_per_run AS (
    SELECT run_id, COUNT(*) AS started_count
    FROM base_events
    WHERE event_name = 'training_started'
    GROUP BY run_id
  ),

  -- cohort_runs: eligible canonical runのうち、期間内に開始したもの
  cohort_runs AS (
    SELECT
      ecr.run_id,
      ecr.task_id,
      ecr.user_id,
      ecr.anonymous_id,
      ecr.started_at,
      scp.started_count
    FROM eligible_canonical_runs ecr
    JOIN started_count_per_run scp USING (run_id)
    WHERE ecr.started_at >= v_effective_from
      AND ecr.started_at < p_to
  ),

  -- [FIX-H] canonical_completed: 同run_idの最初のtraining_completedのみ
  -- [FIX-D] eligible canonical runのみ対象
  canonical_completed AS (
    SELECT DISTINCT ON (be.run_id)
      be.run_id,
      be.occurred_at  AS completed_at,
      COUNT(*) OVER (PARTITION BY be.run_id) AS completed_count
    FROM base_events be
    WHERE be.event_name = 'training_completed'
      AND EXISTS (SELECT 1 FROM eligible_canonical_runs ecr WHERE ecr.run_id = be.run_id)
    ORDER BY be.run_id, be.occurred_at ASC, be.event_id ASC
  ),

  -- duplicate_completed_events用 (全件カウント)
  completed_events_all AS (
    SELECT run_id, COUNT(*) AS completed_count
    FROM base_events
    WHERE event_name = 'training_completed'
    GROUP BY run_id
  ),

  -- 各runの最後の活動時刻
  last_activity AS (
    SELECT run_id, MAX(occurred_at) AS last_at
    FROM base_events
    GROUP BY run_id
  ),

  -- training_resumed
  resumed_runs_set AS (
    SELECT DISTINCT run_id
    FROM base_events
    WHERE event_name = 'training_resumed'
  ),

  -- cohort_with_status
  cohort_with_status AS (
    SELECT
      cr.run_id,
      cr.task_id,
      cr.user_id,
      cr.anonymous_id,
      cr.started_at,
      cr.started_count,
      cc.completed_at,
      la.last_at AS last_activity_at,
      CASE WHEN cc.completed_at IS NOT NULL
             AND cc.completed_at < v_effective_as_of
           THEN true ELSE false END AS is_completed,
      CASE
        WHEN cc.completed_at IS NOT NULL THEN false
        WHEN cr.started_at > v_effective_as_of - INTERVAL '24 hours' THEN false
        WHEN COALESCE(la.last_at, cr.started_at) > v_effective_as_of - INTERVAL '24 hours' THEN false
        ELSE true
      END AS is_abandoned
    FROM cohort_runs cr
    LEFT JOIN canonical_completed cc USING (run_id)
    LEFT JOIN last_activity la USING (run_id)
  ),

  -- [FIX-F] last_step_reached: 時刻で決定 (occurred_at DESC, event_id DESC)
  -- [FIX-D] eligible canonical runのみ対象
  last_step_reached AS (
    SELECT DISTINCT ON (ke.properties->>'training_run_id')
      (ke.properties->>'training_run_id') AS run_id,
      (ke.properties->>'step')::INT AS step_num
    FROM public.kpi_events ke
    WHERE ke.environment = 'production'
      AND ke.event_name = 'training_step_reached'
      AND (ke.properties->>'training_run_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      AND (ke.properties->>'step') ~ '^[0-9]+$'
      AND EXISTS (SELECT 1 FROM eligible_canonical_runs ecr WHERE ecr.run_id = (ke.properties->>'training_run_id'))
    ORDER BY ke.properties->>'training_run_id', ke.occurred_at DESC, ke.id DESC  -- [FIX-F]
  ),

  -- [FIX-C] attempt集計: attempt_events=training_attemptedのみ、incorrect_attempts=training_incorrectのみ
  attempt_agg AS (
    SELECT
      COUNT(*) FILTER (WHERE be.event_name = 'training_attempted')  AS total_attempts,
      COUNT(*) FILTER (WHERE be.event_name = 'training_incorrect')  AS incorrect_cnt
    FROM base_events be
    JOIN cohort_runs cr USING (run_id)
    WHERE be.event_name IN ('training_attempted', 'training_incorrect')
  ),

  -- [FIX-I] elapsed_agg: runごとのcanonical completed event 1件のみ、eligible canonical runのみ
  elapsed_agg AS (
    SELECT DISTINCT ON (cc.run_id)
      (ke.properties->>'elapsed_seconds')::NUMERIC AS elapsed_sec
    FROM canonical_completed cc
    JOIN cohort_with_status cws USING (run_id)
    JOIN public.kpi_events ke ON ke.environment = 'production'
      AND ke.event_name = 'training_completed'
      AND (ke.properties->>'training_run_id') = cc.run_id
      AND ke.occurred_at = cc.completed_at
    WHERE cws.is_completed
      AND (ke.properties->>'elapsed_seconds') ~ '^[0-9]+(\.[0-9]+)?$'
      AND (ke.properties->>'elapsed_seconds')::NUMERIC >= 0
      AND (ke.properties->>'elapsed_seconds')::NUMERIC <= 86400
    ORDER BY cc.run_id, ke.occurred_at ASC, ke.id ASC
  ),

  -- hinted runs（cohort内）
  hinted_agg AS (
    SELECT COUNT(DISTINCT be.run_id) AS hinted_cnt
    FROM base_events be
    JOIN cohort_runs cr USING (run_id)
    WHERE be.event_name = 'training_hint_shown'
  ),

  -- 登録ユーザー初回task完了
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

  -- [FIX-D] orphan events: eligible canonical startなしのrun_id
  orphan_agg AS (
    SELECT COUNT(DISTINCT be.run_id) AS orphan_cnt
    FROM base_events be
    WHERE NOT EXISTS (
      SELECT 1 FROM canonical_start cs WHERE cs.run_id = be.run_id
    )
  ),

  -- invalid training_run_id events
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
    -- started_runs
    (SELECT COUNT(*) FROM cohort_runs)::BIGINT,
    -- [FIX-K] unique_starters: 'u:' || user_id, 'a:' || anonymous_id（キー自体は返さない）
    (SELECT COUNT(DISTINCT
      CASE WHEN cr.user_id IS NOT NULL
           THEN 'u:' || cr.user_id::TEXT
           ELSE 'a:' || cr.anonymous_id::TEXT
      END)
     FROM cohort_runs cr)::BIGINT,
    -- [FIX-D] completion_events_in_period: eligible canonical runのみ
    (SELECT COUNT(DISTINCT be.run_id)
     FROM base_events be
     WHERE be.event_name = 'training_completed'
       AND be.occurred_at >= v_effective_from
       AND be.occurred_at < v_effective_as_of
       AND EXISTS (
         SELECT 1 FROM eligible_canonical_runs ecr WHERE ecr.run_id = be.run_id
       )
    )::BIGINT,
    -- cohort_completed_runs
    (SELECT COUNT(*) FROM cohort_with_status WHERE is_completed)::BIGINT,
    -- cohort_completion_rate
    CASE WHEN (SELECT COUNT(*) FROM cohort_runs) > 0
      THEN ROUND((SELECT COUNT(*) FROM cohort_with_status WHERE is_completed)::NUMERIC
                 / (SELECT COUNT(*) FROM cohort_runs) * 100, 2)
      ELSE NULL END,
    -- eligible_for_abandonment_runs
    (SELECT COUNT(*) FROM cohort_with_status cws
     WHERE NOT cws.is_completed
       AND cws.started_at <= v_effective_as_of - INTERVAL '24 hours')::BIGINT,
    -- abandoned_runs
    (SELECT COUNT(*) FROM cohort_with_status WHERE is_abandoned)::BIGINT,
    -- abandonment_rate
    CASE WHEN (SELECT COUNT(*) FROM cohort_with_status
               WHERE NOT is_completed
                 AND started_at <= v_effective_as_of - INTERVAL '24 hours') > 0
      THEN ROUND((SELECT COUNT(*) FROM cohort_with_status WHERE is_abandoned)::NUMERIC
                 / (SELECT COUNT(*) FROM cohort_with_status
                    WHERE NOT is_completed
                      AND started_at <= v_effective_as_of - INTERVAL '24 hours') * 100, 2)
      ELSE NULL END,
    -- active_incomplete_runs
    (SELECT COUNT(*) FROM cohort_with_status WHERE NOT is_completed AND NOT is_abandoned)::BIGINT,
    -- resumed_runs
    (SELECT COUNT(DISTINCT rr.run_id) FROM resumed_runs_set rr
     JOIN cohort_runs cr USING (run_id))::BIGINT,
    -- [FIX-C] attempt_events: training_attemptedのみ
    (SELECT aa.total_attempts FROM attempt_agg aa),
    -- [FIX-C] incorrect_attempts: training_incorrectのみ
    (SELECT aa.incorrect_cnt FROM attempt_agg aa),
    -- [FIX-C] incorrect_rate: incorrect / attempt × 100
    CASE WHEN (SELECT aa.total_attempts FROM attempt_agg aa) > 0
      THEN ROUND((SELECT aa.incorrect_cnt FROM attempt_agg aa)::NUMERIC
                 / (SELECT aa.total_attempts FROM attempt_agg aa) * 100, 2)
      ELSE NULL END,
    -- hinted_runs
    (SELECT ha.hinted_cnt FROM hinted_agg ha),
    -- [FIX-C] average_attempts_per_started_run: training_attemptedのみ
    CASE WHEN (SELECT COUNT(*) FROM cohort_runs) > 0
      THEN ROUND((SELECT aa.total_attempts FROM attempt_agg aa)::NUMERIC
                 / (SELECT COUNT(*) FROM cohort_runs), 2)
      ELSE NULL END,
    -- [FIX-C] average_attempts_per_completed_run: training_attemptedのみ
    CASE WHEN (SELECT COUNT(*) FROM cohort_with_status WHERE is_completed) > 0
      THEN ROUND((SELECT COUNT(*) FROM base_events be
                  JOIN cohort_with_status cws USING (run_id)
                  WHERE be.event_name = 'training_attempted' AND cws.is_completed)::NUMERIC
                 / (SELECT COUNT(*) FROM cohort_with_status WHERE is_completed), 2)
      ELSE NULL END,
    -- [FIX-I] average_elapsed_seconds: canonical completed event 1件/run
    (SELECT ROUND(AVG(ea.elapsed_sec), 2) FROM elapsed_agg ea),
    -- [FIX-I] median_elapsed_seconds: ::NUMERICキャスト
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ea.elapsed_sec)::NUMERIC FROM elapsed_agg ea),
    -- [FIX-I] p95_elapsed_seconds: ::NUMERICキャスト
    (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY ea.elapsed_sec)::NUMERIC FROM elapsed_agg ea),
    -- full_game_started_runs
    (SELECT COUNT(*) FROM cohort_runs WHERE task_id = 'full-game-v1')::BIGINT,
    -- full_game_completed_runs
    (SELECT COUNT(*) FROM cohort_with_status WHERE task_id = 'full-game-v1' AND is_completed)::BIGINT,
    -- individual_started_runs
    (SELECT COUNT(*) FROM cohort_runs WHERE task_id != 'full-game-v1')::BIGINT,
    -- individual_completed_runs
    (SELECT COUNT(*) FROM cohort_with_status WHERE task_id != 'full-game-v1' AND is_completed)::BIGINT,
    -- registered_users_first_completed_in_period
    (SELECT rfc.cnt FROM reg_users_first_completed rfc),
    -- unknown_step_abandoned_runs
    (SELECT COUNT(*) FROM cohort_with_status cws
     WHERE cws.is_abandoned
       AND NOT EXISTS (
         SELECT 1 FROM last_step_reached lsr WHERE lsr.run_id = cws.run_id
       ))::BIGINT,
    -- orphan_training_events
    (SELECT oa.orphan_cnt FROM orphan_agg oa),
    -- duplicate_started_runs
    (SELECT COUNT(DISTINCT run_id) FROM started_count_per_run WHERE started_count > 1)::BIGINT,
    -- [FIX-H] duplicate_completed_runs: 全件カウント
    (SELECT COUNT(*) FROM completed_events_all WHERE completed_count > 1)::BIGINT,
    -- invalid_training_run_id_events
    (SELECT ira.invalid_cnt FROM invalid_run_id_agg ira),
    -- is_reference_period
    v_is_reference;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_kpi_training_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_kpi_training_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.admin_get_kpi_training_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_training_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN)
  TO service_role, postgres, authenticated;

COMMENT ON FUNCTION public.admin_get_kpi_training_summary IS
  'KPI Phase 4-B Final Corrections (M14): attempt dedup, eligible canonical, effective_as_of, last step timing, canonical metadata, canonical completed/elapsed, daily internal exclusion, identity key namespace.';

-- ---------------------------------------------------------------------------
-- 2. admin_get_kpi_training_task_summary — task_id 別サマリー（Final Corrections）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_get_kpi_training_task_summary(
  p_from              TIMESTAMPTZ,
  p_to                TIMESTAMPTZ,
  p_timezone          TEXT    DEFAULT 'Asia/Tokyo',
  p_include_internal  BOOLEAN DEFAULT false
)
RETURNS TABLE (
  task_id                               TEXT,
  training_kind                         TEXT,
  started_runs                          BIGINT,
  unique_starters                       BIGINT,
  completion_events_in_period           BIGINT,
  cohort_completed_runs                 BIGINT,
  completion_rate                       NUMERIC,
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
  registered_users_first_completed_in_period BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_official_start  TIMESTAMPTZ;
  v_effective_from  TIMESTAMPTZ;
  v_effective_as_of TIMESTAMPTZ;
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

  SELECT ks.official_kpi_start_at INTO v_official_start
  FROM public.kpi_settings ks WHERE ks.id = 1;

  v_effective_from  := CASE WHEN v_official_start IS NOT NULL
                        THEN GREATEST(p_from, v_official_start)
                        ELSE p_from END;
  -- [FIX-E]
  v_effective_as_of := LEAST(p_to, now());

  RETURN QUERY
  WITH

  -- [FIX-E] base_events: occurred_at < v_effective_as_of
  base_events AS (
    SELECT
      ke.id         AS event_id,
      ke.occurred_at,
      ke.event_name,
      ke.user_id,
      ke.anonymous_id,
      ke.properties->>'training_run_id' AS run_id,
      ke.properties->>'task_id'         AS task_id,
      ke.route
    FROM public.kpi_events ke
    WHERE ke.environment = 'production'
      AND ke.event_name IN (
        'training_started','training_step_reached','training_attempted',
        'training_incorrect','training_hint_shown','training_step_advanced',
        'training_resumed','training_completed'
      )
      AND (ke.properties->>'training_run_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      AND ke.occurred_at < v_effective_as_of  -- [FIX-E]
  ),

  -- canonical_start
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
    ORDER BY be.run_id, be.occurred_at ASC, be.event_id ASC
  ),

  -- [FIX-D] eligible_canonical_runs
  eligible_canonical_runs AS (
    SELECT cs.*
    FROM canonical_start cs
    WHERE cs.start_route != '/ai-check-login'
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

  -- cohort_runs: eligible canonical runのうち、期間内に開始したもの
  -- [FIX-G] task_idはcanonical start.task_idを使用
  cohort_runs AS (
    SELECT
      ecr.run_id,
      ecr.task_id,
      ecr.user_id,
      ecr.anonymous_id,
      ecr.started_at
    FROM eligible_canonical_runs ecr
    WHERE ecr.started_at >= v_effective_from
      AND ecr.started_at < p_to
  ),

  -- [FIX-H] canonical_completed: 同run_idの最初のtraining_completedのみ、eligible canonical runのみ
  canonical_completed AS (
    SELECT DISTINCT ON (be.run_id)
      be.run_id,
      be.occurred_at AS completed_at
    FROM base_events be
    WHERE be.event_name = 'training_completed'
      AND EXISTS (SELECT 1 FROM eligible_canonical_runs ecr WHERE ecr.run_id = be.run_id)
    ORDER BY be.run_id, be.occurred_at ASC, be.event_id ASC
  ),

  last_activity AS (
    SELECT run_id, MAX(occurred_at) AS last_at
    FROM base_events GROUP BY run_id
  ),

  cohort_status AS (
    SELECT
      cr.run_id,
      cr.task_id,
      cr.user_id,
      cr.anonymous_id,
      cr.started_at,
      cc.completed_at,
      la.last_at AS last_activity_at,
      CASE WHEN cc.completed_at IS NOT NULL AND cc.completed_at < v_effective_as_of
           THEN true ELSE false END AS is_completed,
      CASE
        WHEN cc.completed_at IS NOT NULL THEN false
        WHEN cr.started_at > v_effective_as_of - INTERVAL '24 hours' THEN false
        WHEN COALESCE(la.last_at, cr.started_at) > v_effective_as_of - INTERVAL '24 hours' THEN false
        ELSE true
      END AS is_abandoned
    FROM cohort_runs cr
    LEFT JOIN canonical_completed cc USING (run_id)
    LEFT JOIN last_activity la USING (run_id)
  ),

  -- [FIX-H] all_task_ids: training_progressにもinternal除外を適用
  all_task_ids AS (
    SELECT DISTINCT cr.task_id FROM cohort_runs cr
    UNION
    SELECT DISTINCT tp.task_id FROM public.training_progress tp
    WHERE tp.completed_at >= v_effective_from AND tp.completed_at < p_to
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles pr WHERE pr.id = tp.user_id
          AND (
            COALESCE(pr.is_admin, FALSE)
            OR COALESCE(pr.is_internal_test_account, FALSE)
            OR pr.internal_plan_override IS NOT NULL
          )
      ))
  )

  SELECT
    ati.task_id,
    CASE WHEN ati.task_id = 'full-game-v1' THEN 'full_game' ELSE 'individual' END AS training_kind,
    -- started_runs
    (SELECT COUNT(*) FROM cohort_runs cr WHERE cr.task_id = ati.task_id)::BIGINT,
    -- [FIX-K] unique_starters
    (SELECT COUNT(DISTINCT
      CASE WHEN cr.user_id IS NOT NULL THEN 'u:' || cr.user_id::TEXT
           ELSE 'a:' || cr.anonymous_id::TEXT END)
     FROM cohort_runs cr WHERE cr.task_id = ati.task_id)::BIGINT,
    -- [FIX-D] completion_events_in_period: eligible canonical runのみ
    (SELECT COUNT(DISTINCT be.run_id)
     FROM base_events be
     WHERE be.event_name = 'training_completed'
       AND be.occurred_at >= v_effective_from
       AND be.occurred_at < v_effective_as_of
       AND EXISTS (
         SELECT 1 FROM eligible_canonical_runs ecr WHERE ecr.run_id = be.run_id AND ecr.task_id = ati.task_id
       )
    )::BIGINT,
    -- cohort_completed_runs
    (SELECT COUNT(*) FROM cohort_status cs WHERE cs.task_id = ati.task_id AND cs.is_completed)::BIGINT,
    -- completion_rate
    CASE WHEN (SELECT COUNT(*) FROM cohort_runs cr WHERE cr.task_id = ati.task_id) > 0
      THEN ROUND(
        (SELECT COUNT(*) FROM cohort_status cs WHERE cs.task_id = ati.task_id AND cs.is_completed)::NUMERIC
        / (SELECT COUNT(*) FROM cohort_runs cr WHERE cr.task_id = ati.task_id) * 100, 2)
      ELSE NULL END,
    -- eligible_for_abandonment_runs
    (SELECT COUNT(*) FROM cohort_status cs
     WHERE cs.task_id = ati.task_id AND NOT cs.is_completed
       AND cs.started_at <= v_effective_as_of - INTERVAL '24 hours')::BIGINT,
    -- abandoned_runs
    (SELECT COUNT(*) FROM cohort_status cs WHERE cs.task_id = ati.task_id AND cs.is_abandoned)::BIGINT,
    -- abandonment_rate
    CASE WHEN (SELECT COUNT(*) FROM cohort_status cs
               WHERE cs.task_id = ati.task_id AND NOT cs.is_completed
                 AND cs.started_at <= v_effective_as_of - INTERVAL '24 hours') > 0
      THEN ROUND(
        (SELECT COUNT(*) FROM cohort_status cs WHERE cs.task_id = ati.task_id AND cs.is_abandoned)::NUMERIC
        / (SELECT COUNT(*) FROM cohort_status cs
           WHERE cs.task_id = ati.task_id AND NOT cs.is_completed
             AND cs.started_at <= v_effective_as_of - INTERVAL '24 hours') * 100, 2)
      ELSE NULL END,
    -- active_incomplete_runs
    (SELECT COUNT(*) FROM cohort_status cs
     WHERE cs.task_id = ati.task_id AND NOT cs.is_completed AND NOT cs.is_abandoned)::BIGINT,
    -- resumed_runs
    (SELECT COUNT(DISTINCT be.run_id)
     FROM base_events be
     JOIN cohort_runs cr USING (run_id)
     WHERE be.event_name = 'training_resumed' AND cr.task_id = ati.task_id)::BIGINT,
    -- [FIX-C] attempt_events: training_attemptedのみ
    (SELECT COUNT(*)
     FROM base_events be
     JOIN cohort_runs cr USING (run_id)
     WHERE be.event_name = 'training_attempted' AND cr.task_id = ati.task_id)::BIGINT,
    -- [FIX-C] incorrect_attempts: training_incorrectのみ
    (SELECT COUNT(*)
     FROM base_events be
     JOIN cohort_runs cr USING (run_id)
     WHERE be.event_name = 'training_incorrect' AND cr.task_id = ati.task_id)::BIGINT,
    -- [FIX-C] incorrect_rate
    CASE WHEN (SELECT COUNT(*) FROM base_events be JOIN cohort_runs cr USING (run_id)
               WHERE be.event_name = 'training_attempted' AND cr.task_id = ati.task_id) > 0
      THEN ROUND(
        (SELECT COUNT(*) FROM base_events be JOIN cohort_runs cr USING (run_id)
         WHERE be.event_name = 'training_incorrect' AND cr.task_id = ati.task_id)::NUMERIC
        / (SELECT COUNT(*) FROM base_events be JOIN cohort_runs cr USING (run_id)
           WHERE be.event_name = 'training_attempted' AND cr.task_id = ati.task_id) * 100, 2)
      ELSE NULL END,
    -- hinted_runs
    (SELECT COUNT(DISTINCT be.run_id)
     FROM base_events be
     JOIN cohort_runs cr USING (run_id)
     WHERE be.event_name = 'training_hint_shown' AND cr.task_id = ati.task_id)::BIGINT,
    -- [FIX-C] average_attempts_per_started_run: training_attemptedのみ
    CASE WHEN (SELECT COUNT(*) FROM cohort_runs cr WHERE cr.task_id = ati.task_id) > 0
      THEN ROUND(
        (SELECT COUNT(*) FROM base_events be JOIN cohort_runs cr USING (run_id)
         WHERE be.event_name = 'training_attempted' AND cr.task_id = ati.task_id)::NUMERIC
        / (SELECT COUNT(*) FROM cohort_runs cr WHERE cr.task_id = ati.task_id), 2)
      ELSE NULL END,
    -- [FIX-C] average_attempts_per_completed_run: training_attemptedのみ
    CASE WHEN (SELECT COUNT(*) FROM cohort_status cs WHERE cs.task_id = ati.task_id AND cs.is_completed) > 0
      THEN ROUND(
        (SELECT COUNT(*) FROM base_events be JOIN cohort_status cs USING (run_id)
         WHERE be.event_name = 'training_attempted' AND cs.task_id = ati.task_id AND cs.is_completed)::NUMERIC
        / (SELECT COUNT(*) FROM cohort_status cs WHERE cs.task_id = ati.task_id AND cs.is_completed), 2)
      ELSE NULL END,
    -- [FIX-I] average_elapsed_seconds: canonical completed event 1件/run
    (SELECT ROUND(AVG(ea.elapsed_sec), 2)
     FROM (
       SELECT DISTINCT ON (cc.run_id)
         (ke.properties->>'elapsed_seconds')::NUMERIC AS elapsed_sec
       FROM canonical_completed cc
       JOIN cohort_status cs ON cs.run_id = cc.run_id AND cs.task_id = ati.task_id AND cs.is_completed
       JOIN public.kpi_events ke ON ke.environment = 'production'
         AND ke.event_name = 'training_completed'
         AND (ke.properties->>'training_run_id') = cc.run_id
         AND ke.occurred_at = cc.completed_at
       WHERE (ke.properties->>'elapsed_seconds') ~ '^[0-9]+(\.[0-9]+)?$'
         AND (ke.properties->>'elapsed_seconds')::NUMERIC >= 0
         AND (ke.properties->>'elapsed_seconds')::NUMERIC <= 86400
       ORDER BY cc.run_id, ke.occurred_at ASC, ke.id ASC
     ) ea),
    -- registered_users_first_completed_in_period
    (SELECT COUNT(DISTINCT tp.user_id)
     FROM public.training_progress tp
     WHERE tp.task_id = ati.task_id
       AND tp.completed_at >= v_effective_from
       AND tp.completed_at < p_to
       AND (p_include_internal OR NOT EXISTS (
         SELECT 1 FROM public.profiles pr
         WHERE pr.id = tp.user_id
           AND (
             COALESCE(pr.is_admin, FALSE)
             OR COALESCE(pr.is_internal_test_account, FALSE)
             OR pr.internal_plan_override IS NOT NULL
           )
       )))::BIGINT
  FROM all_task_ids ati
  ORDER BY ati.task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_kpi_training_task_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_kpi_training_task_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.admin_get_kpi_training_task_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_training_task_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN)
  TO service_role, postgres, authenticated;

COMMENT ON FUNCTION public.admin_get_kpi_training_task_summary IS
  'KPI Phase 4-B Final Corrections (M14): task_id別。eligible canonical, attempt dedup, identity key namespace.';

-- ---------------------------------------------------------------------------
-- 3. admin_get_kpi_training_step_funnel — step別ファンネル（Final Corrections）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_get_kpi_training_step_funnel(
  p_from              TIMESTAMPTZ,
  p_to                TIMESTAMPTZ,
  p_timezone          TEXT    DEFAULT 'Asia/Tokyo',
  p_include_internal  BOOLEAN DEFAULT false
)
RETURNS TABLE (
  task_id                     TEXT,
  training_kind               TEXT,
  move_id                     TEXT,
  move_index                  INT,
  step                        INT,
  total_steps                 INT,
  reached_runs                BIGINT,
  attempted_runs              BIGINT,
  attempt_events              BIGINT,
  incorrect_runs              BIGINT,
  incorrect_attempts          BIGINT,
  hinted_runs                 BIGINT,
  advanced_runs               BIGINT,
  completed_runs_at_step      BIGINT,
  continued_or_completed_runs BIGINT,
  active_incomplete_runs      BIGINT,
  abandoned_runs_at_step      BIGINT,
  progression_rate            NUMERIC,
  abandonment_rate_at_step    NUMERIC,
  share_of_task_abandonments  NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_official_start  TIMESTAMPTZ;
  v_effective_from  TIMESTAMPTZ;
  v_effective_as_of TIMESTAMPTZ;
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

  SELECT ks.official_kpi_start_at INTO v_official_start
  FROM public.kpi_settings ks WHERE ks.id = 1;

  v_effective_from  := CASE WHEN v_official_start IS NOT NULL
                        THEN GREATEST(p_from, v_official_start)
                        ELSE p_from END;
  -- [FIX-E]
  v_effective_as_of := LEAST(p_to, now());

  RETURN QUERY
  WITH

  -- [FIX-E] base_events: occurred_at < v_effective_as_of
  base_events AS (
    SELECT
      ke.id         AS event_id,
      ke.occurred_at,
      ke.event_name,
      ke.user_id,
      ke.properties->>'training_run_id' AS run_id,
      ke.properties->>'task_id'         AS task_id,
      ke.properties->>'step'            AS step_str,
      ke.properties->>'move_id'         AS move_id,
      ke.properties->>'move_index'      AS move_index_str,
      ke.properties->>'total_steps'     AS total_steps_str,
      ke.properties->>'from_step'       AS from_step_str,
      ke.route
    FROM public.kpi_events ke
    WHERE ke.environment = 'production'
      AND ke.event_name IN (
        'training_started','training_step_reached','training_attempted',
        'training_incorrect','training_hint_shown','training_step_advanced',
        'training_resumed','training_completed'
      )
      AND (ke.properties->>'training_run_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      AND ke.occurred_at < v_effective_as_of  -- [FIX-E]
  ),

  -- canonical_start
  canonical_start AS (
    SELECT DISTINCT ON (be.run_id)
      be.run_id,
      be.task_id,
      be.user_id,
      be.occurred_at AS started_at,
      be.route        AS start_route
    FROM base_events be
    WHERE be.event_name = 'training_started'
    ORDER BY be.run_id, be.occurred_at ASC, be.event_id ASC
  ),

  -- [FIX-D] eligible_canonical_runs
  eligible_canonical_runs AS (
    SELECT cs.*
    FROM canonical_start cs
    WHERE cs.start_route != '/ai-check-login'
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

  -- cohort_runs: eligible canonical runのうち、期間内に開始したもの
  -- [FIX-G] task_idはcanonical start.task_idを使用
  cohort_runs AS (
    SELECT
      ecr.run_id,
      ecr.task_id,
      ecr.user_id,
      ecr.started_at
    FROM eligible_canonical_runs ecr
    WHERE ecr.started_at >= v_effective_from
      AND ecr.started_at < p_to
  ),

  -- [FIX-H] canonical_completed: 同run_idの最初のtraining_completedのみ
  canonical_completed AS (
    SELECT DISTINCT ON (be.run_id)
      be.run_id,
      be.occurred_at AS completed_at
    FROM base_events be
    WHERE be.event_name = 'training_completed'
      AND EXISTS (SELECT 1 FROM eligible_canonical_runs ecr WHERE ecr.run_id = be.run_id)
    ORDER BY be.run_id, be.occurred_at ASC, be.event_id ASC
  ),

  last_activity AS (
    SELECT run_id, MAX(occurred_at) AS last_at
    FROM base_events GROUP BY run_id
  ),

  -- abandoned_runs: eligible canonical runsから
  abandoned_runs AS (
    SELECT cr.run_id, cr.task_id
    FROM cohort_runs cr
    LEFT JOIN canonical_completed cc USING (run_id)
    LEFT JOIN last_activity la USING (run_id)
    WHERE cc.completed_at IS NULL
      AND cr.started_at <= v_effective_as_of - INTERVAL '24 hours'
      AND COALESCE(la.last_at, cr.started_at) <= v_effective_as_of - INTERVAL '24 hours'
  ),

  -- [FIX-G] step_reached_canonical: eligible cohort runのreached eventをoccurred_at ASC, event_id ASCで最初の正常eventを採用
  -- canonical start.task_id / canonical reached.move_id / move_index / total_steps を返却
  step_reached_canonical AS (
    SELECT DISTINCT ON (be.run_id, be.step_str)
      be.run_id,
      cr.task_id,  -- [FIX-G] canonical start.task_idを使用
      be.step_str::INT                  AS step_num,
      be.move_id,                       -- canonical reached.move_id
      be.event_id,
      CASE WHEN be.move_index_str ~ '^[0-9]+$' THEN be.move_index_str::INT ELSE NULL END AS move_index_val,
      CASE WHEN be.total_steps_str ~ '^[0-9]+$' THEN be.total_steps_str::INT ELSE NULL END AS total_steps_val,
      be.occurred_at
    FROM base_events be
    JOIN cohort_runs cr ON cr.run_id = be.run_id  -- [FIX-D] eligible cohort runのみ
    WHERE be.event_name = 'training_step_reached'
      AND be.step_str ~ '^[0-9]+$'
    ORDER BY be.run_id, be.step_str, be.occurred_at ASC, be.event_id ASC  -- [FIX-G]
  ),

  -- [FIX-H] completed_step: canonical completed event 1件のみ、move_index + 1でstep解決
  -- [FIX-H] 同runのcanonical reached eventで同じmove_idが見つかればそのstepも照合
  -- [FIX-H] 矛盾時はcanonical reached側を優先
  completed_step AS (
    SELECT
      cc.run_id,
      COALESCE(
        -- canonical reached eventで同じmove_idが見つかる場合はそのstep_numを優先
        (SELECT src.step_num
         FROM step_reached_canonical src
         WHERE src.run_id = cc.run_id
           AND src.move_id = (
             SELECT be.move_id FROM base_events be
             WHERE be.run_id = cc.run_id
               AND be.event_name = 'training_completed'
               AND be.occurred_at = cc.completed_at
             LIMIT 1
           )
         ORDER BY src.occurred_at ASC, src.event_id ASC
         LIMIT 1),
        -- fallback: move_index + 1
        (SELECT
           CASE WHEN be.move_index_str ~ '^[0-9]+$'
                THEN (be.move_index_str::INT + 1)
                ELSE NULL END
         FROM base_events be
         WHERE be.run_id = cc.run_id
           AND be.event_name = 'training_completed'
           AND be.occurred_at = cc.completed_at
         LIMIT 1)
      ) AS step_num
    FROM canonical_completed cc
    JOIN cohort_runs cr USING (run_id)
  ),

  -- [FIX-F] last_step_per_abandoned: 時刻で決定 (occurred_at DESC, event_id DESC)
  last_step_per_abandoned AS (
    SELECT DISTINCT ON (ar.run_id)
      ar.run_id,
      ar.task_id,
      src.step_num
    FROM abandoned_runs ar
    JOIN step_reached_canonical src USING (run_id)
    ORDER BY ar.run_id, src.occurred_at DESC, src.event_id DESC  -- [FIX-F]
  ),

  -- [FIX-G] task_steps: eligible cohort runのreached eventからstep/metadataを抽出
  -- occurred_at ASC, event_id ASCで最初の正常eventを採用
  task_steps AS (
    SELECT DISTINCT
      src.task_id,
      src.step_num,
      (SELECT src2.move_id
       FROM step_reached_canonical src2
       JOIN cohort_runs cr ON cr.run_id = src2.run_id
       WHERE src2.task_id = src.task_id AND src2.step_num = src.step_num
         AND src2.move_id IS NOT NULL
       ORDER BY src2.occurred_at ASC, src2.event_id ASC
       LIMIT 1) AS move_id,
      (SELECT src2.move_index_val
       FROM step_reached_canonical src2
       JOIN cohort_runs cr ON cr.run_id = src2.run_id
       WHERE src2.task_id = src.task_id AND src2.step_num = src.step_num
         AND src2.move_index_val IS NOT NULL
       ORDER BY src2.occurred_at ASC, src2.event_id ASC
       LIMIT 1) AS move_index_val,
      (SELECT src2.total_steps_val
       FROM step_reached_canonical src2
       JOIN cohort_runs cr ON cr.run_id = src2.run_id
       WHERE src2.task_id = src.task_id AND src2.step_num = src.step_num
         AND src2.total_steps_val IS NOT NULL
       ORDER BY src2.occurred_at ASC, src2.event_id ASC
       LIMIT 1) AS total_steps_val
    FROM step_reached_canonical src
    INNER JOIN cohort_runs cr ON cr.run_id = src.run_id
  ),

  -- task total abandoned counts
  task_total_abandoned AS (
    SELECT ar.task_id, COUNT(*) AS total_abandoned
    FROM abandoned_runs ar GROUP BY ar.task_id
  ),

  -- active_runs: 完了・脱落以外
  active_runs AS (
    SELECT cr.run_id, cr.task_id
    FROM cohort_runs cr
    LEFT JOIN canonical_completed cc USING (run_id)
    LEFT JOIN abandoned_runs ar USING (run_id)
    WHERE cc.run_id IS NULL AND ar.run_id IS NULL
  ),

  -- [FIX-F] last_step_active: active runの最後に到達したstep（時刻で決定）
  last_step_active AS (
    SELECT DISTINCT ON (ar.run_id)
      ar.run_id,
      ar.task_id,
      src.step_num
    FROM active_runs ar
    JOIN step_reached_canonical src USING (run_id)
    ORDER BY ar.run_id, src.occurred_at DESC, src.event_id DESC  -- [FIX-F]
  )

  SELECT
    ts.task_id,
    CASE WHEN ts.task_id = 'full-game-v1' THEN 'full_game' ELSE 'individual' END,
    ts.move_id,
    ts.move_index_val,
    ts.step_num,
    ts.total_steps_val,
    -- reached_runs: eligible canonical runのみ
    (SELECT COUNT(DISTINCT src2.run_id)
     FROM step_reached_canonical src2
     JOIN cohort_runs cr2 ON cr2.run_id = src2.run_id
     WHERE src2.task_id = ts.task_id AND src2.step_num = ts.step_num)::BIGINT,
    -- attempted_runs
    (SELECT COUNT(DISTINCT be.run_id)
     FROM base_events be
     JOIN cohort_runs cr2 ON cr2.run_id = be.run_id
     WHERE be.event_name = 'training_attempted'
       AND cr2.task_id = ts.task_id
       AND be.step_str = ts.step_num::TEXT)::BIGINT,
    -- [FIX-C] attempt_events: training_attemptedのみ
    (SELECT COUNT(*)
     FROM base_events be
     JOIN cohort_runs cr2 ON cr2.run_id = be.run_id
     WHERE be.event_name = 'training_attempted'
       AND cr2.task_id = ts.task_id
       AND be.step_str = ts.step_num::TEXT)::BIGINT,
    -- incorrect_runs
    (SELECT COUNT(DISTINCT be.run_id)
     FROM base_events be
     JOIN cohort_runs cr2 ON cr2.run_id = be.run_id
     WHERE be.event_name = 'training_incorrect'
       AND cr2.task_id = ts.task_id
       AND be.step_str = ts.step_num::TEXT)::BIGINT,
    -- [FIX-C] incorrect_attempts: training_incorrectのみ
    (SELECT COUNT(*)
     FROM base_events be
     JOIN cohort_runs cr2 ON cr2.run_id = be.run_id
     WHERE be.event_name = 'training_incorrect'
       AND cr2.task_id = ts.task_id
       AND be.step_str = ts.step_num::TEXT)::BIGINT,
    -- hinted_runs
    (SELECT COUNT(DISTINCT be.run_id)
     FROM base_events be
     JOIN cohort_runs cr2 ON cr2.run_id = be.run_id
     WHERE be.event_name = 'training_hint_shown'
       AND cr2.task_id = ts.task_id
       AND be.step_str = ts.step_num::TEXT)::BIGINT,
    -- advanced_runs（from_step = this step）
    (SELECT COUNT(DISTINCT be.run_id)
     FROM base_events be
     JOIN cohort_runs cr2 ON cr2.run_id = be.run_id
     WHERE be.event_name = 'training_step_advanced'
       AND cr2.task_id = ts.task_id
       AND be.from_step_str = ts.step_num::TEXT)::BIGINT,
    -- [FIX-H] completed_runs_at_step: canonical completed event 1件のみ、二重計上なし
    (SELECT COUNT(DISTINCT cs2.run_id)
     FROM completed_step cs2
     JOIN cohort_runs cr2 ON cr2.run_id = cs2.run_id
     WHERE cs2.step_num = ts.step_num
       AND cr2.task_id = ts.task_id)::BIGINT,
    -- [FIX-H] continued_or_completed_runs: advanced UNION completed、二重計上なし
    (SELECT COUNT(*) FROM (
      SELECT be.run_id FROM base_events be JOIN cohort_runs cr2 ON cr2.run_id = be.run_id
      WHERE be.event_name = 'training_step_advanced'
        AND cr2.task_id = ts.task_id AND be.from_step_str = ts.step_num::TEXT
      UNION
      SELECT cs2.run_id FROM completed_step cs2
      JOIN cohort_runs cr2 ON cr2.run_id = cs2.run_id
      WHERE cs2.step_num = ts.step_num AND cr2.task_id = ts.task_id
    ) cont)::BIGINT,
    -- [FIX-F] active_incomplete_runs: 最後に到達したstepのみに帰属
    (SELECT COUNT(*)
     FROM last_step_active lsa
     WHERE lsa.task_id = ts.task_id AND lsa.step_num = ts.step_num)::BIGINT,
    -- abandoned_runs_at_step
    (SELECT COUNT(*)
     FROM last_step_per_abandoned lspa
     WHERE lspa.task_id = ts.task_id AND lspa.step_num = ts.step_num)::BIGINT,
    -- progression_rate
    CASE WHEN (
      SELECT COUNT(DISTINCT src2.run_id) FROM step_reached_canonical src2
      JOIN cohort_runs cr2 ON cr2.run_id = src2.run_id
      WHERE src2.task_id = ts.task_id AND src2.step_num = ts.step_num
    ) > 0
    THEN ROUND(
      (SELECT COUNT(*) FROM (
        SELECT be.run_id FROM base_events be JOIN cohort_runs cr2 ON cr2.run_id = be.run_id
        WHERE be.event_name = 'training_step_advanced' AND cr2.task_id = ts.task_id AND be.from_step_str = ts.step_num::TEXT
        UNION
        SELECT cs2.run_id FROM completed_step cs2 JOIN cohort_runs cr2 ON cr2.run_id = cs2.run_id
        WHERE cs2.step_num = ts.step_num AND cr2.task_id = ts.task_id
      ) cont)::NUMERIC
      / (SELECT COUNT(DISTINCT src2.run_id) FROM step_reached_canonical src2
         JOIN cohort_runs cr2 ON cr2.run_id = src2.run_id
         WHERE src2.task_id = ts.task_id AND src2.step_num = ts.step_num) * 100, 2)
    ELSE NULL END,
    -- abandonment_rate_at_step
    CASE WHEN (
      SELECT COUNT(DISTINCT src2.run_id) FROM step_reached_canonical src2
      JOIN cohort_runs cr2 ON cr2.run_id = src2.run_id
      WHERE src2.task_id = ts.task_id AND src2.step_num = ts.step_num
    ) > 0
    THEN ROUND(
      (SELECT COUNT(*) FROM last_step_per_abandoned lspa
       WHERE lspa.task_id = ts.task_id AND lspa.step_num = ts.step_num)::NUMERIC
      / (SELECT COUNT(DISTINCT src2.run_id) FROM step_reached_canonical src2
         JOIN cohort_runs cr2 ON cr2.run_id = src2.run_id
         WHERE src2.task_id = ts.task_id AND src2.step_num = ts.step_num) * 100, 2)
    ELSE NULL END,
    -- share_of_task_abandonments
    CASE WHEN (SELECT tta.total_abandoned FROM task_total_abandoned tta WHERE tta.task_id = ts.task_id) > 0
    THEN ROUND(
      (SELECT COUNT(*) FROM last_step_per_abandoned lspa
       WHERE lspa.task_id = ts.task_id AND lspa.step_num = ts.step_num)::NUMERIC
      / (SELECT tta.total_abandoned FROM task_total_abandoned tta WHERE tta.task_id = ts.task_id) * 100, 2)
    ELSE NULL END
  FROM task_steps ts
  ORDER BY ts.task_id, ts.step_num;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_kpi_training_step_funnel(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_kpi_training_step_funnel(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.admin_get_kpi_training_step_funnel(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_training_step_funnel(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN)
  TO service_role, postgres, authenticated;

COMMENT ON FUNCTION public.admin_get_kpi_training_step_funnel IS
  'KPI Phase 4-B Final Corrections (M14): step別ファンネル。eligible canonical, last step timing, canonical metadata, canonical completed dedup.';

-- ---------------------------------------------------------------------------
-- 4. admin_get_kpi_training_daily — 日次集計（Final Corrections）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_get_kpi_training_daily(
  p_from              TIMESTAMPTZ,
  p_to                TIMESTAMPTZ,
  p_timezone          TEXT    DEFAULT 'Asia/Tokyo',
  p_include_internal  BOOLEAN DEFAULT false
)
RETURNS TABLE (
  day                      DATE,
  started_runs             BIGINT,
  unique_starters          BIGINT,
  completion_events        BIGINT,
  cohort_completed_runs    BIGINT,
  abandoned_runs           BIGINT,
  attempt_events           BIGINT,
  incorrect_attempts       BIGINT,
  hinted_runs              BIGINT,
  full_game_started_runs   BIGINT,
  individual_started_runs  BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_official_start  TIMESTAMPTZ;
  v_effective_from  TIMESTAMPTZ;
  v_effective_as_of TIMESTAMPTZ;
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

  SELECT ks.official_kpi_start_at INTO v_official_start
  FROM public.kpi_settings ks WHERE ks.id = 1;

  v_effective_from  := CASE WHEN v_official_start IS NOT NULL
                        THEN GREATEST(p_from, v_official_start)
                        ELSE p_from END;
  -- [FIX-E]
  v_effective_as_of := LEAST(p_to, now());

  RETURN QUERY
  WITH

  -- [FIX-E] base_events: occurred_at < v_effective_as_of
  base_events AS (
    SELECT
      ke.id         AS event_id,
      ke.occurred_at,
      ke.event_name,
      ke.user_id,
      ke.anonymous_id,
      ke.properties->>'training_run_id' AS run_id,
      ke.properties->>'task_id'         AS task_id,
      ke.route
    FROM public.kpi_events ke
    WHERE ke.environment = 'production'
      AND ke.event_name IN (
        'training_started','training_step_reached','training_attempted',
        'training_incorrect','training_hint_shown','training_step_advanced',
        'training_resumed','training_completed'
      )
      AND (ke.properties->>'training_run_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      AND ke.occurred_at < v_effective_as_of  -- [FIX-E]
  ),

  -- canonical_start
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
    ORDER BY be.run_id, be.occurred_at ASC, be.event_id ASC
  ),

  -- [FIX-D][FIX-J] eligible_canonical_runs: 期間に関係なくInternal/AI除外を適用した共通集合
  eligible_canonical_runs AS (
    SELECT cs.*
    FROM canonical_start cs
    WHERE cs.start_route != '/ai-check-login'
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

  -- run_starts: eligible canonical runのみ
  run_starts AS (
    SELECT
      ecr.run_id,
      ecr.task_id,
      ecr.user_id,
      ecr.anonymous_id,
      ecr.started_at
    FROM eligible_canonical_runs ecr
  ),

  -- cohort_starts: 期間内に開始したeligible runs
  cohort_starts AS (
    SELECT
      rs.run_id,
      rs.task_id,
      rs.user_id,
      rs.anonymous_id,
      rs.started_at,
      (rs.started_at AT TIME ZONE p_timezone)::DATE AS start_day
    FROM run_starts rs
    WHERE rs.started_at >= v_effective_from AND rs.started_at < p_to
  ),

  -- [FIX-J] completed_runs: eligible canonical runのみ（Internal runのcompleted eventを除外）
  completed_runs AS (
    SELECT
      be.run_id,
      MIN(be.occurred_at) AS completed_at,
      (MIN(be.occurred_at) AT TIME ZONE p_timezone)::DATE AS complete_day
    FROM base_events be
    WHERE be.event_name = 'training_completed'
      AND EXISTS (SELECT 1 FROM eligible_canonical_runs ecr WHERE ecr.run_id = be.run_id)
    GROUP BY be.run_id
  ),

  last_activity AS (
    SELECT run_id, MAX(occurred_at) AS last_at
    FROM base_events GROUP BY run_id
  ),

  abandoned_cohort AS (
    SELECT cs.run_id, cs.start_day
    FROM cohort_starts cs
    LEFT JOIN completed_runs cr USING (run_id)
    LEFT JOIN last_activity la USING (run_id)
    WHERE cr.completed_at IS NULL
      AND cs.started_at <= v_effective_as_of - INTERVAL '24 hours'
      AND COALESCE(la.last_at, cs.started_at) <= v_effective_as_of - INTERVAL '24 hours'
  ),

  cohort_completed AS (
    SELECT cs.run_id, cs.start_day
    FROM cohort_starts cs
    JOIN completed_runs cr USING (run_id)
    WHERE cr.completed_at < v_effective_as_of
  ),

  -- [FIX-J] all_days: eligible start day ∪ eligible completion day のUNION
  -- Internal/AI runのcompleted eventにより日付行が追加されない
  all_days AS (
    SELECT DISTINCT (started_at AT TIME ZONE p_timezone)::DATE AS day
    FROM run_starts
    WHERE started_at >= v_effective_from AND started_at < p_to
    UNION
    SELECT DISTINCT complete_day AS day
    FROM completed_runs
    WHERE completed_at >= v_effective_from
      AND completed_at < v_effective_as_of
  )

  SELECT
    ad.day,
    -- started_runs
    COUNT(DISTINCT cs.run_id)::BIGINT AS started_runs,
    -- [FIX-K] unique_starters
    COUNT(DISTINCT
      CASE WHEN cs.user_id IS NOT NULL THEN 'u:' || cs.user_id::TEXT
           ELSE 'a:' || cs.anonymous_id::TEXT END)::BIGINT AS unique_starters,
    -- [FIX-J] completion_events: eligible canonical runのcompleted_at日で集計
    (SELECT COUNT(DISTINCT cr2.run_id)
     FROM completed_runs cr2
     WHERE cr2.complete_day = ad.day)::BIGINT AS completion_events,
    -- cohort_completed_runs
    COUNT(DISTINCT cc.run_id)::BIGINT AS cohort_completed_runs,
    -- abandoned_runs
    COUNT(DISTINCT ac.run_id)::BIGINT AS abandoned_runs,
    -- [FIX-C] attempt_events: training_attemptedのみ
    (SELECT COUNT(*)
     FROM base_events be
     WHERE be.event_name = 'training_attempted'
       AND be.run_id IN (SELECT cs2.run_id FROM cohort_starts cs2 WHERE cs2.start_day = ad.day))::BIGINT AS attempt_events,
    -- [FIX-C] incorrect_attempts: training_incorrectのみ
    (SELECT COUNT(*)
     FROM base_events be
     WHERE be.event_name = 'training_incorrect'
       AND be.run_id IN (SELECT cs2.run_id FROM cohort_starts cs2 WHERE cs2.start_day = ad.day))::BIGINT AS incorrect_attempts,
    -- hinted_runs
    (SELECT COUNT(DISTINCT be.run_id)
     FROM base_events be
     WHERE be.event_name = 'training_hint_shown'
       AND be.run_id IN (SELECT cs2.run_id FROM cohort_starts cs2 WHERE cs2.start_day = ad.day))::BIGINT AS hinted_runs,
    -- full_game_started_runs
    COUNT(DISTINCT CASE WHEN cs.task_id = 'full-game-v1' THEN cs.run_id END)::BIGINT AS full_game_started_runs,
    -- individual_started_runs
    COUNT(DISTINCT CASE WHEN cs.task_id != 'full-game-v1' THEN cs.run_id END)::BIGINT AS individual_started_runs
  FROM all_days ad
  LEFT JOIN cohort_starts cs ON cs.start_day = ad.day
  LEFT JOIN cohort_completed cc ON cc.run_id = cs.run_id
  LEFT JOIN abandoned_cohort ac ON ac.run_id = cs.run_id
  GROUP BY ad.day
  ORDER BY ad.day;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_kpi_training_daily(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_kpi_training_daily(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.admin_get_kpi_training_daily(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_training_daily(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN)
  TO service_role, postgres, authenticated;

COMMENT ON FUNCTION public.admin_get_kpi_training_daily IS
  'KPI Phase 4-B Final Corrections (M14): 日次集計。eligible canonical runs使用、Internal除外、attempt dedup、identity key namespace.';
