-- =============================================================================
-- 20260809195845_kpi_phase1_rpcs.sql
-- KPI Phase 1: RPC関数定義
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 許可eventリスト（ランタイム検証用）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._kpi_allowed_event_names()
RETURNS TEXT[]
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY[
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
    'performance_measure'
  ]::TEXT[];
$$;

COMMENT ON FUNCTION public._kpi_allowed_event_names() IS
  'Returns the list of allowed KPI event names. Used by track_kpi_event() for validation.';

-- ---------------------------------------------------------------------------
-- track_kpi_event — event送信RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.track_kpi_event(
  p_event_name        TEXT,
  p_anonymous_id      UUID,
  p_session_id        UUID,
  p_occurred_at       TIMESTAMPTZ,
  p_locale            TEXT        DEFAULT NULL,
  p_route             TEXT        DEFAULT NULL,
  p_device_class      TEXT        DEFAULT NULL,
  p_os_family         TEXT        DEFAULT NULL,
  p_browser_family    TEXT        DEFAULT NULL,
  p_app_version       TEXT        DEFAULT NULL,
  p_properties        JSONB       DEFAULT '{}',
  p_idempotency_key   TEXT        DEFAULT NULL,
  p_environment       TEXT        DEFAULT 'production'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id         UUID;
  v_idem_key        TEXT;
  v_props_text      TEXT;
  v_props_bytes     INTEGER;
BEGIN
  -- 1. event名検証（許可リストのみ）
  IF p_event_name IS NULL OR NOT (p_event_name = ANY(_kpi_allowed_event_names())) THEN
    RAISE EXCEPTION 'track_kpi_event: unknown event_name: %', p_event_name
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 2. environment検証
  IF p_environment IS NULL OR p_environment NOT IN ('production','staging','development','test') THEN
    RAISE EXCEPTION 'track_kpi_event: invalid environment: %', p_environment
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 3. route長検証
  IF p_route IS NOT NULL AND char_length(p_route) > 500 THEN
    p_route := left(p_route, 500);
  END IF;

  -- 4. device_class検証
  IF p_device_class IS NOT NULL AND p_device_class NOT IN ('desktop','mobile','tablet','unknown') THEN
    p_device_class := 'unknown';
  END IF;

  -- 5. propertiesサイズ上限（10KB）
  IF p_properties IS NOT NULL THEN
    v_props_text  := p_properties::TEXT;
    v_props_bytes := octet_length(v_props_text);
    IF v_props_bytes > 10240 THEN
      RAISE EXCEPTION 'track_kpi_event: properties exceed 10KB limit (% bytes)', v_props_bytes
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
  END IF;

  -- 6. user_id は auth.uid() から決定（client指定を信用しない）
  v_user_id := auth.uid();

  -- 7. idempotency_key
  IF p_idempotency_key IS NULL OR p_idempotency_key = '' THEN
    v_idem_key := gen_random_uuid()::TEXT;
  ELSE
    v_idem_key := p_idempotency_key;
  END IF;

  -- 8. 重複チェック（idempotency）→ silent return
  IF EXISTS (SELECT 1 FROM kpi_events WHERE idempotency_key = v_idem_key) THEN
    RETURN;
  END IF;

  -- 9. INSERT
  INSERT INTO kpi_events (
    occurred_at,
    received_at,
    event_name,
    user_id,
    anonymous_id,
    session_id,
    locale,
    route,
    device_class,
    os_family,
    browser_family,
    app_version,
    properties,
    idempotency_key,
    environment
  ) VALUES (
    COALESCE(p_occurred_at, now()),
    now(),
    p_event_name,
    v_user_id,
    p_anonymous_id,
    p_session_id,
    p_locale,
    p_route,
    COALESCE(p_device_class, 'unknown'),
    p_os_family,
    p_browser_family,
    p_app_version,
    COALESCE(p_properties, '{}'),
    v_idem_key,
    p_environment
  );
END;
$$;

COMMENT ON FUNCTION public.track_kpi_event IS
  'KPI event送信RPC。user_idはauth.uid()から決定。event名は許可リストのみ。idempotency対応。';

-- anon / authenticated から実行可能
GRANT EXECUTE ON FUNCTION public.track_kpi_event TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- upsert_kpi_session — セッションupsert RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_kpi_session(
  p_session_id    UUID,
  p_anonymous_id  UUID,
  p_started_at    TIMESTAMPTZ,
  p_last_seen_at  TIMESTAMPTZ,
  p_first_route   TEXT        DEFAULT NULL,
  p_locale        TEXT        DEFAULT NULL,
  p_device_class  TEXT        DEFAULT NULL,
  p_environment   TEXT        DEFAULT 'production'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id         UUID;
  v_auth_at         TIMESTAMPTZ;
  v_existing_uid    UUID;
BEGIN
  -- environment検証
  IF p_environment IS NULL OR p_environment NOT IN ('production','staging','development','test') THEN
    RAISE EXCEPTION 'upsert_kpi_session: invalid environment: %', p_environment
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- device_class検証
  IF p_device_class IS NOT NULL AND p_device_class NOT IN ('desktop','mobile','tablet','unknown') THEN
    p_device_class := 'unknown';
  END IF;

  -- user_id は auth.uid() から取得
  v_user_id := auth.uid();

  -- 別ユーザーへの誤session接続防止:
  -- 既存sessionのuser_idが異なる場合はuser_idを更新しない
  SELECT user_id INTO v_existing_uid
    FROM kpi_sessions WHERE session_id = p_session_id;

  IF v_existing_uid IS NOT NULL
     AND v_user_id IS NOT NULL
     AND v_existing_uid != v_user_id THEN
    -- 別ユーザーが同じsession_idを使おうとしている→エラー
    RAISE EXCEPTION 'upsert_kpi_session: session belongs to a different user'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- authenticated_at: 今回初めてuser_idが確定した場合のみ設定
  IF v_user_id IS NOT NULL AND v_existing_uid IS NULL THEN
    v_auth_at := now();
  ELSE
    v_auth_at := NULL;
  END IF;

  INSERT INTO kpi_sessions (
    session_id,
    anonymous_id,
    user_id,
    started_at,
    last_seen_at,
    first_route,
    locale,
    device_class,
    authenticated_at,
    environment
  ) VALUES (
    p_session_id,
    p_anonymous_id,
    v_user_id,
    p_started_at,
    p_last_seen_at,
    p_first_route,
    p_locale,
    COALESCE(p_device_class, 'unknown'),
    v_auth_at,
    p_environment
  )
  ON CONFLICT (session_id) DO UPDATE
    SET last_seen_at    = EXCLUDED.last_seen_at,
        locale          = COALESCE(EXCLUDED.locale, kpi_sessions.locale),
        user_id         = COALESCE(EXCLUDED.user_id, kpi_sessions.user_id),
        authenticated_at = CASE
          WHEN kpi_sessions.user_id IS NULL AND EXCLUDED.user_id IS NOT NULL
          THEN now()
          ELSE kpi_sessions.authenticated_at
        END;
END;
$$;

COMMENT ON FUNCTION public.upsert_kpi_session IS
  'KPI sessionのupsert RPC。user_idはauth.uid()から決定。別ユーザーへの誤接続防止あり。';

GRANT EXECUTE ON FUNCTION public.upsert_kpi_session TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- admin_get_kpi_settings — Admin settings取得RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_get_kpi_settings()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID;
  v_is_admin BOOLEAN;
  v_result  JSONB;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'admin_get_kpi_settings: not authenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_uid;
  IF v_is_admin IS NULL OR v_is_admin = FALSE THEN
    RAISE EXCEPTION 'admin_get_kpi_settings: admin required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT jsonb_build_object(
    'id',                        id,
    'official_kpi_start_at',     official_kpi_start_at,
    'raw_event_retention_days',  raw_event_retention_days,
    'updated_at',                updated_at,
    'updated_by',                updated_by
  ) INTO v_result
  FROM kpi_settings WHERE id = 1;

  RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_kpi_settings TO authenticated;

-- ---------------------------------------------------------------------------
-- admin_update_kpi_settings — Admin settings更新RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_update_kpi_settings(
  p_official_kpi_start_at     TIMESTAMPTZ DEFAULT NULL,
  p_raw_event_retention_days  INTEGER     DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      UUID;
  v_is_admin BOOLEAN;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'admin_update_kpi_settings: not authenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_uid;
  IF v_is_admin IS NULL OR v_is_admin = FALSE THEN
    RAISE EXCEPTION 'admin_update_kpi_settings: admin required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE kpi_settings
    SET official_kpi_start_at    = COALESCE(p_official_kpi_start_at, official_kpi_start_at),
        raw_event_retention_days = COALESCE(p_raw_event_retention_days, raw_event_retention_days),
        updated_at               = now(),
        updated_by               = v_uid
  WHERE id = 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_kpi_settings TO authenticated;

-- ---------------------------------------------------------------------------
-- admin_get_kpi_event_catalog_summary — Event catalog概要RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_get_kpi_event_catalog_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      UUID;
  v_is_admin BOOLEAN;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'admin_get_kpi_event_catalog_summary: not authenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_uid;
  IF v_is_admin IS NULL OR v_is_admin = FALSE THEN
    RAISE EXCEPTION 'admin_get_kpi_event_catalog_summary: admin required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'allowed_event_names', _kpi_allowed_event_names(),
    'total_events_count',  (SELECT COUNT(*) FROM kpi_events WHERE environment = 'production'),
    'oldest_event_at',     (SELECT MIN(occurred_at) FROM kpi_events WHERE environment = 'production'),
    'newest_event_at',     (SELECT MAX(occurred_at) FROM kpi_events WHERE environment = 'production'),
    'distinct_sessions',   (SELECT COUNT(DISTINCT session_id) FROM kpi_events WHERE environment = 'production'),
    'distinct_users',      (SELECT COUNT(DISTINCT user_id) FROM kpi_events WHERE environment = 'production' AND user_id IS NOT NULL)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_kpi_event_catalog_summary TO authenticated;

-- ---------------------------------------------------------------------------
-- cleanup_old_kpi_events — 保持期間管理関数
-- ---------------------------------------------------------------------------
-- pg_cronが利用できない場合は関数のみ用意（cron設定はしない）
-- pg_cron確認後、必要に応じて呼び出しをスケジュールすること

CREATE OR REPLACE FUNCTION public.cleanup_old_kpi_events()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_retention INTEGER;
  v_deleted   INTEGER;
  v_cutoff    TIMESTAMPTZ;
BEGIN
  SELECT raw_event_retention_days INTO v_retention
    FROM kpi_settings WHERE id = 1;

  v_cutoff := now() - (v_retention || ' days')::INTERVAL;

  DELETE FROM kpi_events
    WHERE occurred_at < v_cutoff;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.cleanup_old_kpi_events IS
  'kpi_eventsの古いレコードを削除。raw_event_retention_days設定に基づく。pg_cronで定期実行推奨。';

-- service_roleのみ実行可（cronから呼ぶ場合も service_role 経由）
REVOKE EXECUTE ON FUNCTION public.cleanup_old_kpi_events FROM anon, authenticated;
