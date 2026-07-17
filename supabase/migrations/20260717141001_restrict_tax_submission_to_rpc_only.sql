-- F-08: Restrict prize_temp_tax_submissions INSERT to RPC only
--
-- 目的: prize_temp_tax_submissions への直接 INSERT 経路を閉鎖し、
--       SECURITY DEFINER RPC submit_prize_tax_submission 経由のみを許可する。
--
-- 変更内容:
--   1. REVOKE INSERT FROM authenticated
--   2. REVOKE INSERT FROM anon
--   3. DROP POLICY prize_temp_tax_insert_own
--
-- 維持する権限:
--   - authenticated: SELECT
--   - anon: SELECT
--   - service_role: ALL
--   - RPC submit_prize_tax_submission: EXECUTE (authenticated) — 変更なし
--
-- データ変更なし。他テーブル変更なし。

-- 1. authenticated ロールの INSERT 権限を撤去
REVOKE INSERT ON TABLE public.prize_temp_tax_submissions FROM authenticated;

-- 2. anon ロールの INSERT 権限を撤去
REVOKE INSERT ON TABLE public.prize_temp_tax_submissions FROM anon;

-- 3. authenticated 向け INSERT RLS policy を削除
DROP POLICY IF EXISTS prize_temp_tax_insert_own ON public.prize_temp_tax_submissions;
