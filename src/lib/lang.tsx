import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { upsertProfile } from './profile';
import { SUPPORTED_LOCALES } from './locales';
import type { LocaleCode } from './locales';
import { resolveUiTranslations, EN_TRANSLATIONS, JA_TRANSLATIONS } from '../i18n/index';
import type { Translations } from '../i18n/types';

/**
 * Lang is now an alias for LocaleCode (10 supported locales).
 * en / ja have full translations; others fall back to English.
 */
export type Lang = LocaleCode;

// Re-export Translations for backward compatibility
export type { Translations };

// Re-export T for backward compatibility
export const T = {
  en: EN_TRANSLATIONS,
  ja: JA_TRANSLATIONS,
} as const;

// ── Context ───────────────────────────────────────────────────────────────────

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** setLang + persist to profiles table if userId is set */
  setLangWithSync: (l: Lang) => void;
  /** Call after login to bind a userId for profile sync */
  setUserId: (id: string | null) => void;
  t: Translations;
}

const LangContext = createContext<LangContextValue>({
  lang: 'en',
  setLang: () => {},
  setLangWithSync: () => {},
  setUserId: () => {},
  t: EN_TRANSLATIONS as unknown as Translations,
});

const LANG_LS_KEY = 'one8_lang';

/** All supported locale codes (10 locales). */
const ALL_LOCALE_CODES: string[] = SUPPORTED_LOCALES.map(l => l.code);

function readLangFromStorage(): Lang {
  try {
    const stored = localStorage.getItem(LANG_LS_KEY);
    if (stored && ALL_LOCALE_CODES.includes(stored)) return stored as Lang;
  } catch { /* noop */ }
  return 'en';
}

/**
 * Resolve the Translations object for a given Lang.
 * en / ja: use the full translation object.
 * All other locales: English fallback.
 */
function resolveTranslations(lang: Lang): Translations {
  return resolveUiTranslations(lang);
}

/** Sync document.documentElement.lang with the active locale. */
function syncHtmlLang(l: Lang) {
  try { document.documentElement.lang = l; } catch { /* noop (SSR / test env) */ }
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const initial = readLangFromStorage();
    syncHtmlLang(initial);
    return initial;
  });
  const [userId, setUserId] = useState<string | null>(null);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    syncHtmlLang(l);
    try { localStorage.setItem(LANG_LS_KEY, l); } catch { /* noop */ }
  }, []);

  const setLangWithSync = useCallback((l: Lang) => {
    setLang(l);
    if (userId) {
      upsertProfile(userId, { lang: l }).catch(() => {/* silent */});
    }
  }, [userId, setLang]);

  return (
    <LangContext.Provider value={{ lang, setLang, setLangWithSync, setUserId, t: resolveTranslations(lang) }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
