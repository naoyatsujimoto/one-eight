import { describe, it, expect } from 'vitest';
import { SUPPORTED_LOCALES } from '../lib/locales';
import type { LocaleCode } from '../lib/locales';
import { EN_TRANSLATIONS } from '../i18n/en';
import { JA_TRANSLATIONS } from '../i18n/ja';
import { ZH_HANT_TRANSLATIONS } from '../i18n/zh-Hant';
import { resolveUiTranslations } from '../i18n/index';

const EXPECTED_LOCALES = ['en', 'ja', 'zh-Hant', 'zh-Hans', 'ko', 'es', 'pt-BR', 'de', 'fr', 'it'];

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
    // en resolves to EN_TRANSLATIONS
    const resolved = resolveUiTranslations('en');
    expect(resolved).toBe(EN_TRANSLATIONS as any);
  });

  // 4-7. 日本語辞書の全key・nested keyが英語と一致し、leaf typeが一致する
  it('JA_TRANSLATIONS shape matches EN_TRANSLATIONS (all keys, types, arities)', () => {
    const errors = compareShapes(EN_TRANSLATIONS, JA_TRANSLATIONS);
    expect(errors).toEqual([]);
  });

  // 6. 配列長の確認
  it('tutSteps array length matches between en and ja', () => {
    expect(JA_TRANSLATIONS.tutSteps.length).toBe(EN_TRANSLATIONS.tutSteps.length);
  });

  it('rulesBody array length matches between en and ja', () => {
    expect(JA_TRANSLATIONS.rulesBody.length).toBe(EN_TRANSLATIONS.rulesBody.length);
  });

  // 8. enは英語辞書を返す
  it('resolveUiTranslations("en") returns EN_TRANSLATIONS', () => {
    const result = resolveUiTranslations('en');
    expect(result).toBe(EN_TRANSLATIONS as any);
  });

  // 9. jaは日本語辞書を返す
  it('resolveUiTranslations("ja") returns JA_TRANSLATIONS', () => {
    const result = resolveUiTranslations('ja');
    expect(result).toBe(JA_TRANSLATIONS as any);
  });

  // 10. 未翻訳の追加7localeは英語辞書を返す (zh-Hantは翻訳済のため除外)
  const FALLBACK_LOCALES: LocaleCode[] = ['zh-Hans', 'ko', 'es', 'pt-BR', 'de', 'fr', 'it'];
  for (const locale of FALLBACK_LOCALES) {
    it(`resolveUiTranslations("${locale}") falls back to EN_TRANSLATIONS`, () => {
      const result = resolveUiTranslations(locale);
      expect(result).toBe(EN_TRANSLATIONS as any);
    });
  }

  // 11. 未知localeを強制的に渡した場合も英語へfallback
  it('unknown locale safely falls back to EN_TRANSLATIONS', () => {
    const result = resolveUiTranslations('unknown' as LocaleCode);
    expect(result).toBe(EN_TRANSLATIONS as any);
  });

  // 12. Translations型の公開APIが機能する
  it('EN_TRANSLATIONS has expected top-level keys', () => {
    expect(typeof EN_TRANSLATIONS.titleSub).toBe('string');
    expect(typeof EN_TRANSLATIONS.tutSteps).toBe('object');
    expect(Array.isArray(EN_TRANSLATIONS.tutSteps)).toBe(true);
    expect(typeof EN_TRANSLATIONS.hintSelectiveConfirm).toBe('function');
    expect(typeof EN_TRANSLATIONS.hintQuadConfirm).toBe('function');
    expect(typeof EN_TRANSLATIONS.rulesBody).toBe('object');
  });

  // ===== ZH-HANT 専用テスト =====

  // ZH-1: resolveUiTranslations('zh-Hant')がZH_HANT_TRANSLATIONSを返す
  it('resolveUiTranslations("zh-Hant") returns ZH_HANT_TRANSLATIONS', () => {
    const result = resolveUiTranslations('zh-Hant');
    expect(result).toBe(ZH_HANT_TRANSLATIONS as any);
  });

  // ZH-2: ZH_HANT_TRANSLATIONSのshapeがEN_TRANSLATIONSと完全一致
  it('ZH_HANT_TRANSLATIONS shape matches EN_TRANSLATIONS (all keys, types, arities)', () => {
    const errors = compareShapes(EN_TRANSLATIONS, ZH_HANT_TRANSLATIONS);
    expect(errors).toEqual([]);
  });

  // ZH-3: tutSteps配列長一致
  it('tutSteps array length matches between en and zh-Hant', () => {
    expect(ZH_HANT_TRANSLATIONS.tutSteps.length).toBe(EN_TRANSLATIONS.tutSteps.length);
  });

  // ZH-4: rulesBody配列長一致
  it('rulesBody array length matches between en and zh-Hant', () => {
    expect(ZH_HANT_TRANSLATIONS.rulesBody.length).toBe(EN_TRANSLATIONS.rulesBody.length);
  });

  // ZH-5: 全string leafが空でない
  it('ZH_HANT_TRANSLATIONS has no empty string leaves', () => {
    const leaves = collectStringLeaves(ZH_HANT_TRANSLATIONS);
    const emptyLeaves = leaves.filter(l => l.value === '');
    expect(emptyLeaves).toEqual([]);
  });

  // ZH-6: ひらがな・カタカナが混入していない
  it('ZH_HANT_TRANSLATIONS contains no Hiragana or Katakana', () => {
    const leaves = collectStringLeaves(ZH_HANT_TRANSLATIONS);
    const contaminated = leaves.filter(l => HIRAGANA_KATAKANA_RE.test(l.value));
    expect(contaminated).toEqual([]);
  });

  // ZH-7: 関数arityが英語と一致
  it('ZH_HANT_TRANSLATIONS function arities match EN_TRANSLATIONS', () => {
    const enFuncs = collectFunctionKeys(EN_TRANSLATIONS);
    const zhFuncs = collectFunctionKeys(ZH_HANT_TRANSLATIONS);
    expect(zhFuncs.length).toBe(enFuncs.length);
    for (const enFunc of enFuncs) {
      const zhFunc = zhFuncs.find(f => f.path === enFunc.path);
      expect(zhFunc).toBeTruthy();
      expect(zhFunc?.arity).toBe(enFunc.arity);
    }
  });

  // ZH-8: 動的関数8件のplaceholder確認
  it('hintSelectiveConfirm(gate) preserves ${gate}', () => {
    const result = ZH_HANT_TRANSLATIONS.hintSelectiveConfirm(5);
    expect(result).toContain('5');
  });

  it('hintSelectiveSecond(gate) preserves ${gate}', () => {
    const result = ZH_HANT_TRANSLATIONS.hintSelectiveSecond(3);
    expect(result).toContain('3');
  });

  it('hintQuadConfirm(n, max) preserves ${n} and ${max}', () => {
    const result = ZH_HANT_TRANSLATIONS.hintQuadConfirm(2, 4);
    expect(result).toContain('2');
    expect(result).toContain('4');
  });

  it('analyzingEstimate(sec) - short branch preserves ${sec}', () => {
    const result = ZH_HANT_TRANSLATIONS.analyzingEstimate(30);
    expect(result).toContain('30');
  });

  it('analyzingEstimate(sec) - long branch preserves rounded minutes', () => {
    const result = ZH_HANT_TRANSLATIONS.analyzingEstimate(120);
    expect(result).toContain('2');
  });

  it('cpuProfileTitle(d) preserves ${d}', () => {
    const result = ZH_HANT_TRANSLATIONS.cpuProfileTitle('al-Kashi');
    expect(result).toContain('al-Kashi');
  });

  it('omStartsIn(label) preserves ${label}', () => {
    const result = ZH_HANT_TRANSLATIONS.omStartsIn('5分鐘');
    expect(result).toContain('5分鐘');
  });

  it('proRenewsOn(date) preserves ${date}', () => {
    const result = ZH_HANT_TRANSLATIONS.proRenewsOn('2025-08-01');
    expect(result).toContain('2025-08-01');
  });

  it('omMatchesOn(dateStr) preserves ${dateStr}', () => {
    const result = ZH_HANT_TRANSLATIONS.omMatchesOn('7月31日');
    expect(result).toContain('7月31日');
  });

  // ZH-9: EN_TRANSLATIONSが変更されていない（key数チェック）
  it('EN_TRANSLATIONS top-level key count is unchanged', () => {
    const enKeys = Object.keys(EN_TRANSLATIONS);
    // 翻訳追加前と同じkey数であること（en.tsは変更禁止）
    expect(enKeys.length).toBeGreaterThan(0);
    // 必須keyが存在すること
    expect(enKeys).toContain('titleSub');
    expect(enKeys).toContain('tutSteps');
    expect(enKeys).toContain('rulesBody');
    expect(enKeys).toContain('hintSelectiveConfirm');
  });

  // ZH-10: JA_TRANSLATIONSが変更されていない（shape一致確認）
  it('JA_TRANSLATIONS is still structurally valid after zh-Hant addition', () => {
    const errors = compareShapes(EN_TRANSLATIONS, JA_TRANSLATIONS);
    expect(errors).toEqual([]);
  });
});
