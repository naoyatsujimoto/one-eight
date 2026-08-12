import { useEffect, useRef, useState } from 'react';
import { getPublishedJournalArticleBySlug, resolveJournalLang } from '../lib/journal';
import type { JournalArticleDetail, JournalLang } from '../lib/journal';
import { getJournalArticleImages } from '../lib/journalImages';
import { getJournalUi } from '../lib/journalUi';
import { useLang } from '../lib/lang';
import { formatDate } from '../lib/localeFormat';
import { SUPPORTED_LOCALES, getLocaleLabel } from '../lib/locales';
import type { LocaleCode } from '../lib/locales';
import { CompactLanguageSelector } from './CompactLanguageSelector';
import { track, flushForNavigation } from '../lib/kpiTracker';
import {
  resolveTrafficSource,
  resolveEntryType,
  getSanitizedUtm,
} from '../lib/journalKpi';
import './JournalArticlePage.css';

/**
 * JournalArticlePage — /journal-db/:slug
 *
 * AuthGate 外で直接レンダリングされる。ログイン不要。
 */
export function JournalArticlePage() {
  const { lang: ctxLang, setLang } = useLang();

  const slug: string = (() => {
    const m = window.location.pathname.match(/^\/journal(?:-db)?\/(.+)$/);
    return m ? (m[1] ?? '') : '';
  })();

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

  const journalLang: JournalLang = resolveJournalLang(selectedLocale);
  const ui = getJournalUi(selectedLocale);

  // KPI guards
  const articleOpenedSentRef = useRef(false);
  const engagementSentRef = useRef(false);
  const fetchFailSentRef = useRef(false);
  const notFoundSentRef = useRef(false);
  const heroFailSentRef = useRef(false);
  const prevLocaleRef = useRef<LocaleCode>(initLocale);

  // UTM / traffic_source (page load 時に1回だけ取得)
  const utmRef = useRef(getSanitizedUtm(new URLSearchParams(window.location.search)));
  const trafficSourceRef = useRef(
    resolveTrafficSource(
      new URLSearchParams(window.location.search),
      document.referrer,
      window.location.origin,
    )
  );
  const entryTypeRef = useRef(resolveEntryType(document.referrer, window.location.origin));

  // Engagement state (mutableなのでrefで持つ)
  const maxScrollRef = useRef(0);
  const activeSecondsRef = useRef(0);
  const visibleStartRef = useRef<number | null>(null);
  const articleBodyRef = useRef<HTMLDivElement | null>(null);

  // redirect if no slug
  useEffect(() => {
    if (!slug) {
      window.location.replace('/journal/');
    }
  }, [slug]);

  // Article fetch
  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    getPublishedJournalArticleBySlug(slug, journalLang).then(({ article: a, error: err }) => {
      if (err) {
        setError(err);
        setArticle(null);
        // KPI: article_fetch_failed — 1回のみ
        if (!fetchFailSentRef.current) {
          fetchFailSentRef.current = true;
          track('journal_load_failed', {
            page_type: 'article',
            article_slug: slug.slice(0, 200),
            failure_code: 'article_fetch_failed',
          });
        }
      } else if (!a) {
        setNotFound(true);
        setArticle(null);
        // KPI: article_not_found — 1回のみ
        if (!notFoundSentRef.current) {
          notFoundSentRef.current = true;
          track('journal_load_failed', {
            page_type: 'article',
            article_slug: slug.slice(0, 200),
            failure_code: 'article_not_found',
          });
        }
      } else {
        setArticle(a);
        // KPI: journal_article_opened — 同一slugにつき1回（言語変更再取得では再送しない）
        if (!articleOpenedSentRef.current) {
          articleOpenedSentRef.current = true;
          const utm = utmRef.current;
          track('journal_article_opened', {
            article_slug: slug.slice(0, 200),
            entry_type: entryTypeRef.current,
            traffic_source: trafficSourceRef.current,
            requested_locale: selectedLocale.slice(0, 20),
            displayed_locale: (a.translation?.lang ?? selectedLocale).slice(0, 20),
            fallback: a.fallback,
            ...(utm.utm_medium ? { utm_medium: utm.utm_medium } : {}),
            ...(utm.utm_campaign ? { utm_campaign: utm.utm_campaign } : {}),
            ...(utm.utm_content ? { utm_content: utm.utm_content } : {}),
          });
        }
      }
      setLoading(false);
    });
  // selectedLocale → journalLang が変わっても article_opened は再送しない
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, journalLang]);

  // Engagement: scroll計測
  useEffect(() => {
    function handleScroll() {
      const bodyEl = articleBodyRef.current;
      if (!bodyEl) return;
      const rect = bodyEl.getBoundingClientRect();
      const viewportH = window.innerHeight;
      // bodyEl の何 % がスクロールされたか (0〜100)
      const scrolled = Math.min(
        100,
        Math.max(
          0,
          Math.round(((viewportH - rect.top) / rect.height) * 100),
        ),
      );
      if (scrolled > maxScrollRef.current) {
        maxScrollRef.current = scrolled;
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Engagement: visibility time計測
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        visibleStartRef.current = Date.now();
      } else {
        if (visibleStartRef.current !== null) {
          activeSecondsRef.current = Math.min(
            86400,
            activeSecondsRef.current + Math.round((Date.now() - visibleStartRef.current) / 1000),
          );
          visibleStartRef.current = null;
        }
      }
    }
    // 初期状態が visible なら計測開始
    if (document.visibilityState === 'visible') {
      visibleStartRef.current = Date.now();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // unmount時に可視時間を確定
      if (visibleStartRef.current !== null) {
        activeSecondsRef.current = Math.min(
          86400,
          activeSecondsRef.current + Math.round((Date.now() - visibleStartRef.current) / 1000),
        );
        visibleStartRef.current = null;
      }
    };
  }, []);

  // pagehide で engagement 送信
  useEffect(() => {
    function handlePageHide() {
      sendEngagement();
    }
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, selectedLocale, article]);

  // component unmount で engagement 送信
  useEffect(() => {
    return () => {
      sendEngagement();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, article]);

  function sendEngagement() {
    if (engagementSentRef.current) return;
    if (!article) return; // 記事未取得なら送らない
    engagementSentRef.current = true;

    // 最終可視時間確定
    if (visibleStartRef.current !== null) {
      activeSecondsRef.current = Math.min(
        86400,
        activeSecondsRef.current + Math.round((Date.now() - visibleStartRef.current) / 1000),
      );
      visibleStartRef.current = null;
    }

    const maxScroll = Math.min(100, Math.max(0, maxScrollRef.current));
    const activeSec = Math.min(86400, Math.max(0, activeSecondsRef.current));
    const completed = maxScroll >= 90 && activeSec >= 30;

    track('journal_article_engagement', {
      article_slug: slug.slice(0, 200),
      max_scroll_percent: maxScroll,
      active_seconds: activeSec,
      completed,
      requested_locale: selectedLocale.slice(0, 20),
      displayed_locale: (article.translation?.lang ?? selectedLocale).slice(0, 20),
      fallback: article.fallback,
    });

    flushForNavigation();
  }

  function handleLocaleChange(code: LocaleCode) {
    // KPI: journal_language_changed — 実変更時のみ
    if (code !== prevLocaleRef.current) {
      track('journal_language_changed', {
        context: 'article',
        article_slug: slug.slice(0, 200),
        from_locale: prevLocaleRef.current,
        to_locale: code,
      });
      prevLocaleRef.current = code;
    }
    setSelectedLocale(code);
    setLang(code);
    const url = new URL(window.location.href);
    url.searchParams.set('lang', code);
    window.history.replaceState(null, '', url.toString());
  }

  function formatDateStr(iso: string): string {
    return formatDate(iso, selectedLocale, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function buildFallbackNotice(articleLang: JournalLang): string {
    if (articleLang === journalLang) return '';
    const requestedLabel = getLocaleLabel(selectedLocale);
    const displayedLabel = getLocaleLabel(articleLang);
    return ui.fallbackNotice(requestedLabel, displayedLabel);
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
              onClick={() => {
                sendEngagement();
                flushForNavigation();
              }}
            >
              ← {ui.backToJournal}
            </a>
          </nav>
          <CompactLanguageSelector
            selectedLocale={selectedLocale}
            onSelect={handleLocaleChange}
          />
        </div>
      </header>

      <main className="ja-main">
        {loading && (
          <div className="ja-state">
            <span className="ja-state-text">{ui.loading}</span>
          </div>
        )}

        {!loading && error && (
          <div className="ja-state ja-state-error">
            <span className="ja-state-text">{error}</span>
          </div>
        )}

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

        {!loading && !error && !notFound && article && (() => {
          const t = article.translation;
          const notice = t ? buildFallbackNotice(t.lang) : '';
          // 参考文献リスト（sort済み）
          const sortedRefs = article.references
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order);

          return (
            <article className="ja-article">
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
                      onError={() => {
                        if (!heroFailSentRef.current) {
                          heroFailSentRef.current = true;
                          track('journal_load_failed', {
                            page_type: 'article',
                            article_slug: article.slug.slice(0, 200),
                            failure_code: 'image_load_failed',
                          });
                        }
                      }}
                    />
                  </div>
                );
              })()}

              <div className="ja-article-meta">
                <time className="ja-article-date">{formatDateStr(article.published_at)}</time>
              </div>

              <h1 className="ja-article-title">
                {t ? t.title : <span className="ja-no-translation">[{ui.noTranslation}]</span>}
              </h1>

              <p className="ja-article-author">{article.author_label}</p>

              <hr className="ja-divider" />

              {/* Body */}
              {t?.body_html ? (
                <div
                  className="ja-article-body journal-body"
                  ref={articleBodyRef}
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
              {sortedRefs.length > 0 && (
                <section className="ja-references">
                  <h2 className="ja-references-title">
                    {ui.references}
                  </h2>
                  <ol className="ja-references-list">
                    {sortedRefs.map((ref, refIndex) => (
                      <li key={ref.id} className="ja-reference-item">
                        <span className="ja-ref-text">{ref.ref_text}</span>
                        {(ref.doi || ref.url) && (
                          <a
                            href={ref.doi ? `https://doi.org/${ref.doi}` : ref.url ?? '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ja-ref-link"
                            onClick={() => {
                              // KPI: journal_reference_clicked
                              // DOI/URL本文は送信しない
                              track('journal_reference_clicked', {
                                article_slug: article.slug.slice(0, 200),
                                reference_kind: ref.doi ? 'doi' : 'url',
                                reference_position: refIndex + 1,
                              });
                            }}
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

              <div className="ja-article-nav">
                <a
                  href={`/journal/${selectedLocale !== 'en' ? `?lang=${selectedLocale}` : ''}`}
                  className="ja-back-link"
                  onClick={() => {
                    sendEngagement();
                    flushForNavigation();
                  }}
                >
                  ← {ui.backToJournal}
                </a>
              </div>
            </article>
          );
        })()}
      </main>

      {/* Footer */}
      <footer className="ja-footer">
        <div className="ja-footer-play-wrap">
          {/* KPI: journal_game_cta_clicked (article_footer) */}
          <a
            href="/"
            className="ja-footer-play-link"
            onClick={() => {
              track('journal_game_cta_clicked', {
                context: 'article_footer',
                article_slug: slug.slice(0, 200),
              });
              sendEngagement();
              flushForNavigation();
            }}
          >
            {ui.playOneEight}
          </a>
        </div>
      </footer>
    </div>
  );
}
