import { useLang } from '../lib/lang';
import type { LocaleCode } from '../lib/locales';
import { CompactLanguageSelector } from './CompactLanguageSelector';

export function TitleScreen() {
  const { lang, setLangWithSync, t } = useLang();

  return (
    <div className="title-screen">
      <div className="title-logo">
        <div className="title-wordmark">ONE EIGHT</div>
        <div className="title-sub">{t.titleSub}</div>
      </div>

      {/* Compact language selector — single pill, expands on tap */}
      <div className="title-lang-area" onClick={e => e.stopPropagation()}>
        <CompactLanguageSelector
          selectedLocale={lang as LocaleCode}
          onSelect={code => setLangWithSync(code)}
          className="cls-root--title"
        />
      </div>

      <div className="title-version">{t.titleVersion}</div>
      <div className="title-hint">
        <span className="title-hint-icon">↓</span>
        <span>{t.titleHint}</span>
      </div>
    </div>
  );
}
