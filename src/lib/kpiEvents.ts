/**
 * kpiEvents.ts — KPI Event Catalog (Type-safe)
 *
 * Phase 1: Event型定義。任意eventは送信不可の設計。
 * Discriminated union + event map で実装。
 *
 * 保存禁止フィールド（型レベルで除外）:
 *   email, 氏名, raw IP, User-Agent全文, access token,
 *   payment情報, 税務情報, 棋譜, SQL全文, エラーstack全文
 */

// ---------------------------------------------------------------------------
// Utility types
// ---------------------------------------------------------------------------

/** 保存禁止フィールド — これらのキーは properties に含めてはならない */
export type ForbiddenPropKey =
  | 'email'
  | 'name'
  | 'full_name'
  | 'display_name'
  | 'ip'
  | 'ip_address'
  | 'user_agent'
  | 'access_token'
  | 'refresh_token'
  | 'token'
  | 'payment_method'
  | 'card_number'
  | 'tax_id'
  | 'full_record'
  | 'sql'
  | 'stack'
  | 'stack_trace';

/** Forbidden キーを含まないことを強制する型 */
export type NoForbiddenKeys<T> = {
  [K in keyof T]: K extends ForbiddenPropKey ? never : T[K];
};

// ---------------------------------------------------------------------------
// Shared property types
// ---------------------------------------------------------------------------

export type RouteString = string; // max 500 chars enforced at RPC level

export type DeviceClass = 'desktop' | 'mobile' | 'tablet' | 'unknown';

// ---------------------------------------------------------------------------
// Event property map (each event's allowed properties)
// ---------------------------------------------------------------------------

export interface KpiEventPropsMap {
  /** ページ表示 */
  page_view: {
    route: RouteString;
    referrer_route?: string; // internal route only, no full URL
    title?: string;
  };

  /** セッション開始 */
  session_started: {
    referrer_type?: 'direct' | 'internal' | 'external_unknown';
    restored?: boolean; // session restored from storage
  };

  /** セッションハートビート（定期送信） */
  session_heartbeat: {
    route: RouteString;
    elapsed_seconds: number;
  };

  /** 認証フロー開始 */
  auth_started: {
    method?: 'magic_link' | 'oauth' | 'password' | 'unknown';
    route: RouteString;
  };

  /** 認証成功 */
  auth_succeeded: {
    method?: 'magic_link' | 'oauth' | 'password' | 'unknown';
    is_new_user?: boolean;
  };

  /** 認証失敗 */
  auth_failed: {
    method?: 'magic_link' | 'oauth' | 'password' | 'unknown';
    error_code?: string; // Supabase error code only (no message/stack)
  };

  /** 言語変更 */
  language_changed: {
    from_locale: string;
    to_locale: string;
  };

  /** Training開始 */
  training_started: {
    task_id: string;
    move_id: string;
    move_index: number;
    resumed: boolean;
  };

  /** Training Stepへ到達 */
  training_step_reached: {
    task_id: string;
    move_id: string;
    move_index: number;
    step: number;
    total_steps: number;
  };

  /** Training試行（正解・不正解問わず） */
  training_attempted: {
    task_id: string;
    move_id: string;
    step: number;
    attempt_number: number;
    result: 'correct' | 'incorrect';
  };

  /** Training不正解 */
  training_incorrect: {
    task_id: string;
    move_id: string;
    step: number;
    attempt_number: number;
  };

  /** Trainingヒント表示 */
  training_hint_shown: {
    task_id: string;
    move_id: string;
    step: number;
  };

  /** Training次のstepへ進んだ */
  training_step_advanced: {
    task_id: string;
    move_id: string;
    from_step: number;
    to_step: number;
  };

  /** Training再開 */
  training_resumed: {
    task_id: string;
    move_id: string;
    move_index: number;
    step: number;
    last_completed_step: number;
  };

  /** Training完了 */
  training_completed: {
    task_id: string;
    move_id: string;
    move_index: number;
    total_attempts: number;
    elapsed_seconds?: number;
  };

  /** Postmortem開始 */
  postmortem_started: {
    match_mode?: 'human_vs_cpu' | 'online' | 'official' | 'arena' | 'unknown';
    move_count?: number;
  };

  /** Postmortem完了 */
  postmortem_completed: {
    match_mode?: 'human_vs_cpu' | 'online' | 'official' | 'arena' | 'unknown';
    candidate_count?: number;
    elapsed_seconds?: number;
  };

  /** Postmortem失敗（RPC/Worker エラー） */
  postmortem_failed: {
    error_code?: string; // error code only, no stack/message
    stage?: 'rpc' | 'worker' | 'parse' | 'unknown';
  };

  /** Postmortem再取得 */
  postmortem_refreshed: {
    trigger?: 'user' | 'auto';
  };

  /** Postmortem候補一覧を開いた */
  postmortem_candidates_opened: {
    candidate_count?: number;
    position_index?: number;
  };

  /** Pro機能を使用した */
  pro_feature_used: {
    feature_name: string;
    route: RouteString;
  };

  /** フロントエンドエラー */
  frontend_error: {
    error_code?: string;
    error_type?: string; // TypeError, ReferenceError, etc.
    component?: string; // Component name (no PII)
    route: RouteString;
    // stack全文は保存禁止
  };

  /** RPC呼び出しエラー */
  rpc_error: {
    rpc_name: string;
    error_code?: string; // Supabase/Postgres error code only
    route: RouteString;
  };

  /** Realtime再接続 */
  realtime_reconnected: {
    channel?: string;
    attempt_number?: number;
    elapsed_since_disconnect_seconds?: number;
  };

  /** パフォーマンス計測 */
  performance_measure: {
    metric_name: string; // e.g. 'postmortem_rpc_latency', 'page_load'
    value_ms: number;
    route?: RouteString;
  };
}

// ---------------------------------------------------------------------------
// Event name union
// ---------------------------------------------------------------------------

export type KpiEventName = keyof KpiEventPropsMap;

/** 全許可eventリスト（ランタイム検証用） */
export const ALLOWED_KPI_EVENT_NAMES: readonly KpiEventName[] = [
  'page_view',
  'session_started',
  'session_heartbeat',
  'auth_started',
  'auth_succeeded',
  'auth_failed',
  'language_changed',
  'training_started',
  'training_step_reached',
  'training_attempted',
  'training_incorrect',
  'training_hint_shown',
  'training_step_advanced',
  'training_resumed',
  'training_completed',
  'postmortem_started',
  'postmortem_completed',
  'postmortem_failed',
  'postmortem_refreshed',
  'postmortem_candidates_opened',
  'pro_feature_used',
  'frontend_error',
  'rpc_error',
  'realtime_reconnected',
  'performance_measure',
] as const;

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

export type KpiEvent = {
  [K in KpiEventName]: {
    name: K;
    properties: KpiEventPropsMap[K];
  };
}[KpiEventName];

// ---------------------------------------------------------------------------
// Forbidden keys list (runtime validation)
// ---------------------------------------------------------------------------

export const FORBIDDEN_PROP_KEYS: readonly string[] = [
  'email',
  'name',
  'full_name',
  'display_name',
  'ip',
  'ip_address',
  'user_agent',
  'access_token',
  'refresh_token',
  'token',
  'payment_method',
  'card_number',
  'tax_id',
  'full_record',
  'sql',
  'stack',
  'stack_trace',
] as const;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * event名が許可リストに含まれているか検証
 */
export function isAllowedEventName(name: unknown): name is KpiEventName {
  return (
    typeof name === 'string' &&
    (ALLOWED_KPI_EVENT_NAMES as readonly string[]).includes(name)
  );
}

/**
 * propertiesに禁止キーが含まれていないか検証
 */
export function hasForbiddenKeys(properties: Record<string, unknown>): boolean {
  return Object.keys(properties).some((key) =>
    FORBIDDEN_PROP_KEYS.includes(key)
  );
}

/**
 * propertiesのJSONサイズが上限（10KB）以内か検証
 */
export function isPropertiesWithinSizeLimit(
  properties: Record<string, unknown>,
  maxBytes = 10_240
): boolean {
  try {
    const serialized = JSON.stringify(properties);
    return new TextEncoder().encode(serialized).length <= maxBytes;
  } catch {
    return false;
  }
}

/**
 * routeが最大500文字以内か検証
 */
export function isRouteValid(route: string): boolean {
  return route.length <= 500;
}
