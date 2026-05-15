-- =============================================================================
-- Phase P-1: 履歴制限 RPC — get_user_match_history
-- free: 直近10局 / pro (active, 期間内): 全件
-- SECURITY DEFINER でクライアント偽装（plan 改ざん）を防ぐ
-- 実行方法: Naoya が Supabase SQL Editor で実行する
-- =============================================================================

CREATE OR REPLACE FUNCTION get_user_match_history()
RETURNS SETOF match_logs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.*
  FROM match_logs m
  JOIN profiles p ON p.id = m.user_id
  WHERE m.user_id = auth.uid()
  ORDER BY m.created_at DESC
  LIMIT CASE
    WHEN p.plan = 'pro'
         AND p.subscription_status = 'active'
         AND (p.current_period_end IS NULL OR p.current_period_end > now())
    THEN NULL   -- pro active: 全件（LIMIT なし）
    ELSE 10     -- free / inactive: 直近10局
  END;
$$;

-- authenticated ユーザーのみ実行可能
GRANT EXECUTE ON FUNCTION get_user_match_history() TO authenticated;

-- anon には付与しない（明示的に拒否）
REVOKE EXECUTE ON FUNCTION get_user_match_history() FROM anon;

-- =============================================================================
-- 確認クエリ（実行後にこれで状態を確認する）
-- =============================================================================
-- SELECT routine_name, security_type
-- FROM information_schema.routines
-- WHERE routine_schema = 'public' AND routine_name = 'get_user_match_history';
--
-- -- 動作確認（認証済みセッションで実行）:
-- SELECT count(*) FROM get_user_match_history();
