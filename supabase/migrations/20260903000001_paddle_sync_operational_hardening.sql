-- Paddle synchronization operational hardening.
--
-- 1. Live reconciliation is disabled by default and must be enabled explicitly
--    after a successful dry-run.
-- 2. Every pg_net request is tracked without storing credentials or payloads.
-- 3. Sync issues and cron/HTTP failures create one deduplicated administrator
--    MAIL notification. No email address, secret, raw payload, or full Paddle ID
--    is included in an alert.

CREATE TABLE IF NOT EXISTS public.paddle_reconciliation_control (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  live_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  enabled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.paddle_reconciliation_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.paddle_reconciliation_control FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.paddle_reconciliation_control TO service_role, postgres;

-- Applying this migration intentionally pauses the live launcher. The rollout
-- procedure below re-enables it only after the dry-run response is verified.
INSERT INTO public.paddle_reconciliation_control (singleton, live_enabled, enabled_at)
VALUES (TRUE, FALSE, NULL)
ON CONFLICT (singleton) DO UPDATE
SET live_enabled = FALSE,
    enabled_at = NULL,
    updated_at = clock_timestamp();

CREATE TABLE IF NOT EXISTS public.paddle_reconciliation_requests (
  request_id BIGINT PRIMARY KEY,
  request_kind TEXT NOT NULL CHECK (request_kind IN ('live', 'dry_run')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  inspected_at TIMESTAMPTZ
);

ALTER TABLE public.paddle_reconciliation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.paddle_reconciliation_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.paddle_reconciliation_requests TO service_role, postgres;

CREATE INDEX IF NOT EXISTS idx_paddle_reconciliation_requests_pending
  ON public.paddle_reconciliation_requests (requested_at)
  WHERE inspected_at IS NULL;

CREATE OR REPLACE FUNCTION public._create_paddle_sync_admin_alert(
  p_source_id TEXT,
  p_failure_code TEXT,
  p_source TEXT,
  p_retryable BOOLEAN
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INTEGER;
  v_title TEXT := 'Paddle billing sync requires attention';
  v_body TEXT;
  v_title_ja TEXT := 'Paddle課金同期の確認が必要です';
  v_body_ja TEXT;
  v_translations JSONB;
BEGIN
  IF p_source_id IS NULL OR length(p_source_id) < 1 OR length(p_source_id) > 160
     OR p_failure_code IS NULL OR p_failure_code !~ '^[a-z0-9_]{1,80}$'
     OR p_source NOT IN ('webhook', 'reconciliation', 'cron') THEN
    RAISE EXCEPTION 'PADDLE_INVALID_ADMIN_ALERT' USING ERRCODE = '22023';
  END IF;

  v_body := format(
    'Failure code: %s. Source: %s. Retryable: %s. Check Paddle synchronization health and unresolved issues.',
    p_failure_code,
    p_source,
    CASE WHEN p_retryable THEN 'yes' ELSE 'no' END
  );
  v_body_ja := format(
    '失敗コード: %s。発生元: %s。再試行可能: %s。Paddle同期状態と未解決issueを確認してください。',
    p_failure_code,
    p_source,
    CASE WHEN p_retryable THEN 'はい' ELSE 'いいえ' END
  );

  v_translations := jsonb_build_object(
    'en', jsonb_build_object('title', v_title, 'body', v_body),
    'ja', jsonb_build_object('title', v_title_ja, 'body', v_body_ja),
    'zh-Hans', jsonb_build_object('title', v_title, 'body', v_body),
    'zh-Hant', jsonb_build_object('title', v_title, 'body', v_body),
    'ko', jsonb_build_object('title', v_title, 'body', v_body),
    'es', jsonb_build_object('title', v_title, 'body', v_body),
    'pt-BR', jsonb_build_object('title', v_title, 'body', v_body),
    'de', jsonb_build_object('title', v_title, 'body', v_body),
    'fr', jsonb_build_object('title', v_title, 'body', v_body),
    'it', jsonb_build_object('title', v_title, 'body', v_body)
  );

  INSERT INTO public.admin_messages (
    target, title, body, translations, source_id, read_by, message_key, message_params
  )
  SELECT p.id::TEXT,
         v_title,
         v_body,
         v_translations,
         p_source_id,
         '{}'::UUID[],
         NULL,
         '{}'::JSONB
    FROM public.profiles AS p
   WHERE COALESCE(p.is_admin, FALSE)
  ON CONFLICT (source_id, target) WHERE source_id IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public._create_paddle_sync_admin_alert(TEXT, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._create_paddle_sync_admin_alert(TEXT, TEXT, TEXT, BOOLEAN)
  TO service_role, postgres;

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
DECLARE
  v_issue_id BIGINT;
BEGIN
  IF p_profile_id IS NULL
     OR p_failure_code IS NULL OR p_failure_code !~ '^[a-z0-9_]{1,80}$'
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
    attempt_count = public.paddle_subscription_sync_issues.attempt_count + 1
  RETURNING id INTO v_issue_id;

  PERFORM public._create_paddle_sync_admin_alert(
    'paddle-sync-issue:' || v_issue_id::TEXT,
    p_failure_code,
    p_source,
    p_retryable
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_paddle_sync_issue(UUID, TEXT, TEXT, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_paddle_sync_issue(UUID, TEXT, TEXT, BOOLEAN, TEXT)
  TO service_role, postgres;

CREATE OR REPLACE FUNCTION public._queue_paddle_reconciliation(
  p_force BOOLEAN,
  p_dry_run BOOLEAN,
  p_request_kind TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret TEXT;
  v_request_id BIGINT;
BEGIN
  IF p_force IS NULL
     OR p_dry_run IS NULL
     OR p_request_kind IS NULL
     OR p_request_kind NOT IN ('live', 'dry_run')
     OR p_dry_run <> (p_request_kind = 'dry_run') THEN
    RAISE EXCEPTION 'PADDLE_INVALID_RECONCILIATION_REQUEST' USING ERRCODE = '22023';
  END IF;

  SELECT ds.decrypted_secret
    INTO v_secret
    FROM vault.decrypted_secrets AS ds
   WHERE ds.name = 'one_eight_paddle_reconcile_secret'
   ORDER BY ds.created_at DESC
   LIMIT 1;

  IF v_secret IS NULL OR length(v_secret) < 32 THEN
    RAISE EXCEPTION 'PADDLE_RECONCILE_SECRET_NOT_CONFIGURED';
  END IF;

  SELECT net.http_post(
    url := 'https://farieecfyajbtmjxelop.supabase.co/functions/v1/paddle-reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := jsonb_build_object('force', p_force, 'dry_run', p_dry_run),
    timeout_milliseconds := 30000
  ) INTO v_request_id;

  INSERT INTO public.paddle_reconciliation_requests (request_id, request_kind)
  VALUES (v_request_id, p_request_kind);

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public._queue_paddle_reconciliation(BOOLEAN, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._queue_paddle_reconciliation(BOOLEAN, BOOLEAN, TEXT)
  TO service_role, postgres;

CREATE OR REPLACE FUNCTION public.invoke_paddle_subscription_reconciliation()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_live_enabled BOOLEAN := FALSE;
BEGIN
  SELECT prc.live_enabled
    INTO v_live_enabled
    FROM public.paddle_reconciliation_control AS prc
   WHERE prc.singleton = TRUE;

  IF NOT COALESCE(v_live_enabled, FALSE) THEN
    RETURN NULL;
  END IF;

  RETURN public._queue_paddle_reconciliation(FALSE, FALSE, 'live');
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_paddle_subscription_reconciliation()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_paddle_subscription_reconciliation()
  TO service_role, postgres;

CREATE OR REPLACE FUNCTION public.request_paddle_reconciliation_dry_run()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public._queue_paddle_reconciliation(TRUE, TRUE, 'dry_run');
END;
$$;

REVOKE ALL ON FUNCTION public.request_paddle_reconciliation_dry_run()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_paddle_reconciliation_dry_run()
  TO service_role, postgres;

CREATE OR REPLACE FUNCTION public.set_paddle_reconciliation_live(p_enabled BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'PADDLE_RECONCILIATION_ENABLED_REQUIRED' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.paddle_reconciliation_control (
    singleton, live_enabled, enabled_at, updated_at
  ) VALUES (
    TRUE,
    p_enabled,
    CASE WHEN p_enabled THEN clock_timestamp() ELSE NULL END,
    clock_timestamp()
  )
  ON CONFLICT (singleton) DO UPDATE
  SET live_enabled = EXCLUDED.live_enabled,
      enabled_at = EXCLUDED.enabled_at,
      updated_at = EXCLUDED.updated_at;

  RETURN p_enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.set_paddle_reconciliation_live(BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_paddle_reconciliation_live(BOOLEAN)
  TO service_role, postgres;

CREATE OR REPLACE FUNCTION public.monitor_paddle_subscription_reconciliation()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_alert_count INTEGER := 0;
  v_added INTEGER;
  v_job RECORD;
  v_request RECORD;
BEGIN
  SELECT d.jobid, d.runid, d.status, d.start_time
    INTO v_job
    FROM cron.job AS j
    JOIN cron.job_run_details AS d ON d.jobid = j.jobid
   WHERE j.jobname = 'paddle-subscription-reconciliation'
   ORDER BY d.start_time DESC
   LIMIT 1;

  IF FOUND AND v_job.status <> 'succeeded' THEN
    SELECT public._create_paddle_sync_admin_alert(
      'paddle-cron-run:' || v_job.jobid::TEXT || ':' || v_job.runid::TEXT,
      'reconcile_cron_failed',
      'cron',
      TRUE
    ) INTO v_added;
    v_alert_count := v_alert_count + COALESCE(v_added, 0);
  END IF;

  FOR v_request IN
    SELECT prr.request_id,
           prr.requested_at,
           response.status_code,
           response.timed_out,
           response.error_msg,
           response.id AS response_id
      FROM public.paddle_reconciliation_requests AS prr
      LEFT JOIN net._http_response AS response ON response.id = prr.request_id
     WHERE prr.inspected_at IS NULL
       AND prr.requested_at <= clock_timestamp() - INTERVAL '45 seconds'
     ORDER BY prr.requested_at
     LIMIT 50
  LOOP
    IF v_request.response_id IS NULL
       AND v_request.requested_at > clock_timestamp() - INTERVAL '5 minutes' THEN
      CONTINUE;
    END IF;

    UPDATE public.paddle_reconciliation_requests
       SET inspected_at = clock_timestamp()
     WHERE request_id = v_request.request_id;

    IF v_request.response_id IS NULL THEN
      SELECT public._create_paddle_sync_admin_alert(
        'paddle-http-missing:' || v_request.request_id::TEXT,
        'reconcile_http_response_missing',
        'cron',
        TRUE
      ) INTO v_added;
    ELSIF COALESCE(v_request.timed_out, FALSE)
       OR v_request.error_msg IS NOT NULL
       OR v_request.status_code IS NULL
       OR v_request.status_code < 200
       OR v_request.status_code >= 300 THEN
      SELECT public._create_paddle_sync_admin_alert(
        'paddle-http-failure:' || v_request.request_id::TEXT,
        'reconcile_http_failed',
        'cron',
        TRUE
      ) INTO v_added;
    ELSE
      v_added := 0;
    END IF;
    v_alert_count := v_alert_count + COALESCE(v_added, 0);
  END LOOP;

  DELETE FROM public.paddle_reconciliation_requests
   WHERE inspected_at IS NOT NULL
     AND inspected_at < clock_timestamp() - INTERVAL '30 days';

  RETURN v_alert_count;
END;
$$;

REVOKE ALL ON FUNCTION public.monitor_paddle_subscription_reconciliation()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.monitor_paddle_subscription_reconciliation()
  TO service_role, postgres;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'paddle-subscription-reconciliation') THEN
    PERFORM cron.unschedule('paddle-subscription-reconciliation');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'paddle-subscription-reconciliation-monitor') THEN
    PERFORM cron.unschedule('paddle-subscription-reconciliation-monitor');
  END IF;

  PERFORM cron.schedule(
    'paddle-subscription-reconciliation',
    '*/5 * * * *',
    'SELECT public.invoke_paddle_subscription_reconciliation();'
  );
  PERFORM cron.schedule(
    'paddle-subscription-reconciliation-monitor',
    '2-59/5 * * * *',
    'SELECT public.monitor_paddle_subscription_reconciliation();'
  );
END
$$;
