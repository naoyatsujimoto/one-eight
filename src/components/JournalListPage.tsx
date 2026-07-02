import { useEffect, useState } from 'react';
import { listPublishedJournalArticles, normalizeLang } from '../lib/journal';
import type { JournalArticleSummary, JournalLang } from '../lib/journal';
import { getJournalArticleImages } from '../lib/journalImages';
import { useLang } from '../lib/lang';
import './JournalListPage.css';

/**
 * JournalListPage — /journal-db
 *
 * AuthGate 外で直接レンダリングされる。ログイン不要。
 */
export function JournalListPage() {
  const { lang: ctxLang } = useLang();

  // URL query ?lang=ja / ?lang=en を優先、なければ LangProvider の値
  const urlLang: JournalLang | undefined = (() => {
    const params = new URLSearchParams(window.location.search);
    return normalizeLang(params.get('lang')) ?? normalizeLang(ctxLang);
  })();

  const [lang, setLang] = useState<JournalLang>(urlLang ?? 'en');
  const [articles, setArticles] = useState<JournalArticleSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listPublishedJournalArticles(lang).then(({ data, error: err }) => {
      if (err) {
        setError(err);
        setArticles(null);
      } else {
        setArticles(data ?? []);
      }
      setLoading(false);
    });
  }, [lang]);

  function toggleLang() {
    const next: JournalLang = lang === 'en' ? 'ja' : 'en';
    setLang(next);
    // URL を更新（pushState で履歴を汚さないよう replaceState）
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

  return (
    <div className="jl-page">
      {/* Header */}
      <header className="jl-header">
        <a href="/" className="jl-wordmark">ONE EIGHT</a>
        <div className="jl-header-right">
          <nav className="jl-nav">
            <a href="/journal/" className="jl-nav-link">Archive</a>
          </nav>
          <div className="jl-lang-toggle">
            <button
              type="button"
              className={lang === 'en' ? 'jl-lang-btn active' : 'jl-lang-btn'}
              onClick={() => { if (lang !== 'en') { setLang('en'); } }}
            >EN</button>
            <button
              type="button"
              className={lang === 'ja' ? 'jl-lang-btn active' : 'jl-lang-btn'}
              onClick={() => { if (lang !== 'ja') { setLang('ja'); } }}
            >JA</button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="jl-hero">
        <p className="jl-hero-eyebrow">Journal</p>
        <h1 className="jl-hero-title">ONE EIGHT Journal</h1>
        <p className="jl-hero-desc">
          {lang === 'ja'
            ? 'ONE EIGHTのゲーム設計・競技思想・関連リサーチを扱う読み物。'
            : 'Essays and research on game design, competitive philosophy, and related topics from ONE EIGHT.'}
        </p>
      </section>

      {/* Content */}
      <main className="jl-main">
        {loading && (
          <div className="jl-state">
            <span className="jl-state-text">{lang === 'ja' ? '読み込み中…' : 'Loading…'}</span>
          </div>
        )}
        {!loading && error && (
          <div className="jl-state jl-state-error">
            <span className="jl-state-text">{error}</span>
          </div>
        )}
        {!loading && !error && articles !== null && articles.length === 0 && (
          <div className="jl-state">
            <span className="jl-state-text">
              {lang === 'ja' ? '記事はまだありません。' : 'No articles yet.'}
            </span>
          </div>
        )}
        {!loading && !error && articles !== null && articles.length > 0 && (
          <div className="jl-article-list">
            {articles.map(article => {
              const t = article.translation;
              return (
                <article key={article.id} className="jl-card">
                  {/* Thumbnail */}
                  {(() => {
                    const imgs = getJournalArticleImages(article.slug);
                    if (!imgs) return null;
                    return (
                      <div className="jl-card-thumb-wrap">
                        <img
                          src={imgs.thumbnail}
                          alt={imgs.alt}
                          className="jl-card-thumb"
                          width={640}
                          height={400}
                          loading="lazy"
                        />
                      </div>
                    );
                  })()}

                  {/* Fallback notice */}
                  {article.fallback && t && t.lang !== lang && (
                    <div className="jl-fallback-notice">
                      {lang === 'en'
                        ? 'This article is currently available in Japanese only.'
                        : 'この記事は現在英語のみです。'}
                    </div>
                  )}

                  {/* Meta row */}
                  <div className="jl-card-meta">
                    <time className="jl-card-date">{formatDate(article.published_at)}</time>
                    {/* tags 非表示 (データ保持・表示のみ無効化) */}
                    {/* {article.tags.length > 0 && (
                      <div className="jl-card-tags">
                        {article.tags.map(tag => (
                          <span key={tag} className="jl-tag">{tag}</span>
                        ))}
                      </div>
                    )} */}
                  </div>

                  {/* Title */}
                  <h2 className="jl-card-title">
                    {t ? t.title : <span className="jl-no-translation">[No translation]</span>}
                  </h2>

                  {/* Excerpt */}
                  {t?.excerpt && (
                    <p className="jl-card-excerpt">{t.excerpt}</p>
                  )}

                  {/* Author */}
                  <p className="jl-card-author">{article.author_label}</p>

                  {/* Read link */}
                  <div className="jl-card-footer">
                    <a
                      href={`/journal/${article.slug}${lang !== 'en' ? `?lang=${lang}` : ''}`}
                      className="jl-read-link"
                    >
                      {lang === 'ja' ? '記事を読む →' : 'Read article →'}
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="jl-footer">
        <div className="jl-footer-cta">
          <span className="jl-footer-cta-label">
            {lang === 'ja' ? 'ONE EIGHT をプレイする' : 'Play ONE EIGHT'}
          </span>
          <a href="/pricing.html" className="jl-footer-cta-link">
            {lang === 'ja' ? 'プランを見る' : 'View plans'}
          </a>
        </div>
        <div className="jl-footer-links">
          <a href="/">ONE EIGHT</a>
          <a href="/pricing.html">Pricing</a>
          <a href="/terms.html">Terms</a>
          <a href="/privacy.html">Privacy</a>
        </div>
      </footer>
    </div>
  );
}
