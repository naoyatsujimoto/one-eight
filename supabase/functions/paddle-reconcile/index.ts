/**
 * Periodic Paddle subscription reconciliation.
 *
 * Invoked by pg_cron with a dedicated high-entropy bearer secret. It only
 * reconciles profiles that already have a complete Paddle ID pair, validates
 * the ONE EIGHT Pro price, and applies state through the same monotonic SQL
 * function used by the webhook.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchPaddleResource } from '../_shared/paddleApi.ts';
import {
  hasAllowedProPrice,
  isValidPaddleCustomerId,
  isValidPaddleSubscriptionId,
  mapPaddleSubscriptionState,
  normalizeEmail,
  normalizePaddleStateTimestamp,
  parseAllowedPriceIds,
  subscriptionIdPrefix,
} from '../_shared/paddleSyncPolicy.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PADDLE_API_KEY = Deno.env.get('PADDLE_API_KEY') ?? '';
const RECONCILE_SECRET = Deno.env.get('PADDLE_RECONCILE_SECRET') ?? '';
const ALLOWED_PRICE_IDS = parseAllowedPriceIds(Deno.env.get('PADDLE_PRO_PRICE_IDS'));
const DENIED_EMAILS = new Set(['info@tentomushi.co.jp']);
const MAX_PROFILES = Math.min(
  10,
  Math.max(1, Number.parseInt(Deno.env.get('PADDLE_RECONCILE_MAX_PROFILES') ?? '10', 10) || 10),
);

interface ReconcileProfile {
  profile_id: string;
  plan: string;
  subscription_status: string;
  current_period_end: string | null;
  paddle_customer_id: string;
  paddle_subscription_id: string;
  paddle_last_synced_at: string | null;
  paddle_state_updated_at: string | null;
}

interface PaddleSubscriptionData {
  id?: string;
  customer_id?: string;
  status?: string;
  updated_at?: string;
  current_billing_period?: { ends_at?: string | null } | null;
  items?: unknown[];
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  if (!RECONCILE_SECRET || !timingSafeBearerMatch(request.headers.get('authorization'), RECONCILE_SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }

  let options: { force?: boolean; dry_run?: boolean } = {};
  try {
    options = await request.json();
  } catch {
    options = {};
  }
  const force = options.force === true;
  const dryRun = options.dry_run === true;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const counters = {
    scanned: 0,
    eligible: 0,
    synced: 0,
    stale: 0,
    failed: 0,
    skipped: 0,
    dry_run: dryRun,
  };
  let stopBatch = false;

  const { data, error } = await supabase.rpc('claim_paddle_reconcile_profiles', {
    p_limit: MAX_PROFILES,
    p_force: force,
    p_mark_attempt: !dryRun,
  });
  if (error) return jsonResponse({ ...counters, failure_code: 'profile_claim_failed' }, 503);

  const rows = (data ?? []) as ReconcileProfile[];
  counters.scanned = rows.length;
  counters.eligible = rows.length;
  const outcomes = await Promise.all(rows.map((profile) => reconcileProfile(supabase, profile, dryRun)));
  for (const outcome of outcomes) {
    counters[outcome.kind] += 1;
    if (outcome.stopBatch) stopBatch = true;
  }

  const systemicFailure = rows.length > 0 && counters.failed === rows.length;
  return jsonResponse(counters, stopBatch || systemicFailure ? 503 : 200);
});

async function reconcileProfile(
  supabase: ReturnType<typeof createClient>,
  profile: ReconcileProfile,
  dryRun: boolean,
): Promise<{ kind: 'synced' | 'stale' | 'failed' | 'skipped'; stopBatch: boolean }> {
  const profileId = profile.profile_id;
  const subscriptionId = profile.paddle_subscription_id;
  const authResult = await supabase.auth.admin.getUserById(profileId);
  if (authResult.error) {
    if (!dryRun) await recordIssue(supabase, profileId, subscriptionId, 'auth_user_read_failed', true);
    return { kind: 'failed', stopBatch: false };
  }
  const authEmail = normalizeEmail(authResult.data?.user?.email);
  if (!authEmail) {
    if (!dryRun) await recordIssue(supabase, profileId, subscriptionId, 'auth_email_missing', false);
    return { kind: 'failed', stopBatch: false };
  }
  if (DENIED_EMAILS.has(authEmail)) {
    if (!dryRun) await recordIssue(supabase, profileId, subscriptionId, 'denied_account', false);
    return { kind: 'skipped', stopBatch: false };
  }
  if (!isValidPaddleCustomerId(profile.paddle_customer_id)
      || !isValidPaddleSubscriptionId(subscriptionId)) {
    if (!dryRun) await recordIssue(supabase, profileId, subscriptionId, 'invalid_stored_subscription_ids', false);
    return { kind: 'failed', stopBatch: false };
  }

  const apiResult = await fetchPaddleResource<PaddleSubscriptionData>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    PADDLE_API_KEY,
  );
  if (!apiResult.ok) {
    if (!dryRun) {
      await recordIssue(supabase, profileId, subscriptionId, apiResult.failureCode, apiResult.retryable);
    }
    return { kind: 'failed', stopBatch: apiResult.stopBatch };
  }

  const subscription = apiResult.data;
  if (subscription.id !== subscriptionId
      || subscription.customer_id !== profile.paddle_customer_id) {
    if (!dryRun) {
      await recordIssue(supabase, profileId, subscriptionId, 'paddle_subscription_identity_mismatch', false);
    }
    return { kind: 'failed', stopBatch: false };
  }
  if (!hasAllowedProPrice(subscription, ALLOWED_PRICE_IDS)) {
    if (!dryRun) await recordIssue(supabase, profileId, subscriptionId, 'pro_price_not_allowed', false);
    return { kind: 'failed', stopBatch: false };
  }

  const mapped = mapPaddleSubscriptionState(
    subscription.status,
    subscription.current_billing_period?.ends_at ?? null,
    profile.current_period_end,
  );
  const stateUpdatedAt = normalizePaddleStateTimestamp(subscription.updated_at, null);
  if (!mapped.ok || !mapped.subscriptionStatus || !stateUpdatedAt) {
    if (!dryRun) {
      await recordIssue(
        supabase, profileId, subscriptionId,
        mapped.reason ?? 'invalid_state_timestamp', true,
      );
    }
    return { kind: 'failed', stopBatch: false };
  }
  if (dryRun) return { kind: 'synced', stopBatch: false };

  const { data: applyResult, error: applyError } = await supabase.rpc(
    '_paddle_apply_subscription_state',
    {
      p_profile_id: profileId,
      p_customer_id: profile.paddle_customer_id,
      p_subscription_id: subscriptionId,
      p_subscription_status: mapped.subscriptionStatus,
      p_current_period_end: mapped.currentPeriodEnd ?? null,
      p_update_current_period_end: mapped.shouldUpdateCurrentPeriodEnd,
      p_state_updated_at: stateUpdatedAt,
      p_sync_source: 'reconciliation',
      p_webhook_occurred_at: null,
      p_allow_initial_binding: false,
      p_allow_subscription_replacement: false,
      p_expected_previous_subscription_id: null,
    },
  );
  if (applyError || (applyResult !== 'applied' && applyResult !== 'stale')) {
    await recordIssue(supabase, profileId, subscriptionId, 'profile_state_apply_failed', true);
    return { kind: 'failed', stopBatch: false };
  }
  await supabase.rpc('resolve_paddle_sync_issues', {
    p_profile_id: profileId,
    p_source: 'reconciliation',
    p_subscription_id_prefix: subscriptionIdPrefix(subscriptionId) || null,
  });
  return { kind: applyResult === 'stale' ? 'stale' : 'synced', stopBatch: false };
}

async function recordIssue(
  supabase: ReturnType<typeof createClient>,
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
    p_source: 'reconciliation',
  });
  if (error) console.error('[paddle-reconcile] issue write failed', error.code ?? 'unknown');
}

function timingSafeBearerMatch(header: string | null, expected: string): boolean {
  const actual = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const maxLength = Math.max(actual.length, expected.length);
  let diff = actual.length ^ expected.length;
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (actual.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  return diff === 0;
}

function jsonResponse(value: object, status: number): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
