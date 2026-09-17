-- Paddle synchronization failures are operational data, not player MAIL.
-- Retain the old helper signature because existing issue/cron functions call it.
CREATE TABLE public.paddle_sync_operational_alerts (
  source_id TEXT PRIMARY KEY CHECK (length(source_id) BETWEEN 1 AND 160),
  failure_code TEXT NOT NULL CHECK (failure_code ~ '^[a-z0-9_]{1,80}$'),
  source TEXT NOT NULL CHECK (source IN ('webhook', 'reconciliation', 'cron')),
  retryable BOOLEAN NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.paddle_sync_operational_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.paddle_sync_operational_alerts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.paddle_sync_operational_alerts TO service_role, postgres;

-- Preserve existing operational history before removing it from player MAIL.
INSERT INTO public.paddle_sync_operational_alerts
  (source_id, failure_code, source, retryable, recorded_at)
SELECT DISTINCT ON (source_id)
  source_id,
  substring(body FROM '^Failure code: ([a-z0-9_]{1,80})\.'),
  substring(body FROM 'Source: (webhook|reconciliation|cron)\.'),
  body LIKE '%Retryable: yes.%',
  created_at
FROM public.admin_messages
WHERE title = 'Paddle billing sync requires attention'
  AND source_id LIKE 'paddle-%'
  AND body ~ '^Failure code: [a-z0-9_]{1,80}\.'
  AND body ~ 'Source: (webhook|reconciliation|cron)\.'
ORDER BY source_id, created_at;

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
BEGIN
  IF p_source_id IS NULL OR length(p_source_id) < 1 OR length(p_source_id) > 160
     OR p_failure_code IS NULL OR p_failure_code !~ '^[a-z0-9_]{1,80}$'
     OR p_source IS NULL OR p_source NOT IN ('webhook', 'reconciliation', 'cron') THEN
    RAISE EXCEPTION 'PADDLE_INVALID_ADMIN_ALERT' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.paddle_sync_operational_alerts
    (source_id, failure_code, source, retryable)
  VALUES
    (p_source_id, p_failure_code, p_source, COALESCE(p_retryable, FALSE))
  ON CONFLICT (source_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public._create_paddle_sync_admin_alert(TEXT, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._create_paddle_sync_admin_alert(TEXT, TEXT, TEXT, BOOLEAN)
  TO service_role, postgres;

DELETE FROM public.admin_messages
WHERE title = 'Paddle billing sync requires attention'
  AND source_id LIKE 'paddle-%'
  AND body ~ '^Failure code: [a-z0-9_]{1,80}\.'
  AND body ~ 'Source: (webhook|reconciliation|cron)\.';
