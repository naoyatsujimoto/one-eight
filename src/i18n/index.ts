// src/i18n/index.ts
import type { LocaleCode } from '../lib/locales';
import type { Translations } from './types';
import { EN_TRANSLATIONS } from './en';
import { JA_TRANSLATIONS } from './ja';
import { ZH_HANT_TRANSLATIONS } from './zh-Hant';
import { ZH_HANS_TRANSLATIONS } from './zh-Hans';
import { KO_TRANSLATIONS } from './ko';
import { ES_TRANSLATIONS } from './es';
import { PT_BR_TRANSLATIONS } from './pt-BR';
import { DE_TRANSLATIONS } from './de';
import { FR_TRANSLATIONS } from './fr';
import { IT_TRANSLATIONS } from './it';

const UI_TRANSLATIONS: Record<LocaleCode, Translations> = {
  en: EN_TRANSLATIONS as unknown as Translations,
  ja: JA_TRANSLATIONS,
  'zh-Hant': ZH_HANT_TRANSLATIONS,
  'zh-Hans': ZH_HANS_TRANSLATIONS,
  ko: KO_TRANSLATIONS,
  es: ES_TRANSLATIONS,
  'pt-BR': PT_BR_TRANSLATIONS,
  de: DE_TRANSLATIONS,
  fr: FR_TRANSLATIONS,
  it: IT_TRANSLATIONS,
};

export function resolveUiTranslations(locale: LocaleCode): Translations {
  return UI_TRANSLATIONS[locale] ?? (EN_TRANSLATIONS as unknown as Translations);
}

export type { Translations } from './types';
export { EN_TRANSLATIONS } from './en';
export { JA_TRANSLATIONS } from './ja';
export { ZH_HANT_TRANSLATIONS } from './zh-Hant';
export { ZH_HANS_TRANSLATIONS } from './zh-Hans';
export { KO_TRANSLATIONS } from './ko';
export { ES_TRANSLATIONS } from './es';
export { PT_BR_TRANSLATIONS } from './pt-BR';
export { DE_TRANSLATIONS } from './de';
export { FR_TRANSLATIONS } from './fr';
export { IT_TRANSLATIONS } from './it';
