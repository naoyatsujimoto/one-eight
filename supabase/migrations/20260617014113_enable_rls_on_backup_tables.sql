-- =============================================================================
-- enable_rls_on_backup_tables
-- 目的: RLS無効バックアップテーブルへの直接アクセスをロック
--       Supabase Security Advisor "rls_disabled_in_public" 警告解消
-- 方針: RLS有効化のみ。policy追加なし（policy 0件 = service_role 専用状態）
--       DROP TABLE は実施しない
-- =============================================================================

-- 1. バックアップ3テーブルのRLS有効化
ALTER TABLE IF EXISTS public.profiles_backup_before_paddle ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.official_matches_backup_before_om1e_20260531 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.online_games_backup_before_om1e_20260531 ENABLE ROW LEVEL SECURITY;

-- 2. match_logs: TO public の古いpolicyを削除
--    security_hardening_p1 以後、TO authenticated の現行policyが有効であり不要
--    (TO authenticated の "users select own match_logs" / "users insert own match_logs" は維持)
DROP POLICY IF EXISTS "Users can select own logs" ON public.match_logs;
DROP POLICY IF EXISTS "Users can insert own logs" ON public.match_logs;
