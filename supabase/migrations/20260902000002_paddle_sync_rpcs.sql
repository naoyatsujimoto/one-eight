-- Paddle subscription synchronization: atomic event claims, monotonic profile
-- state application, and deduplicated operational issues.

CREATE OR REPLACE FUNCTION public.claim_paddle_webhook_event(
  p_event_id TEXT,
  p_event_type TEXT,
  p_occurred_at TIMESTAMPTZ,
  p_payload JSONB,
  p_lease_seconds INTEGER DEFAULT 120
)
RETURNS TABLE (
  claim_action TEXT,
  claim_token UUID,
  claim_attempt_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_token UUID := gen_random_uuid();
  v_inserted INTEGER := 0;
  v_existing public.paddle_webhook_events%ROWTYPE;
BEGIN
  IF p_event_id IS NULL OR p_event_id !~ '^evt_[a-z0-9]+$' THEN
    RAISE EXCEPTION 'PADDLE_INVALID_EVENT_ID' USING ERRCODE = '22023';
  END IF;
  IF p_event_type IS NULL OR length(p_event_type) > 100 THEN
    RAISE EXCEPTION 'PADDLE_INVALID_EVENT_TYPE' USING ERRCODE = '22023';
  END IF;
  IF p_occurred_at IS NULL OR p_occurred_at > v_now + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'PADDLE_INVALID_EVENT_TIMESTAMP' USING ERRCODE = '22023';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'PADDLE_INVALID_EVENT_PAYLOAD' USING ERRCODE = '22023';
  END IF;
  IF p_lease_seconds < 30 OR p_lease_seconds > 600 THEN
    RAISE EXCEPTION 'PADDLE_INVALID_LEASE' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.paddle_webhook_events (
    event_id, event_type, occurred_at, payload, result, processed_at,
    attempt_count, processing_started_at, last_attempt_at, processing_token,
    completed_at, last_error_code
  ) VALUES (
    p_event_id, p_event_type, p_occurred_at, p_payload, 'pending', NULL,
    1, v_now, v_now, v_token, NULL, NULL
  )
  ON CONFLICT (event_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 1 THEN
    RETURN QUERY SELECT 'process'::TEXT, v_token, 1;
    RETURN;
  END IF;

  SELECT pwe.*
    INTO v_existing
    FROM public.paddle_webhook_events AS pwe
   WHERE pwe.event_id = p_event_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PADDLE_EVENT_CLAIM_RACE' USING ERRCODE = '40001';
  END IF;

  IF v_existing.event_type <> p_event_type
     OR v_existing.occurred_at <> p_occurred_at THEN
    RETURN QUERY SELECT 'conflict'::TEXT, NULL::UUID, v_existing.attempt_count;
    RETURN;
  END IF;

  IF v_existing.result IN ('processed', 'skipped', 'denied') THEN
    RETURN QUERY SELECT 'terminal'::TEXT, NULL::UUID, v_existing.attempt_count;
    RETURN;
  END IF;

  IF v_existing.result = 'pending'
     AND v_existing.processing_started_at IS NOT NULL
     AND v_existing.processing_started_at > v_now - make_interval(secs => p_lease_seconds) THEN
    RETURN QUERY SELECT 'in_progress'::TEXT, NULL::UUID, v_existing.attempt_count;
    RETURN;
  END IF;

  UPDATE public.paddle_webhook_events AS pwe
     SET result = 'pending',
         attempt_count = pwe.attempt_count + 1,
         processing_started_at = v_now,
         last_attempt_at = v_now,
         processing_token = v_token,
         completed_at = NULL,
         processed_at = NULL,
         last_error_code = NULL
   WHERE pwe.event_id = p_event_id;

  RETURN QUERY SELECT 'process'::TEXT, v_token, v_existing.attempt_count + 1;
END;
$$;

-- Atomically claim a small, fairly ordered reconciliation batch. Updating the
-- attempt timestamp inside the same statement prevents overlapping cron runs
-- and a permanently failing low-id profile from starving later profiles.
CREATE OR REPLACE FUNCTION public.claim_paddle_reconcile_profiles(
  p_limit INTEGER DEFAULT 10,
  p_force BOOLEAN DEFAULT FALSE,
  p_mark_attempt BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
  profile_id UUID,
  plan TEXT,
  subscription_status TEXT,
  current_period_end TIMESTAMPTZ,
  paddle_customer_id TEXT,
  paddle_subscription_id TEXT,
  paddle_last_synced_at TIMESTAMPTZ,
  paddle_state_updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF p_limit < 1 OR p_limit > 10 THEN
    RAISE EXCEPTION 'PADDLE_INVALID_RECONCILE_LIMIT' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_mark_attempt, TRUE) THEN
    RETURN QUERY
    WITH candidates AS MATERIALIZED (
      SELECT p.id
        FROM public.profiles AS p
       WHERE p.paddle_customer_id IS NOT NULL
         AND p.paddle_subscription_id IS NOT NULL
         AND NOT COALESCE(p.is_test_account, FALSE)
         AND NOT COALESCE(p.is_internal_test_account, FALSE)
         AND (
           COALESCE(p_force, FALSE)
           OR p.paddle_reconcile_attempted_at IS NULL
           OR p.paddle_reconcile_attempted_at <= v_now - CASE
             WHEN p.subscription_status = 'active'
                  AND (p.current_period_end IS NULL OR p.current_period_end <= v_now)
               THEN INTERVAL '2 minutes'
             WHEN p.subscription_status IN ('active', 'past_due', 'inactive', 'trial')
               THEN INTERVAL '1 hour'
             ELSE INTERVAL '24 hours'
           END
         )
       ORDER BY
         p.paddle_reconcile_attempted_at ASC NULLS FIRST,
         CASE
           WHEN p.subscription_status = 'active'
                AND (p.current_period_end IS NULL OR p.current_period_end <= v_now) THEN 0
           WHEN p.subscription_status IN ('active', 'past_due', 'inactive', 'trial') THEN 1
           ELSE 2
         END,
         p.id
       FOR UPDATE OF p SKIP LOCKED
       LIMIT p_limit
    ), claimed AS (
      UPDATE public.profiles AS p
         SET paddle_reconcile_attempted_at = v_now
        FROM candidates AS c
       WHERE p.id = c.id
      RETURNING p.*
    )
    SELECT c.id,
           c.plan::TEXT,
           c.subscription_status::TEXT,
           c.current_period_end,
           c.paddle_customer_id::TEXT,
           c.paddle_subscription_id::TEXT,
           c.paddle_last_synced_at,
           c.paddle_state_updated_at
      FROM claimed AS c;
  ELSE
    RETURN QUERY
    SELECT p.id,
           p.plan::TEXT,
           p.subscription_status::TEXT,
           p.current_period_end,
           p.paddle_customer_id::TEXT,
           p.paddle_subscription_id::TEXT,
           p.paddle_last_synced_at,
           p.paddle_state_updated_at
      FROM public.profiles AS p
     WHERE p.paddle_customer_id IS NOT NULL
       AND p.paddle_subscription_id IS NOT NULL
       AND NOT COALESCE(p.is_test_account, FALSE)
       AND NOT COALESCE(p.is_internal_test_account, FALSE)
       AND (
         COALESCE(p_force, FALSE)
         OR p.paddle_reconcile_attempted_at IS NULL
         OR p.paddle_reconcile_attempted_at <= v_now - CASE
           WHEN p.subscription_status = 'active'
                AND (p.current_period_end IS NULL OR p.current_period_end <= v_now)
             THEN INTERVAL '2 minutes'
           WHEN p.subscription_status IN ('active', 'past_due', 'inactive', 'trial')
             THEN INTERVAL '1 hour'
           ELSE INTERVAL '24 hours'
         END
       )
     ORDER BY
       p.paddle_reconcile_attempted_at ASC NULLS FIRST,
       CASE
         WHEN p.subscription_status = 'active'
              AND (p.current_period_end IS NULL OR p.current_period_end <= v_now) THEN 0
         WHEN p.subscription_status IN ('active', 'past_due', 'inactive', 'trial') THEN 1
         ELSE 2
       END,
       p.id
     LIMIT p_limit;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._paddle_apply_subscription_state(
  p_profile_id UUID,
  p_customer_id TEXT,
  p_subscription_id TEXT,
  p_subscription_status TEXT,
  p_current_period_end TIMESTAMPTZ,
  p_update_current_period_end BOOLEAN,
  p_state_updated_at TIMESTAMPTZ,
  p_sync_source TEXT,
  p_webhook_occurred_at TIMESTAMPTZ DEFAULT NULL,
  p_allow_initial_binding BOOLEAN DEFAULT FALSE,
  p_allow_subscription_replacement BOOLEAN DEFAULT FALSE,
  p_expected_previous_subscription_id TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_profile public.profiles%ROWTYPE;
  v_is_replacement BOOLEAN := FALSE;
BEGIN
  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION 'PADDLE_PROFILE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_customer_id IS NULL OR p_customer_id !~ '^ctm_[a-z0-9]+$'
     OR p_subscription_id IS NULL OR p_subscription_id !~ '^sub_[a-z0-9]+$' THEN
    RAISE EXCEPTION 'PADDLE_INVALID_SUBSCRIPTION_IDS' USING ERRCODE = '22023';
  END IF;
  IF p_subscription_status NOT IN ('active', 'canceled', 'past_due', 'inactive', 'trial') THEN
    RAISE EXCEPTION 'PADDLE_INVALID_SUBSCRIPTION_STATUS' USING ERRCODE = '22023';
  END IF;
  IF p_sync_source NOT IN ('webhook', 'reconciliation') THEN
    RAISE EXCEPTION 'PADDLE_INVALID_SYNC_SOURCE' USING ERRCODE = '22023';
  END IF;
  IF p_state_updated_at IS NULL OR p_state_updated_at > v_now + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'PADDLE_INVALID_STATE_TIMESTAMP' USING ERRCODE = '22023';
  END IF;
  IF p_webhook_occurred_at IS NOT NULL
     AND p_webhook_occurred_at > v_now + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'PADDLE_INVALID_WEBHOOK_TIMESTAMP' USING ERRCODE = '22023';
  END IF;
  IF p_subscription_status = 'active'
     AND (NOT COALESCE(p_update_current_period_end, FALSE) OR p_current_period_end IS NULL) THEN
    RAISE EXCEPTION 'PADDLE_ACTIVE_PERIOD_END_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_allow_initial_binding, FALSE)
     AND COALESCE(p_allow_subscription_replacement, FALSE) THEN
    RAISE EXCEPTION 'PADDLE_BINDING_MODE_CONFLICT' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_allow_subscription_replacement, FALSE)
     AND (p_expected_previous_subscription_id IS NULL
          OR p_expected_previous_subscription_id !~ '^sub_[a-z0-9]+$') THEN
    RAISE EXCEPTION 'PADDLE_REPLACEMENT_EXPECTED_ID_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT p.*
    INTO v_profile
    FROM public.profiles AS p
   WHERE p.id = p_profile_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PADDLE_PROFILE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF COALESCE(v_profile.is_test_account, FALSE)
     OR COALESCE(v_profile.is_internal_test_account, FALSE) THEN
    RAISE EXCEPTION 'PADDLE_TEST_PROFILE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF v_profile.paddle_customer_id IS NULL
     AND v_profile.paddle_subscription_id IS NULL THEN
    IF NOT COALESCE(p_allow_initial_binding, FALSE) THEN
      RAISE EXCEPTION 'PADDLE_INITIAL_BINDING_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
  ELSIF v_profile.paddle_customer_id IS NULL
        OR v_profile.paddle_subscription_id IS NULL THEN
    RAISE EXCEPTION 'PADDLE_PARTIAL_BINDING_FORBIDDEN' USING ERRCODE = '23514';
  ELSIF v_profile.paddle_customer_id = p_customer_id
        AND v_profile.paddle_subscription_id <> p_subscription_id
        AND COALESCE(p_allow_subscription_replacement, FALSE)
        AND v_profile.paddle_subscription_id = p_expected_previous_subscription_id THEN
    -- The Edge Function grants this narrow mode only after verifying both the
    -- old canceled Subscription and the new Subscription through Paddle API,
    -- plus the same three-way identity check used for an initial binding.
    v_is_replacement := TRUE;
  ELSIF v_profile.paddle_customer_id <> p_customer_id
        OR v_profile.paddle_subscription_id <> p_subscription_id THEN
    RAISE EXCEPTION 'PADDLE_IDENTITY_MISMATCH' USING ERRCODE = '23505';
  END IF;

  IF NOT v_is_replacement
     AND v_profile.paddle_state_updated_at IS NOT NULL
     AND (
       p_state_updated_at < v_profile.paddle_state_updated_at
       OR (
         p_state_updated_at = v_profile.paddle_state_updated_at
         AND p_sync_source = 'webhook'
       )
     ) THEN
    UPDATE public.profiles AS p
       SET paddle_last_synced_at = v_now,
           paddle_last_event_at = CASE
             WHEN p_sync_source = 'webhook' AND p_webhook_occurred_at IS NOT NULL
               THEN GREATEST(COALESCE(p.paddle_last_event_at, '-infinity'::TIMESTAMPTZ), p_webhook_occurred_at)
             ELSE p.paddle_last_event_at
           END
     WHERE p.id = p_profile_id;
    RETURN 'stale';
  END IF;

  UPDATE public.profiles AS p
     SET plan = 'pro',
         subscription_status = p_subscription_status,
         current_period_end = CASE
           WHEN p_update_current_period_end THEN p_current_period_end
           ELSE p.current_period_end
         END,
         paddle_customer_id = p_customer_id,
         paddle_subscription_id = p_subscription_id,
         paddle_state_updated_at = p_state_updated_at,
         paddle_last_synced_at = v_now,
         paddle_sync_source = p_sync_source,
         paddle_last_event_at = CASE
           WHEN p_sync_source = 'webhook' AND p_webhook_occurred_at IS NOT NULL
             THEN GREATEST(COALESCE(p.paddle_last_event_at, '-infinity'::TIMESTAMPTZ), p_webhook_occurred_at)
           ELSE p.paddle_last_event_at
         END
   WHERE p.id = p_profile_id;

  -- Transaction notifications may arrive before subscription creation. Once
  -- the identity is verified, attach any already-recorded transaction events
  -- for the exact Paddle pair so acquisition KPI attribution is not lost.
  UPDATE public.paddle_webhook_events AS pwe
     SET profile_id = p_profile_id,
         payload = jsonb_set(pwe.payload, '{user_id}', to_jsonb(p_profile_id::TEXT), TRUE)
   WHERE pwe.profile_id IS NULL
     AND pwe.event_type IN ('transaction.completed', 'transaction.payment_failed')
     AND pwe.payload #>> '{data,customer_id}' = p_customer_id
     AND pwe.payload #>> '{data,subscription_id}' = p_subscription_id;

  RETURN 'applied';
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_paddle_webhook_event(
  p_event_id TEXT,
  p_claim_token UUID,
  p_result TEXT,
  p_failure_code TEXT DEFAULT NULL,
  p_profile_id UUID DEFAULT NULL,
  p_apply_subscription BOOLEAN DEFAULT FALSE,
  p_customer_id TEXT DEFAULT NULL,
  p_subscription_id TEXT DEFAULT NULL,
  p_subscription_status TEXT DEFAULT NULL,
  p_current_period_end TIMESTAMPTZ DEFAULT NULL,
  p_update_current_period_end BOOLEAN DEFAULT FALSE,
  p_state_updated_at TIMESTAMPTZ DEFAULT NULL,
  p_sync_source TEXT DEFAULT 'webhook',
  p_webhook_occurred_at TIMESTAMPTZ DEFAULT NULL,
  p_allow_initial_binding BOOLEAN DEFAULT FALSE,
  p_allow_subscription_replacement BOOLEAN DEFAULT FALSE,
  p_expected_previous_subscription_id TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.paddle_webhook_events%ROWTYPE;
  v_apply_result TEXT;
  v_final_result TEXT := p_result;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF p_result NOT IN ('processed', 'skipped', 'denied', 'error') THEN
    RAISE EXCEPTION 'PADDLE_INVALID_FINAL_RESULT' USING ERRCODE = '22023';
  END IF;
  IF p_failure_code IS NOT NULL AND p_failure_code !~ '^[a-z0-9_]{1,80}$' THEN
    RAISE EXCEPTION 'PADDLE_INVALID_FAILURE_CODE' USING ERRCODE = '22023';
  END IF;

  SELECT pwe.*
    INTO v_event
    FROM public.paddle_webhook_events AS pwe
   WHERE pwe.event_id = p_event_id
   FOR UPDATE;

  IF NOT FOUND OR v_event.result <> 'pending' OR v_event.processing_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'PADDLE_EVENT_CLAIM_LOST' USING ERRCODE = '40001';
  END IF;

  IF p_apply_subscription THEN
    IF p_result <> 'processed' THEN
      RAISE EXCEPTION 'PADDLE_APPLY_REQUIRES_PROCESSED' USING ERRCODE = '22023';
    END IF;
    SELECT public._paddle_apply_subscription_state(
      p_profile_id,
      p_customer_id,
      p_subscription_id,
      p_subscription_status,
      p_current_period_end,
      p_update_current_period_end,
      p_state_updated_at,
      p_sync_source,
      p_webhook_occurred_at,
      p_allow_initial_binding,
      p_allow_subscription_replacement,
      p_expected_previous_subscription_id
    ) INTO v_apply_result;
    -- A verified lifecycle notification is processed even when its state was
    -- already applied by a newer/equivalent Paddle event. Delivery outcome and
    -- state ordering are separate so cancellation/renewal KPI are not lost.
    -- `subscription.created` is an early provisioning safety net. The later
    -- activation is the single Pro-start KPI event, so creation is terminally
    -- retained as skipped after its entitlement state has been applied.
    IF v_event.event_type = 'subscription.created' THEN
      v_final_result := 'skipped';
    END IF;
  END IF;

  UPDATE public.paddle_webhook_events AS pwe
     SET result = v_final_result,
         profile_id = COALESCE(p_profile_id, pwe.profile_id),
         payload = CASE
           WHEN p_profile_id IS NOT NULL
             THEN jsonb_set(pwe.payload, '{user_id}', to_jsonb(p_profile_id::TEXT), TRUE)
           ELSE pwe.payload
         END,
         processed_at = CASE WHEN v_final_result <> 'error' THEN v_now ELSE NULL END,
         completed_at = CASE WHEN v_final_result <> 'error' THEN v_now ELSE NULL END,
         processing_started_at = NULL,
         processing_token = NULL,
         last_error_code = p_failure_code
   WHERE pwe.event_id = p_event_id;

  RETURN v_final_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_paddle_sync_issue(
  p_profile_id UUID,
  p_subscription_id_prefix TEXT,
  p_failure_code TEXT,
  p_retryable BOOLEAN,
  p_source TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_failure_code IS NULL OR p_failure_code !~ '^[a-z0-9_]{1,80}$'
     OR p_source NOT IN ('webhook', 'reconciliation')
     OR (p_subscription_id_prefix IS NOT NULL AND p_subscription_id_prefix !~ '^sub_[a-z0-9]{0,8}$') THEN
    RAISE EXCEPTION 'PADDLE_INVALID_ISSUE' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.paddle_subscription_sync_issues (
    profile_id, subscription_id_prefix, failure_code, retryable, source
  ) VALUES (
    p_profile_id, p_subscription_id_prefix, p_failure_code, p_retryable, p_source
  )
  ON CONFLICT (profile_id, failure_code, source)
    WHERE resolved_at IS NULL AND profile_id IS NOT NULL
  DO UPDATE SET
    subscription_id_prefix = EXCLUDED.subscription_id_prefix,
    retryable = EXCLUDED.retryable,
    last_seen_at = clock_timestamp(),
    attempt_count = public.paddle_subscription_sync_issues.attempt_count + 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_paddle_sync_issues(
  p_profile_id UUID,
  p_source TEXT,
  p_subscription_id_prefix TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_source NOT IN ('webhook', 'reconciliation')
     OR (p_subscription_id_prefix IS NOT NULL
         AND p_subscription_id_prefix !~ '^sub_[a-z0-9]{0,8}$') THEN
    RAISE EXCEPTION 'PADDLE_INVALID_ISSUE_SOURCE' USING ERRCODE = '22023';
  END IF;
  UPDATE public.paddle_subscription_sync_issues AS psi
     SET resolved_at = clock_timestamp(),
         last_seen_at = clock_timestamp()
   WHERE psi.profile_id = p_profile_id
     AND psi.source = p_source
     AND psi.retryable
     AND psi.subscription_id_prefix IS NOT DISTINCT FROM p_subscription_id_prefix
     AND psi.resolved_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Fail closed when an active subscription has no paid-period end. These
-- helpers use now(), so STABLE is the correct volatility classification.
CREATE OR REPLACE FUNCTION public._kpi_is_pro_active(
  p_plan TEXT,
  p_subscription_status TEXT,
  p_current_period_end TIMESTAMPTZ,
  p_is_internal_test_account BOOLEAN DEFAULT FALSE,
  p_internal_plan_override TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(p_is_internal_test_account, FALSE)
     OR p_internal_plan_override IS NOT NULL
     OR p_plan <> 'pro' THEN
    RETURN FALSE;
  END IF;
  IF p_subscription_status = 'active' THEN
    RETURN p_current_period_end IS NOT NULL AND p_current_period_end > now();
  END IF;
  IF p_subscription_status = 'canceled' THEN
    RETURN p_current_period_end IS NOT NULL AND p_current_period_end > now();
  END IF;
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public._kpi_classify_pro_status(
  p_plan TEXT,
  p_subscription_status TEXT,
  p_current_period_end TIMESTAMPTZ,
  p_is_internal_test_account BOOLEAN DEFAULT FALSE,
  p_internal_plan_override TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(p_is_internal_test_account, FALSE) OR p_internal_plan_override IS NOT NULL THEN
    RETURN 'excluded';
  END IF;
  IF p_plan <> 'pro' THEN
    RETURN 'free';
  END IF;
  IF p_subscription_status = 'active' THEN
    RETURN CASE
      WHEN p_current_period_end IS NOT NULL AND p_current_period_end > now()
        THEN 'active_pro'
      ELSE 'inactive_expired'
    END;
  END IF;
  IF p_subscription_status = 'canceled' THEN
    RETURN CASE
      WHEN p_current_period_end IS NOT NULL AND p_current_period_end > now()
        THEN 'canceled_but_active_until_period_end'
      ELSE 'inactive_expired'
    END;
  END IF;
  RETURN 'inactive_expired';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_paddle_webhook_event(TEXT, TEXT, TIMESTAMPTZ, JSONB, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_paddle_reconcile_profiles(INTEGER, BOOLEAN, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._paddle_apply_subscription_state(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, BOOLEAN, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_paddle_webhook_event(TEXT, UUID, TEXT, TEXT, UUID, BOOLEAN, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, BOOLEAN, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_paddle_sync_issue(UUID, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_paddle_sync_issues(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_paddle_webhook_event(TEXT, TEXT, TIMESTAMPTZ, JSONB, INTEGER) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.claim_paddle_reconcile_profiles(INTEGER, BOOLEAN, BOOLEAN) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public._paddle_apply_subscription_state(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, BOOLEAN, BOOLEAN, TEXT) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.finalize_paddle_webhook_event(TEXT, UUID, TEXT, TEXT, UUID, BOOLEAN, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, BOOLEAN, BOOLEAN, TEXT) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.record_paddle_sync_issue(UUID, TEXT, TEXT, BOOLEAN, TEXT) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.resolve_paddle_sync_issues(UUID, TEXT, TEXT) TO service_role, postgres;

REVOKE ALL ON FUNCTION public._kpi_is_pro_active(TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._kpi_classify_pro_status(TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._kpi_is_pro_active(TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public._kpi_classify_pro_status(TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT) TO service_role, postgres;
