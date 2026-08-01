import { useEffect, useState } from 'react';
import { listPublishedJournalArticles, resolveJournalLang } from '../lib/journal';
import type { JournalArticleSummary, JournalLang } from '../lib/journal';
import { getJournalArticleImages } from '../lib/journalImages';
import { getJournalUi } from '../lib/journalUi';
import { useLang } from '../lib/lang';
import { formatDate } from '../lib/localeFormat';
import { SUPPORTED_LOCALES, getLocaleLabel } from '../lib/locales';
import type { LocaleCode } from '../lib/locales';
import { CompactLanguageSelector } from './CompactLanguageSelector';
import './JournalListPage.css';

/**
 * JournalListPage — /journal-db
 *
 * AuthGate 外で直接レンダリングされる。ログイン不要。
 *
 * i18n: selectedLocale は10言語 (LocaleCode)
 *       DB取得用 journalLang は resolveJournalLang() で JournalLang に1:1変換
 *       編集指針等の UI 固定文言は selectedLocale をキーに journalUi.ts から取得する
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
  const ui = getJournalUi(selectedLocale);

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

  function formatDateStr(iso: string): string {
    return formatDate(iso, selectedLocale, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  return (
    <div className="jl-page">
      {/* Header */}
      <header className="jl-header">
        <a href="/journal/" className="jl-wordmark jl-wordmark-journal">ONE EIGHT Journal</a>
        <div className="jl-header-right">
          <nav className="jl-nav">
            <a href="/journal/" className="jl-nav-link">{ui.archive}</a>
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
          {ui.editorialPolicy.toUpperCase()}
        </p>
        <p className="jl-hero-body">
          {ui.editorialGuideline}
        </p>
      </section>

      {/* Content */}
      <main className="jl-main">
        {loading && (
          <div className="jl-state">
            <span className="jl-state-text">{ui.loading}</span>
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
              {ui.noArticles}
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
                      {ui.fallbackNotice(getLocaleLabel(selectedLocale), getLocaleLabel(t.lang))}
                    </div>
                  )}

                  {/* Meta row */}
                  <div className="jl-card-meta">
                    <time className="jl-card-date">{formatDateStr(article.published_at)}</time>
                  </div>

                  {/* Title */}
                  <h2 className="jl-card-title">
                    {t ? t.title : <span className="jl-no-translation">[{ui.noTranslation}]</span>}
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
                      {ui.readArticle} →
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
            {ui.playOneEight}
          </a>
        </div>
      </footer>
    </div>
  );
}
