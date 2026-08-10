-- =============================================================================
-- 20260810000010_kpi_phase4b_training_aggregation.sql
-- KPI Phase 4-B: Training Aggregation RPCs
--
-- 追加RPC:
--   1. admin_get_kpi_training_summary       — 全体サマリー（1行）
--   2. admin_get_kpi_training_task_summary  — task_id別サマリー
--   3. admin_get_kpi_training_step_funnel   — step別ファンネル
--   4. admin_get_kpi_training_daily         — 日次集計
--
-- 共通設計:
--   - SECURITY DEFINER / SET search_path = ''
--   - public._kpi_require_admin() 必須
--   - environment='production' のみ
--   - route='/ai-check-login' 除外
--   - properties.training_run_id 単位で重複排除
--   - malformed training_run_id を安全に除外
--   - raw PII/identifier を返さない
--   - PUBLIC / anon から REVOKE
--   - service_role / postgres に明示 GRANT
--
-- 脱落定義 (24時間):
--   abandoned = training_started あり、training_completed なし、
--               started_at <= effective_as_of - 24h、
--               last_training_activity_at <= effective_as_of - 24h
--
-- official_kpi_start_at:
--   - 非NULL の場合: effective_from = GREATEST(p_from, official_kpi_start_at)
--   - NULL の場合: p_from をそのまま使い、is_reference_period=true で参考値として集計
--   - このmigrationでは official_kpi_start_at を設定・変更しない
--
-- 新規インデックス（既存と重複しない部分インデックス）:
--   - production training event の training_run_id
--   - production training event の task_id / occurred_at
--   - training_step_reached の task_id / step
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. 部分インデックス（既存と重複しないことを確認済み）
-- ---------------------------------------------------------------------------

-- training event の training_run_id 検索用（production のみ）
CREATE INDEX IF NOT EXISTS idx_kpi_events_training_run_id
  ON public.kpi_events ((properties->>'training_run_id'))
  WHERE environment = 'production'
    AND event_name IN (
      'training_started','training_step_reached','training_attempted',
      'training_incorrect','training_hint_shown','training_step_advanced',
      'training_resumed','training_completed'
    );

-- task_id / occurred_at 検索用（production training event のみ）
CREATE INDEX IF NOT EXISTS idx_kpi_events_training_task_occurred
  ON public.kpi_events ((properties->>'task_id'), occurred_at)
  WHERE environment = 'production'
    AND event_name IN (
      'training_started','training_step_reached','training_attempted',
      'training_incorrect','training_hint_shown','training_step_advanced',
      'training_resumed','training_completed'
    );

-- training_step_reached の task_id / step 検索用
CREATE INDEX IF NOT EXISTS idx_kpi_events_training_step_reached_task_step
  ON public.kpi_events ((properties->>'task_id'), (properties->>'step'))
  WHERE environment = 'production'
    AND event_name = 'training_step_reached';

-- ---------------------------------------------------------------------------
-- 1. admin_get_kpi_training_summary — 全体サマリー（1行）
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

  -- official_kpi_start_at
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

  -- 全 training event（production, valid UUID run_id のみ）
  base_events AS (
    SELECT
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
      -- valid UUID v4
      AND (ke.properties->>'training_run_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      -- AI確認経路除外
      AND COALESCE(ke.route, '') != '/ai-check-login'
      -- internal/admin 除外（p_include_internal=false の場合）
      AND (p_include_internal OR ke.user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles pr
        WHERE pr.id = ke.user_id
          AND (
            COALESCE(pr.is_admin, FALSE)
            OR COALESCE(pr.is_internal_test_account, FALSE)
            OR pr.internal_plan_override IS NOT NULL
          )
      ))
  ),

  -- training_started イベント（run の正本開始）
  started_events AS (
    SELECT
      run_id,
      task_id,
      user_id,
      anonymous_id,
      MIN(occurred_at) AS started_at,
      COUNT(*) AS started_count
    FROM base_events
    WHERE event_name = 'training_started'
    GROUP BY run_id, task_id, user_id, anonymous_id
  ),

  -- started cohort: effective_from 〜 p_to の間に started_at が収まる run
  cohort_runs AS (
    SELECT
      se.run_id,
      se.task_id,
      se.user_id,
      se.anonymous_id,
      se.started_at,
      se.started_count
    FROM started_events se
    WHERE se.started_at >= v_effective_from
      AND se.started_at < p_to
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
    SELECT
      run_id,
      MAX(occurred_at) AS last_at
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
        WHEN ce.completed_at IS NOT NULL THEN false  -- 完了済みは除外
        WHEN cr.started_at > v_effective_as_of - INTERVAL '24 hours' THEN false  -- 24h未満
        WHEN COALESCE(la.last_at, cr.started_at) > v_effective_as_of - INTERVAL '24 hours' THEN false  -- 最終活動24h未満
        ELSE true
      END AS is_abandoned
    FROM cohort_runs cr
    LEFT JOIN completed_events ce USING (run_id)
    LEFT JOIN last_activity la USING (run_id)
  ),

  -- 最後に到達した step（abandoned 用）
  last_step_reached AS (
    SELECT DISTINCT ON (run_id)
      run_id,
      (properties->>'step')::INT AS step_num
    FROM public.kpi_events ke
    WHERE ke.environment = 'production'
      AND ke.event_name = 'training_step_reached'
      AND (ke.properties->>'training_run_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      AND (ke.properties->>'step') ~ '^[0-9]+$'
    ORDER BY run_id, occurred_at DESC
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

  -- orphan events（training_started なしの run_id）
  orphan_agg AS (
    SELECT COUNT(DISTINCT be.run_id) AS orphan_cnt
    FROM base_events be
    WHERE NOT EXISTS (
      SELECT 1 FROM started_events se WHERE se.run_id = be.run_id
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
    -- unique_starters（PII なし：user_id または anonymous_id のユニーク数）
    (SELECT COUNT(*) FROM (
      SELECT COALESCE(cr.user_id::TEXT, cr.anonymous_id::TEXT) AS identity_key
      FROM cohort_runs cr
      GROUP BY COALESCE(cr.user_id::TEXT, cr.anonymous_id::TEXT)
    ) u)::BIGINT,
    -- completion_events_in_period
    (SELECT COUNT(DISTINCT ce.run_id) FROM completed_events ce
     JOIN base_events be ON be.run_id = ce.run_id
       AND be.event_name = 'training_completed'
       AND be.occurred_at >= v_effective_from AND be.occurred_at < p_to
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
    -- active_incomplete_runs（未完了、かつ abandonment 非確定）
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
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ea.elapsed_sec) FROM elapsed_agg ea),
    -- p95_elapsed_seconds
    (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY ea.elapsed_sec) FROM elapsed_agg ea),
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
    -- unknown_step_abandoned_runs（abandoned かつ step 到達記録なし）
    (SELECT COUNT(*) FROM cohort_with_status cws
     WHERE cws.is_abandoned
       AND NOT EXISTS (
         SELECT 1 FROM last_step_reached lsr WHERE lsr.run_id = cws.run_id
       ))::BIGINT,
    -- orphan_training_events
    (SELECT oa.orphan_cnt FROM orphan_agg oa),
    -- duplicate_started_runs
    (SELECT COUNT(*) FROM started_events se WHERE se.started_count > 1)::BIGINT,
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
  TO service_role, postgres;

COMMENT ON FUNCTION public.admin_get_kpi_training_summary IS
  'KPI Phase 4-B: Training 全体サマリー。Run cohort 単位集計。PIIなし。Admin のみ。';

-- ---------------------------------------------------------------------------
-- 2. admin_get_kpi_training_task_summary — task_id 別サマリー
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

  base_events AS (
    SELECT
      ke.occurred_at,
      ke.event_name,
      ke.user_id,
      ke.anonymous_id,
      ke.properties->>'training_run_id' AS run_id,
      ke.properties->>'task_id'         AS task_id
    FROM public.kpi_events ke
    WHERE ke.environment = 'production'
      AND ke.event_name IN (
        'training_started','training_step_reached','training_attempted',
        'training_incorrect','training_hint_shown','training_step_advanced',
        'training_resumed','training_completed'
      )
      AND (ke.properties->>'training_run_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      AND COALESCE(ke.route, '') != '/ai-check-login'
      AND (p_include_internal OR ke.user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles pr
        WHERE pr.id = ke.user_id
          AND (
            COALESCE(pr.is_admin, FALSE)
            OR COALESCE(pr.is_internal_test_account, FALSE)
            OR pr.internal_plan_override IS NOT NULL
          )
      ))
  ),

  -- run ごとの canonical task_id（training_started の task_id）
  started_runs AS (
    SELECT
      run_id,
      task_id,
      user_id,
      anonymous_id,
      MIN(occurred_at) AS started_at
    FROM base_events
    WHERE event_name = 'training_started'
    GROUP BY run_id, task_id, user_id, anonymous_id
  ),

  cohort_runs AS (
    SELECT * FROM started_runs
    WHERE started_at >= v_effective_from AND started_at < p_to
  ),

  completed_events AS (
    SELECT
      run_id,
      MIN(occurred_at) AS completed_at
    FROM base_events
    WHERE event_name = 'training_completed'
    GROUP BY run_id
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

  -- all task_ids from cohort starts + training_progress
  all_task_ids AS (
    SELECT DISTINCT task_id FROM cohort_runs
    UNION
    SELECT DISTINCT task_id FROM public.training_progress
    WHERE completed_at >= v_effective_from AND completed_at < p_to
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
    -- completion_events_in_period
    (SELECT COUNT(DISTINCT ce.run_id)
     FROM completed_events ce
     JOIN base_events be ON be.run_id = ce.run_id
       AND be.event_name = 'training_completed'
       AND be.occurred_at >= v_effective_from AND be.occurred_at < p_to
     JOIN cohort_runs cr ON cr.run_id = ce.run_id AND cr.task_id = ati.task_id
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
  TO service_role, postgres;

COMMENT ON FUNCTION public.admin_get_kpi_training_task_summary IS
  'KPI Phase 4-B: task_id 別 Training サマリー。task_id 順返却。PIIなし。Admin のみ。';

-- ---------------------------------------------------------------------------
-- 3. admin_get_kpi_training_step_funnel — task_id / step 別ファンネル
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

  base_events AS (
    SELECT
      ke.occurred_at,
      ke.event_name,
      ke.user_id,
      ke.properties->>'training_run_id' AS run_id,
      ke.properties->>'task_id'         AS task_id,
      ke.properties->>'step'            AS step_str,
      ke.properties->>'move_id'         AS move_id,
      ke.properties->>'move_index'      AS move_index_str,
      ke.properties->>'total_steps'     AS total_steps_str,
      ke.properties->>'from_step'       AS from_step_str
    FROM public.kpi_events ke
    WHERE ke.environment = 'production'
      AND ke.event_name IN (
        'training_started','training_step_reached','training_attempted',
        'training_incorrect','training_hint_shown','training_step_advanced',
        'training_resumed','training_completed'
      )
      AND (ke.properties->>'training_run_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      AND COALESCE(ke.route, '') != '/ai-check-login'
      AND (p_include_internal OR ke.user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles pr
        WHERE pr.id = ke.user_id
          AND (
            COALESCE(pr.is_admin, FALSE)
            OR COALESCE(pr.is_internal_test_account, FALSE)
            OR pr.internal_plan_override IS NOT NULL
          )
      ))
  ),

  -- cohort runs（training_started が期間内）
  cohort_runs AS (
    SELECT
      run_id,
      task_id,
      user_id,
      MIN(occurred_at) AS started_at
    FROM base_events
    WHERE event_name = 'training_started'
    GROUP BY run_id, task_id, user_id
    HAVING MIN(occurred_at) >= v_effective_from AND MIN(occurred_at) < p_to
  ),

  -- completed runs
  completed_events AS (
    SELECT run_id, MIN(occurred_at) AS completed_at
    FROM base_events WHERE event_name = 'training_completed'
    GROUP BY run_id
  ),

  -- last activity per run
  last_activity AS (
    SELECT run_id, MAX(occurred_at) AS last_at
    FROM base_events GROUP BY run_id
  ),

  -- abandoned runs
  abandoned_runs AS (
    SELECT cr.run_id, cr.task_id
    FROM cohort_runs cr
    LEFT JOIN completed_events ce USING (run_id)
    LEFT JOIN last_activity la USING (run_id)
    WHERE ce.completed_at IS NULL  -- 未完了
      AND cr.started_at <= v_effective_as_of - INTERVAL '24 hours'
      AND COALESCE(la.last_at, cr.started_at) <= v_effective_as_of - INTERVAL '24 hours'
  ),

  -- training_step_reached: canonical move_id / move_index / total_steps（最初の正常 event を採用）
  step_reached_canonical AS (
    SELECT DISTINCT ON (run_id, step_str)
      run_id,
      task_id,
      step_str::INT                 AS step_num,
      move_id,
      CASE WHEN move_index_str ~ '^[0-9]+$' THEN move_index_str::INT ELSE NULL END AS move_index_val,
      CASE WHEN total_steps_str ~ '^[0-9]+$' THEN total_steps_str::INT ELSE NULL END AS total_steps_val
    FROM base_events
    WHERE event_name = 'training_step_reached'
      AND step_str ~ '^[0-9]+$'
    ORDER BY run_id, step_str, occurred_at ASC
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

  -- distinct task/step combinations from step_reached (cohort)
  task_steps AS (
    SELECT DISTINCT
      src.task_id,
      src.step_num,
      MIN(src.move_id) AS move_id,
      MIN(src.move_index_val) AS move_index_val,
      MIN(src.total_steps_val) AS total_steps_val
    FROM step_reached_canonical src
    JOIN cohort_runs cr USING (run_id)
    GROUP BY src.task_id, src.step_num
  ),

  -- task total abandoned counts（for share_of_task_abandonments）
  task_total_abandoned AS (
    SELECT task_id, COUNT(*) AS total_abandoned
    FROM abandoned_runs GROUP BY task_id
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
    -- completed_runs_at_step（completed イベントの move_id が this step の move_id）
    (SELECT COUNT(DISTINCT be.run_id)
     FROM base_events be
     JOIN cohort_runs cr2 USING (run_id)
     WHERE be.event_name = 'training_completed'
       AND cr2.task_id = ts.task_id
       AND be.step_str = ts.step_num::TEXT)::BIGINT,
    -- continued_or_completed_runs（advanced UNION completed, no double-count）
    (SELECT COUNT(*) FROM (
      SELECT be.run_id FROM base_events be JOIN cohort_runs cr2 USING (run_id)
      WHERE be.event_name = 'training_step_advanced'
        AND cr2.task_id = ts.task_id AND be.from_step_str = ts.step_num::TEXT
      UNION
      SELECT be.run_id FROM base_events be JOIN cohort_runs cr2 USING (run_id)
      WHERE be.event_name = 'training_completed'
        AND cr2.task_id = ts.task_id AND be.step_str = ts.step_num::TEXT
    ) cont)::BIGINT,
    -- active_incomplete_runs（reached this step, not completed, not abandoned）
    (SELECT COUNT(DISTINCT src2.run_id)
     FROM step_reached_canonical src2
     JOIN cohort_runs cr2 USING (run_id)
     LEFT JOIN completed_events ce2 USING (run_id)
     LEFT JOIN abandoned_runs ar2 USING (run_id)
     WHERE src2.task_id = ts.task_id AND src2.step_num = ts.step_num
       AND ce2.run_id IS NULL AND ar2.run_id IS NULL)::BIGINT,
    -- abandoned_runs_at_step（正式 abandoned, drop-off step = this step）
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
        SELECT be.run_id FROM base_events be JOIN cohort_runs cr2 USING (run_id)
        WHERE be.event_name = 'training_completed' AND cr2.task_id = ts.task_id AND be.step_str = ts.step_num::TEXT
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
  TO service_role, postgres;

COMMENT ON FUNCTION public.admin_get_kpi_training_step_funnel IS
  'KPI Phase 4-B: task_id / step 別 Training ファンネル。PIIなし。Admin のみ。';

-- ---------------------------------------------------------------------------
-- 4. admin_get_kpi_training_daily — 日次集計
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
  v_effective_as_of := LEAST(p_to, now());

  RETURN QUERY
  WITH

  base_events AS (
    SELECT
      ke.occurred_at,
      ke.event_name,
      ke.user_id,
      ke.anonymous_id,
      ke.properties->>'training_run_id' AS run_id,
      ke.properties->>'task_id'         AS task_id
    FROM public.kpi_events ke
    WHERE ke.environment = 'production'
      AND ke.event_name IN (
        'training_started','training_step_reached','training_attempted',
        'training_incorrect','training_hint_shown','training_step_advanced',
        'training_resumed','training_completed'
      )
      AND (ke.properties->>'training_run_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      AND COALESCE(ke.route, '') != '/ai-check-login'
      AND (p_include_internal OR ke.user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles pr
        WHERE pr.id = ke.user_id
          AND (
            COALESCE(pr.is_admin, FALSE)
            OR COALESCE(pr.is_internal_test_account, FALSE)
            OR pr.internal_plan_override IS NOT NULL
          )
      ))
  ),

  -- run starts（per run, canonical started_at）
  run_starts AS (
    SELECT
      run_id,
      task_id,
      user_id,
      anonymous_id,
      MIN(occurred_at) AS started_at
    FROM base_events
    WHERE event_name = 'training_started'
    GROUP BY run_id, task_id, user_id, anonymous_id
  ),

  -- cohort（started_at が effective_from〜p_to）
  cohort_starts AS (
    SELECT
      run_id,
      task_id,
      user_id,
      anonymous_id,
      started_at,
      (started_at AT TIME ZONE p_timezone)::DATE AS start_day
    FROM run_starts
    WHERE started_at >= v_effective_from AND started_at < p_to
  ),

  -- completed events（completed_at の日）
  completed_runs AS (
    SELECT
      run_id,
      MIN(occurred_at) AS completed_at,
      (MIN(occurred_at) AT TIME ZONE p_timezone)::DATE AS complete_day
    FROM base_events
    WHERE event_name = 'training_completed'
    GROUP BY run_id
  ),

  -- last activity per run
  last_activity AS (
    SELECT run_id, MAX(occurred_at) AS last_at
    FROM base_events GROUP BY run_id
  ),

  -- abandoned runs（cohort 内）
  abandoned_cohort AS (
    SELECT cs.run_id, cs.start_day
    FROM cohort_starts cs
    LEFT JOIN completed_runs cr USING (run_id)
    LEFT JOIN last_activity la USING (run_id)
    WHERE cr.completed_at IS NULL
      AND cs.started_at <= v_effective_as_of - INTERVAL '24 hours'
      AND COALESCE(la.last_at, cs.started_at) <= v_effective_as_of - INTERVAL '24 hours'
  ),

  -- cohort completed（started in cohort, completed before effective_as_of）
  cohort_completed AS (
    SELECT cs.run_id, cs.start_day
    FROM cohort_starts cs
    JOIN completed_runs cr USING (run_id)
    WHERE cr.completed_at < v_effective_as_of
  )

  SELECT
    cs.start_day AS day,
    COUNT(DISTINCT cs.run_id)::BIGINT AS started_runs,
    COUNT(DISTINCT COALESCE(cs.user_id::TEXT, cs.anonymous_id::TEXT))::BIGINT AS unique_starters,
    -- completion_events: completed_at の日で集計
    (SELECT COUNT(DISTINCT cr2.run_id)
     FROM completed_runs cr2
     WHERE cr2.complete_day = cs.start_day)::BIGINT AS completion_events,
    -- cohort_completed_runs: started が同日の run の完了数
    COUNT(DISTINCT cc.run_id)::BIGINT AS cohort_completed_runs,
    -- abandoned_runs: started が同日の abandoned 数
    COUNT(DISTINCT ac.run_id)::BIGINT AS abandoned_runs,
    -- attempt_events
    (SELECT COUNT(*)
     FROM base_events be
     WHERE be.event_name = 'training_attempted'
       AND be.run_id IN (SELECT cs2.run_id FROM cohort_starts cs2 WHERE cs2.start_day = cs.start_day))::BIGINT AS attempt_events,
    -- incorrect_attempts
    (SELECT COUNT(*)
     FROM base_events be
     WHERE be.event_name = 'training_incorrect'
       AND be.run_id IN (SELECT cs2.run_id FROM cohort_starts cs2 WHERE cs2.start_day = cs.start_day))::BIGINT AS incorrect_attempts,
    -- hinted_runs
    (SELECT COUNT(DISTINCT be.run_id)
     FROM base_events be
     WHERE be.event_name = 'training_hint_shown'
       AND be.run_id IN (SELECT cs2.run_id FROM cohort_starts cs2 WHERE cs2.start_day = cs.start_day))::BIGINT AS hinted_runs,
    -- full_game_started_runs
    COUNT(DISTINCT CASE WHEN cs.task_id = 'full-game-v1' THEN cs.run_id END)::BIGINT AS full_game_started_runs,
    -- individual_started_runs
    COUNT(DISTINCT CASE WHEN cs.task_id != 'full-game-v1' THEN cs.run_id END)::BIGINT AS individual_started_runs
  FROM cohort_starts cs
  LEFT JOIN cohort_completed cc USING (run_id)
  LEFT JOIN abandoned_cohort ac USING (run_id)
  GROUP BY cs.start_day
  ORDER BY cs.start_day;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_kpi_training_daily(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_kpi_training_daily(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.admin_get_kpi_training_daily(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_training_daily(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN)
  TO service_role, postgres;

COMMENT ON FUNCTION public.admin_get_kpi_training_daily IS
  'KPI Phase 4-B: 日次 Training 集計。p_timezone に基づく日次行。PIIなし。Admin のみ。';
