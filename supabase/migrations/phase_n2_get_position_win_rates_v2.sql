-- =============================================================================
-- Migration: get_position_win_rates v2
-- Phase N-2 — ONE EIGHT ポストモータム局面勝率 RPC 拡張
-- =============================================================================
-- 実行方法: Supabase SQL Editor にこのファイルの内容をそのまま貼り付けて実行
-- 冪等設計: CREATE OR REPLACE を使用（再実行可能）
-- =============================================================================

-- -----------------------------------------------------------------------------
-- RPC: get_position_win_rates v2
-- -----------------------------------------------------------------------------
-- 変更点（v1 → v2）:
--   + win_rate_black NUMERIC  : wins_black / total × 100（小数点2桁）。total=0 は NULL
--   + win_rate_white NUMERIC  : wins_white / total × 100（小数点2桁）。total=0 は NULL
--   + confidence TEXT         : 表示信頼度
--       'hidden'    : total < 5   → 非表示相当
--       'reference' : total 5〜29 → 参考値
--       'main'      : total >= 30 → メイン表示（統計的に信頼できる）
--
-- 後方互換性:
--   - 既存フィールド（canonical_hash/wins_black/wins_white/draws/total）は変更なし
--   - 引数（hashes/mode_group）は変更なし
--   - 既存コードへの影響なし（新フィールドを無視すれば動作継続）

CREATE OR REPLACE FUNCTION get_position_win_rates(
  hashes     TEXT[],
  mode_group TEXT DEFAULT 'all'
)
RETURNS TABLE (
  canonical_hash TEXT,
  wins_black     INTEGER,
  wins_white     INTEGER,
  draws          INTEGER,
  total          INTEGER,
  win_rate_black NUMERIC,
  win_rate_white NUMERIC,
  confidence     TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ps.canonical_hash,
    ps.wins_black,
    ps.wins_white,
    ps.draws,
    ps.total,
    -- win_rate: total=0 の場合は NULL（ゼロ除算防止）
    CASE WHEN ps.total > 0
      THEN ROUND((ps.wins_black::NUMERIC / ps.total) * 100, 2)
      ELSE NULL
    END AS win_rate_black,
    CASE WHEN ps.total > 0
      THEN ROUND((ps.wins_white::NUMERIC / ps.total) * 100, 2)
      ELSE NULL
    END AS win_rate_white,
    -- confidence: total に基づく表示信頼度
    CASE
      WHEN ps.total < 5  THEN 'hidden'
      WHEN ps.total < 30 THEN 'reference'
      ELSE                    'main'
    END AS confidence
  FROM position_stats ps
  WHERE ps.canonical_hash = ANY(hashes)
    AND ps.mode_group = get_position_win_rates.mode_group;
$$;

-- =============================================================================
-- 確認クエリ（実行後にこれで動作確認する）
-- =============================================================================
-- SELECT * FROM get_position_win_rates(
--   ARRAY['20da469df4c306f0', '1a4c8a155759b123'],
--   'all'
-- );
--
-- 期待される返却例:
-- canonical_hash    | wins_black | wins_white | draws | total | win_rate_black | win_rate_white | confidence
-- ------------------+------------+------------+-------+-------+----------------+----------------+------------
-- 20da469df4c306f0  |          2 |         17 |     0 |    19 |          10.53 |          89.47 | reference
-- 1a4c8a155759b123  |          1 |          7 |     0 |     8 |          12.50 |          87.50 | reference
