/**
 * useAuthKpi.ts — Auth KPI Events Hook
 *
 * Phase 2: 認証フロー (auth_started / auth_succeeded / auth_failed) の
 * KPI計測を担当する専用hook。
 *
 * 既存のuseAuth.ts / AuthGate.tsx の動作・UI・エラー文言は変更しない。
 * KPI送信のみを担当する薄いラッパーを提供。
 *
 * 設計方針:
 * - auth_started: 実際にSupabase認証要求を開始した時点で記録
 * - auth_succeeded: Supabaseで有効sessionが確立した後（SIGNED_IN event受信後）
 * - auth_failed: Supabase認証要求が失敗した場合のみ
 * - INITIAL_SESSION／token refresh は新規認証として計測しない
 * - 同一ユーザーのSIGNED_IN重複を二重計上しない
 * - email等PIIは保存しない
 * - password QAログイン（/ai-check-login）は完全除外
 * - 二重クリック（同一ボタンの二重送信）を計上しない
 */

import { useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { track } from '../lib/kpiTracker';
import { onUserAuthenticated, initSession, upsertKpiSession, classifyDevice } from '../lib/kpiSession';

// ---------------------------------------------------------------------------
// Auth error code classifier
// ---------------------------------------------------------------------------

/**
 * Supabase/authエラーを安全な分類コードに変換。
 * error.message全文 / email / stack / URL / token / Supabaseレスポンス全文は保存しない。
 */
export function classifyAuthError(error: { message?: string; status?: number } | null | undefined): string {
  if (!error) return 'unknown';
  const msg = (error.message ?? '').toLowerCase();
  const status = error.status; // undefined is NOT 0

  // Rate limit
  if (status === 429 || msg.includes('rate limit') || msg.includes('too many')) {
    return 'rate_limited';
  }
  // Invalid OTP (entered wrong code) - check before generic expired
  if (msg.includes('invalid otp') || msg.includes('invalid token') || msg.includes('token has expired')) {
    return 'invalid_otp';
  }
  // OTP/link expired (generic)
  if (msg.includes('otp expired') || msg.includes('expired')) {
    return 'expired_otp';
  }
  // Provider error (OAuth etc.) - check before network to catch HTTP 5xx
  if (msg.includes('provider') || msg.includes('oauth') || (status !== undefined && status >= 500)) {
    return 'provider_error';
  }
  // Network error (only when status is explicitly 0 or network keywords)
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('connection') || status === 0) {
    return 'network_error';
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Auth method type
// ---------------------------------------------------------------------------

export type AuthMethod = 'magic_link' | 'oauth' | 'password' | 'unknown';

// ---------------------------------------------------------------------------
// Module-level state for auth_succeeded deduplication
// ---------------------------------------------------------------------------

// 最後にauth_succeededを送信したuser_idと時刻
let _lastAuthSucceededUserId: string | null = null;
let _lastAuthSucceededAt: number = 0;
const AUTH_SUCCEEDED_DEDUP_MS = 5_000; // 5秒以内の同一ユーザー重複をスキップ

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseAuthKpiReturn {
  /** auth_started を送信する（認証要求直前に呼ぶ） */
  trackAuthStarted: (method: AuthMethod) => void;
  /** auth_succeeded を送信する（auth state changeコールバックの SIGNED_IN で呼ぶ） */
  trackAuthSucceeded: (userId: string, method?: AuthMethod) => void;
  /** auth_failed を送信する（認証要求失敗時に呼ぶ） */
  trackAuthFailed: (error: { message?: string; status?: number } | null | undefined, method: AuthMethod) => void;
}

export function useAuthKpi(): UseAuthKpiReturn {
  // 二重クリック防止: 現在送信中の認証要求を追跡
  const pendingAuthRef = useRef<boolean>(false);
  // 現在の認証method（auth_started → auth_succeeded/failed で引き継ぐ）
  const currentMethodRef = useRef<AuthMethod>('unknown');

  // ---------------------------------------------------------------------------
  // auth_started
  // ---------------------------------------------------------------------------
  const trackAuthStarted = useCallback((method: AuthMethod): void => {
    try {
      // /ai-check-login は除外
      const p = window.location.pathname;
      if (p === '/ai-check-login' || p === '/ai-check-login/') return;

      // 二重送信防止（まだ前の認証が処理中）
      if (pendingAuthRef.current) return;
      pendingAuthRef.current = true;
      currentMethodRef.current = method;

      const route = window.location.pathname;
      track('auth_started', {
        method,
        route: route.length <= 500 ? route : route.slice(0, 500),
      });
    } catch {
      // KPI送信失敗は無視（認証フローを妨げない）
    }
  }, []);

  // ---------------------------------------------------------------------------
  // auth_succeeded
  // ---------------------------------------------------------------------------
  const trackAuthSucceeded = useCallback((userId: string, method?: AuthMethod): void => {
    try {
      // /ai-check-login は除外
      const p = window.location.pathname;
      if (p === '/ai-check-login' || p === '/ai-check-login/') return;

      pendingAuthRef.current = false;

      // 重複SIGNED_IN防止（同一ユーザーの短時間重複）
      const now = Date.now();
      if (
        userId === _lastAuthSucceededUserId &&
        now - _lastAuthSucceededAt < AUTH_SUCCEEDED_DEDUP_MS
      ) {
        return;
      }
      _lastAuthSucceededUserId = userId;
      _lastAuthSucceededAt = now;

      // 認証ユーザーへのsession関連付け
      onUserAuthenticated(userId);
      const sessionInfo = initSession(userId);

      void upsertKpiSession(supabase, {
        sessionId: sessionInfo.sessionId,
        anonymousId: sessionInfo.anonymousId,
        startedAt: sessionInfo.startedAt,
        lastSeenAt: new Date().toISOString(),
        deviceClass: classifyDevice(),
        environment: sessionInfo.environment,
      });

      track('auth_succeeded', {
        method: method ?? currentMethodRef.current,
        // is_new_user: 推測だけで正本にしない（auth.usersが正本）
      });

      currentMethodRef.current = 'unknown';
    } catch {
      // KPI送信失敗は無視
    }
  }, []);

  // ---------------------------------------------------------------------------
  // auth_failed
  // ---------------------------------------------------------------------------
  const trackAuthFailed = useCallback(
    (error: { message?: string; status?: number } | null | undefined, method: AuthMethod): void => {
      try {
        // /ai-check-login は除外
        const p = window.location.pathname;
        if (p === '/ai-check-login' || p === '/ai-check-login/') return;

        pendingAuthRef.current = false;
        currentMethodRef.current = 'unknown';

        const errorCode = classifyAuthError(error);
        track('auth_failed', {
          method,
          error_code: errorCode,
        });
      } catch {
        // KPI送信失敗は無視
      }
    },
    []
  );

  return { trackAuthStarted, trackAuthSucceeded, trackAuthFailed };
}

// ---------------------------------------------------------------------------
// Auth State Change Watcher for auth_succeeded
// ---------------------------------------------------------------------------

/**
 * useAuthSucceededWatcher
 *
 * Supabase auth.onAuthStateChange を監視して auth_succeeded を送信する。
 * INITIAL_SESSION と SIGNED_IN を区別し、page reload時の既存session復元は
 * 新規認証成功として計測しない。
 *
 * 使用箇所: AuthGate / KpiLifecycle.tsx から呼ぶ。
 */
export function useAuthSucceededWatcher(): void {
  const isFirstEventRef = useRef(true);

  useEffect(() => {
    // /ai-check-login は除外
    try {
      const p = window.location.pathname;
      if (p === '/ai-check-login' || p === '/ai-check-login/') return;
    } catch {
      return;
    }

    let lastUserId: string | null = null;

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      try {
        if (event === 'INITIAL_SESSION') {
          // page reload時の既存session復元: 新規認証ではない
          isFirstEventRef.current = false;
          if (session?.user?.id) {
            lastUserId = session.user.id;
          }
          return;
        }

        if (event === 'SIGNED_IN') {
          const userId = session?.user?.id;
          if (!userId) return;

          if (isFirstEventRef.current) {
            // 初回SIGNED_IN = token復元: 新規認証ではない
            isFirstEventRef.current = false;
            lastUserId = userId;
            return;
          }

          // 実際の新規ログイン（同一ユーザーの重複SIGNED_INを除外）
          const now = Date.now();
          if (
            userId === _lastAuthSucceededUserId &&
            now - _lastAuthSucceededAt < AUTH_SUCCEEDED_DEDUP_MS
          ) {
            lastUserId = userId;
            return;
          }

          // 重複でなければauth_succeededを送信
          _lastAuthSucceededUserId = userId;
          _lastAuthSucceededAt = now;
          lastUserId = userId;

          // session関連付け
          onUserAuthenticated(userId);
          const sessionInfo = initSession(userId);
          void upsertKpiSession(supabase, {
            sessionId: sessionInfo.sessionId,
            anonymousId: sessionInfo.anonymousId,
            startedAt: sessionInfo.startedAt,
            lastSeenAt: new Date().toISOString(),
            deviceClass: classifyDevice(),
            environment: sessionInfo.environment,
          });

          track('auth_succeeded', {
            method: 'magic_link', // 現在の実装はmagic_link / OTP
            // is_new_user: auth.usersが正本のため設定しない
          });
        }

        if (event === 'SIGNED_OUT') {
          isFirstEventRef.current = true;
          lastUserId = null;
        }

        if (event === 'TOKEN_REFRESHED') {
          // token refreshは新規認証ではない
        }

        void lastUserId; // suppress unused warning
      } catch {
        // auth state handler失敗は無視
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);
}

// ---------------------------------------------------------------------------
// Reset for tests
// ---------------------------------------------------------------------------

export function resetAuthKpiState(): void {
  _lastAuthSucceededUserId = null;
  _lastAuthSucceededAt = 0;
}
