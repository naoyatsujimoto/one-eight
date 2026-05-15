-- =============================================================================
-- Phase P-1: profiles に課金状態カラムを追加
-- 実行方法: Naoya が Supabase SQL Editor で実行する
-- 冪等設計: IF NOT EXISTS / IF EXISTS 使用（再実行可能）
-- =============================================================================

-- 1. 課金カラム追加
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS paddle_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS paddle_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;

-- 2. プラン判定インデックス
CREATE INDEX IF NOT EXISTS idx_profiles_plan_status
  ON profiles (plan, subscription_status);

-- =============================================================================
-- 3. 課金カラムへのクライアント直接更新を禁止（RESTRICTIVE policy）
-- authenticated ユーザーは display_name / stats_public 等の非課金カラムのみ更新可
-- plan / subscription_status / paddle_* / current_period_end はクライアントから変更不可
-- service_role は RLS をバイパスするため制限なし（Supabase デフォルト動作）
-- =============================================================================

-- 既存の同名ポリシーがあれば削除（冪等のため）
DROP POLICY IF EXISTS "users cannot update subscription fields" ON profiles;

CREATE POLICY "users cannot update subscription fields"
  ON profiles
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    -- 課金関連カラムが変更されていないことを検証
    -- NEW.plan = OLD.plan かつ NEW.subscription_status = OLD.subscription_status
    plan = (SELECT p.plan FROM profiles p WHERE p.id = auth.uid()) AND
    subscription_status = (SELECT p.subscription_status FROM profiles p WHERE p.id = auth.uid())
  );

-- =============================================================================
-- 確認クエリ（実行後にこれで状態を確認する）
-- =============================================================================
-- -- カラム確認
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'profiles'
-- ORDER BY ordinal_position;
--
-- -- RLS ポリシー確認
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'profiles';
--
-- -- インデックス確認
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'profiles' AND indexname = 'idx_profiles_plan_status';
