/**
 * kpi_phase3_postmortem.test.ts — KPI Phase 3 Postmortem KPI テスト
 *
 * テスト項目:
 *  1.  postmortem_started が exactly-once 送信（queued/running中は無視）
 *  2.  cache hit時: started/completed が1回ずつ送信
 *  3.  Worker done時: completed が1回
 *  4.  Worker error時: failed が1回
 *  5.  raw error / 棋譜 / game_id が properties に含まれない
 *  6.  postmortem_completed の elapsed_seconds が 0〜86400
 *  7.  performance_measure の value_ms が 0〜300000
 *  8.  postmortem_failed の stage が固定分類
 *  9.  Admin Postmortem migration の存在確認
 * 10.  Admin Postmortem が kpi_events 正本を使用
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(__dirname, '../../supabase/migrations');

function readMigration(filename: string): string {
  return readFileSync(join(MIGRATIONS_DIR, filename), 'utf-8');
}

// ---------------------------------------------------------------------------
// PostmortemWorkerManager モック
// ---------------------------------------------------------------------------

// KPI track 呼び出しを記録するモック
const trackCalls: Array<{ name: string; props: Record<string, unknown> }> = [];

vi.mock('../lib/kpiTracker', () => ({
  track: vi.fn((name: string, props: Record<string, unknown>) => {
    trackCalls.push({ name, props });
  }),
}));

// storage モック
vi.mock('../game/storage', () => ({
  savePostmortemCache: vi.fn(),
  loadPostmortemCache: vi.fn(() => null), // デフォルトはキャッシュなし
}));

// Worker モック（グローバル）
class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  private messageListeners: Array<(e: MessageEvent) => void> = [];
  private errorListeners: Array<(e: ErrorEvent) => void> = [];

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === 'message') this.messageListeners.push(listener as (e: MessageEvent) => void);
    if (type === 'error') this.errorListeners.push(listener as (e: ErrorEvent) => void);
  }

  postMessage(_data: unknown) {
    // Worker起動後、テストから triggerDone/triggerError を呼ぶ
  }

  terminate() {}

  triggerDone(result: unknown) {
    const event = { data: { type: 'done', result } } as MessageEvent;
    this.messageListeners.forEach(fn => fn(event));
  }

  triggerError(message: string) {
    const event = { data: { type: 'error', message } } as MessageEvent;
    this.messageListeners.forEach(fn => fn(event));
  }

  triggerNativeError(message: string) {
    const event = { message } as ErrorEvent;
    this.errorListeners.forEach(fn => fn(event));
  }
}

let fakeWorkerInstance: FakeWorker | null = null;

vi.stubGlobal('Worker', class {
  constructor(_url: URL, _opts?: WorkerOptions) {
    fakeWorkerInstance = new FakeWorker();
    return fakeWorkerInstance;
  }
});

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('KPI Phase 3 — Postmortem', () => {

  beforeEach(() => {
    trackCalls.length = 0;
    fakeWorkerInstance = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('1. postmortem_started: queued/running中に再度run()しても1回しか送信しない', async () => {
    const { loadPostmortemCache } = await import('../game/storage');
    vi.mocked(loadPostmortemCache).mockReturnValue(null);

    const { PostmortemWorkerManager } = await import('../lib/postmortemWorkerManager');
    const mgr = new PostmortemWorkerManager();

    const history = [{ moveNumber: 1, position: 0, player: 'black' } as never];

    // 1回目
    mgr.run('game-1', history, 'black', 'online');
    // 2回目（queued中）
    mgr.run('game-1', history, 'black', 'online');

    const startedCalls = trackCalls.filter(c => c.name === 'postmortem_started');
    expect(startedCalls.length).toBe(1); // exactly-once
  });

  it('2. cache hit時: postmortem_started 1回 + postmortem_completed 1回', async () => {
    const { loadPostmortemCache } = await import('../game/storage');
    const fakeResult = { moves: [{ position: 0, candidates: [] }] } as never;
    vi.mocked(loadPostmortemCache).mockReturnValue(fakeResult);

    const { PostmortemWorkerManager } = await import('../lib/postmortemWorkerManager');
    const mgr = new PostmortemWorkerManager();

    const history = [{ moveNumber: 1, position: 0, player: 'black' } as never];
    mgr.run('game-cache', history, 'black', 'online');

    const startedCalls = trackCalls.filter(c => c.name === 'postmortem_started');
    const completedCalls = trackCalls.filter(c => c.name === 'postmortem_completed');

    expect(startedCalls.length).toBe(1);
    expect(completedCalls.length).toBe(1);
    // elapsed_seconds = 0 (cache hit)
    expect(completedCalls[0]?.props?.elapsed_seconds).toBe(0);
  });

  it('3. Worker done時: postmortem_completed が1回 + performance_measure が1回', async () => {
    const { loadPostmortemCache } = await import('../game/storage');
    vi.mocked(loadPostmortemCache).mockReturnValue(null);

    const { PostmortemWorkerManager } = await import('../lib/postmortemWorkerManager');
    const mgr = new PostmortemWorkerManager();

    const history = [{ moveNumber: 1, position: 0, player: 'black' } as never];
    mgr.run('game-done', history, 'black', 'arena');

    // Worker doneを発火
    if (fakeWorkerInstance) {
      fakeWorkerInstance.triggerDone({ moves: [{ position: 0, candidates: [] }] });
    }

    // 少し待つ
    await new Promise(resolve => setTimeout(resolve, 10));

    const completedCalls = trackCalls.filter(c => c.name === 'postmortem_completed');
    const perfCalls = trackCalls.filter(c => c.name === 'performance_measure');

    expect(completedCalls.length).toBe(1);
    expect(completedCalls[0]?.props?.match_mode).toBe('arena');
    expect(perfCalls.length).toBeGreaterThanOrEqual(1);
    const workerPerfCall = perfCalls.find(c => c.props?.metric_name === 'postmortem_worker_ms');
    expect(workerPerfCall).toBeDefined();
    // value_ms >= 0 && <= 300000
    const valueMs = workerPerfCall?.props?.value_ms as number;
    expect(valueMs).toBeGreaterThanOrEqual(0);
    expect(valueMs).toBeLessThanOrEqual(300000);
  });

  it('4. Worker error時: postmortem_failed が1回', async () => {
    const { loadPostmortemCache } = await import('../game/storage');
    vi.mocked(loadPostmortemCache).mockReturnValue(null);

    const { PostmortemWorkerManager } = await import('../lib/postmortemWorkerManager');
    const mgr = new PostmortemWorkerManager();

    const history = [{ moveNumber: 1, position: 0, player: 'black' } as never];
    mgr.run('game-fail', history, 'black', 'cpu' as never);

    if (fakeWorkerInstance) {
      fakeWorkerInstance.triggerError('Worker analysis failed');
    }

    await new Promise(resolve => setTimeout(resolve, 10));

    const failedCalls = trackCalls.filter(c => c.name === 'postmortem_failed');
    expect(failedCalls.length).toBe(1);
    // stage は固定分類
    expect(failedCalls[0]?.props?.stage).toBe('worker');
    // raw message は保存しない
    expect(JSON.stringify(failedCalls[0]?.props)).not.toContain('Worker analysis failed');
  });

  it('5. raw error / 棋譜 / game_id が properties に含まれない', async () => {
    const { loadPostmortemCache } = await import('../game/storage');
    vi.mocked(loadPostmortemCache).mockReturnValue(null);

    const { PostmortemWorkerManager } = await import('../lib/postmortemWorkerManager');
    const mgr = new PostmortemWorkerManager();

    const history = [{ moveNumber: 1, position: 0, player: 'black' } as never];
    mgr.run('game-pii', history, 'black', 'online');

    if (fakeWorkerInstance) {
      fakeWorkerInstance.triggerError('Sensitive internal error: database credentials leaked');
    }

    await new Promise(resolve => setTimeout(resolve, 10));

    const allPropsStr = JSON.stringify(trackCalls.map(c => c.props));
    // game_id は含まれない
    expect(allPropsStr).not.toContain('game-pii');
    // raw error message は含まれない
    expect(allPropsStr).not.toContain('Sensitive internal error');
    expect(allPropsStr).not.toContain('database credentials');
  });

  it('6. postmortem_completed の elapsed_seconds が 0〜86400 の範囲内', async () => {
    const { loadPostmortemCache } = await import('../game/storage');
    vi.mocked(loadPostmortemCache).mockReturnValue(null);

    const { PostmortemWorkerManager } = await import('../lib/postmortemWorkerManager');
    const mgr = new PostmortemWorkerManager();

    const history = [{ moveNumber: 1, position: 0, player: 'black' } as never];
    mgr.run('game-elapsed', history, 'black', 'official');

    if (fakeWorkerInstance) {
      fakeWorkerInstance.triggerDone({ moves: [] });
    }

    await new Promise(resolve => setTimeout(resolve, 10));

    const completedCalls = trackCalls.filter(c => c.name === 'postmortem_completed');
    if (completedCalls.length > 0) {
      const elapsedSec = completedCalls[0]?.props?.elapsed_seconds as number | undefined;
      if (elapsedSec !== undefined) {
        expect(elapsedSec).toBeGreaterThanOrEqual(0);
        expect(elapsedSec).toBeLessThanOrEqual(86400);
      }
    }
  });

  it('7. performance_measure の value_ms が 0〜300000 の範囲内', async () => {
    const { loadPostmortemCache } = await import('../game/storage');
    vi.mocked(loadPostmortemCache).mockReturnValue(null);

    const { PostmortemWorkerManager } = await import('../lib/postmortemWorkerManager');
    const mgr = new PostmortemWorkerManager();

    const history = [{ moveNumber: 1, position: 0, player: 'black' } as never];
    mgr.run('game-perf', history, 'black', 'online');

    if (fakeWorkerInstance) {
      fakeWorkerInstance.triggerDone({ moves: [] });
    }

    await new Promise(resolve => setTimeout(resolve, 10));

    const perfCalls = trackCalls.filter(
      c => c.name === 'performance_measure' && c.props?.metric_name === 'postmortem_worker_ms'
    );
    if (perfCalls.length > 0) {
      const valueMs = perfCalls[0]?.props?.value_ms as number;
      expect(valueMs).toBeGreaterThanOrEqual(0);
      expect(valueMs).toBeLessThanOrEqual(300000);
    }
  });

  it('8. postmortem_failed の stage が固定分類（rpc/worker/parse/unknown）のみ', async () => {
    const { loadPostmortemCache } = await import('../game/storage');
    vi.mocked(loadPostmortemCache).mockReturnValue(null);

    const { PostmortemWorkerManager } = await import('../lib/postmortemWorkerManager');
    const mgr = new PostmortemWorkerManager();

    const history = [{ moveNumber: 1, position: 0, player: 'black' } as never];
    mgr.run('game-stage', history, 'black', 'online');

    if (fakeWorkerInstance) {
      fakeWorkerInstance.triggerError('some error');
    }

    await new Promise(resolve => setTimeout(resolve, 10));

    const failedCalls = trackCalls.filter(c => c.name === 'postmortem_failed');
    for (const call of failedCalls) {
      const stage = call.props?.stage;
      if (stage !== undefined) {
        expect(['rpc', 'worker', 'parse', 'unknown']).toContain(stage);
      }
    }
  });

  it('9. Admin Postmortem migration ファイルが存在する', () => {
    expect(
      existsSync(join(MIGRATIONS_DIR, '20260810000004_kpi_phase3_admin_postmortem.sql'))
    ).toBe(true);
  });

  it('10. Admin Postmortem が kpi_events テーブルを正本として使用', () => {
    const sql = readMigration('20260810000004_kpi_phase3_admin_postmortem.sql');
    expect(sql).toContain('public.kpi_events ke');
    expect(sql).toContain("event_name IN (");
    expect(sql).toContain("'postmortem_started'");
    expect(sql).toContain("'postmortem_completed'");
    expect(sql).toContain("'postmortem_failed'");
    // user_id / display_name / email は返さない
    expect(sql).not.toContain('user_id,');
    expect(sql).not.toContain('display_name');
    expect(sql).not.toContain('email');
  });
});
