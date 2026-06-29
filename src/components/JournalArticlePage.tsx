import { useEffect, useState } from 'react';
import { getPublishedJournalArticleBySlug, normalizeLang } from '../lib/journal';
import type { JournalArticleDetail, JournalLang } from '../lib/journal';
import { useLang } from '../lib/lang';
import './JournalArticlePage.css';

/**
 * JournalArticlePage — /journal-db/:slug
 *
 * AuthGate 外で直接レンダリングされる。ログイン不要。
 *
 * SECURITY NOTE:
 * body_html は dangerouslySetInnerHTML で表示する。
 * DB上の承認済み記事本文のみを表示する前提。外部ユーザー投稿なし。
 * admin 登録フロー実装前に sanitize 方針が必要（DOMPurify 等の導入を検討のこと）。
 */
export function JournalArticlePage() {
  const { lang: ctxLang } = useLang();

  // slug: pathname の /journal-db/ 以降
  const slug = (() => {
    const m = window.location.pathname.match(/^\/journal-db\/(.+)$/);
    return m ? m[1] : '';
  })();

  // URL query ?lang=ja / ?lang=en を優先、なければ LangProvider の値
  const urlLang: JournalLang | undefined = (() => {
    const params = new URLSearchParams(window.location.search);
    return normalizeLang(params.get('lang')) ?? normalizeLang(ctxLang);
  })();

  const [lang, setLang] = useState<JournalLang>(urlLang ?? 'en');
  const [article, setArticle] = useState<JournalArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // slug が空なら ListPage へ redirect
  useEffect(() => {
    if (!slug) {
      window.location.replace('/journal-db');
    }
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    getPublishedJournalArticleBySlug(slug, lang).then(({ article: a, error: err }) => {
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
  }, [slug, lang]);

  function toggleLang() {
    const next: JournalLang = lang === 'en' ? 'ja' : 'en';
    setLang(next);
    const url = new URL(window.location.href);
    url.searchParams.set('lang', next);
    window.history.replaceState(null, '', url.toString());
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  // fallback notice 文言
  function fallbackNotice(articleLang: JournalLang): string {
    if (lang === 'en' && articleLang === 'ja') {
      return 'This article is currently available in Japanese only.';
    }
    if (lang === 'ja' && articleLang === 'en') {
      return 'この記事は現在英語のみです。';
    }
    return '';
  }

  if (!slug) return null;

  return (
    <div className="ja-page">
      {/* Header */}
      <header className="ja-header">
        <a href="/" className="ja-wordmark">ONE EIGHT</a>
        <div className="ja-header-right">
          <nav className="ja-nav">
            <a href="/journal-db" className="ja-nav-link">
              {lang === 'ja' ? '← Journal' : '← Journal'}
            </a>
          </nav>
          <div className="ja-lang-toggle">
            <button
              type="button"
              className={lang === 'en' ? 'ja-lang-btn active' : 'ja-lang-btn'}
              onClick={() => { if (lang !== 'en') setLang('en'); }}
            >EN</button>
            <button
              type="button"
              className={lang === 'ja' ? 'ja-lang-btn active' : 'ja-lang-btn'}
              onClick={() => { if (lang !== 'ja') setLang('ja'); }}
            >JA</button>
          </div>
        </div>
      </header>

      <main className="ja-main">
        {/* Loading */}
        {loading && (
          <div className="ja-state">
            <span className="ja-state-text">{lang === 'ja' ? '読み込み中…' : 'Loading…'}</span>
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
              {lang === 'ja' ? '記事が見つかりません。' : 'Article not found.'}
            </p>
            <a href="/journal-db" className="ja-back-link">
              {lang === 'ja' ? '← Journal 一覧に戻る' : '← Back to Journal'}
            </a>
          </div>
        )}

        {/* Article */}
        {!loading && !error && !notFound && article && (() => {
          const t = article.translation;
          const notice = t ? fallbackNotice(t.lang) : '';
          return (
            <article className="ja-article">
              {/* Fallback notice */}
              {article.fallback && notice && (
                <div className="ja-fallback-notice">{notice}</div>
              )}

              {/* Header meta */}
              <div className="ja-article-meta">
                <time className="ja-article-date">{formatDate(article.published_at)}</time>
                {article.tags.length > 0 && (
                  <div className="ja-article-tags">
                    {article.tags.map(tag => (
                      <span key={tag} className="ja-tag">{tag}</span>
                    ))}
                  </div>
                )}
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
                    {lang === 'ja' ? '本文がありません。' : 'No content available.'}
                  </span>
                </div>
              )}

              {/* References */}
              {article.references.length > 0 && (
                <section className="ja-references">
                  <h2 className="ja-references-title">
                    {lang === 'ja' ? '参考文献' : 'References'}
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
                <a href="/journal-db" className="ja-back-link">
                  {lang === 'ja' ? '← Journal 一覧に戻る' : '← Back to Journal'}
                </a>
              </div>

              {/* Play ONE EIGHT CTA (控えめ) */}
              <div className="ja-play-cta">
                <a href="/pricing.html" className="ja-play-cta-link">
                  {lang === 'ja' ? 'ONE EIGHT をプレイする →' : 'Play ONE EIGHT →'}
                </a>
              </div>
            </article>
          );
        })()}
      </main>

      {/* Footer */}
      <footer className="ja-footer">
        <div className="ja-footer-links">
          <a href="/">ONE EIGHT</a>
          <a href="/journal-db">Journal</a>
          <a href="/pricing.html">Pricing</a>
          <a href="/terms.html">Terms</a>
          <a href="/privacy.html">Privacy</a>
        </div>
      </footer>
    </div>
  );
}
