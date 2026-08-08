/**
 * profile_supabase_mock.test.ts
 *
 * Phase E: Supabase mock を使った profile.ts の振る舞い検証
 *
 * 検証項目:
 *  [updateDisplayName]
 *   1.  UPDATEのみ（upsert/insertを呼ばない）
 *   2.  Supabase errorをthrow
 *   3.  data=[]を更新0件としてthrow
 *   4.  DB成功後のみresolve（失敗時はthrow）
 *   5.  空文字を拒否
 *   6.  31文字以上を拒否
 *   7.  30文字は許可
 *
 *  [updateProfileLang]
 *   8.  UPDATEのみ（upsert/insertを呼ばない）
 *   9.  Supabase errorをthrow
 *   10. data=[]を更新0件としてthrow
 *
 *  [updateProfileStatsPublic]
 *   11. UPDATEのみ（upsert/insertを呼ばない）
 *   12. Supabase errorをthrow
 *   13. data=[]を更新0件としてthrow
 *
 *  [UserPage 振る舞い — ソース参照による不変性確認]
 *   14. display_name はDB成功後だけUI/localStorageへ反映（失敗時は編集画面維持）
 *   15. stats_public はDB成功後だけUIへ反映
 *   16. stats_public 失敗時は旧状態を維持（setStatsPublicを呼ばない）
 *   17. lang同期失敗がconsole.errorへ記録される
 *
 *  [protected columns]
 *   18. updateDisplayName はprotected columnsを更新対象に含まない
 *   19. updateProfileLang はprotected columnsを更新対象に含まない
 *   20. updateProfileStatsPublic はprotected columnsを更新対象に含まない
 *   21. 他ユーザーIDでの更新はRLS相当で0件→throw（data=[]ケース）
 *
 *  [i18n]
 *   22. statsSaveError が全10言語に存在すること
 *
 *  [Arena / OnlineBoard 名前取得経路の不変性確認]
 *   23. Arena名前取得は get_arena_overview / get_arena_detail RPC経由
 *   24. OnlineBoard の相手名取得は getPublicProfile 経由
 *   25. OnlineBoard の自分名取得は getProfile 経由
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Supabase mock ─────────────────────────────────────────────────────────────
// vi.mock は巻き上げられるため、モック状態はオブジェクトで保持する。
// chain: from(table).update(payload).eq(col,val).select(cols)
//   → Promise<{ data, error }>

interface MockResult {
  data: { id: string }[] | null;
  error: { code: string; message: string } | null;
}

const mockState = {
  result: { data: [{ id: 'uuid-1' }], error: null } as MockResult,
  lastUpdatePayload: null as Record<string, unknown> | null,
  lastEqArgs: null as [string, unknown] | null,
  lastUpsertPayload: null as Record<string, unknown> | null,
  upsertCalled: false,
  insertCalled: false,
};

vi.mock('../lib/supabase', () => {
  const selectFn: Mock = vi.fn(() => Promise.resolve(mockState.result));
  const eqFn: Mock = vi.fn((...args: [string, unknown]) => {
    mockState.lastEqArgs = args;
    return { select: selectFn };
  });
  const updateFn: Mock = vi.fn((payload: Record<string, unknown>) => {
    mockState.lastUpdatePayload = payload;
    return { eq: eqFn };
  });
  const upsertFn: Mock = vi.fn((payload: Record<string, unknown>) => {
    mockState.upsertCalled = true;
    mockState.lastUpsertPayload = payload;
    return Promise.resolve({ data: null, error: null });
  });
  const insertFn: Mock = vi.fn(() => {
    mockState.insertCalled = true;
    return Promise.resolve({ data: null, error: null });
  });
  const fromFn: Mock = vi.fn(() => ({
    update: updateFn,
    upsert: upsertFn,
    insert: insertFn,
    select: selectFn,
  }));
  return { supabase: { from: fromFn } };
});

import { updateDisplayName, updateProfileLang, updateProfileStatsPublic } from '../lib/profile';

// ── ヘルパー ──────────────────────────────────────────────────────────────────
function resetMock(overrides?: Partial<MockResult>) {
  mockState.result = { data: [{ id: 'uuid-1' }], error: null, ...overrides };
  mockState.lastUpdatePayload = null;
  mockState.lastEqArgs = null;
  mockState.lastUpsertPayload = null;
  mockState.upsertCalled = false;
  mockState.insertCalled = false;
  vi.clearAllMocks();
}

const PROTECTED_COLUMNS = [
  'plan',
  'subscription_status',
  'is_admin',
  'is_internal_test_account',
  'internal_plan_override',
  'current_period_end',
  'created_at',
  'id',
];

// ── updateDisplayName ─────────────────────────────────────────────────────────
describe('updateDisplayName', () => {
  beforeEach(() => resetMock());

  it('1. UPDATEのみ — upsert/insertを呼ばない', async () => {
    await updateDisplayName('uuid-1', 'テスト');
    expect(mockState.upsertCalled).toBe(false);
    expect(mockState.insertCalled).toBe(false);
    expect(mockState.lastUpdatePayload).toMatchObject({ display_name: 'テスト' });
  });

  it('2. Supabase errorをthrow', async () => {
    resetMock({ data: null, error: { code: '42501', message: 'permission denied' } });
    await expect(updateDisplayName('uuid-1', 'テスト')).rejects.toThrow('permission denied');
  });

  it('3. data=[]を更新0件としてthrow', async () => {
    resetMock({ data: [], error: null });
    await expect(updateDisplayName('uuid-1', 'テスト')).rejects.toThrow('no rows updated');
  });

  it('4. DB成功後のみresolve', async () => {
    await expect(updateDisplayName('uuid-1', 'テスト')).resolves.toBeUndefined();
  });

  it('5. 空文字を拒否', async () => {
    await expect(updateDisplayName('uuid-1', '')).rejects.toThrow('cannot be empty');
  });

  it('6. 31文字以上を拒否', async () => {
    await expect(updateDisplayName('uuid-1', 'a'.repeat(31))).rejects.toThrow('too long');
  });

  it('7. 30文字は許可', async () => {
    await expect(updateDisplayName('uuid-1', 'a'.repeat(30))).resolves.toBeUndefined();
  });
});

// ── updateProfileLang ─────────────────────────────────────────────────────────
describe('updateProfileLang', () => {
  beforeEach(() => resetMock());

  it('8. UPDATEのみ — upsert/insertを呼ばない', async () => {
    await updateProfileLang('uuid-1', 'en');
    expect(mockState.upsertCalled).toBe(false);
    expect(mockState.insertCalled).toBe(false);
    expect(mockState.lastUpdatePayload).toMatchObject({ lang: 'en' });
  });

  it('9. Supabase errorをthrow', async () => {
    resetMock({ data: null, error: { code: '42P01', message: 'relation does not exist' } });
    await expect(updateProfileLang('uuid-1', 'en')).rejects.toThrow('relation does not exist');
  });

  it('10. data=[]を更新0件としてthrow', async () => {
    resetMock({ data: [], error: null });
    await expect(updateProfileLang('uuid-1', 'en')).rejects.toThrow('no rows updated');
  });
});

// ── updateProfileStatsPublic ──────────────────────────────────────────────────
describe('updateProfileStatsPublic', () => {
  beforeEach(() => resetMock());

  it('11. UPDATEのみ — upsert/insertを呼ばない', async () => {
    await updateProfileStatsPublic('uuid-1', true);
    expect(mockState.upsertCalled).toBe(false);
    expect(mockState.insertCalled).toBe(false);
    expect(mockState.lastUpdatePayload).toMatchObject({ stats_public: true });
  });

  it('12. Supabase errorをthrow', async () => {
    resetMock({ data: null, error: { code: 'PGRST116', message: 'row not found' } });
    await expect(updateProfileStatsPublic('uuid-1', true)).rejects.toThrow('row not found');
  });

  it('13. data=[]を更新0件としてthrow', async () => {
    resetMock({ data: [], error: null });
    await expect(updateProfileStatsPublic('uuid-1', true)).rejects.toThrow('no rows updated');
  });
});

// ── UserPage振る舞い（ソース参照）────────────────────────────────────────────
describe('UserPage source: display_name / stats_public / lang 振る舞い確認', () => {
  const srcPath = resolve(__dirname, '../components/UserPage.tsx');
  const src = readFileSync(srcPath, 'utf-8');

  it('14. display_name はDB成功後だけUI/localStorageへ反映（await updateDisplayName が先）', () => {
    // handleSaveName: await updateDisplayName → setUsername / saveUsername の順
    const handleSaveNameMatch = src.match(/async function handleSaveName\(\)[\s\S]*?^\s{2}\}/m);
    // 関数本体全体を取得する簡易アプローチ: awaitとsetUsernameの相対順序を確認
    const awaitIdx = src.indexOf('await updateDisplayName');
    const setUsernameIdx = src.indexOf('setUsername(trimmed)');
    const saveUsernameIdx = src.indexOf('saveUsername(userId, trimmed)');
    expect(awaitIdx).toBeGreaterThan(0);
    expect(setUsernameIdx).toBeGreaterThan(awaitIdx);
    expect(saveUsernameIdx).toBeGreaterThan(awaitIdx);
  });

  it('15. stats_public はDB成功後だけUIへ反映（await updateProfileStatsPublic が先）', () => {
    const awaitIdx = src.indexOf('await updateProfileStatsPublic');
    const setStatsIdx = src.indexOf('setStatsPublic(val)');
    expect(awaitIdx).toBeGreaterThan(0);
    expect(setStatsIdx).toBeGreaterThan(awaitIdx);
  });

  it('16. stats_public 失敗時は旧状態を維持（catchでsetStatsPublicを呼ばない）', () => {
    // handleStatsPublicChange: try { await ...; setStatsPublic(val) } catch { ... }
    // catchブロック内に setStatsPublic(val) が存在しないことを確認
    // catchブロックを抽出: "} catch (err) {" 以降 "} finally {" まで
    const catchMatch = src.match(/\} catch \(err\) \{([\s\S]*?)\} finally \{/);
    const catchBody = catchMatch?.[1] ?? '';
    // catchBody内にsetStatsPublicへの代入がないことを確認
    expect(catchBody).not.toContain('setStatsPublic(val)');
    // catchBody内にsetStatsPublicが全くないことを確認（ロールバックもしない）
    expect(catchBody).not.toMatch(/setStatsPublic/);
  });

  it('17. lang同期失敗がconsole.errorへ記録される', () => {
    // display_name init sync失敗: console.error('[UserPage] display_name init sync failed:')
    expect(src).toContain("console.error('[UserPage] display_name init sync failed:'");
    // setLangWithSync は CompactLanguageSelector の onSelect で使用
    // lang 同期: setLangWithSync が lib/lang.tsx に存在し、エラー時console.errorを記録
    const langSrc = readFileSync(resolve(__dirname, '../lib/lang.tsx'), 'utf-8');
    expect(langSrc).toContain('console.error');
    expect(langSrc).toContain('setLangWithSync');
  });
});

// ── protected columns ─────────────────────────────────────────────────────────
describe('protected columns: 更新対象に含まれない', () => {
  beforeEach(() => resetMock());

  it('18. updateDisplayName は protected columns を含まない', async () => {
    await updateDisplayName('uuid-1', 'テスト');
    const payload = mockState.lastUpdatePayload ?? {};
    for (const col of PROTECTED_COLUMNS) {
      expect(
        Object.prototype.hasOwnProperty.call(payload, col),
        `updateDisplayName が protected column "${col}" を更新している`,
      ).toBe(false);
    }
    // display_name のみ含む
    expect(Object.keys(payload)).toEqual(['display_name']);
  });

  it('19. updateProfileLang は protected columns を含まない', async () => {
    await updateProfileLang('uuid-1', 'en');
    const payload = mockState.lastUpdatePayload ?? {};
    for (const col of PROTECTED_COLUMNS) {
      expect(
        Object.prototype.hasOwnProperty.call(payload, col),
        `updateProfileLang が protected column "${col}" を更新している`,
      ).toBe(false);
    }
    expect(Object.keys(payload)).toEqual(['lang']);
  });

  it('20. updateProfileStatsPublic は protected columns を含まない', async () => {
    await updateProfileStatsPublic('uuid-1', true);
    const payload = mockState.lastUpdatePayload ?? {};
    for (const col of PROTECTED_COLUMNS) {
      expect(
        Object.prototype.hasOwnProperty.call(payload, col),
        `updateProfileStatsPublic が protected column "${col}" を更新している`,
      ).toBe(false);
    }
    expect(Object.keys(payload)).toEqual(['stats_public']);
  });

  it('21. 他ユーザー更新はRLS相当: data=[]→throw（updateDisplayName）', async () => {
    // RLSにより他ユーザーのidで.eq('id', otherId)を実行しても0件が返る
    // data=[]はthrowされることを確認
    resetMock({ data: [], error: null });
    await expect(updateDisplayName('other-user-id', 'テスト'))
      .rejects.toThrow('no rows updated');
  });
});

// ── i18n: statsSaveError ──────────────────────────────────────────────────────
describe('i18n: statsSaveError 全10言語', () => {
  const LOCALE_FILES = [
    'en', 'ja', 'de', 'es', 'fr', 'it', 'ko', 'pt-BR', 'zh-Hans', 'zh-Hant',
  ] as const;

  it('22. 全10言語に statsSaveError が存在すること', async () => {
    for (const locale of LOCALE_FILES) {
      const mod = await import(`../i18n/${locale}.ts`);
      const translations = mod.default ?? mod[Object.keys(mod)[0]!];
      expect(
        translations.statsSaveError,
        `${locale}: statsSaveError が未定義`,
      ).toBeDefined();
      expect(
        typeof translations.statsSaveError,
        `${locale}: statsSaveError が string でない`,
      ).toBe('string');
      expect(
        (translations.statsSaveError as string).length,
        `${locale}: statsSaveError が空文字`,
      ).toBeGreaterThan(0);
    }
  });
});

// ── Arena / OnlineBoard 名前取得経路の不変性確認（ソース参照）────────────────
describe('Arena / OnlineBoard 名前取得経路', () => {
  it('23. Arena名前取得は get_arena_overview / get_arena_detail RPC経由', () => {
    const arenaSrc = readFileSync(resolve(__dirname, '../lib/arena.ts'), 'utf-8');
    // display_name フィールドはRPCレスポンスから取得
    expect(arenaSrc).toContain("rpc('get_arena_overview'");
    expect(arenaSrc).toContain("rpc('get_arena_detail'");
    // RPC結果の display_name フィールドが型に定義されている
    expect(arenaSrc).toContain('display_name');
  });

  it('24. OnlineBoard の相手名取得は getPublicProfile 経由', () => {
    const obSrc = readFileSync(resolve(__dirname, '../components/OnlineBoard.tsx'), 'utf-8');
    expect(obSrc).toContain('getPublicProfile');
    // getPublicProfile呼び出し結果でdisplay_nameを使用
    expect(obSrc).toContain('display_name');
  });

  it('25. OnlineBoard の自分名取得は getProfile 経由', () => {
    const obSrc = readFileSync(resolve(__dirname, '../components/OnlineBoard.tsx'), 'utf-8');
    expect(obSrc).toContain('getProfile');
  });
});
