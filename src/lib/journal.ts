/**
 * journal.ts — Journal published-article read access layer
 *
 * i18n note:
 *   - JournalLang covers DB translation columns: 'en' | 'ja'
 *   - UI locale (LocaleCode) supports 10 languages; non-en/ja fall back to 'en'
 *   - Use resolveJournalLang() to convert a LocaleCode to a JournalLang for DB queries
 *
 * Step C-1: 公開記事読み取りDBアクセス層
 *
 * 方針:
 *   - RLS + クエリ両方で published 条件を明示する
 *   - RPC は使わず Supabase client で直接 select
 *   - fallback ロジックは純粋関数として切り出し (テスト容易性)
 *   - エラーは握り潰さず { data, error } 形式で返す
 *   - DBに published 記事が 0 件でも正常に空配列/null を返す
 *
 * 今回やらないこと:
 *   - メール送信 / unsubscribe 処理
 *   - admin 記事登録 / journal_mail_issues / journal_delivery_history 操作
 *   - journal_email_preferences 更新
 *   - profiles / ゲーム本体 / 課金 / official_matches / arena 変更
 */

import { supabase } from './supabase';
import type { LocaleCode } from './locales';

// ─── Types ────────────────────────────────────────────────────────────────────

/** 対応言語 */
export type JournalLang = 'en' | 'ja';

/** 翻訳データ */
export interface JournalTranslation {
  id: string;
  article_id: string;
  lang: JournalLang;
  title: string;
  excerpt: string | null;
  is_primary: boolean;
}

/** 参考文献 */
export interface JournalReference {
  id: string;
  article_id: string;
  sort_order: number;
  ref_text: string;
  doi: string | null;
  url: string | null;
}

/** 記事一覧用サマリー */
export interface JournalArticleSummary {
  id: string;
  slug: string;
  status: 'published';
  published_at: string;
  author_label: string;
  tags: string[];
  /** 表示に使う翻訳 (fallbackを考慮した結果) */
  translation: JournalTranslation | null;
  /** fallbackが発生した場合 true */
  fallback: boolean;
}

/** 記事詳細 */
export interface JournalArticleDetail {
  id: string;
  slug: string;
  status: 'published';
  published_at: string;
  author_label: string;
  tags: string[];
  /** 表示に使う翻訳 */
  translation: JournalTranslationDetail | null;
  /** fallbackが発生した場合 true */
  fallback: boolean;
  /** 参考文献リスト (sort_order asc) */
  references: JournalReference[];
}

/** 記事詳細用の翻訳データ (body_html 含む) */
export interface JournalTranslationDetail extends JournalTranslation {
  body_html: string;
  meta_title: string | null;
  meta_description: string | null;
}

/** 一覧取得結果 */
export interface JournalListResult {
  data: JournalArticleSummary[] | null;
  error: string | null;
}

/** 詳細取得結果 */
export interface JournalDetailResult {
  article: JournalArticleDetail | null;
  error: string | null;
}

// ─── 言語正規化 ────────────────────────────────────────────────────────────────

/**
 * 文字列を JournalLang に正規化する。
 * 'en' / 'ja' 以外は undefined を返す。
 */
export function normalizeLang(lang: string | null | undefined): JournalLang | undefined {
  if (lang === 'en' || lang === 'ja') return lang;
  return undefined;
}

/**
 * LocaleCode (10 locales) を JournalLang (DB用 en/ja) に変換する。
 * - 'ja' → 'ja'
 * - その他すべて → 'en' (English fallback)
 *
 * Journal記事はDB上 en/ja の2言語のみ保存している。
 * 他言語を選択した場合は English fallback となる。
 */
export function resolveJournalLang(code: LocaleCode | string): JournalLang {
  if (code === 'ja') return 'ja';
  return 'en';
}

// ─── Fallback 純粋関数 ─────────────────────────────────────────────────────────

/**
 * 言語fallback選択ロジック (純粋関数)
 *
 * 優先順:
 *   1. requested lang が存在すればそれを返す
 *   2. is_primary=true のtranslationを返す
 *   3. 'en' があればenを返す
 *   4. 最初に見つかったtranslationを返す
 *   5. translationが1件もない場合はnullを返す
 *
 * @param translations 候補となる翻訳リスト
 * @param requestedLang 要求言語 (undefined なら fallbackから選択)
 * @returns 選択結果とfallbackフラグ
 */
export function selectTranslation<T extends { lang: JournalLang; is_primary: boolean }>(
  translations: T[],
  requestedLang: JournalLang | undefined,
): { translation: T | null; fallback: boolean } {
  if (translations.length === 0) {
    return { translation: null, fallback: false };
  }

  // 1. requested lang が存在すればそれを返す
  if (requestedLang) {
    const exact = translations.find(t => t.lang === requestedLang);
    if (exact) return { translation: exact, fallback: false };
  }

  // 2. is_primary=true のtranslationを返す
  const primary = translations.find(t => t.is_primary);
  if (primary != null) return { translation: primary, fallback: true };

  // 3. en があればenを返す
  const en = translations.find(t => t.lang === 'en');
  if (en != null) return { translation: en, fallback: true };

  // 4. 最初に見つかったtranslationを返す
  return { translation: translations[0] ?? null, fallback: true };
}

// ─── DB 行型 (内部用) ─────────────────────────────────────────────────────────

interface RawArticleRow {
  id: string;
  slug: string;
  status: string;
  published_at: string;
  author_label: string;
  tags: string[];
  journal_article_translations: Array<{
    id: string;
    article_id: string;
    lang: string;
    title: string;
    excerpt: string | null;
    is_primary: boolean;
  }>;
}

interface RawArticleDetailRow extends RawArticleRow {
  journal_article_translations: Array<{
    id: string;
    article_id: string;
    lang: string;
    title: string;
    excerpt: string | null;
    body_html: string;
    meta_title: string | null;
    meta_description: string | null;
    is_primary: boolean;
  }>;
  journal_article_references: Array<{
    id: string;
    article_id: string;
    sort_order: number;
    ref_text: string;
    doi: string | null;
    url: string | null;
  }>;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * 公開済みJournal記事一覧を取得する。
 *
 * - RLS + クエリ両方で published 条件を明示
 * - 言語fallbackあり
 * - 0 件でも正常に空配列を返す
 *
 * @param lang 表示したい言語。未指定の場合は fallback ロジックで選択
 */
export async function listPublishedJournalArticles(
  lang?: JournalLang,
): Promise<JournalListResult> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('journal_articles')
    .select(`
      id,
      slug,
      status,
      published_at,
      author_label,
      tags,
      journal_article_translations (
        id,
        article_id,
        lang,
        title,
        excerpt,
        is_primary
      )
    `)
    .eq('status', 'published')
    .not('published_at', 'is', null)
    .lte('published_at', now)
    .order('published_at', { ascending: false });

  if (error) {
    return { data: null, error: error.message };
  }

  if (!data) {
    return { data: [], error: null };
  }

  const rows = data as unknown as RawArticleRow[];

  const articles: JournalArticleSummary[] = rows.map(row => {
    const rawTranslations = (row.journal_article_translations ?? []).map(t => ({
      id: t.id,
      article_id: t.article_id,
      lang: normalizeLang(t.lang) ?? ('en' as JournalLang),
      title: t.title,
      excerpt: t.excerpt,
      is_primary: t.is_primary,
    }));

    const { translation, fallback } = selectTranslation(rawTranslations, lang);

    return {
      id: row.id,
      slug: row.slug,
      status: 'published' as const,
      published_at: row.published_at,
      author_label: row.author_label,
      tags: row.tags ?? [],
      translation,
      fallback,
    };
  });

  return { data: articles, error: null };
}

/**
 * slug指定で公開済みJournal記事詳細を取得する。
 *
 * - RLS + クエリ両方で published 条件を明示
 * - 言語fallbackあり
 * - 未公開記事や未存在slgは null を返す (errorなし)
 *
 * @param slug 記事のスラッグ
 * @param lang 表示したい言語。未指定の場合は fallback ロジックで選択
 */
export async function getPublishedJournalArticleBySlug(
  slug: string,
  lang?: JournalLang,
): Promise<JournalDetailResult> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('journal_articles')
    .select(`
      id,
      slug,
      status,
      published_at,
      author_label,
      tags,
      journal_article_translations (
        id,
        article_id,
        lang,
        title,
        excerpt,
        body_html,
        meta_title,
        meta_description,
        is_primary
      ),
      journal_article_references (
        id,
        article_id,
        sort_order,
        ref_text,
        doi,
        url
      )
    `)
    .eq('slug', slug)
    .eq('status', 'published')
    .not('published_at', 'is', null)
    .lte('published_at', now)
    .maybeSingle();

  if (error) {
    return { article: null, error: error.message };
  }

  if (!data) {
    // 未存在 or 未公開 — 正常終了 (error なし)
    return { article: null, error: null };
  }

  const row = data as unknown as RawArticleDetailRow;

  const rawTranslations = (row.journal_article_translations ?? []).map(t => ({
    id: t.id,
    article_id: t.article_id,
    lang: normalizeLang(t.lang) ?? ('en' as JournalLang),
    title: t.title,
    excerpt: t.excerpt,
    body_html: t.body_html,
    meta_title: t.meta_title,
    meta_description: t.meta_description,
    is_primary: t.is_primary,
  }));

  const { translation, fallback } = selectTranslation(rawTranslations, lang);

  const references: JournalReference[] = (row.journal_article_references ?? [])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(r => ({
      id: r.id,
      article_id: r.article_id,
      sort_order: r.sort_order,
      ref_text: r.ref_text,
      doi: r.doi,
      url: r.url,
    }));

  return {
    article: {
      id: row.id,
      slug: row.slug,
      status: 'published' as const,
      published_at: row.published_at,
      author_label: row.author_label,
      tags: row.tags ?? [],
      translation,
      fallback,
      references,
    },
    error: null,
  };
}
