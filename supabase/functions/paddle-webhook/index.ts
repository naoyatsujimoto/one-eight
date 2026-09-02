/**
 * Paddle webhook -> subscription state synchronization.
 *
 * A bound (customer_id, subscription_id) pair is authoritative. Initial
 * binding requires Auth/custom/Paddle email equality and an allowlisted Pro
 * price. Infrastructure failures remain retryable; profile state and event
 * completion are finalized atomically by SQL.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  fetchPaddleResource,
  type PaddleApiResult,
} from '../_shared/paddleApi.ts';
import {
  decideSubscriptionBinding,
  extractSubscriptionPriceIds,
  hasAllowedProPrice,
  isCustomIdentityConsistent,
  isStrictlyNewerSubscription,
  isValidPaddleCustomerId,
  isValidPaddleSubscriptionId,
  mapPaddleSubscriptionState,
  normalizeEmail,
  normalizePaddleStateTimestamp,
  parseAllowedPriceIds,
  requiresPaddleCustomerVerification,
  subscriptionIdPrefix,
  verifyInitialEmailBinding,
  type StoredPaddleIdentity,
} from '../_shared/paddleSyncPolicy.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PADDLE_WEBHOOK_SECRET = Deno.env.get('PADDLE_WEBHOOK_SECRET') ?? '';
const PADDLE_API_KEY = Deno.env.get('PADDLE_API_KEY') ?? '';
const ALLOWED_PRICE_IDS = parseAllowedPriceIds(Deno.env.get('PADDLE_PRO_PRICE_IDS'));
const SIGNATURE_FRESHNESS_SECONDS = 5 * 60;
const EVENT_LEASE_SECONDS = 120;

const SUBSCRIPTION_EVENTS = new Set([
  'subscription.created',
  'subscription.activated',
  'subscription.updated',
  'subscription.trialing',
  'subscription.paused',
  'subscription.resumed',
  'subscription.canceled',
  'subscription.past_due',
]);
const OBSERVED_TRANSACTION_EVENTS = new Set([
  'transaction.completed',
  'transaction.payment_failed',
]);
const DENIED_EMAILS = new Set(['info@tentomushi.co.jp']);

type SupabaseClient = ReturnType<typeof createClient>;

interface ProfileRow extends StoredPaddleIdentity {
  plan: string;
  subscription_status: string;
  current_period_end: string | null;
  is_test_account: boolean;
  is_internal_test_account: boolean;
  paddle_state_updated_at: string | null;
}
interface PaddleSubscriptionData {
  id?: string;
  customer_id?: string;
  subscription_id?: string;
  origin?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  current_billing_period?: { ends_at?: string | null } | null;
  custom_data?: Record<string, unknown> | null;
  customer?: { email?: string | null } | null;
  items?: unknown[];
  [key: string]: unknown;
}
interface PaddleWebhookPayload {
  event_id?: string;
  event_type?: string;
  occurred_at?: string;
  data?: PaddleSubscriptionData;
}
interface ClaimRow {
  claim_action: 'process' | 'terminal' | 'in_progress' | 'conflict';
  claim_token: string | null;
  claim_attempt_count: number;
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const body = await request.text();
  const signature = request.headers.get('paddle-signature') ?? '';
  const signatureResult = await verifyPaddleSignature(body, signature, PADDLE_WEBHOOK_SECRET);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  if (!signatureResult.valid) {
    await auditLog(supabase, null, null, null, 'invalid_signature', 'denied', {
      signature_present: signature.length > 0,
      body_length: body.length,
      failure_reason: signatureResult.reason ?? 'invalid',
    });
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: PaddleWebhookPayload;
  try {
    payload = JSON.parse(body) as PaddleWebhookPayload;
  } catch {
    await auditLog(supabase, null, null, null, 'payload_parse_error', 'error', { body_length: body.length });
    return new Response('Bad Request', { status: 400 });
  }

  const eventId = typeof payload.event_id === 'string' ? payload.event_id : '';
  const eventType = typeof payload.event_type === 'string' ? payload.event_type : '';
  const occurredAt = typeof payload.occurred_at === 'string' ? payload.occurred_at : '';
  if (!/^evt_[a-z0-9]+$/.test(eventId) || !eventType || !Number.isFinite(Date.parse(occurredAt))) {
    await auditLog(supabase, eventId || null, eventType || null, null, 'invalid_event_envelope', 'error', {
      has_event_id: Boolean(eventId),
      has_event_type: Boolean(eventType),
      has_occurred_at: Boolean(occurredAt),
    });
    return new Response('Bad Request', { status: 400 });
  }

  if (!SUBSCRIPTION_EVENTS.has(eventType) && !OBSERVED_TRANSACTION_EVENTS.has(eventType)) {
    return new Response('OK', { status: 200 });
  }

  const claim = await claimEvent(supabase, eventId, eventType, occurredAt, payload);
  if (!claim.ok) return new Response('Internal Server Error', { status: 500 });
  if (claim.row.claim_action === 'terminal') return new Response('OK', { status: 200 });
  if (claim.row.claim_action === 'in_progress') return new Response('Retry Later', { status: 503 });
  if (claim.row.claim_action === 'conflict') {
    await auditLog(supabase, eventId, eventType, null, 'event_id_metadata_conflict', 'denied', {});
    return new Response('OK', { status: 200 });
  }
  if (!claim.row.claim_token) return new Response('Internal Server Error', { status: 500 });

  if (OBSERVED_TRANSACTION_EVENTS.has(eventType)) {
    return handleObservedTransaction(supabase, payload, eventId, claim.row.claim_token);
  }
  return handleSubscriptionEvent(
    supabase, payload, eventId, eventType, occurredAt, claim.row.claim_token,
  );
});

async function handleObservedTransaction(
  supabase: SupabaseClient,
  payload: PaddleWebhookPayload,
  eventId: string,
  claimToken: string,
): Promise<Response> {
  const data = payload.data ?? {};
  const customerId = typeof data.customer_id === 'string' ? data.customer_id : '';
  const subscriptionId = typeof data.subscription_id === 'string' ? data.subscription_id : '';
  const isRecurringBilling = data.origin === 'subscription_recurring';
  let profileId: string | null = null;
  if (isValidPaddleCustomerId(customerId) && isValidPaddleSubscriptionId(subscriptionId)) {
    const exact = await selectProfileByPair(supabase, customerId, subscriptionId);
    if (!exact.ok) {
      return retryableFailure(supabase, eventId, claimToken, null, subscriptionId, 'profile_read_failed');
    }
    if (!exact.profile) {
      // Transactions can arrive before the subscription lifecycle event. Keep
      // the delivery retryable and visible instead of terminally discarding
      // the only signal that a paid subscription is not yet bound.
      return retryableFailure(
        supabase, eventId, claimToken, null, subscriptionId,
        'transaction_subscription_not_bound', true,
      );
    }
    profileId = exact.profile.id;
  }
  const finalized = await finalizeEvent(supabase, {
    eventId,
    claimToken,
    // Initial checkout/update transactions must not be counted as renewals.
    result: isRecurringBilling ? 'processed' : 'skipped',
    profileId,
  });
  return finalized
    ? new Response('OK', { status: 200 })
    : new Response('Internal Server Error', { status: 500 });
}

async function handleSubscriptionEvent(
  supabase: SupabaseClient,
  payload: PaddleWebhookPayload,
  eventId: string,
  eventType: string,
  occurredAt: string,
  claimToken: string,
): Promise<Response> {
  let subscription = payload.data ?? {};
  const customerId = typeof subscription.customer_id === 'string' ? subscription.customer_id : '';
  const subscriptionId = typeof subscription.id === 'string' ? subscription.id : '';
  const customData = subscription.custom_data ?? {};
  const customUid = typeof customData.supabase_uid === 'string' ? customData.supabase_uid.trim() : '';
  const customEmail = normalizeEmail(customData.supabase_email);

  if (!isValidPaddleCustomerId(customerId) || !isValidPaddleSubscriptionId(subscriptionId)) {
    return terminalFailure(
      supabase, eventId, eventType, claimToken, null, subscriptionId,
      'invalid_subscription_ids', 'denied',
    );
  }

  const lookup = await resolveProfileForSubscription(supabase, customerId, subscriptionId, customUid);
  if (!lookup.ok) {
    return lookup.infrastructureFailure
      ? retryableFailure(supabase, eventId, claimToken, null, subscriptionId, 'profile_read_failed')
      : terminalFailure(
        supabase, eventId, eventType, claimToken, lookup.profileId,
        subscriptionId, lookup.reason, 'denied',
      );
  }
  const { profile, bindingMode } = lookup;

  if (profile.is_test_account || profile.is_internal_test_account) {
    return terminalFailure(
      supabase, eventId, eventType, claimToken, profile.id,
      subscriptionId, 'test_profile', 'skipped',
    );
  }

  const authResult = await supabase.auth.admin.getUserById(profile.id);
  if (authResult.error) {
    return retryableFailure(
      supabase, eventId, claimToken, profile.id, subscriptionId, 'auth_user_read_failed',
    );
  }
  const authEmail = normalizeEmail(authResult.data?.user?.email);
  if (!authEmail) {
    return terminalFailure(
      supabase, eventId, eventType, claimToken, profile.id,
      subscriptionId, 'auth_email_missing', 'denied',
    );
  }
  if (DENIED_EMAILS.has(authEmail) || (customEmail && DENIED_EMAILS.has(customEmail))) {
    return terminalFailure(
      supabase, eventId, eventType, claimToken, profile.id,
      subscriptionId, 'denied_account', 'denied',
    );
  }

  if (!requiresPaddleCustomerVerification(bindingMode)) {
    if (!isCustomIdentityConsistent(authEmail, customEmail)) {
      return terminalFailure(
        supabase, eventId, eventType, claimToken, profile.id,
        subscriptionId, 'custom_email_mismatch', 'denied',
      );
    }
  } else {
    if (!customUid || !customEmail) {
      return terminalFailure(
        supabase, eventId, eventType, claimToken, profile.id,
        subscriptionId, 'initial_identity_incomplete', 'denied',
      );
    }
    let paddleEmail = normalizeEmail(subscription.customer?.email);
    if (!paddleEmail) {
      const customerResult = await fetchPaddleResource<{ id?: string; email?: string }>(
        `/customers/${encodeURIComponent(customerId)}`, PADDLE_API_KEY,
      );
      if (!customerResult.ok) {
        return apiFailureResponse(
          supabase, eventId, eventType, claimToken, profile.id, subscriptionId, customerResult,
        );
      }
      if (customerResult.data.id !== customerId) {
        return terminalFailure(
          supabase, eventId, eventType, claimToken, profile.id,
          subscriptionId, 'paddle_customer_id_mismatch', 'denied',
        );
      }
      paddleEmail = normalizeEmail(customerResult.data.email);
    }
    if (!verifyInitialEmailBinding(authEmail, customEmail, paddleEmail)) {
      return terminalFailure(
        supabase, eventId, eventType, claimToken, profile.id,
        subscriptionId, 'initial_email_mismatch', 'denied',
      );
    }
  }

  const payloadPriceIds = extractSubscriptionPriceIds(subscription);
  let rawStatus = statusForEvent(eventType, subscription.status);
  let periodEnd = subscription.current_billing_period?.ends_at ?? null;
  const needsCanonicalSubscription =
    bindingMode === 'subscription_replacement' ||
    payloadPriceIds.length === 0 || !rawStatus || !subscription.updated_at ||
    (rawStatus === 'active' && !periodEnd);

  if (payloadPriceIds.length > 0 && !hasAllowedProPrice(subscription, ALLOWED_PRICE_IDS)) {
    return terminalFailure(
      supabase, eventId, eventType, claimToken, profile.id,
      subscriptionId, 'pro_price_not_allowed', 'denied',
    );
  }

  if (needsCanonicalSubscription) {
    const subscriptionResult = await fetchPaddleResource<PaddleSubscriptionData>(
      `/subscriptions/${encodeURIComponent(subscriptionId)}`, PADDLE_API_KEY,
    );
    if (!subscriptionResult.ok) {
      return apiFailureResponse(
        supabase, eventId, eventType, claimToken, profile.id, subscriptionId, subscriptionResult,
      );
    }
    if (subscriptionResult.data.id !== subscriptionId
        || subscriptionResult.data.customer_id !== customerId) {
      return terminalFailure(
        supabase, eventId, eventType, claimToken, profile.id,
        subscriptionId, 'paddle_subscription_identity_mismatch', 'denied',
      );
    }
    subscription = subscriptionResult.data;
    rawStatus = statusForEvent(eventType, subscription.status);
    periodEnd = subscription.current_billing_period?.ends_at ?? null;
  }

  if (!hasAllowedProPrice(subscription, ALLOWED_PRICE_IDS)) {
    return terminalFailure(
      supabase, eventId, eventType, claimToken, profile.id,
      subscriptionId, 'pro_price_not_allowed', 'denied',
    );
  }

  if (bindingMode === 'subscription_replacement') {
    const previousSubscriptionId = profile.paddle_subscription_id;
    if (!previousSubscriptionId || !isValidPaddleSubscriptionId(previousSubscriptionId)) {
      return terminalFailure(
        supabase, eventId, eventType, claimToken, profile.id,
        subscriptionId, 'replacement_previous_subscription_invalid', 'denied',
      );
    }
    const previousResult = await fetchPaddleResource<PaddleSubscriptionData>(
      `/subscriptions/${encodeURIComponent(previousSubscriptionId)}`, PADDLE_API_KEY,
    );
    if (!previousResult.ok) {
      return apiFailureResponse(
        supabase, eventId, eventType, claimToken, profile.id, subscriptionId, previousResult,
      );
    }
    const previous = previousResult.data;
    if (previous.id !== previousSubscriptionId || previous.customer_id !== customerId) {
      return terminalFailure(
        supabase, eventId, eventType, claimToken, profile.id,
        subscriptionId, 'replacement_previous_identity_mismatch', 'denied',
      );
    }
    if (String(previous.status ?? '').trim().toLowerCase() !== 'canceled') {
      return retryableFailure(
        supabase, eventId, claimToken, profile.id, subscriptionId,
        'replacement_previous_subscription_not_canceled', true,
      );
    }
    const incomingStatus = String(subscription.status ?? '').trim().toLowerCase();
    if (!['active', 'trialing', 'trial'].includes(incomingStatus)
        || !isStrictlyNewerSubscription(subscription.created_at, previous.created_at)) {
      return terminalFailure(
        supabase, eventId, eventType, claimToken, profile.id,
        subscriptionId, 'replacement_subscription_not_newer', 'denied',
      );
    }
  }

  const mapped = mapPaddleSubscriptionState(rawStatus, periodEnd, profile.current_period_end);
  if (!mapped.ok || !mapped.subscriptionStatus) {
    return retryableFailure(
      supabase, eventId, claimToken, profile.id, subscriptionId,
      mapped.reason ?? 'unsupported_subscription_status', true,
    );
  }
  const stateUpdatedAt = normalizePaddleStateTimestamp(subscription.updated_at, null);
  if (!stateUpdatedAt) {
    return retryableFailure(
      supabase, eventId, claimToken, profile.id, subscriptionId, 'invalid_state_timestamp',
    );
  }

  const finalResult = await finalizeEvent(supabase, {
    eventId,
    claimToken,
    result: 'processed',
    profileId: profile.id,
    applySubscription: true,
    customerId,
    subscriptionId,
    subscriptionStatus: mapped.subscriptionStatus,
    currentPeriodEnd: mapped.currentPeriodEnd ?? null,
    updateCurrentPeriodEnd: mapped.shouldUpdateCurrentPeriodEnd,
    stateUpdatedAt,
    syncSource: 'webhook',
    webhookOccurredAt: occurredAt,
    allowInitialBinding: bindingMode === 'initial_verification',
    allowSubscriptionReplacement: bindingMode === 'subscription_replacement',
    expectedPreviousSubscriptionId: bindingMode === 'subscription_replacement'
      ? profile.paddle_subscription_id
      : null,
  });
  if (finalResult === 'processed' || finalResult === 'skipped') {
    await resolveIssues(supabase, profile.id, subscriptionId);
    return new Response('OK', { status: 200 });
  }
  return new Response('Internal Server Error', { status: 500 });
}

function statusForEvent(eventType: string, payloadStatus: unknown): string {
  const status = typeof payloadStatus === 'string' ? payloadStatus.trim().toLowerCase() : '';
  if (status) return status;
  if (eventType === 'subscription.activated') return 'active';
  if (eventType === 'subscription.trialing') return 'trialing';
  if (eventType === 'subscription.paused') return 'paused';
  if (eventType === 'subscription.resumed') return 'active';
  if (eventType === 'subscription.canceled') return 'canceled';
  if (eventType === 'subscription.past_due') return 'past_due';
  return '';
}

async function resolveProfileForSubscription(
  supabase: SupabaseClient,
  customerId: string,
  subscriptionId: string,
  customUid: string,
): Promise<
  | {
      ok: true;
      profile: ProfileRow;
      bindingMode: 'established' | 'initial_verification' | 'subscription_replacement';
    }
  | { ok: false; infrastructureFailure: boolean; reason: string; profileId: string | null }
> {
  const [customer, subscription] = await Promise.all([
    selectProfileByField(supabase, 'paddle_customer_id', customerId),
    selectProfileByField(supabase, 'paddle_subscription_id', subscriptionId),
  ]);
  if (!customer.ok || !subscription.ok) {
    return { ok: false, infrastructureFailure: true, reason: 'profile_read_failed', profileId: null };
  }
  let candidate = customer.profile ?? subscription.profile;
  if (!candidate && customUid) {
    const custom = await selectProfileById(supabase, customUid);
    if (!custom.ok) {
      return { ok: false, infrastructureFailure: true, reason: 'profile_read_failed', profileId: null };
    }
    candidate = custom.profile;
  }
  const decision = decideSubscriptionBinding({
    payloadCustomerId: customerId,
    payloadSubscriptionId: subscriptionId,
    customUid,
    candidate,
    customerOwnerId: customer.profile?.id ?? null,
    subscriptionOwnerId: subscription.profile?.id ?? null,
    allowSubscriptionReplacement: true,
  });
  if (!decision.ok || !candidate) {
    return {
      ok: false,
      infrastructureFailure: false,
      reason: decision.ok ? 'no_profile' : decision.reason,
      profileId: candidate?.id ?? null,
    };
  }
  return { ok: true, profile: candidate, bindingMode: decision.mode };
}

const PROFILE_COLUMNS = [
  'id', 'plan', 'subscription_status', 'current_period_end', 'is_test_account',
  'is_internal_test_account', 'paddle_customer_id', 'paddle_subscription_id',
  'paddle_state_updated_at',
].join(',');

async function selectProfileByPair(
  supabase: SupabaseClient,
  customerId: string,
  subscriptionId: string,
): Promise<{ ok: boolean; profile: ProfileRow | null }> {
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS)
    .eq('paddle_customer_id', customerId)
    .eq('paddle_subscription_id', subscriptionId)
    .maybeSingle();
  return error
    ? { ok: false, profile: null }
    : { ok: true, profile: (data as ProfileRow | null) ?? null };
}

async function selectProfileByField(
  supabase: SupabaseClient,
  field: 'paddle_customer_id' | 'paddle_subscription_id',
  value: string,
): Promise<{ ok: boolean; profile: ProfileRow | null }> {
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS)
    .eq(field, value).maybeSingle();
  return error
    ? { ok: false, profile: null }
    : { ok: true, profile: (data as ProfileRow | null) ?? null };
}

async function selectProfileById(
  supabase: SupabaseClient,
  profileId: string,
): Promise<{ ok: boolean; profile: ProfileRow | null }> {
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS)
    .eq('id', profileId).maybeSingle();
  return error
    ? { ok: false, profile: null }
    : { ok: true, profile: (data as ProfileRow | null) ?? null };
}

async function claimEvent(
  supabase: SupabaseClient,
  eventId: string,
  eventType: string,
  occurredAt: string,
  payload: PaddleWebhookPayload,
): Promise<{ ok: true; row: ClaimRow } | { ok: false }> {
  const { data, error } = await supabase.rpc('claim_paddle_webhook_event', {
    p_event_id: eventId,
    p_event_type: eventType,
    p_occurred_at: occurredAt,
    p_payload: payload,
    p_lease_seconds: EVENT_LEASE_SECONDS,
  });
  const row = Array.isArray(data) ? data[0] as ClaimRow | undefined : undefined;
  if (error || !row) {
    await auditLog(supabase, eventId, eventType, null, 'event_claim_failed', 'error', {
      db_error_code: error?.code ?? 'missing_result',
    });
    return { ok: false };
  }
  return { ok: true, row };
}

async function finalizeEvent(
  supabase: SupabaseClient,
  input: {
    eventId: string;
    claimToken: string;
    result: 'processed' | 'skipped' | 'denied' | 'error';
    failureCode?: string | null;
    profileId?: string | null;
    applySubscription?: boolean;
    customerId?: string | null;
    subscriptionId?: string | null;
    subscriptionStatus?: string | null;
    currentPeriodEnd?: string | null;
    updateCurrentPeriodEnd?: boolean;
    stateUpdatedAt?: string | null;
    syncSource?: 'webhook' | 'reconciliation';
    webhookOccurredAt?: string | null;
    allowInitialBinding?: boolean;
    allowSubscriptionReplacement?: boolean;
    expectedPreviousSubscriptionId?: string | null;
  },
): Promise<string | null> {
  const { data, error } = await supabase.rpc('finalize_paddle_webhook_event', {
    p_event_id: input.eventId,
    p_claim_token: input.claimToken,
    p_result: input.result,
    p_failure_code: input.failureCode ?? null,
    p_profile_id: input.profileId ?? null,
    p_apply_subscription: input.applySubscription ?? false,
    p_customer_id: input.customerId ?? null,
    p_subscription_id: input.subscriptionId ?? null,
    p_subscription_status: input.subscriptionStatus ?? null,
    p_current_period_end: input.currentPeriodEnd ?? null,
    p_update_current_period_end: input.updateCurrentPeriodEnd ?? false,
    p_state_updated_at: input.stateUpdatedAt ?? null,
    p_sync_source: input.syncSource ?? 'webhook',
    p_webhook_occurred_at: input.webhookOccurredAt ?? null,
    p_allow_initial_binding: input.allowInitialBinding ?? false,
    p_allow_subscription_replacement: input.allowSubscriptionReplacement ?? false,
    p_expected_previous_subscription_id: input.expectedPreviousSubscriptionId ?? null,
  });
  if (error || typeof data !== 'string') {
    await auditLog(
      supabase, input.eventId, null, input.profileId ?? null,
      'event_finalize_failed', 'error', { db_error_code: error?.code ?? 'missing_result' },
    );
    return null;
  }
  return data;
}

async function apiFailureResponse<T>(
  supabase: SupabaseClient,
  eventId: string,
  eventType: string,
  claimToken: string,
  profileId: string | null,
  subscriptionId: string,
  failure: Extract<PaddleApiResult<T>, { ok: false }>,
): Promise<Response> {
  return failure.retryable
    ? retryableFailure(
      supabase, eventId, claimToken, profileId, subscriptionId,
      failure.failureCode, true,
    )
    : terminalFailure(
      supabase, eventId, eventType, claimToken, profileId, subscriptionId,
      failure.failureCode, 'denied',
    );
}

async function terminalFailure(
  supabase: SupabaseClient,
  eventId: string,
  eventType: string,
  claimToken: string,
  profileId: string | null,
  subscriptionId: string,
  failureCode: string,
  result: 'denied' | 'skipped',
): Promise<Response> {
  await auditLog(supabase, eventId, eventType, profileId, failureCode, result, {
    subscription_id_prefix: subscriptionIdPrefix(subscriptionId),
  });
  if (profileId) await recordIssue(supabase, profileId, subscriptionId, failureCode, false);
  const finalized = await finalizeEvent(supabase, {
    eventId, claimToken, result, failureCode, profileId,
  });
  return finalized
    ? new Response('OK', { status: 200 })
    : new Response('Internal Server Error', { status: 500 });
}

async function retryableFailure(
  supabase: SupabaseClient,
  eventId: string,
  claimToken: string,
  profileId: string | null,
  subscriptionId: string,
  failureCode: string,
  retryable = true,
): Promise<Response> {
  await auditLog(supabase, eventId, null, profileId, failureCode, 'error', {
    subscription_id_prefix: subscriptionIdPrefix(subscriptionId), retryable,
  });
  if (profileId) await recordIssue(supabase, profileId, subscriptionId, failureCode, retryable);
  await finalizeEvent(supabase, {
    eventId, claimToken, result: 'error', failureCode, profileId,
  });
  return new Response('Retry Later', { status: 503 });
}

async function recordIssue(
  supabase: SupabaseClient,
  profileId: string,
  subscriptionId: string,
  failureCode: string,
  retryable: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('record_paddle_sync_issue', {
    p_profile_id: profileId,
    p_subscription_id_prefix: subscriptionIdPrefix(subscriptionId) || null,
    p_failure_code: failureCode,
    p_retryable: retryable,
    p_source: 'webhook',
  });
  if (error) console.error('[paddle-webhook] sync issue write failed', error.code ?? 'unknown');
}

async function resolveIssues(
  supabase: SupabaseClient,
  profileId: string,
  subscriptionId: string,
): Promise<void> {
  const { error } = await supabase.rpc('resolve_paddle_sync_issues', {
    p_profile_id: profileId,
    p_source: 'webhook',
    p_subscription_id_prefix: subscriptionIdPrefix(subscriptionId) || null,
  });
  if (error) console.error('[paddle-webhook] sync issue resolve failed', error.code ?? 'unknown');
}

async function auditLog(
  supabase: SupabaseClient,
  eventId: string | null,
  eventType: string | null,
  profileId: string | null,
  reason: string,
  action: 'denied' | 'skipped' | 'error',
  detail: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('paddle_webhook_audit_log').insert({
    event_id: eventId,
    event_type: eventType,
    supabase_uid: profileId,
    reason,
    action,
    detail,
  });
  if (error) console.error('[paddle-webhook] audit write failed', error.code ?? 'unknown');
}

async function verifyPaddleSignature(
  body: string,
  signature: string,
  secret: string,
): Promise<{ valid: boolean; reason?: string }> {
  try {
    if (!secret) return { valid: false, reason: 'secret_missing' };
    let timestamp = '';
    const signatureHashes: string[] = [];
    for (const part of signature.split(';')) {
      const index = part.indexOf('=');
      if (index <= 0) continue;
      const name = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      if (name === 'ts' && !timestamp) timestamp = value;
      if (name === 'h1' && value) signatureHashes.push(value);
    }
    if (!timestamp || signatureHashes.length === 0) {
      return { valid: false, reason: 'signature_fields_missing' };
    }
    const timestampNumber = Number.parseInt(timestamp, 10);
    if (!Number.isFinite(timestampNumber)) return { valid: false, reason: 'signature_timestamp_invalid' };
    if (Math.abs(Date.now() / 1000 - timestampNumber) > SIGNATURE_FRESHNESS_SECONDS) {
      return { valid: false, reason: 'signature_timestamp_stale' };
    }
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const digest = await crypto.subtle.sign(
      'HMAC', key, new TextEncoder().encode(`${timestamp}:${body}`),
    );
    const computed = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return signatureHashes.some((signatureHash) => timingSafeEqual(computed, signatureHash))
      ? { valid: true }
      : { valid: false, reason: 'signature_mismatch' };
  } catch {
    return { valid: false, reason: 'signature_exception' };
  }
}

function timingSafeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
}
