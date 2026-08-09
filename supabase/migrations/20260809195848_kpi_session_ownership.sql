-- =============================================================================
-- 20260809195848_kpi_session_ownership.sql
-- KPI Phase 1: session所有権の強化
--
-- 依存: 20260809195843 (tables), 20260809195845 (base RPCs)
--
-- 以下を必ず拒否:
-- 1. 認証済みsessionをanonが更新（session.user_id IS NOT NULL かつ auth.uid() IS NULL）
-- 2. user Aのsessionをuser Bが更新（session.user_id ≠ auth.uid()）
-- 3. anonymous_id不一致（session.anonymous_id ≠ p_anonymous_id）
-- 4. environment不一致（session.environment ≠ p_environment）
--
-- 匿名sessionを認証ユーザーへ関連付けられるのは:
-- - session_id一致
-- - anonymous_id一致
-- - environment一致
-- - existing user_idがNULL
-- の場合だけ
-- =============================================================================

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

  -- timestamp検証
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

  -- session所有関係の強化: 既存sessionのanonymous_id・user_id・environmentを取得
  SELECT anonymous_id, user_id, environment
    INTO v_existing_anon_id, v_existing_uid, v_existing_env
    FROM kpi_sessions WHERE session_id = p_session_id
    FOR UPDATE;  -- 競合対策

  IF FOUND THEN
    -- 【拒否1】anonymous_id不一致: anon Aが作ったsessionをanon Bが更新できない
    IF v_existing_anon_id != p_anonymous_id THEN
      RAISE EXCEPTION 'KPI_SESSION_ANON_MISMATCH: session belongs to a different anonymous_id'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- 【拒否2】environmentが異なるsessionを上書きできない
    IF v_existing_env != p_environment THEN
      RAISE EXCEPTION 'KPI_SESSION_ENV_MISMATCH: session environment mismatch'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- 【拒否3】認証済みsessionをanonが更新しようとした場合
    -- (session.user_id IS NOT NULL かつ auth.uid() IS NULL)
    IF v_existing_uid IS NOT NULL AND v_user_id IS NULL THEN
      RAISE EXCEPTION 'KPI_SESSION_AUTH_REQUIRED: authenticated session cannot be updated by anon'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 【拒否4】user AのsessionをuserBが更新しようとした場合
    -- (session.user_id ≠ auth.uid() かつ どちらもNULLでない)
    IF v_existing_uid IS NOT NULL
       AND v_user_id IS NOT NULL
       AND v_existing_uid != v_user_id THEN
      RAISE EXCEPTION 'KPI_SESSION_USER_MISMATCH: session belongs to a different user'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- rate-limit（session単位: 60回/分）
  IF NOT _kpi_check_rate_limit('sess:' || p_session_id::TEXT, 60, 60) THEN
    RAISE EXCEPTION 'KPI_RATE_LIMIT_EXCEEDED'
      USING ERRCODE = 'too_many_requests';
  END IF;

  -- authenticated_at: 今回初めてuser_idが確定した場合のみ設定
  -- 匿名sessionを認証ユーザーへ関連付け: existing user_id が NULL の場合のみ
  IF v_user_id IS NOT NULL AND (v_existing_uid IS NULL OR NOT FOUND) THEN
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
        -- anonymous_id: 更新しない（session所有者固定）
        -- environment: 更新しない（初回値維持）
END;
$$;

COMMENT ON FUNCTION public.upsert_kpi_session IS
  'KPI sessionのupsert RPC。user_idはauth.uid()から決定。'
  'session所有権検証（anon不一致/env不一致/認証済みanon更新拒否/異ユーザー拒否）・timestamp検証・rate-limit対応。';

REVOKE ALL ON FUNCTION public.upsert_kpi_session(UUID,UUID,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_kpi_session(UUID,UUID,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.upsert_kpi_session(UUID,UUID,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_kpi_session(UUID,UUID,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT) TO anon, authenticated;
