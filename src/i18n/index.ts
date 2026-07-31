// src/i18n/index.ts
import type { LocaleCode } from '../lib/locales';
import type { Translations } from './types';
import { EN_TRANSLATIONS } from './en';
import { JA_TRANSLATIONS } from './ja';
import { ZH_HANT_TRANSLATIONS } from './zh-Hant';

// Registered UI translations (en/ja/zh-Hant are fully translated)
const UI_TRANSLATIONS: Partial<Record<LocaleCode, Translations>> = {
  en: EN_TRANSLATIONS as unknown as Translations,
  ja: JA_TRANSLATIONS,
  'zh-Hant': ZH_HANT_TRANSLATIONS,
};

/**
 * Resolve UI Translations for a given locale.
 * Returns the locale's dictionary if available, otherwise English fallback.
 */
export function resolveUiTranslations(locale: LocaleCode): Translations {
  return UI_TRANSLATIONS[locale] ?? (EN_TRANSLATIONS as unknown as Translations);
}

// Re-export for convenience
export type { Translations } from './types';
export { EN_TRANSLATIONS } from './en';
export { JA_TRANSLATIONS } from './ja';
export { ZH_HANT_TRANSLATIONS } from './zh-Hant';
