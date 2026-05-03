-- stats_public = true のユーザーの match_logs を返す SECURITY DEFINER RPC
-- match_logs の RLS をバイパスし、公開設定ユーザーのみデータを返す
-- Supabase SQL Editor で実行してください

CREATE OR REPLACE FUNCTION get_public_match_logs(target_user_id UUID)
RETURNS TABLE(
  id          UUID,
  user_id     UUID,
  game_id     TEXT,
  started_at  TIMESTAMPTZ,
  ended_at    TIMESTAMPTZ,
  mode        TEXT,
  human_color TEXT,
  winner      TEXT,
  move_count  INTEGER,
  created_at  TIMESTAMPTZ,
  full_record JSONB
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id, m.user_id, m.game_id,
    m.started_at, m.ended_at,
    m.mode, m.human_color, m.winner,
    m.move_count, m.created_at, m.full_record
  FROM match_logs m
  JOIN profiles p ON p.id = m.user_id
  WHERE m.user_id = target_user_id
    AND p.stats_public = true
  ORDER BY m.created_at DESC
  LIMIT 100;
$$;
