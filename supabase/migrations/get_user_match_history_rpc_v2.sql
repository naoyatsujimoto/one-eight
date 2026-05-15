-- Phase P-1 fix: get_user_match_history RPC (plpgsql版)
-- LANGUAGE sql では LIMIT に動的値を使えないため plpgsql に変更
-- free: 直近10局 / pro active: 全件
-- SECURITY DEFINER でクライアント偽装を防ぐ

CREATE OR REPLACE FUNCTION get_user_match_history()
RETURNS SETOF match_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan TEXT;
  v_status TEXT;
  v_period_end TIMESTAMPTZ;
  v_is_pro BOOLEAN;
BEGIN
  -- 呼び出しユーザーのプラン取得
  SELECT plan, subscription_status, current_period_end
  INTO v_plan, v_status, v_period_end
  FROM profiles
  WHERE id = auth.uid();

  -- pro 判定
  v_is_pro := (
    v_plan = 'pro'
    AND v_status = 'active'
    AND (v_period_end IS NULL OR v_period_end > now())
  );

  IF v_is_pro THEN
    -- 有料: 全件
    RETURN QUERY
      SELECT m.*
      FROM match_logs m
      WHERE m.user_id = auth.uid()
      ORDER BY m.created_at DESC;
  ELSE
    -- 無料: 直近10局
    RETURN QUERY
      SELECT m.*
      FROM match_logs m
      WHERE m.user_id = auth.uid()
      ORDER BY m.created_at DESC
      LIMIT 10;
  END IF;
END;
$$;

-- authenticated ユーザーのみ実行可能
GRANT EXECUTE ON FUNCTION get_user_match_history() TO authenticated;
-- anon には付与しない
REVOKE EXECUTE ON FUNCTION get_user_match_history() FROM anon;

-- 確認クエリ:
-- SELECT routine_name, security_type, external_language
-- FROM information_schema.routines
-- WHERE routine_name = 'get_user_match_history';
