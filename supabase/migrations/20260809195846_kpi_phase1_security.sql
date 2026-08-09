-- =============================================================================
-- 20260809195846_kpi_phase1_security.sql
-- KPI Phase 1 Security Hardening
-- 
-- 変更内容:
--   1. PUBLIC EXECUTE権限修正（REVOKE/GRANT）
--   2. DB側event properties検証強化（PII check, ネスト禁止, key数制限, 文字列長制限）
--   3. timestamp検証（未来5分超拒否, 過去7日超拒否）
--   4. session所有関係の強化（anon/user/env mismatch拒否）
--   5. rate-limit（kpi_rate_limitテーブル + _kpi_check_rate_limit関数）
--   6. idempotency競合対策（ON CONFLICT DO NOTHING）
--   7. settings validation（retention_days 30-730範囲）
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 【1】補助: PII keyチェック関数
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._kpi_check_pii_keys(p_obj JSONB)
RETURNS BOOLEAN  -- TRUE = PII found
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_forbidden TEXT[] := ARRAY[
    'email','name','full_name','display_name','ip','ip_address','user_agent',
    'access_token','refresh_token','token','authorization','cookie',
    'payment_method','card_number','tax_id','full_record','game_record',
    'sql','stack','stack_trace','error_message'
  ];
  v_key TEXT;
  v_val JSONB;
BEGIN
  FOR v_key IN SELECT jsonb_object_keys(p_obj) LOOP
    -- 大文字小文字無視でチェック
    IF lower(v_key) = ANY(
      ARRAY(SELECT lower(unnest(v_forbidden)))
    ) THEN
      RETURN TRUE;
    END IF;
    v_val := p_obj -> v_key;
    IF jsonb_typeof(v_val) = 'object' THEN
      IF _kpi_check_pii_keys(v_val) THEN RETURN TRUE; END IF;
    END IF;
  END LOOP;
  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public._kpi_check_pii_keys(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._kpi_check_pii_keys(JSONB) FROM anon;
REVOKE ALL ON FUNCTION public._kpi_check_pii_keys(JSONB) FROM authenticated;

-- ---------------------------------------------------------------------------
-- 【5】rate-limit テーブル + 関数
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS kpi_rate_limit (
  bucket_key    TEXT        NOT NULL,
  window_start  TIMESTAMPTZ NOT NULL,
  request_count INTEGER     NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_kpi_rate_limit_window_start
  ON kpi_rate_limit (window_start);

ALTER TABLE kpi_rate_limit ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'kpi_rate_limit'
      AND policyname = 'kpi_rate_limit_deny_all'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "kpi_rate_limit_deny_all"
        ON kpi_rate_limit
        FOR ALL
        TO anon, authenticated
        USING (false)
    $pol$;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._kpi_check_rate_limit(
  p_bucket_key  TEXT,
  p_limit       INTEGER,
  p_window_secs INTEGER DEFAULT 60
)
RETURNS BOOLEAN  -- TRUE = allowed, FALSE = rate limited
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window  TIMESTAMPTZ;
  v_count   INTEGER;
BEGIN
  -- 1分ウィンドウの開始時刻（分単位切り捨て）
  v_window := date_trunc('minute', now());

  -- 古いウィンドウを掃除（1時間超）
  DELETE FROM kpi_rate_limit WHERE window_start < now() - INTERVAL '1 hour';

  INSERT INTO kpi_rate_limit (bucket_key, window_start, request_count)
  VALUES (p_bucket_key, v_window, 1)
  ON CONFLICT (bucket_key, window_start) DO UPDATE
    SET request_count = kpi_rate_limit.request_count + 1
  RETURNING request_count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public._kpi_check_rate_limit(TEXT,INTEGER,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._kpi_check_rate_limit(TEXT,INTEGER,INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public._kpi_check_rate_limit(TEXT,INTEGER,INTEGER) FROM authenticated;

-- ---------------------------------------------------------------------------
-- 【1】_kpi_allowed_event_names: PUBLIC/anon/authenticatedからREVOKE
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public._kpi_allowed_event_names() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._kpi_allowed_event_names() FROM anon;
REVOKE ALL ON FUNCTION public._kpi_allowed_event_names() FROM authenticated;

-- ---------------------------------------------------------------------------
-- 【全面再定義】track_kpi_event
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
  v_bucket_key      TEXT;
  v_k               TEXT;
  v_v               JSONB;
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

  -- 【3】occurred_at NULL fallback
  p_occurred_at := COALESCE(p_occurred_at, now());

  -- 【3】未来拒否（5分超）
  IF p_occurred_at > now() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'KPI_EVENT_FUTURE_TIMESTAMP'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 【3】過去拒否（7日超）
  IF p_occurred_at < now() - INTERVAL '7 days' THEN
    RAISE EXCEPTION 'KPI_EVENT_TOO_OLD'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 【2】properties構造検証
  IF p_properties IS NOT NULL THEN
    -- TOP levelのみkey数チェック（最大20key）
    IF (SELECT count(*) FROM jsonb_object_keys(p_properties)) > 20 THEN
      RAISE EXCEPTION 'KPI_PROPS_TOO_MANY_KEYS'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- PII keyチェック（再帰）
    IF _kpi_check_pii_keys(p_properties) THEN
      RAISE EXCEPTION 'KPI_PROPS_PII_KEY_DETECTED'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- 配列・ネストobjectチェック（top levelのvalueがobjectや配列は不可）
    FOR v_k, v_v IN SELECT key, value FROM jsonb_each(p_properties) LOOP
      IF jsonb_typeof(v_v) IN ('object', 'array') THEN
        RAISE EXCEPTION 'KPI_PROPS_NESTED_NOT_ALLOWED: key=%', v_k
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      -- 文字列長上限 500文字
      IF jsonb_typeof(v_v) = 'string' AND char_length(v_v #>> '{}') > 500 THEN
        RAISE EXCEPTION 'KPI_PROPS_STRING_TOO_LONG: key=%', v_k
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
    END LOOP;
  END IF;

  -- 【2】event別properties検証（最低限）
  CASE p_event_name
    WHEN 'session_heartbeat' THEN
      IF (p_properties->>'elapsed_seconds') IS NOT NULL THEN
        IF NOT (p_properties->>'elapsed_seconds')::TEXT ~ '^[0-9]+(\.[0-9]+)?$' THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_TYPE: elapsed_seconds must be numeric'
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;
    WHEN 'frontend_error', 'rpc_error' THEN
      IF (p_properties->>'error_code') IS NOT NULL AND char_length(p_properties->>'error_code') > 100 THEN
        RAISE EXCEPTION 'KPI_PROPS_ERROR_CODE_TOO_LONG'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_properties->>'component') IS NOT NULL AND char_length(p_properties->>'component') > 100 THEN
        RAISE EXCEPTION 'KPI_PROPS_COMPONENT_TOO_LONG'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_properties->>'rpc_name') IS NOT NULL AND char_length(p_properties->>'rpc_name') > 100 THEN
        RAISE EXCEPTION 'KPI_PROPS_RPC_NAME_TOO_LONG'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
    ELSE NULL;
  END CASE;

  -- 6. user_id は auth.uid() から決定（client指定を信用しない）
  v_user_id := auth.uid();

  -- 7. idempotency_key
  IF p_idempotency_key IS NULL OR p_idempotency_key = '' THEN
    v_idem_key := gen_random_uuid()::TEXT;
  ELSE
    v_idem_key := p_idempotency_key;
  END IF;

  -- 【6】idempotency_key長さ上限（200文字）
  IF v_idem_key IS NOT NULL AND char_length(v_idem_key) > 200 THEN
    RAISE EXCEPTION 'KPI_IDEMPOTENCY_KEY_TOO_LONG'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 【5】rate-limit
  v_bucket_key := CASE
    WHEN v_user_id IS NOT NULL THEN 'uid:' || v_user_id::TEXT
    ELSE 'anon:' || p_anonymous_id::TEXT
  END;

  IF NOT _kpi_check_rate_limit(v_bucket_key, 600, 60) THEN
    RAISE EXCEPTION 'KPI_RATE_LIMIT_EXCEEDED'
      USING ERRCODE = 'too_many_requests';
  END IF;

  -- 【6】idempotency: atomic INSERT ... ON CONFLICT DO NOTHING
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
    p_occurred_at,
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
  )
  ON CONFLICT (idempotency_key) DO NOTHING;
  -- DO NOTHINGで重複は静かに無視
END;
$$;

COMMENT ON FUNCTION public.track_kpi_event IS
  'KPI event送信RPC。user_idはauth.uid()から決定。event名は許可リストのみ。'
  'PII検証・timestamp検証・rate-limit・idempotency対応。';

-- 【1】REVOKE/GRANT
REVOKE ALL ON FUNCTION public.track_kpi_event(TEXT,UUID,UUID,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.track_kpi_event(TEXT,UUID,UUID,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT,TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.track_kpi_event(TEXT,UUID,UUID,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT,TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.track_kpi_event(TEXT,UUID,UUID,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT,TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 【全面再定義】upsert_kpi_session
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
  v_user_id           UUID;
  v_auth_at           TIMESTAMPTZ;
  v_existing_anon_id  UUID;
  v_existing_env      TEXT;
  v_existing_uid      UUID;
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

  -- 【3】timestamp検証
  -- started_at <= last_seen_at
  IF p_started_at > p_last_seen_at THEN
    RAISE EXCEPTION 'KPI_SESSION_INVALID_TIMES: started_at must be <= last_seen_at'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 未来拒否（5分超）
  IF p_started_at > now() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'KPI_SESSION_FUTURE_STARTED_AT'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_last_seen_at > now() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'KPI_SESSION_FUTURE_LAST_SEEN_AT'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- user_id は auth.uid() から取得
  v_user_id := auth.uid();

  -- 【4】session所有関係の強化: 既存sessionのanonymous_id・user_id・environmentを取得
  SELECT anonymous_id, user_id, environment
    INTO v_existing_anon_id, v_existing_uid, v_existing_env
    FROM kpi_sessions WHERE session_id = p_session_id
    FOR UPDATE;  -- 競合対策

  IF FOUND THEN
    -- anonymous_id不一致（anon Aが作ったsessionをanon Bが更新できない）
    IF v_existing_anon_id != p_anonymous_id THEN
      RAISE EXCEPTION 'KPI_SESSION_ANON_MISMATCH'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- environmentが異なるsessionを上書きできない
    IF v_existing_env != p_environment THEN
      RAISE EXCEPTION 'KPI_SESSION_ENV_MISMATCH'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- authenticated user Aのsessionをuser Bが更新できない
    IF v_existing_uid IS NOT NULL
       AND v_user_id IS NOT NULL
       AND v_existing_uid != v_user_id THEN
      RAISE EXCEPTION 'KPI_SESSION_USER_MISMATCH'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
  END IF;

  -- 【5】rate-limit
  IF NOT _kpi_check_rate_limit('sess:' || p_session_id::TEXT, 60, 60) THEN
    RAISE EXCEPTION 'KPI_RATE_LIMIT_EXCEEDED'
      USING ERRCODE = 'too_many_requests';
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
    SET last_seen_at    = GREATEST(kpi_sessions.last_seen_at, EXCLUDED.last_seen_at),
        locale          = COALESCE(EXCLUDED.locale, kpi_sessions.locale),
        user_id         = COALESCE(EXCLUDED.user_id, kpi_sessions.user_id),
        authenticated_at = CASE
          WHEN kpi_sessions.user_id IS NULL AND EXCLUDED.user_id IS NOT NULL
          THEN now()
          ELSE kpi_sessions.authenticated_at
        END;
        -- started_at: 更新しない（初回値維持）
        -- first_route: 更新しない（初回値維持）
        -- anonymous_id: 更新しない（SESSION所有者固定）
        -- environment: 更新しない（初回値維持）
END;
$$;

COMMENT ON FUNCTION public.upsert_kpi_session IS
  'KPI sessionのupsert RPC。user_idはauth.uid()から決定。'
  'session所有権検証・timestamp検証・rate-limit対応。';

-- 【1】REVOKE/GRANT
REVOKE ALL ON FUNCTION public.upsert_kpi_session(UUID,UUID,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_kpi_session(UUID,UUID,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.upsert_kpi_session(UUID,UUID,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_kpi_session(UUID,UUID,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 【1】cleanup_old_kpi_events: service_role/postgresのみ
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.cleanup_old_kpi_events() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_old_kpi_events() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_old_kpi_events() FROM authenticated;
-- service_roleはデフォルトで実行可（追加GRANTは不要）

-- ---------------------------------------------------------------------------
-- 【1】admin系RPC: PUBLIC/anonからREVOKE, authenticatedへのみGRANT
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.admin_get_kpi_settings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_kpi_settings() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_settings() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_update_kpi_settings(TIMESTAMPTZ,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_kpi_settings(TIMESTAMPTZ,INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_kpi_settings(TIMESTAMPTZ,INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_get_kpi_event_catalog_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_kpi_event_catalog_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_event_catalog_summary() TO authenticated;

-- ---------------------------------------------------------------------------
-- 【9】admin_update_kpi_settings: validation強化 + CASE方式UPDATE
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

  -- 【9】raw_event_retention_days 範囲検証（30〜730日）
  IF p_raw_event_retention_days IS NOT NULL THEN
    IF p_raw_event_retention_days < 30 OR p_raw_event_retention_days > 730 THEN
      RAISE EXCEPTION 'KPI_SETTINGS_RETENTION_OUT_OF_RANGE: must be 30-730, got %', p_raw_event_retention_days
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
  END IF;

  -- 【9】COALESCE方式からCASE方式に変更
  -- 設計方針コメント: official_kpi_start_atをNULLに解除する場合は
  -- p_clear_official_start BOOLEAN パラメータを追加すること（Phase 2以降）
  UPDATE kpi_settings
    SET raw_event_retention_days = CASE
          WHEN p_raw_event_retention_days IS NOT NULL THEN p_raw_event_retention_days
          ELSE raw_event_retention_days
        END,
        official_kpi_start_at = official_kpi_start_at,  -- 今回は変更しない
        updated_at = now(),
        updated_by = v_uid
  WHERE id = 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_kpi_settings(TIMESTAMPTZ,INTEGER) TO authenticated;
