import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isProActive } from '../lib/profile';
import { fetchPaddleResource } from '../../supabase/functions/_shared/paddleApi';
import {
  decideSubscriptionBinding,
  extractSubscriptionPriceIds,
  hasAllowedProPrice,
  isCustomIdentityConsistent,
  isStrictlyNewerSubscription,
  isValidPaddleCustomerId,
  isValidPaddleSubscriptionId,
  mapPaddleSubscriptionState,
  normalizePaddleStateTimestamp,
  parseAllowedPriceIds,
  requiresPaddleCustomerVerification,
  shouldProcessExistingEvent,
  verifyInitialEmailBinding,
} from '../../supabase/functions/_shared/paddleSyncPolicy';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const customerId = 'ctm_01kt3wjtdhymydk22gwev88y8h';
const subscriptionId = 'sub_01kt3wq7arfa71nx0p0p5eh8yx';
const profileId = 'e68a0189-ffe2-41c1-afd0-b0e60a47dd1f';
const allowedPrice = 'pri_01kt39z89k9qbv3egaacsppz2r';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Paddle identity binding policy', () => {
  it('accepts valid Paddle IDs and rejects malformed ones', () => {
    expect(isValidPaddleCustomerId(customerId)).toBe(true);
    expect(isValidPaddleSubscriptionId(subscriptionId)).toBe(true);
    expect(isValidPaddleCustomerId('customer_123')).toBe(false);
    expect(isValidPaddleSubscriptionId('sub_../victim')).toBe(false);
  });

  it('uses the exact stored ID pair for an established renewal', () => {
    expect(decideSubscriptionBinding({
      payloadCustomerId: customerId,
      payloadSubscriptionId: subscriptionId,
      customUid: profileId,
      candidate: {
        id: profileId,
        paddle_customer_id: customerId,
        paddle_subscription_id: subscriptionId,
      },
      customerOwnerId: profileId,
      subscriptionOwnerId: profileId,
    })).toEqual({ ok: true, mode: 'established', profileId });
  });

  it('allows only a completely unbound profile into initial verification', () => {
    expect(decideSubscriptionBinding({
      payloadCustomerId: customerId,
      payloadSubscriptionId: subscriptionId,
      customUid: profileId,
      candidate: { id: profileId, paddle_customer_id: null, paddle_subscription_id: null },
      customerOwnerId: null,
      subscriptionOwnerId: null,
    })).toEqual({ ok: true, mode: 'initial_verification', profileId });
  });

  it('rejects a customer ID match with a different subscription ID', () => {
    const decision = decideSubscriptionBinding({
      payloadCustomerId: customerId,
      payloadSubscriptionId: 'sub_other',
      customUid: profileId,
      candidate: {
        id: profileId,
        paddle_customer_id: customerId,
        paddle_subscription_id: subscriptionId,
      },
      customerOwnerId: profileId,
      subscriptionOwnerId: null,
    });
    expect(decision).toEqual({ ok: false, reason: 'subscription_id_mismatch' });
  });

  it('recognizes a same-customer resubscription only in the explicit replacement path', () => {
    const input = {
      payloadCustomerId: customerId,
      payloadSubscriptionId: 'sub_newer',
      customUid: profileId,
      candidate: {
        id: profileId,
        paddle_customer_id: customerId,
        paddle_subscription_id: subscriptionId,
      },
      customerOwnerId: profileId,
      subscriptionOwnerId: null,
    };
    expect(decideSubscriptionBinding(input)).toEqual({
      ok: false,
      reason: 'subscription_id_mismatch',
    });
    expect(decideSubscriptionBinding({ ...input, allowSubscriptionReplacement: true })).toEqual({
      ok: true,
      mode: 'subscription_replacement',
      profileId,
    });
  });

  it('requires a replacement Subscription to have a later immutable creation time', () => {
    expect(isStrictlyNewerSubscription(
      '2026-09-02T10:00:00Z',
      '2026-06-02T10:00:00Z',
    )).toBe(true);
    expect(isStrictlyNewerSubscription(
      '2026-06-02T10:00:00Z',
      '2026-09-02T10:00:00Z',
    )).toBe(false);
    expect(isStrictlyNewerSubscription(null, '2026-06-02T10:00:00Z')).toBe(false);
  });

  it('rejects customer and subscription IDs owned by different profiles', () => {
    const decision = decideSubscriptionBinding({
      payloadCustomerId: customerId,
      payloadSubscriptionId: subscriptionId,
      customUid: '',
      candidate: {
        id: profileId,
        paddle_customer_id: customerId,
        paddle_subscription_id: 'sub_original',
      },
      customerOwnerId: profileId,
      subscriptionOwnerId: '4feace4f-0000-4000-8000-000000000000',
    });
    expect(decision).toEqual({ ok: false, reason: 'paddle_id_owner_conflict' });
  });

  it('never lets custom_data rebind another stored owner', () => {
    const decision = decideSubscriptionBinding({
      payloadCustomerId: customerId,
      payloadSubscriptionId: subscriptionId,
      customUid: '4feace4f-0000-4000-8000-000000000000',
      candidate: {
        id: profileId,
        paddle_customer_id: customerId,
        paddle_subscription_id: subscriptionId,
      },
      customerOwnerId: profileId,
      subscriptionOwnerId: profileId,
    });
    expect(decision).toEqual({ ok: false, reason: 'custom_uid_mismatch' });
  });

  it('requires exact three-way email verification only for initial binding', () => {
    expect(verifyInitialEmailBinding('A@example.com', 'a@example.com', 'a@example.com')).toBe(true);
    expect(verifyInitialEmailBinding('a@example.com', 'a@example.com', '')).toBe(false);
    expect(verifyInitialEmailBinding('a@example.com', 'victim@example.com', 'a@example.com')).toBe(false);
    expect(isCustomIdentityConsistent('a@example.com', '')).toBe(true);
    expect(isCustomIdentityConsistent('a@example.com', 'A@example.com')).toBe(true);
    expect(isCustomIdentityConsistent('a@example.com', 'victim@example.com')).toBe(false);
    expect(requiresPaddleCustomerVerification('established')).toBe(false);
    expect(requiresPaddleCustomerVerification('initial_verification')).toBe(true);
    expect(requiresPaddleCustomerVerification('subscription_replacement')).toBe(true);
  });
});

describe('Paddle entitlement and state policy', () => {
  it('extracts and validates the ONE EIGHT Pro price', () => {
    const data = { items: [{ price: { id: allowedPrice } }, { price_id: 'pri_other' }] };
    expect(extractSubscriptionPriceIds(data)).toEqual([allowedPrice, 'pri_other']);
    expect(hasAllowedProPrice(data, parseAllowedPriceIds(undefined))).toBe(true);
    expect(hasAllowedProPrice({ items: [{ price: { id: 'pri_other' } }] }, new Set([allowedPrice]))).toBe(false);
  });

  it('maps active only when a paid-period end exists', () => {
    expect(mapPaddleSubscriptionState('active', '2026-10-02T10:05:28Z', null)).toMatchObject({
      ok: true,
      subscriptionStatus: 'active',
      currentPeriodEnd: '2026-10-02T10:05:28Z',
      shouldUpdateCurrentPeriodEnd: true,
    });
    expect(mapPaddleSubscriptionState('active', null, null)).toMatchObject({
      ok: false,
      reason: 'missing_current_billing_period_ends_at',
    });
  });

  it('persists paused as inactive and past_due as past_due', () => {
    expect(mapPaddleSubscriptionState('paused', null, '2026-10-02T10:05:28Z')).toMatchObject({
      ok: true,
      subscriptionStatus: 'inactive',
    });
    expect(mapPaddleSubscriptionState('past_due', null, '2026-10-02T10:05:28Z')).toMatchObject({
      ok: true,
      subscriptionStatus: 'past_due',
      shouldUpdateCurrentPeriodEnd: false,
    });
  });

  it('does not inherit an old future period after canonical cancellation', () => {
    expect(mapPaddleSubscriptionState(
      'canceled',
      null,
      '2026-10-02T10:05:28Z',
    )).toMatchObject({
      ok: true,
      subscriptionStatus: 'canceled',
      currentPeriodEnd: null,
      shouldUpdateCurrentPeriodEnd: true,
    });
  });

  it('rejects unsupported Paddle states', () => {
    expect(mapPaddleSubscriptionState('mystery', null, null)).toMatchObject({
      ok: false,
      reason: 'unsupported_subscription_status',
    });
  });

  it('fails closed for active without current_period_end in the app', () => {
    expect(isProActive({ plan: 'pro', subscription_status: 'active', current_period_end: null })).toBe(false);
  });

  it('uses Paddle state time and rejects a future ordering key', () => {
    const now = Date.parse('2026-09-02T10:00:00Z');
    expect(normalizePaddleStateTimestamp('2026-09-02T09:59:00Z', null, now))
      .toBe('2026-09-02T09:59:00.000Z');
    expect(normalizePaddleStateTimestamp('2026-09-02T10:06:00Z', null, now)).toBeNull();
  });
});

describe('Webhook retry and reconciliation policy', () => {
  it('does not replay terminal events', () => {
    expect(shouldProcessExistingEvent('processed', null, Date.now())).toBe(false);
    expect(shouldProcessExistingEvent('denied', null, Date.now())).toBe(false);
    expect(shouldProcessExistingEvent('skipped', null, Date.now())).toBe(false);
  });

  it('replays errors and expired pending leases, not live claims', () => {
    const now = Date.parse('2026-09-02T10:10:00Z');
    expect(shouldProcessExistingEvent('error', '2026-09-02T10:09:59Z', now)).toBe(true);
    expect(shouldProcessExistingEvent('pending', '2026-09-02T10:09:30Z', now)).toBe(false);
    expect(shouldProcessExistingEvent('pending', '2026-09-02T10:07:00Z', now)).toBe(true);
  });

  it('classifies Paddle API authentication and rate-limit failures without raw bodies', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response('', { status: 429 })));
    await expect(fetchPaddleResource('/subscriptions/sub_test', 'key')).resolves.toMatchObject({
      ok: false, failureCode: 'paddle_api_unauthorized', stopBatch: true,
    });
    await expect(fetchPaddleResource('/subscriptions/sub_test', 'key')).resolves.toMatchObject({
      ok: false, failureCode: 'paddle_api_rate_limited', stopBatch: true,
    });
  });
});

describe('SQL and Edge Function safety contracts', () => {
  const foundation = read('supabase/migrations/20260902000001_paddle_sync_foundation.sql');
  const rpcs = read('supabase/migrations/20260902000002_paddle_sync_rpcs.sql');
  const schedule = read('supabase/migrations/20260902000003_paddle_reconciliation_schedule.sql');
  const entitlement = read('supabase/migrations/20260902000004_paddle_entitlement_fail_closed.sql');
  const webhook = read('supabase/functions/paddle-webhook/index.ts');
  const reconcile = read('supabase/functions/paddle-reconcile/index.ts');
  const config = read('supabase/config.toml');

  it('preflights duplicates/partial bindings before adding both partial unique indexes', () => {
    expect(foundation).toContain('PADDLE_PREFLIGHT_DUPLICATE_CUSTOMER_ID');
    expect(foundation).toContain('PADDLE_PREFLIGHT_DUPLICATE_SUBSCRIPTION_ID');
    expect(foundation).toContain('PADDLE_PREFLIGHT_PARTIAL_ID_BINDING');
    expect(foundation).toContain('PADDLE_PREFLIGHT_MALFORMED_ID_BINDING');
    expect(foundation).toMatch(/CREATE UNIQUE INDEX[\s\S]+WHERE paddle_customer_id IS NOT NULL/);
    expect(foundation).toMatch(/CREATE UNIQUE INDEX[\s\S]+WHERE paddle_subscription_id IS NOT NULL/);
    expect(foundation).toMatch(/paddle_customer_id IS NOT NULL[\s\S]+paddle_subscription_id IS NOT NULL/);
  });

  it('adds claim lease/retry state and keeps terminal duplicates terminal', () => {
    expect(rpcs).toContain("v_existing.result IN ('processed', 'skipped', 'denied')");
    expect(rpcs).toContain("v_existing.result = 'pending'");
    expect(rpcs).toContain("result = 'pending'");
    expect(foundation).toContain('processing_token UUID');
    expect(foundation).toContain('attempt_count INTEGER');
  });

  it('atomically applies monotonic subscription state during event finalization', () => {
    expect(rpcs).toContain('SELECT public._paddle_apply_subscription_state(');
    expect(rpcs).toContain('p_state_updated_at < v_profile.paddle_state_updated_at');
    expect(rpcs).toContain("p_sync_source = 'webhook'");
    expect(rpcs).toContain("p_sync_source = 'webhook'");
    expect(rpcs).toContain("RETURN 'stale'");
    expect(rpcs).toContain('p_expected_previous_subscription_id');
    expect(rpcs).toContain("pwe.event_type IN ('transaction.completed', 'transaction.payment_failed')");
  });

  it('does not let recurring updates depend on Paddle customer email', () => {
    expect(webhook).toContain('!requiresPaddleCustomerVerification(bindingMode)');
    expect(webhook).not.toContain('paddleEmail = customEmail');
    expect(webhook).not.toContain('48 * 3600');
    expect(webhook).toContain("return new Response('Retry Later', { status: 503 })");
    expect(webhook).toContain("'subscription.created'");
    expect(webhook).toContain("'subscription.paused'");
    expect(webhook).toContain('signatureHashes.some');
  });

  it('records transaction KPI events without granting entitlement', () => {
    expect(webhook).toContain("'transaction.completed'");
    expect(webhook).toContain("'transaction.payment_failed'");
    const handler = webhook.slice(
      webhook.indexOf('async function handleObservedTransaction'),
      webhook.indexOf('async function handleSubscriptionEvent'),
    );
    expect(handler).toContain("isRecurringBilling ? 'processed' : 'skipped'");
    expect(handler).toContain('transaction_subscription_not_bound');
    expect(handler).not.toContain('applySubscription: true');
  });

  it('makes active-without-period fail closed in DB, KPI, app, and pricing', () => {
    expect(foundation).toContain('public._enforce_active_subscription_period()');
    expect(foundation).toContain('profiles_active_period_insert_guard');
    expect(foundation).toContain('profiles_active_period_update_guard');
    expect(rpcs).toContain("p_subscription_status = 'active'");
    expect(rpcs).toContain('p_current_period_end IS NOT NULL AND p_current_period_end > now()');
    expect(read('src/lib/profile.ts')).toContain('profile.current_period_end !== null');
    expect(read('public/pricing.html')).toContain("new Date(profile.current_period_end) > now : false");
    expect(entitlement.match(/current_period_end IS NOT NULL/g)?.length).toBeGreaterThanOrEqual(2);
    expect(entitlement).toContain('public.enter_arena_event');
    expect(entitlement).toContain('public.get_ghost_moves');
    expect(entitlement).toContain('public.get_user_match_history');
    expect(entitlement.match(/REVOKE ALL ON FUNCTION[\s\S]*?FROM PUBLIC, anon;/g)?.length).toBe(3);
  });

  it('resolves only retryable issues for the same source and subscription', () => {
    expect(rpcs).toContain('psi.source = p_source');
    expect(rpcs).toContain('psi.retryable');
    expect(rpcs).toContain('psi.subscription_id_prefix IS NOT DISTINCT FROM p_subscription_id_prefix');
  });

  it('keeps reconciliation exact-ID, price-checked, non-destructive, and independently authenticated', () => {
    expect(reconcile).toContain("subscription.customer_id !== profile.paddle_customer_id");
    expect(reconcile).toContain('hasAllowedProPrice(subscription, ALLOWED_PRICE_IDS)');
    expect(reconcile).toContain("p_allow_initial_binding: false");
    expect(reconcile).not.toContain('paddle_last_event_at');
    expect(reconcile).toContain('PADDLE_RECONCILE_SECRET');
    expect(reconcile).toContain("supabase.rpc('claim_paddle_reconcile_profiles'");
    expect(reconcile).toContain('Promise.all(rows.map');
    expect(reconcile).toContain('DENIED_EMAILS.has(authEmail)');
    expect(config).toContain('[functions.paddle-reconcile]');
  });

  it('schedules a deduplicated five-minute backstop with a Vault secret', () => {
    expect(schedule).toContain("jobname = 'paddle-subscription-reconciliation'");
    expect(schedule).toContain("'*/5 * * * *'");
    expect(schedule).toContain("one_eight_paddle_reconcile_secret");
    expect(schedule).toContain("RAISE EXCEPTION 'PADDLE_RECONCILE_SECRET_NOT_CONFIGURED'");
    expect(schedule).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{32,}/);
  });

  it('revokes subscription synchronization surfaces from clients', () => {
    expect(foundation).toContain('FROM PUBLIC, anon, authenticated');
    expect(rpcs.match(/FROM PUBLIC, anon, authenticated/g)?.length).toBeGreaterThanOrEqual(7);
    expect(rpcs).toContain('TO service_role, postgres');
  });
});
