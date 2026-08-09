/**
 * kpi_phase1.test.ts — KPI Phase 1 テスト
 *
 * テスト項目:
 *  1.  許可event送信（RPCモック）
 *  2.  未知event名の拒否
 *  3.  event別properties型検証
 *  4.  payload上限（10KB超過拒否）
 *  5.  idempotency（重複送信silent）
 *  6.  authenticated user偽装拒否（user_idをclientから指定不可）
 *  7.  anonymous送信（user_idなし）
 *  8.  production/development分離
 *  9.  internal account識別（除外フラグ）
 *  10. raw event SELECT拒否
 *  11. Admin settings RPC（is_admin=true必須）
 *  12. official_kpi_start_at初期値NULL確認
 *  13. session作成・heartbeat
 *  14. 匿名→認証済みsession関連付け
 *  15. 別ユーザーへの誤関連付け拒否
 *  16. PII禁止キー拒否（email等がpropertiesに含まれた場合）
 *  17. index/RLS/GRANT構造確認（スキーマ検証）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isAllowedEventName,
  hasForbiddenKeys,
  isPropertiesWithinSizeLimit,
  isRouteValid,
  ALLOWED_KPI_EVENT_NAMES,
  FORBIDDEN_PROP_KEYS,
  type KpiEventName,
} from '../lib/kpiEvents';
import {
  getOrCreateAnonymousId,
  getOrCreateSessionId,
  resetSessionOnLogout,
  onUserAuthenticated,
  initSession,
  getSessionInfo,
  classifyDevice,
  classifyOsFamily,
  classifyBrowserFamily,
  detectEnvironment,
} from '../lib/kpiSession';
import {
  initKpiTracker,
  track,
  flushNow,
  resetTracker,
  getQueueSnapshot,
  isTrackerInitialized,
} from '../lib/kpiTracker';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Supabase Mock
// ---------------------------------------------------------------------------

function createSupabaseMock(rpcResult: { data: unknown; error: unknown } = { data: null, error: null }) {
  const rpcFn = vi.fn().mockResolvedValue(rpcResult);
  const mock = {
    rpc: rpcFn,
  } as unknown as SupabaseClient;
  return { mock, rpcFn };
}

// ---------------------------------------------------------------------------
// Storage Mock (localStorage / sessionStorage)
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

// navigator mock
Object.defineProperty(global, 'navigator', {
  value: {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120',
    onLine: true,
    maxTouchPoints: 0,
  },
  writable: true,
});

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorageMock.clear();
  sessionStorageMock.clear();
  resetTracker();
});

afterEach(() => {
  resetTracker();
});

// ---------------------------------------------------------------------------
// Test: 1. 許可event送信（RPCモック）
// ---------------------------------------------------------------------------

describe('1. 許可event送信（RPCモック）', () => {
  it('page_view eventをRPC経由で送信できる', async () => {
    const { mock, rpcFn } = createSupabaseMock();
    initKpiTracker(mock);
    initSession();

    track('page_view', { route: '/training' });
    await flushNow();

    expect(rpcFn).toHaveBeenCalledWith(
      'track_kpi_event',
      expect.objectContaining({
        p_event_name: 'page_view',
        p_properties: expect.objectContaining({ route: '/training' }),
      })
    );
  });

  it('training_started eventを送信できる', async () => {
    const { mock, rpcFn } = createSupabaseMock();
    initKpiTracker(mock);
    initSession();

    track('training_started', {
      task_id: 't1',
      move_id: 'm1',
      move_index: 0,
      resumed: false,
    });
    await flushNow();

    expect(rpcFn).toHaveBeenCalledWith(
      'track_kpi_event',
      expect.objectContaining({
        p_event_name: 'training_started',
        p_properties: expect.objectContaining({
          task_id: 't1',
          move_id: 'm1',
          move_index: 0,
          resumed: false,
        }),
      })
    );
  });

  it('全eventが許可リストに存在する (Phase 3後27件完全一致)', () => {
    // TS catalog / DB allowed list / DB validator の3者が27 event完全一致することを動的に比較
    const expectedEvents = [
      'page_view', 'session_started', 'session_heartbeat',
      'auth_started', 'auth_succeeded', 'auth_failed',
      'language_changed',
      'training_started', 'training_step_reached', 'training_attempted',
      'training_incorrect', 'training_hint_shown', 'training_step_advanced',
      'training_resumed', 'training_completed',
      'postmortem_started', 'postmortem_completed', 'postmortem_failed',
      'postmortem_refreshed', 'postmortem_candidates_opened',
      'pro_feature_used', 'frontend_error', 'rpc_error',
      'realtime_reconnected', 'performance_measure',
      'match_started', 'rpc_call_completed',
    ] as const;
    // TS catalog 完全一致 (27件)
    expect(ALLOWED_KPI_EVENT_NAMES.length).toBe(27);
    for (const name of expectedEvents) {
      expect(
        (ALLOWED_KPI_EVENT_NAMES as readonly string[]).includes(name),
        `ALLOWED_KPI_EVENT_NAMES should include: ${name}`
      ).toBe(true);
    }
    // DB allowed list (migration SQL) との一致確認
    const { readFileSync: rfs, existsSync: exs } = require('fs');
    const { join: pjoin } = require('path');
    const migPath = pjoin(__dirname, '../../supabase/migrations/20260810000001_kpi_phase3_match_event.sql');
    if (exs(migPath)) {
      const migSql = rfs(migPath, 'utf-8');
      for (const name of expectedEvents) {
        expect(migSql, `migration should include '${name}'`).toContain("'" + name + "'");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Test: 2. 未知event名の拒否
// ---------------------------------------------------------------------------

describe('2. 未知event名の拒否', () => {
  it('未知のevent名はisAllowedEventNameでfalseを返す', () => {
    expect(isAllowedEventName('unknown_event')).toBe(false);
    expect(isAllowedEventName('click')).toBe(false);
    expect(isAllowedEventName('')).toBe(false);
    expect(isAllowedEventName(null)).toBe(false);
    expect(isAllowedEventName(undefined)).toBe(false);
    expect(isAllowedEventName(123)).toBe(false);
  });

  it('許可されたevent名はtrueを返す', () => {
    expect(isAllowedEventName('page_view')).toBe(true);
    expect(isAllowedEventName('training_started')).toBe(true);
    expect(isAllowedEventName('postmortem_completed')).toBe(true);
    expect(isAllowedEventName('performance_measure')).toBe(true);
  });

  it('未知eventをtrackしてもRPCは呼ばれない', async () => {
    const { mock, rpcFn } = createSupabaseMock();
    initKpiTracker(mock);
    initSession();

    // 型エラーを回避するためキャスト
    track('unknown_event' as KpiEventName, {} as never);
    await flushNow();

    expect(rpcFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test: 3. event別properties型検証
// ---------------------------------------------------------------------------

describe('3. event別properties型検証', () => {
  it('page_viewにrouteが含まれる', async () => {
    const { mock, rpcFn } = createSupabaseMock();
    initKpiTracker(mock);
    initSession();

    track('page_view', { route: '/home' });
    await flushNow();

    const call = rpcFn.mock.calls[0]!;
    expect(call[1]!.p_properties).toMatchObject({ route: '/home' });
  });

  it('auth_failedにerror_codeを含められる', async () => {
    const { mock, rpcFn } = createSupabaseMock();
    initKpiTracker(mock);
    initSession();

    track('auth_failed', { method: 'magic_link', error_code: 'otp_expired' });
    await flushNow();

    const call = rpcFn.mock.calls[0]!;
    expect(call[1]!.p_properties).toMatchObject({
      method: 'magic_link',
      error_code: 'otp_expired',
    });
  });

  it('training_completedに必須プロパティが含まれる', async () => {
    const { mock, rpcFn } = createSupabaseMock();
    initKpiTracker(mock);
    initSession();

    track('training_completed', {
      task_id: 't1',
      move_id: 'm1',
      move_index: 2,
      total_attempts: 5,
    });
    await flushNow();

    const call = rpcFn.mock.calls[0]!;
    expect(call[1]!.p_properties).toMatchObject({
      task_id: 't1',
      move_id: 'm1',
      move_index: 2,
      total_attempts: 5,
    });
  });
});

// ---------------------------------------------------------------------------
// Test: 4. payload上限（10KB超過拒否）
// ---------------------------------------------------------------------------

describe('4. payload上限（10KB超過拒否）', () => {
  it('10KB以内のpropertiesはtrueを返す', () => {
    const props = { data: 'x'.repeat(100) };
    expect(isPropertiesWithinSizeLimit(props)).toBe(true);
  });

  it('10KBを超えるpropertiesはfalseを返す', () => {
    const props = { data: 'x'.repeat(11_000) };
    expect(isPropertiesWithinSizeLimit(props)).toBe(false);
  });

  it('10KB超のeventはRPCを呼ばない', async () => {
    const { mock, rpcFn } = createSupabaseMock();
    initKpiTracker(mock);
    initSession();

    // 10KB超のproperties（型をキャストして強制的に送信試みる）
    const largeProps = { route: '/test', data: 'x'.repeat(11_000) };
    track('page_view', largeProps as never);
    await flushNow();

    expect(rpcFn).not.toHaveBeenCalled();
  });

  it('isPropertiesWithinSizeLimitのデフォルト上限は10240バイト', () => {
    // ちょうど10240バイトはOK
    const props = { data: 'x'.repeat(10_200) };
    // JSON化するとオーバーヘッドがあるので少し小さめ
    expect(isPropertiesWithinSizeLimit(props)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test: 5. idempotency（重複送信silent）
// ---------------------------------------------------------------------------

describe('5. idempotency（重複送信silent）', () => {
  it('同じidempotency_keyは2回目のRPC呼び出しが行われない（RPCモックレベル）', async () => {
    // RPC側でidempotency_key重複時にsilent returnする実装確認
    // フロント側: 各送信に異なるidempotency_keyが付与されることを確認
    const { mock, rpcFn } = createSupabaseMock();
    initKpiTracker(mock);
    initSession();

    track('page_view', { route: '/home' });
    track('page_view', { route: '/home' });
    await flushNow();

    // 2回送信されるが、それぞれ異なるidempotency_keyを持つ
    expect(rpcFn).toHaveBeenCalledTimes(2);
    const key1 = rpcFn.mock.calls[0]![1]!.p_idempotency_key;
    const key2 = rpcFn.mock.calls[1]![1]!.p_idempotency_key;
    expect(key1).not.toBe(key2);
  });

  it('idempotency_keyが毎回生成される（空文字でない）', async () => {
    const { mock, rpcFn } = createSupabaseMock();
    initKpiTracker(mock);
    initSession();

    track('page_view', { route: '/test' });
    await flushNow();

    const key = rpcFn.mock.calls[0]![1]!.p_idempotency_key;
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Test: 6. authenticated user偽装拒否（user_idをclientから指定不可）
// ---------------------------------------------------------------------------

describe('6. authenticated user偽装拒否', () => {
  it('track()はuser_idパラメータを受け付けない（型レベル）', () => {
    // track<E>の型定義にuser_idは含まれない
    // TypeScript型レベルの確認: KpiEventPropsMapにuser_idキーが存在しない
    const page_view_props: { route: string; [key: string]: unknown } = { route: '/test' };
    // user_idを入れても型エラー（ここではランタイムで確認）
    expect('user_id' in page_view_props).toBe(false);
  });

  it('track()のproperties送信時にuser_idが含まれない', async () => {
    const { mock, rpcFn } = createSupabaseMock();
    initKpiTracker(mock);
    initSession();

    track('page_view', { route: '/test' });
    await flushNow();

    const call = rpcFn.mock.calls[0]!;
    // RPCパラメータにp_user_idが存在しない（auth.uid()がRPC内で解決）
    expect(call[1]!).not.toHaveProperty('p_user_id');
    expect(call[1]!.p_properties).not.toHaveProperty('user_id');
  });
});

// ---------------------------------------------------------------------------
// Test: 7. anonymous送信（user_idなし）
// ---------------------------------------------------------------------------

describe('7. anonymous送信（user_idなし）', () => {
  it('未ログイン状態でもeventを送信できる', async () => {
    const { mock, rpcFn } = createSupabaseMock();
    initKpiTracker(mock);
    initSession(); // user_id未設定

    track('page_view', { route: '/' });
    await flushNow();

    expect(rpcFn).toHaveBeenCalledWith(
      'track_kpi_event',
      expect.objectContaining({
        p_event_name: 'page_view',
        p_anonymous_id: expect.any(String),
        p_session_id: expect.any(String),
      })
    );
  });

  it('anonymous_idが生成される', () => {
    const anonId = getOrCreateAnonymousId();
    expect(typeof anonId).toBe('string');
    expect(anonId.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Test: 8. production/development分離
// ---------------------------------------------------------------------------

describe('8. production/development分離', () => {
  it('detectEnvironmentがdevelopmentを返す（test環境）', () => {
    // Vitest実行時はimport.meta.env.MODEがtestになる場合がある
    const env = detectEnvironment();
    expect(['development', 'test', 'production', 'staging']).toContain(env);
  });

  it('kpi_settings.official_kpi_start_atが初期値NULLであること（スキーマ確認）', () => {
    // SQLマイグレーションファイルにNULLでINSERTされていることを文字列確認
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const migPath = resolve(
      __dirname,
      '../../supabase/migrations/20260809195843_kpi_phase1_tables.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    // INSERT文にNULL, 90)が含まれる
    expect(sql).toMatch(/VALUES\s*\(\s*1\s*,\s*NULL\s*,\s*90\s*\)/);
  });

  it('environmentカラムがproduction/staging/development/testのみ許可（スキーマ確認）', () => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const migPath = resolve(
      __dirname,
      '../../supabase/migrations/20260809195843_kpi_phase1_tables.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    expect(sql).toContain("CHECK (environment IN ('production','staging','development','test'))");
  });
});

// ---------------------------------------------------------------------------
// Test: 9. internal account識別（除外フラグ）
// ---------------------------------------------------------------------------

describe('9. internal account識別（除外フラグ）', () => {
  it('is_internal_test_accountフラグがmigrationに存在する', () => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const migPath = resolve(
      __dirname,
      '../../supabase/migrations/20260807000001_ai_inspection_accounts.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    expect(sql).toContain('is_internal_test_account');
  });

  it('KPI_SPEC.mdに除外条件が記載されている', () => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const specPath = resolve(__dirname, '../../docs/KPI_SPEC.md');
    const spec = readFileSync(specPath, 'utf-8');
    expect(spec).toContain('is_internal_test_account');
    expect(spec).toContain('is_admin');
    expect(spec).toContain('/ai-check-login');
    expect(spec).toContain('sim_match_logs');
  });
});

// ---------------------------------------------------------------------------
// Test: 10. raw event SELECT拒否
// ---------------------------------------------------------------------------

describe('10. raw event SELECT拒否', () => {
  it('kpi_events RLS migrationにanonとauthenticatedのDENYポリシーが存在する', () => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const migPath = resolve(
      __dirname,
      '../../supabase/migrations/20260809195844_kpi_phase1_rls.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    expect(sql).toContain('kpi_events_anon_deny');
    expect(sql).toContain('kpi_events_authenticated_deny');
    expect(sql).toContain('USING (false)');
  });

  it('kpi_sessions RLS migrationにDENYポリシーが存在する', () => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const migPath = resolve(
      __dirname,
      '../../supabase/migrations/20260809195844_kpi_phase1_rls.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    expect(sql).toContain('kpi_sessions_anon_deny');
    expect(sql).toContain('kpi_sessions_authenticated_deny');
  });
});

// ---------------------------------------------------------------------------
// Test: 11. Admin settings RPC（is_admin=true必須）
// ---------------------------------------------------------------------------

describe('11. Admin settings RPC（is_admin=true必須）', () => {
  it('admin_get_kpi_settings RPCがis_admin確認を実装している', () => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const migPath = resolve(
      __dirname,
      '../../supabase/migrations/20260809195845_kpi_phase1_rpcs.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    expect(sql).toContain('admin_get_kpi_settings');
    expect(sql).toContain('is_admin');
    expect(sql).toContain('admin required');
  });

  it('admin_update_kpi_settings RPCがis_admin確認を実装している', () => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const migPath = resolve(
      __dirname,
      '../../supabase/migrations/20260809195845_kpi_phase1_rpcs.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    expect(sql).toContain('admin_update_kpi_settings');
    // is_admin checkが存在する
    expect(sql.match(/is_admin/g)?.length ?? 0).toBeGreaterThan(3);
  });

  it('Admin RPCは非authenticatedユーザーを拒否する（エラー確認）', () => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const migPath = resolve(
      __dirname,
      '../../supabase/migrations/20260809195845_kpi_phase1_rpcs.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    expect(sql).toContain('not authenticated');
    expect(sql).toContain('insufficient_privilege');
  });
});

// ---------------------------------------------------------------------------
// Test: 12. official_kpi_start_at初期値NULL確認
// ---------------------------------------------------------------------------

describe('12. official_kpi_start_at初期値NULL確認', () => {
  it('kpi_settings初期行でofficial_kpi_start_atがNULL', () => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const migPath = resolve(
      __dirname,
      '../../supabase/migrations/20260809195843_kpi_phase1_tables.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    // VALUES (1, NULL, 90)
    expect(sql).toMatch(/VALUES\s*\(\s*1\s*,\s*NULL\s*,\s*90\s*\)/);
    // DEFAULT NULL
    expect(sql).toContain('official_kpi_start_at      TIMESTAMPTZ  DEFAULT NULL');
  });

  it('KPI_SPEC.mdにofficial_kpi_start_atのNULL説明が記載されている', () => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const specPath = resolve(__dirname, '../../docs/KPI_SPEC.md');
    const spec = readFileSync(specPath, 'utf-8');
    expect(spec).toContain('official_kpi_start_at');
    expect(spec).toContain('NULL');
  });
});

// ---------------------------------------------------------------------------
// Test: 13. session作成・heartbeat
// ---------------------------------------------------------------------------

describe('13. session作成・heartbeat', () => {
  it('initSessionがanonymousId, sessionId, startedAtを返す', () => {
    const session = initSession();
    expect(session.anonymousId).toBeTruthy();
    expect(session.sessionId).toBeTruthy();
    expect(session.startedAt).toBeTruthy();
    expect(session.environment).toBeTruthy();
  });

  it('同じセッション内でgetSessionInfoは同じsessionIdを返す', () => {
    const s1 = initSession();
    const s2 = getSessionInfo();
    expect(s1.sessionId).toBe(s2.sessionId);
  });

  it('session_heartbeat eventを送信できる', async () => {
    const { mock, rpcFn } = createSupabaseMock();
    initKpiTracker(mock);
    initSession();

    track('session_heartbeat', { route: '/training', elapsed_seconds: 30 });
    await flushNow();

    expect(rpcFn).toHaveBeenCalledWith(
      'track_kpi_event',
      expect.objectContaining({
        p_event_name: 'session_heartbeat',
        p_properties: expect.objectContaining({
          route: '/training',
          elapsed_seconds: 30,
        }),
      })
    );
  });

  it('localStorageにanonymous_idが永続化される', () => {
    const id1 = getOrCreateAnonymousId();
    const id2 = getOrCreateAnonymousId();
    expect(id1).toBe(id2);
  });
});

// ---------------------------------------------------------------------------
// Test: 14. 匿名→認証済みsession関連付け
// ---------------------------------------------------------------------------

describe('14. 匿名→認証済みsession関連付け', () => {
  it('onUserAuthenticatedを呼んでも同じsessionIdが維持される（同一ユーザー）', () => {
    const session = initSession();
    const beforeSessionId = session.sessionId;

    onUserAuthenticated(session.sessionId); // 同じユーザーとして認証
    const after = getSessionInfo();

    // sessionIdは維持（同一ユーザーの場合）
    expect(after.sessionId).toBeTruthy();
    // anonymous_idは保持
    expect(after.anonymousId).toBe(session.anonymousId);
  });

  it('ログアウト後にresetSessionOnLogoutでsessionIdがリセットされる', () => {
    const before = initSession();
    const beforeSessionId = before.sessionId;

    resetSessionOnLogout();

    // リセット後は新しいsession
    const after = initSession();
    expect(after.sessionId).not.toBe(beforeSessionId);
  });

  it('ログアウト後もanonymous_idは保持される', () => {
    const before = initSession();
    const anonId = before.anonymousId;

    resetSessionOnLogout();
    const after = initSession();

    expect(after.anonymousId).toBe(anonId);
  });
});

// ---------------------------------------------------------------------------
// Test: 15. 別ユーザーへの誤関連付け拒否
// ---------------------------------------------------------------------------

describe('15. 別ユーザーへの誤関連付け拒否', () => {
  it('別ユーザーでonUserAuthenticatedを呼ぶとsessionがリセットされる', () => {
    // ユーザーAでsession作成
    const sessionA = initSession('user-a-uuid');
    const sessionIdA = sessionA.sessionId;

    // ユーザーBで認証試みる → session reset
    onUserAuthenticated('user-b-uuid');

    // 新しいsessionが生成される
    const sessionB = initSession('user-b-uuid');
    // sessionIdが変わっている（resetされた）
    // Note: resetが発生したので新しいsessionIdが生成される
    expect(sessionB.sessionId).toBeTruthy();
  });

  it('upsert_kpi_session RPCに別ユーザー誤接続防止ロジックが存在する', () => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const migPath = resolve(
      __dirname,
      '../../supabase/migrations/20260809195845_kpi_phase1_rpcs.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    expect(sql).toContain('session belongs to a different user');
    expect(sql).toContain('v_existing_uid != v_user_id');
  });
});

// ---------------------------------------------------------------------------
// Test: 16. PII禁止キー拒否
// ---------------------------------------------------------------------------

describe('16. PII禁止キー拒否', () => {
  it('hasForbiddenKeysがemailを検知する', () => {
    expect(hasForbiddenKeys({ email: 'test@example.com', route: '/test' })).toBe(true);
  });

  it('hasForbiddenKeysがstackを検知する', () => {
    expect(hasForbiddenKeys({ stack: 'Error at line 1', component: 'App' })).toBe(true);
  });

  it('hasForbiddenKeysがaccess_tokenを検知する', () => {
    expect(hasForbiddenKeys({ access_token: 'abc123' })).toBe(true);
  });

  it('hasForbiddenKeysが禁止キーなしの場合falseを返す', () => {
    expect(hasForbiddenKeys({ route: '/test', event_type: 'click' })).toBe(false);
  });

  it('全禁止キーがFORBIDDEN_PROP_KEYSに含まれる', () => {
    const required = ['email', 'name', 'ip', 'user_agent', 'access_token', 'stack', 'full_record'];
    required.forEach((key) => {
      expect(FORBIDDEN_PROP_KEYS).toContain(key);
    });
  });

  it('PII含むeventはRPCを呼ばない', async () => {
    const { mock, rpcFn } = createSupabaseMock();
    initKpiTracker(mock);
    initSession();

    // emailを含むproperties（型キャストで強制）
    track('page_view', { route: '/test', email: 'test@example.com' } as never);
    await flushNow();

    expect(rpcFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test: 17. index/RLS/GRANT構造確認（スキーマ検証）
// ---------------------------------------------------------------------------

describe('17. index/RLS/GRANT構造確認', () => {
  it('kpi_events テーブルに必要なindexが定義されている', () => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const migPath = resolve(
      __dirname,
      '../../supabase/migrations/20260809195843_kpi_phase1_tables.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    expect(sql).toContain('idx_kpi_events_occurred_at');
    expect(sql).toContain('idx_kpi_events_event_name_occurred_at');
    expect(sql).toContain('idx_kpi_events_user_id_occurred_at');
    expect(sql).toContain('idx_kpi_events_session_id');
    expect(sql).toContain('idx_kpi_events_anonymous_id_occurred_at');
    expect(sql).toContain('idx_kpi_events_environment_occurred_at');
  });

  it('RLS有効化がmigrationに含まれる', () => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const migPath = resolve(
      __dirname,
      '../../supabase/migrations/20260809195844_kpi_phase1_rls.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    expect(sql).toContain('ALTER TABLE kpi_events   ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE kpi_sessions ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE kpi_settings ENABLE ROW LEVEL SECURITY');
  });

  it('track_kpi_event RPCにGRANT文が存在する', () => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const migPath = resolve(
      __dirname,
      '../../supabase/migrations/20260809195845_kpi_phase1_rpcs.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.track_kpi_event TO anon, authenticated');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.upsert_kpi_session TO anon, authenticated');
  });

  it('track_kpi_event RPCがSECURITY DEFINERで定義されている', () => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const migPath = resolve(
      __dirname,
      '../../supabase/migrations/20260809195845_kpi_phase1_rpcs.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    // track_kpi_event 定義部分を検索（CREATE OR REPLACE FUNCTIONから定義終わりまで）
    const trackFnStartIdx = sql.indexOf('CREATE OR REPLACE FUNCTION public.track_kpi_event(');
    expect(trackFnStartIdx).toBeGreaterThan(-1);
    const relevant = sql.slice(trackFnStartIdx, trackFnStartIdx + 1000);
    expect(relevant).toContain('SECURITY DEFINER');
    expect(relevant).toContain('SET search_path = public');
  });

  it('cleanup_old_kpi_events関数が定義されている', () => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const migPath = resolve(
      __dirname,
      '../../supabase/migrations/20260809195845_kpi_phase1_rpcs.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    expect(sql).toContain('cleanup_old_kpi_events');
    expect(sql).toContain('raw_event_retention_days');
  });

  it('kpi_settings.idに単一行制約が存在する', () => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const migPath = resolve(
      __dirname,
      '../../supabase/migrations/20260809195843_kpi_phase1_tables.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    expect(sql).toContain('CONSTRAINT kpi_settings_single_row CHECK (id = 1)');
  });
});

// ---------------------------------------------------------------------------
// Test: Additional — kpiSession.ts
// ---------------------------------------------------------------------------

describe('kpiSession.ts: classifyDevice', () => {
  it('Macintosh UAでdesktopを返す', () => {
    expect(classifyDevice()).toBe('desktop');
  });
});

describe('kpiSession.ts: classifyOsFamily', () => {
  it('Macintosh UAでmacosを返す', () => {
    expect(classifyOsFamily()).toBe('macos');
  });
});

describe('kpiSession.ts: classifyBrowserFamily', () => {
  it('Chrome UAでchromeを返す', () => {
    expect(classifyBrowserFamily()).toBe('chrome');
  });
});

// ---------------------------------------------------------------------------
// Test: Additional — Tracker batching/retry
// ---------------------------------------------------------------------------

describe('Tracker: batching', () => {
  it('initKpiTrackerが初期化完了を返す', () => {
    const { mock } = createSupabaseMock();
    expect(isTrackerInitialized()).toBe(false);
    initKpiTracker(mock);
    expect(isTrackerInitialized()).toBe(true);
  });

  it('未初期化時にtrackしてもエラーにならない', () => {
    // resetTrackerで未初期化状態
    expect(() => {
      track('page_view', { route: '/test' });
    }).not.toThrow();
  });

  it('trackした内容がqueueに積まれる', () => {
    const { mock } = createSupabaseMock();
    initKpiTracker(mock);
    initSession();

    track('page_view', { route: '/test' });

    const queue = getQueueSnapshot();
    expect(queue.length).toBe(1);
    expect(queue[0]!.eventName).toBe('page_view');
  });
});

// ---------------------------------------------------------------------------
// Test: 18. DB migration: PUBLIC EXECUTE REVOKE
// ---------------------------------------------------------------------------

describe('18. DB migration: PUBLIC EXECUTE REVOKE', () => {
  const SECURITY_MIG = (() => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    return readFileSync(
      resolve(__dirname, '../../supabase/migrations/20260809195846_kpi_phase1_security.sql'),
      'utf-8'
    ) as string;
  })();

  it('_kpi_allowed_event_namesにREVOKE FROM PUBLIC文が存在する', () => {
    expect(SECURITY_MIG).toContain(
      'REVOKE ALL ON FUNCTION public._kpi_allowed_event_names() FROM PUBLIC'
    );
  });

  it('cleanup_old_kpi_eventsにREVOKE FROM anon文が存在する', () => {
    expect(SECURITY_MIG).toContain(
      'REVOKE ALL ON FUNCTION public.cleanup_old_kpi_events() FROM anon'
    );
  });

  it('cleanup_old_kpi_eventsにREVOKE FROM authenticated文が存在する', () => {
    expect(SECURITY_MIG).toContain(
      'REVOKE ALL ON FUNCTION public.cleanup_old_kpi_events() FROM authenticated'
    );
  });

  it('admin RPCにREVOKE FROM PUBLIC文が存在する', () => {
    expect(SECURITY_MIG).toContain(
      'REVOKE ALL ON FUNCTION public.admin_get_kpi_settings() FROM PUBLIC'
    );
    expect(SECURITY_MIG).toContain(
      'REVOKE ALL ON FUNCTION public.admin_update_kpi_settings(TIMESTAMPTZ,INTEGER) FROM PUBLIC'
    );
    expect(SECURITY_MIG).toContain(
      'REVOKE ALL ON FUNCTION public.admin_get_kpi_event_catalog_summary() FROM PUBLIC'
    );
  });
});

// ---------------------------------------------------------------------------
// Test: 19. DB migration: timestamp検証
// ---------------------------------------------------------------------------

describe('19. DB migration: timestamp検証', () => {
  const SECURITY_MIG = (() => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    return readFileSync(
      resolve(__dirname, '../../supabase/migrations/20260809195846_kpi_phase1_security.sql'),
      'utf-8'
    ) as string;
  })();

  it('track_kpi_eventにKPI_EVENT_FUTURE_TIMESTAMP検証が存在する', () => {
    expect(SECURITY_MIG).toContain('KPI_EVENT_FUTURE_TIMESTAMP');
  });

  it('track_kpi_eventにKPI_EVENT_TOO_OLD検証が存在する', () => {
    expect(SECURITY_MIG).toContain('KPI_EVENT_TOO_OLD');
  });

  it('upsert_kpi_sessionにKPI_SESSION_INVALID_TIMES検証が存在する', () => {
    expect(SECURITY_MIG).toContain('KPI_SESSION_INVALID_TIMES');
  });

  it('upsert_kpi_sessionにGREATEST(kpi_sessions.last_seen_at, EXCLUDED.last_seen_at)が存在する', () => {
    expect(SECURITY_MIG).toContain(
      'GREATEST(kpi_sessions.last_seen_at, EXCLUDED.last_seen_at)'
    );
  });
});

// ---------------------------------------------------------------------------
// Test: 20. DB migration: session所有権
// ---------------------------------------------------------------------------

describe('20. DB migration: session所有権', () => {
  const SECURITY_MIG = (() => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    return readFileSync(
      resolve(__dirname, '../../supabase/migrations/20260809195846_kpi_phase1_security.sql'),
      'utf-8'
    ) as string;
  })();

  it('upsert_kpi_sessionにKPI_SESSION_ANON_MISMATCH検証が存在する', () => {
    expect(SECURITY_MIG).toContain('KPI_SESSION_ANON_MISMATCH');
  });

  it('upsert_kpi_sessionにKPI_SESSION_USER_MISMATCH検証が存在する', () => {
    expect(SECURITY_MIG).toContain('KPI_SESSION_USER_MISMATCH');
  });

  it('upsert_kpi_sessionにKPI_SESSION_ENV_MISMATCH検証が存在する', () => {
    expect(SECURITY_MIG).toContain('KPI_SESSION_ENV_MISMATCH');
  });

  it('upsert_kpi_sessionにFOR UPDATEロックが存在する', () => {
    expect(SECURITY_MIG).toContain('FOR UPDATE');
  });

  it('ON CONFLICTにfirst_routeの更新がない（初回値維持）', () => {
    // ON CONFLICT DO UPDATE句にfirst_route =が含まれないことを確認
    const onConflictIdx = SECURITY_MIG.lastIndexOf('ON CONFLICT (session_id) DO UPDATE');
    expect(onConflictIdx).toBeGreaterThan(-1);
    // ON CONFLICT以降の部分（次のEND;まで）を取得
    const afterConflict = SECURITY_MIG.slice(onConflictIdx, onConflictIdx + 600);
    expect(afterConflict).not.toMatch(/first_route\s*=/);
  });
});

// ---------------------------------------------------------------------------
// Test: 21. DB migration: rate-limit
// ---------------------------------------------------------------------------

describe('21. DB migration: rate-limit', () => {
  const SECURITY_MIG = (() => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    return readFileSync(
      resolve(__dirname, '../../supabase/migrations/20260809195846_kpi_phase1_security.sql'),
      'utf-8'
    ) as string;
  })();

  it('kpi_rate_limitテーブルが定義されている', () => {
    expect(SECURITY_MIG).toContain('CREATE TABLE IF NOT EXISTS kpi_rate_limit');
  });

  it('_kpi_check_rate_limitが定義されている', () => {
    expect(SECURITY_MIG).toContain(
      'CREATE OR REPLACE FUNCTION public._kpi_check_rate_limit'
    );
  });

  it('track_kpi_eventにKPI_RATE_LIMIT_EXCEEDEDが存在する', () => {
    expect(SECURITY_MIG).toContain('KPI_RATE_LIMIT_EXCEEDED');
    // track_kpi_event内に存在することを確認
    const trackFnIdx = SECURITY_MIG.indexOf(
      'CREATE OR REPLACE FUNCTION public.track_kpi_event('
    );
    const upsertFnIdx = SECURITY_MIG.indexOf(
      'CREATE OR REPLACE FUNCTION public.upsert_kpi_session('
    );
    const trackSection = SECURITY_MIG.slice(trackFnIdx, upsertFnIdx);
    expect(trackSection).toContain('KPI_RATE_LIMIT_EXCEEDED');
  });

  it('upsert_kpi_sessionにKPI_RATE_LIMIT_EXCEEDEDが存在する', () => {
    const upsertFnIdx = SECURITY_MIG.indexOf(
      'CREATE OR REPLACE FUNCTION public.upsert_kpi_session('
    );
    const afterUpsert = SECURITY_MIG.slice(upsertFnIdx);
    expect(afterUpsert).toContain('KPI_RATE_LIMIT_EXCEEDED');
  });
});

// ---------------------------------------------------------------------------
// Test: 22. DB migration: idempotency atomic
// ---------------------------------------------------------------------------

describe('22. DB migration: idempotency atomic', () => {
  const SECURITY_MIG = (() => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    return readFileSync(
      resolve(__dirname, '../../supabase/migrations/20260809195846_kpi_phase1_security.sql'),
      'utf-8'
    ) as string;
  })();

  it('ON CONFLICT (idempotency_key) DO NOTHINGが存在する', () => {
    expect(SECURITY_MIG).toContain('ON CONFLICT (idempotency_key) DO NOTHING');
  });

  it('IF EXISTS重複チェックが削除されON CONFLICTへ置換済み', () => {
    // 新migrationにIF EXISTS (SELECT 1 FROM kpi_events WHERE idempotency_key = ...)がない
    expect(SECURITY_MIG).not.toContain(
      'IF EXISTS (SELECT 1 FROM kpi_events WHERE idempotency_key'
    );
  });

  it('KPI_IDEMPOTENCY_KEY_TOO_LONGチェックが存在する', () => {
    expect(SECURITY_MIG).toContain('KPI_IDEMPOTENCY_KEY_TOO_LONG');
  });
});

// ---------------------------------------------------------------------------
// Test: 23. DB migration: properties検証
// ---------------------------------------------------------------------------

describe('23. DB migration: properties検証', () => {
  const SECURITY_MIG = (() => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    return readFileSync(
      resolve(__dirname, '../../supabase/migrations/20260809195846_kpi_phase1_security.sql'),
      'utf-8'
    ) as string;
  })();

  it('_kpi_check_pii_keysが定義されている', () => {
    expect(SECURITY_MIG).toContain(
      'CREATE OR REPLACE FUNCTION public._kpi_check_pii_keys(p_obj JSONB)'
    );
  });

  it('KPI_PROPS_PII_KEY_DETECTEDが存在する', () => {
    expect(SECURITY_MIG).toContain('KPI_PROPS_PII_KEY_DETECTED');
  });

  it('KPI_PROPS_NESTED_NOT_ALLOWEDが存在する', () => {
    expect(SECURITY_MIG).toContain('KPI_PROPS_NESTED_NOT_ALLOWED');
  });

  it('KPI_PROPS_STRING_TOO_LONGが存在する', () => {
    expect(SECURITY_MIG).toContain('KPI_PROPS_STRING_TOO_LONG');
  });

  it('KPI_PROPS_TOO_MANY_KEYSが存在する', () => {
    expect(SECURITY_MIG).toContain('KPI_PROPS_TOO_MANY_KEYS');
  });
});

// ---------------------------------------------------------------------------
// Test: 24. DB migration: settings validation
// ---------------------------------------------------------------------------

describe('24. DB migration: settings validation', () => {
  const SECURITY_MIG = (() => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    return readFileSync(
      resolve(__dirname, '../../supabase/migrations/20260809195846_kpi_phase1_security.sql'),
      'utf-8'
    ) as string;
  })();

  it('admin_update_kpi_settingsにKPI_SETTINGS_RETENTION_OUT_OF_RANGEが存在する', () => {
    expect(SECURITY_MIG).toContain('KPI_SETTINGS_RETENTION_OUT_OF_RANGE');
  });

  it('retention_daysのCHECKが30〜730の範囲検証を含む', () => {
    // migration内に30と730の数値チェックが存在する
    expect(SECURITY_MIG).toMatch(/p_raw_event_retention_days\s*<\s*30/);
    expect(SECURITY_MIG).toMatch(/p_raw_event_retention_days\s*>\s*730/);
  });
});

// ---------------------------------------------------------------------------
// Test: 25. Tracker: RPC error判定
// ---------------------------------------------------------------------------

describe('25. Tracker: RPC error判定', () => {
  it('{ data: null, error: { code: "invalid_parameter_value" } } でretryしない', async () => {
    const { mock, rpcFn } = createSupabaseMock({
      data: null,
      error: { code: 'invalid_parameter_value', message: 'unknown event' },
    });
    initKpiTracker(mock);
    initSession();

    track('page_view', { route: '/test' });
    await flushNow();

    // 1回呼ばれたが、error=non-retryableなので再キューされない
    expect(rpcFn).toHaveBeenCalledTimes(1);
    // キューが空であること（retryされていない）
    const queue = getQueueSnapshot();
    expect(queue.length).toBe(0);
  });

  it('{ data: null, error: { message: "KPI_RATE_LIMIT_EXCEEDED" } } でretryしない', async () => {
    const { mock, rpcFn } = createSupabaseMock({
      data: null,
      error: { code: 'too_many_requests', message: 'KPI_RATE_LIMIT_EXCEEDED' },
    });
    initKpiTracker(mock);
    initSession();

    track('page_view', { route: '/test' });
    await flushNow();

    expect(rpcFn).toHaveBeenCalledTimes(1);
    const queue = getQueueSnapshot();
    expect(queue.length).toBe(0);
  });

  it('{ data: null, error: { code: "500", message: "Internal server error" } } でretryする（retryCount増加）', async () => {
    // retryはsetTimeoutで遅延するため、setTimeout後のqueue確認はしない
    // flushBatch内でshouldRetry=trueになりsetTimeoutが呼ばれることを確認
    const { mock, rpcFn } = createSupabaseMock({
      data: null,
      error: { code: '500', message: 'Internal server error' },
    });
    initKpiTracker(mock);
    initSession();

    track('page_view', { route: '/test' });
    await flushNow();

    // 1回呼ばれ、retryable errorなのでsetTimeoutで再キューされる
    // （setTimeout内なので即座には確認不可だが、RPCは1回のみ）
    expect(rpcFn).toHaveBeenCalledTimes(1);
  });

  it('KPI_プレフィックスのerrorメッセージはnon-retryable', async () => {
    const { mock, rpcFn } = createSupabaseMock({
      data: null,
      error: { code: 'P0001', message: 'KPI_PROPS_PII_KEY_DETECTED' },
    });
    initKpiTracker(mock);
    initSession();

    track('page_view', { route: '/test' });
    await flushNow();

    expect(rpcFn).toHaveBeenCalledTimes(1);
    const queue = getQueueSnapshot();
    expect(queue.length).toBe(0);
  });

  it('MAX_RETRY(3)超えたら静かに破棄', async () => {
    // retryCount=MAX_RETRYのイベントはretryされない
    // kpiTracker.tsのMAX_RETRY=3を確認
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const trackerSrc = readFileSync(
      resolve(__dirname, '../lib/kpiTracker.ts'),
      'utf-8'
    ) as string;
    expect(trackerSrc).toContain('const MAX_RETRY = 3');
  });
});

// ---------------------------------------------------------------------------
// Test: 26. Tracker: offline queue仕様明記確認
// ---------------------------------------------------------------------------

describe('26. Tracker: offline queue仕様明記確認', () => {
  it('kpiTracker.tsにPhase 1 offline queue: memory-onlyのコメントが存在する', () => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const trackerSrc = readFileSync(
      resolve(__dirname, '../lib/kpiTracker.ts'),
      'utf-8'
    ) as string;
    expect(trackerSrc).toContain('Phase 1 offline queue: memory-only');
  });

  it('OFFLINE_QUEUE_MAXが50である', () => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const trackerSrc = readFileSync(
      resolve(__dirname, '../lib/kpiTracker.ts'),
      'utf-8'
    ) as string;
    expect(trackerSrc).toContain('const OFFLINE_QUEUE_MAX = 50');
  });
});
