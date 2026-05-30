/**
 * Edge Function: update-position-stats
 * Phase N-1c — ONE EIGHT ポストモータム基盤
 *
 * 役割:
 *   新規 match_logs 保存後に呼び出され、
 *   full_record 内の canonical_hash を読み取り、
 *   canonical_hash × mode_group 単位で position_stats を集計・更新する。
 *
 * 呼び出し元: matchLog.ts (saveMatchLog 後)
 * 失敗時:     match_logs の保存は影響を受けない（fire-and-forget）
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── 許可された CPU difficulty 値（正規化・許可リスト） ───────────────────────
const ALLOWED_DIFFICULTIES = new Set(['normal', 'hard', 'very_hard']);

// ─── 許可された mode 値 ─────────────────────────────────────────────────────
const ALLOWED_MODES = new Set(['human_vs_cpu', 'human_vs_human', 'online']);

// ─── Types ────────────────────────────────────────────────────────────────────

interface MoveRecord {
  moveNumber: number;
  player: string;
  positioning: string;
  build: Record<string, unknown>;
  canonical_hash?: string;
  symmetry_group_id?: string;
}

interface MatchLogPayload {
  id: string;
  user_id: string | null;
  mode: string;
  human_color: string | null;
  winner: string | null;
  cpu_difficulty?: string | null;
  full_record?: MoveRecord[] | null;
}

interface RequestBody {
  match_log_id: string;
}

// ─── mode_group 判定 ─────────────────────────────────────────────────────────

/**
 * mode と cpu_difficulty から mode_group 配列を決定する。
 *
 * ルール:
 *   - 全件 'all' に計上
 *   - human_vs_human → 'pvp' を追加
 *   - online → 'online' を追加
 *   - human_vs_cpu かつ difficulty が許可リスト内 → 'cpu_${difficulty}' を追加
 *   - cpu_difficulty = null / 不正文字列 → 'all' のみ（cpu_unknown は作らない）
 *   - 不明な mode → 'all' のみ
 */
function resolveModeGroups(mode: string, cpuDifficulty: string | null | undefined): string[] {
  const groups: string[] = ['all'];

  // mode 値を正規化・検証
  const normalizedMode = ALLOWED_MODES.has(mode) ? mode : null;

  if (normalizedMode === 'human_vs_human') {
    groups.push('pvp');
  } else if (normalizedMode === 'online') {
    groups.push('online');
  } else if (normalizedMode === 'human_vs_cpu') {
    if (cpuDifficulty != null) {
      // difficulty 文字列を正規化（小文字化・前後空白除去）
      const normalized = cpuDifficulty.toLowerCase().trim();
      if (ALLOWED_DIFFICULTIES.has(normalized)) {
        groups.push(`cpu_${normalized}`);
      }
      // 許可リスト外の文字列は 'all' のみ（fallback）
    }
    // cpu_difficulty = null → 'all' のみ
  }

  return groups;
}

// ─── canonical_hash 抽出 ─────────────────────────────────────────────────────

/**
 * full_record から canonical_hash を抽出する。
 * null / undefined / 空文字 はスキップ。
 * 抽出された配列（重複あり・順序維持）を返す。
 * 重複除去は batch_upsert_position_stats 側で行う。
 */
function extractHashes(fullRecord: MoveRecord[]): string[] {
  const hashes: string[] = [];
  for (const move of fullRecord) {
    const h = move.canonical_hash;
    if (h != null && h !== '') {
      hashes.push(h);
    }
  }
  return hashes;
}

/**
 * full_record から symmetry_group_id を抽出する。
 * null / undefined / 空文字 はスキップ。
 */
function extractSymmetryGroupIds(fullRecord: MoveRecord[]): string[] {
  const ids: string[] = [];
  for (const move of fullRecord) {
    const gid = move.symmetry_group_id;
    if (gid != null && gid !== '') {
      ids.push(gid);
    }
  }
  return ids;
}

// ─── winner 正規化 ───────────────────────────────────────────────────────────

/**
 * winner 値を 'black' | 'white' | 'draw' に正規化する。
 * 不正な値は null を返す（→ 処理スキップ）。
 */
function normalizeWinner(winner: string | null): 'black' | 'white' | 'draw' | null {
  if (winner === 'black' || winner === 'white' || winner === 'draw') {
    return winner;
  }
  return null;
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
      // service_role キーを取得（キー名が異なる場合は最初の値を使用）
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

  // ─── match_logs から対象レコードを取得 ─────────────────────────────────────
  const { data: logRow, error: fetchError } = await supabaseAdmin
    .from('match_logs')
    .select('id, user_id, mode, human_color, winner, cpu_difficulty, full_record')
    .eq('id', match_log_id)
    .single();

  if (fetchError || !logRow) {
    console.error('[update-position-stats] Failed to fetch match_log:', fetchError?.message);
    return new Response(JSON.stringify({ error: 'match_log not found', detail: fetchError?.message }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const row = logRow as MatchLogPayload;

  // ─── is_test_account チェック（テストアカウントの棋譜は集計除外） ────────────
  if (row.user_id) {
    const { data: profileRow } = await supabaseAdmin
      .from('profiles')
      .select('is_test_account')
      .eq('id', row.user_id)
      .maybeSingle();

    if (profileRow?.is_test_account === true) {
      console.log(`[update-position-stats] Skipping: test_account user_id=${row.user_id}`);
      return new Response(
        JSON.stringify({ skipped: true, reason: 'test_account' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  // ─── winner バリデーション ──────────────────────────────────────────────────
  const winner = normalizeWinner(row.winner);
  if (winner === null) {
    // 勝敗未確定または不正な winner 値 → スキップ（エラーではない）
    console.warn('[update-position-stats] Skipping: invalid winner value:', row.winner);
    return new Response(JSON.stringify({ skipped: true, reason: 'invalid_winner' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ─── full_record バリデーション ─────────────────────────────────────────────
  const fullRecord: MoveRecord[] = Array.isArray(row.full_record) ? row.full_record : [];
  if (fullRecord.length === 0) {
    console.warn('[update-position-stats] Skipping: empty full_record for match_log_id:', match_log_id);
    return new Response(JSON.stringify({ skipped: true, reason: 'empty_full_record' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ─── canonical_hash 抽出 ────────────────────────────────────────────────────
  const hashes = extractHashes(fullRecord);
  if (hashes.length === 0) {
    // canonical_hash が1件もない（古いレコード等）→ スキップ
    console.warn('[update-position-stats] Skipping: no canonical_hash found in full_record for:', match_log_id);
    return new Response(JSON.stringify({ skipped: true, reason: 'no_canonical_hashes' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ─── mode_group 決定 ────────────────────────────────────────────────────────
  const modeGroups = resolveModeGroups(row.mode, row.cpu_difficulty);

  // ─── batch_upsert_position_stats RPC 呼び出し ───────────────────────────────
  const { error: upsertError } = await supabaseAdmin.rpc('batch_upsert_position_stats', {
    p_hashes: hashes,
    p_winner: winner,
    p_mode_groups: modeGroups,
  });

  if (upsertError) {
    console.error('[update-position-stats] RPC error:', upsertError.message);
    return new Response(JSON.stringify({ error: 'RPC failed', detail: upsertError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // symmetry_group_stats も更新（symmetry_group_id がある場合のみ）
  const groupIds = extractSymmetryGroupIds(fullRecord);
  if (groupIds.length > 0) {
    const { error: sgUpsertError } = await supabaseAdmin.rpc('batch_upsert_symmetry_group_stats', {
      p_group_ids: groupIds,
      p_winner: winner,
      p_mode_groups: modeGroups,
    });
    if (sgUpsertError) {
      // 失敗してもposition_stats更新は成功済みのため警告のみ
      console.warn('[update-position-stats] symmetry_group_stats upsert failed:', sgUpsertError.message);
    } else {
      console.log(`[update-position-stats] symmetry_group_stats OK: group_ids=${groupIds.length}`);
    }
  }

  console.log(`[update-position-stats] OK: match_log_id=${match_log_id}, hashes=${hashes.length}, mode_groups=${modeGroups.join(',')}, winner=${winner}`);

  return new Response(
    JSON.stringify({
      success: true,
      match_log_id,
      hashes_count: hashes.length,
      symmetry_group_ids_count: groupIds.length,
      mode_groups: modeGroups,
      winner,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
});
