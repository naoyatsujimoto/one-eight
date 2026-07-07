-- migration: journal_lang_ten_languages
-- 目的: journal_article_translations.lang の check 制約を 10 言語に拡張
-- 対象: public.journal_article_translations
-- 影響: lang 制約のみ変更。既存 en/ja データは保持される。
-- 非影響: RLS ポリシー / その他カラム / インデックス / トリガーは変更なし

ALTER TABLE public.journal_article_translations
  DROP CONSTRAINT IF EXISTS journal_article_translations_lang_check;

ALTER TABLE public.journal_article_translations
  ADD CONSTRAINT journal_article_translations_lang_check
  CHECK (lang IN (
    'en',
    'ja',
    'zh-Hant',
    'zh-Hans',
    'ko',
    'es',
    'pt-BR',
    'de',
    'fr',
    'it'
  ));

comment on column public.journal_article_translations.lang
  is 'en / ja / zh-Hant / zh-Hans / ko / es / pt-BR / de / fr / it';
