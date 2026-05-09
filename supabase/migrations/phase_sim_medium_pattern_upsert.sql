-- phase_sim_medium_pattern_upsert.sql
-- Phase M-1 補完: batch_upsert_sim_medium_pattern_stats RPC 追加
-- 【実行方法】Supabase SQL Editor でこのファイルの内容を実行すること
-- 【設計方針】冪等設計 — 複数回実行しても安全

CREATE OR REPLACE FUNCTION batch_upsert_sim_medium_pattern_stats(
  p_pattern_ids TEXT[],
  p_winner      TEXT,
  p_sim_policy  TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid           TEXT;
  v_unique_pids   TEXT[];
BEGIN
  -- 1ゲーム内での重複 medium_pattern_id を除去
  SELECT ARRAY(SELECT DISTINCT unnest(p_pattern_ids) WHERE unnest IS NOT NULL)
  INTO v_unique_pids;

  FOREACH v_pid IN ARRAY v_unique_pids LOOP
    INSERT INTO sim_medium_pattern_stats
      (medium_pattern_id, sim_policy, wins_black, wins_white, draws, total, updated_at)
    VALUES (
      v_pid,
      p_sim_policy,
      CASE WHEN p_winner = 'black' THEN 1 ELSE 0 END,
      CASE WHEN p_winner = 'white' THEN 1 ELSE 0 END,
      CASE WHEN p_winner = 'draw'  THEN 1 ELSE 0 END,
      1,
      now()
    )
    ON CONFLICT (medium_pattern_id, sim_policy) DO UPDATE SET
      wins_black = sim_medium_pattern_stats.wins_black + CASE WHEN p_winner = 'black' THEN 1 ELSE 0 END,
      wins_white = sim_medium_pattern_stats.wins_white + CASE WHEN p_winner = 'white' THEN 1 ELSE 0 END,
      draws      = sim_medium_pattern_stats.draws      + CASE WHEN p_winner = 'draw'  THEN 1 ELSE 0 END,
      total      = sim_medium_pattern_stats.total      + 1,
      updated_at = now();
  END LOOP;
END;
$$;

COMMENT ON FUNCTION batch_upsert_sim_medium_pattern_stats(TEXT[], TEXT, TEXT) IS
  'Phase M-1 補完: 1ゲーム分の medium_pattern_id 配列を sim_medium_pattern_stats に一括 UPSERT';
