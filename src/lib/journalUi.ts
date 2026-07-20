/**
 * journalUi.ts — Journal UI 固定文言の翻訳定数
 *
 * Journal UI 専用の静的翻訳を管理する。
 * DB から取得する記事翻訳 (journal.ts) とは独立している。
 *
 * 選択言語 (selectedLocale / LocaleCode) をキーに文言を取得する。
 * journalLang (en/ja の2値) ではなく、LocaleCode 10言語で管理すること。
 */

import type { LocaleCode } from './locales';

// ─── 編集指針本文 ──────────────────────────────────────────────────────────────

/**
 * 編集指針本文の10言語翻訳。
 * canonical: 探究心と情熱に敬意をもって。（ja）
 */
export const EDITORIAL_GUIDELINE: Record<LocaleCode, string> = {
  ja:        '探究心と情熱に敬意をもって。',
  en:        'With respect for curiosity and passion.',
  'zh-Hant': '向求知慾與熱情致敬。',
  'zh-Hans': '向求知欲与热情致敬。',
  ko:        '탐구심과 열정에 경의를 표합니다.',
  es:        'Con respeto por la curiosidad y la pasión.',
  'pt-BR':   'Com respeito pela curiosidade e pela paixão.',
  de:        'Mit Respekt vor Neugier und Leidenschaft.',
  fr:        'Avec respect pour la curiosité et la passion.',
  it:        'Con rispetto per la curiosità e la passione.',
};

/**
 * 編集指針本文を取得する。
 * 想定外の locale は英語にフォールバックする。
 *
 * @param locale selectedLocale (LocaleCode) または任意の文字列
 */
export function getEditorialGuideline(locale: LocaleCode | string): string {
  return (EDITORIAL_GUIDELINE as Record<string, string>)[locale]
    ?? EDITORIAL_GUIDELINE['en'];
}
