/**
 * i18n_final_audit.test.ts
 * ONE EIGHT — Phase 6: Final i18n structure audit
 *
 * Checks:
 *  1.  Supported locales: exactly 10
 *  2.  Core UI: 10 dictionaries, EN-shape consistency
 *  3.  Training FullGame V1: 10 locales, EN-shape consistency
 *  4.  Static pages: Pricing(35), Pro(29), Terms(24), Privacy(36), Refund(15) content keys
 *  5.  Static HTML data-i18n key completeness
 *  6.  Static select options: 10 per page
 *  7.  kenya.html does not exist
 *  8.  kenya.html: 0 runtime references in source
 *  9.  legal-i18n.js: file absent, 0 source references
 * 10.  No lang-en / lang-ja class in public pages
 * 11.  No ja/en fixed locale binary in public source
 * 12.  Unknown locale → EN fallback (Core UI + static-i18n)
 * 13.  html[lang] sync: syncHtmlLang present in lang.tsx + static-i18n.js
 * 14.  Safe template renderer: static-i18n.js uses no innerHTML for translation output
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

// ── Paths ─────────────────────────────────────────────────────────────────────
const ROOT   = path.resolve(__dirname, '../../');
const PUBLIC = path.resolve(ROOT, 'public');
const SRC    = path.resolve(ROOT, 'src');

function readPublic(name: string): string {
  return fs.readFileSync(path.join(PUBLIC, name), 'utf8');
}
function readSrc(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}

// ── VM helpers ────────────────────────────────────────────────────────────────

/** Load static-i18n.js and return its exported API. */
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
  };
}

/** Load a page-dict JS file via sandboxed vm; return the registered dict. */
function loadPageDict(filename: string): Record<string, Record<string, unknown>> {
  const code = readPublic(filename);
  let captured: Record<string, Record<string, unknown>> | null = null;
  const mockI18n = {
    registerPage: (d: Record<string, Record<string, unknown>>) => { captured = d; },
    apply: () => {},
  };
  const sandbox: Record<string, unknown> = {
    window: { ONE_EIGHT_STATIC_I18N: mockI18n },
    document: { readyState: 'complete', addEventListener: () => {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  if (!captured) throw new Error(`${filename}: registerPage was not called`);
  return captured!;
}

/** Extract distinct data-i18n attribute values from an HTML string. */
function extractDataI18nKeys(html: string): string[] {
  const matches = [...html.matchAll(/data-i18n="([^"]+)"/g)];
  return [...new Set(matches.map(m => m[1] as string))].sort();
}

/** Extract <option value="..."> from the lang select in HTML. */
function extractSelectOptions(html: string): string[] {
  const m = html.match(/data-lang-select[^>]*>([\s\S]*?)<\/select>/);
  if (!m) return [];
  return [...(m[1] as string).matchAll(/value="([^"]+)"/g)].map(x => x[1] as string);
}

// ── Imports ───────────────────────────────────────────────────────────────────
import { SUPPORTED_LOCALES, type LocaleCode } from '../lib/locales';
import { resolveUiTranslations, EN_TRANSLATIONS } from '../i18n/index';
import {
  resolveFullGameV1Text,
  FULL_GAME_V1_EN,
} from '../training/i18n/fullGameV1/index';

// ── Shape utilities ───────────────────────────────────────────────────────────

type ShapeErrors = string[];

function compareShapes(canonical: unknown, other: unknown, path = ''): ShapeErrors {
  const errors: ShapeErrors = [];
  const typeOf = (v: unknown) =>
    typeof v === 'function' ? 'function'
    : Array.isArray(v) ? 'array'
    : typeof v;

  if (typeOf(canonical) !== typeOf(other)) {
    errors.push(`[${path}] type: expected ${typeOf(canonical)}, got ${typeOf(other)}`);
    return errors;
  }
  if (typeof canonical === 'function') {
    if (canonical.length !== (other as Function).length)
      errors.push(`[${path}] arity: expected ${canonical.length}, got ${(other as Function).length}`);
    return errors;
  }
  if (Array.isArray(canonical)) {
    if ((other as unknown[]).length !== canonical.length)
      errors.push(`[${path}] array length: expected ${canonical.length}, got ${(other as unknown[]).length}`);
    else
      canonical.forEach((v, i) =>
        errors.push(...compareShapes(v, (other as unknown[])[i], `${path}[${i}]`)));
    return errors;
  }
  if (canonical !== null && typeof canonical === 'object') {
    const ck = Object.keys(canonical as object).sort();
    const ok = Object.keys(other as object).sort();
    const missingKeys = ck.filter(k => !ok.includes(k));
    const extraKeys   = ok.filter(k => !ck.includes(k));
    if (missingKeys.length) errors.push(`[${path}] missing keys: ${missingKeys.join(',')}`);
    if (extraKeys.length)   errors.push(`[${path}] extra keys: ${extraKeys.join(',')}`);
    ck.filter(k => ok.includes(k)).forEach(k =>
      errors.push(...compareShapes(
        (canonical as Record<string, unknown>)[k],
        (other as Record<string, unknown>)[k],
        path ? `${path}.${k}` : k
      )));
  }
  return errors;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EXPECTED_LOCALES: LocaleCode[] = ['zh-Hans', 'zh-Hant', 'es', 'en', 'pt-BR', 'ja', 'ko', 'de', 'fr', 'it'];

const STATIC_PAGES = ['pricing', 'pro', 'terms', 'privacy', 'refund'] as const;

const STATIC_CONTENT_KEY_COUNTS: Record<string, number> = {
  pricing: 35,
  pro:     29,
  terms:   24,
  privacy: 36,
  refund:  15,
};

/** Regex to match content-specific keys (t01-t24, p01-p36, r01-r15) */
const STATIC_CONTENT_KEY_PATTERN: Record<string, RegExp | null> = {
  pricing: null,
  pro:     null,
  terms:   /^t\d{2}$/,
  privacy: /^p\d{2}$/,
  refund:  /^r\d{2}$/,
};

// ── 1. Supported locales: exactly 10 ─────────────────────────────────────────

describe('1. Supported locales — 10件', () => {
  it('SUPPORTED_LOCALES has exactly 10 entries', () => {
    expect(SUPPORTED_LOCALES).toHaveLength(10);
  });
  it('SUPPORTED_LOCALES codes match expected set', () => {
    const codes = SUPPORTED_LOCALES.map(l => l.code);
    expect(codes.sort()).toEqual([...EXPECTED_LOCALES].sort());
  });
});

// ── 2. Core UI: 10 dictionaries, EN-shape consistency ────────────────────────

describe('2. Core UI — 10言語辞書構造', () => {
  it('resolveUiTranslations: all 10 locales return non-null', () => {
    for (const loc of EXPECTED_LOCALES) {
      expect(resolveUiTranslations(loc)).toBeTruthy();
    }
  });

  it('resolveUiTranslations: unknown locale returns EN', () => {
    const unknown = resolveUiTranslations('xx' as LocaleCode);
    expect(unknown).toStrictEqual(resolveUiTranslations('en'));
  });

  for (const loc of EXPECTED_LOCALES.filter(l => l !== 'en')) {
    it(`Core UI ${loc}: shape matches EN`, () => {
      const dict = resolveUiTranslations(loc);
      const errors = compareShapes(EN_TRANSLATIONS, dict);
      expect(errors, errors.join('\n')).toHaveLength(0);
    });
  }
});

// ── 3. Training FullGame V1: 10 locales, EN-shape consistency ────────────────

describe('3. FullGame V1 Training — 10言語構造', () => {
  it('resolveFullGameV1Text: all 10 locales return non-null', () => {
    for (const loc of EXPECTED_LOCALES) {
      expect(resolveFullGameV1Text(loc)).toBeTruthy();
    }
  });

  it('resolveFullGameV1Text: unknown locale → EN fallback', () => {
    const unk = resolveFullGameV1Text('xx' as LocaleCode);
    expect(unk).toStrictEqual(FULL_GAME_V1_EN);
  });

  for (const loc of EXPECTED_LOCALES.filter(l => l !== 'en')) {
    it(`FullGame V1 ${loc}: shape matches EN`, () => {
      const bundle = resolveFullGameV1Text(loc);
      const errors = compareShapes(FULL_GAME_V1_EN, bundle);
      expect(errors, errors.join('\n')).toHaveLength(0);
    });
  }
});

// ── 4. Static pages: key counts ───────────────────────────────────────────────

describe('4. Static pages — content key counts', () => {
  for (const page of STATIC_PAGES) {
    const dict = loadPageDict(`${page}-i18n.js`);
    const targetCount = STATIC_CONTENT_KEY_COUNTS[page]!;
    const pattern = STATIC_CONTENT_KEY_PATTERN[page];

    it(`${page}: all 10 locales registered`, () => {
      for (const loc of EXPECTED_LOCALES) {
        expect(dict, `missing locale ${loc}`).toHaveProperty(loc);
      }
    });

    it(`${page}: all locales have same key set as en`, () => {
      const enKeys = Object.keys(dict['en'] ?? {}).sort();
      for (const loc of EXPECTED_LOCALES.filter(l => l !== 'en')) {
        const locKeys = Object.keys(dict[loc] ?? {}).sort();
        expect(locKeys, `${page}[${loc}] key mismatch`).toEqual(enKeys);
      }
    });

    it(`${page}: en has exactly ${targetCount} content keys`, () => {
      const enEntry = dict['en'] ?? {};
      const contentKeys = pattern
        ? Object.keys(enEntry).filter(k => pattern.test(k))
        : Object.keys(enEntry);
      expect(contentKeys, `${page} content key count mismatch`).toHaveLength(targetCount);
    });

    it(`${page}: all string values are non-empty`, () => {
      for (const loc of EXPECTED_LOCALES) {
        const entry = dict[loc] ?? {};
        for (const [k, v] of Object.entries(entry)) {
          if (typeof v === 'string') {
            expect(v.length, `${page}[${loc}].${k} is empty`).toBeGreaterThan(0);
          }
        }
      }
    });
  }
});

// ── 5. Static HTML: data-i18n key completeness ───────────────────────────────

describe('5. Static HTML — data-i18n keys exist in en dict', () => {
  for (const page of STATIC_PAGES) {
    it(`${page}.html: all data-i18n keys present in en dictionary`, () => {
      const html = readPublic(`${page}.html`);
      const dict = loadPageDict(`${page}-i18n.js`);
      const enKeys = new Set(Object.keys(dict['en'] ?? {}));
      const htmlKeys = extractDataI18nKeys(html);
      const missing = htmlKeys.filter(k => !enKeys.has(k));
      expect(missing, `${page}.html missing keys: ${missing.join(',')}`).toHaveLength(0);
    });
  }
});

// ── 6. Static select options: 10 per page ────────────────────────────────────

describe('6. Static HTML — lang select has 10 options', () => {
  for (const page of STATIC_PAGES) {
    it(`${page}.html: select has exactly 10 options`, () => {
      const html = readPublic(`${page}.html`);
      const opts = extractSelectOptions(html);
      expect(opts, `${page}.html select option count: ${opts}`).toHaveLength(10);
    });

    it(`${page}.html: select options match SUPPORTED_LOCALES`, () => {
      const html = readPublic(`${page}.html`);
      const opts = extractSelectOptions(html).sort();
      expect(opts).toEqual([...EXPECTED_LOCALES].sort());
    });
  }
});

// ── 6b. React SUPPORTED_LOCALES order matches static HTML option order ─────────

describe('6b. locale display order — React SUPPORTED_LOCALES === static HTML options', () => {
  const reactOrder = SUPPORTED_LOCALES.map(l => l.code);

  it('React SUPPORTED_LOCALES order matches confirmed display order', () => {
    expect(reactOrder).toEqual(EXPECTED_LOCALES);
  });

  for (const page of STATIC_PAGES) {
    it(`${page}.html option order matches React SUPPORTED_LOCALES`, () => {
      const html = readPublic(`${page}.html`);
      const opts = extractSelectOptions(html);
      expect(opts).toEqual(reactOrder);
    });
  }
});

// ── 7. kenya.html does not exist ─────────────────────────────────────────────

describe('7. kenya.html — 削除確認', () => {
  it('public/journal/kenya.html does not exist', () => {
    const p = path.join(PUBLIC, 'journal', 'kenya.html');
    expect(fs.existsSync(p)).toBe(false);
  });
});

// ── 8. kenya.html: 0 runtime references ──────────────────────────────────────

describe('8. kenya.html — 実行時参照0件', () => {
  const RUNTIME_DIRS = ['src/components', 'src/lib', 'src/pages', 'public'];

  function grepRuntime(pattern: string): string[] {
    const results: string[] = [];
    function walk(dir: string) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) { walk(path.join(dir, entry.name)); continue; }
        const ext = path.extname(entry.name);
        if (!['.ts','.tsx','.js','.html'].includes(ext)) continue;
        if (entry.name === 'kenya.html') continue; // skip the target itself (already deleted)
        const full = path.join(dir, entry.name);
        const content = fs.readFileSync(full, 'utf8');
        if (content.includes(pattern)) results.push(full);
      }
    }
    RUNTIME_DIRS.forEach(d => walk(path.resolve(ROOT, d)));
    return results;
  }

  it('no runtime file references kenya.html', () => {
    const refs = grepRuntime('kenya.html');
    expect(refs, `kenya.html referenced by: ${refs.join(', ')}`).toHaveLength(0);
  });
});

// ── 9. legal-i18n.js: absent + 0 references ──────────────────────────────────

describe('9. legal-i18n.js — 不在・参照0', () => {
  it('public/legal-i18n.js does not exist', () => {
    expect(fs.existsSync(path.join(PUBLIC, 'legal-i18n.js'))).toBe(false);
  });

  it('no public HTML references legal-i18n.js', () => {
    for (const page of STATIC_PAGES) {
      expect(readPublic(`${page}.html`), `${page}.html references legal-i18n.js`).not.toContain('legal-i18n.js');
    }
  });

  it('no *-i18n.js references legal-i18n.js', () => {
    for (const page of STATIC_PAGES) {
      expect(readPublic(`${page}-i18n.js`), `${page}-i18n.js references legal-i18n.js`).not.toContain('legal-i18n.js');
    }
    expect(readPublic('static-i18n.js')).not.toContain('legal-i18n.js');
  });
});

// ── 10. No lang-en / lang-ja class in public pages ───────────────────────────

describe('10. No legacy lang-en / lang-ja class', () => {
  for (const page of STATIC_PAGES) {
    it(`${page}.html: no class="lang-en"`, () => {
      expect(readPublic(`${page}.html`)).not.toMatch(/class="[^"]*lang-en/);
    });
    it(`${page}.html: no class="lang-ja"`, () => {
      expect(readPublic(`${page}.html`)).not.toMatch(/class="[^"]*lang-ja/);
    });
  }
});

// ── 11. No ja/en fixed locale binary in public source ────────────────────────

describe('11. No ja/en binary locale hardcoding', () => {
  const FILES_TO_CHECK = [
    'lib/lang.tsx',
    'lib/localeFormat.ts',
    'lib/journalUi.ts',
    'lib/journal.ts',
    'components/FullGameTrainingRunner.tsx',
    'components/JournalListPage.tsx',
    'components/JournalArticlePage.tsx',
  ];

  for (const rel of FILES_TO_CHECK) {
    const full = path.join(SRC, rel);
    if (!fs.existsSync(full)) continue;

    it(`${rel}: no "lang === 'ja'" binary check`, () => {
      const src = fs.readFileSync(full, 'utf8');
      expect(src).not.toContain("lang === 'ja'");
    });

    it(`${rel}: no "'ja-JP' : 'en-US'" binary mapping`, () => {
      const src = fs.readFileSync(full, 'utf8');
      expect(src).not.toContain("'ja-JP' : 'en-US'");
      expect(src).not.toContain('"ja-JP" : "en-US"');
    });
  }

  it('static-i18n.js: SUPPORTED_LOCALES has 10 entries (not 2)', () => {
    const src = readPublic('static-i18n.js');
    expect(src).not.toMatch(/SUPPORTED\s*=\s*\['en',\s*'ja'\]/);
    expect(src).toContain("'pt-BR'");
  });
});

// ── 12. Unknown locale → EN fallback ─────────────────────────────────────────

describe('12. Unknown locale → EN fallback', () => {
  it('Core UI: resolveUiTranslations unknown → same as en', () => {
    expect(resolveUiTranslations('zz' as LocaleCode)).toStrictEqual(resolveUiTranslations('en'));
  });

  it('static-i18n.js: resolveLocale unknown → en', () => {
    const i18n = loadStaticI18n();
    expect(i18n.resolveLocale('zz')).toBe('en');
    expect(i18n.resolveLocale('xx-XX')).toBe('en');
    expect(i18n.resolveLocale(null)).toBe('en');
    expect(i18n.resolveLocale(undefined)).toBe('en');
  });
});

// ── 13. html[lang] sync ───────────────────────────────────────────────────────

describe('13. html[lang] sync', () => {
  it('lang.tsx: syncHtmlLang sets document.documentElement.lang', () => {
    const src = readSrc('lib/lang.tsx');
    expect(src).toContain('document.documentElement.lang');
  });

  it('static-i18n.js: setLocale syncs document.documentElement.lang', () => {
    const src = readPublic('static-i18n.js');
    expect(src).toContain('document.documentElement.lang');
  });
});

// ── 14. Safe template renderer: no innerHTML for translation output ────────────

describe('14. Safe template renderer — no innerHTML', () => {
  it('static-i18n.js: translation rendering does not use innerHTML assignment', () => {
    const src = readPublic('static-i18n.js');
    // Must NOT assign to innerHTML for translation output.
    // The only permitted pattern is a comment explaining the avoidance.
    // Strip comments and check no "innerHTML =" assignment.
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    expect(stripped).not.toMatch(/\.innerHTML\s*=/);
  });

  it('static-i18n.js: uses textContent for text rendering', () => {
    const src = readPublic('static-i18n.js');
    expect(src).toContain('.textContent');
  });
});
