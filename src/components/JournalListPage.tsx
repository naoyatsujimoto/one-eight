import { useEffect, useState } from 'react';
import { listPublishedJournalArticles, resolveJournalLang } from '../lib/journal';
import type { JournalArticleSummary, JournalLang } from '../lib/journal';
import { getJournalArticleImages } from '../lib/journalImages';
import { useLang } from '../lib/lang';
import { SUPPORTED_LOCALES } from '../lib/locales';
import type { LocaleCode } from '../lib/locales';
import { CompactLanguageSelector } from './CompactLanguageSelector';
import './JournalListPage.css';

/**
 * JournalListPage — /journal-db
 *
 * AuthGate 外で直接レンダリングされる。ログイン不要。
 *
 * i18n: selectedLocale は10言語 (LocaleCode)
 *       DB取得用 journalLang は resolveJournalLang() で en/ja に変換
 *       non-en/ja は English fallback として記事を表示する
 */
export function JournalListPage() {
  const { lang: ctxLang, setLang } = useLang();

  // URL query ?lang=ja / ?lang=en 等を優先、なければ LangProvider の値
  const initLocale: LocaleCode = (() => {
    const params = new URLSearchParams(window.location.search);
    const qLang = params.get('lang');
    if (qLang && SUPPORTED_LOCALES.some(l => l.code === qLang)) {
      return qLang as LocaleCode;
    }
    return ctxLang as LocaleCode;
  })();

  const [selectedLocale, setSelectedLocale] = useState<LocaleCode>(initLocale);
  const [articles, setArticles] = useState<JournalArticleSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // journalLang: JournalLang への変換 (DB取得用)
  const journalLang: JournalLang = resolveJournalLang(selectedLocale);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listPublishedJournalArticles(journalLang).then(({ data, error: err }) => {
      if (err) {
        setError(err);
        setArticles(null);
      } else {
        setArticles(data ?? []);
      }
      setLoading(false);
    });
  }, [journalLang]);

  function handleLocaleChange(code: LocaleCode) {
    setSelectedLocale(code);
    setLang(code);
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

  return (
    <div className="jl-page">
      {/* Header */}
      <header className="jl-header">
        <a href="/journal/" className="jl-wordmark jl-wordmark-journal">ONE EIGHT Journal</a>
        <div className="jl-header-right">
          <nav className="jl-nav">
            <a href="/journal/" className="jl-nav-link">Archive</a>
          </nav>
          {/* Compact language selector */}
          <CompactLanguageSelector
            selectedLocale={selectedLocale}
            onSelect={handleLocaleChange}
          />
        </div>
      </header>

      {/* Hero */}
      <section className="jl-hero">
        <p className="jl-hero-eyebrow">
          {journalLang === 'ja' ? '編集指針' : 'EDITORIAL POLICY'}
        </p>
        <p className="jl-hero-body">
          {journalLang === 'ja' ? (
            <>
              局面への緻密な観察、全体と配置に対する深い思考。<br />
              隠れた構造と力を見出す想像力溢れる問い。<br />
              その探究心と情熱に敬意をもって。
            </>
          ) : (
            <>
              Close observation of each situation. Deep thought about the whole and the placement of things.<br />
              Imaginative questions that reveal hidden structures and forces.<br />
              With respect for the curiosity and passion behind that inquiry.
            </>
          )}
        </p>
      </section>

      {/* Content */}
      <main className="jl-main">
        {loading && (
          <div className="jl-state">
            <span className="jl-state-text">{journalLang === 'ja' ? '読み込み中…' : 'Loading…'}</span>
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
              {journalLang === 'ja' ? '記事はまだありません。' : 'No articles yet.'}
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

                  {/* Fallback notice: 要求言語の翻訳が存在しない場合のみ表示 */}
                  {article.fallback && t && t.lang !== resolveJournalLang(selectedLocale) && (
                    <div className="jl-fallback-notice">
                      {journalLang === 'ja'
                        ? `この記事は${selectedLocale}では利用できません。${t.lang === 'en' ? '英語' : '別言語'}で表示しています。`
                        : `This article is not available in ${selectedLocale}. Showing in ${t.lang}.`}
                    </div>
                  )}

                  {/* Meta row */}
                  <div className="jl-card-meta">
                    <time className="jl-card-date">{formatDate(article.published_at)}</time>
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
                      href={`/journal/${article.slug}${selectedLocale !== 'en' ? `?lang=${selectedLocale}` : ''}`}
                      className="jl-read-link"
                    >
                      {journalLang === 'ja' ? '記事を読む →' : 'Read article →'}
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
        <div className="jl-footer-play-wrap">
          <a href="/" className="jl-footer-play-link">
            {journalLang === 'ja'
              ? '競技性ボードゲーム ONE EIGHTをプレイする'
              : 'Play ONE EIGHT, a competitive abstract board game'}
          </a>
        </div>
      </footer>
    </div>
  );
}
