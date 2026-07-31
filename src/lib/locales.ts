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
 * Locales that have full translations for the FullGame Training text (LocalizedText { en, ja }).
 * UI dictionary locale resolution is handled by src/i18n/index.ts.
 */
export const TRAINING_TRANSLATED_LOCALES: readonly LocaleCode[] = ['en', 'ja'] as const;

/**
 * Returns the translation key to use for FullGame Training text for a given locale.
 * Locales without Training translations fall back to 'en'.
 * UI dictionary resolution uses resolveUiTranslations() from src/i18n/index.ts instead.
 */
export function resolveTrainingTranslationKey(code: LocaleCode): 'en' | 'ja' {
  if (code === 'ja') return 'ja';
  return 'en'; // English fallback for all non-ja locales
}
