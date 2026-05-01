import { useLang } from '../lib/lang';
import type { Lang } from '../lib/lang';

export function TitleScreen() {
  const { lang, setLang, t } = useLang();

  function handleLang(e: React.MouseEvent, l: Lang) {
    e.stopPropagation();
    setLang(l);
  }

  return (
    <div className="title-screen">
      <div className="title-logo">
        <div className="title-wordmark">ONE EIGHT</div>
        <div className="title-sub">{t.titleSub}</div>
      </div>

      {/* Language selector */}
      <div className="title-lang-switcher" onClick={e => e.stopPropagation()}>
        <button
          type="button"
          className={`title-lang-btn${lang === 'en' ? ' active' : ''}`}
          onClick={e => handleLang(e, 'en')}
        >
          English
        </button>
        <button
          type="button"
          className={`title-lang-btn${lang === 'ja' ? ' active' : ''}`}
          onClick={e => handleLang(e, 'ja')}
        >
          日本語
        </button>
      </div>

      <div className="title-version">{t.titleVersion}</div>
      <div className="title-hint">
        <span className="title-hint-icon">↓</span>
        <span>{t.titleHint}</span>
      </div>

      {/* Footer links */}
      <div className="title-footer" onClick={e => e.stopPropagation()}>
        <a href="/pricing.html">Pricing</a>
        <a href="/terms.html">Terms</a>
        <a href="/privacy.html">Privacy</a>
        <a href="/refund.html">Refund</a>
        <a href="mailto:contact@oneeightgame.com">Contact</a>
      </div>
    </div>
  );
}
