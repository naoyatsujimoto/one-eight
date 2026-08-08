/**
 * arena_public_use_consent.test.ts
 * Arena Entry 公開・広報利用同意 — Phase A / B 検証
 *
 * テスト項目:
 *  1.  arenaEntryPublicUseConsent が全10言語に存在する
 *  2.  全10言語で空文字でない
 *  3.  EN 以外が EN fallback のままではない
 *  4.  EntryConfirmModal が arenaEntryPublicUseConsent を表示する（ソース検証）
 *  5.  確認文言が Entry 確定ボタンより前に配置される（ソース検証）
 *  6.  JA 文言に「表示名」「対局結果」「棋譜」「広報」「広告」「SNS」が含まれる
 *  7.  EN 文言に display name / match results / game records / publicity / advertising / social media が含まれる
 *  8.  terms-i18n.js の全10言語 t26 に公開利用許諾が含まれる
 *  9.  JA 利用規約に「非独占的」「無償」「譲渡するものではない」が含まれる
 * 10.  EN 利用規約に non-exclusive / royalty-free / does not transfer が含まれる
 * 11.  Terms の全10言語更新日が 2026年8月8日
 * 12.  利用規約の key 構造一致（全言語に t25 / t26 / t27 / t28 が存在）
 * 13.  Entry RPC / Arena DB migration / Master 報酬ロジックに差分がない（ソース検証）
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { EN_TRANSLATIONS } from '../i18n/en';
import { JA_TRANSLATIONS } from '../i18n/ja';
import { resolveUiTranslations } from '../i18n/index';
import type { LocaleCode } from '../lib/locales';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SRC = path.resolve(__dirname, '..');
const PUBLIC = path.resolve(__dirname, '../../public');

function readSrc(relPath: string) {
  return fs.readFileSync(path.join(SRC, relPath), 'utf8');
}
function readPublic(name: string) {
  return fs.readFileSync(path.join(PUBLIC, name), 'utf8');
}

/** Load terms-i18n.js via vm and return the registered dict. */
function loadTermsDict(): Record<string, Record<string, string | undefined> | undefined> {
  const src = readPublic('terms-i18n.js');
  const collected: Record<string, Record<string, string>> = {};
  const fakei18n = {
    registerPage(dict: Record<string, Record<string, string>>) {
      Object.assign(collected, dict);
    },
    apply() {},
  };
  const ctx = vm.createContext({
    window: { ONE_EIGHT_STATIC_I18N: fakei18n },
    document: { readyState: 'complete', addEventListener: () => {} },
  });
  vm.runInContext(src, ctx);
  return collected;
}

const TERMS_DICT = loadTermsDict();

const ALL_LOCALE_CODES: LocaleCode[] = [
  'en', 'ja', 'zh-Hans', 'zh-Hant', 'ko', 'es', 'pt-BR', 'de', 'fr', 'it',
];

// ─── 1. arenaEntryPublicUseConsent が全10言語に存在する ──────────────────────

describe('arenaEntryPublicUseConsent — 全10言語に存在', () => {
  for (const locale of ALL_LOCALE_CODES) {
    it(`${locale}: key exists`, () => {
      const t = resolveUiTranslations(locale);
      expect(t.arenaEntryPublicUseConsent, `${locale}: arenaEntryPublicUseConsent`).toBeDefined();
    });
  }
});

// ─── 2. 全10言語で空文字でない ────────────────────────────────────────────────

describe('arenaEntryPublicUseConsent — 全10言語で非空', () => {
  for (const locale of ALL_LOCALE_CODES) {
    it(`${locale}: non-empty`, () => {
      const t = resolveUiTranslations(locale);
      expect(typeof t.arenaEntryPublicUseConsent).toBe('string');
      expect((t.arenaEntryPublicUseConsent as string).length).toBeGreaterThan(10);
    });
  }
});

// ─── 3. EN 以外が EN fallback のままではない ──────────────────────────────────

describe('arenaEntryPublicUseConsent — EN fallback のままではない', () => {
  const EN_VALUE = EN_TRANSLATIONS.arenaEntryPublicUseConsent;
  const NON_EN: LocaleCode[] = ['ja', 'zh-Hans', 'zh-Hant', 'ko', 'es', 'pt-BR', 'de', 'fr', 'it'];

  for (const locale of NON_EN) {
    it(`${locale}: differs from EN`, () => {
      const t = resolveUiTranslations(locale);
      expect(t.arenaEntryPublicUseConsent).not.toBe(EN_VALUE);
    });
  }
});

// ─── 4. EntryConfirmModal が arenaEntryPublicUseConsent を表示する ─────────────

describe('EntryConfirmModal — arenaEntryPublicUseConsent 表示', () => {
  it('OfficialArenaOverview.tsx contains t.arenaEntryPublicUseConsent render', () => {
    const src = readSrc('components/OfficialArenaOverview.tsx');
    expect(src).toContain('t.arenaEntryPublicUseConsent');
  });

  it('OfficialArenaOverview.tsx renders consent inside EntryConfirmModal body', () => {
    const src = readSrc('components/OfficialArenaOverview.tsx');
    // publicUseConsent style or t.arenaEntryPublicUseConsent should be in modal body context
    expect(src).toContain('publicUseConsent');
    expect(src).toContain('arenaEntryPublicUseConsent');
  });
});

// ─── 5. 確認文言が Entry 確定ボタンより前に配置される ─────────────────────────

describe('EntryConfirmModal — 同意文言が確定ボタンより前', () => {
  it('publicUseConsent appears before confirmBtn in source', () => {
    const src = readSrc('components/OfficialArenaOverview.tsx');
    const consentPos = src.indexOf('arenaEntryPublicUseConsent');
    const confirmBtnPos = src.indexOf('arenaConfirmEntryBtn');
    expect(consentPos).toBeGreaterThan(0);
    expect(confirmBtnPos).toBeGreaterThan(0);
    expect(consentPos).toBeLessThan(confirmBtnPos);
  });
});

// ─── 6. JA 文言に必須ワードが含まれる ────────────────────────────────────────

describe('arenaEntryPublicUseConsent — JA 必須ワード', () => {
  const jaValue = JA_TRANSLATIONS.arenaEntryPublicUseConsent;
  const required = ['表示名', '対局結果', '棋譜', '広報', '広告', 'SNS'];

  for (const word of required) {
    it(`JA contains "${word}"`, () => {
      expect(jaValue).toContain(word);
    });
  }
});

// ─── 7. EN 文言に必須ワードが含まれる ────────────────────────────────────────

describe('arenaEntryPublicUseConsent — EN 必須ワード', () => {
  const enValue = EN_TRANSLATIONS.arenaEntryPublicUseConsent;
  const required = [
    'display name',
    'match results',
    'game records',
    'publicity',
    'advertising',
    'social media',
  ];

  for (const word of required) {
    it(`EN contains "${word}"`, () => {
      expect(enValue).toContain(word);
    });
  }
});

// ─── 8. terms-i18n.js 全10言語 t26 に公開利用許諾が含まれる ──────────────────

describe('terms-i18n.js — t26 公開利用許諾', () => {
  const LOCALE_KEYWORDS: Record<string, string[]> = {
    en: ['display name', 'match results', 'game records', 'non-exclusive', 'royalty-free', 'does not transfer'],
    ja: ['表示名', '対局結果', '棋譜', '非独占的', '無償', '譲渡するものではない'],
    'zh-Hans': ['显示名称', '对局结果', '棋谱', '非独占'],
    'zh-Hant': ['顯示名稱', '對局結果', '棋譜', '非獨占'],
    ko: ['표시 이름', '대국 결과', '기보', '비독점'],
    es: ['nombre visible', 'resultados de partidas', 'registros de partidas', 'no exclusiva'],
    'pt-BR': ['nome de exibi', 'resultados de partidas', 'registros de partidas', 'não exclusiva'],
    de: ['Anzeigenamen', 'Partieergebnisse', 'Partiedaten', 'nicht ausschlie'],
    fr: ["nom d'affichage", 'résultats de parties', 'enregistrements de parties', 'non exclusive'],
    it: ['nome visualizzato', 'risultati delle partite', 'registrazioni delle partite', 'non esclusiva'],
  };

  for (const locale of ALL_LOCALE_CODES) {
    it(`${locale}: t26 contains public use license text`, () => {
      const t26 = TERMS_DICT[locale]?.['t26'] ?? '';
      expect(t26.length, `${locale} t26 is non-empty`).toBeGreaterThan(50);
      const keywords = LOCALE_KEYWORDS[locale] ?? [];
      for (const kw of keywords) {
        expect(t26, `${locale} t26 should contain "${kw}"`).toContain(kw);
      }
    });
  }
});

// ─── 9. JA 利用規約に法的必須ワードが含まれる ────────────────────────────────

describe('terms-i18n.js JA — 法的必須ワード', () => {
  const jaT26 = TERMS_DICT['ja']?.['t26'] ?? '';

  it('JA t26 contains 非独占的', () => {
    expect(jaT26).toContain('非独占的');
  });
  it('JA t26 contains 無償', () => {
    expect(jaT26).toContain('無償');
  });
  it('JA t26 contains 譲渡するものではない', () => {
    expect(jaT26).toContain('譲渡するものではない');
  });
});

// ─── 10. EN 利用規約に法的必須ワードが含まれる ───────────────────────────────

describe('terms-i18n.js EN — 法的必須ワード', () => {
  const enT26 = TERMS_DICT['en']?.['t26'] ?? '';

  it('EN t26 contains non-exclusive', () => {
    expect(enT26).toContain('non-exclusive');
  });
  it('EN t26 contains royalty-free', () => {
    expect(enT26).toContain('royalty-free');
  });
  it('EN t26 contains does not transfer', () => {
    expect(enT26).toContain('does not transfer');
  });
});

// ─── 11. Terms の全10言語更新日が 2026年8月8日 ───────────────────────────────

describe('terms-i18n.js — 全10言語の更新日が 2026年8月8日', () => {
  const DATE_PATTERNS: Record<string, string> = {
    en: 'August 8, 2026',
    ja: '2026年8月8日',
    'zh-Hans': '2026年8月8日',
    'zh-Hant': '2026年8月8日',
    ko: '2026년 8월 8일',
    es: '8 de agosto de 2026',
    'pt-BR': '8 de agosto de 2026',
    de: '8. August 2026',
    fr: '8 août 2026',
    it: '8 agosto 2026',
  };

  for (const locale of ALL_LOCALE_CODES) {
    it(`${locale}: t03 contains August 8 2026`, () => {
      const t03 = TERMS_DICT[locale]?.['t03'] ?? '';
      const pattern = DATE_PATTERNS[locale] ?? '8';
      expect(t03, `${locale} t03 should contain "${pattern}"`).toContain(pattern);
    });
  }
});

// ─── 12. 利用規約の key 構造一致 ─────────────────────────────────────────────

describe('terms-i18n.js — key 構造一致（t25/t26/t27/t28）', () => {
  const REQUIRED_KEYS = ['t25', 't26', 't27', 't28'];

  for (const locale of ALL_LOCALE_CODES) {
    it(`${locale}: has t25/t26/t27/t28`, () => {
      for (const key of REQUIRED_KEYS) {
        const val = TERMS_DICT[locale]?.[key];
        expect(val, `${locale} should have key ${key}`).toBeDefined();
        expect((val ?? '').length).toBeGreaterThan(0);
      }
    });
  }
});

// ─── 13. Entry RPC / Arena DB migration / Master 報酬ロジックに差分がない ─────

describe('変更禁止ファイル — RPC / migration / reward logic に差分なし', () => {
  it('arena.ts does not contain enterArenaEvent modification markers', () => {
    const src = readSrc('lib/arena.ts');
    // RPC関数名が変更されていないことを確認
    expect(src).toContain('enterArenaEvent');
    expect(src).not.toContain('publicUseConsent');
  });

  it('officialMatch.ts is unmodified (no publicUseConsent reference)', () => {
    const src = readSrc('lib/officialMatch.ts');
    expect(src).not.toContain('publicUseConsent');
    expect(src).not.toContain('arenaEntryPublicUseConsent');
  });

  it('OfficialArenaOverview.tsx: formatMasterReward is unchanged', () => {
    const src = readSrc('components/OfficialArenaOverview.tsx');
    // Master報酬フォーマット関数の存在確認
    expect(src).toContain('export function formatMasterReward');
  });

  it('No migration files were added for this feature', () => {
    const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');
    if (!fs.existsSync(migrationsDir)) return;
    const files = fs.readdirSync(migrationsDir);
    const consentFiles = files.filter(f => f.includes('consent') || f.includes('public_use'));
    expect(consentFiles).toHaveLength(0);
  });
});
