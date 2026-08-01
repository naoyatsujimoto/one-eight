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
 * 10. OfficialArenaOverview — no lang==='ja' hardcoded locale
 * 11. Board — no hardcoded English tooltip/fallback in source
 * 12. App — no hardcoded Pricing/Terms/Privacy/Refund/Contact in footer
 * 13. Journal — fallbackNotice receives locale labels, not raw codes
 * 14. JournalArticlePage — no '← Journal' hardcoded in source
 * 15. OfficialMatchCalendar — no fixed DOW_LABELS array in source
 * 16. FullGameTrainingRunner — no ?? 'Tap to fallback
 * 17. getLocaleLabel — all 10 locales return display labels
 * 18. getLocaleLabel — unknown code fallback
 * 19. Phase 4補正 — 新規追keyが全に存在
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { SUPPORTED_LOCALES, getLocaleLabel } from '../lib/locales';
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

// ─── 11. Source audit: OfficialArenaOverview has no hardcoded ja-JP/en-US ―――――

describe('Source audit — OfficialArenaOverview', () => {
  const src = readFileSync(
    resolve(__dirname, '../components/OfficialArenaOverview.tsx'), 'utf8'
  );

  it('no lang === ja hardcoded locale', () => {
    expect(src).not.toContain("lang === 'ja'");
  });

  it('no fixed ja-JP or en-US in public helpers', () => {
    // localeFormat helpers are used instead
    expect(src).not.toMatch(/toLocaleString\(['"]ja-JP/);
    expect(src).not.toMatch(/toLocaleString\(['"]en-US/);
  });
});

// ─── 12. Source audit: Board has no hardcoded English tooltip/fallback ―――――――

describe('Source audit — Board', () => {
  const src = readFileSync(
    resolve(__dirname, '../components/Board.tsx'), 'utf8'
  );

  it('no hardcoded LABELS ON rendered in JSX (uses variable)', () => {
    // Default prop values may contain 'LABELS ON' as fallback string,
    // but the JSX render site must use the variable, not the literal.
    // Check that the render site uses _labelsOn/_labelsOff variables (via useLang fallback).
    expect(src).toContain('{showLabels ? _labelsOn : _labelsOff}');
  });

  it('no hardcoded GHOST ON rendered in JSX (uses variable)', () => {
    expect(src).toContain('{ghostModeActive ? _ghostOn : _ghostOff}');
  });

  it('no hardcoded Ghost Mode: show tooltip in JSX', () => {
    expect(src).not.toContain('Ghost Mode: show your past moves at this position"');
  });

  it('no ?? fallback English strings for ghost', () => {
    expect(src).not.toContain("?? 'Ghost (Pro Only)'");
    expect(src).not.toContain("?? 'View Pro features'");
  });
});

// ─── 13. Source audit: App footer no hardcoded link text ――――――――――――――――

describe('Source audit — App footer', () => {
  const src = readFileSync(
    resolve(__dirname, '../app/App.tsx'), 'utf8'
  );

  it('no hardcoded >Pricing< in JSX', () => {
    expect(src).not.toContain('>Pricing<');
  });

  it('no hardcoded >Terms< in JSX', () => {
    expect(src).not.toContain('>Terms<');
  });

  it('no hardcoded >Privacy< in JSX', () => {
    expect(src).not.toContain('>Privacy<');
  });

  it('no hardcoded >Refund< in JSX', () => {
    expect(src).not.toContain('>Refund<');
  });

  it('no hardcoded >Contact< in JSX', () => {
    expect(src).not.toContain('>Contact<');
  });
});

// ─── 14. Source audit: JournalArticlePage no '\u2190 Journal' hardcoded ――――――――

describe('Source audit — JournalArticlePage', () => {
  const src = readFileSync(
    resolve(__dirname, '../components/JournalArticlePage.tsx'), 'utf8'
  );

  it('no hardcoded \u2190 Journal in JSX', () => {
    // Allow arrow in back-link if it's adjacent to ui.backToJournal
    // The raw string '\u2190 Journal' (without variable) should not appear
    expect(src).not.toContain('\u2190 Journal\n');
    // More precise: should use ui.backToJournal variable
    expect(src).toContain('ui.backToJournal');
  });
});

// ─── 15. Source audit: OfficialMatchCalendar no fixed DOW_LABELS ――――――――――

describe('Source audit — OfficialMatchCalendar', () => {
  const src = readFileSync(
    resolve(__dirname, '../components/OfficialMatchCalendar.tsx'), 'utf8'
  );

  it('no fixed DOW_LABELS array with S/M/T/W', () => {
    expect(src).not.toContain("['S', 'M', 'T', 'W', 'T', 'F', 'S']");
  });

  it('no fixed aria-label Previous month', () => {
    expect(src).not.toContain('aria-label="Previous month"');
  });

  it('no fixed aria-label Next month', () => {
    expect(src).not.toContain('aria-label="Next month"');
  });
});

// ─── 16. Source audit: FullGameTrainingRunner no ?? fallbacks ――――――――――――

describe('Source audit — FullGameTrainingRunner', () => {
  const src = readFileSync(
    resolve(__dirname, '../components/FullGameTrainingRunner.tsx'), 'utf8'
  );

  it("no ?? 'Tap to go back' fallback", () => {
    expect(src).not.toContain("?? 'Tap to go back'");
  });

  it("no ?? 'Tap to continue' fallback", () => {
    expect(src).not.toContain("?? 'Tap to continue'");
  });
});

// ─── 17. getLocaleLabel — all 10 locales return display labels ―――――――――――

describe('getLocaleLabel — 全10localeの表示ラベル', () => {
  const EXPECTED_LABELS: Record<LocaleCode, string> = {
    en: 'English',
    ja: '日本語',
    'zh-Hant': '繁體中文',
    'zh-Hans': '简体中文',
    ko: '한국어',
    es: 'Español',
    'pt-BR': 'Português (Brasil)',
    de: 'Deutsch',
    fr: 'Français',
    it: 'Italiano',
  };

  for (const locale of ALL_LOCALES) {
    it(`${locale}: returns correct label`, () => {
      expect(getLocaleLabel(locale)).toBe(EXPECTED_LABELS[locale]);
    });
  }
});

// ─── 18. getLocaleLabel — unknown code fallback ―――――――――――――――――――――

describe('getLocaleLabel — unknown codeはfallback', () => {
  it('unknown code returns English', () => {
    expect(getLocaleLabel('xx')).toBe('English');
  });

  it('empty string returns English', () => {
    expect(getLocaleLabel('')).toBe('English');
  });
});

// ─── 19. Phase 4補正 — 新規追keyが全に存在 ――――――――――――――――――――――――

describe('Phase 4補正 — 新規追keyが全に存在', () => {
  // New string keys added in Phase 4 correction
  const PHASE4_FIX_STRING_KEYS = [
    'labelsOn', 'labelsOff', 'ghostOn', 'ghostOff', 'ghostModePastMovesTooltip',
    'contact', 'opponent',
    'omPreviousMonth', 'omNextMonth',
    'splashTagline',
    'errorPrefix',
    'labelGuideAlt',
    'trainingGood',
    'userPrevPage', 'userNextPage',
    'postmortemMoveHeader',
  ] as const;

  // Keys that are functions
  const PHASE4_FIX_FN_KEYS = [
    'omMatchOnDate',
    'postmortemMoveNumber',
    'topN',
  ] as const;

  for (const locale of ALL_LOCALES) {
    it(`${locale}: all Phase 4 fix string keys present and non-empty`, () => {
      const t = resolveUiTranslations(locale) as Record<string, unknown>;
      for (const key of PHASE4_FIX_STRING_KEYS) {
        expect(t[key], `key ${key} in ${locale}`).toBeDefined();
        expect(typeof t[key], `key ${key} in ${locale} should be string`).toBe('string');
        expect((t[key] as string).length, `key ${key} in ${locale} should be non-empty`).toBeGreaterThan(0);
      }
    });

    it(`${locale}: all Phase 4 fix function keys are callable`, () => {
      const t = resolveUiTranslations(locale) as Record<string, unknown>;
      for (const key of PHASE4_FIX_FN_KEYS) {
        expect(t[key], `key ${key} in ${locale}`).toBeDefined();
        expect(typeof t[key], `key ${key} in ${locale} should be function`).toBe('function');
      }
    });
  }

  // Arena datetime helper test
  it('Arena datetime helpers use localeFormat for all 10 locales', () => {
    const testDate = new Date('2025-06-15T10:30:00Z');
    for (const locale of ALL_LOCALES) {
      const result = formatDate(testDate, locale, { month: 'short', day: 'numeric' });
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    }
  });

  // fallbackNotice uses locale labels
  it('fallbackNotice receives locale labels not raw codes', () => {
    const ui = getJournalUi('zh-Hant');
    // Simulating JournalArticlePage: getLocaleLabel converts code to label
    const requestedLabel = getLocaleLabel('zh-Hant');
    const displayedLabel = getLocaleLabel('en');
    const result = ui.fallbackNotice(requestedLabel, displayedLabel);
    // Should contain locale labels, not raw codes
    expect(result).toContain('繁體中文');
    expect(result).toContain('English');
  });
});

// ─── 20. Phase 4最終補正 — 構造テスト ―――――――――――――――――――――――――――――――

describe('Phase 4最終補正 — 構造テスト', () => {
  const boardSrc = readFileSync(resolve(__dirname, '../components/Board.tsx'), 'utf8');
  const journalListSrc = readFileSync(resolve(__dirname, '../components/JournalListPage.tsx'), 'utf8');
  const fgRunnerSrc = readFileSync(resolve(__dirname, '../components/FullGameTrainingRunner.tsx'), 'utf8');
  const trainingViewSrc = readFileSync(resolve(__dirname, '../components/TrainingView.tsx'), 'utf8');

  it('Board has no hardcoded labelsOn English default', () => {
    expect(boardSrc).not.toContain("labelsOn = 'LABELS ON'");
  });

  it('Board has no hardcoded labelsOff English default', () => {
    expect(boardSrc).not.toContain("labelsOff = 'LABELS OFF'");
  });

  it('Board has no hardcoded ghostOn English default', () => {
    expect(boardSrc).not.toContain("ghostOn = 'GHOST ON'");
  });

  it('Board has no hardcoded ghostOff English default', () => {
    expect(boardSrc).not.toContain("ghostOff = 'GHOST OFF'");
  });

  it('Board has no hardcoded ghostModePastMovesTooltip English default', () => {
    expect(boardSrc).not.toContain("ghostModePastMovesTooltip = 'Ghost Mode: show your past moves at this position'");
  });

  it('Board has no hardcoded ghostProOnlyTooltip English default', () => {
    expect(boardSrc).not.toContain("ghostProOnlyTooltip = 'Ghost Mode (Pro only)'");
  });

  it('JournalListPage uses getLocaleLabel import', () => {
    expect(journalListSrc).toContain('getLocaleLabel');
  });

  it('JournalListPage fallbackNotice uses getLocaleLabel for both args', () => {
    expect(journalListSrc).toContain('ui.fallbackNotice(getLocaleLabel(selectedLocale), getLocaleLabel(t.lang))');
  });

  it('FullGameTrainingRunner has no trainingBackBtn English fallback', () => {
    expect(fgRunnerSrc).not.toContain("t.trainingBackBtn ?? '← Back'");
  });

  it('FullGameTrainingRunner has no trainingGuidedGame English fallback', () => {
    expect(fgRunnerSrc).not.toContain("t.trainingGuidedGame ?? 'Guided Game'");
  });

  it('FullGameTrainingRunner has no trainingQuestion English fallback', () => {
    expect(fgRunnerSrc).not.toContain("t.trainingQuestion ?? 'Question'");
  });

  it('FullGameTrainingRunner has no trainingTryAgain English fallback', () => {
    expect(fgRunnerSrc).not.toContain("t.trainingTryAgain ?? 'Try again.'");
  });

  it('FullGameTrainingRunner has no trainingNextBtn English fallback', () => {
    expect(fgRunnerSrc).not.toContain("t.trainingNextBtn ?? 'Next'");
  });

  it('FullGameTrainingRunner has no trainingCompleteLabel English fallback', () => {
    expect(fgRunnerSrc).not.toContain("t.trainingCompleteLabel ?? 'Complete'");
  });

  it('FullGameTrainingRunner has no trainingFinishBtn English fallback', () => {
    expect(fgRunnerSrc).not.toContain("t.trainingFinishBtn ?? 'Finish'");
  });

  it('FullGameTrainingRunner has no trainingIncorrectRetry English fallback', () => {
    expect(fgRunnerSrc).not.toContain("t.trainingIncorrectRetry ?? 'Incorrect. Please try again.'");
  });

  it('FullGameTrainingRunner has no trainingShowHint English fallback', () => {
    expect(fgRunnerSrc).not.toContain("t.trainingShowHint ?? 'Show Hint'");
  });

  it('TrainingView uses typed t.trainingT4Complete', () => {
    expect(trainingViewSrc).toContain('t.trainingT4Complete');
    expect(trainingViewSrc).not.toContain("'trainingT4Complete'");
  });

  it('TrainingView uses typed t.trainingT5Complete', () => {
    expect(trainingViewSrc).toContain('t.trainingT5Complete');
    expect(trainingViewSrc).not.toContain("'trainingT5Complete'");
  });

  it('TrainingView uses typed t.trainingT6Complete', () => {
    expect(trainingViewSrc).toContain('t.trainingT6Complete');
    expect(trainingViewSrc).not.toContain("'trainingT6Complete'");
  });

  it('TrainingView uses typed t.trainingT8Complete', () => {
    expect(trainingViewSrc).toContain('t.trainingT8Complete');
    expect(trainingViewSrc).not.toContain("'trainingT8Complete'");
  });

  it('TrainingView uses typed t.trainingT9Complete', () => {
    expect(trainingViewSrc).toContain('t.trainingT9Complete');
    expect(trainingViewSrc).not.toContain("'trainingT9Complete'");
  });

  it('TrainingView uses typed t.trainingT10Complete', () => {
    expect(trainingViewSrc).toContain('t.trainingT10Complete');
    expect(trainingViewSrc).not.toContain("'trainingT10Complete'");
  });

  it('10言語辭書構造が一致する (statusYourMove 存在)', () => {
    for (const { code } of SUPPORTED_LOCALES) {
      const t = resolveUiTranslations(code) as Record<string, unknown>;
      expect(t['statusYourMove'], `statusYourMove missing in ${code}`).toBeDefined();
      expect(t['statusThinking'], `statusThinking missing in ${code}`).toBeDefined();
    }
  });
});
