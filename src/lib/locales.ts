/**
 * SUPPORTED_LOCALES — single source of truth for all 10 supported UI locales.
 *
 * UI and Training dictionary registration is managed by each i18n registry;
 * see src/lib/lang.tsx for the UI dictionary and
 * src/training/i18n/fullGameV1/ for the FullGame V1 Training bundles.
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

// All 10 locales have dedicated FullGame Training text bundles.
// Use resolveFullGameV1Text() from src/training/i18n/fullGameV1/ to obtain locale-specific text.

/**
 * getLocaleLabel — returns the human-readable label for a locale code.
 *
 * Looks up SUPPORTED_LOCALES. Unknown codes fall back to English ('English').
 * Useful for displaying locale names in fallback notices and UI.
 *
 * @param code - a LocaleCode or arbitrary string
 */
export function getLocaleLabel(code: LocaleCode | string): string {
  const found = (SUPPORTED_LOCALES as ReadonlyArray<{ code: string; label: string }>)
    .find(l => l.code === code);
  return found ? found.label : 'English';
}
