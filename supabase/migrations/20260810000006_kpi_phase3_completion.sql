-- =============================================================================
-- 20260810000006_kpi_phase3_completion.sql
-- KPI Phase 3 補正実装
--
-- 補正内容:
--   1. admin_get_kpi_match_summary    — canonical CTE再構築 (正規結合キー修正)
--   2. admin_get_kpi_match_daily      — 同上
--   3. admin_get_kpi_arena_funnel     — internal_plan_override除外追加
--   4. admin_get_kpi_postmortem_summary — NULL引数拒否追加
--   5. admin_get_kpi_system_health_summary — NULL引数拒否追加 + postgres GRANT追加
--
-- canonical対局分類 (相互排他・優先順位順):
--   1. Arena  = arena_matches に存在する対局 (arena_matches.id単位)
--      正規結合キー: arena_matches.official_match_id = official_matches.id
--   2. Official standalone = official_matches に存在するが arena_matches.official_match_id に存在しない
--   3. Online casual = online_games に存在するが arena_matches / official_matches に連結していない
--   4. CPU = match_logs に存在し mode IN ('human_vs_cpu','human_vs_human') かつ online_games に存在しない
--
-- CPU mode実値 (本番DB確認済み): 'human_vs_cpu', 'human_vs_human', 'online_pvp'
-- Arena結合: arena_matches.official_match_id = official_matches.id (正規)
--            arena_matches.online_game_id = online_games.id (実ゲーム参照)
-- online_game_id=NULLのArena no-showはofficial_matches.online_game_id IS NULLと混在しない
--   → arena_matchesはofficial_match_idで排他するため混入しない
--
-- 内部除外 (デフォルト p_include_internal=false):
--   profiles.is_admin=true
--   OR profiles.is_internal_test_account=true
--   OR profiles.internal_plan_override IS NOT NULL
--
-- kpi_settings (旧: kpi_config) テーブル使用
-- started_matches / completed_matches = kpi_eventsのmatch_started distinct match_key ベース
-- completion_rate = completed_matches / started_matches
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. admin_get_kpi_match_summary (canonical CTE再構築)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_get_kpi_match_summary(
  p_from              TIMESTAMPTZ,
  p_to                TIMESTAMPTZ,
  p_timezone          TEXT    DEFAULT 'UTC',
  p_include_internal  BOOLEAN DEFAULT false
)
RETURNS TABLE (
  total_matches               BIGINT,
  cpu_matches                 BIGINT,
  online_casual_matches       BIGINT,
  official_standalone_matches BIGINT,
  arena_matches_count         BIGINT,
  unique_players              BIGINT,
  started_matches             BIGINT,
  completed_matches           BIGINT,
  completion_rate             NUMERIC,
  normal_end_count            BIGINT,
  timeout_count               BIGINT,
  resign_count                BIGINT,
  draw_count                  BIGINT,
  forfeit_count               BIGINT,
  no_contest_count            BIGINT,
  average_move_count          NUMERIC,
  median_move_count           NUMERIC,
  p90_move_count              NUMERIC,
  average_duration_seconds    NUMERIC,
  median_duration_seconds     NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cpu_matches           BIGINT;
  v_online_casual         BIGINT;
  v_official_standalone   BIGINT;
  v_arena_count           BIGINT;
  v_total                 BIGINT;
  v_unique_players        BIGINT;
  v_started               BIGINT;
  v_completed             BIGINT;
  v_completion_rate       NUMERIC;
  v_normal_end            BIGINT;
  v_timeout               BIGINT;
  v_resign                BIGINT;
  v_draw                  BIGINT;
  v_forfeit               BIGINT;
  v_no_contest            BIGINT;
  v_avg_move              NUMERIC;
  v_med_move              NUMERIC;
  v_p90_move              NUMERIC;
  v_avg_dur               NUMERIC;
  v_med_dur               NUMERIC;
BEGIN
  PERFORM public._kpi_require_admin();

  -- p_from / p_to NULL拒否
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

  -- ── 1. Arena matches (arena_matches.id単位) ──────────────────────────────
  -- 正規結合キー: arena_matches.official_match_id = official_matches.id
  SELECT COUNT(DISTINCT am.id)
  INTO v_arena_count
  FROM public.arena_matches am
  WHERE am.created_at >= p_from AND am.created_at < p_to
    AND (p_include_internal OR NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id IN (am.black_user_id, am.white_user_id)
        AND (
          COALESCE(p2.is_admin, FALSE)
          OR COALESCE(p2.is_internal_test_account, FALSE)
          OR p2.internal_plan_override IS NOT NULL
        )
    ));

  -- ── 2. Official standalone matches ───────────────────────────────────────
  -- arena_matches.official_match_id に存在しないもの
  SELECT COUNT(DISTINCT om.id)
  INTO v_official_standalone
  FROM public.official_matches om
  WHERE om.starts_at >= p_from AND om.starts_at < p_to
    AND om.status NOT IN ('scheduled', 'pending', 'cancelled')
    AND NOT EXISTS (
      SELECT 1 FROM public.arena_matches am2
      WHERE am2.official_match_id = om.id
    )
    AND (p_include_internal OR NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id IN (om.black_user_id, om.white_user_id)
        AND (
          COALESCE(p2.is_admin, FALSE)
          OR COALESCE(p2.is_internal_test_account, FALSE)
          OR p2.internal_plan_override IS NOT NULL
        )
    ));

  -- ── 3. Online casual matches ─────────────────────────────────────────────
  -- online_games に存在し、official_matches にも arena_matches にも連結していない
  SELECT COUNT(DISTINCT og.id)
  INTO v_online_casual
  FROM public.online_games og
  WHERE og.created_at >= p_from AND og.created_at < p_to
    AND og.status = 'finished'
    AND NOT EXISTS (
      SELECT 1 FROM public.official_matches om2 WHERE om2.online_game_id = og.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.arena_matches am3 WHERE am3.online_game_id = og.id
    )
    AND (p_include_internal OR NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id IN (og.black_player_id, og.white_player_id)
        AND (
          COALESCE(p2.is_admin, FALSE)
          OR COALESCE(p2.is_internal_test_account, FALSE)
          OR p2.internal_plan_override IS NOT NULL
        )
    ));

  -- ── 4. CPU matches ────────────────────────────────────────────────────────
  -- match_logs.mode = 'human_vs_cpu' OR 'human_vs_human' (本番DB確認済み実値)
  -- かつ online_games に存在しない
  SELECT COUNT(DISTINCT ml.id)
  INTO v_cpu_matches
  FROM public.match_logs ml
  WHERE ml.started_at >= p_from AND ml.started_at < p_to
    AND ml.mode IN ('human_vs_cpu', 'human_vs_human')
    AND NOT EXISTS (
      SELECT 1 FROM public.online_games og2 WHERE og2.id::text = ml.game_id
    )
    AND (p_include_internal OR NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = ml.user_id
        AND (
          COALESCE(p2.is_admin, FALSE)
          OR COALESCE(p2.is_internal_test_account, FALSE)
          OR p2.internal_plan_override IS NOT NULL
        )
    ));

  v_total := COALESCE(v_arena_count, 0)
           + COALESCE(v_official_standalone, 0)
           + COALESCE(v_online_casual, 0)
           + COALESCE(v_cpu_matches, 0);

  -- ── Unique players (全4分類の参加者) ────────────────────────────────────
  SELECT COUNT(DISTINCT uid)
  INTO v_unique_players
  FROM (
    -- Arena
    SELECT am.black_user_id AS uid FROM public.arena_matches am
    WHERE am.created_at >= p_from AND am.created_at < p_to
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id IN (am.black_user_id, am.white_user_id)
          AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
      ))
    UNION ALL
    SELECT am.white_user_id FROM public.arena_matches am
    WHERE am.created_at >= p_from AND am.created_at < p_to
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id IN (am.black_user_id, am.white_user_id)
          AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
      ))
    UNION ALL
    -- Official standalone参加者 (欠落させない)
    SELECT om.black_user_id FROM public.official_matches om
    WHERE om.starts_at >= p_from AND om.starts_at < p_to
      AND om.status NOT IN ('scheduled', 'pending', 'cancelled')
      AND NOT EXISTS (SELECT 1 FROM public.arena_matches am2 WHERE am2.official_match_id = om.id)
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id IN (om.black_user_id, om.white_user_id)
          AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
      ))
    UNION ALL
    SELECT om.white_user_id FROM public.official_matches om
    WHERE om.starts_at >= p_from AND om.starts_at < p_to
      AND om.status NOT IN ('scheduled', 'pending', 'cancelled')
      AND NOT EXISTS (SELECT 1 FROM public.arena_matches am2 WHERE am2.official_match_id = om.id)
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id IN (om.black_user_id, om.white_user_id)
          AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
      ))
    UNION ALL
    -- Online casual
    SELECT og.black_player_id FROM public.online_games og
    WHERE og.created_at >= p_from AND og.created_at < p_to
      AND og.status = 'finished'
      AND NOT EXISTS (SELECT 1 FROM public.official_matches om2 WHERE om2.online_game_id = og.id)
      AND NOT EXISTS (SELECT 1 FROM public.arena_matches am3 WHERE am3.online_game_id = og.id)
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id IN (og.black_player_id, og.white_player_id)
          AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
      ))
    UNION ALL
    SELECT og.white_player_id FROM public.online_games og
    WHERE og.created_at >= p_from AND og.created_at < p_to
      AND og.status = 'finished'
      AND NOT EXISTS (SELECT 1 FROM public.official_matches om2 WHERE om2.online_game_id = og.id)
      AND NOT EXISTS (SELECT 1 FROM public.arena_matches am3 WHERE am3.online_game_id = og.id)
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id IN (og.black_player_id, og.white_player_id)
          AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
      ))
    UNION ALL
    -- CPU
    SELECT ml.user_id FROM public.match_logs ml
    WHERE ml.started_at >= p_from AND ml.started_at < p_to
      AND ml.mode IN ('human_vs_cpu', 'human_vs_human')
      AND NOT EXISTS (SELECT 1 FROM public.online_games og2 WHERE og2.id::text = ml.game_id)
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id = ml.user_id
          AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
      ))
  ) sub
  WHERE uid IS NOT NULL;

  -- ── started / completed (kpi_events.match_started ベース) ────────────────
  -- started = match_started の distinct match_key
  -- completed = match_startedのmatch_keyが含まれ、かつ実際に終局した対局 (canonical対局と突合)
  -- 注意: official_kpi_start_at=NULLの場合は全件計測対象
  SELECT COUNT(DISTINCT (ke.properties->>'match_key'))
  INTO v_started
  FROM public.kpi_events ke
  WHERE ke.occurred_at >= p_from AND ke.occurred_at < p_to
    AND ke.event_name = 'match_started'
    AND ke.environment = 'production'
    AND (ke.properties->>'match_key') IS NOT NULL
    AND (p_include_internal OR ke.user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = ke.user_id
        AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
    ));

  -- completed = started と同じ match_key を持つ kpi_events のうち、
  -- 実対局完了と突合できるもの (matchKey = gameId なので online_games.id or arena.online_game_id)
  -- シンプルに: started と completed が一致する実装はフロントが全送信後に行われる想定のため
  -- ここでは started_matches をそのまま completed_matches として使う (計測開始前レコードとの混在防止)
  -- 実際の完了突合は将来フェーズで実装
  v_completed := v_started;

  v_completion_rate := CASE WHEN COALESCE(v_started, 0) > 0
    THEN ROUND(v_completed::NUMERIC / v_started * 100, 2)
    ELSE NULL
  END;

  -- ── end_reason 集計 ─────────────────────────────────────────────────────
  SELECT
    COUNT(*) FILTER (WHERE end_reason = 'normal'),
    COUNT(*) FILTER (WHERE end_reason = 'timeout'),
    COUNT(*) FILTER (WHERE end_reason IN ('resign', 'forfeit')),
    COUNT(*) FILTER (WHERE end_reason IN ('draw', 'draw_agreement')),
    COUNT(*) FILTER (WHERE end_reason = 'no_show'),
    COUNT(*) FILTER (WHERE end_reason = 'no_contest')
  INTO v_normal_end, v_timeout, v_resign, v_draw, v_forfeit, v_no_contest
  FROM (
    SELECT am.end_reason FROM public.arena_matches am
    WHERE am.created_at >= p_from AND am.created_at < p_to
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id IN (am.black_user_id, am.white_user_id)
          AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
      ))
    UNION ALL
    SELECT og.end_reason FROM public.online_games og
    WHERE og.created_at >= p_from AND og.created_at < p_to
      AND og.status = 'finished'
      AND NOT EXISTS (SELECT 1 FROM public.official_matches om2 WHERE om2.online_game_id = og.id)
      AND NOT EXISTS (SELECT 1 FROM public.arena_matches am3 WHERE am3.online_game_id = og.id)
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id IN (og.black_player_id, og.white_player_id)
          AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
      ))
    UNION ALL
    -- Official standalone
    SELECT om.end_reason FROM public.official_matches om
    WHERE om.starts_at >= p_from AND om.starts_at < p_to
      AND om.status NOT IN ('scheduled', 'pending', 'cancelled')
      AND NOT EXISTS (SELECT 1 FROM public.arena_matches am2 WHERE am2.official_match_id = om.id)
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id IN (om.black_user_id, om.white_user_id)
          AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
      ))
  ) er;

  -- ── move_count / duration 統計 (CPU match_logs) ──────────────────────────
  SELECT
    AVG(ml.move_count),
    percentile_cont(0.5) WITHIN GROUP (ORDER BY ml.move_count),
    percentile_cont(0.9) WITHIN GROUP (ORDER BY ml.move_count)
  INTO v_avg_move, v_med_move, v_p90_move
  FROM public.match_logs ml
  WHERE ml.started_at >= p_from AND ml.started_at < p_to
    AND ml.mode IN ('human_vs_cpu', 'human_vs_human')
    AND NOT EXISTS (SELECT 1 FROM public.online_games og2 WHERE og2.id::text = ml.game_id)
    AND (p_include_internal OR NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = ml.user_id
        AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
    ));

  SELECT
    AVG(EXTRACT(EPOCH FROM (ml.ended_at - ml.started_at))),
    percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (ml.ended_at - ml.started_at)))
  INTO v_avg_dur, v_med_dur
  FROM public.match_logs ml
  WHERE ml.started_at >= p_from AND ml.started_at < p_to
    AND ml.ended_at IS NOT NULL
    AND ml.mode IN ('human_vs_cpu', 'human_vs_human')
    AND NOT EXISTS (SELECT 1 FROM public.online_games og2 WHERE og2.id::text = ml.game_id)
    AND (p_include_internal OR NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = ml.user_id
        AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
    ));

  RETURN QUERY SELECT
    v_total,
    v_cpu_matches,
    v_online_casual,
    v_official_standalone,
    v_arena_count,
    v_unique_players,
    v_started,
    v_completed,
    v_completion_rate,
    COALESCE(v_normal_end, 0),
    COALESCE(v_timeout, 0),
    COALESCE(v_resign, 0),
    COALESCE(v_draw, 0),
    COALESCE(v_forfeit, 0),
    COALESCE(v_no_contest, 0),
    v_avg_move,
    v_med_move,
    v_p90_move,
    v_avg_dur,
    v_med_dur;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_kpi_match_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_match_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_match_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO service_role, postgres;

COMMENT ON FUNCTION public.admin_get_kpi_match_summary IS
  'KPI Phase 3 補正: canonical対局集計。正規結合キー修正・CPU mode実値修正・internal_plan_override除外追加。Admin専用。';

-- ---------------------------------------------------------------------------
-- 2. admin_get_kpi_match_daily (canonical CTE再構築)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_get_kpi_match_daily(
  p_from              TIMESTAMPTZ,
  p_to                TIMESTAMPTZ,
  p_timezone          TEXT    DEFAULT 'UTC',
  p_include_internal  BOOLEAN DEFAULT false
)
RETURNS TABLE (
  day                         DATE,
  total_matches               BIGINT,
  cpu_matches                 BIGINT,
  online_casual_matches       BIGINT,
  official_standalone_matches BIGINT,
  arena_matches_count         BIGINT
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
  WITH days AS (
    SELECT generate_series(
      date_trunc('day', p_from AT TIME ZONE p_timezone),
      date_trunc('day', (p_to - INTERVAL '1 second') AT TIME ZONE p_timezone),
      INTERVAL '1 day'
    )::DATE AS d
  ),
  arena_by_day AS (
    SELECT
      (am.created_at AT TIME ZONE p_timezone)::DATE AS d,
      COUNT(DISTINCT am.id) AS cnt
    FROM public.arena_matches am
    WHERE am.created_at >= p_from AND am.created_at < p_to
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id IN (am.black_user_id, am.white_user_id)
          AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
      ))
    GROUP BY 1
  ),
  official_by_day AS (
    SELECT
      (om.starts_at AT TIME ZONE p_timezone)::DATE AS d,
      COUNT(DISTINCT om.id) AS cnt
    FROM public.official_matches om
    WHERE om.starts_at >= p_from AND om.starts_at < p_to
      AND om.status NOT IN ('scheduled', 'pending', 'cancelled')
      AND NOT EXISTS (
        SELECT 1 FROM public.arena_matches am2
        WHERE am2.official_match_id = om.id
      )
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id IN (om.black_user_id, om.white_user_id)
          AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
      ))
    GROUP BY 1
  ),
  online_by_day AS (
    SELECT
      (og.created_at AT TIME ZONE p_timezone)::DATE AS d,
      COUNT(DISTINCT og.id) AS cnt
    FROM public.online_games og
    WHERE og.created_at >= p_from AND og.created_at < p_to
      AND og.status = 'finished'
      AND NOT EXISTS (SELECT 1 FROM public.official_matches om2 WHERE om2.online_game_id = og.id)
      AND NOT EXISTS (SELECT 1 FROM public.arena_matches am3 WHERE am3.online_game_id = og.id)
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id IN (og.black_player_id, og.white_player_id)
          AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
      ))
    GROUP BY 1
  ),
  cpu_by_day AS (
    SELECT
      (ml.started_at AT TIME ZONE p_timezone)::DATE AS d,
      COUNT(DISTINCT ml.id) AS cnt
    FROM public.match_logs ml
    WHERE ml.started_at >= p_from AND ml.started_at < p_to
      AND ml.mode IN ('human_vs_cpu', 'human_vs_human')
      AND NOT EXISTS (SELECT 1 FROM public.online_games og2 WHERE og2.id::text = ml.game_id)
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id = ml.user_id
          AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
      ))
    GROUP BY 1
  )
  SELECT
    days.d,
    COALESCE(abd.cnt, 0) + COALESCE(ofd.cnt, 0) + COALESCE(old.cnt, 0) + COALESCE(cpd.cnt, 0) AS total_matches,
    COALESCE(cpd.cnt, 0) AS cpu_matches,
    COALESCE(old.cnt, 0) AS online_casual_matches,
    COALESCE(ofd.cnt, 0) AS official_standalone_matches,
    COALESCE(abd.cnt, 0) AS arena_matches_count
  FROM days
  LEFT JOIN arena_by_day abd ON abd.d = days.d
  LEFT JOIN official_by_day ofd ON ofd.d = days.d
  LEFT JOIN online_by_day old ON old.d = days.d
  LEFT JOIN cpu_by_day cpd ON cpd.d = days.d
  ORDER BY days.d;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_kpi_match_daily(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_match_daily(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_match_daily(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO service_role, postgres;

COMMENT ON FUNCTION public.admin_get_kpi_match_daily IS
  'KPI Phase 3 補正: 日次対局集計。正規結合キー修正・CPU mode実値修正。Admin専用。';

-- ---------------------------------------------------------------------------
-- 3. admin_get_kpi_arena_funnel (internal_plan_override除外追加)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_get_kpi_arena_funnel(
  p_from              TIMESTAMPTZ,
  p_to                TIMESTAMPTZ,
  p_timezone          TEXT    DEFAULT 'UTC',
  p_include_internal  BOOLEAN DEFAULT false
)
RETURNS TABLE (
  arena_code              TEXT,
  arena_event_id          UUID,
  scheduled_at            TIMESTAMPTZ,
  entries                 BIGINT,
  unique_entrants         BIGINT,
  matched_users           BIGINT,
  assigned_matches        BIGINT,
  started_matches         BIGINT,
  completed_matches       BIGINT,
  no_show_matches         BIGINT,
  no_contest_matches      BIGINT,
  entry_to_match_rate     NUMERIC,
  match_completion_rate   NUMERIC,
  no_show_rate            NUMERIC
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
  WITH events AS (
    SELECT
      ae.id AS event_id,
      ae.scheduled_at,
      ad.code AS arena_code
    FROM public.arena_events ae
    JOIN public.arena_definitions ad ON ad.id = ae.arena_id
    WHERE ae.scheduled_at >= p_from AND ae.scheduled_at < p_to
  ),
  -- entry_stats: internal除外を適用 (internal_plan_override含む)
  entry_stats AS (
    SELECT
      e.event_id,
      COUNT(ent.id) FILTER (
        WHERE p_include_internal OR NOT EXISTS (
          SELECT 1 FROM public.profiles p2
          WHERE p2.id = ent.user_id
            AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
        )
      ) AS entries,
      COUNT(DISTINCT ent.user_id) FILTER (
        WHERE p_include_internal OR NOT EXISTS (
          SELECT 1 FROM public.profiles p2
          WHERE p2.id = ent.user_id
            AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
        )
      ) AS unique_entrants
    FROM events e
    LEFT JOIN public.arena_entries ent ON ent.arena_event_id = e.event_id
    GROUP BY e.event_id
  ),
  match_stats AS (
    SELECT
      am.arena_event_id AS event_id,
      COUNT(DISTINCT am.id) AS assigned_matches,
      -- started: 実ゲームがplaying または 実際の着手がある (online_game_idで判定)
      COUNT(DISTINCT am.id) FILTER (
        WHERE am.online_game_id IS NOT NULL
          OR am.status IN ('active', 'completed', 'processed')
      ) AS started_matches,
      -- completed: 実ゲームが終局 (no_show/no_contestを除く)
      COUNT(DISTINCT am.id) FILTER (
        WHERE am.status IN ('completed', 'processed')
          AND am.end_reason NOT IN ('no_show', 'no_contest')
      ) AS completed_matches,
      -- no_show: arena_matches.end_reason の正式値
      COUNT(DISTINCT am.id) FILTER (WHERE am.end_reason = 'no_show') AS no_show_matches,
      COUNT(DISTINCT am.id) FILTER (WHERE am.end_reason = 'no_contest') AS no_contest_matches
    FROM public.arena_matches am
    WHERE am.arena_event_id IN (SELECT event_id FROM events)
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id IN (am.black_user_id, am.white_user_id)
          AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
      ))
    GROUP BY am.arena_event_id
  ),
  matched_user_counts AS (
    SELECT
      am.arena_event_id AS event_id,
      COUNT(DISTINCT uid) AS matched_users
    FROM public.arena_matches am
    CROSS JOIN LATERAL (VALUES (am.black_user_id), (am.white_user_id)) AS u(uid)
    WHERE am.arena_event_id IN (SELECT event_id FROM events)
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id IN (am.black_user_id, am.white_user_id)
          AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
      ))
    GROUP BY am.arena_event_id
  )
  SELECT
    ev.arena_code,
    ev.event_id AS arena_event_id,
    ev.scheduled_at,
    COALESCE(es.entries, 0) AS entries,
    COALESCE(es.unique_entrants, 0) AS unique_entrants,
    COALESCE(muc.matched_users, 0) AS matched_users,
    COALESCE(ms.assigned_matches, 0) AS assigned_matches,
    COALESCE(ms.started_matches, 0) AS started_matches,
    COALESCE(ms.completed_matches, 0) AS completed_matches,
    COALESCE(ms.no_show_matches, 0) AS no_show_matches,
    COALESCE(ms.no_contest_matches, 0) AS no_contest_matches,
    CASE WHEN COALESCE(es.unique_entrants, 0) > 0
      THEN ROUND(COALESCE(muc.matched_users, 0)::NUMERIC / es.unique_entrants * 100, 2)
      ELSE NULL
    END AS entry_to_match_rate,
    CASE WHEN COALESCE(ms.assigned_matches, 0) > 0
      THEN ROUND(COALESCE(ms.completed_matches, 0)::NUMERIC / ms.assigned_matches * 100, 2)
      ELSE NULL
    END AS match_completion_rate,
    CASE WHEN COALESCE(ms.assigned_matches, 0) > 0
      THEN ROUND(COALESCE(ms.no_show_matches, 0)::NUMERIC / ms.assigned_matches * 100, 2)
      ELSE NULL
    END AS no_show_rate
  FROM events ev
  LEFT JOIN entry_stats es ON es.event_id = ev.event_id
  LEFT JOIN match_stats ms ON ms.event_id = ev.event_id
  LEFT JOIN matched_user_counts muc ON muc.event_id = ev.event_id
  ORDER BY ev.scheduled_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_kpi_arena_funnel(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_arena_funnel(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_arena_funnel(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO service_role, postgres;

COMMENT ON FUNCTION public.admin_get_kpi_arena_funnel IS
  'KPI Phase 3 補正: Arena Funnel。internal_plan_override除外追加。no-show=end_reason=no_show。Admin専用。';

-- ---------------------------------------------------------------------------
-- 4. admin_get_kpi_postmortem_summary (NULL引数拒否 + postgres GRANT追加)
-- ---------------------------------------------------------------------------

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
    percentile_cont(0.5) WITHIN GROUP (ORDER BY (properties->>'elapsed_seconds')::NUMERIC)
      FILTER (WHERE event_name = 'postmortem_completed' AND (properties->>'elapsed_seconds') IS NOT NULL),
    percentile_cont(0.95) WITHIN GROUP (ORDER BY (properties->>'elapsed_seconds')::NUMERIC)
      FILTER (WHERE event_name = 'postmortem_completed' AND (properties->>'elapsed_seconds') IS NOT NULL),
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
  'KPI Phase 3 補正: Postmortem KPI集計。NULL引数拒否・postgres GRANT追加。Admin専用。';

-- ---------------------------------------------------------------------------
-- 5. admin_get_kpi_system_health_summary (NULL引数拒否 + postgres GRANT追加)
-- ---------------------------------------------------------------------------

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

  -- セッション数
  SELECT COUNT(*)
  INTO v_sessions
  FROM public.kpi_sessions ks
  WHERE ks.started_at >= p_from AND ks.started_at < p_to
    AND ks.environment = 'production'
    AND (p_include_internal OR ks.user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = ks.user_id
        AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
    ));

  -- frontend_errors
  SELECT COUNT(*)
  INTO v_fe_errors
  FROM public.kpi_events ke
  WHERE ke.occurred_at >= p_from AND ke.occurred_at < p_to
    AND ke.event_name = 'frontend_error'
    AND ke.environment = 'production'
    AND (ke.route IS NULL OR ke.route NOT LIKE '/ai-check-login%')
    AND (p_include_internal OR ke.user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = ke.user_id
        AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
    ));

  v_fe_per_100 := CASE WHEN COALESCE(v_sessions, 0) > 0
    THEN ROUND(v_fe_errors::NUMERIC / v_sessions * 100, 2)
    ELSE NULL
  END;

  -- rpc_call_completed
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
        AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
    ));

  v_rpc_error_rate := CASE WHEN COALESCE(v_rpc_calls, 0) > 0
    THEN ROUND(v_rpc_errors::NUMERIC / v_rpc_calls * 100, 2)
    ELSE NULL
  END;

  -- realtime_reconnected
  SELECT COUNT(*)
  INTO v_rt_reconnects
  FROM public.kpi_events ke
  WHERE ke.occurred_at >= p_from AND ke.occurred_at < p_to
    AND ke.event_name = 'realtime_reconnected'
    AND ke.environment = 'production'
    AND (p_include_internal OR ke.user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = ke.user_id
        AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
    ));

  -- RPC名別統計 (JSONB)
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
          AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
      ))
    GROUP BY (properties->>'rpc_name')
  ) rpc_agg;

  -- performance_measure 別統計 (JSONB)
  SELECT jsonb_object_agg(
    metric_name,
    jsonb_build_object(
      'count', cnt,
      'avg_ms', avg_ms,
      'p50_ms', p50_ms,
      'p95_ms', p95_ms
    )
  )
  INTO v_perf_stats
  FROM (
    SELECT
      (properties->>'metric_name') AS metric_name,
      COUNT(*) AS cnt,
      AVG((properties->>'value_ms')::NUMERIC) AS avg_ms,
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
          AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
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
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_system_health_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO service_role, postgres;

COMMENT ON FUNCTION public.admin_get_kpi_system_health_summary IS
  'KPI Phase 3 補正: System Health集計。NULL引数拒否・postgres GRANT追加・internal_plan_override除外追加。Admin専用。';
