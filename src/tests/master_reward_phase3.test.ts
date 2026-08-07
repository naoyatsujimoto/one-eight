/**
 * master_reward_phase3.test.ts
 * Master報酬制度改定 Phase 3 — Terms/Pricing/Pro ページ検証
 *
 * テスト項目:
 * 1. 利用規約JA/ENに「Master報酬」「Master Reward」が含まれる
 * 2. 利用規約JA/ENに「出場調整義務」/「Scheduling Obligation」が含まれる
 * 3. 利用規約JA/ENに「会費収入によって変動しない」/「membership fee revenue」が含まれる
 * 4. 利用規約JA/ENに「賭け金」/「wager」が明示的に否定されている（「ではない」等）
 * 5. Pricing/ProページJA/ENに「恒久的にPro限定」と断定する文言がない
 * 6. Pricing/ProページJA/ENに「初期運営期間」/「initial launch period」が含まれる
 * 7. 未翻訳keyが残り8言語にEN fallbackとして存在する（TODOコメント確認）
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PUBLIC = path.resolve(__dirname, '../../public');
const readPublic = (name: string) => fs.readFileSync(path.join(PUBLIC, name), 'utf8');

/** Load a static-i18n-style JS dict file and return the registered dict. */
function loadDict(filename: string): Record<string, Record<string, string | undefined> | undefined> {
  const src = readPublic(filename);
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

const TERMS_DICT = loadDict('terms-i18n.js');
const PRICING_DICT = loadDict('pricing-i18n.js');
const PRO_DICT = loadDict('pro-i18n.js');

const ALL_8_LOCALES = ['zh-Hant', 'zh-Hans', 'ko', 'es', 'pt-BR', 'de', 'fr', 'it'];

// ---------------------------------------------------------------------------
// 1. 利用規約JA/ENに「Master報酬」「Master Reward」が含まれる
// ---------------------------------------------------------------------------

describe('terms — Master Reward content (JA/EN)', () => {
  it('JA: contains Master報酬', () => {
    const jaContent = Object.values(TERMS_DICT['ja'] ?? {}).join(' ');
    expect(jaContent).toContain('Master報酬');
  });

  it('EN: contains Master Reward', () => {
    const enContent = Object.values(TERMS_DICT['en'] ?? {}).join(' ');
    expect(enContent).toContain('Master Reward');
  });
});

// ---------------------------------------------------------------------------
// 2. 利用規約JA/ENに「出場調整義務」/「Scheduling Obligation」が含まれる
// ---------------------------------------------------------------------------

describe('terms — Scheduling Obligation content (JA/EN)', () => {
  it('JA: contains 出場調整義務', () => {
    const jaContent = Object.values(TERMS_DICT['ja'] ?? {}).join(' ');
    expect(jaContent).toContain('出場調整義務');
  });

  it('EN: contains Scheduling Obligation', () => {
    const enContent = Object.values(TERMS_DICT['en'] ?? {}).join(' ');
    expect(enContent).toContain('Scheduling Obligation');
  });
});

// ---------------------------------------------------------------------------
// 3. 利用規約JA/ENに「会費収入によって変動しない」/「membership fee revenue」が含まれる
// ---------------------------------------------------------------------------

describe('terms — membership fee revenue not variable (JA/EN)', () => {
  it('JA: contains 会費収入', () => {
    const t30ja = TERMS_DICT['ja']?.['t30'] ?? '';
    expect(t30ja).toContain('会費収入');
  });

  it('JA: t30 contains 変動しない', () => {
    const t30ja = TERMS_DICT['ja']?.['t30'] ?? '';
    expect(t30ja).toContain('変動しない');
  });

  it('EN: t30 contains membership fee revenue', () => {
    const t30en = TERMS_DICT['en']?.['t30'] ?? '';
    expect(t30en).toContain('membership fee revenue');
  });
});

// ---------------------------------------------------------------------------
// 4. 利用規約JA/ENに「賭け金」/「wager」が否定されている
// ---------------------------------------------------------------------------

describe('terms — wager is explicitly denied (JA/EN)', () => {
  it('JA: t32 contains 賭け金', () => {
    const t32ja = TERMS_DICT['ja']?.['t32'] ?? '';
    expect(t32ja).toContain('賭け金');
  });

  it('JA: t32 denies 賭け金 (contains ではない)', () => {
    const t32ja = TERMS_DICT['ja']?.['t32'] ?? '';
    // The text says 「賭け金...ではない」
    expect(t32ja).toMatch(/賭け金/);
    expect(t32ja).toMatch(/ではない/);
  });

  it('EN: t32 contains wager', () => {
    const t32en = TERMS_DICT['en']?.['t32'] ?? '';
    expect(t32en).toContain('wager');
  });

  it('EN: t32 says fee is not a wager (contains "is not a wager")', () => {
    const t32en = TERMS_DICT['en']?.['t32'] ?? '';
    expect(t32en).toContain('not a wager');
  });
});

// ---------------------------------------------------------------------------
// 5. Pricing/ProページJA/ENに「恒久的にPro限定」と断定する文言がない
// ---------------------------------------------------------------------------

describe('pricing/pro — no permanent Pro-exclusive Arena claim (JA/EN)', () => {
  it('pricing JA: arenaEntryNote does not contain 恒久', () => {
    const note = PRICING_DICT['ja']?.['arenaEntryNote'] ?? '';
    expect(note).not.toContain('恒久');
  });

  it('pricing EN: arenaEntryNote does not contain "exclusively and permanently"', () => {
    const note = PRICING_DICT['en']?.['arenaEntryNote'] ?? '';
    expect(note).not.toMatch(/exclusively and permanently/i);
  });

  it('pro JA: arenaEntryNote does not claim permanent Pro-exclusivity', () => {
    const note = PRO_DICT['ja']?.['arenaEntryNote'] ?? '';
    expect(note).not.toContain('永久にPro限定');
    expect(note).not.toContain('常にPro専用');
  });

  it('pro EN: arenaEntryNote does not claim permanent Pro-exclusivity', () => {
    const note = PRO_DICT['en']?.['arenaEntryNote'] ?? '';
    expect(note).not.toMatch(/permanently (exclusive|limited) to Pro/i);
  });

  it('pricing JA: proFeature does not guarantee Master Reward', () => {
    // None of the proFeature keys should claim Master Reward guarantee
    const jaDict = PRICING_DICT['ja'] ?? {};
    const proFeatures = [1, 2, 3, 4, 5].map(i => jaDict[`proFeature${i}`] ?? '').join(' ');
    expect(proFeatures).not.toContain('Master報酬が保証');
  });

  it('pricing EN: proFeature does not guarantee Master Reward', () => {
    const enDict = PRICING_DICT['en'] ?? {};
    const proFeatures = [1, 2, 3, 4, 5].map(i => enDict[`proFeature${i}`] ?? '').join(' ');
    expect(proFeatures).not.toMatch(/guarantee.*Master Reward/i);
  });
});

// ---------------------------------------------------------------------------
// 6. Pricing/ProページJA/ENに「初期運営期間」/「initial launch period」が含まれる
// ---------------------------------------------------------------------------

describe('pricing/pro — initial launch period (JA/EN)', () => {
  it('pricing JA: arenaEntryNote contains 初期運営期間', () => {
    const note = PRICING_DICT['ja']?.['arenaEntryNote'] ?? '';
    expect(note).toContain('初期運営期間');
  });

  it('pricing EN: arenaEntryNote contains initial launch period', () => {
    const note = PRICING_DICT['en']?.['arenaEntryNote'] ?? '';
    expect(note).toContain('initial launch period');
  });

  it('pro JA: arenaEntryNote contains 初期運営期間', () => {
    const note = PRO_DICT['ja']?.['arenaEntryNote'] ?? '';
    expect(note).toContain('初期運営期間');
  });

  it('pro EN: arenaEntryNote contains initial launch period', () => {
    const note = PRO_DICT['en']?.['arenaEntryNote'] ?? '';
    expect(note).toContain('initial launch period');
  });

  it('pricing JA: proFeeNote contains Master報酬', () => {
    const note = PRICING_DICT['ja']?.['proFeeNote'] ?? '';
    expect(note).toContain('Master報酬');
  });

  it('pricing EN: proFeeNote contains Master Reward', () => {
    const note = PRICING_DICT['en']?.['proFeeNote'] ?? '';
    expect(note).toContain('Master Reward');
  });
});

// ---------------------------------------------------------------------------
// 7. 最終仕様: 8言語 翻訳済み確認
// ---------------------------------------------------------------------------

// ── 最終仕様: terms 8言語 t25〜t34 翻訳済み確認 ──────────────────────────────

describe('terms — 8 locales t25〜t34 are translated', () => {
  const EN = TERMS_DICT['en'] ?? {};
  // 本文キー（説明文）は必ずEN!=locale
  const BODY_KEYS = ['t26', 't28', 't30', 't32', 't34'];
  // 見出しキー（Proper noun含む）はENと同じでも許容
  const HEADING_KEYS = ['t25', 't27', 't29', 't31', 't33'];

  for (const locale of ALL_8_LOCALES) {
    const d = TERMS_DICT[locale] ?? {};

    it(`${locale}: all t25-t34 keys exist and are non-empty`, () => {
      for (const k of [...BODY_KEYS, ...HEADING_KEYS]) {
        expect(d[k], `${locale} ${k} missing`).toBeDefined();
        expect(d[k], `${locale} ${k} must not be empty`).not.toBe('');
      }
    });

    it(`${locale}: body keys t26/t28/t30/t32/t34 are not EN fallback`, () => {
      for (const k of BODY_KEYS) {
        expect(d[k], `${locale} ${k} must not be EN fallback`).not.toBe(EN[k]);
      }
    });
  }
});

// ── 最終仕様: pricing 8言語 arenaEntryNote/proFeeNote 翻訳済み確認 ──────────

describe('pricing — 8 locales arenaEntryNote/proFeeNote are translated (not EN fallback)', () => {
  const EN_ARENA = PRICING_DICT['en']?.['arenaEntryNote'] ?? '';
  const EN_PROFEE = PRICING_DICT['en']?.['proFeeNote'] ?? '';

  for (const locale of ALL_8_LOCALES) {
    it(`${locale}: arenaEntryNote exists and is not EN fallback`, () => {
      const val = PRICING_DICT[locale]?.['arenaEntryNote'];
      expect(val, `${locale} arenaEntryNote missing`).toBeDefined();
      expect(val, `${locale} arenaEntryNote must not be empty`).not.toBe('');
      expect(val, `${locale} arenaEntryNote must not be EN fallback`).not.toBe(EN_ARENA);
    });

    it(`${locale}: proFeeNote exists and is not EN fallback`, () => {
      const val = PRICING_DICT[locale]?.['proFeeNote'];
      expect(val, `${locale} proFeeNote missing`).toBeDefined();
      expect(val, `${locale} proFeeNote must not be empty`).not.toBe('');
      expect(val, `${locale} proFeeNote must not be EN fallback`).not.toBe(EN_PROFEE);
    });
  }
});

// ── 最終仕様: pro 8言語 arenaDesc/arenaEntryNote/proFeeNote 翻訳済み確認 ────

describe('pro — 8 locales arenaDesc/arenaEntryNote/proFeeNote are translated (not EN fallback)', () => {
  const EN_DESC   = PRO_DICT['en']?.['arenaDesc']      ?? '';
  const EN_ARENA  = PRO_DICT['en']?.['arenaEntryNote'] ?? '';
  const EN_PROFEE = PRO_DICT['en']?.['proFeeNote']     ?? '';

  for (const locale of ALL_8_LOCALES) {
    it(`${locale}: arenaDesc exists and is not EN fallback`, () => {
      const val = PRO_DICT[locale]?.['arenaDesc'];
      expect(val, `${locale} arenaDesc missing`).toBeDefined();
      expect(val, `${locale} arenaDesc must not be empty`).not.toBe('');
      expect(val, `${locale} arenaDesc must not be EN fallback`).not.toBe(EN_DESC);
    });

    it(`${locale}: arenaEntryNote exists and is not EN fallback`, () => {
      const val = PRO_DICT[locale]?.['arenaEntryNote'];
      expect(val, `${locale} arenaEntryNote missing`).toBeDefined();
      expect(val, `${locale} arenaEntryNote must not be empty`).not.toBe('');
      expect(val, `${locale} arenaEntryNote must not be EN fallback`).not.toBe(EN_ARENA);
    });

    it(`${locale}: proFeeNote exists and is not EN fallback`, () => {
      const val = PRO_DICT[locale]?.['proFeeNote'];
      expect(val, `${locale} proFeeNote missing`).toBeDefined();
      expect(val, `${locale} proFeeNote must not be empty`).not.toBe('');
      expect(val, `${locale} proFeeNote must not be EN fallback`).not.toBe(EN_PROFEE);
    });
  }
});

// ---------------------------------------------------------------------------
// 8. terms.html に新セクションのdata-i18nキーが存在する
// ---------------------------------------------------------------------------

describe('terms.html — new Phase 3 sections are referenced', () => {
  const html = readPublic('terms.html');

  it('terms.html references t25 (Official Arena heading)', () => {
    expect(html).toContain('data-i18n="t25"');
  });

  it('terms.html references t27 (Master heading)', () => {
    expect(html).toContain('data-i18n="t27"');
  });

  it('terms.html references t29 (Master Reward heading)', () => {
    expect(html).toContain('data-i18n="t29"');
  });

  it('terms.html references t31 (Pro Fee heading)', () => {
    expect(html).toContain('data-i18n="t31"');
  });

  it('terms.html references t33 (Entry eligibility heading)', () => {
    expect(html).toContain('data-i18n="t33"');
  });
});

describe('pricing.html — Phase 3 notes are referenced', () => {
  const html = readPublic('pricing.html');

  it('pricing.html references arenaEntryNote', () => {
    expect(html).toContain('data-i18n="arenaEntryNote"');
  });

  it('pricing.html references proFeeNote', () => {
    expect(html).toContain('data-i18n="proFeeNote"');
  });
});

describe('pro.html — Phase 3 notes are referenced', () => {
  const html = readPublic('pro.html');

  it('pro.html references arenaEntryNote', () => {
    expect(html).toContain('data-i18n="arenaEntryNote"');
  });

  it('pro.html references proFeeNote', () => {
    expect(html).toContain('data-i18n="proFeeNote"');
  });
});

// NOTE: Phase 3東封テスト「TODO comments for untranslated locales」はPhase 4翻訳完了により削除済み。
// i18n source files のTODOコメントは不要であり、最終仕様では上記の翻訳済み確認テストを以て代替する。
