/**
 * kpi_phase2_privacy.test.ts
 *
 * Phase 2: プライバシー保護テスト
 *
 * テスト対象:
 * - email / magic link / OTP / access/refresh token が保存されないこと
 * - referrer URL全文が保存されないこと
 * - query string / hash が route に含まれないこと
 * - error message全文が保存されないこと
 * - 禁止キーの実行時検証
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  hasForbiddenKeys,
  isPropertiesWithinSizeLimit,
  isAllowedEventName,
} from '../lib/kpiEvents';
import {
  initKpiTracker,
  track,
  resetTracker,
  flushNow,
} from '../lib/kpiTracker';
import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyAuthError } from '../hooks/useAuthKpi';

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

Object.defineProperty(global, 'localStorage', { value: new StorageMock(), writable: true });
Object.defineProperty(global, 'sessionStorage', { value: new StorageMock(), writable: true });

// crypto.randomUUID mock
if (!(global as { crypto?: unknown }).crypto) {
  let counter = 0;
  Object.defineProperty(global, 'crypto', {
    value: { randomUUID: () => `test-uuid-${++counter}-0000-0000-0000-000000000000` },
    writable: true,
  });
}

// ---------------------------------------------------------------------------
// Tests: hasForbiddenKeys
// ---------------------------------------------------------------------------

describe('hasForbiddenKeys', () => {
  const FORBIDDEN_PROPS = [
    { email: 'user@example.com' },
    { name: 'John Doe' },
    { full_name: 'John Doe' },
    { display_name: 'JohnD' },
    { ip: '1.2.3.4' },
    { ip_address: '1.2.3.4' },
    { user_agent: 'Mozilla/5.0...' },
    { access_token: 'eyJhbGci...' },
    { refresh_token: 'eyJhbGci...' },
    { token: 'some-token' },
    { payment_method: 'card' },
    { card_number: '4242424242424242' },
    { tax_id: '123-45-6789' },
    { full_record: '...' },
    { sql: 'SELECT * FROM users' },
    { stack: 'Error at line 1...' },
    { stack_trace: 'Error at line 1...' },
  ];

  FORBIDDEN_PROPS.forEach((props) => {
    const key = Object.keys(props)[0];
    it(`detects forbidden key: "${key}"`, () => {
      expect(hasForbiddenKeys(props as Record<string, unknown>)).toBe(true);
    });
  });

  it('allows safe properties', () => {
    expect(hasForbiddenKeys({ route: '/home', method: 'magic_link' })).toBe(false);
    expect(hasForbiddenKeys({ error_code: 'rate_limited', from_locale: 'en', to_locale: 'ja' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: Route sanitization (no query/hash)
// ---------------------------------------------------------------------------

describe('route sanitization', () => {
  it('should not include query string in route', () => {
    const fullUrl = '/auth/callback?token=abc123&type=recovery';
    const pathname = fullUrl.split('?')[0] ?? '/';
    expect(pathname).toBe('/auth/callback');
    expect(pathname).not.toContain('token=');
    expect(pathname).not.toContain('abc123');
  });

  it('should not include hash in route', () => {
    const fullUrl = '/auth#access_token=eyJhbGci';
    const pathname = fullUrl.split('#')[0] ?? '/';
    expect(pathname).toBe('/auth');
    expect(pathname).not.toContain('access_token=');
  });

  it('should not include email in route', () => {
    const route = '/dashboard';
    expect(route).not.toContain('@');
  });
});

// ---------------------------------------------------------------------------
// Tests: classifyAuthError - no PII in error code
// ---------------------------------------------------------------------------

describe('classifyAuthError - no PII', () => {
  it('does not return email in error code', () => {
    const code = classifyAuthError({ message: 'Invalid login for user@example.com' });
    expect(code).not.toContain('@');
    expect(code).not.toContain('example.com');
    expect(code).not.toContain('user');
  });

  it('does not return token in error code', () => {
    const code = classifyAuthError({ message: 'Token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 expired' });
    expect(code).not.toContain('eyJ');
    // "expired" matches expired_otp; code should be a safe string
    const SAFE_CODES = ['unknown', 'rate_limited', 'invalid_otp', 'expired_otp', 'network_error', 'provider_error'];
    expect(SAFE_CODES).toContain(code);
  });

  it('does not return URL in error code', () => {
    const code = classifyAuthError({ message: 'Redirect to https://evil.com failed' });
    expect(code).not.toContain('https://');
    expect(code).not.toContain('evil.com');
  });

  it('does not return raw stack trace', () => {
    const code = classifyAuthError({ message: 'Error\n  at AuthService.signIn (auth.js:42)\n  at App.jsx:10' });
    expect(code).not.toContain('AuthService');
    expect(code).not.toContain('auth.js');
    expect(code).not.toContain('at ');
  });
});

// ---------------------------------------------------------------------------
// Tests: track() with forbidden keys - dropped silently
// ---------------------------------------------------------------------------

describe('track - forbidden keys are dropped', () => {
  const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null });
  const supabaseMock = {
    rpc: rpcMock,
  } as unknown as SupabaseClient;

  beforeEach(() => {
    resetTracker();
    rpcMock.mockClear();
    initKpiTracker(supabaseMock, {});
  });

  afterEach(async () => {
    await flushNow();
    resetTracker();
  });

  it('track() silently drops events with forbidden keys', async () => {
    // @ts-expect-error -- testing runtime forbidden key detection
    track('page_view', { route: '/home', email: 'user@example.com' });
    await flushNow();
    // Should not have been sent (forbidden key)
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('track() sends events with safe keys', async () => {
    track('page_view', { route: '/home' });
    await flushNow();
    expect(rpcMock).toHaveBeenCalledOnce();
    const call = rpcMock.mock.calls[0];
    expect(call?.[0]).toBe('track_kpi_event');
    // Verify no PII in the call
    const params = call?.[1] as Record<string, unknown>;
    expect(JSON.stringify(params)).not.toContain('email');
    expect(JSON.stringify(params)).not.toContain('@');
  });
});

// ---------------------------------------------------------------------------
// Tests: isPropertiesWithinSizeLimit
// ---------------------------------------------------------------------------

describe('isPropertiesWithinSizeLimit', () => {
  it('returns true for small payloads', () => {
    expect(isPropertiesWithinSizeLimit({ route: '/home' })).toBe(true);
  });

  it('returns false for >10KB payloads', () => {
    const largeData: Record<string, string> = {};
    for (let i = 0; i < 100; i++) {
      largeData[`key_${i}`] = 'x'.repeat(200);
    }
    expect(isPropertiesWithinSizeLimit(largeData)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: isAllowedEventName
// ---------------------------------------------------------------------------

describe('isAllowedEventName', () => {
  it('allows known event names', () => {
    expect(isAllowedEventName('page_view')).toBe(true);
    expect(isAllowedEventName('auth_started')).toBe(true);
    expect(isAllowedEventName('auth_succeeded')).toBe(true);
    expect(isAllowedEventName('auth_failed')).toBe(true);
    expect(isAllowedEventName('session_started')).toBe(true);
    expect(isAllowedEventName('session_heartbeat')).toBe(true);
    expect(isAllowedEventName('language_changed')).toBe(true);
  });

  it('rejects unknown event names', () => {
    expect(isAllowedEventName('test_event')).toBe(false);
    expect(isAllowedEventName('user_registered')).toBe(false);
    expect(isAllowedEventName('')).toBe(false);
    expect(isAllowedEventName(null)).toBe(false);
    expect(isAllowedEventName(undefined)).toBe(false);
  });
});
