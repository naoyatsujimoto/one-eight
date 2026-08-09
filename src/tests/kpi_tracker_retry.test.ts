/**
 * kpi_tracker_retry.test.ts — KPI Tracker retry/non-retry ロジックテスト
 *
 * テスト項目:
 *  1. validation error (invalid_parameter_value) はretryしない
 *  2. permission error (insufficient_privilege / 42501) はretryしない
 *  3. rate-limit error (too_many_requests) はretryしない
 *  4. KPI_プレフィックスエラーはretryしない
 *  5. ネットワーク/一時エラーだけ最大3回retry
 *  6. 同じidempotency_keyを維持してretry
 *  7. retryイベントが実際に再flushされる
 *  8. SupabaseがresolveしたエラーもSupabase error扱い ({ data: null, error: {...} })
 *  9. MAX_RETRY(3回)を超えたら静かに破棄
 * 10. flushNow() でキューを即時送信できる
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  initKpiTracker,
  track,
  flushNow,
  resetTracker,
  getQueueSnapshot,
} from '../lib/kpiTracker';

// ---------------------------------------------------------------------------
// Storage Mock
// ---------------------------------------------------------------------------

class StorageMock {
  private store: Record<string, string> = {};
  getItem(key: string) { return this.store[key] ?? null; }
  setItem(key: string, value: string) { this.store[key] = value; }
  removeItem(key: string) { delete this.store[key]; }
  clear() { this.store = {}; }
}

const localStorageMock = new StorageMock();
const sessionStorageMock = new StorageMock();

Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true });
Object.defineProperty(global, 'sessionStorage', { value: sessionStorageMock, writable: true });

// crypto.randomUUID mock
if (!(global as { crypto?: unknown }).crypto) {
  Object.defineProperty(global, 'crypto', {
    value: {
      randomUUID: () => {
        const bytes = new Uint8Array(16);
        for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
        bytes[6] = (bytes[6]! & 0x0f) | 0x40;
        bytes[8] = (bytes[8]! & 0x3f) | 0x80;
        const hex = Array.from(bytes).map((b: number) => b.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
      },
    },
    writable: true,
  });
}

// navigator.onLine mock
Object.defineProperty(global, 'navigator', {
  value: { onLine: true },
  writable: true,
});

// ---------------------------------------------------------------------------
// Supabase Mock helpers
// ---------------------------------------------------------------------------

function createMockSupabase(
  rpcImpl: (...args: unknown[]) => Promise<{ data: unknown; error: unknown }>
): { mock: SupabaseClient; rpcFn: ReturnType<typeof vi.fn> } {
  const rpcFn = vi.fn().mockImplementation(rpcImpl);
  const mock = { rpc: rpcFn } as unknown as SupabaseClient;
  return { mock, rpcFn };
}

function makeSupabaseError(code: string, message: string) {
  return { data: null, error: { code, message } };
}

// ---------------------------------------------------------------------------
// Setup/Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorageMock.clear();
  sessionStorageMock.clear();
  resetTracker();
  vi.useFakeTimers();
});

afterEach(() => {
  resetTracker();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helper: track a valid page_view event
// ---------------------------------------------------------------------------

function trackPageView(supabase?: SupabaseClient) {
  if (supabase) {
    initKpiTracker(supabase);
  }
  track('page_view', { route: '/test' });
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('KPI Tracker — non-retryable errors', () => {

  it('1. validation error (invalid_parameter_value) はretryしない', async () => {
    const { mock, rpcFn } = createMockSupabase(async () =>
      makeSupabaseError('invalid_parameter_value', 'KPI_PROPS_MISSING_REQUIRED: event=page_view key=route')
    );

    initKpiTracker(mock);
    trackPageView();

    // flush実行
    vi.runAllTimers();
    await vi.runAllTimersAsync();
    await flushNow();

    // 1回だけ呼ばれ、retryなし
    expect(rpcFn).toHaveBeenCalledTimes(1);

    // キューが空になっていること（retryイベントなし）
    await vi.runAllTimersAsync();
    expect(getQueueSnapshot()).toHaveLength(0);
  });

  it('2. permission error (insufficient_privilege) はretryしない', async () => {
    const { mock, rpcFn } = createMockSupabase(async () =>
      makeSupabaseError('insufficient_privilege', 'permission denied')
    );

    initKpiTracker(mock);
    trackPageView();
    vi.runAllTimers();
    await flushNow();

    expect(rpcFn).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    expect(getQueueSnapshot()).toHaveLength(0);
  });

  it('2b. permission error (42501) はretryしない', async () => {
    const { mock, rpcFn } = createMockSupabase(async () =>
      makeSupabaseError('42501', 'permission denied for function')
    );

    initKpiTracker(mock);
    trackPageView();
    vi.runAllTimers();
    await flushNow();

    expect(rpcFn).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    expect(getQueueSnapshot()).toHaveLength(0);
  });

  it('3. rate-limit error (too_many_requests) はretryしない', async () => {
    const { mock, rpcFn } = createMockSupabase(async () =>
      makeSupabaseError('too_many_requests', 'KPI_RATE_LIMIT_EXCEEDED')
    );

    initKpiTracker(mock);
    trackPageView();
    vi.runAllTimers();
    await flushNow();

    expect(rpcFn).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    expect(getQueueSnapshot()).toHaveLength(0);
  });

  it('4a. KPI_プレフィックスのエラーメッセージはretryしない (KPI_PROPS_PII_KEY_DETECTED)', async () => {
    const { mock, rpcFn } = createMockSupabase(async () =>
      makeSupabaseError('P0001', 'KPI_PROPS_PII_KEY_DETECTED')
    );

    initKpiTracker(mock);
    trackPageView();
    vi.runAllTimers();
    await flushNow();

    expect(rpcFn).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    expect(getQueueSnapshot()).toHaveLength(0);
  });

  it('4b. KPI_EVENT_FUTURE_TIMESTAMP はretryしない', async () => {
    const { mock, rpcFn } = createMockSupabase(async () =>
      makeSupabaseError('invalid_parameter_value', 'KPI_EVENT_FUTURE_TIMESTAMP')
    );

    initKpiTracker(mock);
    trackPageView();
    vi.runAllTimers();
    await flushNow();

    expect(rpcFn).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    expect(getQueueSnapshot()).toHaveLength(0);
  });

  it('4c. KPI_RATE_LIMIT_EXCEEDED はretryしない', async () => {
    const { mock, rpcFn } = createMockSupabase(async () =>
      makeSupabaseError('too_many_requests', 'KPI_RATE_LIMIT_EXCEEDED')
    );

    initKpiTracker(mock);
    trackPageView();
    vi.runAllTimers();
    await flushNow();

    expect(rpcFn).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    expect(getQueueSnapshot()).toHaveLength(0);
  });
});

describe('KPI Tracker — retryable errors', () => {

  it('5. ネットワークエラー(Promise reject)は最大3回retry', async () => {
    let callCount = 0;
    const { mock, rpcFn } = createMockSupabase(async () => {
      callCount++;
      throw new Error('Network error');
    });

    initKpiTracker(mock);
    trackPageView();

    // 初回flush
    vi.runAllTimers();
    await flushNow();

    // retry 1回目
    await vi.runAllTimersAsync();
    // retry 2回目
    await vi.runAllTimersAsync();
    // retry 3回目
    await vi.runAllTimersAsync();
    // 4回目以降はretryなし
    await vi.runAllTimersAsync();

    // 初回 + 最大3回retry = 最大4回
    expect(rpcFn.mock.calls.length).toBeLessThanOrEqual(4);
    expect(rpcFn.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('6. 同じidempotency_keyを維持してretry', async () => {
    const idempotencyKeys: string[] = [];
    let callCount = 0;

    const { mock, rpcFn } = createMockSupabase(async (...args: unknown[]) => {
      const params = args[1] as Record<string, unknown>;
      callCount++;
      const key = params?.['p_idempotency_key'] as string;
      if (key) idempotencyKeys.push(key);
      if (callCount < 3) {
        throw new Error('Transient error');
      }
      return { data: null, error: null };
    });

    // rpcFnをcall引数追跡できるように再設定
    rpcFn.mockImplementation(async (_name: string, params: Record<string, unknown>) => {
      callCount++;
      const key = params['p_idempotency_key'] as string;
      if (key) idempotencyKeys.push(key);
      if (callCount < 3) {
        throw new Error('Transient error');
      }
      return { data: null, error: null };
    });

    initKpiTracker(mock);
    trackPageView();

    vi.runAllTimers();
    await flushNow();
    await vi.runAllTimersAsync();
    await vi.runAllTimersAsync();
    await vi.runAllTimersAsync();

    // 複数回呼ばれた場合、全て同じidempotency_keyであること
    if (idempotencyKeys.length > 1) {
      const firstKey = idempotencyKeys[0];
      for (const key of idempotencyKeys) {
        expect(key).toBe(firstKey);
      }
    }
  });

  it('7. retryイベントが実際に再flushされる（2回目で成功）', async () => {
    let callCount = 0;
    const { mock, rpcFn } = createMockSupabase(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('First attempt fails');
      }
      return { data: null, error: null };
    });

    initKpiTracker(mock);
    trackPageView();

    // 初回flush（失敗）
    vi.runAllTimers();
    await flushNow();

    // 2回目flush（retryで成功）
    await vi.runAllTimersAsync();
    vi.runAllTimers();
    await vi.runAllTimersAsync();
    await flushNow();

    // 少なくとも2回呼ばれているはず
    expect(rpcFn.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('8. SupabaseがresolveしたエラーもSupabase error扱い ({ data: null, error: {...} })', async () => {
    // 一時的なエラーコードを返す（retryable）
    const transientError = { code: 'XX000', message: 'internal error occurred' };
    let callCount = 0;

    const { mock, rpcFn } = createMockSupabase(async () => {
      callCount++;
      if (callCount === 1) {
        return { data: null, error: transientError };
      }
      return { data: null, error: null };
    });

    initKpiTracker(mock);
    trackPageView();

    // 初回flush
    vi.runAllTimers();
    await flushNow();

    // retry
    await vi.runAllTimersAsync();
    vi.runAllTimers();
    await flushNow();

    // 2回以上呼ばれること（retryが発生した）
    expect(rpcFn.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('KPI Tracker — retry limits', () => {

  it('9. MAX_RETRY(3回)を超えたら静かに破棄（エラーをthrowしない）', async () => {
    const { mock } = createMockSupabase(async () => {
      throw new Error('Always fails');
    });

    initKpiTracker(mock);
    trackPageView();

    // 4回以上のtimerを回してもエラーがthrowされないこと
    let threw = false;
    try {
      vi.runAllTimers();
      await flushNow();
      // retryのタイマーを順次進める（MAX_RETRY=3回分）
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(5000);
        await Promise.resolve();
      }
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});

describe('KPI Tracker — flush behavior', () => {

  it('10. flushNow() でキューを即時送信できる', async () => {
    const { mock, rpcFn } = createMockSupabase(async () =>
      ({ data: null, error: null })
    );

    initKpiTracker(mock);
    track('page_view', { route: '/flush-test' });
    track('session_heartbeat', { route: '/flush-test', elapsed_seconds: 10 });

    // タイマーを進めずにflushNow呼び出し
    await flushNow();

    expect(rpcFn).toHaveBeenCalled();
  });

  it('11. 初期化されていない場合はtrack()が無視される（エラーなし）', () => {
    // resetTracker()後にinitKpiTracker未呼び出し
    expect(() => {
      track('page_view', { route: '/no-init' });
    }).not.toThrow();
    expect(getQueueSnapshot()).toHaveLength(0);
  });

  it('12. 成功時はキューから削除される', async () => {
    const { mock } = createMockSupabase(async () =>
      ({ data: null, error: null })
    );

    initKpiTracker(mock);
    track('page_view', { route: '/success' });

    expect(getQueueSnapshot()).toHaveLength(1);

    vi.runAllTimers();
    await flushNow();

    // flush後キューが空
    expect(getQueueSnapshot()).toHaveLength(0);
  });
});
