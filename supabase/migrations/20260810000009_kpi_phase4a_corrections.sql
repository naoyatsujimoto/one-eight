-- =============================================================================
-- 20260810000009_kpi_phase4a_corrections.sql
-- KPI Phase 4-A 補正: rate-limit overload 曖昧エラーの修正
--
-- 根本原因: _kpi_check_rate_limit(TEXT, INTEGER, INTEGER DEFAULT 60) が
--   RETURN _kpi_check_rate_limit(p_bucket_key, p_limit); と schema 未修飾で
--   呼ぶため、DEFAULT が両シグネチャに一致し "is not unique" エラーが発生。
--
-- 修正:
--   1. 3引数版の DEFAULT 60 を除去（p_window_secs INTEGER、DEFAULT なし）
--   2. 委譲呼び出しを public._kpi_check_rate_limit(p_bucket_key, p_limit) と schema 修飾
--   3. 権限は変更なし
--
-- official_kpi_start_at: NULL 維持（変更なし）
-- =============================================================================

-- PostgreSQL では CREATE OR REPLACE では既存関数の DEFAULT を除去できないため、
-- DROP してから CREATE する。
DROP FUNCTION IF EXISTS public._kpi_check_rate_limit(TEXT, INTEGER, INTEGER);

CREATE FUNCTION public._kpi_check_rate_limit(
  p_bucket_key  TEXT,
  p_limit       INTEGER,
  p_window_secs INTEGER   -- DEFAULT を除去して曖昧さを解消
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- p_window_secs は無視（60秒固定）
  -- schema 修飾で明示的に 2 引数版を呼ぶ
  RETURN public._kpi_check_rate_limit(p_bucket_key, p_limit);
END;
$$;

REVOKE ALL ON FUNCTION public._kpi_check_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._kpi_check_rate_limit(TEXT, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public._kpi_check_rate_limit(TEXT, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._kpi_check_rate_limit(TEXT, INTEGER, INTEGER)
  TO service_role, postgres;
