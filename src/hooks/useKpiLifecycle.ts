/**
 * useKpiLifecycle.ts — KPI Lifecycle管理 Hook
 *
 * Phase 2: アプリ起動時の一度きり初期化、Session管理、Heartbeat
 *
 * 設計方針:
 * - React StrictModeや再renderで二重初期化しない（refフラグで制御）
 * - listenerを重複登録しない
 * - tracker初期化失敗でアプリを止めない
 * - /ai-check-login では初期化・送信しない
 * - development／test／previewはproductionと分離済み（detectEnvironment使用）
 * - 既存AuthGateの動作を変更しない
 *
 * Session定義:
 * - 初回アクセスで開始
 * - 30分以上活動がなければ次の活動から新session
 * - ログアウトで終了し次回は新session
 * - 同じ端末で別ユーザーへ切替時は新session
 * - anonymous_idは維持
 * - session_idは更新
 *
 * Heartbeat:
 * - 60秒間隔
 * - document.visibilityState === 'visible' の場合のみ
 * - last activityがある場合のみ
 * - unmount／logout時にinterval解除
 */

import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  initKpiTracker,
  track,
  isTrackerInitialized,
  resetTracker,
} from '../lib/kpiTracker';
import {
  initSession,
  getOrCreateAnonymousId,
  getOrCreateSessionId,
  onUserAuthenticated,
  resetSessionOnLogout,
  upsertKpiSession,
  detectEnvironment,
  classifyDevice,
} from '../lib/kpiSession';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEARTBEAT_INTERVAL_MS = 60_000; // 60秒
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30分

// ストレージキー（kpiSessionと同じプレフィックスで統一）
const LAST_ACTIVITY_KEY = 'one_eight_kpi_last_activity_at';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAiCheckLoginPath(): boolean {
  try {
    const p = window.location.pathname;
    return p === '/ai-check-login' || p === '/ai-check-login/';
  } catch {
    return false;
  }
}

function getLastActivityAt(): number | null {
  try {
    const val = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (!val) return null;
    const n = parseInt(val, 10);
    return isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

function setLastActivityAt(ts: number): void {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(ts));
  } catch {
    // ignore
  }
}

function classifyReferrer(): 'direct' | 'internal' | 'external_unknown' {
  try {
    const ref = document.referrer;
    if (!ref) return 'direct';
    const refUrl = new URL(ref);
    if (refUrl.origin === window.location.origin) return 'internal';
    return 'external_unknown';
  } catch {
    return 'direct';
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton flags (survives StrictMode double-mount)
// ---------------------------------------------------------------------------

let _lifecycleInitDone = false;
let _authListenerRegistered = false;
let _heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let _currentSessionId: string | null = null;
let _sessionStartedAt: string | null = null;

/**
 * heartbeatを停止してインターバルをクリア
 */
function stopHeartbeat(): void {
  if (_heartbeatInterval !== null) {
    clearInterval(_heartbeatInterval);
    _heartbeatInterval = null;
  }
}

// ---------------------------------------------------------------------------
// Main Hook
// ---------------------------------------------------------------------------

export function useKpiLifecycle(): void {
  const initDoneRef = useRef(false);

  // activity更新用
  const recordActivity = useCallback(() => {
    setLastActivityAt(Date.now());
  }, []);

  useEffect(() => {
    // /ai-check-login は完全除外
    if (isAiCheckLoginPath()) return;

    // StrictModeダブルマウント対策: モジュールレベルのフラグで二重初期化防止
    if (_lifecycleInitDone && initDoneRef.current) return;
    initDoneRef.current = true;

    // ---------------------------------------------------------------------------
    // 1. Tracker初期化
    // ---------------------------------------------------------------------------
    function initTracker(): void {
      try {
        if (isTrackerInitialized()) return;

        const env = detectEnvironment();
        let appVersion: string | undefined;

        // app versionが安全に取得できる場合のみ設定
        try {
          const v = import.meta.env.VITE_APP_VERSION;
          if (v && typeof v === 'string' && v.trim()) {
            appVersion = v.trim();
          }
        } catch {
          // バージョン取得失敗は無視
        }

        initKpiTracker(supabase, { appVersion });

        // 初期化成功後にenv確認（productinoとdevを分離）
        void env; // used via detectEnvironment inside kpiSession

      } catch {
        // tracker初期化失敗でアプリを止めない
      }
    }

    initTracker();

    // ---------------------------------------------------------------------------
    // 2. Session開始
    // ---------------------------------------------------------------------------
    function startSession(userId?: string | null): void {
      try {
        const sessionInfo = initSession(userId);
        _currentSessionId = sessionInfo.sessionId;
        _sessionStartedAt = sessionInfo.startedAt;

        const now = new Date().toISOString();
        const route = window.location.pathname;
        const referrerType = classifyReferrer();

        // upsert_kpi_session
        void upsertKpiSession(supabase, {
          sessionId: sessionInfo.sessionId,
          anonymousId: sessionInfo.anonymousId,
          startedAt: sessionInfo.startedAt,
          lastSeenAt: now,
          firstRoute: route.length <= 500 ? route : route.slice(0, 500),
          locale: undefined, // KpiLifecycle.tsxでlocaleを設定済み
          deviceClass: classifyDevice(),
          environment: sessionInfo.environment,
        });

        // session_started event
        track('session_started', {
          referrer_type: referrerType,
          restored: false,
        });

        // last activity記録
        setLastActivityAt(Date.now());
      } catch {
        // session開始失敗は無視
      }
    }

    // ---------------------------------------------------------------------------
    // 3. Heartbeat開始
    // ---------------------------------------------------------------------------
    function startHeartbeat(): void {
      stopHeartbeat();

      _heartbeatInterval = setInterval(() => {
        try {
          // hidden中は送信しない
          if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

          const lastActivity = getLastActivityAt();
          if (lastActivity === null) return;

          const sessionId = _currentSessionId;
          const sessionStartedAt = _sessionStartedAt;
          if (!sessionId || !sessionStartedAt) return;

          const now = Date.now();
          const elapsedSeconds = Math.round((now - new Date(sessionStartedAt).getTime()) / 1000);

          // upsert_kpi_session heartbeat
          const sessionInfo = initSession();
          void upsertKpiSession(supabase, {
            sessionId: sessionInfo.sessionId,
            anonymousId: sessionInfo.anonymousId,
            startedAt: sessionInfo.startedAt,
            lastSeenAt: new Date().toISOString(),
            deviceClass: classifyDevice(),
            environment: sessionInfo.environment,
          });

          // session_heartbeat event
          const route = window.location.pathname;
          track('session_heartbeat', {
            route: route.length <= 500 ? route : route.slice(0, 500),
            elapsed_seconds: Math.max(0, elapsedSeconds),
          });
        } catch {
          // heartbeat失敗は無視
        }
      }, HEARTBEAT_INTERVAL_MS);
    }

    // ---------------------------------------------------------------------------
    // 4. 30分inactivity判定 + セッション継続チェック
    // ---------------------------------------------------------------------------
    function checkAndRefreshSession(userId?: string | null): void {
      const lastActivity = getLastActivityAt();
      if (lastActivity !== null) {
        const elapsed = Date.now() - lastActivity;
        if (elapsed > INACTIVITY_TIMEOUT_MS) {
          // 30分以上非活動: 新sessionを開始
          resetSessionOnLogout(); // session_idリセット（anonymous_idは保持）
          startSession(userId);
          return;
        }
      }
      // アクティビティ更新
      setLastActivityAt(Date.now());
    }

    // ---------------------------------------------------------------------------
    // 5. Auth State Listener（重複登録防止）
    // ---------------------------------------------------------------------------
    let authSubscription: { unsubscribe: () => void } | null = null;

    if (!_authListenerRegistered) {
      _authListenerRegistered = true;

      let lastAuthUserId: string | null = null;
      let isInitialSession = true; // INITIAL_SESSION と SIGNED_IN を区別

      const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
        try {
          const userId = session?.user?.id ?? null;

          if (event === 'INITIAL_SESSION') {
            // ページreloadによる既存session復元
            isInitialSession = false;
            if (userId) {
              lastAuthUserId = userId;
              onUserAuthenticated(userId);
            }
            // INITIAL_SESSION は新規認証成功ではない（計測しない）
            checkAndRefreshSession(userId);
            return;
          }

          if (event === 'SIGNED_IN') {
            if (isInitialSession) {
              isInitialSession = false;
              // 初回のSIGNED_IN (=ページロード後のtoken復元): 計測しない
              if (userId) {
                lastAuthUserId = userId;
                onUserAuthenticated(userId);
              }
              checkAndRefreshSession(userId);
              return;
            }

            // 実際の新規ログイン
            if (userId && userId !== lastAuthUserId) {
              // 別ユーザーなら新session
              if (lastAuthUserId !== null && lastAuthUserId !== userId) {
                resetSessionOnLogout();
              }
              lastAuthUserId = userId;
              onUserAuthenticated(userId);

              const sessionInfo = initSession(userId);
              _currentSessionId = sessionInfo.sessionId;
              _sessionStartedAt = sessionInfo.startedAt;

              // upsert_kpi_session (認証ユーザー関連付け)
              void upsertKpiSession(supabase, {
                sessionId: sessionInfo.sessionId,
                anonymousId: sessionInfo.anonymousId,
                startedAt: sessionInfo.startedAt,
                lastSeenAt: new Date().toISOString(),
                deviceClass: classifyDevice(),
                environment: sessionInfo.environment,
              });

              // auth_succeeded event（KpiLifecycle外のhook側で送信するため、ここでは送らない）
              // auth_succeededの送信はuseAuthKpiの責務
            }
            return;
          }

          if (event === 'SIGNED_OUT') {
            stopHeartbeat();
            resetSessionOnLogout();
            lastAuthUserId = null;
            isInitialSession = true;
            // 次回アクセス時に新session
            // heartbeat再起動は不要（未認証状態）
            startSession(null);
            startHeartbeat();
            return;
          }

          if (event === 'TOKEN_REFRESHED') {
            // token refreshは新規認証ではない（計測しない）
            return;
          }
        } catch {
          // auth state handler失敗は無視
        }
      });

      authSubscription = listener.subscription;
    }

    // ---------------------------------------------------------------------------
    // 6. 初回session開始
    // ---------------------------------------------------------------------------
    if (!_lifecycleInitDone) {
      _lifecycleInitDone = true;

      // 現在のauth状態を確認してからsession開始
      supabase.auth.getSession().then(({ data }) => {
        const userId = data.session?.user?.id ?? null;
        startSession(userId);
        startHeartbeat();
      }).catch(() => {
        startSession(null);
        startHeartbeat();
      });
    }

    // ---------------------------------------------------------------------------
    // 7. Activity tracking（click + route変化）
    // ---------------------------------------------------------------------------
    const handleClick = () => recordActivity();

    if (typeof window !== 'undefined') {
      window.addEventListener('click', handleClick, { passive: true });
    }

    // ---------------------------------------------------------------------------
    // Cleanup
    // ---------------------------------------------------------------------------
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('click', handleClick);
      }
      // authSubscriptionは重複登録防止のため、ここではunsubscribeしない
      // （モジュールレベルのフラグで管理）
      void authSubscription; // suppress unused warning
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ---------------------------------------------------------------------------
// Reset helper（テスト用）
// ---------------------------------------------------------------------------

export function resetKpiLifecycle(): void {
  _lifecycleInitDone = false;
  _authListenerRegistered = false;
  _currentSessionId = null;
  _sessionStartedAt = null;
  stopHeartbeat();
  resetTracker();
}

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

export {
  HEARTBEAT_INTERVAL_MS,
  INACTIVITY_TIMEOUT_MS,
  isAiCheckLoginPath,
};
