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

    </div>
  );
}
