import { useEffect, useState } from 'react';
import { getPublishedJournalArticleBySlug, resolveJournalLang } from '../lib/journal';
import type { JournalArticleDetail, JournalLang } from '../lib/journal';
import { getJournalArticleImages } from '../lib/journalImages';
import { useLang } from '../lib/lang';
import { SUPPORTED_LOCALES } from '../lib/locales';
import type { LocaleCode } from '../lib/locales';
import './JournalArticlePage.css';

/**
 * JournalArticlePage — /journal-db/:slug
 *
 * AuthGate 外で直接レンダリングされる。ログイン不要。
 *
 * i18n: selectedLocale は10言語 (LocaleCode)
 *       DB取得用 journalLang は resolveJournalLang() で en/ja に変換
 *       non-en/ja は English fallback として記事本文を表示する
 *
 * SECURITY NOTE:
 * body_html は dangerouslySetInnerHTML で表示する。
 * DB上の承認済み記事本文のみを表示する前提。外部ユーザー投稿なし。
 * admin 登録フロー実装前に sanitize 方針が必要（DOMPurify 等の導入を検討のこと）。
 */
export function JournalArticlePage() {
  const { lang: ctxLang } = useLang();

  // slug: /journal/:slug または /journal-db/:slug の両方に対応
  const slug = (() => {
    const m = window.location.pathname.match(/^\/journal(?:-db)?\/(.+)$/);
    return m ? m[1] : '';
  })();

  // URL query ?lang=xx を優先、なければ LangProvider の値
  const initLocale: LocaleCode = (() => {
    const params = new URLSearchParams(window.location.search);
    const qLang = params.get('lang');
    if (qLang && SUPPORTED_LOCALES.some(l => l.code === qLang)) {
      return qLang as LocaleCode;
    }
    return ctxLang as LocaleCode;
  })();

  const [selectedLocale, setSelectedLocale] = useState<LocaleCode>(initLocale);
  const [article, setArticle] = useState<JournalArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // journalLang: en/ja への変換 (DB取得用)
  const journalLang: JournalLang = resolveJournalLang(selectedLocale);
  // 表示用 UI fallback フラグ (英語以外の非対応言語を選択中)
  const isLocaleFallback = selectedLocale !== 'en' && selectedLocale !== 'ja';

  // slug が空なら ListPage へ redirect
  useEffect(() => {
    if (!slug) {
      window.location.replace('/journal/');
    }
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    getPublishedJournalArticleBySlug(slug, journalLang).then(({ article: a, error: err }) => {
      if (err) {
        setError(err);
        setArticle(null);
      } else if (!a) {
        setNotFound(true);
        setArticle(null);
      } else {
        setArticle(a);
      }
      setLoading(false);
    });
  }, [slug, journalLang]);

  function handleLocaleChange(code: LocaleCode) {
    setSelectedLocale(code);
    const url = new URL(window.location.href);
    url.searchParams.set('lang', code);
    window.history.replaceState(null, '', url.toString());
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(journalLang === 'ja' ? 'ja-JP' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  // fallback notice 文言 (locale fallback + article fallback を統合)
  function buildFallbackNotice(articleLang: JournalLang): string {
    if (isLocaleFallback) {
      // 非対応言語を選択中 → 常に English fallback 旨を表示
      return 'This article is currently available in English and Japanese only.';
    }
    if (journalLang === 'en' && articleLang === 'ja') {
      return 'This article is currently available in Japanese only.';
    }
    if (journalLang === 'ja' && articleLang === 'en') {
      return 'この記事は現在英語のみです。';
    }
    return '';
  }

  if (!slug) return null;

  return (
    <div className="ja-page">
      {/* Header */}
      <header className="ja-header">
        <a href="/journal/" className="ja-wordmark ja-wordmark-journal">ONE EIGHT Journal</a>
        <div className="ja-header-right">
          <nav className="ja-nav">
            <a href="/journal/" className="ja-nav-link">
              ← Journal
            </a>
          </nav>
          {/* 10-locale pill grid */}
          <div className="ja-lang-switcher">
            {SUPPORTED_LOCALES.map(({ code, label }) => (
              <button
                key={code}
                type="button"
                className={`ja-lang-btn${selectedLocale === code ? ' active' : ''}`}
                onClick={() => handleLocaleChange(code as LocaleCode)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="ja-main">
        {/* Loading */}
        {loading && (
          <div className="ja-state">
            <span className="ja-state-text">{journalLang === 'ja' ? '読み込み中…' : 'Loading…'}</span>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="ja-state ja-state-error">
            <span className="ja-state-text">{error}</span>
          </div>
        )}

        {/* Not found */}
        {!loading && !error && notFound && (
          <div className="ja-state">
            <p className="ja-state-text">
              {journalLang === 'ja' ? '記事が見つかりません。' : 'Article not found.'}
            </p>
            <a href="/journal/" className="ja-back-link">
              {journalLang === 'ja' ? '← Journal 一覧に戻る' : '← Back to Journal'}
            </a>
          </div>
        )}

        {/* Article */}
        {!loading && !error && !notFound && article && (() => {
          const t = article.translation;
          const notice = t ? buildFallbackNotice(t.lang) : '';
          return (
            <article className="ja-article">
              {/* Fallback notice: locale fallback or article fallback */}
              {(isLocaleFallback || article.fallback) && notice && (
                <div className="ja-fallback-notice">{notice}</div>
              )}

              {/* Hero image */}
              {(() => {
                const imgs = getJournalArticleImages(article.slug);
                if (!imgs) return null;
                return (
                  <div className="ja-hero-image-wrap">
                    <img
                      src={imgs.hero}
                      alt={imgs.alt}
                      className="ja-hero-image"
                      width={1200}
                      height={630}
                      loading="eager"
                    />
                  </div>
                );
              })()}

              {/* Header meta */}
              <div className="ja-article-meta">
                <time className="ja-article-date">{formatDate(article.published_at)}</time>
              </div>

              {/* Title */}
              <h1 className="ja-article-title">
                {t ? t.title : <span className="ja-no-translation">[No translation]</span>}
              </h1>

              {/* Author */}
              <p className="ja-article-author">{article.author_label}</p>

              <hr className="ja-divider" />

              {/* Body */}
              {t?.body_html ? (
                /*
                 * SECURITY NOTE:
                 * DB上の承認済み記事本文のみを表示する前提。外部ユーザー投稿なし。
                 * admin 登録フロー実装前に sanitize 方針が必要（DOMPurify 等の導入を検討のこと）。
                 */
                <div
                  className="ja-article-body journal-body"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: t.body_html }}
                />
              ) : (
                <div className="ja-state">
                  <span className="ja-state-text">
                    {journalLang === 'ja' ? '本文がありません。' : 'No content available.'}
                  </span>
                </div>
              )}

              {/* References */}
              {article.references.length > 0 && (
                <section className="ja-references">
                  <h2 className="ja-references-title">
                    {journalLang === 'ja' ? '参考文献' : 'References'}
                  </h2>
                  <ol className="ja-references-list">
                    {article.references
                      .slice()
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map(ref => (
                        <li key={ref.id} className="ja-reference-item">
                          <span className="ja-ref-text">{ref.ref_text}</span>
                          {(ref.doi || ref.url) && (
                            <a
                              href={ref.doi ? `https://doi.org/${ref.doi}` : ref.url ?? '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ja-ref-link"
                            >
                              {ref.doi ? `doi:${ref.doi}` : ref.url}
                            </a>
                          )}
                        </li>
                      ))}
                  </ol>
                </section>
              )}

              <hr className="ja-divider" />

              {/* Navigation */}
              <div className="ja-article-nav">
                <a href="/journal/" className="ja-back-link">
                  {journalLang === 'ja' ? '← Journal 一覧に戻る' : '← Back to Journal'}
                </a>
              </div>

              {/* Play ONE EIGHT CTA: 削除済み (4-6) */}
            </article>
          );
        })()}
      </main>

      {/* Footer */}
      <footer className="ja-footer">
        <div className="ja-footer-play-wrap">
          <a href="/" className="ja-footer-play-link">
            {journalLang === 'ja'
              ? '競技性ボードゲーム ONE EIGHTをプレイする'
              : 'Play ONE EIGHT, a competitive abstract board game'}
          </a>
        </div>
      </footer>
    </div>
  );
}
