-- F-06: profiles 課金・権限カラムの更新経路閉鎖
-- Allowlist 方式: テーブル単位 UPDATE を全ロールから REVOKE し、
-- authenticated には一般プロフィール列のみ column-level UPDATE を再付与する。
--
-- Allowlist（クライアント更新必要列）:
--   display_name  - App.tsx / UserPage.tsx
--   lang          - src/lib/lang.tsx
--   stats_public  - UserPage.tsx
--
-- Protected（クライアント更新禁止）:
--   plan, subscription_status, current_period_end,
--   paddle_customer_id, paddle_subscription_id, paddle_last_event_at,
--   is_test_account, is_admin, id, created_at
--
-- service_role / Paddle webhook / SECURITY DEFINER RPC は
-- RLS をバイパスするため影響なし。

-- 1. テーブル単位 UPDATE を PUBLIC / anon / authenticated から REVOKE
REVOKE UPDATE ON TABLE public.profiles FROM PUBLIC;
REVOKE UPDATE ON TABLE public.profiles FROM anon;
REVOKE UPDATE ON TABLE public.profiles FROM authenticated;

-- 2. authenticated へ一般プロフィール列のみ column-level UPDATE を再付与
--    (anon には付与しない)
GRANT UPDATE (display_name) ON TABLE public.profiles TO authenticated;
GRANT UPDATE (lang)         ON TABLE public.profiles TO authenticated;
GRANT UPDATE (stats_public) ON TABLE public.profiles TO authenticated;
