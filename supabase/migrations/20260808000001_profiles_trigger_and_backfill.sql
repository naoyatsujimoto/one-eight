-- Phase D: profiles行自動作成trigger追加 + 欠落行backfill
--
-- 背景:
--   auth.usersへのINSERT時にpublic.profiles行を自動作成するtriggerが
--   存在しなかった。これによりサインアップ後にprofiles行が作成されない
--   ケースが発生していた（4件確認済み）。
--   クライアント側のupsert（INSERT + ON CONFLICT）は
--   authenticatedロールにINSERT権限がないため失敗していた。
--
-- 対応:
--   1. handle_new_user() SECURITY DEFINER関数を作成
--   2. auth.users AFTER INSERT triggerを作成
--   3. 既存の欠落4件をbackfill
--
-- 安全性:
--   - SECURITY DEFINER + SET search_path = public で固定
--   - 完全修飾名 public.profiles を使用
--   - ON CONFLICT (id) DO NOTHING で冪等
--   - protected column（plan, subscription_status, is_admin 等）は
--     Column defaultのみ使用。Auth metadataから流し込まない
--   - display_name は NULL で作成（ユーザーが初回ログイン後にUPDATEで設定）
--   - クライアントへのINSERT権限は付与しない

-- ── 1. trigger function ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, lang, created_at)
  VALUES (
    NEW.id,
    NULL,       -- display_name: クライアントがUPDATEで設定
    'ja',       -- lang: デフォルト日本語（既存スキーマのDEFAULT値と整合）
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- anon/authenticatedへの直接EXECUTE権限は不要（triggerからのみ呼ばれる）
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- ── 2. trigger on auth.users ──────────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ── 3. backfill: 欠落profiles行を安全に作成 ──────────────────────────────────
--
-- 対象: auth.usersに存在するがpublic.profilesに行がないユーザー
-- display_name: NULL（raw_user_meta_dataに信頼できる名前情報なし）
-- protected column: Column defaultのみ（plan='free', subscription_status='inactive',
--   is_admin=false, is_internal_test_account=false 等）
-- AI確認アカウント（is_internal_test_account=true）は既存profiles行あり → 影響なし

INSERT INTO public.profiles (id, display_name, lang, created_at)
SELECT
  au.id,
  NULL       AS display_name,
  'ja'       AS lang,
  au.created_at
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- ── 確認用クエリ（実行後にコメントアウト）──────────────────────────────────────
-- SELECT
--   (SELECT COUNT(*) FROM auth.users) AS auth_users,
--   (SELECT COUNT(*) FROM public.profiles) AS profiles,
--   (SELECT COUNT(*) FROM auth.users au LEFT JOIN public.profiles p ON p.id=au.id WHERE p.id IS NULL) AS still_missing;
