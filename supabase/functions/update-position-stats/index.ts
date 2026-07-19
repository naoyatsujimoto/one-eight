/**
 * Edge Function: update-position-stats
 * Phase F-07 — atomic position processing
 *
 * 役割:
 *   新規 match_logs 保存後に呼び出され、
 *   process_position_stats_once(match_log_id) を1回だけ呼ぶ。
 *   validation・ledger管理・stats更新はすべてRPC側で行う。
 *
 * 呼び出し元: matchLog.ts (saveMatchLog 後)
 * 失敗時:     match_logs の保存は影響を受けない（fire-and-forget）
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RequestBody {
  match_log_id: string;
}

// ─── メインハンドラ ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS: 同一 Supabase プロジェクト内からの呼び出しのみ想定
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ─── Supabase Admin クライアント初期化 ─────────────────────────────────────
  const supabaseUrl = Deno.env.get('SUPABASE_URL');

  // SUPABASE_SECRET_KEYS（新形式: JSON）または SUPABASE_SERVICE_ROLE_KEY（旧形式）を取得
  let serviceRoleKey: string | undefined;
  const secretKeysJson = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (secretKeysJson) {
    try {
      const secretKeys = JSON.parse(secretKeysJson) as Record<string, string>;
      serviceRoleKey = secretKeys['service_role'] ?? Object.values(secretKeys)[0];
    } catch {
      console.warn('[update-position-stats] Failed to parse SUPABASE_SECRET_KEYS, falling back to SUPABASE_SERVICE_ROLE_KEY');
    }
  }
  // フォールバック: 旧形式（DEPRECATED だが互換性のために残す）
  serviceRoleKey = serviceRoleKey ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[update-position-stats] Missing env vars: SUPABASE_URL or service role key');
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // ─── リクエストボディ解析 ───────────────────────────────────────────────────
  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { match_log_id } = body;
  if (!match_log_id || typeof match_log_id !== 'string') {
    return new Response(JSON.stringify({ error: 'match_log_id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ─── process_position_stats_once RPC 呼び出し ──────────────────────────────
  const { data, error } = await supabaseAdmin.rpc('process_position_stats_once', {
    p_match_log_id: match_log_id,
  });

  if (error) {
    console.error('[update-position-stats] RPC error:', error.message);
    return new Response(JSON.stringify({ error: 'RPC failed', detail: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ─── 結果判定 ───────────────────────────────────────────────────────────────
  // RPC returns: [{ processed: boolean, reason: string }]
  const result = Array.isArray(data) ? data[0] : data;
  const processed: boolean = result?.processed ?? false;
  const reason: string = result?.reason ?? 'unknown';

  if (!processed) {
    // validation skip または duplicate → HTTP 200 (skipped)
    console.log(`[update-position-stats] skipped: match_log_id=${match_log_id}, reason=${reason}`);
    return new Response(
      JSON.stringify({ skipped: true, reason }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  console.log(`[update-position-stats] OK: match_log_id=${match_log_id}`);

  return new Response(
    JSON.stringify({ success: true, match_log_id }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
});
