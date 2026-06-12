-- =============================================================================
-- Arena Phase F-1: list_my_official_matches に p_include_arena パラメータを追加
-- Arena由来(source_kind='arena')のofficial_matchをArenaカレンダーに表示するため。
--
-- 変更内容:
--   - p_include_arena boolean DEFAULT FALSE を追加
--   - FALSE（デフォルト）: source_kind='standalone' のみ返す（従来通り）
--   - TRUE: source_kind フィルタを解除して全件（arena含む）を返す
--
-- 下位互換性:
--   - 既存呼び出し（p_include_arena 未指定）は FALSE 相当 → 動作変化なし
--   - RPC 署名が変わるが DROP FUNCTION は不要（OVERLOAD不使用 / PostgreSQL は
--     デフォルト引数付きCREATE OR REPLACEを許可する）
--
-- 冪等設計: CREATE OR REPLACE 使用
-- =============================================================================

CREATE OR REPLACE FUNCTION list_my_official_matches(
  p_from          timestamptz DEFAULT NULL,
  p_to            timestamptz DEFAULT NULL,
  p_status        text[]      DEFAULT NULL,
  p_include_arena boolean     DEFAULT FALSE
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
      m.source_kind,
      m.created_at,
      m.updated_at
    FROM official_matches m
    WHERE (m.black_user_id = v_uid OR m.white_user_id = v_uid)
      AND m.starts_at >= v_from
      AND m.starts_at <= v_to
      AND (p_status IS NULL OR m.status = ANY(p_status))
      -- p_include_arena=FALSE: Arena由来matchを除外（通常カレンダー向け）
      -- p_include_arena=TRUE:  source_kindフィルタなし（Arenaカレンダー向け）
      AND (p_include_arena OR COALESCE(m.source_kind, 'standalone') = 'standalone')
    ORDER BY m.starts_at ASC
  ) r;

  RETURN COALESCE(v_result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION list_my_official_matches(timestamptz, timestamptz, text[], boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION list_my_official_matches(timestamptz, timestamptz, text[], boolean) FROM anon;

-- 旧シグネチャ（3引数）のGRANT/REVOKEも念のため維持
-- PostgreSQLはデフォルト引数があれば4引数版から3引数版を自動解決するが、
-- 明示的にGRANTするために旧シグネチャも記載する
GRANT EXECUTE ON FUNCTION list_my_official_matches(timestamptz, timestamptz, text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION list_my_official_matches(timestamptz, timestamptz, text[]) FROM anon;
