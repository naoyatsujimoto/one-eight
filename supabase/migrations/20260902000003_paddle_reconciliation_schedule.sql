-- Periodic Paddle reconciliation backstop.
-- The bearer value is provisioned separately in Supabase Vault under
-- `one_eight_paddle_reconcile_secret`; no secret is committed here.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.invoke_paddle_subscription_reconciliation()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret TEXT;
  v_request_id BIGINT;
BEGIN
  SELECT ds.decrypted_secret
    INTO v_secret
    FROM vault.decrypted_secrets AS ds
   WHERE ds.name = 'one_eight_paddle_reconcile_secret'
   ORDER BY ds.created_at DESC
   LIMIT 1;

  IF v_secret IS NULL OR length(v_secret) < 32 THEN
    -- A warning would make pg_cron report a successful run even though no
    -- reconciliation request was sent. Fail visibly so monitoring catches a
    -- missing/rotated secret immediately.
    RAISE EXCEPTION 'PADDLE_RECONCILE_SECRET_NOT_CONFIGURED';
  END IF;

  SELECT net.http_post(
    url := 'https://farieecfyajbtmjxelop.supabase.co/functions/v1/paddle-reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := jsonb_build_object('force', FALSE, 'dry_run', FALSE),
    timeout_milliseconds := 30000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_paddle_subscription_reconciliation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_paddle_subscription_reconciliation() TO service_role, postgres;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'paddle-subscription-reconciliation') THEN
    PERFORM cron.unschedule('paddle-subscription-reconciliation');
  END IF;

  PERFORM cron.schedule(
    'paddle-subscription-reconciliation',
    '*/5 * * * *',
    'SELECT public.invoke_paddle_subscription_reconciliation();'
  );
END
$$;
