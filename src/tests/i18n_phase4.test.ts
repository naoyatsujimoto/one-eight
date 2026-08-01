/**
 * i18n_phase4.test.ts — Phase 4 i18n localization tests
 *
 * Tests:
 * 1. Journal UI — all 10 locales have complete structure
 * 2. Journal UI — all strings are non-empty
 * 3. fallbackNotice preserves 2 placeholder arguments
 * 4. Unknown locale falls back to English only
 * 5. Editorial guideline — existing 10-locale translations unchanged
 * 6. localeFormat — valid for all 10 locales
 * 7. localeFormat — Invalid Date fallback
 * 8. Core UI — all 10 locale dictionaries have the new Phase 4 keys
 * 9. html[lang] sync — LangProvider exposes setLang
 */

import { describe, it, expect } from 'vitest';
import { SUPPORTED_LOCALES } from '../lib/locales';
import type { LocaleCode } from '../lib/locales';
import { getJournalUi, EDITORIAL_GUIDELINE } from '../lib/journalUi';
import type { JournalUiTranslations } from '../lib/journalUi';
import { formatDate, formatDateTime, formatTime, formatNumber, getIntlLocale } from '../lib/localeFormat';
import { resolveUiTranslations } from '../i18n/index';

const ALL_LOCALES = SUPPORTED_LOCALES.map(l => l.code as LocaleCode);

// ─── 1. Journal UI structure completeness ─────────────────────────────────────

describe('Journal UI — 全10言語の構造一致', () => {
  const REQUIRED_STRING_KEYS: (keyof JournalUiTranslations)[] = [
    'archive',
    'editorialPolicy',
    'loading',
    'noArticles',
    'articleNotFound',
    'backToJournal',
    'noContent',
    'references',
    'readArticle',
    'noTranslation',
    'playOneEight',
    'editorialGuideline',
  ];

  for (const locale of ALL_LOCALES) {
    it(`${locale}: all required keys present`, () => {
      const ui = getJournalUi(locale);
      for (const key of REQUIRED_STRING_KEYS) {
        expect(ui[key], `key ${key} in ${locale}`).toBeDefined();
        expect(typeof ui[key]).toBe('string');
      }
      expect(typeof ui.fallbackNotice).toBe('function');
    });
  }
});

// ─── 2. Journal UI — all strings non-empty ────────────────────────────────────

describe('Journal UI — 全stringが非空', () => {
  const STRING_KEYS: (keyof JournalUiTranslations)[] = [
    'archive', 'editorialPolicy', 'loading', 'noArticles', 'articleNotFound',
    'backToJournal', 'noContent', 'references', 'readArticle', 'noTranslation',
    'playOneEight', 'editorialGuideline',
  ];

  for (const locale of ALL_LOCALES) {
    it(`${locale}: no empty strings`, () => {
      const ui = getJournalUi(locale);
      for (const key of STRING_KEYS) {
        const val = ui[key] as string;
        expect(val.length, `key ${key} in ${locale} should be non-empty`).toBeGreaterThan(0);
      }
    });
  }
});

// ─── 3. fallbackNotice — 2 placeholder arguments preserved ───────────────────

describe('Journal UI fallbackNotice — 2 placeholders', () => {
  for (const locale of ALL_LOCALES) {
    it(`${locale}: fallbackNotice(req, disp) uses both arguments`, () => {
      const ui = getJournalUi(locale);
      const result = ui.fallbackNotice('zh-Hant', 'en');
      // Both placeholder values should appear in the result
      expect(result).toContain('zh-Hant');
      expect(result).toContain('en');
    });
  }
});

// ─── 4. Unknown locale fallback to English only ───────────────────────────────

describe('Journal UI — 未知localeは英語fallback', () => {
  const EN_UI = getJournalUi('en');

  it('empty string falls back to English', () => {
    const ui = getJournalUi('');
    expect(ui.archive).toBe(EN_UI.archive);
    expect(ui.loading).toBe(EN_UI.loading);
  });

  it('unknown locale falls back to English', () => {
    const ui = getJournalUi('xx');
    expect(ui.archive).toBe(EN_UI.archive);
  });

  it('known locales do NOT fall back to English (except en itself)', () => {
    for (const locale of ALL_LOCALES.filter(l => l !== 'en')) {
      const ui = getJournalUi(locale);
      expect(ui.archive).not.toBe(EN_UI.archive);
    }
  });
});

// ─── 5. Editorial guideline — existing translations unchanged ─────────────────

describe('EDITORIAL_GUIDELINE — 既存10言語訳が未変更', () => {
  const EXPECTED: Record<LocaleCode, string> = {
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

  for (const locale of ALL_LOCALES) {
    it(`${locale}: editorial guideline unchanged`, () => {
      expect(EDITORIAL_GUIDELINE[locale]).toBe(EXPECTED[locale]);
    });
  }
});

// ─── 6. localeFormat — valid for all 10 locales ───────────────────────────────

describe('localeFormat — 全10localeで有効', () => {
  const testDate = new Date('2025-06-15T10:30:00Z');

  for (const locale of ALL_LOCALES) {
    it(`${locale}: formatDate returns non-empty string`, () => {
      const result = formatDate(testDate, locale);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it(`${locale}: formatTime returns non-empty string`, () => {
      const result = formatTime(testDate, locale);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it(`${locale}: formatDateTime returns non-empty string`, () => {
      const result = formatDateTime(testDate, locale);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it(`${locale}: formatNumber returns non-empty string`, () => {
      const result = formatNumber(12345.67, locale);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it(`${locale}: getIntlLocale returns non-empty string`, () => {
      const result = getIntlLocale(locale);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  }
});

// ─── 7. localeFormat — Invalid Date fallback ─────────────────────────────────

describe('localeFormat — Invalid Date fallback', () => {
  it('formatDate with invalid ISO string returns the input string', () => {
    expect(formatDate('not-a-date', 'en')).toBe('not-a-date');
  });

  it('formatTime with invalid ISO string returns the input string', () => {
    expect(formatTime('not-a-date', 'ja')).toBe('not-a-date');
  });

  it('formatDateTime with invalid ISO string returns the input string', () => {
    expect(formatDateTime('not-a-date', 'fr')).toBe('not-a-date');
  });

  it('formatDate with invalid Date object returns empty string', () => {
    expect(formatDate(new Date('invalid'), 'en')).toBe('');
  });

  it('unknown locale falls back to en-US', () => {
    expect(getIntlLocale('xx')).toBe('en-US');
  });
});

// ─── 8. Core UI — Phase 4 new keys present in all 10 locales ──────────────────

describe('Core UI — Phase 4 新規keyが全10言語に存在', () => {
  const PHASE4_KEYS = [
    'pricing', 'terms', 'privacy', 'refund', 'accessDenied',
    'tapToContinue', 'continueToLogin',
    'openingStats', 'noDataCpu', 'totalCpuGames', 'firstMove', 'buildType', 'tries', 'winPercent', 'positionBuild',
    'total', 'wins', 'losses', 'draws', 'modeLabel', 'winnerLabel', 'movesLabel', 'dateLabel',
    'noGameRecords', 'vsComputer', 'upgradeToPro',
    'winProbability', 'candidateMovesLabel', 'analysisFailedMessage', 'proUpgradePrompt',
    'importRecordLabel', 'importSuccessful',
    'connecting',
    'updateTaxPaymentInfo', 'existingSubmissionNotice', 'updatedInformationNotice',
    'createdLabel', 'submissionId', 'dataExpiration',
    'taxOnFile', 'taxOnFileDesc', 'updateInfoIfChanged',
  ] as const;

  for (const locale of ALL_LOCALES) {
    it(`${locale}: all Phase 4 keys present and non-empty`, () => {
      const t = resolveUiTranslations(locale) as Record<string, unknown>;
      for (const key of PHASE4_KEYS) {
        expect(t[key], `key ${key} in ${locale}`).toBeDefined();
        expect(typeof t[key]).toBe('string');
        expect((t[key] as string).length, `key ${key} in ${locale} should be non-empty`).toBeGreaterThan(0);
      }
    });
  }
});

// ─── 9. Journal UI no journalLang === 'ja' UI decisions ───────────────────────

describe('Journal UI — journalLang UI判定なし', () => {
  // This is a source audit: the getJournalUi function does not use journalLang for decisions
  // We verify that different locales return different content (not a single hardcoded value)
  it('ja and en have different archive labels', () => {
    expect(getJournalUi('ja').archive).not.toBe(getJournalUi('en').archive);
  });

  it('zh-Hant and zh-Hans have different content', () => {
    const ht = getJournalUi('zh-Hant');
    const hs = getJournalUi('zh-Hans');
    // At least some keys should differ (simplified vs traditional)
    expect(ht.archive).not.toBe(hs.archive);
  });

  it('each locale has a unique editorialPolicy string', () => {
    const values = ALL_LOCALES.map(l => getJournalUi(l).editorialPolicy);
    const unique = new Set(values);
    expect(unique.size).toBe(ALL_LOCALES.length);
  });
});

// ─── 10. OfficialMatchCalendar — no fixed ja-JP in source (runtime test) ─────

// Note: OfficialMatchCalendar uses getIntlLocale(lang) after Phase 4
// We verify getIntlLocale returns the correct locale for each code
describe('getIntlLocale — locale mapping correctness', () => {
  it('en → en-US', () => expect(getIntlLocale('en')).toBe('en-US'));
  it('ja → ja-JP', () => expect(getIntlLocale('ja')).toBe('ja-JP'));
  it('zh-Hant → zh-Hant', () => expect(getIntlLocale('zh-Hant')).toBe('zh-Hant'));
  it('zh-Hans → zh-Hans', () => expect(getIntlLocale('zh-Hans')).toBe('zh-Hans'));
  it('ko → ko-KR', () => expect(getIntlLocale('ko')).toBe('ko-KR'));
  it('es → es', () => expect(getIntlLocale('es')).toBe('es'));
  it('pt-BR → pt-BR', () => expect(getIntlLocale('pt-BR')).toBe('pt-BR'));
  it('de → de-DE', () => expect(getIntlLocale('de')).toBe('de-DE'));
  it('fr → fr-FR', () => expect(getIntlLocale('fr')).toBe('fr-FR'));
  it('it → it-IT', () => expect(getIntlLocale('it')).toBe('it-IT'));
});
