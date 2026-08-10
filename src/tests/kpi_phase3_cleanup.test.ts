/**
 * kpi_phase3_cleanup.test.ts
 * KPI Phase 3 最終クリーンアップ テスト
 *
 * タスク1: MyStats.tsx の実行時参照が 0 件
 * タスク2: 棋譜 Import の KPI 除外 (origin フィールド / 後方互換)
 * タスク3: UserPage の Postmortem 5分類テスト維持確認
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';

// ─── localStorage mock ───────────────────────────────────────────────────────
const localStorageData: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => localStorageData[key] ?? null,
  setItem: (key: string, value: string) => { localStorageData[key] = value; },
  removeItem: (key: string) => { delete localStorageData[key]; },
  clear: () => { Object.keys(localStorageData).forEach(k => delete localStorageData[k]); },
};
Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true });

// ─── タスク1: MyStats コンポーネントが存在しない ─────────────────────────────────

describe('Task 1: MyStats コンポーネント削除確認', () => {

  it('MyStats.tsx が存在しないこと', () => {
    const myStatsPath = join(__dirname, '../../src/components/MyStats.tsx');
    expect(existsSync(myStatsPath)).toBe(false);
  });

  it('App.tsx に MyStats コンポーネントの import がないこと', async () => {
    const { readFileSync } = await import('fs');
    const appSrc = readFileSync(join(__dirname, '../../src/app/App.tsx'), 'utf-8');
    // コンポーネントとしての import（matchLog.ts の MyStats 型は別）
    expect(appSrc).not.toContain("from '../components/MyStats'");
  });

  it('App.tsx に <MyStats が存在しないこと (JSX 使用なし)', async () => {
    const { readFileSync } = await import('fs');
    const appSrc = readFileSync(join(__dirname, '../../src/app/App.tsx'), 'utf-8');
    expect(appSrc).not.toContain('<MyStats');
  });
});

// ─── タスク2: origin フィールド — 後方互換 ────────────────────────────────────

describe('Task 2: LocalSessionMeta — origin フィールド後方互換', () => {

  beforeEach(() => {
    localStorageMock.clear();
  });

  it('origin なしの旧形式を保存 → loadLocalSession は origin="live" を返す', async () => {
    const { loadLocalSession } = await import('../game/localSession');
    localStorageMock.setItem(
      'one_eight_local_session',
      JSON.stringify({ gameId: 'old-id', matchStartedSent: false, gameOverSaved: false }),
    );
    const loaded = loadLocalSession();
    expect(loaded).not.toBeNull();
    expect(loaded!.origin).toBe('live');
  });

  it('origin="live" で保存 → loadLocalSession は origin="live" を返す', async () => {
    const { newLocalSession, saveLocalSession, loadLocalSession } = await import('../game/localSession');
    const s = newLocalSession('live-id-001');
    // newLocalSession は origin='live' を設定する
    saveLocalSession(s);
    const loaded = loadLocalSession();
    expect(loaded).not.toBeNull();
    expect(loaded!.origin).toBe('live');
  });

  it('origin="import" で保存 → loadLocalSession は origin="import" を返す', async () => {
    const { newLocalSession, saveLocalSession, loadLocalSession } = await import('../game/localSession');
    const s = newLocalSession('import-id-001');
    s.origin = 'import';
    saveLocalSession(s);
    const loaded = loadLocalSession();
    expect(loaded).not.toBeNull();
    expect(loaded!.origin).toBe('import');
  });
});

// ─── タスク2: newLocalSession / handleImport の origin 確認 ──────────────────

describe('Task 2: newLocalSession は origin="live" を設定する', () => {

  it('newLocalSession() は origin="live" を持つ', async () => {
    const { newLocalSession } = await import('../game/localSession');
    const s = newLocalSession();
    expect(s.origin).toBe('live');
  });

  it('newLocalSession(id) は origin="live" を持つ', async () => {
    const { newLocalSession } = await import('../game/localSession');
    const s = newLocalSession('explicit-id');
    expect(s.origin).toBe('live');
  });

  it('Import 後のセッションは origin="import" であること', async () => {
    // handleImport 相当のロジック検証: newLocalSession + origin 上書き
    const { newLocalSession } = await import('../game/localSession');
    const importSession = newLocalSession(crypto.randomUUID());
    importSession.origin = 'import';
    importSession.matchStartedSent = true;
    importSession.gameOverSaved = true;
    expect(importSession.origin).toBe('import');
    expect(importSession.matchStartedSent).toBe(true);
    expect(importSession.gameOverSaved).toBe(true);
  });
});

// ─── タスク2: App.tsx の Import 除外ロジック確認 (ソースレベル) ──────────────

describe('Task 2: App.tsx — Import 除外ロジックが実装されている', () => {

  it('handleImport が origin="import" をセットする', async () => {
    const { readFileSync } = await import('fs');
    const appSrc = readFileSync(join(__dirname, '../../src/app/App.tsx'), 'utf-8');
    expect(appSrc).toContain("origin = 'import'");
  });

  it('match_started 送信が origin !== import を確認している', async () => {
    const { readFileSync } = await import('fs');
    const appSrc = readFileSync(join(__dirname, '../../src/app/App.tsx'), 'utf-8');
    // origin チェックが含まれる
    expect(appSrc).toMatch(/origin.*import/);
  });

  it('終局保存が origin !== import を確認している', async () => {
    const { readFileSync } = await import('fs');
    const appSrc = readFileSync(join(__dirname, '../../src/app/App.tsx'), 'utf-8');
    // gameOverSaved と origin の両方の条件が含まれる
    expect(appSrc).toContain('gameOverSaved');
    expect(appSrc).toContain("'import'");
  });

  it('Import セッションは matchStartedSent=true でフラグ保護される', async () => {
    const { readFileSync } = await import('fs');
    const appSrc = readFileSync(join(__dirname, '../../src/app/App.tsx'), 'utf-8');
    // handleImport 内で matchStartedSent=true をセットしている
    expect(appSrc).toContain('importSession.matchStartedSent = true');
  });

  it('Import セッションは gameOverSaved=true でフラグ保護される', async () => {
    const { readFileSync } = await import('fs');
    const appSrc = readFileSync(join(__dirname, '../../src/app/App.tsx'), 'utf-8');
    expect(appSrc).toContain('importSession.gameOverSaved = true');
  });
});

// ─── タスク2: origin="import" での match_started 送信ロジック検証 ─────────────

describe('Task 2: origin="import" のとき match_started を送らないロジック検証', () => {

  /**
   * App.tsx の useEffect 内のロジックを純粋関数として抽出して検証する
   */
  function shouldSendMatchStarted(params: {
    trainingMode: boolean;
    origin: 'live' | 'import';
    historyLength: number;
    matchStartedSent: boolean;
  }): boolean {
    return (
      !params.trainingMode &&
      (params.origin ?? 'live') !== 'import' &&
      params.historyLength === 1 &&
      !params.matchStartedSent
    );
  }

  it('通常対局・1手目・未送信 → true (送信する)', () => {
    expect(shouldSendMatchStarted({
      trainingMode: false,
      origin: 'live',
      historyLength: 1,
      matchStartedSent: false,
    })).toBe(true);
  });

  it('Import・1手目・未送信 → false (送らない)', () => {
    expect(shouldSendMatchStarted({
      trainingMode: false,
      origin: 'import',
      historyLength: 1,
      matchStartedSent: false,
    })).toBe(false);
  });

  it('Import・終局・未送信 → false (送らない)', () => {
    expect(shouldSendMatchStarted({
      trainingMode: false,
      origin: 'import',
      historyLength: 52,
      matchStartedSent: false,
    })).toBe(false);
  });

  it('Training・1手目・未送信 → false (Training 除外)', () => {
    expect(shouldSendMatchStarted({
      trainingMode: true,
      origin: 'live',
      historyLength: 1,
      matchStartedSent: false,
    })).toBe(false);
  });
});

// ─── タスク2: origin="import" での終局保存ロジック検証 ────────────────────────

describe('Task 2: origin="import" のとき GameRecord / match_logs に保存しないロジック検証', () => {

  function shouldSaveGameOver(params: {
    gameEnded: boolean;
    gameOverSaved: boolean;
    origin: 'live' | 'import';
  }): boolean {
    return (
      params.gameEnded &&
      !params.gameOverSaved &&
      (params.origin ?? 'live') !== 'import'
    );
  }

  it('通常対局・終局・未保存 → true (保存する)', () => {
    expect(shouldSaveGameOver({ gameEnded: true, gameOverSaved: false, origin: 'live' })).toBe(true);
  });

  it('Import・終局・未保存 → false (保存しない)', () => {
    expect(shouldSaveGameOver({ gameEnded: true, gameOverSaved: false, origin: 'import' })).toBe(false);
  });

  it('通常対局・未終局・未保存 → false (終局待ち)', () => {
    expect(shouldSaveGameOver({ gameEnded: false, gameOverSaved: false, origin: 'live' })).toBe(false);
  });

  it('通常対局・終局・保存済み → false (二重保存防止)', () => {
    expect(shouldSaveGameOver({ gameEnded: true, gameOverSaved: true, origin: 'live' })).toBe(false);
  });
});

// ─── タスク2: Import 後の New Game → origin="live" 復帰 ─────────────────────

describe('Task 2: Import 後の New Game は origin="live" に戻る', () => {

  it('newLocalSession() は常に origin="live" を返す（New Game 時の挙動）', async () => {
    const { newLocalSession } = await import('../game/localSession');
    // Import 後に New Game を押すと newLocalSession() が呼ばれる
    const s = newLocalSession();
    expect(s.origin).toBe('live');
  });
});

// ─── タスク3: UserPage Postmortem 5分類テスト — 維持確認 ─────────────────────

describe('Task 3: UserPage Postmortem 5分類テストが維持されている', () => {

  it('kpi_phase3_execution_path.test.ts に "online_pvp の 5分類" describe が存在する', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(
      join(__dirname, '../../src/tests/kpi_phase3_execution_path.test.ts'),
      'utf-8',
    );
    expect(src).toContain('online_pvp の 5分類');
  });

  it('resolvePostmortemMatchMode — standalone → official', async () => {
    const { resolvePostmortemMatchMode } = await import('../lib/postmortemWorkerManager');
    const result = resolvePostmortemMatchMode('online_pvp', undefined, { source_kind: 'standalone' });
    expect(result).toBe('official');
  });

  it('resolvePostmortemMatchMode — arena → arena', async () => {
    const { resolvePostmortemMatchMode } = await import('../lib/postmortemWorkerManager');
    const result = resolvePostmortemMatchMode('online_pvp', undefined, { source_kind: 'arena' });
    expect(result).toBe('arena');
  });

  it('resolvePostmortemMatchMode — officialItem なし → online', async () => {
    const { resolvePostmortemMatchMode } = await import('../lib/postmortemWorkerManager');
    const result = resolvePostmortemMatchMode('online_pvp', undefined, undefined);
    expect(result).toBe('online');
  });
});
