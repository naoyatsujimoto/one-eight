/**
 * journal_editorial_guideline.test.ts
 *
 * 編集指針本文の10言語翻訳テスト。
 * 対象: src/lib/journalUi.ts
 */

import { describe, it, expect } from 'vitest';
import { EDITORIAL_GUIDELINE, getEditorialGuideline } from '../lib/journalUi';
import type { LocaleCode } from '../lib/locales';

// ─── 期待値 ────────────────────────────────────────────────────────────────────

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

// ─── 各言語の正確な文言 ────────────────────────────────────────────────────────

describe('EDITORIAL_GUIDELINE — 各言語の正確な文言', () => {
  it('ja: 日本語', () => {
    expect(EDITORIAL_GUIDELINE['ja']).toBe(EXPECTED['ja']);
  });

  it('en: 英語', () => {
    expect(EDITORIAL_GUIDELINE['en']).toBe(EXPECTED['en']);
  });

  it('zh-Hant: 繁体字中国語', () => {
    expect(EDITORIAL_GUIDELINE['zh-Hant']).toBe(EXPECTED['zh-Hant']);
  });

  it('zh-Hans: 簡体字中国語', () => {
    expect(EDITORIAL_GUIDELINE['zh-Hans']).toBe(EXPECTED['zh-Hans']);
  });

  it('ko: 韓国語', () => {
    expect(EDITORIAL_GUIDELINE['ko']).toBe(EXPECTED['ko']);
  });

  it('es: スペイン語', () => {
    expect(EDITORIAL_GUIDELINE['es']).toBe(EXPECTED['es']);
  });

  it('pt-BR: ブラジルポルトガル語', () => {
    expect(EDITORIAL_GUIDELINE['pt-BR']).toBe(EXPECTED['pt-BR']);
  });

  it('de: ドイツ語', () => {
    expect(EDITORIAL_GUIDELINE['de']).toBe(EXPECTED['de']);
  });

  it('fr: フランス語', () => {
    expect(EDITORIAL_GUIDELINE['fr']).toBe(EXPECTED['fr']);
  });

  it('it: イタリア語', () => {
    expect(EDITORIAL_GUIDELINE['it']).toBe(EXPECTED['it']);
  });
});

// ─── zh-Hant / zh-Hans 取り違えチェック ───────────────────────────────────────

describe('EDITORIAL_GUIDELINE — zh-Hant / zh-Hans 取り違えなし', () => {
  it('zh-Hant は繁体字（慾、與 を含む）', () => {
    expect(EDITORIAL_GUIDELINE['zh-Hant']).toContain('慾');
    expect(EDITORIAL_GUIDELINE['zh-Hant']).toContain('與');
  });

  it('zh-Hans は簡体字（欲、与 を含む、慾 を含まない）', () => {
    expect(EDITORIAL_GUIDELINE['zh-Hans']).toContain('欲');
    expect(EDITORIAL_GUIDELINE['zh-Hans']).toContain('与');
    expect(EDITORIAL_GUIDELINE['zh-Hans']).not.toContain('慾');
  });

  it('zh-Hant と zh-Hans は異なる文字列', () => {
    expect(EDITORIAL_GUIDELINE['zh-Hant']).not.toBe(EDITORIAL_GUIDELINE['zh-Hans']);
  });
});

// ─── 日本語誤表示チェック ──────────────────────────────────────────────────────

describe('EDITORIAL_GUIDELINE — 日本語以外で日本語原文が表示されない', () => {
  const JA_CANONICAL = '探究心と情熱に敬意をもって。';

  const nonJaLocales: LocaleCode[] = [
    'en', 'zh-Hant', 'zh-Hans', 'ko', 'es', 'pt-BR', 'de', 'fr', 'it',
  ];

  for (const locale of nonJaLocales) {
    it(`${locale} で日本語原文が表示されない`, () => {
      expect(EDITORIAL_GUIDELINE[locale]).not.toBe(JA_CANONICAL);
    });
  }
});

// ─── getEditorialGuideline — 正常系 ───────────────────────────────────────────

describe('getEditorialGuideline — 正常系', () => {
  const locales: LocaleCode[] = [
    'ja', 'en', 'zh-Hant', 'zh-Hans', 'ko', 'es', 'pt-BR', 'de', 'fr', 'it',
  ];

  for (const locale of locales) {
    it(`${locale} で期待する文言を返す`, () => {
      expect(getEditorialGuideline(locale)).toBe(EXPECTED[locale]);
    });
  }
});

// ─── getEditorialGuideline — fallback ────────────────────────────────────────

describe('getEditorialGuideline — 想定外 locale は英語 fallback', () => {
  it('空文字列 → 英語', () => {
    expect(getEditorialGuideline('')).toBe(EXPECTED['en']);
  });

  it('未知の文字列 → 英語', () => {
    expect(getEditorialGuideline('xx')).toBe(EXPECTED['en']);
  });

  it('undefined 相当（空文字列）→ 英語', () => {
    expect(getEditorialGuideline('')).toBe(EXPECTED['en']);
  });
});

// ─── 言語切替後の表示切替（純粋関数として検証）──────────────────────────────

describe('getEditorialGuideline — 言語切替後に再読み込みなしで切り替わる', () => {
  it('ja → en と切り替えると異なる文字列を返す', () => {
    const ja = getEditorialGuideline('ja');
    const en = getEditorialGuideline('en');
    expect(ja).not.toBe(en);
  });

  it('en → ja と切り替えると異なる文字列を返す', () => {
    const en = getEditorialGuideline('en');
    const ja = getEditorialGuideline('ja');
    expect(en).not.toBe(ja);
  });

  it('同じ locale を2回呼んでも同じ文字列を返す（副作用なし）', () => {
    expect(getEditorialGuideline('ja')).toBe(getEditorialGuideline('ja'));
    expect(getEditorialGuideline('fr')).toBe(getEditorialGuideline('fr'));
  });
});

// ─── ?lang= 初期表示 ──────────────────────────────────────────────────────────

describe('getEditorialGuideline — ?lang= 指定で正しい初期表示', () => {
  it('?lang=ja → 日本語', () => {
    const locale = 'ja' as LocaleCode;
    expect(getEditorialGuideline(locale)).toBe(EXPECTED['ja']);
  });

  it('?lang=zh-Hant → 繁体字', () => {
    const locale = 'zh-Hant' as LocaleCode;
    expect(getEditorialGuideline(locale)).toBe(EXPECTED['zh-Hant']);
  });

  it('?lang=zh-Hans → 簡体字', () => {
    const locale = 'zh-Hans' as LocaleCode;
    expect(getEditorialGuideline(locale)).toBe(EXPECTED['zh-Hans']);
  });

  it('?lang=pt-BR → ブラジルポルトガル語', () => {
    const locale = 'pt-BR' as LocaleCode;
    expect(getEditorialGuideline(locale)).toBe(EXPECTED['pt-BR']);
  });

  it('?lang=ko → 韓国語', () => {
    const locale = 'ko' as LocaleCode;
    expect(getEditorialGuideline(locale)).toBe(EXPECTED['ko']);
  });
});

// ─── 10言語すべてが定義されている ─────────────────────────────────────────────

describe('EDITORIAL_GUIDELINE — 10言語すべてが定義されている', () => {
  const ALL_LOCALES: LocaleCode[] = [
    'ja', 'en', 'zh-Hant', 'zh-Hans', 'ko', 'es', 'pt-BR', 'de', 'fr', 'it',
  ];

  it('Record に10言語分のキーが存在する', () => {
    for (const locale of ALL_LOCALES) {
      expect(EDITORIAL_GUIDELINE[locale]).toBeDefined();
      expect(typeof EDITORIAL_GUIDELINE[locale]).toBe('string');
      expect(EDITORIAL_GUIDELINE[locale].length).toBeGreaterThan(0);
    }
  });

  it('すべての文言が一意（重複なし）', () => {
    const values = ALL_LOCALES.map(l => EDITORIAL_GUIDELINE[l]);
    const unique = new Set(values);
    expect(unique.size).toBe(ALL_LOCALES.length);
  });
});
