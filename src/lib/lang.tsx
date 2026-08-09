import { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { updateProfileLang } from './profile';
import { SUPPORTED_LOCALES } from './locales';
import type { LocaleCode } from './locales';
import { resolveUiTranslations, EN_TRANSLATIONS, JA_TRANSLATIONS } from '../i18n/index';
import type { Translations } from '../i18n/types';
import { track, setTrackerLocale } from './kpiTracker';

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
  // 初期読み込みのlanguage_changedを防ぐ（初期値を記憑）
  const isInitialLangRef = useRef(true);

  const setLang = useCallback((l: Lang) => {
    setLangState((prev) => {
      // 同じlocaleの再選択はlanguage_changedを送信しない
      if (prev === l) return prev;

      // 初期読み込みは変更eventにしない
      if (!isInitialLangRef.current) {
        try {
          // /ai-check-login は除外
          const p = window.location.pathname;
          if (p !== '/ai-check-login' && p !== '/ai-check-login/') {
            setTrackerLocale(l);
            track('language_changed', {
              from_locale: prev,
              to_locale: l,
            });
          }
        } catch {
          // KPI送信失敗は無視
        }
      } else {
        // 初期値を記録した後、次回から変更とみなす
        isInitialLangRef.current = false;
        try { setTrackerLocale(l); } catch { /* noop */ }
      }

      return l;
    });
    syncHtmlLang(l);
    try { localStorage.setItem(LANG_LS_KEY, l); } catch { /* noop */ }
  }, []);

  const setLangWithSync = useCallback((l: Lang) => {
    setLang(l);
    if (userId) {
      updateProfileLang(userId, l).catch((err) => {
        console.error('[lang] DB sync failed:', err instanceof Error ? err.message : String(err));
      });
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
