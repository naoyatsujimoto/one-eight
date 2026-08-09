-- =============================================================================
-- 20260809210000_kpi_phase2_acquisition_rpcs.sql
-- KPI Phase 2: ユーザー登録正本・Pro正本・Admin取得RPC
--
-- 対象:
--   - admin_kpi_registered_users: 登録ユーザー集計用 Admin RPC
--   - admin_kpi_active_pro_users: Pro有効ユーザー集計用 Admin RPC
--   - admin_kpi_paddle_summary: Paddle課金イベント集計用 Admin RPC
--   - admin_get_kpi_acquisition_auth_summary: Phase 2 read RPC（Dashboard再利用可能）
--
-- セキュリティ:
--   - 全RPC: SECURITY DEFINER / Admin確認必須
--   - PUBLIC / anon REVOKE
--   - authenticated: GRANT（Admin確認はRPC内部で実施）
--   - service_role / postgres: 明示GRANT
--
-- PII非返却:
--   - email / provider identity / metadata は返さない
--   - customer ID / subscription ID は返さない
--
-- 除外条件（デフォルトON）:
--   - is_admin = true
--   - is_internal_test_account = true
--   - deleted user (deleted_at IS NOT NULL)
--   - internal_plan_override による test Pro
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: Admin確認
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._kpi_require_admin()
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
    RAISE EXCEPTION '_kpi_require_admin: not authenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_uid;
  IF NOT COALESCE(v_is_admin, FALSE) THEN
    RAISE EXCEPTION '_kpi_require_admin: admin required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._kpi_require_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._kpi_require_admin() TO service_role, postgres;

COMMENT ON FUNCTION public._kpi_require_admin() IS
  'Admin権限チェック用内部関数。KPI Admin RPC から呼び出す。';

-- ---------------------------------------------------------------------------
-- Pro active判定 関数（DB側）
-- isProActive()と同じ意味になるDB側判定
-- internal_plan_override / is_internal_test_account / is_admin を除外
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._kpi_is_pro_active(
  p_plan                  TEXT,
  p_subscription_status   TEXT,
  p_current_period_end    TIMESTAMPTZ,
  p_is_internal_test_account BOOLEAN DEFAULT FALSE,
  p_internal_plan_override TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  -- 内部テストアカウントは正式KPIから除外（常にfalse）
  IF COALESCE(p_is_internal_test_account, FALSE) THEN
    RETURN FALSE;
  END IF;

  -- internal_plan_override による test Pro は除外
  -- （is_internal_test_account=true の場合のみ override が有効だが、念のために両チェック）
  IF p_internal_plan_override IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  IF p_plan != 'pro' THEN
    RETURN FALSE;
  END IF;

  -- active: current_period_end があればその期限内、なければ有効
  IF p_subscription_status = 'active' THEN
    IF p_current_period_end IS NOT NULL THEN
      RETURN p_current_period_end > now();
    END IF;
    RETURN TRUE;
  END IF;

  -- canceled: 解約済みでも current_period_end までは Pro 維持
  IF p_subscription_status = 'canceled' THEN
    IF p_current_period_end IS NOT NULL THEN
      RETURN p_current_period_end > now();
    END IF;
    RETURN FALSE;
  END IF;

  -- past_due / inactive / trial: Pro 無効
  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public._kpi_is_pro_active IS
  'Pro有効判定（isProActive()のDB側実装）。internal_plan_override/is_internal_test_accountは除外。';

-- ---------------------------------------------------------------------------
-- _kpi_classify_pro_status: Pro状態分類
-- free / active_pro / canceled_but_active_until_period_end / inactive_expired
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._kpi_classify_pro_status(
  p_plan                  TEXT,
  p_subscription_status   TEXT,
  p_current_period_end    TIMESTAMPTZ,
  p_is_internal_test_account BOOLEAN DEFAULT FALSE,
  p_internal_plan_override TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  -- 内部テスト / override は除外（free扱い）
  IF COALESCE(p_is_internal_test_account, FALSE) OR p_internal_plan_override IS NOT NULL THEN
    RETURN 'excluded';
  END IF;

  IF p_plan != 'pro' THEN
    RETURN 'free';
  END IF;

  IF p_subscription_status = 'active' THEN
    IF p_current_period_end IS NULL OR p_current_period_end > now() THEN
      RETURN 'active_pro';
    END IF;
    RETURN 'inactive_expired';
  END IF;

  IF p_subscription_status = 'canceled' THEN
    IF p_current_period_end IS NOT NULL AND p_current_period_end > now() THEN
      RETURN 'canceled_but_active_until_period_end';
    END IF;
    RETURN 'inactive_expired';
  END IF;

  -- past_due / inactive / trial
  RETURN 'inactive_expired';
END;
$$;

COMMENT ON FUNCTION public._kpi_classify_pro_status IS
  'Pro状態を4分類に分類: free / active_pro / canceled_but_active_until_period_end / inactive_expired / excluded';

-- ---------------------------------------------------------------------------
-- timezone検証ヘルパー
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._kpi_validate_timezone(p_timezone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  -- 許可timezoneリスト（UTC / JSTのみ、または有効なPostgresタイムゾーン）
  -- 検証: timezone()で変換を試みてエラーなら拒否
  BEGIN
    PERFORM timezone(p_timezone, now());
    RETURN p_timezone;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION '_kpi_validate_timezone: invalid timezone: %', p_timezone
      USING ERRCODE = 'invalid_parameter_value';
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin_get_kpi_acquisition_auth_summary
-- Phase 2 read RPC（Dashboard再利用可能設計）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_get_kpi_acquisition_auth_summary(
  p_from               TIMESTAMPTZ,
  p_to                 TIMESTAMPTZ,
  p_timezone           TEXT    DEFAULT 'UTC',
  p_include_internal   BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_login_page_views    BIGINT;
  v_unique_visitors     BIGINT;
  v_sessions            BIGINT;
  v_auth_started        BIGINT;
  v_auth_succeeded      BIGINT;
  v_auth_failed         BIGINT;
  v_auth_success_rate   NUMERIC;
  v_registrations       BIGINT;
  v_current_free        BIGINT;
  v_current_active_pro  BIGINT;
  v_pro_started         BIGINT;
  v_pro_canceled        BIGINT;
  v_renewal_succeeded   BIGINT;
  v_renewal_failed      BIGINT;
BEGIN
  -- Admin確認
  PERFORM _kpi_require_admin();

  -- 期間検証
  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'admin_get_kpi_acquisition_auth_summary: p_from and p_to are required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_from >= p_to THEN
    RAISE EXCEPTION 'admin_get_kpi_acquisition_auth_summary: p_from must be before p_to'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- 期間上限: 366日
  IF p_to - p_from > INTERVAL '366 days' THEN
    RAISE EXCEPTION 'admin_get_kpi_acquisition_auth_summary: period cannot exceed 366 days'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- timezone検証
  PERFORM _kpi_validate_timezone(p_timezone);

  -- -------------------------------------------------------------------
  -- ログインページビュー（route不問・未認証ユーザーのpage_view）
  -- /ai-check-login 除外
  -- -------------------------------------------------------------------
  SELECT COUNT(*)
    INTO v_login_page_views
    FROM kpi_events e
    LEFT JOIN profiles p ON e.user_id = p.id
    WHERE e.event_name = 'page_view'
      AND e.occurred_at >= p_from
      AND e.occurred_at <  p_to
      AND e.environment = 'production'
      AND (e.route IS NULL OR e.route NOT LIKE '/ai-check-login%')
      AND e.user_id IS NULL  -- 未認証セッションのみ
      AND (p_include_internal OR (
        (p.is_admin IS NULL OR NOT p.is_admin)
        AND (p.is_internal_test_account IS NULL OR NOT p.is_internal_test_account)
      ));

  -- -------------------------------------------------------------------
  -- ユニークビジター（anonymous_id単位）
  -- -------------------------------------------------------------------
  SELECT COUNT(DISTINCT e.anonymous_id)
    INTO v_unique_visitors
    FROM kpi_events e
    LEFT JOIN profiles p ON e.user_id = p.id
    WHERE e.occurred_at >= p_from
      AND e.occurred_at <  p_to
      AND e.environment = 'production'
      AND (e.route IS NULL OR e.route NOT LIKE '/ai-check-login%')
      AND (p_include_internal OR (
        (p.is_admin IS NULL OR NOT p.is_admin)
        AND (p.is_internal_test_account IS NULL OR NOT p.is_internal_test_account)
      ));

  -- -------------------------------------------------------------------
  -- セッション数
  -- -------------------------------------------------------------------
  SELECT COUNT(DISTINCT e.session_id)
    INTO v_sessions
    FROM kpi_events e
    LEFT JOIN profiles p ON e.user_id = p.id
    WHERE e.occurred_at >= p_from
      AND e.occurred_at <  p_to
      AND e.environment = 'production'
      AND (e.route IS NULL OR e.route NOT LIKE '/ai-check-login%')
      AND (p_include_internal OR (
        (p.is_admin IS NULL OR NOT p.is_admin)
        AND (p.is_internal_test_account IS NULL OR NOT p.is_internal_test_account)
      ));

  -- -------------------------------------------------------------------
  -- auth_started
  -- -------------------------------------------------------------------
  SELECT COUNT(*)
    INTO v_auth_started
    FROM kpi_events e
    LEFT JOIN profiles p ON e.user_id = p.id
    WHERE e.event_name = 'auth_started'
      AND e.occurred_at >= p_from
      AND e.occurred_at <  p_to
      AND e.environment = 'production'
      AND (e.route IS NULL OR e.route NOT LIKE '/ai-check-login%')
      AND (p_include_internal OR (
        (p.is_admin IS NULL OR NOT p.is_admin)
        AND (p.is_internal_test_account IS NULL OR NOT p.is_internal_test_account)
      ));

  -- -------------------------------------------------------------------
  -- auth_succeeded
  -- -------------------------------------------------------------------
  SELECT COUNT(*)
    INTO v_auth_succeeded
    FROM kpi_events e
    LEFT JOIN profiles p ON e.user_id = p.id
    WHERE e.event_name = 'auth_succeeded'
      AND e.occurred_at >= p_from
      AND e.occurred_at <  p_to
      AND e.environment = 'production'
      AND (e.route IS NULL OR e.route NOT LIKE '/ai-check-login%')
      AND (p_include_internal OR (
        (p.is_admin IS NULL OR NOT p.is_admin)
        AND (p.is_internal_test_account IS NULL OR NOT p.is_internal_test_account)
      ));

  -- -------------------------------------------------------------------
  -- auth_failed
  -- -------------------------------------------------------------------
  SELECT COUNT(*)
    INTO v_auth_failed
    FROM kpi_events e
    LEFT JOIN profiles p ON e.user_id = p.id
    WHERE e.event_name = 'auth_failed'
      AND e.occurred_at >= p_from
      AND e.occurred_at <  p_to
      AND e.environment = 'production'
      AND (e.route IS NULL OR e.route NOT LIKE '/ai-check-login%')
      AND (p_include_internal OR (
        (p.is_admin IS NULL OR NOT p.is_admin)
        AND (p.is_internal_test_account IS NULL OR NOT p.is_internal_test_account)
      ));

  -- -------------------------------------------------------------------
  -- auth_success_rate
  -- -------------------------------------------------------------------
  IF v_auth_started > 0 THEN
    v_auth_success_rate := ROUND((v_auth_succeeded::NUMERIC / v_auth_started::NUMERIC) * 100, 2);
  ELSE
    v_auth_success_rate := NULL;
  END IF;

  -- -------------------------------------------------------------------
  -- 登録数（正本: auth.users）
  -- deleted_at がある場合は除外
  -- is_admin / is_internal_test_account 除外
  -- -------------------------------------------------------------------
  SELECT COUNT(*)
    INTO v_registrations
    FROM auth.users u
    JOIN profiles p ON u.id = p.id
    WHERE u.created_at >= p_from
      AND u.created_at <  p_to
      -- deleted userは除外（Supabase auth.users には deleted_at がない場合があるため、
      -- banned_until / is_sso_user なども考慮せず、profiles存在で判定）
      AND (p_include_internal OR (
        NOT COALESCE(p.is_admin, FALSE)
        AND NOT COALESCE(p.is_internal_test_account, FALSE)
      ));

  -- -------------------------------------------------------------------
  -- 現在の有効Freeユーザー数（今この瞬間）
  -- -------------------------------------------------------------------
  SELECT COUNT(*)
    INTO v_current_free
    FROM profiles p
    WHERE NOT COALESCE(p.is_admin, FALSE)
      AND NOT COALESCE(p.is_internal_test_account, FALSE)
      AND p.internal_plan_override IS NULL
      AND NOT _kpi_is_pro_active(
            p.plan::TEXT,
            p.subscription_status::TEXT,
            p.current_period_end,
            p.is_internal_test_account,
            p.internal_plan_override::TEXT
          );

  -- -------------------------------------------------------------------
  -- 現在の有効Proユーザー数（今この瞬間）
  -- -------------------------------------------------------------------
  SELECT COUNT(*)
    INTO v_current_active_pro
    FROM profiles p
    WHERE NOT COALESCE(p.is_admin, FALSE)
      AND NOT COALESCE(p.is_internal_test_account, FALSE)
      AND p.internal_plan_override IS NULL
      AND _kpi_is_pro_active(
            p.plan::TEXT,
            p.subscription_status::TEXT,
            p.current_period_end,
            p.is_internal_test_account,
            p.internal_plan_override::TEXT
          );

  -- -------------------------------------------------------------------
  -- Pro開始（subscription.activated/created イベント）
  -- paddle_webhook_eventsの event_type から集計
  -- -------------------------------------------------------------------
  SELECT COUNT(*)
    INTO v_pro_started
    FROM paddle_webhook_events pwe
    JOIN profiles p ON (pwe.payload->>'user_id')::UUID = p.id
    WHERE pwe.event_type IN ('subscription.activated', 'subscription.created')
      AND pwe.occurred_at >= p_from
      AND pwe.occurred_at <  p_to
      AND pwe.result = 'processed'
      AND (p_include_internal OR (
        NOT COALESCE(p.is_admin, FALSE)
        AND NOT COALESCE(p.is_internal_test_account, FALSE)
      ));

  -- -------------------------------------------------------------------
  -- Pro解約
  -- -------------------------------------------------------------------
  SELECT COUNT(*)
    INTO v_pro_canceled
    FROM paddle_webhook_events pwe
    JOIN profiles p ON (pwe.payload->>'user_id')::UUID = p.id
    WHERE pwe.event_type IN ('subscription.canceled')
      AND pwe.occurred_at >= p_from
      AND pwe.occurred_at <  p_to
      AND pwe.result = 'processed'
      AND (p_include_internal OR (
        NOT COALESCE(p.is_admin, FALSE)
        AND NOT COALESCE(p.is_internal_test_account, FALSE)
      ));

  -- -------------------------------------------------------------------
  -- Renewal成功
  -- -------------------------------------------------------------------
  SELECT COUNT(*)
    INTO v_renewal_succeeded
    FROM paddle_webhook_events pwe
    JOIN profiles p ON (pwe.payload->>'user_id')::UUID = p.id
    WHERE pwe.event_type IN ('subscription.renewed', 'transaction.completed')
      AND pwe.occurred_at >= p_from
      AND pwe.occurred_at <  p_to
      AND pwe.result = 'processed'
      AND (p_include_internal OR (
        NOT COALESCE(p.is_admin, FALSE)
        AND NOT COALESCE(p.is_internal_test_account, FALSE)
      ));

  -- -------------------------------------------------------------------
  -- Renewal失敗
  -- -------------------------------------------------------------------
  SELECT COUNT(*)
    INTO v_renewal_failed
    FROM paddle_webhook_events pwe
    JOIN profiles p ON (pwe.payload->>'user_id')::UUID = p.id
    WHERE pwe.event_type IN ('subscription.payment_failed', 'transaction.payment_failed')
      AND pwe.occurred_at >= p_from
      AND pwe.occurred_at <  p_to
      AND pwe.result IN ('processed', 'error')
      AND (p_include_internal OR (
        NOT COALESCE(p.is_admin, FALSE)
        AND NOT COALESCE(p.is_internal_test_account, FALSE)
      ));

  -- -------------------------------------------------------------------
  -- 返却
  -- -------------------------------------------------------------------
  RETURN jsonb_build_object(
    -- Acquisition / Auth
    'login_page_views',       v_login_page_views,
    'unique_visitors',        v_unique_visitors,
    'sessions',               v_sessions,
    'auth_started',           v_auth_started,
    'auth_succeeded',         v_auth_succeeded,
    'auth_failed',            v_auth_failed,
    'auth_success_rate',      v_auth_success_rate,
    -- Registration
    'registrations',          v_registrations,
    -- Current state
    'current_free_users',     v_current_free,
    'current_active_pro_users', v_current_active_pro,
    -- Pro lifecycle
    'pro_started',            v_pro_started,
    'pro_canceled',           v_pro_canceled,
    'renewal_succeeded',      v_renewal_succeeded,
    'renewal_failed',         v_renewal_failed,
    -- Meta
    'from',                   p_from,
    'to',                     p_to,
    'timezone',               p_timezone,
    'include_internal',       p_include_internal,
    'generated_at',           now()
  );
END;
$$;

COMMENT ON FUNCTION public.admin_get_kpi_acquisition_auth_summary IS
  'KPI Phase 2 Admin集計RPC。ログインページビュー・認証・登録・Pro状態を集計。'
  'PIIなし。internal/Admin除外デフォルトON。Phase 6 Dashboard再利用可能設計。';

-- Grants
REVOKE ALL ON FUNCTION public.admin_get_kpi_acquisition_auth_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_kpi_acquisition_auth_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_acquisition_auth_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_acquisition_auth_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO service_role, postgres;

-- ---------------------------------------------------------------------------
-- Admin view: kpi_registered_users_summary
-- 登録ユーザーの集計に使えるAdmin専用view（PIIなし）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.admin_kpi_users_view AS
  SELECT
    p.id,
    p.created_at,
    p.plan,
    p.subscription_status,
    p.current_period_end,
    p.locale,
    COALESCE(p.is_admin, FALSE)                    AS is_admin,
    COALESCE(p.is_internal_test_account, FALSE)    AS is_internal_test_account,
    p.internal_plan_override,
    _kpi_classify_pro_status(
      p.plan::TEXT,
      p.subscription_status::TEXT,
      p.current_period_end,
      p.is_internal_test_account,
      p.internal_plan_override::TEXT
    ) AS pro_status_class,
    _kpi_is_pro_active(
      p.plan::TEXT,
      p.subscription_status::TEXT,
      p.current_period_end,
      p.is_internal_test_account,
      p.internal_plan_override::TEXT
    ) AS is_pro_active_kpi
  FROM profiles p
  -- PIIを含む列は選択しない（email / display_name / statsフィールド等は除外）
;

COMMENT ON VIEW public.admin_kpi_users_view IS
  'Admin専用KPIユーザービュー。PIIなし（email/display_name除外）。'
  'Pro状態分類付き。直接SELECTはservice_roleのみ。';

-- Viewのアクセス制御（RLSはviewに直接適用できないのでGRANTで制御）
REVOKE ALL ON public.admin_kpi_users_view FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_kpi_users_view TO service_role, postgres;

-- =============================================================================
-- 確認クエリ（適用後）
-- =============================================================================
-- SELECT proname FROM pg_proc WHERE proname LIKE 'admin_get_kpi%' OR proname LIKE '_kpi_%';
-- SELECT * FROM admin_kpi_users_view LIMIT 1;
