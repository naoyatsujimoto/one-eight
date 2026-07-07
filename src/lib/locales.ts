/**
 * SUPPORTED_LOCALES — single source of truth for all supported UI locales.
 *
 * en / ja : full translations available
 * zh-Hant / zh-Hans / ko / es / pt-BR / de / fr / it : English fallback
 *
 * NOTE: zh-Hans covers Singapore, Malaysia, overseas simplified-literate users, and diaspora.
 *       Do NOT annotate zh-Hans as "Mainland China".
 */
export const SUPPORTED_LOCALES = [
  { code: 'en',    label: 'English' },
  { code: 'ja',    label: '日本語' },
  { code: 'zh-Hant', label: '繁體中文' },
  { code: 'zh-Hans', label: '简体中文' },
  { code: 'ko',    label: '한국어' },
  { code: 'es',    label: 'Español' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'de',    label: 'Deutsch' },
  { code: 'fr',    label: 'Français' },
  { code: 'it',    label: 'Italiano' },
] as const;

export type LocaleCode = typeof SUPPORTED_LOCALES[number]['code'];

/**
 * Locales that have full translations in the T object.
 * All other locales fall back to English.
 */
export const FULLY_TRANSLATED_LOCALES: readonly LocaleCode[] = ['en', 'ja'] as const;

/**
 * Returns the translation key to use for a given locale code.
 * Locales without full translations fall back to 'en'.
 */
export function resolveTranslationKey(code: LocaleCode): 'en' | 'ja' {
  if (code === 'ja') return 'ja';
  // TODO: Add full translations for zh-Hant, zh-Hans, ko, es, pt-BR, de, fr, it
  return 'en'; // English fallback for all non-ja locales
}
