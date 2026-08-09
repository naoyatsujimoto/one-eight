-- =============================================================================
-- 20260810000003_kpi_phase3_admin_arena.sql
-- KPI Phase 3-B: admin_get_kpi_arena_funnel
--
-- Arena Funnel集計。
-- カウント単位: arena_match_id（arena_match_historyは1対局複数行のため除外）
-- no-show定義: arena_matches.end_reason = 'no_show'（F04 migration で確定済み）
-- no-contest定義: arena_matches.end_reason = 'no_contest'
-- 内部除外: 片方でも is_admin=true または is_internal_test_account=true なら対局ごと除外
-- =============================================================================

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
  WITH events AS (
    SELECT
      ae.id AS event_id,
      ae.scheduled_at,
      ad.code AS arena_code
    FROM public.arena_events ae
    JOIN public.arena_definitions ad ON ad.id = ae.arena_id
    WHERE ae.scheduled_at >= p_from AND ae.scheduled_at < p_to
  ),
  entry_stats AS (
    SELECT
      e.event_id,
      COUNT(ent.id) AS entries,
      COUNT(DISTINCT ent.user_id) AS unique_entrants
    FROM events e
    LEFT JOIN public.arena_entries ent ON ent.arena_event_id = e.event_id
    GROUP BY e.event_id
  ),
  match_stats AS (
    SELECT
      am.arena_event_id AS event_id,
      -- matched users = ユニークユーザー数（対局に参加している）
      COUNT(DISTINCT am.black_user_id) + COUNT(DISTINCT am.white_user_id) AS matched_users_raw,
      COUNT(DISTINCT am.id) AS assigned_matches,
      COUNT(DISTINCT am.id) FILTER (WHERE am.status IN ('active','completed','processed')) AS started_matches,
      COUNT(DISTINCT am.id) FILTER (WHERE am.status IN ('completed','processed')) AS completed_matches,
      COUNT(DISTINCT am.id) FILTER (WHERE am.end_reason = 'no_show') AS no_show_matches,
      COUNT(DISTINCT am.id) FILTER (WHERE am.end_reason = 'no_contest') AS no_contest_matches
    FROM public.arena_matches am
    WHERE am.arena_event_id IN (SELECT event_id FROM events)
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id IN (am.black_user_id, am.white_user_id)
          AND (COALESCE(p2.is_admin, FALSE) OR COALESCE(p2.is_internal_test_account, FALSE))
      ))
    GROUP BY am.arena_event_id
  ),
  -- matched_users: 対局に参加したユニークユーザー数
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
          AND (COALESCE(p2.is_admin, FALSE) OR COALESCE(p2.is_internal_test_account, FALSE))
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
    -- entry_to_match_rate: エントリ者のうち対局にマッチされた割合
    CASE WHEN COALESCE(es.unique_entrants, 0) > 0
      THEN ROUND(COALESCE(muc.matched_users, 0)::NUMERIC / es.unique_entrants * 100, 2)
      ELSE NULL
    END AS entry_to_match_rate,
    -- match_completion_rate: 割当対局のうち完了した割合
    CASE WHEN COALESCE(ms.assigned_matches, 0) > 0
      THEN ROUND(COALESCE(ms.completed_matches, 0)::NUMERIC / ms.assigned_matches * 100, 2)
      ELSE NULL
    END AS match_completion_rate,
    -- no_show_rate: 割当対局のうちno-showの割合
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
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_arena_funnel(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO service_role;

COMMENT ON FUNCTION public.admin_get_kpi_arena_funnel IS
  'KPI Phase 3-B: Arena Funnel集計。arena_match_id単位。no-show=end_reason=no_show。Admin専用。';
