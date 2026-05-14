-- =============================================================================
-- Migration: sim_position_only_stats — RLS 有効化 + GRANT 付与
-- =============================================================================
-- 背景: sim_position_only_stats は RLS 未設定・GRANT 未設定のまま作成されていた。
--       Supabase Data API 仕様変更（2026-10-30〜 既存 project にも適用）への対応。
-- 実行方法: Supabase SQL Editor にこのファイルの内容を貼り付けて実行
-- 冪等設計: DROP POLICY IF EXISTS 使用（再実行可能）
-- =============================================================================

-- 1. RLS 有効化
ALTER TABLE public.sim_position_only_stats ENABLE ROW LEVEL SECURITY;

-- 2. GRANT
GRANT SELECT ON public.sim_position_only_stats TO anon;
GRANT SELECT ON public.sim_position_only_stats TO authenticated;
GRANT ALL    ON public.sim_position_only_stats TO service_role;

-- 3. RLS Policy: anon / authenticated — SELECT のみ
DROP POLICY IF EXISTS "public can read sim_position_only_stats" ON public.sim_position_only_stats;
CREATE POLICY "public can read sim_position_only_stats"
  ON public.sim_position_only_stats
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 4. RLS Policy: service_role — 全操作（シミュレーション書き込み用）
DROP POLICY IF EXISTS "service role can manage sim_position_only_stats" ON public.sim_position_only_stats;
CREATE POLICY "service role can manage sim_position_only_stats"
  ON public.sim_position_only_stats
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 確認クエリ（実行後にこれで状態を確認する）
-- =============================================================================
-- SELECT grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_name = 'sim_position_only_stats' AND table_schema = 'public'
-- ORDER BY grantee, privilege_type;
--
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public' AND tablename = 'sim_position_only_stats';
--
-- SELECT policyname, roles, cmd
-- FROM pg_policies
-- WHERE tablename = 'sim_position_only_stats';
