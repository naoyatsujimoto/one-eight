/**
 * static_i18n_phase5.test.ts
 * ONE EIGHT — Phase 5-1H2: 10言語化 Pricing / Pro i18n テスト
 *
 * 対象:
 *   public/static-i18n.js
 *   public/pricing-i18n.js
 *   public/pro-i18n.js
 *   public/pricing.html
 *   public/pro.html
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PUBLIC_DIR = path.resolve(__dirname, '../../public');

function readPublic(name: string): string {
  return fs.readFileSync(path.join(PUBLIC_DIR, name), 'utf8');
}

type DictLocale = Record<string, unknown>;
type DictMap    = Record<string, DictLocale>;

/**
 * Load static-i18n.js via vm, injecting actual jsdom globals for DOM tests.
 * module.exports is populated via the IIFE's CJS branch.
 */
function loadStaticI18n() {
  const code = readPublic('static-i18n.js');
  const mod = { exports: {} as Record<string, unknown> };
  const sandbox: Record<string, unknown> = {
    module: mod,
    exports: mod.exports,
    window:       globalThis as unknown,
    document:     (globalThis as unknown as Record<string, unknown>)['document'],
    localStorage: (globalThis as unknown as Record<string, unknown>)['localStorage'],
    navigator:    (globalThis as unknown as Record<string, unknown>)['navigator'],
    CustomEvent:  (globalThis as unknown as Record<string, unknown>)['CustomEvent'],
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return mod.exports as {
    supportedLocales: string[];
    resolveLocale:    (raw: string | null | undefined) => string;
    getIntlLocale:    (locale: string) => string;
    getCurrentLocale: () => string;
    registerPage:     (dict: object) => void;
    apply:            () => void;
    setLocale:        (locale: string) => void;
    translate:        (key: string, locale?: string, ...args: unknown[]) => string | undefined;
  };
}

/**
 * Load a page-dict file via sandboxed vm; returns the dict from registerPage().
 */
function extractDict(filename: string): DictMap {
  const code = readPublic(filename);
  let captured: DictMap | null = null;
  const mockI18n = {
    registerPage: (d: DictMap) => { captured = d; },
    apply:        () => {},
  };
  const sandbox: Record<string, unknown> = {
    window:   { ONE_EIGHT_STATIC_I18N: mockI18n },
    document: { readyState: 'complete', addEventListener: () => {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  if (!captured) throw new Error(`${filename}: registerPage was not called`);
  return captured;
}

/** Extract all distinct data-i18n attribute values from an HTML string. */
function extractDataI18nKeys(html: string): string[] {
  const matches = [...html.matchAll(/data-i18n="([^"]+)"/g)];
  return [...new Set(matches.map(m => m[1] as string))].sort();
}

/** Extract all <option value="..."> values from a lang select in an HTML string. */
function extractSelectOptionValues(html: string): string[] {
  const selectMatch = html.match(/data-lang-select[^>]*>([\s\S]*?)<\/select>/);
  if (!selectMatch) return [];
  const block = selectMatch[1] as string;
  const optMatches = [...block.matchAll(/value="([^"]+)"/g)];
  return optMatches.map(m => m[1] as string);
}

// ---------------------------------------------------------------------------
// Module / shared data
// ---------------------------------------------------------------------------

const EXPECTED_LOCALES = ['en', 'ja', 'zh-Hant', 'zh-Hans', 'ko', 'es', 'pt-BR', 'de', 'fr', 'it'];

// Load once at module level
const i18n = loadStaticI18n();

// ---------------------------------------------------------------------------
// 1. static-i18n.js
// ---------------------------------------------------------------------------

describe('static-i18n.js', () => {
  it('supportedLocales has exactly 10 entries', () => {
    expect(i18n.supportedLocales).toHaveLength(10);
  });

  it('supportedLocales has no duplicates', () => {
    const unique = new Set(i18n.supportedLocales);
    expect(unique.size).toBe(10);
  });

  it('supportedLocales contains all expected locales', () => {
    for (const loc of EXPECTED_LOCALES) {
      expect(i18n.supportedLocales).toContain(loc);
    }
  });

  it('resolveLocale: null/undefined/empty → en', () => {
    expect(i18n.resolveLocale(null)).toBe('en');
    expect(i18n.resolveLocale(undefined)).toBe('en');
    expect(i18n.resolveLocale('')).toBe('en');
  });

  it('resolveLocale: exact match is case-insensitive', () => {
    expect(i18n.resolveLocale('EN')).toBe('en');
    expect(i18n.resolveLocale('JA')).toBe('ja');
    expect(i18n.resolveLocale('KO')).toBe('ko');
  });

  it('resolveLocale: zh-Hant / zh-Hans / pt-BR preserved', () => {
    expect(i18n.resolveLocale('zh-Hant')).toBe('zh-Hant');
    expect(i18n.resolveLocale('zh-Hans')).toBe('zh-Hans');
    expect(i18n.resolveLocale('pt-BR')).toBe('pt-BR');
  });

  it('resolveLocale: INTL_MAP overrides (zh-TW/HK/MO → zh-Hant, pt-PT/pt → pt-BR)', () => {
    expect(i18n.resolveLocale('zh-TW')).toBe('zh-Hant');
    expect(i18n.resolveLocale('zh-HK')).toBe('zh-Hant');
    expect(i18n.resolveLocale('zh-MO')).toBe('zh-Hant');
    expect(i18n.resolveLocale('pt-PT')).toBe('pt-BR');
    expect(i18n.resolveLocale('pt')).toBe('pt-BR');
  });

  it('resolveLocale: zh-* fallback → zh-Hans', () => {
    expect(i18n.resolveLocale('zh-SG')).toBe('zh-Hans');
    expect(i18n.resolveLocale('zh-CN')).toBe('zh-Hans');
  });

  it('resolveLocale: primary subtag match (de-AT → de, fr-CA → fr)', () => {
    expect(i18n.resolveLocale('de-AT')).toBe('de');
    expect(i18n.resolveLocale('fr-CA')).toBe('fr');
    expect(i18n.resolveLocale('es-MX')).toBe('es');
    expect(i18n.resolveLocale('it-IT')).toBe('it');
    expect(i18n.resolveLocale('ko-KR')).toBe('ko');
  });

  it('resolveLocale: unknown locale → en', () => {
    expect(i18n.resolveLocale('xx')).toBe('en');
    expect(i18n.resolveLocale('zz-ZZ')).toBe('en');
  });

  it('getIntlLocale: maps all 10 supported locales', () => {
    expect(i18n.getIntlLocale('en')).toBe('en');
    expect(i18n.getIntlLocale('ja')).toBe('ja');
    expect(i18n.getIntlLocale('zh-Hant')).toBe('zh-TW');
    expect(i18n.getIntlLocale('zh-Hans')).toBe('zh-CN');
    expect(i18n.getIntlLocale('ko')).toBe('ko');
    expect(i18n.getIntlLocale('es')).toBe('es');
    expect(i18n.getIntlLocale('pt-BR')).toBe('pt-BR');
    expect(i18n.getIntlLocale('de')).toBe('de');
    expect(i18n.getIntlLocale('fr')).toBe('fr');
    expect(i18n.getIntlLocale('it')).toBe('it');
  });

  it('getIntlLocale: unknown locale → en', () => {
    expect(i18n.getIntlLocale('xx')).toBe('en');
  });

  it('translate: returns registered string value', () => {
    i18n.registerPage({ en: { _testKey: 'hello' } });
    expect(i18n.translate('_testKey', 'en')).toBe('hello');
  });

  it('translate: function value receives dynamic args', () => {
    i18n.registerPage({
      en: { _testFn: (date: string) => 'renews ' + date },
    });
    expect(i18n.translate('_testFn', 'en', '2025-12-01')).toBe('renews 2025-12-01');
  });

  it('setLocale: persists to localStorage', () => {
    i18n.setLocale('ja');
    expect(localStorage.getItem('one8_lang')).toBe('ja');
    i18n.setLocale('en');
  });

  it('setLocale: ignores unsupported locales', () => {
    i18n.setLocale('en');
    const before = localStorage.getItem('one8_lang');
    i18n.setLocale('xx-invalid');
    expect(localStorage.getItem('one8_lang')).toBe(before);
  });

  it('setLocale: dispatches oneeight:localechange CustomEvent', () => {
    let fired: string | null = null;
    document.addEventListener('oneeight:localechange', (e: Event) => {
      fired = (e as CustomEvent).detail.locale as string;
    });
    i18n.setLocale('de');
    expect(fired).toBe('de');
    i18n.setLocale('en');
  });

  it('apply: syncs aria-label from data-i18n-aria-label', () => {
    i18n.registerPage({ en: { _ariaKey: 'Select language' } });
    const btn = document.createElement('button');
    btn.setAttribute('data-i18n-aria-label', '_ariaKey');
    document.body.appendChild(btn);
    i18n.setLocale('en');
    expect(btn.getAttribute('aria-label')).toBe('Select language');
    document.body.removeChild(btn);
  });

  it('apply: syncs select[data-lang-select] value', () => {
    const sel = document.createElement('select') as HTMLSelectElement;
    sel.setAttribute('data-lang-select', '');
    for (const loc of EXPECTED_LOCALES) {
      const opt = document.createElement('option');
      opt.value = loc;
      sel.appendChild(opt);
    }
    document.body.appendChild(sel);
    i18n.setLocale('fr');
    expect(sel.value).toBe('fr');
    document.body.removeChild(sel);
    i18n.setLocale('en');
  });
});

// ---------------------------------------------------------------------------
// 2. Pricing dictionary
// ---------------------------------------------------------------------------

describe('pricing-i18n.js — Pricing dictionary', () => {
  let pricingDict: DictMap;

  beforeAll(() => {
    pricingDict = extractDict('pricing-i18n.js');
  });

  it('has exactly 10 locales', () => {
    expect(Object.keys(pricingDict)).toHaveLength(10);
  });

  it('contains all expected locales', () => {
    for (const loc of EXPECTED_LOCALES) {
      expect(pricingDict).toHaveProperty(loc);
    }
  });

  it('EN dict has exactly 35 keys', () => {
    expect(Object.keys(pricingDict['en'] as object)).toHaveLength(35);
  });

  it('each locale has exactly 35 keys', () => {
    for (const loc of EXPECTED_LOCALES) {
      expect(Object.keys(pricingDict[loc] as object), `${loc} key count`).toHaveLength(35);
    }
  });

  it('all locales have the same key set as EN', () => {
    const enKeys = Object.keys(pricingDict['en'] as object).sort();
    for (const loc of EXPECTED_LOCALES) {
      expect(Object.keys(pricingDict[loc] as object).sort(), `${loc} keys`).toEqual(enKeys);
    }
  });

  it('no empty string values (non-function entries)', () => {
    for (const loc of EXPECTED_LOCALES) {
      for (const [key, val] of Object.entries(pricingDict[loc] as object)) {
        if (typeof val === 'string') {
          expect(val, `${loc}.${key} is empty`).not.toBe('');
        }
      }
    }
  });

  it('no undefined values', () => {
    for (const loc of EXPECTED_LOCALES) {
      for (const [key, val] of Object.entries(pricingDict[loc] as object)) {
        expect(val, `${loc}.${key} is undefined`).not.toBeUndefined();
      }
    }
  });

  it('alreadyProRenews(date) preserves date arg in all locales', () => {
    const testDate = '2025-01-15';
    for (const loc of EXPECTED_LOCALES) {
      const locDict = pricingDict[loc] as DictLocale;
      const fn = locDict['alreadyProRenews'] as (d: string) => string;
      expect(typeof fn, `${loc}.alreadyProRenews type`).toBe('function');
      const result = fn(testDate);
      expect(result, `${loc}.alreadyProRenews should contain date`).toContain(testDate);
    }
  });

  it('all pricing.html data-i18n keys exist in the EN dict', () => {
    const html = readPublic('pricing.html');
    const htmlKeys = extractDataI18nKeys(html);
    const enKeys = Object.keys(pricingDict['en'] as object);
    for (const key of htmlKeys) {
      expect(enKeys, `pricing.html key "${key}" missing from EN dict`).toContain(key);
    }
  });

  it('pricing.html select options match exactly 10 expected locales', () => {
    const html = readPublic('pricing.html');
    const options = extractSelectOptionValues(html);
    expect(options).toHaveLength(10);
    expect(options.sort()).toEqual([...EXPECTED_LOCALES].sort());
  });

  it('pricing.html loads static-i18n.js before pricing-i18n.js', () => {
    const html = readPublic('pricing.html');
    const staticPos  = html.indexOf('static-i18n.js');
    const pricingPos = html.indexOf('pricing-i18n.js');
    expect(staticPos).toBeGreaterThan(-1);
    expect(pricingPos).toBeGreaterThan(-1);
    expect(staticPos).toBeLessThan(pricingPos);
  });

  it('pricing.html has no lang-en/lang-ja body class', () => {
    const html = readPublic('pricing.html');
    expect(html).not.toMatch(/class="[^"]*lang-en/);
    expect(html).not.toMatch(/class="[^"]*lang-ja/);
  });

  it('pricing.html has no reference to legal-i18n.js', () => {
    expect(readPublic('pricing.html')).not.toContain('legal-i18n.js');
  });
});

// ---------------------------------------------------------------------------
// 3. Pro dictionary
// ---------------------------------------------------------------------------

describe('pro-i18n.js — Pro dictionary', () => {
  let proDict: DictMap;

  beforeAll(() => {
    proDict = extractDict('pro-i18n.js');
  });

  it('has exactly 10 locales', () => {
    expect(Object.keys(proDict)).toHaveLength(10);
  });

  it('contains all expected locales', () => {
    for (const loc of EXPECTED_LOCALES) {
      expect(proDict).toHaveProperty(loc);
    }
  });

  it('EN dict has exactly 29 keys', () => {
    expect(Object.keys(proDict['en'] as object)).toHaveLength(29);
  });

  it('each locale has exactly 29 keys', () => {
    for (const loc of EXPECTED_LOCALES) {
      expect(Object.keys(proDict[loc] as object), `${loc} key count`).toHaveLength(29);
    }
  });

  it('all locales have the same key set as EN', () => {
    const enKeys = Object.keys(proDict['en'] as object).sort();
    for (const loc of EXPECTED_LOCALES) {
      expect(Object.keys(proDict[loc] as object).sort(), `${loc} keys`).toEqual(enKeys);
    }
  });

  it('no empty string values', () => {
    for (const loc of EXPECTED_LOCALES) {
      for (const [key, val] of Object.entries(proDict[loc] as object)) {
        if (typeof val === 'string') {
          expect(val, `${loc}.${key} is empty`).not.toBe('');
        }
      }
    }
  });

  it('no undefined values', () => {
    for (const loc of EXPECTED_LOCALES) {
      for (const [key, val] of Object.entries(proDict[loc] as object)) {
        expect(val, `${loc}.${key} is undefined`).not.toBeUndefined();
      }
    }
  });

  it('all pro.html data-i18n keys exist in the EN dict', () => {
    const html = readPublic('pro.html');
    const htmlKeys = extractDataI18nKeys(html);
    const enKeys   = Object.keys(proDict['en'] as object);
    for (const key of htmlKeys) {
      expect(enKeys, `pro.html key "${key}" missing from EN dict`).toContain(key);
    }
  });

  it('pro.html select options match exactly 10 expected locales', () => {
    const html = readPublic('pro.html');
    const options = extractSelectOptionValues(html);
    expect(options).toHaveLength(10);
    expect(options.sort()).toEqual([...EXPECTED_LOCALES].sort());
  });

  it('pro.html loads static-i18n.js before pro-i18n.js', () => {
    const html = readPublic('pro.html');
    const staticPos = html.indexOf('static-i18n.js');
    const proPos    = html.indexOf('pro-i18n.js');
    expect(staticPos).toBeGreaterThan(-1);
    expect(proPos).toBeGreaterThan(-1);
    expect(staticPos).toBeLessThan(proPos);
  });

  it('pro.html has no reference to legal-i18n.js', () => {
    expect(readPublic('pro.html')).not.toContain('legal-i18n.js');
  });

  it('pro-i18n.js has no legacy proPageI18n / getCurrentLang references', () => {
    const code = readPublic('pro-i18n.js');
    expect(code).not.toContain('proPageI18n');
    expect(code).not.toContain('getCurrentLang');
  });

  it('pro-i18n.js has no standalone SUPPORTED identifier (excluding SUPPORTED_LOCALES)', () => {
    const code = readPublic('pro-i18n.js');
    const stripped = code.replace(/SUPPORTED_LOCALES/g, '__SL__');
    expect(stripped).not.toMatch(/\bSUPPORTED\b/);
  });

  it('pro-i18n.js has no reference to legal-i18n.js', () => {
    expect(readPublic('pro-i18n.js')).not.toContain('legal-i18n.js');
  });
});

// ---------------------------------------------------------------------------
// 4. Protection confirmation
// ---------------------------------------------------------------------------

describe('Protected values maintenance', () => {
  it('pricing.html retains $14.99', () => {
    expect(readPublic('pricing.html')).toContain('$14.99');
  });

  it('pro.html retains $14.99', () => {
    expect(readPublic('pro.html')).toContain('$14.99');
  });

  it('pricing.html retains Paddle token (live_)', () => {
    expect(readPublic('pricing.html')).toMatch(/live_[a-f0-9]+/);
  });

  it('pricing.html retains Paddle priceId (pri_01)', () => {
    expect(readPublic('pricing.html')).toMatch(/pri_01[a-z0-9]+/);
  });

  it('pricing.html retains Supabase URL', () => {
    expect(readPublic('pricing.html')).toMatch(/https:\/\/[a-z0-9]+\.supabase\./);
  });
});

// ---------------------------------------------------------------------------
// 5. Legal files unchanged (existence + isolation)
// ---------------------------------------------------------------------------

describe('Legal files unchanged', () => {
  const LEGAL_FILES = ['terms.html', 'privacy.html', 'refund.html', 'legal-i18n.js'];

  for (const file of LEGAL_FILES) {
    it(`${file} exists`, () => {
      expect(() => readPublic(file)).not.toThrow();
    });
  }

  it('legal-i18n.js is not referenced by pricing-i18n.js or pro-i18n.js', () => {
    expect(readPublic('pricing-i18n.js')).not.toContain('legal-i18n');
    expect(readPublic('pro-i18n.js')).not.toContain('legal-i18n');
  });
});
