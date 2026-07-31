import { describe, it, expect } from 'vitest';
import { SUPPORTED_LOCALES } from '../lib/locales';
import type { LocaleCode } from '../lib/locales';
import { EN_TRANSLATIONS } from '../i18n/en';
import { JA_TRANSLATIONS } from '../i18n/ja';
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

  // 10. 未翻訳の追加8localeは英語辞書を返す
  const FALLBACK_LOCALES: LocaleCode[] = ['zh-Hant', 'zh-Hans', 'ko', 'es', 'pt-BR', 'de', 'fr', 'it'];
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
});
