-- phase_medium_pattern.sql
-- Phase M-1: medium_pattern_id 対応テーブル & RPC
--
-- 【実行方法】Supabase SQL Editor でこのファイルの内容を実行すること
-- 【設計方針】冪等設計 (IF NOT EXISTS) — 複数回実行しても安全
--
-- medium_pattern_id = {C4正規化済みPosition所有マスク}:{Corner Gate dominance bits}
-- 例: "a1b2c3d4:0001"
--
-- Corner Gates: 1, 4, 7, 10 (C4回転サイクル: 1→4→7→10→1)
-- dominance bits: '0'=neutral, '1'=black dominant, '2'=white dominant
-- C4正規化: 辞書順最小の4桁文字列を canonical bits として採用

-- ---------------------------------------------------------------------------
-- 1. medium_pattern_stats テーブル（実戦データ用）
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS medium_pattern_stats (
  medium_pattern_id TEXT        NOT NULL,
  mode_group        TEXT        NOT NULL DEFAULT 'all',
  wins_black        INT         NOT NULL DEFAULT 0,
  wins_white        INT         NOT NULL DEFAULT 0,
  draws             INT         NOT NULL DEFAULT 0,
  total             INT         NOT NULL DEFAULT 0,
  win_rate_black    FLOAT,      -- wins_black / total * 100 (total=0 is NULL)
  win_rate_white    FLOAT,      -- wins_white / total * 100 (total=0 is NULL)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (medium_pattern_id, mode_group)
);

-- Index for pattern lookup by id
CREATE INDEX IF NOT EXISTS idx_medium_pattern_stats_pattern_id
  ON medium_pattern_stats (medium_pattern_id);

-- Comment
COMMENT ON TABLE medium_pattern_stats IS
  'Phase M-1: medium_pattern_id (Position所有C4正規化 + Corner Gate dominance) ごとの実戦勝率統計';

COMMENT ON COLUMN medium_pattern_stats.medium_pattern_id IS
  'Format: {position_ownership_hash}:{corner_bits_4chars} — C4正規化済み';

COMMENT ON COLUMN medium_pattern_stats.mode_group IS
  'Game mode group: all | pvp | online | cpu_normal | cpu_hard | cpu_very_hard';

-- ---------------------------------------------------------------------------
-- 2. sim_medium_pattern_stats テーブル（シミュレーション専用）
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sim_medium_pattern_stats (
  medium_pattern_id TEXT        NOT NULL,
  sim_policy        TEXT        NOT NULL DEFAULT 'easy_vs_easy',
  wins_black        INT         NOT NULL DEFAULT 0,
  wins_white        INT         NOT NULL DEFAULT 0,
  draws             INT         NOT NULL DEFAULT 0,
  total             INT         NOT NULL DEFAULT 0,
  win_rate_black    FLOAT,      -- wins_black / total * 100 (total=0 is NULL)
  win_rate_white    FLOAT,      -- wins_white / total * 100 (total=0 is NULL)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (medium_pattern_id, sim_policy)
);

-- Index for pattern lookup
CREATE INDEX IF NOT EXISTS idx_sim_medium_pattern_stats_pattern_id
  ON sim_medium_pattern_stats (medium_pattern_id);

-- Comment
COMMENT ON TABLE sim_medium_pattern_stats IS
  'Phase M-1: medium_pattern_id ごとのシミュレーション勝率統計 (sim_policy 別)';

COMMENT ON COLUMN sim_medium_pattern_stats.sim_policy IS
  'Simulation policy: easy_vs_easy | random_vs_random | etc.';

-- ---------------------------------------------------------------------------
-- 3. get_medium_pattern_win_rates RPC（実戦用）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_medium_pattern_win_rates(
  p_pattern_ids TEXT[],
  p_mode_group  TEXT    DEFAULT 'all',
  p_min_total   INT     DEFAULT 5
)
RETURNS TABLE (
  medium_pattern_id TEXT,
  wins_black        INT,
  wins_white        INT,
  draws             INT,
  total             INT,
  win_rate_black    FLOAT,
  win_rate_white    FLOAT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    s.medium_pattern_id,
    s.wins_black,
    s.wins_white,
    s.draws,
    s.total,
    s.win_rate_black,
    s.win_rate_white
  FROM medium_pattern_stats s
  WHERE s.medium_pattern_id = ANY(p_pattern_ids)
    AND s.mode_group = p_mode_group
    AND s.total >= p_min_total
  ORDER BY s.medium_pattern_id;
$$;

COMMENT ON FUNCTION get_medium_pattern_win_rates(TEXT[], TEXT, INT) IS
  'Phase M-1: medium_pattern_id の実戦勝率を一括取得する RPC。p_min_total 未満のレコードは除外。';

-- ---------------------------------------------------------------------------
-- 4. get_sim_medium_pattern_win_rates RPC（シミュレーション用）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_sim_medium_pattern_win_rates(
  p_pattern_ids TEXT[],
  p_sim_policy  TEXT    DEFAULT 'easy_vs_easy',
  p_min_total   INT     DEFAULT 100
)
RETURNS TABLE (
  medium_pattern_id TEXT,
  wins_black        INT,
  wins_white        INT,
  draws             INT,
  total             INT,
  win_rate_black    FLOAT,
  win_rate_white    FLOAT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    s.medium_pattern_id,
    s.wins_black,
    s.wins_white,
    s.draws,
    s.total,
    s.win_rate_black,
    s.win_rate_white
  FROM sim_medium_pattern_stats s
  WHERE s.medium_pattern_id = ANY(p_pattern_ids)
    AND s.sim_policy = p_sim_policy
    AND s.total >= p_min_total
  ORDER BY s.medium_pattern_id;
$$;

COMMENT ON FUNCTION get_sim_medium_pattern_win_rates(TEXT[], TEXT, INT) IS
  'Phase M-1: medium_pattern_id のシミュレーション勝率を一括取得する RPC。p_min_total 未満のレコードは除外。';
