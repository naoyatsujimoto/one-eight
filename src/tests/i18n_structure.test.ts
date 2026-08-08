import { describe, it, expect } from 'vitest';
import { SUPPORTED_LOCALES } from '../lib/locales';
import type { LocaleCode } from '../lib/locales';
import { EN_TRANSLATIONS } from '../i18n/en';
import { JA_TRANSLATIONS } from '../i18n/ja';
import { ZH_HANT_TRANSLATIONS } from '../i18n/zh-Hant';
import { ZH_HANS_TRANSLATIONS } from '../i18n/zh-Hans';
import { KO_TRANSLATIONS } from '../i18n/ko';
import { ES_TRANSLATIONS } from '../i18n/es';
import { PT_BR_TRANSLATIONS } from '../i18n/pt-BR';
import { DE_TRANSLATIONS } from '../i18n/de';
import { FR_TRANSLATIONS } from '../i18n/fr';
import { IT_TRANSLATIONS } from '../i18n/it';
import { resolveUiTranslations } from '../i18n/index';

const EXPECTED_LOCALES = ['zh-Hans', 'zh-Hant', 'es', 'en', 'pt-BR', 'ja', 'ko', 'de', 'fr', 'it'];

// All 10 locales are fully translated
const FULLY_TRANSLATED: Array<{ code: LocaleCode; dict: unknown }> = [
  { code: 'en', dict: EN_TRANSLATIONS },
  { code: 'ja', dict: JA_TRANSLATIONS },
  { code: 'zh-Hant', dict: ZH_HANT_TRANSLATIONS },
  { code: 'zh-Hans', dict: ZH_HANS_TRANSLATIONS },
  { code: 'ko', dict: KO_TRANSLATIONS },
  { code: 'es', dict: ES_TRANSLATIONS },
  { code: 'pt-BR', dict: PT_BR_TRANSLATIONS },
  { code: 'de', dict: DE_TRANSLATIONS },
  { code: 'fr', dict: FR_TRANSLATIONS },
  { code: 'it', dict: IT_TRANSLATIONS },
];

// Deep shape comparison utility
type LeafType = 'string' | 'number' | 'boolean' | 'function' | 'array' | 'object';

function getLeafType(v: unknown): LeafType {
  if (typeof v === 'function') return 'function';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'object' && v !== null) return 'object';
  return typeof v as LeafType;
}

function compareShapes(canonical: unknown, other: unknown, path = ''): string[] {
  const errors: string[] = [];

  if (getLeafType(canonical) !== getLeafType(other)) {
    errors.push(`[${path}] type mismatch: expected ${getLeafType(canonical)}, got ${getLeafType(other)}`);
    return errors;
  }

  if (typeof canonical === 'function') {
    if (canonical.length !== (other as Function).length) {
      errors.push(`[${path}] function arity mismatch: expected ${canonical.length}, got ${(other as Function).length}`);
    }
    return errors;
  }

  if (Array.isArray(canonical)) {
    if (!Array.isArray(other)) {
      errors.push(`[${path}] expected array`);
      return errors;
    }
    if (canonical.length !== other.length) {
      errors.push(`[${path}] array length mismatch: expected ${canonical.length}, got ${other.length}`);
    }
    // Compare first element structure if both non-empty
    if (canonical.length > 0 && other.length > 0) {
      errors.push(...compareShapes(canonical[0], other[0], `${path}[0]`));
    }
    return errors;
  }

  if (typeof canonical === 'object' && canonical !== null) {
    const canonicalKeys = Object.keys(canonical as object);
    const otherKeys = Object.keys(other as object);

    for (const key of canonicalKeys) {
      if (!(key in (other as object))) {
        errors.push(`[${path}.${key}] missing key in other`);
      } else {
        errors.push(...compareShapes((canonical as any)[key], (other as any)[key], `${path}.${key}`));
      }
    }

    for (const key of otherKeys) {
      if (!(key in (canonical as object))) {
        errors.push(`[${path}.${key}] extra key not in canonical`);
      }
    }

    return errors;
  }

  return errors;
}

// Collect all string leaves recursively
function collectStringLeaves(obj: unknown, path = ''): Array<{ path: string; value: string }> {
  const results: Array<{ path: string; value: string }> = [];
  if (typeof obj === 'string') {
    results.push({ path, value: obj });
  } else if (Array.isArray(obj)) {
    obj.forEach((item, i) => results.push(...collectStringLeaves(item, `${path}[${i}]`)));
  } else if (typeof obj === 'object' && obj !== null) {
    for (const [key, val] of Object.entries(obj as object)) {
      results.push(...collectStringLeaves(val, path ? `${path}.${key}` : key));
    }
  }
  return results;
}

// Collect all function keys
function collectFunctionKeys(obj: unknown, path = ''): Array<{ path: string; arity: number }> {
  const results: Array<{ path: string; arity: number }> = [];
  if (typeof obj === 'function') {
    results.push({ path, arity: (obj as Function).length });
  } else if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
    for (const [key, val] of Object.entries(obj as object)) {
      results.push(...collectFunctionKeys(val, path ? `${path}.${key}` : key));
    }
  }
  return results;
}

// Hiragana/Katakana detection
const HIRAGANA_KATAKANA_RE = /[\u3040-\u309F\u30A0-\u30FF]/;
// CJK Unified Ideographs (漢字・かな範囲)
const CJK_KANA_RE = /[\u3000-\u9FFF\uF900-\uFAFF]/;
// Hangul
const HANGUL_RE = /[\uAC00-\uD7FF\u1100-\u11FF\u3130-\u318F]/;

describe('i18n structure', () => {
  // 1. SUPPORTED_LOCALES が確定10localeと完全一致
  it('SUPPORTED_LOCALES matches exactly 10 expected locales', () => {
    const codes = SUPPORTED_LOCALES.map(l => l.code);
    expect(codes).toEqual(EXPECTED_LOCALES);
  });

  // 2. locale codeに重複がない
  it('no duplicate locale codes', () => {
    const codes = SUPPORTED_LOCALES.map(l => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  // 3. English dictionaryをcanonicalとして扱う
  it('EN_TRANSLATIONS is the canonical dictionary', () => {
    expect(typeof EN_TRANSLATIONS).toBe('object');
    expect(EN_TRANSLATIONS).toBeTruthy();
    const resolved = resolveUiTranslations('en');
    expect(resolved).toBe(EN_TRANSLATIONS as any);
  });

  // ===========================================================
  // Table-driven tests for all fully-translated locales
  // ===========================================================
  describe('fully translated locales (table-driven)', () => {
    for (const { code, dict } of FULLY_TRANSLATED) {
      describe(`locale: ${code}`, () => {
        // 1. resolveUiTranslations returns its own dict
        it(`resolveUiTranslations("${code}") returns the correct dictionary`, () => {
          const result = resolveUiTranslations(code);
          expect(result).toBe(dict as any);
        });

        // 2. Shape matches EN_TRANSLATIONS (all keys, types, arities)
        it(`shape matches EN_TRANSLATIONS`, () => {
          const errors = compareShapes(EN_TRANSLATIONS, dict);
          expect(errors).toEqual([]);
        });

        // 3. tutSteps array length matches
        it(`tutSteps array length matches EN`, () => {
          expect((dict as any).tutSteps.length).toBe(EN_TRANSLATIONS.tutSteps.length);
        });

        // 4. rulesBody array length matches
        it(`rulesBody array length matches EN`, () => {
          expect((dict as any).rulesBody.length).toBe(EN_TRANSLATIONS.rulesBody.length);
        });

        // 5. No empty string leaves
        it(`no empty string leaves`, () => {
          const leaves = collectStringLeaves(dict);
          const emptyLeaves = leaves.filter(l => l.value === '');
          expect(emptyLeaves).toEqual([]);
        });

        // 6. Function arities match EN
        it(`function arities match EN_TRANSLATIONS`, () => {
          const enFuncs = collectFunctionKeys(EN_TRANSLATIONS);
          const localeFuncs = collectFunctionKeys(dict);
          expect(localeFuncs.length).toBe(enFuncs.length);
          for (const enFunc of enFuncs) {
            const localeFunc = localeFuncs.find(f => f.path === enFunc.path);
            expect(localeFunc).toBeTruthy();
            expect(localeFunc?.arity).toBe(enFunc.arity);
          }
        });

        // 7. Dynamic function placeholder checks (representative values)
        it(`hintSelectiveConfirm(gate) preserves gate number`, () => {
          const result = (dict as any).hintSelectiveConfirm(5);
          expect(result).toContain('5');
        });

        it(`hintSelectiveSecond(gate) preserves gate number`, () => {
          const result = (dict as any).hintSelectiveSecond(3);
          expect(result).toContain('3');
        });

        it(`hintQuadConfirm(n, max) preserves n and max`, () => {
          const result = (dict as any).hintQuadConfirm(2, 4);
          expect(result).toContain('2');
          expect(result).toContain('4');
        });

        it(`analyzingEstimate(sec) short branch preserves sec`, () => {
          const result = (dict as any).analyzingEstimate(30);
          expect(result).toContain('30');
        });

        it(`analyzingEstimate(sec) long branch preserves minutes`, () => {
          const result = (dict as any).analyzingEstimate(120);
          expect(result).toContain('2');
        });

        it(`cpuProfileTitle(d) preserves d`, () => {
          const result = (dict as any).cpuProfileTitle('al-Kashi');
          expect(result).toContain('al-Kashi');
        });

        it(`omStartsIn(label) preserves label`, () => {
          const result = (dict as any).omStartsIn('5min');
          expect(result).toContain('5min');
        });

        it(`proRenewsOn(date) preserves date`, () => {
          const result = (dict as any).proRenewsOn('2025-08-01');
          expect(result).toContain('2025-08-01');
        });

        it(`omMatchesOn(dateStr) preserves dateStr`, () => {
          const result = (dict as any).omMatchesOn('2025-08-01');
          expect(result).toContain('2025-08-01');
        });
      });
    }
  });

  // ===========================================================
  // Character contamination checks
  // ===========================================================
  describe('character contamination checks', () => {
    it('ZH_HANS_TRANSLATIONS contains no Hiragana or Katakana', () => {
      const leaves = collectStringLeaves(ZH_HANS_TRANSLATIONS);
      const contaminated = leaves.filter(l => HIRAGANA_KATAKANA_RE.test(l.value));
      expect(contaminated).toEqual([]);
    });

    it('KO_TRANSLATIONS contains no Hiragana or Katakana', () => {
      const leaves = collectStringLeaves(KO_TRANSLATIONS);
      const contaminated = leaves.filter(l => HIRAGANA_KATAKANA_RE.test(l.value));
      expect(contaminated).toEqual([]);
    });

    it('ES_TRANSLATIONS contains no CJK or Kana characters', () => {
      const leaves = collectStringLeaves(ES_TRANSLATIONS);
      const contaminated = leaves.filter(l => CJK_KANA_RE.test(l.value));
      expect(contaminated).toEqual([]);
    });

    it('ES_TRANSLATIONS contains no Hangul characters', () => {
      const leaves = collectStringLeaves(ES_TRANSLATIONS);
      const contaminated = leaves.filter(l => HANGUL_RE.test(l.value));
      expect(contaminated).toEqual([]);
    });

    it('PT_BR_TRANSLATIONS contains no CJK or Kana characters', () => {
      const leaves = collectStringLeaves(PT_BR_TRANSLATIONS);
      const contaminated = leaves.filter(l => CJK_KANA_RE.test(l.value));
      expect(contaminated).toEqual([]);
    });

    it('PT_BR_TRANSLATIONS contains no Hangul characters', () => {
      const leaves = collectStringLeaves(PT_BR_TRANSLATIONS);
      const contaminated = leaves.filter(l => HANGUL_RE.test(l.value));
      expect(contaminated).toEqual([]);
    });

    it('ZH_HANT_TRANSLATIONS contains no Hiragana or Katakana', () => {
      const leaves = collectStringLeaves(ZH_HANT_TRANSLATIONS);
      const contaminated = leaves.filter(l => HIRAGANA_KATAKANA_RE.test(l.value));
      expect(contaminated).toEqual([]);
    });

    it('DE_TRANSLATIONS contains no CJK or Kana characters', () => {
      const leaves = collectStringLeaves(DE_TRANSLATIONS);
      const contaminated = leaves.filter(l => CJK_KANA_RE.test(l.value));
      expect(contaminated).toEqual([]);
    });

    it('DE_TRANSLATIONS contains no Hangul characters', () => {
      const leaves = collectStringLeaves(DE_TRANSLATIONS);
      const contaminated = leaves.filter(l => HANGUL_RE.test(l.value));
      expect(contaminated).toEqual([]);
    });

    it('FR_TRANSLATIONS contains no CJK or Kana characters', () => {
      const leaves = collectStringLeaves(FR_TRANSLATIONS);
      const contaminated = leaves.filter(l => CJK_KANA_RE.test(l.value));
      expect(contaminated).toEqual([]);
    });

    it('FR_TRANSLATIONS contains no Hangul characters', () => {
      const leaves = collectStringLeaves(FR_TRANSLATIONS);
      const contaminated = leaves.filter(l => HANGUL_RE.test(l.value));
      expect(contaminated).toEqual([]);
    });

    it('IT_TRANSLATIONS contains no CJK or Kana characters', () => {
      const leaves = collectStringLeaves(IT_TRANSLATIONS);
      const contaminated = leaves.filter(l => CJK_KANA_RE.test(l.value));
      expect(contaminated).toEqual([]);
    });

    it('IT_TRANSLATIONS contains no Hangul characters', () => {
      const leaves = collectStringLeaves(IT_TRANSLATIONS);
      const contaminated = leaves.filter(l => HANGUL_RE.test(l.value));
      expect(contaminated).toEqual([]);
    });
  });

  // ===========================================================
  // All SUPPORTED_LOCALES resolve to their own dictionary
  // ===========================================================
  describe('all SUPPORTED_LOCALES have own dictionaries', () => {
    for (const { code, dict } of FULLY_TRANSLATED) {
      it(`resolveUiTranslations("${code}") returns its own dictionary (not EN fallback)`, () => {
        const result = resolveUiTranslations(code);
        expect(result).toBe(dict as any);
      });
    }

    it('unknown locale safely falls back to EN_TRANSLATIONS', () => {
      const result = resolveUiTranslations('unknown' as LocaleCode);
      expect(result).toBe(EN_TRANSLATIONS as any);
    });
  });

  // ===========================================================
  // EN_TRANSLATIONS integrity checks
  // ===========================================================
  it('EN_TRANSLATIONS has expected top-level keys', () => {
    expect(typeof EN_TRANSLATIONS.titleSub).toBe('string');
    expect(typeof EN_TRANSLATIONS.tutSteps).toBe('object');
    expect(Array.isArray(EN_TRANSLATIONS.tutSteps)).toBe(true);
    expect(typeof EN_TRANSLATIONS.hintSelectiveConfirm).toBe('function');
    expect(typeof EN_TRANSLATIONS.hintQuadConfirm).toBe('function');
    expect(typeof EN_TRANSLATIONS.rulesBody).toBe('object');
  });

  it('EN_TRANSLATIONS top-level key count is unchanged', () => {
    const enKeys = Object.keys(EN_TRANSLATIONS);
    expect(enKeys.length).toBeGreaterThan(0);
    expect(enKeys).toContain('titleSub');
    expect(enKeys).toContain('tutSteps');
    expect(enKeys).toContain('rulesBody');
    expect(enKeys).toContain('hintSelectiveConfirm');
  });

  it('JA_TRANSLATIONS is still structurally valid', () => {
    const errors = compareShapes(EN_TRANSLATIONS, JA_TRANSLATIONS);
    expect(errors).toEqual([]);
  });

  it('ZH_HANT_TRANSLATIONS is still structurally valid', () => {
    const errors = compareShapes(EN_TRANSLATIONS, ZH_HANT_TRANSLATIONS);
    expect(errors).toEqual([]);
  });

  // ===========================================================
  // STATS translation audit: JA and FR
  // ===========================================================
  describe('STATS translation audit', () => {
    it('JA statsVisibility does not contain "STATS"', () => {
      expect(JA_TRANSLATIONS.statsVisibility).not.toContain('STATS');
    });

    it('JA opponentStats does not contain "STATS"', () => {
      expect(JA_TRANSLATIONS.opponentStats).not.toContain('STATS');
    });

    it('JA statsPrivateMsg does not contain "STATS"', () => {
      expect(JA_TRANSLATIONS.statsPrivateMsg).not.toContain('STATS');
    });

    // JA target key values are non-empty
    it('JA statsVisibility is non-empty', () => {
      expect(JA_TRANSLATIONS.statsVisibility.length).toBeGreaterThan(0);
    });

    it('JA opponentStats is non-empty', () => {
      expect(JA_TRANSLATIONS.opponentStats.length).toBeGreaterThan(0);
    });

    it('JA statsPrivateMsg is non-empty', () => {
      expect(JA_TRANSLATIONS.statsPrivateMsg.length).toBeGreaterThan(0);
    });

    // FR: no standalone English abbreviation 'Stats' or 'stats'
    // Matches word-boundary occurrences only (not part of 'Statistiques')
    const FR_STATS_ABBR_RE = /\bStats\b|\bstats\b/;

    it('FR stats does not contain standalone Stats/stats abbreviation', () => {
      expect(FR_STATS_ABBR_RE.test(FR_TRANSLATIONS.stats)).toBe(false);
    });

    it('FR statsVisibility does not contain standalone Stats/stats abbreviation', () => {
      expect(FR_STATS_ABBR_RE.test(FR_TRANSLATIONS.statsVisibility)).toBe(false);
    });

    it('FR opponentStats does not contain standalone Stats/stats abbreviation', () => {
      expect(FR_STATS_ABBR_RE.test(FR_TRANSLATIONS.opponentStats)).toBe(false);
    });

    it('FR statsPrivateMsg does not contain standalone Stats/stats abbreviation', () => {
      expect(FR_STATS_ABBR_RE.test(FR_TRANSLATIONS.statsPrivateMsg)).toBe(false);
    });

    it('FR myStats does not contain standalone Stats/stats abbreviation', () => {
      expect(FR_STATS_ABBR_RE.test(FR_TRANSLATIONS.myStats)).toBe(false);
    });

    // FR target keys are non-empty
    it('FR stats is non-empty', () => {
      expect(FR_TRANSLATIONS.stats.length).toBeGreaterThan(0);
    });

    it('FR statsVisibility is non-empty', () => {
      expect(FR_TRANSLATIONS.statsVisibility.length).toBeGreaterThan(0);
    });

    it('FR opponentStats is non-empty', () => {
      expect(FR_TRANSLATIONS.opponentStats.length).toBeGreaterThan(0);
    });

    it('FR statsPrivateMsg is non-empty', () => {
      expect(FR_TRANSLATIONS.statsPrivateMsg.length).toBeGreaterThan(0);
    });

    it('FR myStats is non-empty', () => {
      expect(FR_TRANSLATIONS.myStats.length).toBeGreaterThan(0);
    });
  });
});
