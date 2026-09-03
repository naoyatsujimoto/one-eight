# Paddle subscription synchronization

The Paddle Subscription object is the billing source of truth. Once a profile
is securely bound to its Paddle IDs, ONE EIGHT keeps access state current
through two independent delivery paths:

1. signed Paddle webhooks (primary), and
2. a five-minute reconciliation job against the Paddle API (backstop).

Both paths use `public._paddle_apply_subscription_state()`, which locks the
profile row, verifies the stored Paddle identity, and orders changes by Paddle
`Subscription.updated_at`. A delayed webhook therefore cannot overwrite a
newer reconciliation result. Reconciliation may re-apply the same canonical
version to repair incomplete local fields.

## Identity and entitlement rules

- First binding requires an unbound profile, matching Supabase UID, matching
  Auth/custom/Paddle Customer emails, and an allowlisted ONE EIGHT Pro price.
- After binding, the exact `(paddle_customer_id, paddle_subscription_id)` pair
  is authoritative. `custom_data` is only a consistency check and cannot move
  a subscription to another profile.
- A same-customer resubscription may replace the stored subscription ID only
  after Paddle API verification proves that the stored subscription is
  canceled and the incoming active/trialing subscription was created later.
  The SQL update also requires the locked row to still contain the exact old
  subscription ID, preventing concurrent or delayed replacement races.
- A partial ID match, ID collision, test account, denied account, or wrong
  price never updates billing state.
- `active` without `current_billing_period.ends_at` fails closed in the app,
  pricing page, KPI, Arena entry, Ghost, and history access.
- A canonical `canceled` state with no billing period clears the old period;
  it never inherits a stale future access date. Scheduled cancellation remains
  `active` in Paddle until the paid period actually ends.
- API, Auth, and database outages are retryable errors, not permanent denials.
- Recurring transaction events are retained for renewal KPI use but never
  grant Pro access. Initial/non-recurring transactions are retained as skipped
  so they cannot be miscounted as renewals.
- A transaction for a valid but not-yet-bound subscription remains retryable
  and visible in monitoring. It is not silently discarded while a lifecycle
  notification may still establish the verified binding.

## Required Edge Function secrets

These values are configured in Supabase and must never be committed:

- `PADDLE_WEBHOOK_SECRET`
- `PADDLE_API_KEY`
- `PADDLE_RECONCILE_SECRET` (a new random value of at least 32 characters)
- `PADDLE_PRO_PRICE_IDS` (optional comma-separated override; the current
  production Pro price remains the code default)

Store the same `PADDLE_RECONCILE_SECRET` value in Supabase Vault under the name
`one_eight_paddle_reconcile_secret`. The cron function reads it only at run
time.

## Production rollout order

1. Read-only preflight: verify no duplicate Paddle IDs, no partial ID pairs,
   and no non-internal `active` row with a NULL period end.
2. Configure the reconciliation secret in Edge Function secrets and Vault.
3. Ensure the Paddle notification destination includes the subscription
   lifecycle events handled by `paddle-webhook` (created, activated, updated,
   trialing, paused, resumed, canceled, and past_due) plus transaction.completed
   and transaction.payment_failed.
4. Apply migrations `20260902000001` through
   `20260903000001_paddle_sync_operational_hardening`. The operational migration
   installs the cron jobs but leaves live reconciliation disabled.
5. Deploy `paddle-webhook` and `paddle-reconcile`.
6. Call `public.request_paddle_reconciliation_dry_run()`. This queues
   reconciliation with `{ "force": true, "dry_run": true }` and checks
   one bounded batch (up to 10); stop on any API authentication, identity, or
   price error.
7. After verifying an HTTP 200 dry-run response with no failures, call
   `public.set_paddle_reconciliation_live(TRUE)`. Never enable the live gate
   before the dry-run succeeds.
8. Verify all Paddle-active subscriptions, including the Sep 2 affected
   account, now have the Paddle period end and a recent
   `paddle_last_synced_at`. Do not hand-edit individual billing rows.
9. Verify the cron job exists once and its latest HTTP response is successful.

## Monitoring

Unresolved failures are deduplicated in
`public.paddle_subscription_sync_issues`. New issues and cron/HTTP failures
create one deduplicated, admin-only ONE EIGHT MAIL notification. The monitor
runs two minutes after each reconciliation interval. Logs, responses, and
alerts use fixed failure codes and counts only; they do not include email,
tokens, raw Paddle responses, or full subscription IDs.

Paddle must also have a separate administrator email destination for
`api_key.expiring`, `api_key.expired`, `api_key.revoked`, and
`api_key_exposure.created`; these events are operational alerts and are not
sent to the subscription webhook handler.

The reconciliation launcher raises a database error when its Vault secret is
missing, so pg_cron cannot report a false-success run with no HTTP request.
Successful synchronization resolves only retryable issues from the same
source and subscription prefix; unrelated security findings remain open.
