/**
 * kpiTracker.ts — KPI Event Tracker
 *
 * 設計方針:
 * - TypeScript event map（kpiEvents.tsの型を使用）
 * - fire-and-forget（UIをブロックしない）
 * - batching（デフォルト2秒 or 10件でflush）
 * - offline queue（上限50件）
 * - retry上限3回（exponential backoff）
 * - idempotency（送信前にidempotency_key生成）
 * - tracker失敗を再計測してループしない
 * - device/OS/browserは粗い分類のみ（User-Agent全文を保存しない）
 * - fingerprinting禁止
 * - user_idを外部引数として自由指定できない（auth.uid()から決定）
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type KpiEventName,
  type KpiEventPropsMap,
  isAllowedEventName,
  hasForbiddenKeys,
  isPropertiesWithinSizeLimit,
  isRouteValid,
} from './kpiEvents';
import {
  getSessionInfo,
  classifyDevice,
  classifyOsFamily,
  classifyBrowserFamily,
  type KpiEnvironment,
} from './kpiSession';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BATCH_INTERVAL_MS = 2_000;
const BATCH_MAX_SIZE = 10;
const OFFLINE_QUEUE_MAX = 50;
const MAX_RETRY = 3;
const RETRY_BASE_DELAY_MS = 500;
const ROUTE_MAX_LEN = 500;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface PendingEvent {
  eventName: string;
  properties: Record<string, unknown>;
  occurredAt: string;
  idempotencyKey: string;
  retryCount: number;
}

// ---------------------------------------------------------------------------
// Tracker state (module-level singleton)
// ---------------------------------------------------------------------------

let _supabase: SupabaseClient | null = null;
let _batchTimer: ReturnType<typeof setTimeout> | null = null;
let _queue: PendingEvent[] = [];
let _offlineQueue: PendingEvent[] = [];
let _appVersion: string | undefined;
let _locale: string | undefined;
let _flushing = false;
let _initialized = false;

// ---------------------------------------------------------------------------
// idempotency key generation
// ---------------------------------------------------------------------------

function generateIdempotencyKey(
  eventName: string,
  sessionId: string,
  occurredAt: string
): string {
  // タブ内で一意: eventName + sessionId + timestamp + random
  const rand = Math.random().toString(36).slice(2, 10);
  return `${sessionId}:${eventName}:${occurredAt}:${rand}`;
}

// ---------------------------------------------------------------------------
// Truncate route
// ---------------------------------------------------------------------------

function truncateRoute(route: string): string {
  if (route.length <= ROUTE_MAX_LEN) return route;
  return route.slice(0, ROUTE_MAX_LEN);
}

// ---------------------------------------------------------------------------
// Sanitize properties (remove forbidden keys at runtime)
// ---------------------------------------------------------------------------

function sanitizeProperties(
  properties: Record<string, unknown>
): Record<string, unknown> {
  // 型レベルで除外済みだが、ランタイムでも二重チェック
  const FORBIDDEN = [
    'email', 'name', 'full_name', 'display_name',
    'ip', 'ip_address', 'user_agent',
    'access_token', 'refresh_token', 'token',
    'payment_method', 'card_number', 'tax_id',
    'full_record', 'sql', 'stack', 'stack_trace',
  ];
  return Object.fromEntries(
    Object.entries(properties).filter(([key]) => !FORBIDDEN.includes(key))
  );
}

// ---------------------------------------------------------------------------
// Flush logic
// ---------------------------------------------------------------------------

async function flushBatch(events: PendingEvent[]): Promise<void> {
  if (!_supabase || events.length === 0) return;

  const session = getSessionInfo();
  const deviceClass = classifyDevice();
  const osFam = classifyOsFamily();
  const browserFam = classifyBrowserFamily();

  const results = await Promise.allSettled(
    events.map((ev) =>
      _supabase!.rpc('track_kpi_event', {
        p_event_name: ev.eventName,
        p_anonymous_id: session.anonymousId,
        p_session_id: session.sessionId,
        p_occurred_at: ev.occurredAt,
        p_locale: _locale ?? null,
        p_route: (ev.properties as Record<string, unknown>)['route']
          ? truncateRoute(String((ev.properties as Record<string, unknown>)['route']))
          : null,
        p_device_class: deviceClass,
        p_os_family: osFam,
        p_browser_family: browserFam,
        p_app_version: _appVersion ?? null,
        p_properties: ev.properties,
        p_idempotency_key: ev.idempotencyKey,
        p_environment: session.environment,
      })
    )
  );

  // 失敗したイベントをリトライキューへ
  results.forEach((result, i) => {
    const ev = events[i];
    if (!ev) return;
    if (result.status === 'rejected') {
      if (ev.retryCount < MAX_RETRY) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, ev.retryCount);
        const retryEv: PendingEvent = {
          eventName: ev.eventName,
          properties: ev.properties,
          occurredAt: ev.occurredAt,
          idempotencyKey: ev.idempotencyKey,
          retryCount: ev.retryCount + 1,
        };
        setTimeout(() => {
          if (_queue.length < OFFLINE_QUEUE_MAX) {
            _queue.push(retryEv);
          }
        }, delay);
      }
      // MAX_RETRY超えたら静かに破棄
    }
  });
}

async function flushQueue(): Promise<void> {
  if (_flushing || _queue.length === 0) return;
  _flushing = true;

  const batch = _queue.splice(0, BATCH_MAX_SIZE);
  try {
    // オフラインチェック
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      // オフライン: offline queueへ移動
      const overflow = [...batch, ..._queue].slice(0, OFFLINE_QUEUE_MAX);
      _offlineQueue = overflow;
      _queue = [];
    } else {
      // オフラインキューも一緒に送信
      if (_offlineQueue.length > 0) {
        const offlineBatch = _offlineQueue.splice(0);
        await flushBatch(offlineBatch);
      }
      await flushBatch(batch);
    }
  } finally {
    _flushing = false;
    // 残りがあれば継続
    if (_queue.length > 0) {
      scheduleBatch();
    }
  }
}

function scheduleBatch(): void {
  if (_batchTimer !== null) return;
  _batchTimer = setTimeout(() => {
    _batchTimer = null;
    flushQueue().catch(() => {
      // tracker自身のエラーは無視（再計測ループ防止）
    });
  }, BATCH_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Trackerを初期化する
 * @param supabaseClient Supabaseクライアント
 * @param options オプション（appVersion, locale）
 */
export function initKpiTracker(
  supabaseClient: SupabaseClient,
  options?: {
    appVersion?: string;
    locale?: string;
  }
): void {
  _supabase = supabaseClient;
  _appVersion = options?.appVersion;
  _locale = options?.locale;
  _initialized = true;

  // オンライン復帰時にオフラインキューをflush
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      if (_offlineQueue.length > 0) {
        _queue.unshift(..._offlineQueue.splice(0));
        scheduleBatch();
      }
    });
  }
}

/**
 * ロケールを設定する（言語変更時に呼ぶ）
 */
export function setTrackerLocale(locale: string): void {
  _locale = locale;
}

/**
 * KPI eventをトラック（fire-and-forget）
 *
 * @example
 * track('page_view', { route: '/training' });
 * track('training_started', { task_id: 't1', move_id: 'm1', move_index: 0, resumed: false });
 */
export function track<E extends KpiEventName>(
  name: E,
  props: KpiEventPropsMap[E]
): void {
  if (!_initialized || !_supabase) return;

  // event名検証
  if (!isAllowedEventName(name)) {
    // 未知のeventは静かに破棄（エラーthrowしない）
    return;
  }

  const properties = sanitizeProperties(props as Record<string, unknown>);

  // 禁止キー検証（sanitize前に元のpropsを確認）
  if (hasForbiddenKeys(props as Record<string, unknown>)) {
    // 禁止キー含む場合は静かに破棄
    return;
  }

  // payloadサイズ検証
  if (!isPropertiesWithinSizeLimit(properties)) {
    // 10KB超は破棄
    return;
  }

  // route検証
  if ('route' in properties && typeof properties['route'] === 'string') {
    if (!isRouteValid(properties['route'])) {
      properties['route'] = truncateRoute(properties['route']);
    }
  }

  const session = getSessionInfo();
  const occurredAt = new Date().toISOString();
  const idempotencyKey = generateIdempotencyKey(
    name,
    session.sessionId,
    occurredAt
  );

  const pending: PendingEvent = {
    eventName: name,
    properties,
    occurredAt,
    idempotencyKey,
    retryCount: 0,
  };

  // キューへ追加（オーバーフロー時は古いものから破棄）
  if (_queue.length >= OFFLINE_QUEUE_MAX) {
    _queue.shift(); // 最古を破棄
  }
  _queue.push(pending);

  // バッチタイマーを起動
  if (_queue.length >= BATCH_MAX_SIZE) {
    // 10件溜まったら即flush
    if (_batchTimer !== null) {
      clearTimeout(_batchTimer);
      _batchTimer = null;
    }
    flushQueue().catch(() => {});
  } else {
    scheduleBatch();
  }
}

/**
 * 即時flush（テスト・ページアンロード時用）
 */
export async function flushNow(): Promise<void> {
  if (_batchTimer !== null) {
    clearTimeout(_batchTimer);
    _batchTimer = null;
  }
  await flushQueue();
}

/**
 * 初期化状態を返す（テスト用）
 */
export function isTrackerInitialized(): boolean {
  return _initialized;
}

/**
 * 内部キューを返す（テスト用）
 */
export function getQueueSnapshot(): readonly PendingEvent[] {
  return [..._queue];
}

/**
 * Trackerをリセット（テスト用）
 */
export function resetTracker(): void {
  if (_batchTimer !== null) {
    clearTimeout(_batchTimer);
    _batchTimer = null;
  }
  _supabase = null;
  _queue = [];
  _offlineQueue = [];
  _appVersion = undefined;
  _locale = undefined;
  _flushing = false;
  _initialized = false;
}
