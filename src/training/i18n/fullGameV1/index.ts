/**
 * Per-locale FullGame V1 Training text bundles.
 * Resolver returns the canonical text bundle for a given locale.
 * Unknown locales fall back to English.
 */
import type { LocaleCode } from '../../../lib/locales';
import type { FGTrainingText } from './types';
import { FULL_GAME_V1_EN } from './en';
import { FULL_GAME_V1_JA } from './ja';
import { FULL_GAME_V1_ZH_HANT } from './zh-Hant';
import { FULL_GAME_V1_ZH_HANS } from './zh-Hans';
import { FULL_GAME_V1_KO } from './ko';
import { FULL_GAME_V1_ES } from './es';
import { FULL_GAME_V1_PT_BR } from './pt-BR';
import { FULL_GAME_V1_DE } from './de';
import { FULL_GAME_V1_FR } from './fr';
import { FULL_GAME_V1_IT } from './it';

const FULL_GAME_V1_BUNDLES: Record<LocaleCode, FGTrainingText> = {
  en: FULL_GAME_V1_EN,
  ja: FULL_GAME_V1_JA,
  'zh-Hant': FULL_GAME_V1_ZH_HANT,
  'zh-Hans': FULL_GAME_V1_ZH_HANS,
  ko: FULL_GAME_V1_KO,
  es: FULL_GAME_V1_ES,
  'pt-BR': FULL_GAME_V1_PT_BR,
  de: FULL_GAME_V1_DE,
  fr: FULL_GAME_V1_FR,
  it: FULL_GAME_V1_IT,
};

/**
 * Returns the FullGame V1 Training text bundle for the given locale.
 * Only unknown locales (not in SUPPORTED_LOCALES) fall back to English.
 * All 10 supported locales have dedicated dictionaries.
 */
export function resolveFullGameV1Text(locale: LocaleCode): FGTrainingText {
  return FULL_GAME_V1_BUNDLES[locale] ?? FULL_GAME_V1_EN;
}

export type { FGTrainingText, FGStepText, FGCourseMeta, FGUserStepText, FGAutoStepText, FGQuestionData } from './types';
export { FULL_GAME_V1_EN } from './en';
export { FULL_GAME_V1_JA } from './ja';
export { FULL_GAME_V1_ZH_HANT } from './zh-Hant';
export { FULL_GAME_V1_ZH_HANS } from './zh-Hans';
export { FULL_GAME_V1_KO } from './ko';
export { FULL_GAME_V1_ES } from './es';
export { FULL_GAME_V1_PT_BR } from './pt-BR';
export { FULL_GAME_V1_DE } from './de';
export { FULL_GAME_V1_FR } from './fr';
export { FULL_GAME_V1_IT } from './it';
