/**
 * Edge Function: paddle-webhook
 * Phase Paddle-W1 — Paddle → Supabase profiles 反映
 *
 * 処理対象イベント:
 *   subscription.activated / updated / canceled / past_due
 *
 * 安全設計:
 *   - HMAC-SHA256 署名検証 + timestamp freshness (5分以内)
 *   - timing-safe HMAC 比較
 *   - 冪等性: INSERT-first (event_id PRIMARY KEY 衝突で即終了)
 *   - 順序逆転対策: profiles.paddle_last_event_at で stale guard
 *   - email cross-verify: auth.users.email / customData.supabase_email / Paddle customer.email の3点一致
 *   - customer.email が payload に含まれない場合は Paddle API で取得 (PADDLE_API_KEY)
 *   - is_test_account guard
 *   - info@tentomushi.co.jp 明示 deny
 *   - profiles UPDATE のみ (UPSERT 禁止) + SQL-level guard
 *   - secret / key はすべて環境変数
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── 環境変数 (Supabase Edge Function secrets に設定) ──────────────────────
const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
/** Paddle Webhook 署名検証用 secret (Paddle Dashboard > Notifications > secret) */
const PADDLE_WEBHOOK_SECRET     = Deno.env.get('PADDLE_WEBHOOK_SECRET')!;
/** Paddle REST API key (customer email fallback 取得用) */
const PADDLE_API_KEY            = Deno.env.get('PADDLE_API_KEY')!;

// ── 定数 ─────────────────────────────────────────────────────────────────────
const SIGNATURE_FRESHNESS_SEC = 5 * 60; // 5分

const HANDLED_EVENTS = new Set([
  'subscription.activated',
  'subscription.updated',
  'subscription.canceled',
  'subscription.past_due',
]);

/** 明示 deny 対象アカウント (test account 化はしないが webhook で Pro 化禁止) */
const DENIED_EMAILS = new Set([
  'info@tentomushi.co.jp',
]);

// ── メインハンドラ ────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const body      = await req.text();
  const signature = req.headers.get('paddle-signature') ?? '';
  const remoteAddr = req.headers.get('x-forwarded-for') ?? 'unknown';

  // ① 署名検証 (timestamp freshness 含む)
  const sigResult = await verifyPaddleSignature(body, signature, PADDLE_WEBHOOK_SECRET);
  if (!sigResult.valid) {
    // payload 本文は保存しない。メタ情報のみ audit_log に記録
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await auditLog(supabase, {
      eventId: null, eventType: null, supabaseUid: null,
      reason: 'invalid_signature', action: 'denied',
      detail: {
        signature_present: signature.length > 0,
        body_length: body.length,
        remote_addr: remoteAddr,
        failure_reason: sigResult.reason,
      },
    });
    return new Response('Unauthorized', { status: 401 });
  }

  // ② ペイロード解析
  let payload: PaddleWebhookPayload;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const eventId    = payload?.event_id;
  const eventType  = payload?.event_type;
  const occurredAt = payload?.occurred_at;

  if (!eventId || !eventType || !occurredAt) {
    return new Response('Bad Request', { status: 400 });
  }

  // ③ 対象外イベントは即 200 (記録なし)
  if (!HANDLED_EVENTS.has(eventType)) {
    return new Response('OK', { status: 200 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ④ INSERT-first 冪等性
  //    event_id PRIMARY KEY 衝突 → 既処理として即終了
  //    INSERT 成功したリクエストだけが続きへ進む (race condition 防止)
  const { error: insertErr } = await supabase
    .from('paddle_webhook_events')
    .insert({
      event_id:    eventId,
      event_type:  eventType,
      occurred_at: occurredAt,
      payload:     payload,
      result:      'pending',
    });

  if (insertErr) {
    // PRIMARY KEY 衝突 (23505) = 重複イベント → 正常扱い
    if (insertErr.code === '23505') {
      return new Response('OK', { status: 200 });
    }
    // その他 DB エラー
    return new Response('Internal Server Error', { status: 500 });
  }

  // ⑤ occurred_at の Invalid Date 検証
  const occurredDate = new Date(occurredAt);
  if (isNaN(occurredDate.getTime())) {
    await auditLog(supabase, {
      eventId, eventType, supabaseUid: null,
      reason: 'invalid_occurred_at', action: 'error',
      detail: { occurred_at: occurredAt },
    });
    await updateEventResult(supabase, eventId, 'error');
    return new Response('OK', { status: 200 });
  }

  // ⑥ Stale guard (グローバル: 48h 以上前)
  const staleThreshold  = new Date(Date.now() - 48 * 3600 * 1000);
  if (occurredDate < staleThreshold) {
    await auditLog(supabase, { eventId, eventType, reason: 'stale_event', action: 'skipped', detail: { occurred_at: occurredAt } });
    await updateEventResult(supabase, eventId, 'skipped');
    return new Response('OK', { status: 200 });
  }

  // ⑦ データ抽出
  const sub                  = payload?.data ?? {};
  const customData           = sub?.custom_data ?? {};
  const paddleCustomerId     = sub?.customer_id ?? '';
  const paddleSubscriptionId = sub?.id ?? '';
  const currentPeriodEnd     = sub?.current_billing_period?.ends_at ?? null;

  const supabaseUid  = (customData?.supabase_uid ?? '').trim();
  const customEmail  = (customData?.supabase_email ?? '').toLowerCase().trim();

  // ⑧ Paddle customer email 取得
  //    payload 内に data.customer.email があればそれを使用
  //    ない場合は Paddle API GET /customers/{customer_id} で取得
  let paddleEmail = (sub?.customer?.email ?? '').toLowerCase().trim();

  if (!paddleEmail && paddleCustomerId) {
    const fetched = await getPaddleCustomerEmail(paddleCustomerId, PADDLE_API_KEY);
    if (fetched === null) {
      // API 取得失敗 → audit_log に記録して終了
      await auditLog(supabase, {
        eventId, eventType, supabaseUid,
        reason: 'paddle_customer_email_fetch_failed', action: 'denied',
        detail: { customer_id: paddleCustomerId },
      });
      await updateEventResult(supabase, eventId, 'denied');
      return new Response('OK', { status: 200 });
    }
    paddleEmail = fetched;
  }

  // ⑨ email cross-verify
  //    auth.users.email / customData.supabase_email / Paddle customer.email の3点一致
  let authEmail = '';
  if (supabaseUid) {
    const { data: authUserData } = await supabase.auth.admin.getUserById(supabaseUid);
    authEmail = (authUserData?.user?.email ?? '').toLowerCase().trim();
  }

  const emailsMatch = (
    authEmail.length > 0 &&
    customEmail.length > 0 &&
    paddleEmail.length > 0 &&
    authEmail === customEmail &&
    customEmail === paddleEmail
  );

  if (!emailsMatch) {
    await auditLog(supabase, {
      eventId, eventType, supabaseUid, reason: 'email_mismatch', action: 'denied',
      detail: { has_auth_email: !!authEmail, has_custom_email: !!customEmail, has_paddle_email: !!paddleEmail },
    });
    await updateEventResult(supabase, eventId, 'denied');
    return new Response('OK', { status: 200 });
  }

  // ⑩ info@tentomushi.co.jp 明示 deny
  //    3点のいずれかが一致した場合に発動 (is_test_account とは独立)
  const allEmails = [authEmail, customEmail, paddleEmail];
  if (allEmails.some(e => DENIED_EMAILS.has(e))) {
    await auditLog(supabase, { eventId, eventType, supabaseUid, reason: 'denied_account', action: 'denied', detail: {} });
    await updateEventResult(supabase, eventId, 'denied');
    return new Response('OK', { status: 200 });
  }

  // ⑪ プロフィール取得 (UPDATE のみ。存在しなければ deny)
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, plan, subscription_status, is_test_account, paddle_last_event_at')
    .eq('id', supabaseUid)
    .maybeSingle();

  if (!profile) {
    await auditLog(supabase, { eventId, eventType, supabaseUid, reason: 'no_profile', action: 'denied', detail: {} });
    await updateEventResult(supabase, eventId, 'denied');
    return new Response('OK', { status: 200 });
  }

  // ⑫ is_test_account guard (アプリ側)
  if (profile.is_test_account) {
    await auditLog(supabase, { eventId, eventType, supabaseUid, reason: 'is_test_account', action: 'skipped', detail: {} });
    await updateEventResult(supabase, eventId, 'skipped');
    return new Response('OK', { status: 200 });
  }

  // ⑬ Stale guard (プロファイル単位: paddle_last_event_at より古いイベントは無視)
  if (profile.paddle_last_event_at && occurredDate <= new Date(profile.paddle_last_event_at)) {
    await auditLog(supabase, {
      eventId, eventType, supabaseUid, reason: 'stale_event', action: 'skipped',
      detail: { occurred_at: occurredAt, last_event_at: profile.paddle_last_event_at },
    });
    await updateEventResult(supabase, eventId, 'skipped');
    return new Response('OK', { status: 200 });
  }

  // ⑭ イベント別の plan / subscription_status 決定
  let newPlan   = profile.plan as string;
  let newStatus: string;

  switch (eventType) {
    case 'subscription.activated':
      newPlan   = 'pro';
      newStatus = 'active';
      break;
    case 'subscription.updated': {
      // Paddle では支払い方法変更・pause・trialing・past_due でも subscription.updated が発火するため
      // data.status を参照して正確に状態マッピングする (一律 active 扱いを禁止)
      const dataStatus = String((sub as { status?: unknown }).status ?? '').toLowerCase();
      if (dataStatus === 'active') {
        newPlan   = 'pro';
        newStatus = 'active';
      } else if (dataStatus === 'past_due') {
        // plan は既存 profile の値を維持 (isProActive が false を返す)
        newStatus = 'past_due';
      } else if (dataStatus === 'canceled') {
        newPlan   = 'pro'; // current_period_end まで Pro 維持 (isProActive の canceled 処理と整合)
        newStatus = 'canceled';
      } else {
        // paused / trialing / unknown → active にしない
        // DB subscription_status 許容値 (SubscriptionStatus): inactive | active | trial | canceled | past_due
        // paused / trialing は許容値外のため 'inactive' で安全側に倒す
        newStatus = 'inactive';
        await auditLog(supabase, {
          eventId, eventType, supabaseUid,
          reason: 'subscription_updated_non_active_status',
          action: 'processed',
          detail: { data_status: dataStatus || '(empty)' },
        });
      }
      break;
    }
    case 'subscription.canceled':
      newPlan   = 'pro';      // current_period_end まで Pro 維持
      newStatus = 'canceled';
      break;
    case 'subscription.past_due':
      newStatus = 'past_due'; // Pro 無効 (isProActive が false を返す)
      break;
    default:
      newStatus = profile.subscription_status as string;
  }

  // ⑮ profiles UPDATE
  //    SQL-level guard: is_test_account = false かつ stale でないことを二重確認
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      plan:                   newPlan,
      subscription_status:    newStatus,
      paddle_customer_id:     paddleCustomerId,
      paddle_subscription_id: paddleSubscriptionId,
      current_period_end:     currentPeriodEnd,
      paddle_last_event_at:   occurredAt,
    })
    .eq('id', supabaseUid)
    .eq('is_test_account', false)                            // SQL-level guard ①
    .or(`paddle_last_event_at.is.null,paddle_last_event_at.lt.${occurredAt}`); // SQL-level guard ②

  const finalResult = updateError ? 'error' : 'processed';
  await updateEventResult(supabase, eventId, finalResult);

  if (updateError) {
    await auditLog(supabase, {
      eventId, eventType, supabaseUid, reason: 'error', action: 'error',
      detail: { message: updateError.message, code: updateError.code },
    });
  }

  return new Response('OK', { status: 200 });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Paddle customer email を Paddle API から取得 (payload に含まれない場合の fallback) */
async function getPaddleCustomerEmail(customerId: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.paddle.com/customers/${customerId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) return null;
    const json = await res.json() as { data?: { email?: string } };
    const email = (json?.data?.email ?? '').toLowerCase().trim();
    return email || null;
  } catch {
    return null;
  }
}

/** Paddle Billing HMAC-SHA256 署名検証 + timestamp freshness */
async function verifyPaddleSignature(
  body: string,
  signature: string,
  secret: string,
): Promise<{ valid: boolean; reason?: string }> {
  try {
    const parts: Record<string, string> = Object.fromEntries(
      signature.split(';').map(p => {
        const idx = p.indexOf('=');
        return [p.slice(0, idx), p.slice(idx + 1)];
      })
    );
    const ts = parts['ts'];
    const h1 = parts['h1'];
    if (!ts || !h1) return { valid: false, reason: 'missing_ts_or_h1' };

    // timestamp freshness (5分以内)
    const tsNum = parseInt(ts, 10);
    if (isNaN(tsNum)) return { valid: false, reason: 'invalid_ts' };
    const diffSec = Math.abs(Date.now() / 1000 - tsNum);
    if (diffSec > SIGNATURE_FRESHNESS_SEC) {
      return { valid: false, reason: `ts_too_old_${Math.round(diffSec)}s` };
    }

    // HMAC-SHA256 計算
    const signedPayload = `${ts}:${body}`;
    const keyMaterial = new TextEncoder().encode(secret);
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyMaterial, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const mac = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(signedPayload));
    const computed = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');

    // timing-safe 比較
    if (!timingSafeEqual(computed, h1)) {
      return { valid: false, reason: 'hmac_mismatch' };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: 'exception' };
  }
}

/** Timing-safe 文字列比較 (長さが異なる場合も即 false だが early-return なし) */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function auditLog(
  supabase: ReturnType<typeof createClient>,
  opts: {
    eventId: string | null;
    eventType: string | null;
    supabaseUid?: string | null;
    reason: string;
    action: string;
    detail: object;
  }
): Promise<void> {
  try {
    const { error } = await supabase.from('paddle_webhook_audit_log').insert({
      event_id:     opts.eventId,
      event_type:   opts.eventType,
      supabase_uid: opts.supabaseUid ?? null,
      reason:       opts.reason,
      action:       opts.action,
      detail:       opts.detail,
    });
    if (error) {
      console.error('[paddle-webhook] auditLog insert failed:', error.code, error.message);
    }
  } catch (e) {
    console.error('[paddle-webhook] auditLog unexpected error:', (e as Error).message);
  }
}

async function updateEventResult(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  result: string,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('paddle_webhook_events')
      .update({ result, processed_at: new Date().toISOString() })
      .eq('event_id', eventId);
    if (error) {
      console.error('[paddle-webhook] updateEventResult failed:', error.code, error.message);
    }
  } catch (e) {
    console.error('[paddle-webhook] updateEventResult unexpected error:', (e as Error).message);
  }
}

// ── 型定義 ───────────────────────────────────────────────────────────────────
interface PaddleWebhookPayload {
  event_id:    string;
  event_type:  string;
  occurred_at: string;
  data?: {
    id?: string;
    customer_id?: string;
    customer?: { email?: string };
    current_billing_period?: { ends_at?: string };
    custom_data?: Record<string, string>;
    [key: string]: unknown;
  };
}
