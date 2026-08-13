import { useEffect, useRef, useState } from 'react';
import { listPublishedJournalArticles, resolveJournalLang } from '../lib/journal';
import type { JournalArticleSummary, JournalLang } from '../lib/journal';
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
  getSanitizedUtm,
  buildArticleHref,
  type TrafficSource,
} from '../lib/journalKpi';
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

  // KPI: list_viewed exactly-once guard
  const listViewedSentRef = useRef(false);
  // KPI: impression exactly-once per slug
  const impressionSentRef = useRef<Set<string>>(new Set());
  // KPI: image failure exactly-once per slug
  const imageFailSentRef = useRef<Set<string>>(new Set());
  // KPI: fetch failure exactly-once
  const fetchFailSentRef = useRef(false);
  // KPI: language change tracking (前回locale)
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

  // KPI: journal_list_viewed（1ページロードにつき1回）
  useEffect(() => {
    if (listViewedSentRef.current) return;
    listViewedSentRef.current = true;
    const utm = utmRef.current;
    track('journal_list_viewed', {
      traffic_source: trafficSourceRef.current,
      ...(utm.utm_medium ? { utm_medium: utm.utm_medium } : {}),
      ...(utm.utm_campaign ? { utm_campaign: utm.utm_campaign } : {}),
      ...(utm.utm_content ? { utm_content: utm.utm_content } : {}),
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listPublishedJournalArticles(journalLang).then(({ data, error: err }) => {
      if (err) {
        setError(err);
        setArticles(null);
        // KPI: journal_load_failed (list_fetch_failed) — 1回のみ
        if (!fetchFailSentRef.current) {
          fetchFailSentRef.current = true;
          track('journal_load_failed', {
            page_type: 'list',
            failure_code: 'list_fetch_failed',
          });
        }
      } else {
        setArticles(data ?? []);
      }
      setLoading(false);
    });
  }, [journalLang]);

  function handleLocaleChange(code: LocaleCode) {
    // KPI: journal_language_changed — 実変更時のみ
    if (code !== prevLocaleRef.current) {
      track('journal_language_changed', {
        context: 'list',
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
          <ArticleList
            articles={articles}
            selectedLocale={selectedLocale}
            journalLang={journalLang}
            ui={ui}
            utmRef={utmRef}
            trafficSourceRef={trafficSourceRef}
            impressionSentRef={impressionSentRef}
            imageFailSentRef={imageFailSentRef}
            formatDateStr={formatDateStr}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="jl-footer">
        <div className="jl-footer-play-wrap">
          {/* KPI: journal_game_cta_clicked */}
          <a
            href="/"
            className="jl-footer-play-link"
            onClick={() => {
              track('journal_game_cta_clicked', { context: 'list_footer' });
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

// ---------------------------------------------------------------------------
// ArticleList sub-component: impression observer をここで管理
// ---------------------------------------------------------------------------

interface ArticleListProps {
  articles: JournalArticleSummary[];
  selectedLocale: LocaleCode;
  journalLang: JournalLang;
  ui: ReturnType<typeof getJournalUi>;
  utmRef: React.MutableRefObject<ReturnType<typeof getSanitizedUtm>>;
  trafficSourceRef: React.MutableRefObject<TrafficSource>;
  impressionSentRef: React.MutableRefObject<Set<string>>;
  imageFailSentRef: React.MutableRefObject<Set<string>>;
  formatDateStr: (iso: string) => string;
}

function ArticleList({
  articles,
  selectedLocale,
  journalLang,
  ui,
  utmRef,
  trafficSourceRef,
  impressionSentRef,
  imageFailSentRef,
  formatDateStr,
}: ArticleListProps) {
  const cardRefs = useRef<Map<string, Element>>(new Map());

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.5) continue;
          const slug = (entry.target as HTMLElement).dataset['slug'];
          const posStr = (entry.target as HTMLElement).dataset['position'];
          const fallbackStr = (entry.target as HTMLElement).dataset['fallback'];
          const displayedLocale = (entry.target as HTMLElement).dataset['displayedLocale'];
          if (!slug || impressionSentRef.current.has(slug)) continue;
          impressionSentRef.current.add(slug);
          track('journal_article_impression', {
            article_slug: slug.slice(0, 200),
            list_position: posStr ? parseInt(posStr, 10) : 1,
            requested_locale: selectedLocale.slice(0, 20),
            displayed_locale: (displayedLocale ?? selectedLocale).slice(0, 20),
            fallback: fallbackStr === 'true',
          });
          // 送信済みなら監視解除
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.5 }
    );

    const currentRefs = cardRefs.current;
    for (const el of currentRefs.values()) {
      observer.observe(el);
    }

    return () => {
      observer.disconnect();
    };
  // articles変化時にobserverを再設定するが、impressionSentRefで重複防止
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articles, selectedLocale]);

  const utm = utmRef.current;

  return (
    <div className="jl-article-list">
      {articles.map((article, index) => {
        const t = article.translation;
        const position = index + 1;
        const displayedLocale = t?.lang ?? selectedLocale;

        return (
          <article
            key={article.id}
            className="jl-card"
            ref={(el) => {
              if (el) {
                cardRefs.current.set(article.slug, el);
              } else {
                cardRefs.current.delete(article.slug);
              }
            }}
            data-slug={article.slug}
            data-position={position}
            data-fallback={String(article.fallback)}
            data-displayed-locale={displayedLocale}
          >
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
                    onError={() => {
                      // KPI: image_load_failed — 同一slugにつき1回
                      if (!imageFailSentRef.current.has(article.slug)) {
                        imageFailSentRef.current.add(article.slug);
                        track('journal_load_failed', {
                          page_type: 'list',
                          article_slug: article.slug.slice(0, 200),
                          failure_code: 'image_load_failed',
                        });
                      }
                    }}
                  />
                </div>
              );
            })()}

            {/* Fallback notice */}
            {article.fallback && t && t.lang !== journalLang && (
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

            {/* Read link — UTM + lang 引き継ぎ */}
            <div className="jl-card-footer">
              <a
                href={buildArticleHref(article.slug, selectedLocale, utm, trafficSourceRef.current)}
                className="jl-read-link"
              >
                {ui.readArticle} →
              </a>
            </div>
          </article>
        );
      })}
    </div>
  );
}
