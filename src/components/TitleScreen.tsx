import { useLang } from '../lib/lang';
import type { Lang } from '../lib/lang';
import { SUPPORTED_LOCALES } from '../lib/locales';

export function TitleScreen() {
  const { lang, setLangWithSync, t } = useLang();

  function handleLang(e: React.MouseEvent, l: Lang) {
    e.stopPropagation();
    setLangWithSync(l);
  }

  return (
    <div className="title-screen">
      <div className="title-logo">
        <div className="title-wordmark">ONE EIGHT</div>
        <div className="title-sub">{t.titleSub}</div>
      </div>

      {/* Language selector — 10 locales in pill-button grid */}
      <div className="title-lang-switcher title-lang-switcher--grid" onClick={e => e.stopPropagation()}>
        {SUPPORTED_LOCALES.map(({ code, label }) => (
          <button
            key={code}
            type="button"
            className={`title-lang-btn${lang === code ? ' active' : ''}`}
            onClick={e => handleLang(e, code as Lang)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="title-version">{t.titleVersion}</div>
      <div className="title-hint">
        <span className="title-hint-icon">↓</span>
        <span>{t.titleHint}</span>
      </div>

    </div>
  );
}
