-- =============================================================================
-- 20260810000012_kpi_phase4b_bugfix.sql
-- KPI Phase 4-B Bug Fix: 3 RPC の SQL バグ修正
--
-- Bug 1: admin_get_kpi_training_summary
--   last_step_reached CTE内で kpi_events.run_id カラム参照 → 存在しない
--   修正: ke.properties->>'training_run_id' AS run_id、DISTINCT ON も同式を使う
--
-- Bug 2: admin_get_kpi_training_task_summary
--   RETURNS TABLE (task_id TEXT, ...) とall_task_ids CTEの task_id が衝突 → ambiguous
--   修正: all_task_ids内のSELECTを cr.task_id / tp.task_id でテーブル修飾
--
-- Bug 3: admin_get_kpi_training_step_funnel
--   Bug 2 と同じ問題 (task_steps CTE内の task_id が衝突)
--   修正: task_steps内を src.task_id / cr.task_id でテーブル修飾
--
-- official_kpi_start_at: NULL 維持（変更SQL禁止）
-- 戻り型変更なし → CREATE OR REPLACE FUNCTION
-- raw ID / PII / 棋譜を返さない
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. admin_get_kpi_training_summary — Bug 1修正: last_step_reached の run_id
--    ベース: M11の全文をコピー、last_step_reached CTEのみ修正
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
  v_effective_as_of := LEAST(p_to, now());

  RETURN QUERY
  WITH

  -- [FIX-C] base_events: 状態判定用（occurred_at < v_effective_as_of に制限）
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
      AND ke.occurred_at < v_effective_as_of  -- [FIX-C] effective_as_of 境界
  ),

  -- [FIX-B] canonical_start: run_id ごとに最初の training_started を1件に確定
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

  -- [FIX-B] started_count_per_run: 重複started数を計測（diagnostic用）
  started_count_per_run AS (
    SELECT run_id, COUNT(*) AS started_count
    FROM base_events
    WHERE event_name = 'training_started'
    GROUP BY run_id
  ),

  -- [FIX-B] cohort_runs: canonical_start ベース、internal除外はcanonical startの属性で判断
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

  -- training_completed（同一 run_id の最小 occurred_at）
  completed_events AS (
    SELECT
      run_id,
      MIN(occurred_at) AS completed_at,
      COUNT(*) AS completed_count
    FROM base_events
    WHERE event_name = 'training_completed'
    GROUP BY run_id
  ),

  -- 各 run の最後の training_* 活動時刻
  last_activity AS (
    SELECT run_id, MAX(occurred_at) AS last_at
    FROM base_events
    GROUP BY run_id
  ),

  -- training_resumed（同一 run_id に 1 件以上）
  resumed_runs_set AS (
    SELECT DISTINCT run_id
    FROM base_events
    WHERE event_name = 'training_resumed'
  ),

  -- cohort に対して completed / abandoned を決定
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

  -- [BUG-1 FIX] last_step_reached: kpi_events に run_id カラムは存在しないため
  --   ke.properties->>'training_run_id' を使って DISTINCT ON する
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

  -- attempt イベント集計
  attempt_agg AS (
    SELECT
      COUNT(*) AS total_attempts,
      COUNT(*) FILTER (WHERE event_name = 'training_incorrect') AS incorrect_cnt
    FROM base_events be
    JOIN cohort_runs cr USING (run_id)
    WHERE be.event_name IN ('training_attempted', 'training_incorrect')
  ),

  -- elapsed_seconds（completed run の properties.elapsed_seconds）
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

  -- hinted runs（cohort 内）
  hinted_agg AS (
    SELECT COUNT(DISTINCT be.run_id) AS hinted_cnt
    FROM base_events be
    JOIN cohort_runs cr USING (run_id)
    WHERE be.event_name = 'training_hint_shown'
  ),

  -- 登録ユーザー初回 task 完了（training_progress.completed_at が期間内）
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

  -- orphan events（canonical training_started なしの run_id）
  orphan_agg AS (
    SELECT COUNT(DISTINCT be.run_id) AS orphan_cnt
    FROM base_events be
    WHERE NOT EXISTS (
      SELECT 1 FROM canonical_start cs WHERE cs.run_id = be.run_id
    )
  ),

  -- invalid training_run_id events（時刻制限なし：全期間）
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
    -- started_runs（cohort内のrun数）
    (SELECT COUNT(*) FROM cohort_runs)::BIGINT,
    -- unique_starters（PII なし：user_id または anonymous_id のユニーク数）
    (SELECT COUNT(*) FROM (
      SELECT COALESCE(cr.user_id::TEXT, cr.anonymous_id::TEXT) AS identity_key
      FROM cohort_runs cr
      GROUP BY COALESCE(cr.user_id::TEXT, cr.anonymous_id::TEXT)
    ) u)::BIGINT,
    -- [FIX-D] completion_events_in_period: canonical run のみ（orphan completedを除外）
    (SELECT COUNT(DISTINCT be.run_id)
     FROM base_events be
     WHERE be.event_name = 'training_completed'
       AND be.occurred_at >= v_effective_from
       AND be.occurred_at < v_effective_as_of
       AND EXISTS (
         SELECT 1 FROM canonical_start cs WHERE cs.run_id = be.run_id
       )
    )::BIGINT,
    -- cohort_completed_runs
    (SELECT COUNT(*) FROM cohort_with_status cws WHERE cws.is_completed)::BIGINT,
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
    (SELECT COUNT(*) FROM cohort_with_status cws WHERE cws.is_abandoned)::BIGINT,
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
    (SELECT COUNT(*) FROM cohort_with_status cws
     WHERE NOT cws.is_completed AND NOT cws.is_abandoned)::BIGINT,
    -- resumed_runs
    (SELECT COUNT(DISTINCT rr.run_id) FROM resumed_runs_set rr
     JOIN cohort_runs cr USING (run_id))::BIGINT,
    -- attempt_events
    (SELECT aa.total_attempts FROM attempt_agg aa),
    -- incorrect_attempts
    (SELECT aa.incorrect_cnt FROM attempt_agg aa),
    -- incorrect_rate
    CASE WHEN (SELECT aa.total_attempts FROM attempt_agg aa) > 0
      THEN ROUND((SELECT aa.incorrect_cnt FROM attempt_agg aa)::NUMERIC
                 / (SELECT aa.total_attempts FROM attempt_agg aa) * 100, 2)
      ELSE NULL END,
    -- hinted_runs
    (SELECT ha.hinted_cnt FROM hinted_agg ha),
    -- average_attempts_per_started_run
    CASE WHEN (SELECT COUNT(*) FROM cohort_runs) > 0
      THEN ROUND((SELECT aa.total_attempts FROM attempt_agg aa)::NUMERIC
                 / (SELECT COUNT(*) FROM cohort_runs), 2)
      ELSE NULL END,
    -- average_attempts_per_completed_run
    CASE WHEN (SELECT COUNT(*) FROM cohort_with_status WHERE is_completed) > 0
      THEN ROUND((SELECT COUNT(*) FROM base_events be
                  JOIN cohort_with_status cws USING (run_id)
                  WHERE be.event_name = 'training_attempted' AND cws.is_completed)::NUMERIC
                 / (SELECT COUNT(*) FROM cohort_with_status WHERE is_completed), 2)
      ELSE NULL END,
    -- average_elapsed_seconds
    (SELECT ROUND(AVG(ea.elapsed_sec), 2) FROM elapsed_agg ea),
    -- median_elapsed_seconds
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ea.elapsed_sec)::NUMERIC FROM elapsed_agg ea),
    -- p95_elapsed_seconds
    (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY ea.elapsed_sec)::NUMERIC FROM elapsed_agg ea),
    -- full_game_started_runs
    (SELECT COUNT(*) FROM cohort_runs cr WHERE cr.task_id = 'full-game-v1')::BIGINT,
    -- full_game_completed_runs
    (SELECT COUNT(*) FROM cohort_with_status cws WHERE cws.task_id = 'full-game-v1' AND cws.is_completed)::BIGINT,
    -- individual_started_runs
    (SELECT COUNT(*) FROM cohort_runs cr WHERE cr.task_id != 'full-game-v1')::BIGINT,
    -- individual_completed_runs
    (SELECT COUNT(*) FROM cohort_with_status cws WHERE cws.task_id != 'full-game-v1' AND cws.is_completed)::BIGINT,
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
    -- [FIX-B] duplicate_started_runs: run_id単位でstartedが2件以上
    (SELECT COUNT(DISTINCT run_id) FROM started_count_per_run WHERE started_count > 1)::BIGINT,
    -- duplicate_completed_runs
    (SELECT COUNT(*) FROM completed_events ce WHERE ce.completed_count > 1)::BIGINT,
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
  'KPI Phase 4-B Bugfix (M12): Bug1修正 last_step_reachedのrun_id列参照をproperties->>training_run_id に修正。';

-- ---------------------------------------------------------------------------
-- 2. admin_get_kpi_training_task_summary — Bug 2修正: task_id ambiguity
--    ベース: M11の全文をコピー、all_task_ids CTEのSELECTをテーブル修飾
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
  v_effective_as_of := LEAST(p_to, now());

  RETURN QUERY
  WITH

  -- [FIX-C] base_events: occurred_at < v_effective_as_of
  base_events AS (
    SELECT
      ke.id,
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
      AND ke.occurred_at < v_effective_as_of  -- [FIX-C]
  ),

  -- [FIX-B] canonical_start
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

  -- [FIX-B] cohort_runs: canonical_start ベース + internal除外
  cohort_runs AS (
    SELECT
      cs.run_id,
      cs.task_id,
      cs.user_id,
      cs.anonymous_id,
      cs.started_at
    FROM canonical_start cs
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
    SELECT be.run_id, MIN(be.occurred_at) AS completed_at
    FROM base_events be
    WHERE be.event_name = 'training_completed'
    GROUP BY be.run_id
  ),

  last_activity AS (
    SELECT be.run_id, MAX(be.occurred_at) AS last_at
    FROM base_events be GROUP BY be.run_id
  ),

  cohort_status AS (
    SELECT
      cr.run_id,
      cr.task_id,
      cr.user_id,
      cr.anonymous_id,
      cr.started_at,
      ce.completed_at,
      la.last_at AS last_activity_at,
      CASE WHEN ce.completed_at IS NOT NULL AND ce.completed_at < v_effective_as_of
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

  -- [BUG-2 FIX] all_task_ids: cr.task_id / tp.task_id でテーブル修飾してRETURNS TABLE列名との衝突を回避
  -- [FIX-H] training_progress にも internal 除外を適用
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
    -- unique_starters
    (SELECT COUNT(*) FROM (
       SELECT COALESCE(cr.user_id::TEXT, cr.anonymous_id::TEXT)
       FROM cohort_runs cr WHERE cr.task_id = ati.task_id
       GROUP BY COALESCE(cr.user_id::TEXT, cr.anonymous_id::TEXT)
    ) u)::BIGINT,
    -- [FIX-D] completion_events_in_period: canonical run のみ
    (SELECT COUNT(DISTINCT be.run_id)
     FROM base_events be
     WHERE be.event_name = 'training_completed'
       AND be.occurred_at >= v_effective_from
       AND be.occurred_at < v_effective_as_of
       AND EXISTS (SELECT 1 FROM canonical_start cs WHERE cs.run_id = be.run_id AND cs.task_id = ati.task_id)
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
    -- attempt_events
    (SELECT COUNT(*)
     FROM base_events be
     JOIN cohort_runs cr USING (run_id)
     WHERE be.event_name = 'training_attempted' AND cr.task_id = ati.task_id)::BIGINT,
    -- incorrect_attempts
    (SELECT COUNT(*)
     FROM base_events be
     JOIN cohort_runs cr USING (run_id)
     WHERE be.event_name = 'training_incorrect' AND cr.task_id = ati.task_id)::BIGINT,
    -- incorrect_rate
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
    -- average_attempts_per_started_run
    CASE WHEN (SELECT COUNT(*) FROM cohort_runs cr WHERE cr.task_id = ati.task_id) > 0
      THEN ROUND(
        (SELECT COUNT(*) FROM base_events be JOIN cohort_runs cr USING (run_id)
         WHERE be.event_name = 'training_attempted' AND cr.task_id = ati.task_id)::NUMERIC
        / (SELECT COUNT(*) FROM cohort_runs cr WHERE cr.task_id = ati.task_id), 2)
      ELSE NULL END,
    -- average_attempts_per_completed_run
    CASE WHEN (SELECT COUNT(*) FROM cohort_status cs WHERE cs.task_id = ati.task_id AND cs.is_completed) > 0
      THEN ROUND(
        (SELECT COUNT(*) FROM base_events be JOIN cohort_status cs USING (run_id)
         WHERE be.event_name = 'training_attempted' AND cs.task_id = ati.task_id AND cs.is_completed)::NUMERIC
        / (SELECT COUNT(*) FROM cohort_status cs WHERE cs.task_id = ati.task_id AND cs.is_completed), 2)
      ELSE NULL END,
    -- average_elapsed_seconds
    (SELECT ROUND(AVG((ke.properties->>'elapsed_seconds')::NUMERIC), 2)
     FROM public.kpi_events ke
     JOIN cohort_status cs ON cs.run_id = (ke.properties->>'training_run_id')
     WHERE ke.environment = 'production'
       AND ke.event_name = 'training_completed'
       AND cs.task_id = ati.task_id
       AND cs.is_completed
       AND (ke.properties->>'elapsed_seconds') ~ '^[0-9]+(\.[0-9]+)?$'),
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
  'KPI Phase 4-B Bugfix (M12): Bug2修正 all_task_ids内のSELECTをcr.task_id/tp.task_idでテーブル修飾してambiguity解消。';

-- ---------------------------------------------------------------------------
-- 3. admin_get_kpi_training_step_funnel — Bug 3修正: task_id ambiguity
--    ベース: M11の全文をコピー、task_steps CTEのSELECTをテーブル修飾
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
  v_effective_as_of := LEAST(p_to, now());

  RETURN QUERY
  WITH

  -- [FIX-C] base_events: occurred_at < v_effective_as_of、move_index追加
  base_events AS (
    SELECT
      ke.id,
      ke.occurred_at,
      ke.event_name,
      ke.user_id,
      ke.anonymous_id,
      ke.properties->>'training_run_id' AS run_id,
      ke.properties->>'task_id'         AS task_id,
      ke.properties->>'step'            AS step_str,
      ke.properties->>'move_id'         AS move_id,
      ke.properties->>'move_index'      AS move_index_str,  -- [FIX-E]
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
      AND ke.occurred_at < v_effective_as_of  -- [FIX-C]
  ),

  -- [FIX-B] canonical_start
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

  -- cohort_runs: canonical_start ベース + internal除外
  cohort_runs AS (
    SELECT
      cs.run_id,
      cs.task_id,
      cs.user_id,
      cs.anonymous_id,
      cs.started_at
    FROM canonical_start cs
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
    SELECT be.run_id, MIN(be.occurred_at) AS completed_at
    FROM base_events be WHERE be.event_name = 'training_completed'
    GROUP BY be.run_id
  ),

  last_activity AS (
    SELECT be.run_id, MAX(be.occurred_at) AS last_at
    FROM base_events be GROUP BY be.run_id
  ),

  abandoned_runs AS (
    SELECT cr.run_id, cr.task_id
    FROM cohort_runs cr
    LEFT JOIN completed_events ce USING (run_id)
    LEFT JOIN last_activity la USING (run_id)
    WHERE ce.completed_at IS NULL
      AND cr.started_at <= v_effective_as_of - INTERVAL '24 hours'
      AND COALESCE(la.last_at, cr.started_at) <= v_effective_as_of - INTERVAL '24 hours'
  ),

  -- training_step_reached: canonical move_id / move_index / total_steps
  step_reached_canonical AS (
    SELECT DISTINCT ON (src_be.run_id, src_be.step_str)
      src_be.run_id,
      src_be.task_id,
      src_be.step_str::INT                 AS step_num,
      src_be.move_id,
      CASE WHEN src_be.move_index_str ~ '^[0-9]+$' THEN src_be.move_index_str::INT ELSE NULL END AS move_index_val,
      CASE WHEN src_be.total_steps_str ~ '^[0-9]+$' THEN src_be.total_steps_str::INT ELSE NULL END AS total_steps_val,
      src_be.occurred_at
    FROM base_events src_be
    WHERE src_be.event_name = 'training_step_reached'
      AND src_be.step_str ~ '^[0-9]+$'
    ORDER BY src_be.run_id, src_be.step_str, src_be.occurred_at ASC
  ),

  -- [FIX-E] completed_step: move_index + 1 でstepを解決
  completed_step AS (
    SELECT
      be.run_id,
      CASE
        WHEN be.move_index_str ~ '^[0-9]+$'
          THEN (be.move_index_str::INT + 1)
        ELSE NULL
      END AS step_num
    FROM base_events be
    WHERE be.event_name = 'training_completed'
  ),

  -- last step reached per abandoned run
  last_step_per_abandoned AS (
    SELECT DISTINCT ON (ar.run_id)
      ar.run_id,
      ar.task_id,
      src.step_num
    FROM abandoned_runs ar
    JOIN step_reached_canonical src USING (run_id)
    ORDER BY ar.run_id, src.step_num DESC
  ),

  -- [BUG-3 FIX] task_steps: src.task_id / cr.task_id でテーブル修飾してRETURNS TABLE列名との衝突を回避
  task_steps AS (
    SELECT DISTINCT
      src.task_id,
      src.step_num,
      MIN(src.move_id)            AS move_id,
      MIN(src.move_index_val)     AS move_index_val,
      MIN(src.total_steps_val)    AS total_steps_val
    FROM step_reached_canonical src
    JOIN cohort_runs cr USING (run_id)
    GROUP BY src.task_id, src.step_num
  ),

  -- task total abandoned counts
  task_total_abandoned AS (
    SELECT ar.task_id, COUNT(*) AS total_abandoned
    FROM abandoned_runs ar GROUP BY ar.task_id
  ),

  -- [FIX-F] active_runs: 完了・脱落以外
  active_runs AS (
    SELECT cr.run_id, cr.task_id
    FROM cohort_runs cr
    LEFT JOIN completed_events ce USING (run_id)
    LEFT JOIN abandoned_runs ar USING (run_id)
    WHERE ce.run_id IS NULL AND ar.run_id IS NULL
  ),

  -- [FIX-F] last_step_active: active runの最後に到達したstep
  last_step_active AS (
    SELECT DISTINCT ON (ar.run_id)
      ar.run_id,
      ar.task_id,
      src.step_num
    FROM active_runs ar
    JOIN step_reached_canonical src USING (run_id)
    ORDER BY ar.run_id, src.step_num DESC, src.occurred_at DESC
  )

  SELECT
    ts.task_id,
    CASE WHEN ts.task_id = 'full-game-v1' THEN 'full_game' ELSE 'individual' END,
    ts.move_id,
    ts.move_index_val,
    ts.step_num,
    ts.total_steps_val,
    -- reached_runs
    (SELECT COUNT(DISTINCT src2.run_id)
     FROM step_reached_canonical src2
     JOIN cohort_runs cr2 USING (run_id)
     WHERE src2.task_id = ts.task_id AND src2.step_num = ts.step_num)::BIGINT,
    -- attempted_runs
    (SELECT COUNT(DISTINCT be.run_id)
     FROM base_events be
     JOIN cohort_runs cr2 USING (run_id)
     WHERE be.event_name = 'training_attempted'
       AND cr2.task_id = ts.task_id
       AND be.step_str = ts.step_num::TEXT)::BIGINT,
    -- attempt_events
    (SELECT COUNT(*)
     FROM base_events be
     JOIN cohort_runs cr2 USING (run_id)
     WHERE be.event_name = 'training_attempted'
       AND cr2.task_id = ts.task_id
       AND be.step_str = ts.step_num::TEXT)::BIGINT,
    -- incorrect_runs
    (SELECT COUNT(DISTINCT be.run_id)
     FROM base_events be
     JOIN cohort_runs cr2 USING (run_id)
     WHERE be.event_name = 'training_incorrect'
       AND cr2.task_id = ts.task_id
       AND be.step_str = ts.step_num::TEXT)::BIGINT,
    -- incorrect_attempts
    (SELECT COUNT(*)
     FROM base_events be
     JOIN cohort_runs cr2 USING (run_id)
     WHERE be.event_name = 'training_incorrect'
       AND cr2.task_id = ts.task_id
       AND be.step_str = ts.step_num::TEXT)::BIGINT,
    -- hinted_runs
    (SELECT COUNT(DISTINCT be.run_id)
     FROM base_events be
     JOIN cohort_runs cr2 USING (run_id)
     WHERE be.event_name = 'training_hint_shown'
       AND cr2.task_id = ts.task_id
       AND be.step_str = ts.step_num::TEXT)::BIGINT,
    -- advanced_runs（from_step = this step）
    (SELECT COUNT(DISTINCT be.run_id)
     FROM base_events be
     JOIN cohort_runs cr2 USING (run_id)
     WHERE be.event_name = 'training_step_advanced'
       AND cr2.task_id = ts.task_id
       AND be.from_step_str = ts.step_num::TEXT)::BIGINT,
    -- [FIX-E] completed_runs_at_step: move_index+1で解決
    (SELECT COUNT(DISTINCT cs2.run_id)
     FROM completed_step cs2
     JOIN cohort_runs cr2 USING (run_id)
     WHERE cs2.step_num = ts.step_num
       AND cr2.task_id = ts.task_id)::BIGINT,
    -- [FIX-I] continued_or_completed_runs: advanced UNION completed（最終stepで必ずcompletedを含む）
    (SELECT COUNT(*) FROM (
      SELECT be.run_id FROM base_events be JOIN cohort_runs cr2 USING (run_id)
      WHERE be.event_name = 'training_step_advanced'
        AND cr2.task_id = ts.task_id AND be.from_step_str = ts.step_num::TEXT
      UNION
      SELECT cs2.run_id FROM completed_step cs2
      JOIN cohort_runs cr2 USING (run_id)
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
      JOIN cohort_runs cr2 USING (run_id)
      WHERE src2.task_id = ts.task_id AND src2.step_num = ts.step_num
    ) > 0
    THEN ROUND(
      (SELECT COUNT(*) FROM (
        SELECT be.run_id FROM base_events be JOIN cohort_runs cr2 USING (run_id)
        WHERE be.event_name = 'training_step_advanced' AND cr2.task_id = ts.task_id AND be.from_step_str = ts.step_num::TEXT
        UNION
        SELECT cs2.run_id FROM completed_step cs2 JOIN cohort_runs cr2 USING (run_id)
        WHERE cs2.step_num = ts.step_num AND cr2.task_id = ts.task_id
      ) cont)::NUMERIC
      / (SELECT COUNT(DISTINCT src2.run_id) FROM step_reached_canonical src2
         JOIN cohort_runs cr2 USING (run_id)
         WHERE src2.task_id = ts.task_id AND src2.step_num = ts.step_num) * 100, 2)
    ELSE NULL END,
    -- abandonment_rate_at_step
    CASE WHEN (
      SELECT COUNT(DISTINCT src2.run_id) FROM step_reached_canonical src2
      JOIN cohort_runs cr2 USING (run_id)
      WHERE src2.task_id = ts.task_id AND src2.step_num = ts.step_num
    ) > 0
    THEN ROUND(
      (SELECT COUNT(*) FROM last_step_per_abandoned lspa
       WHERE lspa.task_id = ts.task_id AND lspa.step_num = ts.step_num)::NUMERIC
      / (SELECT COUNT(DISTINCT src2.run_id) FROM step_reached_canonical src2
         JOIN cohort_runs cr2 USING (run_id)
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
  'KPI Phase 4-B Bugfix (M12): Bug3修正 task_steps内のSELECTをsrc.task_id/cr.task_idでテーブル修飾してambiguity解消。';
