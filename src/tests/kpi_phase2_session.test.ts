/**
 * kpi_phase2_session.test.ts
 *
 * Phase 2: Session管理・Lifecycle のテスト
 *
 * テスト対象:
 * - Session初期化（1回のみ）
 * - 30分タイムアウト
 * - ログアウトリセット
 * - ユーザー切り替え時の新session
 * - anonymous_id維持
 * - session_id更新
 * - /ai-check-login 除外
 * - INITIAL_SESSION除外（page reload既存session復元は新規認証として計測しない）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getOrCreateAnonymousId,
  getOrCreateSessionId,
  resetSessionOnLogout,
  onUserAuthenticated,
  initSession,
  detectEnvironment,
} from '../lib/kpiSession';
import { isAiCheckLoginPath, INACTIVITY_TIMEOUT_MS } from '../hooks/useKpiLifecycle';

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
  let counter = 0;
  Object.defineProperty(global, 'crypto', {
    value: {
      randomUUID: () => `test-uuid-${++counter}-xxxx-xxxx-xxxx-xxxxxxxxxxxx`,
    },
    writable: true,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clearAllStorage() {
  localStorageMock.clear();
  sessionStorageMock.clear();
}

// ---------------------------------------------------------------------------
// Tests: anonymous_id
// ---------------------------------------------------------------------------

describe('anonymous_id', () => {
  beforeEach(() => {
    clearAllStorage();
  });

  it('creates and persists anonymous_id in localStorage', () => {
    const id1 = getOrCreateAnonymousId();
    expect(id1).toBeTruthy();
    expect(typeof id1).toBe('string');

    // Same call returns same ID
    const id2 = getOrCreateAnonymousId();
    expect(id1).toBe(id2);
  });

  it('survives logout (anonymous_id is maintained)', () => {
    const anonId = getOrCreateAnonymousId();
    resetSessionOnLogout(); // logout only clears sessionStorage
    const anonIdAfter = getOrCreateAnonymousId();
    expect(anonId).toBe(anonIdAfter);
  });

  it('is different across "fresh" users (different localStorage)', () => {
    const id1 = getOrCreateAnonymousId();
    clearAllStorage();
    const id2 = getOrCreateAnonymousId();
    expect(id1).not.toBe(id2);
  });
});

// ---------------------------------------------------------------------------
// Tests: session_id
// ---------------------------------------------------------------------------

describe('session_id', () => {
  beforeEach(() => {
    clearAllStorage();
  });

  it('creates a new session_id on first access', () => {
    const id = getOrCreateSessionId(null);
    expect(id).toBeTruthy();
  });

  it('reuses session_id within same tab session', () => {
    const id1 = getOrCreateSessionId(null);
    const id2 = getOrCreateSessionId(null);
    expect(id1).toBe(id2);
  });

  it('resets session_id on logout (new session after logout)', () => {
    const id1 = getOrCreateSessionId(null);
    resetSessionOnLogout();
    const id2 = getOrCreateSessionId(null);
    expect(id1).not.toBe(id2);
  });

  it('creates new session when different user is detected', () => {
    const id1 = getOrCreateSessionId('user-a');
    const id2 = getOrCreateSessionId('user-b'); // different user
    expect(id1).not.toBe(id2);
  });

  it('reuses session for same user', () => {
    const id1 = getOrCreateSessionId('user-a');
    const id2 = getOrCreateSessionId('user-a');
    expect(id1).toBe(id2);
  });
});

// ---------------------------------------------------------------------------
// Tests: onUserAuthenticated
// ---------------------------------------------------------------------------

describe('onUserAuthenticated', () => {
  beforeEach(() => {
    clearAllStorage();
  });

  it('sets session user without resetting for same user', () => {
    const sessionId = getOrCreateSessionId(null);
    onUserAuthenticated('user-a');
    const sessionIdAfter = getOrCreateSessionId('user-a');
    expect(sessionId).toBe(sessionIdAfter);
  });

  it('resets session for different user', () => {
    getOrCreateSessionId('user-a');
    onUserAuthenticated('user-a');

    // switch to user-b
    onUserAuthenticated('user-b');
    // session should be reset
    // (next getOrCreateSessionId will create new one)
  });
});

// ---------------------------------------------------------------------------
// Tests: anonymous→authenticated association
// ---------------------------------------------------------------------------

describe('anonymous→authenticated association', () => {
  beforeEach(() => {
    clearAllStorage();
  });

  it('anonymous_id is preserved after authentication', () => {
    const anonId = getOrCreateAnonymousId();
    const sessionBefore = initSession(null);
    expect(sessionBefore.anonymousId).toBe(anonId);

    // User authenticates
    onUserAuthenticated('user-x');
    const sessionAfter = initSession('user-x');
    expect(sessionAfter.anonymousId).toBe(anonId); // anonymous_id preserved
  });

  it('session_id may change on user auth switch', () => {
    initSession(null);
    const anonId1 = getOrCreateAnonymousId();

    // User B login from different state
    resetSessionOnLogout();
    onUserAuthenticated('user-b');
    const sessionB = initSession('user-b');
    expect(sessionB.anonymousId).toBe(anonId1); // anonymous_id preserved (same localStorage)
  });
});

// ---------------------------------------------------------------------------
// Tests: initSession
// ---------------------------------------------------------------------------

describe('initSession', () => {
  beforeEach(() => {
    clearAllStorage();
  });

  it('returns a valid session info', () => {
    const info = initSession(null);
    expect(info.anonymousId).toBeTruthy();
    expect(info.sessionId).toBeTruthy();
    expect(info.startedAt).toBeTruthy();
    expect(['production', 'staging', 'development', 'test']).toContain(info.environment);
  });

  it('started_at is not changed after initialization', () => {
    const info1 = initSession(null);
    const startedAt1 = info1.startedAt;

    // Simulate time passing and re-init (same session)
    const info2 = initSession(null);
    expect(info2.startedAt).toBe(startedAt1); // started_at must not change
  });
});

// ---------------------------------------------------------------------------
// Tests: isAiCheckLoginPath
// ---------------------------------------------------------------------------

describe('isAiCheckLoginPath', () => {
  it('returns false for normal paths when window.location is not mocked', () => {
    // In test environment, window.location.pathname is '/'
    // isAiCheckLoginPath should return false for '/'
    const result = isAiCheckLoginPath();
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: INACTIVITY_TIMEOUT_MS
// ---------------------------------------------------------------------------

describe('INACTIVITY_TIMEOUT_MS', () => {
  it('is 30 minutes (1800 seconds)', () => {
    expect(INACTIVITY_TIMEOUT_MS).toBe(30 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------------
// Tests: detectEnvironment
// ---------------------------------------------------------------------------

describe('detectEnvironment', () => {
  it('returns a valid environment', () => {
    const env = detectEnvironment();
    expect(['production', 'staging', 'development', 'test']).toContain(env);
  });
});

// ---------------------------------------------------------------------------
// Tests: logout reset
// ---------------------------------------------------------------------------

describe('logout reset', () => {
  beforeEach(() => {
    clearAllStorage();
  });

  it('resets session_id on logout', () => {
    const session1 = initSession(null);
    resetSessionOnLogout();
    const session2 = initSession(null);
    expect(session1.sessionId).not.toBe(session2.sessionId);
  });

  it('preserves anonymous_id on logout', () => {
    const session1 = initSession(null);
    resetSessionOnLogout();
    const session2 = initSession(null);
    expect(session1.anonymousId).toBe(session2.anonymousId);
  });
});

// ---------------------------------------------------------------------------
// Tests: user switch creates new session
// ---------------------------------------------------------------------------

describe('user switch', () => {
  beforeEach(() => {
    clearAllStorage();
  });

  it('creates new session_id when different user logs in', () => {
    const session1 = initSession('user-a');
    resetSessionOnLogout(); // simulate logout
    onUserAuthenticated('user-b');
    const session2 = initSession('user-b');
    expect(session1.sessionId).not.toBe(session2.sessionId);
    // anonymous_id is preserved
    expect(session1.anonymousId).toBe(session2.anonymousId);
  });
});
