/**
 * journal.test.ts — journal.ts の純粋関数ユニットテスト
 *
 * Step C-1: selectTranslation / normalizeLang の fallback ロジックを検証
 * Supabase 実 DB 接続は不要 (純粋関数のみテスト)
 */

import { describe, it, expect } from 'vitest';
import { selectTranslation, normalizeLang } from '../lib/journal';
import type { JournalLang } from '../lib/journal';

// ─── テスト用ヘルパー型 ─────────────────────────────────────────────────────────

interface TestTranslation {
  lang: JournalLang;
  is_primary: boolean;
  title: string;
}

function makeT(lang: JournalLang, is_primary: boolean, title?: string): TestTranslation {
  return { lang, is_primary, title: title ?? `title_${lang}` };
}

// ─── normalizeLang ────────────────────────────────────────────────────────────

describe('normalizeLang', () => {
  it('en を JournalLang に正規化する', () => {
    expect(normalizeLang('en')).toBe('en');
  });

  it('ja を JournalLang に正規化する', () => {
    expect(normalizeLang('ja')).toBe('ja');
  });

  it('不明な文字列は undefined を返す', () => {
    expect(normalizeLang('zh')).toBeUndefined();
    expect(normalizeLang('fr')).toBeUndefined();
  });

  it('null は undefined を返す', () => {
    expect(normalizeLang(null)).toBeUndefined();
  });

  it('undefined は undefined を返す', () => {
    expect(normalizeLang(undefined)).toBeUndefined();
  });

  it('空文字は undefined を返す', () => {
    expect(normalizeLang('')).toBeUndefined();
  });
});

// ─── selectTranslation ────────────────────────────────────────────────────────

describe('selectTranslation — 空リスト', () => {
  it('翻訳なしは null を返す (fallback=false)', () => {
    const result = selectTranslation([], 'en');
    expect(result.translation).toBeNull();
    expect(result.fallback).toBe(false);
  });

  it('翻訳なし + requestedLang 未指定 も null を返す', () => {
    const result = selectTranslation([], undefined);
    expect(result.translation).toBeNull();
    expect(result.fallback).toBe(false);
  });
});

describe('selectTranslation — requested lang が存在する場合', () => {
  it('en を要求 → en を返す (fallback=false)', () => {
    const ts = [makeT('en', false), makeT('ja', true)];
    const result = selectTranslation(ts, 'en');
    expect(result.translation?.lang).toBe('en');
    expect(result.fallback).toBe(false);
  });

  it('ja を要求 → ja を返す (fallback=false)', () => {
    const ts = [makeT('en', true), makeT('ja', false)];
    const result = selectTranslation(ts, 'ja');
    expect(result.translation?.lang).toBe('ja');
    expect(result.fallback).toBe(false);
  });

  it('ja のみ存在 → ja を要求で ja を返す (fallback=false)', () => {
    const ts = [makeT('ja', true)];
    const result = selectTranslation(ts, 'ja');
    expect(result.translation?.lang).toBe('ja');
    expect(result.fallback).toBe(false);
  });
});

describe('selectTranslation — requested lang が存在しない場合', () => {
  it('en 要求だが en なし → is_primary=true の ja を返す (fallback=true)', () => {
    const ts = [makeT('ja', true)];
    const result = selectTranslation(ts, 'en');
    expect(result.translation?.lang).toBe('ja');
    expect(result.fallback).toBe(true);
  });

  it('ja 要求だが ja なし → is_primary=true の en を返す (fallback=true)', () => {
    const ts = [makeT('en', true)];
    const result = selectTranslation(ts, 'ja');
    expect(result.translation?.lang).toBe('en');
    expect(result.fallback).toBe(true);
  });
});

describe('selectTranslation — is_primary fallback', () => {
  it('requestedLang 未指定 + is_primary=true あり → is_primary を返す', () => {
    const ts = [makeT('en', false), makeT('ja', true)];
    const result = selectTranslation(ts, undefined);
    expect(result.translation?.lang).toBe('ja');
    expect(result.fallback).toBe(true);
  });

  it('requestedLang=ja かつ ja が存在する → ja を返す (fallback=false)', () => {
    const ts = [makeT('en', true), makeT('ja', false)];
    const result = selectTranslation(ts, 'ja');
    // ja が存在するので exact match で ja を返すはず
    expect(result.translation?.lang).toBe('ja');
    expect(result.fallback).toBe(false);
  });

  it('requestedLang=en かつ en がない + is_primary=ja → ja を返す (fallback=true)', () => {
    // en はない。ja が is_primary → ja fallback
    const ts = [makeT('ja', true)];
    const result = selectTranslation(ts, 'en');
    expect(result.translation?.lang).toBe('ja');
    expect(result.fallback).toBe(true);
  });
});

describe('selectTranslation — en fallback (is_primary なし)', () => {
  it('requested lang なし + is_primary なし + en あり → en を返す (fallback=true)', () => {
    const ts = [makeT('ja', false), makeT('en', false)];
    const result = selectTranslation(ts, undefined);
    expect(result.translation?.lang).toBe('en');
    expect(result.fallback).toBe(true);
  });

  it('requested lang が ja で ja なし + is_primary なし + en あり → en を返す', () => {
    const ts = [makeT('en', false)];
    const result = selectTranslation(ts, 'ja');
    expect(result.translation?.lang).toBe('en');
    expect(result.fallback).toBe(true);
  });
});

describe('selectTranslation — 最初のtranslation fallback', () => {
  it('requested lang なし + is_primary なし + en なし → 最初の翻訳を返す (fallback=true)', () => {
    // ja のみ (en なし、is_primary なし)
    const ts = [makeT('ja', false, 'first')];
    const result = selectTranslation(ts, undefined);
    expect(result.translation?.title).toBe('first');
    expect(result.fallback).toBe(true);
  });

  it('en 要求だが en なし + is_primary なし → 最初の翻訳を返す', () => {
    const ts = [makeT('ja', false, 'only_ja')];
    const result = selectTranslation(ts, 'en');
    expect(result.translation?.lang).toBe('ja');
    expect(result.translation?.title).toBe('only_ja');
    expect(result.fallback).toBe(true);
  });
});

describe('selectTranslation — fallback flag が正しく立つ', () => {
  it('完全一致のとき fallback=false', () => {
    const ts = [makeT('en', true)];
    const result = selectTranslation(ts, 'en');
    expect(result.fallback).toBe(false);
  });

  it('is_primary fallback のとき fallback=true', () => {
    const ts = [makeT('ja', true)];
    const result = selectTranslation(ts, 'en');
    expect(result.fallback).toBe(true);
  });

  it('en fallback のとき fallback=true', () => {
    const ts = [makeT('en', false)];
    const result = selectTranslation(ts, 'ja');
    expect(result.fallback).toBe(true);
  });

  it('最初の翻訳fallbackのとき fallback=true', () => {
    const ts = [makeT('ja', false)];
    const result = selectTranslation(ts, 'en');
    expect(result.fallback).toBe(true);
  });
});

describe('selectTranslation — JAのみ記事 (JAのみ記事でも壊れない)', () => {
  it('en 要求 + JAのみ記事 → ja を返す (fallback=true)', () => {
    const ts = [makeT('ja', true)];
    const result = selectTranslation(ts, 'en');
    expect(result.translation?.lang).toBe('ja');
    expect(result.fallback).toBe(true);
  });

  it('requestedLang 未指定 + JAのみ記事 → ja を返す', () => {
    const ts = [makeT('ja', false)];
    const result = selectTranslation(ts, undefined);
    expect(result.translation?.lang).toBe('ja');
    expect(result.fallback).toBe(true);
  });

  it('JAのみ記事 + is_primary=true → JAを返す', () => {
    const ts = [makeT('ja', true, 'ja_only_title')];
    const result = selectTranslation(ts, 'en');
    expect(result.translation?.title).toBe('ja_only_title');
    expect(result.fallback).toBe(true);
  });
});
