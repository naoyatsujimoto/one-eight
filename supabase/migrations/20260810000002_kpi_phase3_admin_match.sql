-- =============================================================================
-- 20260810000002_kpi_phase3_admin_match.sql
-- KPI Phase 3-A: admin_get_kpi_match_summary / admin_get_kpi_match_daily
--
-- canonical対局定義（相互排他的・優先順位順）:
--   1. Arena  = arena_matches に存在する対局（arena_match_id単位）
--   2. Official standalone = official_matches に存在するが arena_matches に存在しない
--   3. Online casual = online_games に存在するが official_matches/arena_matches に存在しない
--   4. CPU = match_logs に存在するが online_games に存在しない（sim_match_logs除外）
--
-- 集計正本:
--   - Arena: arena_matches (created_at, completed_at, status, end_reason, result)
--   - Official: official_matches (starts_at, updated_at, status, end_reason, result)
--   - Online casual: online_games (created_at, updated_at, status, end_reason, winner)
--   - CPU: match_logs (started_at, ended_at, mode, winner, move_count, end_reason)
--
-- 内部除外: profiles.is_admin=true OR is_internal_test_account=true
-- sim_match_logs除外: match_logs.game_id が sim_match_logs.id::text に存在しない（そもそも別テーブル）
-- =============================================================================

-- ---------------------------------------------------------------------------
-- admin_get_kpi_match_summary
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

  -- ── 1. Arena matches (arena_match_id単位) ──────────────────────────────────
  SELECT COUNT(DISTINCT am.id)
  INTO v_arena_count
  FROM public.arena_matches am
  WHERE am.created_at >= p_from AND am.created_at < p_to
    AND (p_include_internal OR NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id IN (am.black_user_id, am.white_user_id)
        AND (COALESCE(p2.is_admin, FALSE) OR COALESCE(p2.is_internal_test_account, FALSE))
    ));

  -- ── 2. Official standalone matches ─────────────────────────────────────────
  SELECT COUNT(*)
  INTO v_official_standalone
  FROM public.official_matches om
  WHERE om.starts_at >= p_from AND om.starts_at < p_to
    AND NOT EXISTS (
      SELECT 1 FROM public.arena_matches am2
      WHERE am2.online_game_id = om.online_game_id
        AND om.online_game_id IS NOT NULL
    )
    AND (p_include_internal OR NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id IN (om.black_user_id, om.white_user_id)
        AND (COALESCE(p2.is_admin, FALSE) OR COALESCE(p2.is_internal_test_account, FALSE))
    ));

  -- ── 3. Online casual matches ────────────────────────────────────────────────
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
        AND (COALESCE(p2.is_admin, FALSE) OR COALESCE(p2.is_internal_test_account, FALSE))
    ));

  -- ── 4. CPU matches (match_logs のみ、online_games なし) ────────────────────
  -- mode = 'cpu' or mode = 'human_vs_cpu' or game_id がonline_gamesに存在しない
  SELECT COUNT(DISTINCT ml.id)
  INTO v_cpu_matches
  FROM public.match_logs ml
  WHERE ml.started_at >= p_from AND ml.started_at < p_to
    AND (ml.mode IS NULL OR ml.mode NOT IN ('online_pvp'))
    AND NOT EXISTS (
      SELECT 1 FROM public.online_games og2 WHERE og2.id::text = ml.game_id
    )
    AND (p_include_internal OR NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = ml.user_id
        AND (COALESCE(p2.is_admin, FALSE) OR COALESCE(p2.is_internal_test_account, FALSE))
    ));

  v_total := COALESCE(v_arena_count, 0)
           + COALESCE(v_official_standalone, 0)
           + COALESCE(v_online_casual, 0)
           + COALESCE(v_cpu_matches, 0);

  -- ── Unique players (各分類のblack/white/user_id合計) ────────────────────────
  SELECT COUNT(DISTINCT uid)
  INTO v_unique_players
  FROM (
    SELECT am.black_user_id AS uid FROM public.arena_matches am
    WHERE am.created_at >= p_from AND am.created_at < p_to
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id IN (am.black_user_id, am.white_user_id)
          AND (COALESCE(p2.is_admin, FALSE) OR COALESCE(p2.is_internal_test_account, FALSE))
      ))
    UNION ALL
    SELECT am.white_user_id FROM public.arena_matches am
    WHERE am.created_at >= p_from AND am.created_at < p_to
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id IN (am.black_user_id, am.white_user_id)
          AND (COALESCE(p2.is_admin, FALSE) OR COALESCE(p2.is_internal_test_account, FALSE))
      ))
    UNION ALL
    SELECT ml.user_id FROM public.match_logs ml
    WHERE ml.started_at >= p_from AND ml.started_at < p_to
      AND (ml.mode IS NULL OR ml.mode NOT IN ('online_pvp'))
      AND NOT EXISTS (SELECT 1 FROM public.online_games og2 WHERE og2.id::text = ml.game_id)
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id = ml.user_id
          AND (COALESCE(p2.is_admin, FALSE) OR COALESCE(p2.is_internal_test_account, FALSE))
      ))
    UNION ALL
    SELECT og.black_player_id FROM public.online_games og
    WHERE og.created_at >= p_from AND og.created_at < p_to
      AND og.status = 'finished'
      AND NOT EXISTS (SELECT 1 FROM public.official_matches om2 WHERE om2.online_game_id = og.id)
      AND NOT EXISTS (SELECT 1 FROM public.arena_matches am3 WHERE am3.online_game_id = og.id)
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id IN (og.black_player_id, og.white_player_id)
          AND (COALESCE(p2.is_admin, FALSE) OR COALESCE(p2.is_internal_test_account, FALSE))
      ))
  ) sub;

  -- ── started / completed (arena + online_casual ベース) ────────────────────
  SELECT
    COUNT(*) FILTER (WHERE am.status IN ('active','completed','processed')),
    COUNT(*) FILTER (WHERE am.status IN ('completed','processed'))
  INTO v_started, v_completed
  FROM public.arena_matches am
  WHERE am.created_at >= p_from AND am.created_at < p_to
    AND (p_include_internal OR NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id IN (am.black_user_id, am.white_user_id)
        AND (COALESCE(p2.is_admin, FALSE) OR COALESCE(p2.is_internal_test_account, FALSE))
    ));

  -- started/completed に online_casual + cpu を加算
  v_started := COALESCE(v_started, 0) + COALESCE(v_online_casual, 0) + COALESCE(v_cpu_matches, 0);
  v_completed := COALESCE(v_completed, 0) + COALESCE(v_online_casual, 0) + COALESCE(v_cpu_matches, 0);

  v_completion_rate := CASE WHEN COALESCE(v_started, 0) > 0
    THEN ROUND(v_completed::NUMERIC / v_started * 100, 2)
    ELSE NULL
  END;

  -- ── end_reason 集計 (arena + online_casual) ─────────────────────────────────
  SELECT
    COUNT(*) FILTER (WHERE end_reason = 'normal'),
    COUNT(*) FILTER (WHERE end_reason = 'timeout'),
    COUNT(*) FILTER (WHERE end_reason IN ('resign')),
    COUNT(*) FILTER (WHERE end_reason IN ('draw','draw_agreement')),
    COUNT(*) FILTER (WHERE end_reason IN ('no_show')),
    COUNT(*) FILTER (WHERE end_reason = 'no_contest')
  INTO v_normal_end, v_timeout, v_resign, v_draw, v_forfeit, v_no_contest
  FROM (
    SELECT am.end_reason FROM public.arena_matches am
    WHERE am.created_at >= p_from AND am.created_at < p_to
    UNION ALL
    SELECT og.end_reason FROM public.online_games og
    WHERE og.created_at >= p_from AND og.created_at < p_to
      AND og.status = 'finished'
      AND NOT EXISTS (SELECT 1 FROM public.official_matches om2 WHERE om2.online_game_id = og.id)
      AND NOT EXISTS (SELECT 1 FROM public.arena_matches am3 WHERE am3.online_game_id = og.id)
    UNION ALL
    SELECT om.end_reason FROM public.official_matches om
    WHERE om.starts_at >= p_from AND om.starts_at < p_to
      AND NOT EXISTS (
        SELECT 1 FROM public.arena_matches am2
        WHERE am2.online_game_id = om.online_game_id AND om.online_game_id IS NOT NULL
      )
  ) er;

  -- ── move_count 統計 (CPU match_logs から) ────────────────────────────────────
  SELECT
    AVG(ml.move_count),
    percentile_cont(0.5) WITHIN GROUP (ORDER BY ml.move_count),
    percentile_cont(0.9) WITHIN GROUP (ORDER BY ml.move_count)
  INTO v_avg_move, v_med_move, v_p90_move
  FROM public.match_logs ml
  WHERE ml.started_at >= p_from AND ml.started_at < p_to
    AND (ml.mode IS NULL OR ml.mode NOT IN ('online_pvp'))
    AND NOT EXISTS (SELECT 1 FROM public.online_games og2 WHERE og2.id::text = ml.game_id)
    AND (p_include_internal OR NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = ml.user_id
        AND (COALESCE(p2.is_admin, FALSE) OR COALESCE(p2.is_internal_test_account, FALSE))
    ));

  -- ── duration 統計 (CPU match_logsのstarted_at〜ended_at) ────────────────────
  SELECT
    AVG(EXTRACT(EPOCH FROM (ml.ended_at - ml.started_at))),
    percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (ml.ended_at - ml.started_at)))
  INTO v_avg_dur, v_med_dur
  FROM public.match_logs ml
  WHERE ml.started_at >= p_from AND ml.started_at < p_to
    AND ml.ended_at IS NOT NULL
    AND (ml.mode IS NULL OR ml.mode NOT IN ('online_pvp'))
    AND NOT EXISTS (SELECT 1 FROM public.online_games og2 WHERE og2.id::text = ml.game_id)
    AND (p_include_internal OR NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = ml.user_id
        AND (COALESCE(p2.is_admin, FALSE) OR COALESCE(p2.is_internal_test_account, FALSE))
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
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_match_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO service_role;

COMMENT ON FUNCTION public.admin_get_kpi_match_summary IS
  'KPI Phase 3-A: canonical対局集計（4分類相互排他）。Admin専用。';

-- ---------------------------------------------------------------------------
-- admin_get_kpi_match_daily
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
          AND (COALESCE(p2.is_admin, FALSE) OR COALESCE(p2.is_internal_test_account, FALSE))
      ))
    GROUP BY 1
  ),
  official_by_day AS (
    SELECT
      (om.starts_at AT TIME ZONE p_timezone)::DATE AS d,
      COUNT(*) AS cnt
    FROM public.official_matches om
    WHERE om.starts_at >= p_from AND om.starts_at < p_to
      AND NOT EXISTS (
        SELECT 1 FROM public.arena_matches am2
        WHERE am2.online_game_id = om.online_game_id AND om.online_game_id IS NOT NULL
      )
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id IN (om.black_user_id, om.white_user_id)
          AND (COALESCE(p2.is_admin, FALSE) OR COALESCE(p2.is_internal_test_account, FALSE))
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
          AND (COALESCE(p2.is_admin, FALSE) OR COALESCE(p2.is_internal_test_account, FALSE))
      ))
    GROUP BY 1
  ),
  cpu_by_day AS (
    SELECT
      (ml.started_at AT TIME ZONE p_timezone)::DATE AS d,
      COUNT(DISTINCT ml.id) AS cnt
    FROM public.match_logs ml
    WHERE ml.started_at >= p_from AND ml.started_at < p_to
      AND (ml.mode IS NULL OR ml.mode NOT IN ('online_pvp'))
      AND NOT EXISTS (SELECT 1 FROM public.online_games og2 WHERE og2.id::text = ml.game_id)
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id = ml.user_id
          AND (COALESCE(p2.is_admin, FALSE) OR COALESCE(p2.is_internal_test_account, FALSE))
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
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_match_daily(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO service_role;

COMMENT ON FUNCTION public.admin_get_kpi_match_daily IS
  'KPI Phase 3-A: 日次対局集計（4分類）。Admin専用。';
