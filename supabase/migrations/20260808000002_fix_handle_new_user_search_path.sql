-- Phase D補正: handle_new_user search_path を '' に変更
--
-- 背景:
--   20260808000001_profiles_trigger_and_backfill.sql（本番適用済み）で
--   SET search_path = public を指定していた。
--   Supabase Security Advisor の推奨に従い、SECURITY DEFINER 関数の
--   search_path を空文字列 '' に変更し、search path hijacking を防ぐ。
--
-- 変更点:
--   - SET search_path = public → SET search_path = ''
--   - pg_catalog.now() を完全修飾（search_path = '' のため必要）
--   - public.profiles は引き続き完全修飾
--
-- 注意:
--   本番適用済み migration（20260808000001_*）は編集しない。
--   本migrationで上書き定義する。

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, lang, created_at)
  VALUES (
    NEW.id,
    NULL,
    'ja',
    pg_catalog.now()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
