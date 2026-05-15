-- =============================================================================
-- Phase P-1: セキュリティ強化
-- match_logs RLS 確認 + 統計テーブルの anon 権限削除
-- 実行方法: Naoya が Supabase SQL Editor で実行する
-- 冪等設計: DROP POLICY IF EXISTS / IF NOT EXISTS 使用（再実行可能）
-- =============================================================================

-- =============================================================================
-- 1. match_logs RLS 有効化確認（既存migrationで設定済みだが念のため冪等実行）
-- =============================================================================
ALTER TABLE match_logs ENABLE ROW LEVEL SECURITY;

-- match_logs RLS ポリシー: 既存migrationに定義済みだが冪等のため再確認
-- (position_stats_and_canonical_hashes.sql で定義済み)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'match_logs' AND policyname = 'users select own match_logs'
  ) THEN
    CREATE POLICY "users select own match_logs"
      ON match_logs FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'match_logs' AND policyname = 'users insert own match_logs'
  ) THEN
    CREATE POLICY "users insert own match_logs"
      ON match_logs FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- =============================================================================
-- 2. 統計テーブルの anon 読み取り権限を削除
-- 対象: medium_pattern_stats / sim_medium_pattern_stats / sim_position_only_stats
--       position_stats / symmetry_group_stats
-- 背景:
--   - sim_position_only_stats: sim_position_only_stats_rls_and_grants.sql で anon GRANT 済み
--   - position_stats / symmetry_group_stats: position_stats_and_canonical_hashes.sql で
--     TO public ポリシー（anon 含む）が設定済み
--   - medium_pattern_stats / sim_medium_pattern_stats: GRANT 記述なし（デフォルト権限）
-- 方針: anon → REVOKE / authenticated のみ → GRANT
-- =============================================================================

-- sim_position_only_stats: 既存 anon GRANT を削除
REVOKE SELECT ON public.sim_position_only_stats FROM anon;

-- その他の統計テーブル（念のため REVOKE）
REVOKE SELECT ON public.medium_pattern_stats FROM anon;
REVOKE SELECT ON public.sim_medium_pattern_stats FROM anon;
REVOKE SELECT ON public.position_stats FROM anon;
REVOKE SELECT ON public.symmetry_group_stats FROM anon;

-- authenticated のみ読み取り許可
GRANT SELECT ON public.medium_pattern_stats TO authenticated;
GRANT SELECT ON public.sim_medium_pattern_stats TO authenticated;
GRANT SELECT ON public.sim_position_only_stats TO authenticated;
GRANT SELECT ON public.position_stats TO authenticated;
GRANT SELECT ON public.symmetry_group_stats TO authenticated;

-- service_role には全権限維持（Supabase のデフォルトだが明示）
GRANT ALL ON public.medium_pattern_stats TO service_role;
GRANT ALL ON public.sim_medium_pattern_stats TO service_role;
GRANT ALL ON public.sim_position_only_stats TO service_role;
GRANT ALL ON public.position_stats TO service_role;
GRANT ALL ON public.symmetry_group_stats TO service_role;

-- =============================================================================
-- 3. 統計テーブルの RLS ポリシー: anon 対象を authenticated のみに変更
-- =============================================================================

-- medium_pattern_stats: 既存 "allow_read_medium_pattern_stats" は TO public だが
-- RLS Policy の USING(true) のみでは GRANT が有効な role のみアクセス可
-- → REVOKE により anon は実質排除される。RLS ポリシー自体は再定義（authenticated 限定）

DROP POLICY IF EXISTS "allow_read_medium_pattern_stats" ON public.medium_pattern_stats;
CREATE POLICY "allow_read_medium_pattern_stats"
  ON public.medium_pattern_stats
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "allow_read_sim_medium_pattern_stats" ON public.sim_medium_pattern_stats;
CREATE POLICY "allow_read_sim_medium_pattern_stats"
  ON public.sim_medium_pattern_stats
  FOR SELECT
  TO authenticated
  USING (true);

-- sim_position_only_stats: 既存 "public can read sim_position_only_stats" を更新
DROP POLICY IF EXISTS "public can read sim_position_only_stats" ON public.sim_position_only_stats;
CREATE POLICY "authenticated can read sim_position_only_stats"
  ON public.sim_position_only_stats
  FOR SELECT
  TO authenticated
  USING (true);

-- position_stats: "public read position_stats" を authenticated 限定に変更
DROP POLICY IF EXISTS "public read position_stats" ON public.position_stats;
CREATE POLICY "authenticated read position_stats"
  ON public.position_stats
  FOR SELECT
  TO authenticated
  USING (true);

-- symmetry_group_stats: "public read symmetry_group_stats" を authenticated 限定に変更
DROP POLICY IF EXISTS "public read symmetry_group_stats" ON public.symmetry_group_stats;
CREATE POLICY "authenticated read symmetry_group_stats"
  ON public.symmetry_group_stats
  FOR SELECT
  TO authenticated
  USING (true);

-- =============================================================================
-- 確認クエリ（実行後にこれで状態を確認する）
-- =============================================================================
-- -- GRANT 確認
-- SELECT grantee, table_name, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_name IN (
--   'medium_pattern_stats', 'sim_medium_pattern_stats',
--   'sim_position_only_stats', 'position_stats', 'symmetry_group_stats'
-- )
-- ORDER BY table_name, grantee;
--
-- -- RLS ポリシー確認
-- SELECT tablename, policyname, roles, cmd
-- FROM pg_policies
-- WHERE tablename IN (
--   'medium_pattern_stats', 'sim_medium_pattern_stats',
--   'sim_position_only_stats', 'position_stats', 'symmetry_group_stats',
--   'match_logs'
-- )
-- ORDER BY tablename;
