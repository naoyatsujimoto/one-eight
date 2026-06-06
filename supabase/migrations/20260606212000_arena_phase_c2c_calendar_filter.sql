-- =============================================================================
-- Arena Phase C-2c: OfficialMatchCalendar Arena混入防止
-- list_my_official_matches RPC に source_kind='standalone' フィルタを追加する。
-- Arena由来(source_kind='arena')の公式戦は通常カレンダーに表示しない。
-- 冪等設計: CREATE OR REPLACE 使用
-- =============================================================================

CREATE OR REPLACE FUNCTION list_my_official_matches(
  p_from    timestamptz DEFAULT NULL,
  p_to      timestamptz DEFAULT NULL,
  p_status  text[]      DEFAULT NULL
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_from   timestamptz := COALESCE(p_from, now() - interval '30 days');
  v_to     timestamptz := COALESCE(p_to,   now() + interval '90 days');
  v_result json;
BEGIN
  SELECT json_agg(row_to_json(r)) INTO v_result
  FROM (
    SELECT
      m.id,
      m.starts_at,
      m.ends_at,
      m.status,
      m.timer_config,
      m.online_game_id,
      m.result,
      m.winner,
      m.end_reason,
      CASE WHEN m.black_user_id = v_uid THEN 'black' ELSE 'white' END AS my_color,
      CASE WHEN m.black_user_id = v_uid THEN m.white_user_id ELSE m.black_user_id END AS opponent_id,
      (SELECT p.display_name FROM profiles p
       WHERE p.id = CASE WHEN m.black_user_id = v_uid THEN m.white_user_id ELSE m.black_user_id END
      ) AS opponent_display_name,
      m.tournament_id,
      m.round_id,
      m.created_at,
      m.updated_at
    FROM official_matches m
    WHERE (m.black_user_id = v_uid OR m.white_user_id = v_uid)
      AND m.starts_at >= v_from
      AND m.starts_at <= v_to
      AND (p_status IS NULL OR m.status = ANY(p_status))
      AND COALESCE(m.source_kind, 'standalone') = 'standalone'  -- Arena由来matchを除外
    ORDER BY m.starts_at ASC
  ) r;

  RETURN COALESCE(v_result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION list_my_official_matches(timestamptz, timestamptz, text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION list_my_official_matches(timestamptz, timestamptz, text[]) FROM anon;
