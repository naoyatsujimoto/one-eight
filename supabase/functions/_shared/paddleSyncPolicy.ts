export type PaddleEventResult = 'pending' | 'processed' | 'skipped' | 'denied' | 'error';

export type PaddleSubscriptionStatus =
  | 'active'
  | 'canceled'
  | 'past_due'
  | 'paused'
  | 'trialing'
  | 'trial';

export type AppSubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'inactive' | 'trial';

export interface StoredPaddleIdentity {
  id: string;
  paddle_customer_id: string | null;
  paddle_subscription_id: string | null;
}

export type BindingDecision =
  | {
      ok: true;
      mode: 'established' | 'initial_verification' | 'subscription_replacement';
      profileId: string;
    }
  | {
      ok: false;
      reason:
        | 'missing_paddle_ids'
        | 'paddle_id_owner_conflict'
        | 'custom_uid_mismatch'
        | 'no_profile'
        | 'customer_id_mismatch'
        | 'subscription_id_mismatch';
    };

export type SubscriptionBindingMode = Extract<BindingDecision, { ok: true }>['mode'];

export interface SubscriptionStateMapping {
  ok: boolean;
  plan: 'pro';
  subscriptionStatus?: AppSubscriptionStatus;
  currentPeriodEnd?: string | null;
  shouldUpdateCurrentPeriodEnd: boolean;
  reason?: 'unsupported_subscription_status' | 'missing_current_billing_period_ends_at';
}

export const DEFAULT_ONE_EIGHT_PRO_PRICE_IDS = [
  'pri_01kt39z89k9qbv3egaacsppz2r',
] as const;

const PADDLE_CUSTOMER_ID_RE = /^ctm_[a-z0-9]+$/;
const PADDLE_SUBSCRIPTION_ID_RE = /^sub_[a-z0-9]+$/;

const TERMINAL_EVENT_RESULTS = new Set<PaddleEventResult>(['processed', 'skipped', 'denied']);

export function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isValidPaddleCustomerId(value: unknown): value is string {
  return typeof value === 'string' && PADDLE_CUSTOMER_ID_RE.test(value);
}

export function isValidPaddleSubscriptionId(value: unknown): value is string {
  return typeof value === 'string' && PADDLE_SUBSCRIPTION_ID_RE.test(value);
}

export function parseAllowedPriceIds(raw: unknown): Set<string> {
  const configured = typeof raw === 'string'
    ? raw.split(',').map((value) => value.trim()).filter(Boolean)
    : [];
  return new Set(configured.length > 0 ? configured : DEFAULT_ONE_EIGHT_PRO_PRICE_IDS);
}

export function extractSubscriptionPriceIds(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  const items = (data as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];

  const ids = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const row = item as {
      price?: { id?: unknown } | null;
      price_id?: unknown;
    };
    const value = typeof row.price?.id === 'string'
      ? row.price.id
      : typeof row.price_id === 'string'
        ? row.price_id
        : '';
    if (value) ids.add(value);
  }
  return [...ids];
}

export function hasAllowedProPrice(data: unknown, allowedPriceIds: Set<string>): boolean {
  return extractSubscriptionPriceIds(data).some((id) => allowedPriceIds.has(id));
}

export function isStrictlyNewerSubscription(
  incomingCreatedAt: unknown,
  previousCreatedAt: unknown,
): boolean {
  if (typeof incomingCreatedAt !== 'string' || typeof previousCreatedAt !== 'string') return false;
  const incoming = Date.parse(incomingCreatedAt);
  const previous = Date.parse(previousCreatedAt);
  return Number.isFinite(incoming) && Number.isFinite(previous) && incoming > previous;
}

/** Paddle state timestamps are ordering keys; reject invalid/future values. */
export function normalizePaddleStateTimestamp(
  value: unknown,
  fallback: unknown,
  nowMs = Date.now(),
): string | null {
  const candidate = typeof value === 'string' && value.trim()
    ? value.trim()
    : typeof fallback === 'string'
      ? fallback.trim()
      : '';
  const parsed = Date.parse(candidate);
  if (!Number.isFinite(parsed) || parsed > nowMs + 5 * 60 * 1000) return null;
  return new Date(parsed).toISOString();
}

/**
 * Decide whether a previously seen Paddle event may be processed again.
 * `error` is retryable. A `pending` claim is retried only after its lease has
 * expired so concurrent deliveries cannot update the profile twice.
 */
export function shouldProcessExistingEvent(
  result: PaddleEventResult,
  lastAttemptAt: string | null,
  nowMs: number,
  leaseSeconds = 120,
): boolean {
  if (TERMINAL_EVENT_RESULTS.has(result)) return false;
  if (result === 'error') return true;
  if (!lastAttemptAt) return true;

  const lastAttemptMs = Date.parse(lastAttemptAt);
  if (!Number.isFinite(lastAttemptMs)) return true;
  return nowMs - lastAttemptMs >= leaseSeconds * 1000;
}

/**
 * Resolve a recurring subscription without relying on email being embedded in
 * every webhook. Once both Paddle IDs have been securely bound, the ID pair is
 * authoritative. Partial or new bindings still require the initial three-way
 * email verification in the caller.
 */
export function decideSubscriptionBinding(input: {
  payloadCustomerId: string;
  payloadSubscriptionId: string;
  customUid: string;
  candidate: StoredPaddleIdentity | null;
  customerOwnerId: string | null;
  subscriptionOwnerId: string | null;
  allowSubscriptionReplacement?: boolean;
}): BindingDecision {
  const {
    payloadCustomerId,
    payloadSubscriptionId,
    customUid,
    candidate,
    customerOwnerId,
    subscriptionOwnerId,
    allowSubscriptionReplacement = false,
  } = input;

  if (!payloadCustomerId || !payloadSubscriptionId) {
    return { ok: false, reason: 'missing_paddle_ids' };
  }
  if (customerOwnerId && subscriptionOwnerId && customerOwnerId !== subscriptionOwnerId) {
    return { ok: false, reason: 'paddle_id_owner_conflict' };
  }

  const boundOwnerId = subscriptionOwnerId || customerOwnerId;
  if (boundOwnerId && customUid && boundOwnerId !== customUid) {
    return { ok: false, reason: 'custom_uid_mismatch' };
  }
  if (!candidate) return { ok: false, reason: 'no_profile' };
  if (boundOwnerId && candidate.id !== boundOwnerId) {
    return { ok: false, reason: 'paddle_id_owner_conflict' };
  }
  if (customUid && candidate.id !== customUid) {
    return { ok: false, reason: 'custom_uid_mismatch' };
  }
  if (candidate.paddle_customer_id && candidate.paddle_customer_id !== payloadCustomerId) {
    return { ok: false, reason: 'customer_id_mismatch' };
  }

  const isReplacementCandidate =
    allowSubscriptionReplacement &&
    candidate.paddle_customer_id === payloadCustomerId &&
    candidate.paddle_subscription_id !== null &&
    candidate.paddle_subscription_id !== payloadSubscriptionId &&
    customerOwnerId === candidate.id &&
    subscriptionOwnerId === null &&
    customUid === candidate.id;
  if (isReplacementCandidate) {
    return { ok: true, mode: 'subscription_replacement', profileId: candidate.id };
  }

  if (
    candidate.paddle_subscription_id &&
    candidate.paddle_subscription_id !== payloadSubscriptionId
  ) {
    return { ok: false, reason: 'subscription_id_mismatch' };
  }

  const established =
    candidate.paddle_customer_id === payloadCustomerId &&
    candidate.paddle_subscription_id === payloadSubscriptionId;

  return {
    ok: true,
    mode: established ? 'established' : 'initial_verification',
    profileId: candidate.id,
  };
}

export function verifyInitialEmailBinding(
  authEmail: unknown,
  customEmail: unknown,
  paddleCustomerEmail: unknown,
): boolean {
  const auth = normalizeEmail(authEmail);
  const custom = normalizeEmail(customEmail);
  const paddle = normalizeEmail(paddleCustomerEmail);
  return auth.length > 0 && auth === custom && auth === paddle;
}

/** A securely stored exact pair must not depend on a secondary API lookup. */
export function requiresPaddleCustomerVerification(mode: SubscriptionBindingMode): boolean {
  return mode !== 'established';
}

/** Existing bindings may use custom_data only as a consistency check. */
export function isCustomIdentityConsistent(
  authEmail: unknown,
  customEmail: unknown,
): boolean {
  const custom = normalizeEmail(customEmail);
  return custom.length === 0 || custom === normalizeEmail(authEmail);
}

export function mapPaddleSubscriptionState(
  rawStatus: unknown,
  currentPeriodEnd: unknown,
  existingCurrentPeriodEnd: string | null,
): SubscriptionStateMapping {
  const status = String(rawStatus ?? '').trim().toLowerCase() as PaddleSubscriptionStatus;
  const periodEnd = typeof currentPeriodEnd === 'string' && currentPeriodEnd.trim()
    ? currentPeriodEnd.trim()
    : null;

  switch (status) {
    case 'active':
      if (!periodEnd) {
        return {
          ok: false,
          plan: 'pro',
          shouldUpdateCurrentPeriodEnd: false,
          reason: 'missing_current_billing_period_ends_at',
        };
      }
      return {
        ok: true,
        plan: 'pro',
        subscriptionStatus: 'active',
        currentPeriodEnd: periodEnd,
        shouldUpdateCurrentPeriodEnd: true,
      };
    case 'canceled':
      return {
        ok: true,
        plan: 'pro',
        subscriptionStatus: 'canceled',
        // Paddle keeps a scheduled cancellation `active` until its paid
        // period actually ends. Once the canonical status is `canceled`, a
        // missing billing period means access has ended and must not inherit
        // an older future end date from the profile.
        currentPeriodEnd: periodEnd,
        shouldUpdateCurrentPeriodEnd: true,
      };
    case 'past_due':
      return {
        ok: true,
        plan: 'pro',
        subscriptionStatus: 'past_due',
        currentPeriodEnd: existingCurrentPeriodEnd,
        shouldUpdateCurrentPeriodEnd: false,
      };
    case 'paused':
      return {
        ok: true,
        plan: 'pro',
        subscriptionStatus: 'inactive',
        currentPeriodEnd: existingCurrentPeriodEnd,
        shouldUpdateCurrentPeriodEnd: false,
      };
    case 'trial':
    case 'trialing':
      return {
        ok: true,
        plan: 'pro',
        subscriptionStatus: 'trial',
        currentPeriodEnd: periodEnd ?? existingCurrentPeriodEnd,
        shouldUpdateCurrentPeriodEnd: periodEnd !== null,
      };
    default:
      return {
        ok: false,
        plan: 'pro',
        shouldUpdateCurrentPeriodEnd: false,
        reason: 'unsupported_subscription_status',
      };
  }
}

export function subscriptionIdPrefix(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 12) : '';
}
