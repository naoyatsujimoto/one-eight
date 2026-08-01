import { useEffect, useState } from 'react';
import { getPublishedJournalArticleBySlug, resolveJournalLang } from '../lib/journal';
import type { JournalArticleDetail, JournalLang } from '../lib/journal';
import { getJournalArticleImages } from '../lib/journalImages';
import { getJournalUi } from '../lib/journalUi';
import { useLang } from '../lib/lang';
import { formatDate } from '../lib/localeFormat';
import { SUPPORTED_LOCALES } from '../lib/locales';
import type { LocaleCode } from '../lib/locales';
import { CompactLanguageSelector } from './CompactLanguageSelector';
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
  const { lang: ctxLang, setLang } = useLang();

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

  // journalLang: JournalLang への変換 (DB取得用)
  const journalLang: JournalLang = resolveJournalLang(selectedLocale);
  const ui = getJournalUi(selectedLocale);

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
    setLang(code);
    const url = new URL(window.location.href);
    url.searchParams.set('lang', code);
    window.history.replaceState(null, '', url.toString());
  }

  function formatDateStr(iso: string): string {
    return formatDate(iso, selectedLocale, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // fallback notice 文言 (要求言語の翻訳が存在しない場合のみ)
  function buildFallbackNotice(articleLang: JournalLang): string {
    if (articleLang === journalLang) return '';
    return ui.fallbackNotice(selectedLocale, articleLang);
  }

  if (!slug) return null;

  return (
    <div className="ja-page">
      {/* Header */}
      <header className="ja-header">
        <a href="/journal/" className="ja-wordmark ja-wordmark-journal">ONE EIGHT Journal</a>
        <div className="ja-header-right">
          <nav className="ja-nav">
            <a
              href={`/journal/${selectedLocale !== 'en' ? `?lang=${selectedLocale}` : ''}`}
              className="ja-nav-link"
            >
              ← Journal
            </a>
          </nav>
          {/* Compact language selector */}
          <CompactLanguageSelector
            selectedLocale={selectedLocale}
            onSelect={handleLocaleChange}
          />
        </div>
      </header>

      <main className="ja-main">
        {/* Loading */}
        {loading && (
          <div className="ja-state">
            <span className="ja-state-text">{ui.loading}</span>
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
              {ui.articleNotFound}
            </p>
            <a
              href={`/journal/${selectedLocale !== 'en' ? `?lang=${selectedLocale}` : ''}`}
              className="ja-back-link"
            >
              ← {ui.backToJournal}
            </a>
          </div>
        )}

        {/* Article */}
        {!loading && !error && !notFound && article && (() => {
          const t = article.translation;
          const notice = t ? buildFallbackNotice(t.lang) : '';
          return (
            <article className="ja-article">
              {/* Fallback notice: 要求言語の翻訳が存在しない場合のみ */}
              {article.fallback && notice && (
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
                <time className="ja-article-date">{formatDateStr(article.published_at)}</time>
              </div>

              {/* Title */}
              <h1 className="ja-article-title">
                {t ? t.title : <span className="ja-no-translation">[{ui.noTranslation}]</span>}
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
                    {ui.noContent}
                  </span>
                </div>
              )}

              {/* References */}
              {article.references.length > 0 && (
                <section className="ja-references">
                  <h2 className="ja-references-title">
                    {ui.references}
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
                <a
                  href={`/journal/${selectedLocale !== 'en' ? `?lang=${selectedLocale}` : ''}`}
                  className="ja-back-link"
                >
                  ← {ui.backToJournal}
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
            {ui.playOneEight}
          </a>
        </div>
      </footer>
    </div>
  );
}
