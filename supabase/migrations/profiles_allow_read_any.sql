-- ① 認証済みユーザーが他のユーザーのプロフィールを読めるようにする
-- (オンライン対戦中の相手名表示に必要)

CREATE POLICY "users_can_read_any_profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- ② SECURITY DEFINER 関数（RLS をバイパスしてプロフィールを返す）
-- profiles テーブルの RLS に依存せず確実に動作するフォールバック

CREATE OR REPLACE FUNCTION get_public_profile(user_id UUID)
RETURNS TABLE(display_name TEXT, stats_public BOOLEAN)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT display_name, stats_public
  FROM profiles
  WHERE id = user_id;
$$;
