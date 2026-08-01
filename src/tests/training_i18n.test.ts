/**
 * training_i18n.test.ts
 *
 * Table-driven structural verification for all 10 FullGame V1 Training locales.
 * Validates structure, leaf counts, move numbers, learning points, field presence,
 * and character-class constraints.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveFullGameV1Text,
  FULL_GAME_V1_EN,
  FULL_GAME_V1_JA,
  FULL_GAME_V1_ZH_HANT,
  FULL_GAME_V1_ZH_HANS,
  FULL_GAME_V1_KO,
  FULL_GAME_V1_ES,
  FULL_GAME_V1_PT_BR,
  FULL_GAME_V1_DE,
  FULL_GAME_V1_FR,
  FULL_GAME_V1_IT,
} from '../training/i18n/fullGameV1/index';
import type { FGTrainingText, FGStepText } from '../training/i18n/fullGameV1/types';
import { SUPPORTED_LOCALES, type LocaleCode } from '../lib/locales';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Count all string leaf values (empty strings count) */
function countStringLeaves(obj: unknown): number {
  if (typeof obj === 'string') return 1;
  if (Array.isArray(obj)) return obj.reduce((acc, v) => acc + countStringLeaves(v), 0);
  if (obj !== null && typeof obj === 'object') {
    return Object.values(obj as Record<string, unknown>).reduce<number>(
      (acc, v) => acc + countStringLeaves(v),
      0
    );
  }
  return 0;
}

/** Collect all key paths in the object as dot-separated strings */
function collectKeyPaths(obj: unknown, prefix = ''): string[] {
  if (typeof obj === 'string') return [prefix];
  if (Array.isArray(obj)) {
    return obj.flatMap((v, i) => collectKeyPaths(v, `${prefix}[${i}]`));
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
      collectKeyPaths(v, prefix ? `${prefix}.${k}` : k)
    );
  }
  return [];
}

/** Returns the set of paths present in EN but NOT in the other bundle */
function missingPaths(enObj: unknown, otherObj: unknown): string[] {
  const enPaths = new Set(collectKeyPaths(enObj));
  const otherPaths = new Set(collectKeyPaths(otherObj));
  return [...enPaths].filter((p) => !otherPaths.has(p));
}

/** Returns the set of paths present in other but NOT in EN (extra keys) */
function extraPaths(enObj: unknown, otherObj: unknown): string[] {
  const enPaths = new Set(collectKeyPaths(enObj));
  const otherPaths = new Set(collectKeyPaths(otherObj));
  return [...otherPaths].filter((p) => !enPaths.has(p));
}

/** Collect all non-empty leaf strings */
function collectNonEmptyStrings(obj: unknown): string[] {
  if (typeof obj === 'string') return obj.length > 0 ? [obj] : [];
  if (Array.isArray(obj)) return obj.flatMap(collectNonEmptyStrings);
  if (obj !== null && typeof obj === 'object') {
    return Object.values(obj as Record<string, unknown>).flatMap(collectNonEmptyStrings);
  }
  return [];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EN = FULL_GAME_V1_EN;
const EXPECTED_STEP_COUNT = 61; // moveNumber 0–60
const EXPECTED_MOVE_NUMBERS = Array.from({ length: 61 }, (_, i) => i);

const ALL_BUNDLES: Array<{ code: LocaleCode; bundle: FGTrainingText }> = [
  { code: 'en', bundle: FULL_GAME_V1_EN },
  { code: 'ja', bundle: FULL_GAME_V1_JA },
  { code: 'zh-Hant', bundle: FULL_GAME_V1_ZH_HANT },
  { code: 'zh-Hans', bundle: FULL_GAME_V1_ZH_HANS },
  { code: 'ko', bundle: FULL_GAME_V1_KO },
  { code: 'es', bundle: FULL_GAME_V1_ES },
  { code: 'pt-BR', bundle: FULL_GAME_V1_PT_BR },
  { code: 'de', bundle: FULL_GAME_V1_DE },
  { code: 'fr', bundle: FULL_GAME_V1_FR },
  { code: 'it', bundle: FULL_GAME_V1_IT },
];

// Intentionally empty EN fields (5 fields): moveNumber 11 situation, 13 situation, etc.
// We verify these in a separate test.
const INTENTIONALLY_EMPTY_EN_FIELDS: Array<{ moveNumber: number; field: string }> = [
  { moveNumber: 11, field: 'userText.situation' },
  { moveNumber: 13, field: 'userText.situation' },
  { moveNumber: 23, field: 'userText.situation' },
  { moveNumber: 26, field: 'userText.situation' },
  { moveNumber: 30, field: 'userText.situation' },
  { moveNumber: 33, field: 'userText.situation' },
  { moveNumber: 36, field: 'userText.situation' },
  { moveNumber: 38, field: 'userText.situation' },
  { moveNumber: 42, field: 'userText.situation' },
  { moveNumber: 44, field: 'userText.situation' },
  { moveNumber: 50, field: 'userText.situation' },
  { moveNumber: 40, field: 'userText.success' },
  { moveNumber: 52, field: 'userText.success' },
  { moveNumber: 54, field: 'userText.success' },
  { moveNumber: 56, field: 'userText.success' },
  { moveNumber: 58, field: 'userText.success' },
];

function getFieldValue(step: FGStepText, field: string): string | undefined {
  const parts = field.split('.');
  let obj: unknown = step;
  for (const part of parts) {
    if (obj === null || typeof obj !== 'object') return undefined;
    obj = (obj as Record<string, unknown>)[part];
  }
  return typeof obj === 'string' ? obj : undefined;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FullGame V1 Training i18n', () => {

  // 1. Resolver returns own dictionaries (not always EN fallback)
  it('resolver returns dedicated dictionary for all 10 locales', () => {
    for (const { code, bundle } of ALL_BUNDLES) {
      const resolved = resolveFullGameV1Text(code);
      expect(resolved, `Locale ${code} should return its own bundle`).toBe(bundle);
    }
  });

  // 14. Unknown locales fall back to EN
  it('unknown locale falls back to EN', () => {
    // Cast to LocaleCode to test fallback
    const result = resolveFullGameV1Text('xx' as LocaleCode);
    expect(result).toBe(FULL_GAME_V1_EN);
  });

  // All SUPPORTED_LOCALES except 'en' have dedicated bundles registered (not EN object)
  it('all non-en SUPPORTED_LOCALES have dedicated bundles (not EN fallback)', () => {
    for (const { code } of SUPPORTED_LOCALES) {
      if (code === 'en') continue; // 'en' IS FULL_GAME_V1_EN by design
      const resolved = resolveFullGameV1Text(code);
      expect(resolved, `Locale ${code} should NOT fall back to EN`).not.toBe(FULL_GAME_V1_EN);
    }
  });

  // Per-locale table tests
  for (const { code, bundle } of ALL_BUNDLES) {
    describe(`locale: ${code}`, () => {

      // 2. Recursive structure matches EN
      it('structure matches EN (no missing paths)', () => {
        const missing = missingPaths(EN, bundle);
        expect(missing).toEqual([]);
      });

      // 13. No extra keys beyond EN
      it('no extra keys beyond EN', () => {
        const extra = extraPaths(EN, bundle);
        expect(extra).toEqual([]);
      });

      // 3. Step count matches
      it(`has ${EXPECTED_STEP_COUNT} steps`, () => {
        expect(bundle.steps).toHaveLength(EXPECTED_STEP_COUNT);
      });

      // 4 & 5. moveNumber list matches (0–60 complete)
      it('moveNumbers are exactly 0–60', () => {
        const moveNumbers = bundle.steps.map((s) => s.moveNumber);
        expect(moveNumbers).toEqual(EXPECTED_MOVE_NUMBERS);
      });

      // 6. learningPoint matches EN
      it('learningPoint values match EN', () => {
        for (let i = 0; i < EN.steps.length; i++) {
          expect(bundle.steps[i]!.learningPoint).toBe(EN.steps[i]!.learningPoint);
        }
      });

      // 7. text field presence matches EN (introText, userText, autoText, finalText)
      it('text field presence matches EN', () => {
        for (let i = 0; i < EN.steps.length; i++) {
          const enStep = EN.steps[i]!;
          const locStep = bundle.steps[i]!;
          const mn = enStep.moveNumber;

          expect(!!locStep.introText, `moveNumber ${mn}: introText presence`).toBe(!!enStep.introText);
          expect(!!locStep.userText, `moveNumber ${mn}: userText presence`).toBe(!!enStep.userText);
          expect(!!locStep.autoText, `moveNumber ${mn}: autoText presence`).toBe(!!enStep.autoText);
          expect(!!locStep.finalText, `moveNumber ${mn}: finalText presence`).toBe(!!enStep.finalText);
          expect(!!locStep.postQuestion, `moveNumber ${mn}: postQuestion presence`).toBe(!!enStep.postQuestion);
        }
      });

      // 8 & 9. option count + correctOptionIndex for postQuestion steps
      it('postQuestion option count and correctOptionIndex match EN', () => {
        for (const enStep of EN.steps) {
          if (!enStep.postQuestion) continue;
          const locStep = bundle.steps.find((s) => s.moveNumber === enStep.moveNumber)!;
          expect(locStep.postQuestion).toBeDefined();
          expect(locStep.postQuestion!.options).toHaveLength(enStep.postQuestion.options.length);
          expect(locStep.postQuestion!.correctOptionIndex).toBe(enStep.postQuestion.correctOptionIndex);
        }
      });

      // 10. string leaf count matches EN
      it('string leaf count matches EN', () => {
        const enCount = countStringLeaves(EN);
        const locCount = countStringLeaves(bundle);
        expect(locCount).toBe(enCount);
      });

      // 11. EN non-empty fields have non-empty translations
      it('EN non-empty fields are not empty in this locale', () => {
        const emptySet = new Set(
          INTENTIONALLY_EMPTY_EN_FIELDS.map((e) => `${e.moveNumber}:${e.field}`)
        );
        for (const enStep of EN.steps) {
          const locStep = bundle.steps.find((s) => s.moveNumber === enStep.moveNumber)!;
          // Check userText fields
          if (enStep.userText) {
            for (const field of ['situation', 'question', 'hint', 'success'] as const) {
              const enVal = enStep.userText[field];
              const locVal = locStep.userText![field];
              const key = `${enStep.moveNumber}:userText.${field}`;
              if (emptySet.has(key)) continue; // skip intentionally empty
              if (enVal !== '') {
                expect(locVal, `locale ${code} moveNumber ${enStep.moveNumber} userText.${field} should not be empty`).not.toBe('');
              }
            }
          }
          // Check introText
          if (enStep.introText && enStep.introText !== '') {
            expect(locStep.introText, `locale ${code} moveNumber ${enStep.moveNumber} introText should not be empty`).not.toBe('');
          }
          // Check autoText
          if (enStep.autoText && enStep.autoText.auto !== '') {
            expect(locStep.autoText!.auto, `locale ${code} moveNumber ${enStep.moveNumber} autoText.auto should not be empty`).not.toBe('');
          }
        }
      });

      // 12. EN empty fields are empty in all locales
      it('EN intentionally empty fields are empty in this locale', () => {
        for (const { moveNumber, field } of INTENTIONALLY_EMPTY_EN_FIELDS) {
          const locStep = bundle.steps.find((s) => s.moveNumber === moveNumber)!;
          if (!locStep) continue;
          const val = getFieldValue(locStep, field);
          expect(val, `locale ${code} moveNumber ${moveNumber} ${field} should be empty`).toBe('');
        }
      });

    });
  }

  // Character class tests
  describe('character class constraints', () => {
    const HIRAGANA_KATAKANA = /[\u3040-\u309F\u30A0-\u30FF]/;
    const CJK = /[\u4E00-\u9FFF\u3400-\u4DBF]/;
    const HANGUL = /[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/;

    for (const code of ['zh-Hant', 'zh-Hans', 'ko'] as LocaleCode[]) {
      it(`${code}: no hiragana/katakana characters`, () => {
        const bundle = resolveFullGameV1Text(code);
        const strings = collectNonEmptyStrings(bundle);
        for (const s of strings) {
          expect(HIRAGANA_KATAKANA.test(s), `${code} contains hiragana/katakana: "${s.slice(0, 60)}"`).toBe(false);
        }
      });
    }

    for (const code of ['es', 'pt-BR', 'de', 'fr', 'it'] as LocaleCode[]) {
      it(`${code}: no CJK or hangul characters`, () => {
        const bundle = resolveFullGameV1Text(code);
        const strings = collectNonEmptyStrings(bundle);
        for (const s of strings) {
          expect(CJK.test(s), `${code} contains CJK: "${s.slice(0, 60)}"`).toBe(false);
          expect(HANGUL.test(s), `${code} contains hangul: "${s.slice(0, 60)}"`).toBe(false);
        }
      });
    }
  });

  // courseId consistency
  it('all bundles have courseId = full-game-v1', () => {
    for (const { code, bundle } of ALL_BUNDLES) {
      expect(bundle.courseId, `${code} courseId mismatch`).toBe('full-game-v1');
    }
  });

  // EN leaf count sanity (232 total leaves including empty strings)
  it('EN has expected number of string leaves (> 200)', () => {
    const count = countStringLeaves(EN);
    // 61 steps with various fields (some steps have 4+ string fields)
    expect(count).toBeGreaterThan(200);
  });

  // Non-empty leaf count in EN
  it('EN has > 180 non-empty string leaves', () => {
    const nonEmpty = collectNonEmptyStrings(EN);
    expect(nonEmpty.length).toBeGreaterThan(180);
  });
});
