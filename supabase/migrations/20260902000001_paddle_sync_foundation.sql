-- Paddle subscription synchronization resilience: schema foundation.
-- This migration intentionally aborts instead of guessing when existing data
-- violates an identity invariant.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.profiles AS p
     WHERE p.paddle_customer_id IS NOT NULL
     GROUP BY p.paddle_customer_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'PADDLE_PREFLIGHT_DUPLICATE_CUSTOMER_ID';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.profiles AS p
     WHERE p.paddle_subscription_id IS NOT NULL
     GROUP BY p.paddle_subscription_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'PADDLE_PREFLIGHT_DUPLICATE_SUBSCRIPTION_ID';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.profiles AS p
     WHERE (p.paddle_customer_id IS NULL) <> (p.paddle_subscription_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'PADDLE_PREFLIGHT_PARTIAL_ID_BINDING';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.profiles AS p
     WHERE (p.paddle_customer_id IS NOT NULL AND p.paddle_customer_id !~ '^ctm_[a-z0-9]+$')
        OR (p.paddle_subscription_id IS NOT NULL AND p.paddle_subscription_id !~ '^sub_[a-z0-9]+$')
  ) THEN
    RAISE EXCEPTION 'PADDLE_PREFLIGHT_MALFORMED_ID_BINDING';
  END IF;

END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_paddle_customer_id
  ON public.profiles (paddle_customer_id)
  WHERE paddle_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_paddle_subscription_id
  ON public.profiles (paddle_subscription_id)
  WHERE paddle_subscription_id IS NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS paddle_state_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paddle_last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paddle_reconcile_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paddle_sync_source TEXT;

COMMENT ON COLUMN public.profiles.paddle_state_updated_at IS
  'Paddle Subscription.updated_at ordering key shared by webhook and reconciliation.';
COMMENT ON COLUMN public.profiles.paddle_last_synced_at IS
  'Last successful synchronization attempt; separate from webhook occurred_at.';
COMMENT ON COLUMN public.profiles.paddle_reconcile_attempted_at IS
  'Last reconciliation claim attempt; used for fair, bounded background batches.';
COMMENT ON COLUMN public.profiles.paddle_sync_source IS
  'Source that last applied a Paddle subscription state: webhook or reconciliation.';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_paddle_ids_pair_check,
  ADD CONSTRAINT profiles_paddle_ids_pair_check CHECK (
    (paddle_customer_id IS NULL AND paddle_subscription_id IS NULL)
    OR
    (
      paddle_customer_id IS NOT NULL
      AND paddle_subscription_id IS NOT NULL
      AND paddle_customer_id ~ '^ctm_[a-z0-9]+$'
      AND paddle_subscription_id ~ '^sub_[a-z0-9]+$'
    )
  ),
  DROP CONSTRAINT IF EXISTS profiles_paddle_sync_source_check,
  ADD CONSTRAINT profiles_paddle_sync_source_check CHECK (
    paddle_sync_source IS NULL OR paddle_sync_source IN ('webhook', 'reconciliation')
  ),
  DROP CONSTRAINT IF EXISTS profiles_active_requires_period_end_check;

-- A NOT VALID CHECK still blocks unrelated UPDATEs of a legacy invalid row.
-- Use targeted triggers during canonical repair: legacy rows remain readable
-- and reconcilable, while any new/changed entitlement must fail closed.
CREATE OR REPLACE FUNCTION public._enforce_active_subscription_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.subscription_status = 'active'
     AND NEW.current_period_end IS NULL
     AND NOT COALESCE(NEW.is_internal_test_account, FALSE) THEN
    RAISE EXCEPTION 'PADDLE_ACTIVE_PERIOD_END_REQUIRED' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_active_period_insert_guard ON public.profiles;
CREATE TRIGGER profiles_active_period_insert_guard
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public._enforce_active_subscription_period();

DROP TRIGGER IF EXISTS profiles_active_period_update_guard ON public.profiles;
CREATE TRIGGER profiles_active_period_update_guard
BEFORE UPDATE OF subscription_status, current_period_end, is_internal_test_account
ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public._enforce_active_subscription_period();

REVOKE ALL ON FUNCTION public._enforce_active_subscription_period() FROM PUBLIC, anon, authenticated;

-- Existing rows predate the ordering column. Seed it only from Paddle's own
-- Subscription.updated_at in the newest successfully applied exact-pair
-- webhook. Never mix envelope delivery time with entity state time.
WITH exact_processed AS (
  SELECT p.id AS profile_id,
         pwe.occurred_at,
         CASE
           WHEN (pwe.payload #>> '{data,updated_at}')
                ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
             THEN (pwe.payload #>> '{data,updated_at}')::TIMESTAMPTZ
           ELSE NULL
         END AS state_updated_at
    FROM public.profiles AS p
    JOIN public.paddle_webhook_events AS pwe
      ON pwe.payload #>> '{data,customer_id}' = p.paddle_customer_id
     AND pwe.payload #>> '{data,id}' = p.paddle_subscription_id
   WHERE p.paddle_state_updated_at IS NULL
     AND p.paddle_customer_id IS NOT NULL
     AND p.paddle_subscription_id IS NOT NULL
     AND NOT (
       p.subscription_status = 'active'
       AND p.current_period_end IS NULL
       AND NOT COALESCE(p.is_internal_test_account, FALSE)
     )
     AND pwe.result = 'processed'
), latest AS (
  SELECT DISTINCT ON (ep.profile_id)
         ep.profile_id,
         ep.state_updated_at
    FROM exact_processed AS ep
   WHERE ep.state_updated_at IS NOT NULL
     AND ep.state_updated_at <= clock_timestamp() + INTERVAL '5 minutes'
   ORDER BY ep.profile_id, ep.state_updated_at DESC, ep.occurred_at DESC
)
UPDATE public.profiles AS p
   SET paddle_state_updated_at = l.state_updated_at
  FROM latest AS l
 WHERE p.id = l.profile_id;

ALTER TABLE public.paddle_webhook_events
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_token UUID,
  ADD COLUMN IF NOT EXISTS last_error_code TEXT;

-- Backfill only when both Paddle IDs exactly match the profile. This supplies
-- a safe canonical profile_id for existing KPI records without trusting
-- custom_data alone.
UPDATE public.paddle_webhook_events AS pwe
   SET profile_id = p.id,
       payload = jsonb_set(pwe.payload, '{user_id}', to_jsonb(p.id::TEXT), TRUE)
  FROM public.profiles AS p
 WHERE pwe.profile_id IS NULL
   AND p.paddle_customer_id = pwe.payload #>> '{data,customer_id}'
   AND p.paddle_subscription_id = COALESCE(
         pwe.payload #>> '{data,subscription_id}',
         pwe.payload #>> '{data,id}'
       );

ALTER TABLE public.paddle_webhook_events
  ALTER COLUMN processed_at DROP NOT NULL,
  ALTER COLUMN processed_at DROP DEFAULT;

UPDATE public.paddle_webhook_events AS pwe
   SET attempt_count = GREATEST(pwe.attempt_count, 1),
       completed_at = COALESCE(
         pwe.completed_at,
         CASE WHEN pwe.result IN ('processed', 'skipped', 'denied')
              THEN pwe.processed_at END
       ),
       processed_at = CASE WHEN pwe.result IN ('processed', 'skipped', 'denied')
                           THEN pwe.processed_at ELSE NULL END
 WHERE pwe.attempt_count = 0
    OR (pwe.completed_at IS NULL AND pwe.result IN ('processed', 'skipped', 'denied'))
    OR (pwe.processed_at IS NOT NULL AND pwe.result IN ('pending', 'error'));

ALTER TABLE public.paddle_webhook_events
  DROP CONSTRAINT IF EXISTS paddle_webhook_events_attempt_count_check,
  ADD CONSTRAINT paddle_webhook_events_attempt_count_check CHECK (attempt_count >= 0),
  DROP CONSTRAINT IF EXISTS paddle_webhook_events_last_error_code_check,
  ADD CONSTRAINT paddle_webhook_events_last_error_code_check CHECK (
    last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_]{1,80}$'
  );

CREATE INDEX IF NOT EXISTS idx_paddle_webhook_events_retryable
  ON public.paddle_webhook_events (result, last_attempt_at)
  WHERE result IN ('pending', 'error');

CREATE INDEX IF NOT EXISTS idx_paddle_webhook_events_profile_id
  ON public.paddle_webhook_events (profile_id, occurred_at DESC)
  WHERE profile_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.paddle_subscription_sync_issues (
  id                            BIGSERIAL PRIMARY KEY,
  profile_id                    UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_id_prefix        TEXT,
  failure_code                  TEXT NOT NULL CHECK (failure_code ~ '^[a-z0-9_]{1,80}$'),
  retryable                     BOOLEAN NOT NULL,
  source                        TEXT NOT NULL CHECK (source IN ('webhook', 'reconciliation')),
  first_seen_at                 TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  last_seen_at                  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  attempt_count                 INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  resolved_at                   TIMESTAMPTZ,
  CHECK (subscription_id_prefix IS NULL OR subscription_id_prefix ~ '^sub_[a-z0-9]{0,8}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_paddle_sync_open_issue
  ON public.paddle_subscription_sync_issues (profile_id, failure_code, source)
  WHERE resolved_at IS NULL AND profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_paddle_sync_issues_unresolved
  ON public.paddle_subscription_sync_issues (last_seen_at DESC)
  WHERE resolved_at IS NULL;

ALTER TABLE public.paddle_subscription_sync_issues ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.paddle_subscription_sync_issues FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.paddle_subscription_sync_issues_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.paddle_subscription_sync_issues TO service_role, postgres;
GRANT USAGE, SELECT ON SEQUENCE public.paddle_subscription_sync_issues_id_seq TO service_role, postgres;

REVOKE ALL ON TABLE public.paddle_webhook_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.paddle_webhook_events TO service_role, postgres;
