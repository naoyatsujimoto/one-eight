/**
 * profile_update_display_name.test.ts
 *
 * updateDisplayName 関数の回帰テスト
 *
 * 検証項目:
 *  1. updateDisplayName: 成功時のみ呼び出し元がawaitできること（resolve）
 *  2. updateDisplayName: DB失敗時にエラーをthrowすること（握り潰しなし）
 *  3. updateDisplayName: 空文字を拒否すること
 *  4. updateDisplayName: 空白のみを拒否すること
 *  5. updateDisplayName: 31文字以上を拒否すること
 *  6. updateDisplayName: 30文字は許可すること
 *  7. updateDisplayName: no rows updatedでエラーをthrowすること
 *  8. 全10言語の profileSaveSuccess が存在すること
 *  9. 全10言語の profileSaveError が存在すること
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock ホイスティング問題回避: モック状態をオブジェクトで管理
const supabaseMockState = {
  selectResult: { data: [{ id: 'uuid-1' }], error: null } as {
    data: { id: string }[] | null;
    error: { code: string; message: string } | null;
  },
};

vi.mock('../lib/supabase', () => {
  const select = vi.fn(() => Promise.resolve(supabaseMockState.selectResult));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  return { supabase: { from } };
});

// モック後にインポート
import { updateDisplayName } from '../lib/profile';

describe('updateDisplayName', () => {
  beforeEach(() => {
    // デフォルト: 成功ケース
    supabaseMockState.selectResult = { data: [{ id: 'uuid-1' }], error: null };
    vi.clearAllMocks();
  });

  it('1. 成功時にresolveすること', async () => {
    supabaseMockState.selectResult = { data: [{ id: 'uuid-1' }], error: null };
    await expect(updateDisplayName('uuid-1', 'テスト名')).resolves.toBeUndefined();
  });

  it('2. DB失敗時にエラーをthrowすること（握り潰しなし）', async () => {
    supabaseMockState.selectResult = {
      data: null,
      error: { code: '42501', message: 'permission denied for table profiles' },
    };
    await expect(updateDisplayName('uuid-1', 'テスト名')).rejects.toThrow('permission denied');
  });

  it('3. 空文字を拒否すること', async () => {
    await expect(updateDisplayName('uuid-1', '')).rejects.toThrow('cannot be empty');
  });

  it('4. 空白のみを拒否すること', async () => {
    await expect(updateDisplayName('uuid-1', '   ')).rejects.toThrow('cannot be empty');
  });

  it('5. 31文字以上を拒否すること', async () => {
    const longName = 'a'.repeat(31);
    await expect(updateDisplayName('uuid-1', longName)).rejects.toThrow('too long');
  });

  it('6. 30文字は許可すること', async () => {
    supabaseMockState.selectResult = { data: [{ id: 'uuid-1' }], error: null };
    const name30 = 'a'.repeat(30);
    await expect(updateDisplayName('uuid-1', name30)).resolves.toBeUndefined();
  });

  it('7. no rows updated でエラーをthrowすること', async () => {
    supabaseMockState.selectResult = { data: [], error: null };
    await expect(updateDisplayName('uuid-1', 'テスト名')).rejects.toThrow('no rows updated');
  });
});

// ── 10言語の profileSaveSuccess / profileSaveError 欠落チェック ────────────

describe('i18n: profileSaveSuccess / profileSaveError', () => {
  const LOCALE_FILES = [
    'en', 'ja', 'de', 'es', 'fr', 'it', 'ko', 'pt-BR', 'zh-Hans', 'zh-Hant',
  ] as const;

  it('8. 全10言語に profileSaveSuccess が存在すること', async () => {
    for (const locale of LOCALE_FILES) {
      const mod = await import(`../i18n/${locale}.ts`);
      const translations = mod.default ?? mod[Object.keys(mod)[0]!];
      expect(
        translations.profileSaveSuccess,
        `${locale}: profileSaveSuccess が未定義`,
      ).toBeDefined();
      expect(
        typeof translations.profileSaveSuccess,
        `${locale}: profileSaveSuccess が string でない`,
      ).toBe('string');
      expect(
        (translations.profileSaveSuccess as string).length,
        `${locale}: profileSaveSuccess が空文字`,
      ).toBeGreaterThan(0);
    }
  });

  it('9. 全10言語に profileSaveError が存在すること', async () => {
    for (const locale of LOCALE_FILES) {
      const mod = await import(`../i18n/${locale}.ts`);
      const translations = mod.default ?? mod[Object.keys(mod)[0]!];
      expect(
        translations.profileSaveError,
        `${locale}: profileSaveError が未定義`,
      ).toBeDefined();
      expect(
        typeof translations.profileSaveError,
        `${locale}: profileSaveError が string でない`,
      ).toBe('string');
      expect(
        (translations.profileSaveError as string).length,
        `${locale}: profileSaveError が空文字`,
      ).toBeGreaterThan(0);
    }
  });
});
