/**
 * kpiSession.ts — KPI Session管理
 *
 * - anonymous_idはlocalStorageに永続化（ONE EIGHT内のランダムUUID）
 * - session_idはsessionStorageに保存（タブ単位）
 * - ログアウト時にsession_idをリセット（anonymous_idは保持）
 * - 別ユーザーへの誤session接続防止
 * - upsert_kpi_sessionをRPC経由で呼ぶ
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeviceClass } from './kpiEvents';

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const ANON_ID_KEY = 'one_eight_kpi_anonymous_id';
const SESSION_ID_KEY = 'one_eight_kpi_session_id';
const SESSION_USER_KEY = 'one_eight_kpi_session_user_id';
const SESSION_STARTED_KEY = 'one_eight_kpi_session_started_at';

// ---------------------------------------------------------------------------
// Environment detection
// ---------------------------------------------------------------------------

export type KpiEnvironment =
  | 'production'
  | 'staging'
  | 'development'
  | 'test';

export function detectEnvironment(): KpiEnvironment {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const mode = import.meta.env.MODE;
    const prod = import.meta.env.PROD;
    if (prod === true || mode === 'production') return 'production';
    if (mode === 'staging') return 'staging';
    if (mode === 'test') return 'test';
    return 'development';
  }
  return 'development';
}

// ---------------------------------------------------------------------------
// UUID helpers
// ---------------------------------------------------------------------------

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------------
// Storage helpers (safe: catches errors)
// ---------------------------------------------------------------------------

function safeLocalGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage errors
  }
}

function safeSessionGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // ignore storage errors
  }
}

function safeSessionRemove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Device classification (粗い分類のみ。User-Agent全文は保存しない)
// ---------------------------------------------------------------------------

export function classifyDevice(): DeviceClass {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) {
    if (/iPad/i.test(ua) || (navigator.maxTouchPoints > 1 && !/Mobi/i.test(ua))) {
      return 'tablet';
    }
    return 'mobile';
  }
  return 'desktop';
}

export function classifyOsFamily(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macos';
  if (/Linux/i.test(ua)) return 'linux';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'unknown';
}

export function classifyBrowserFamily(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/Edg\//i.test(ua)) return 'edge';
  if (/OPR\//i.test(ua)) return 'opera';
  if (/Chrome\//i.test(ua)) return 'chrome';
  if (/Firefox\//i.test(ua)) return 'firefox';
  if (/Safari\//i.test(ua)) return 'safari';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

export interface KpiSessionInfo {
  anonymousId: string;
  sessionId: string;
  startedAt: string; // ISO string
  environment: KpiEnvironment;
}

let _sessionInfo: KpiSessionInfo | null = null;

/**
 * anonymous_idを取得または生成（localStorage永続化）
 */
export function getOrCreateAnonymousId(): string {
  let anonId = safeLocalGet(ANON_ID_KEY);
  if (!anonId) {
    anonId = generateUUID();
    safeLocalSet(ANON_ID_KEY, anonId);
  }
  return anonId;
}

/**
 * session_idを取得または生成（sessionStorage = タブ単位）
 * ログアウト時はリセット済みなので新規生成になる
 */
export function getOrCreateSessionId(currentUserId?: string | null): string {
  let sessionId = safeSessionGet(SESSION_ID_KEY);
  const sessionUserId = safeSessionGet(SESSION_USER_KEY);

  // 別ユーザーへの誤session接続防止:
  // sessionStorageにuser_idが保存されていて、かつ現在のuser_idと異なる場合は新規session
  if (sessionId && sessionUserId && currentUserId && sessionUserId !== currentUserId) {
    // 別ユーザー: sessionをリセット
    safeSessionRemove(SESSION_ID_KEY);
    safeSessionRemove(SESSION_USER_KEY);
    safeSessionRemove(SESSION_STARTED_KEY);
    sessionId = null;
  }

  if (!sessionId) {
    sessionId = generateUUID();
    const now = new Date().toISOString();
    safeSessionSet(SESSION_ID_KEY, sessionId);
    safeSessionSet(SESSION_STARTED_KEY, now);
    if (currentUserId) {
      safeSessionSet(SESSION_USER_KEY, currentUserId);
    }
  }

  return sessionId;
}

/**
 * ログアウト時: session_idをリセット（anonymous_idは保持）
 */
export function resetSessionOnLogout(): void {
  safeSessionRemove(SESSION_ID_KEY);
  safeSessionRemove(SESSION_USER_KEY);
  safeSessionRemove(SESSION_STARTED_KEY);
  _sessionInfo = null;
}

/**
 * ログイン成功後: sessionにuser_idを関連付け
 * 別ユーザーへの誤接続を防ぐため、session_idを新規生成する
 */
export function onUserAuthenticated(userId: string): void {
  const sessionUserId = safeSessionGet(SESSION_USER_KEY);
  if (sessionUserId && sessionUserId !== userId) {
    // 別ユーザー: 新規session
    resetSessionOnLogout();
  }
  safeSessionSet(SESSION_USER_KEY, userId);
  _sessionInfo = null; // force re-init
}

/**
 * セッション情報を初期化・取得
 */
export function initSession(currentUserId?: string | null): KpiSessionInfo {
  const anonymousId = getOrCreateAnonymousId();
  const sessionId = getOrCreateSessionId(currentUserId);
  const startedAt = safeSessionGet(SESSION_STARTED_KEY) ?? new Date().toISOString();
  const environment = detectEnvironment();

  _sessionInfo = { anonymousId, sessionId, startedAt, environment };
  return _sessionInfo;
}

/**
 * 現在のセッション情報を取得（未初期化なら初期化）
 */
export function getSessionInfo(currentUserId?: string | null): KpiSessionInfo {
  if (!_sessionInfo) {
    return initSession(currentUserId);
  }
  return _sessionInfo;
}

// ---------------------------------------------------------------------------
// Supabase RPC: upsert_kpi_session
// ---------------------------------------------------------------------------

export interface UpsertKpiSessionParams {
  sessionId: string;
  anonymousId: string;
  startedAt: string;
  lastSeenAt: string;
  firstRoute?: string;
  locale?: string;
  deviceClass?: DeviceClass;
  environment: KpiEnvironment;
}

/**
 * kpi_sessionsテーブルをRPC経由でupsert
 * fire-and-forget（エラーは無視）
 */
export async function upsertKpiSession(
  supabase: SupabaseClient,
  params: UpsertKpiSessionParams
): Promise<void> {
  try {
    await supabase.rpc('upsert_kpi_session', {
      p_session_id: params.sessionId,
      p_anonymous_id: params.anonymousId,
      p_started_at: params.startedAt,
      p_last_seen_at: params.lastSeenAt,
      p_first_route: params.firstRoute ?? null,
      p_locale: params.locale ?? null,
      p_device_class: params.deviceClass ?? null,
      p_environment: params.environment,
    });
  } catch {
    // session upsert失敗はサイレントに無視
  }
}
