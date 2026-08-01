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

// TRAINING_TRANSLATED_LOCALES and resolveTrainingTranslationKey have been removed.
// All 10 locales now have dedicated FullGame Training text bundles in
// src/training/i18n/fullGameV1/. Use resolveFullGameV1Text() instead.
