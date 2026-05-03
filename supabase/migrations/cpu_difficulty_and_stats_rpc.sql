-- ① match_logs に cpu_difficulty カラムを追加
ALTER TABLE match_logs
ADD COLUMN IF NOT EXISTS cpu_difficulty TEXT;

-- ② CPU統計を全ユーザー集計で返す SECURITY DEFINER RPC
-- match_logs の RLS をバイパスし、全プレイヤーの対CPU戦データを返す
CREATE OR REPLACE FUNCTION get_cpu_stats(p_difficulty TEXT)
RETURNS TABLE(
  winner      TEXT,
  human_color TEXT,
  move_count  INTEGER,
  full_record JSONB
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT winner, human_color, move_count, full_record
  FROM match_logs
  WHERE mode = 'human_vs_cpu'
    AND cpu_difficulty = p_difficulty
  ORDER BY created_at DESC
  LIMIT 500;
$$;
