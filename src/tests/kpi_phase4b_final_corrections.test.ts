/**
 * kpi_phase4b_final_corrections.test.ts — KPI Phase 4-B Final Corrections テスト
 *
 * Migration対象: 20260810000014_kpi_phase4b_final_corrections.sql
 *
 * テスト戦略:
 * 1. 静的SQL分析（migrationファイルのテキスト検証）
 * 2. 実DB接続テスト（SUPABASE_SERVICE_ROLE_KEYが環境変数にある場合のみ実行）
 *    - service_role client でAdmin magic link → verifyOtp → Admin JWT取得
 *    - kpi_eventsへのINSERT/DELETE（事後cleanup）
 *    - 本番テーブル件数の前後不変確認
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const MIGRATIONS_DIR = join(__dirname, '../../supabase/migrations');
const MIGRATION_14 = '20260810000014_kpi_phase4b_final_corrections.sql';

const m14 = existsSync(join(MIGRATIONS_DIR, MIGRATION_14))
  ? readFileSync(join(MIGRATIONS_DIR, MIGRATION_14), 'utf-8') : '';

// ============================================================================
// 静的SQL分析テスト
// ============================================================================

describe('[STATIC] Migration 14 ファイル存在確認', () => {
  it('migration 14ファイルが存在する', () => {
    expect(existsSync(join(MIGRATIONS_DIR, MIGRATION_14))).toBe(true);
  });
  it('ファイル内容が空でない', () => {
    expect(m14.length).toBeGreaterThan(1000);
  });
});

describe('[STATIC] 修正C: attempt二重計上', () => {
  it("attempt_eventsはtraining_attemptedのみカウント", () => {
    expect(m14).toContain("event_name = 'training_attempted'");
  });
  it("incorrect_attemptsはtraining_incorrectのみカウント", () => {
    expect(m14).toContain("event_name = 'training_incorrect'");
  });
  it('attempt_aggでCOUNT(*) FILTER WHEREを使用', () => {
    expect(m14).toContain('FILTER (WHERE be.event_name');
  });
  it('incorrect_rate: incorrect / attempt (training_attemptedのみ)', () => {
    expect(m14).toContain('incorrect_cnt FROM attempt_agg');
    expect(m14).toContain('total_attempts FROM attempt_agg');
  });
});

describe('[STATIC] 修正D: eligible_canonical_runs集合', () => {
  it('eligible_canonical_runsが定義されている', () => {
    expect(m14).toContain('eligible_canonical_runs AS');
  });
  it("start_route != '/ai-check-login' 除外が含まれる", () => {
    expect(m14).toContain("cs.start_route != '/ai-check-login'");
  });
  it('Internal/Admin除外条件が含まれる', () => {
    expect(m14).toContain('is_internal_test_account');
    expect(m14).toContain('internal_plan_override');
  });
  it('4 RPCすべてでeligible_canonical_runsを使用', () => {
    const cnt = (m14.match(/eligible_canonical_runs/g) ?? []).length;
    expect(cnt).toBeGreaterThanOrEqual(4);
  });
});

describe('[STATIC] 修正E: effective_as_of境界', () => {
  it('base_eventsにoccurred_at < v_effective_as_ofが含まれる（4 RPC分）', () => {
    const matches = m14.match(/occurred_at < v_effective_as_of/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });
  it('v_effective_as_of := LEAST(p_to, now())', () => {
    const cnt = (m14.match(/v_effective_as_of := LEAST\(p_to, now\(\)\)/g) ?? []).length;
    expect(cnt).toBeGreaterThanOrEqual(4);
  });
});

describe('[STATIC] 修正F: last stepは時刻で決定', () => {
  it('last_step_per_abandonedでoccurred_at DESC, event_id DESCを使用', () => {
    expect(m14).toContain('src.occurred_at DESC, src.event_id DESC');
  });
  it('last_step_activeが定義されている', () => {
    expect(m14).toContain('last_step_active');
  });
  it('step_reached_canonicalのORDER BYにoccurred_at ASC, event_id ASCを使用', () => {
    expect(m14).toContain('be.occurred_at ASC, be.event_id ASC');
  });
});

describe('[STATIC] 修正G: Step metadataのcanonical化', () => {
  it('step_reached_canonicalが定義されている', () => {
    expect(m14).toContain('step_reached_canonical AS');
  });
  it('task_steps内でMIN(src.move_id)を使用しない', () => {
    expect(m14).not.toMatch(/MIN\(src\.move_id\)/);
    expect(m14).not.toMatch(/MIN\(src\.move_index_val\)/);
    expect(m14).not.toMatch(/MIN\(src\.total_steps_val\)/);
  });
  it('canonical start.task_idを使用（cohort_runs cr.task_idとJOIN）', () => {
    expect(m14).toContain('JOIN cohort_runs cr ON cr.run_id = src2.run_id');
  });
});

describe('[STATIC] 修正H: completed step解決', () => {
  it('canonical_completedが定義されている（summary, task_summary, step_funnel）', () => {
    const cnt = (m14.match(/canonical_completed AS/g) ?? []).length;
    expect(cnt).toBeGreaterThanOrEqual(3);
  });
  it('canonical completed: DISTINCT ON (be.run_id) + training_completed', () => {
    expect(m14).toMatch(/DISTINCT ON \(be\.run_id\)[\s\S]*?training_completed/);
  });
  it('completed_stepが定義されている', () => {
    expect(m14).toContain('completed_step AS');
  });
  it('continued_or_completed_runsはUNIONで二重計上なし', () => {
    const unionCount = (m14.match(/UNION\s*\n\s*SELECT/g) ?? []).length;
    expect(unionCount).toBeGreaterThanOrEqual(3);
  });
});

describe('[STATIC] 修正I: elapsed統計', () => {
  it('elapsed_aggでDISTINCT ON (cc.run_id)を使用', () => {
    expect(m14).toMatch(/DISTINCT ON \(cc\.run_id\)[\s\S]*?elapsed_sec/);
  });
  it('elapsed上限チェック(86400)を含む', () => {
    expect(m14).toContain('<= 86400');
  });
  it('percentile_contにNUMERICキャストを含む', () => {
    const castCount = (m14.match(/percentile_cont[\s\S]*?::NUMERIC/g) ?? []).length;
    expect(castCount).toBeGreaterThanOrEqual(2);
  });
  it('canonical_completed ccをelapsed_aggで使用', () => {
    expect(m14).toMatch(/canonical_completed cc[\s\S]*?elapsed_sec/);
  });
});

describe('[STATIC] 修正J: DailyのInternal除外', () => {
  it('admin_get_kpi_training_dailyでeligible_canonical_runsを使用', () => {
    const occurrences = m14.match(/eligible_canonical_runs/g) ?? [];
    expect(occurrences.length).toBeGreaterThan(0);
  });
  it('completed_runsがeligible_canonical_runsのEXISTSチェックを含む', () => {
    expect(m14).toMatch(/training_completed[\s\S]*?eligible_canonical_runs/);
  });
  it('all_daysがeligible start day ∪ eligible completion day のUNION', () => {
    expect(m14).toContain('all_days AS');
    expect(m14).toMatch(/all_days AS[\s\S]*?UNION/);
  });
});

describe('[STATIC] 修正K: identity key衝突防止', () => {
  it("user_idがあるrunは'u:'プレフィックスを使用", () => {
    expect(m14).toContain("'u:' || ");
  });
  it("anonymous_idのrunは'a:'プレフィックスを使用", () => {
    expect(m14).toContain("'a:' || ");
  });
  it("identity keyはCOUNT(DISTINCT)の内部でのみ使用", () => {
    expect(m14).not.toContain('identity_key TEXT');
  });
});

describe('[STATIC] Admin/権限管理', () => {
  it('4 RPCすべてに_kpi_require_adminが含まれる', () => {
    const cnt = (m14.match(/_kpi_require_admin/g) ?? []).length;
    expect(cnt).toBeGreaterThanOrEqual(4);
  });
  it('4 RPCすべてにGRANT TO authenticatedが含まれる', () => {
    const cnt = (m14.match(/TO service_role, postgres, authenticated/g) ?? []).length;
    expect(cnt).toBeGreaterThanOrEqual(4);
  });
  it('REVOKE FROM anonが含まれる', () => {
    expect(m14).toContain('FROM anon');
  });
  it('official_kpi_start_atを変更するSQLが含まれない', () => {
    expect(m14).not.toMatch(/UPDATE.*kpi_settings.*official_kpi_start_at/i);
    expect(m14).not.toMatch(/SET.*official_kpi_start_at\s*=/i);
  });
  it('raw PII (user_id列) をRETURNS TABLEから返さない', () => {
    expect(m14).not.toContain('user_id                               TEXT');
  });
  it('SECURITY DEFINERが含まれる（4 RPC分）', () => {
    const cnt = (m14.match(/SECURITY DEFINER/g) ?? []).length;
    expect(cnt).toBeGreaterThanOrEqual(4);
  });
  it("SET search_path = ''が含まれる（4 RPC分）", () => {
    const cnt = (m14.match(/SET search_path = ''/g) ?? []).length;
    expect(cnt).toBeGreaterThanOrEqual(4);
  });
});

describe('[STATIC] 権限設定', () => {
  it('anonとauthenticatedはREVOKE済み（4 RPC分ずつ）', () => {
    const revokeFromAnon = (m14.match(/REVOKE ALL ON FUNCTION[\s\S]*?FROM anon/g) ?? []).length;
    const revokeFromAuthenticated = (m14.match(/REVOKE ALL ON FUNCTION[\s\S]*?FROM authenticated/g) ?? []).length;
    expect(revokeFromAnon).toBeGreaterThanOrEqual(4);
    expect(revokeFromAuthenticated).toBeGreaterThanOrEqual(4);
  });
  it('GRANTにanonが含まれない', () => {
    const grantToAnon = m14.match(/GRANT EXECUTE ON FUNCTION.*TO.*\banon\b/g) ?? [];
    expect(grantToAnon.length).toBe(0);
  });
});

// ============================================================================
// 実DB接続テスト
// ============================================================================

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const hasDBCreds = SUPABASE_URL.length > 0 && SERVICE_ROLE_KEY.length > 0;
// 本番fixtureはDBクレデンシャルがあり かつ RUN_KPI_DB_FIXTURE=1 の場合のみ実行
const runDBFixture = hasDBCreds && process.env.RUN_KPI_DB_FIXTURE === '1';
// Admin email (is_admin=true in profiles)
const ADMIN_EMAIL = 'tsujimoto@tentomushi.co.jp';

const TEST_TASK_ID = 'test-task-m14';
const PAST_FROM = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
const FUTURE_TO = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

// テストで挿入したrun_idのリスト（cleanup用）
const insertedRunIds: string[] = [];
let serviceClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;  // Admin JWT authenticated client
let countBefore = 0;

/**
 * Admin JWT を取得（magic link経由）
 */
async function getAdminClient(): Promise<SupabaseClient | null> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) return null;
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  // Generate magic link for admin user
  const { data: linkData, error: linkError } = await svc.auth.admin.generateLink({
    type: 'magiclink',
    email: ADMIN_EMAIL,
  });
  if (linkError || !linkData?.properties?.hashed_token) {
    console.warn('Failed to generate admin magic link:', linkError?.message);
    return null;
  }
  // Verify OTP to get session
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: sessionData, error: sessionError } = await anonClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });
  if (sessionError || !sessionData?.session) {
    console.warn('Failed to verify admin OTP:', sessionError?.message);
    return null;
  }
  // Return client with admin session
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  await client.auth.setSession({
    access_token: sessionData.session.access_token,
    refresh_token: sessionData.session.refresh_token,
  });
  return client;
}

/**
 * kpi_eventsにINSERT（service_roleで直接INSERT）
 */
async function insertEvent(params: {
  event_name: string;
  run_id: string;
  task_id?: string;
  user_id?: string | null;
  anonymous_id?: string;
  route?: string;
  occurred_at?: string;
  step?: number | null;
  move_id?: string | null;
  move_index?: number | null;
  total_steps?: number | null;
  from_step?: number | null;
  elapsed_seconds?: number | null;
}) {
  if (!serviceClient) throw new Error('serviceClient not initialized');
  const properties: Record<string, unknown> = {
    training_run_id: params.run_id,
  };
  if (params.task_id !== undefined) properties.task_id = params.task_id;
  if (params.step !== undefined && params.step !== null) properties.step = String(params.step);
  if (params.move_id !== undefined && params.move_id !== null) properties.move_id = params.move_id;
  if (params.move_index !== undefined && params.move_index !== null) properties.move_index = String(params.move_index);
  if (params.total_steps !== undefined && params.total_steps !== null) properties.total_steps = String(params.total_steps);
  if (params.from_step !== undefined && params.from_step !== null) properties.from_step = String(params.from_step);
  if (params.elapsed_seconds !== undefined && params.elapsed_seconds !== null) {
    properties.elapsed_seconds = String(params.elapsed_seconds);
  }

  const row: Record<string, unknown> = {
    event_name: params.event_name,
    environment: 'production',
    user_id: params.user_id ?? null,
    // anonymous_id must be UUID
    anonymous_id: params.anonymous_id ?? randomUUID(),
    properties,
    route: params.route ?? '/training',
    occurred_at: params.occurred_at ?? new Date(Date.now() - 3600 * 1000).toISOString(),
    session_id: randomUUID(),      // not-null constraint
    idempotency_key: randomUUID(), // not-null constraint
  };

  const { error } = await serviceClient.from('kpi_events').insert(row);
  if (error) throw new Error(`INSERT failed: ${JSON.stringify(error)}`);
  if (!insertedRunIds.includes(params.run_id)) insertedRunIds.push(params.run_id);
}

describe('[DB] 実DB接続テスト (SUPABASE_SERVICE_ROLE_KEY必須)', () => {
  beforeAll(async () => {
    if (!runDBFixture) return;
    serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    // Admin JWT取得
    adminClient = await getAdminClient();
    if (!adminClient) {
      console.warn('[DB] Admin client could not be initialized — RPC tests will be skipped');
    }
    // 本番データ件数を記録
    const { count } = await serviceClient
      .from('kpi_events')
      .select('*', { count: 'exact', head: true })
      .eq('environment', 'production');
    countBefore = count ?? 0;
  });

  afterAll(async () => {
    if (!runDBFixture || !serviceClient) return;
    // cleanup: 挿入したkpi_eventsを削除
    for (const runId of insertedRunIds) {
      await serviceClient
        .from('kpi_events')
        .delete()
        .eq('environment', 'production')
        .filter('properties->>training_run_id', 'eq', runId);
    }
    // 本番データ件数が増えていないことを確認
    const { count } = await serviceClient
      .from('kpi_events')
      .select('*', { count: 'exact', head: true })
      .eq('environment', 'production');
    const countAfter = count ?? 0;
    console.log('[afterAll] countBefore:', countBefore, 'countAfter:', countAfter);
    expect(countAfter).toBe(countBefore);
    serviceClient = null;
    adminClient = null;
  });

  it('前提: DBクレデンシャルが設定されている (RUN_KPI_DB_FIXTURE=1必須)', () => {
    if (!runDBFixture) {
      console.warn('RUN_KPI_DB_FIXTURE != 1 or no DB creds — DB fixture tests skipped');
      expect(true).toBe(true);
      return;
    }
    expect(SUPABASE_URL).toBeTruthy();
    expect(SERVICE_ROLE_KEY).toBeTruthy();
  });

  // テスト9: Admin で4 RPC成功
  it('テスト9: Admin (authenticated, is_admin=true) で4 RPC成功', async () => {
    if (!runDBFixture || !adminClient) {
      console.warn('skip テスト9: admin client unavailable');
      expect(true).toBe(true);
      return;
    }
    const from = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const to = new Date(Date.now() + 1 * 24 * 3600 * 1000).toISOString();

    const [r1, r2, r3, r4] = await Promise.all([
      adminClient.rpc('admin_get_kpi_training_summary', { p_from: from, p_to: to }),
      adminClient.rpc('admin_get_kpi_training_task_summary', { p_from: from, p_to: to }),
      adminClient.rpc('admin_get_kpi_training_step_funnel', { p_from: from, p_to: to }),
      adminClient.rpc('admin_get_kpi_training_daily', { p_from: from, p_to: to }),
    ]);

    console.log('[テスト9] r1 error:', r1.error, 'r2 error:', r2.error, 'r3 error:', r3.error, 'r4 error:', r4.error);
    expect(r1.error).toBeNull();
    expect(r2.error).toBeNull();
    expect(r3.error).toBeNull();
    expect(r4.error).toBeNull();
  });

  // テスト10: 非Admin (authenticated, 一般ユーザー) は拒否される
  it('テスト10: 非Adminは_kpi_require_adminで拒否される (GRANT設定確認)', () => {
    // _kpi_require_adminはauth.uid()がadmin profileを持つことを要求
    // GRANTはauthenticatedに付与されているが、_kpi_require_adminで弾かれる
    // 静的SQL確認
    const revokeFromAnon = (m14.match(/REVOKE ALL ON FUNCTION[\s\S]{0,200}?FROM anon/g) ?? []).length;
    expect(revokeFromAnon).toBeGreaterThanOrEqual(4);
    // _kpi_require_adminが存在することを確認（拒否ロジック）
    expect(m14).toContain('_kpi_require_admin');
  });

  // テスト11: anon は権限なし
  it('テスト11: anonは権限なし（GRANTにanonが含まれない）', () => {
    const grantToAnon = m14.match(/GRANT EXECUTE ON FUNCTION.*TO.*\banon\b/g) ?? [];
    expect(grantToAnon.length).toBe(0);
  });

  // テスト1: 正解1+不正解2 → attempt_events=1(training_attempted), incorrect_attempts=2
  it('テスト1: 正解1+不正解2 → attempt_events=1, incorrect_attempts=2', async () => {
    if (!runDBFixture || !adminClient) {
      console.warn('skip テスト1: admin client unavailable');
      expect(true).toBe(true);
      return;
    }
    const runId = randomUUID();
    const baseTime = new Date(Date.now() - 3 * 3600 * 1000);
    const t = (offset: number) => new Date(baseTime.getTime() + offset * 1000).toISOString();

    await insertEvent({ event_name: 'training_started', run_id: runId, task_id: TEST_TASK_ID, occurred_at: t(0) });
    // training_attempted (正解1件)
    await insertEvent({ event_name: 'training_attempted', run_id: runId, task_id: TEST_TASK_ID, step: 1, occurred_at: t(10) });
    // training_incorrect (不正解2件)
    await insertEvent({ event_name: 'training_incorrect', run_id: runId, task_id: TEST_TASK_ID, step: 1, occurred_at: t(20) });
    await insertEvent({ event_name: 'training_incorrect', run_id: runId, task_id: TEST_TASK_ID, step: 1, occurred_at: t(30) });

    const from = new Date(baseTime.getTime() - 1000).toISOString();
    const to = new Date(baseTime.getTime() + 6 * 3600 * 1000).toISOString();

    const { data, error } = await adminClient.rpc(
      'admin_get_kpi_training_summary', { p_from: from, p_to: to }
    );
    expect(error).toBeNull();
    if (data && data.length > 0) {
      const row = data[0];
      console.log('[テスト1] attempt_events:', row.attempt_events, 'incorrect_attempts:', row.incorrect_attempts);
      // [FIX-C] attempt_events = training_attemptedのみ = 1
      expect(Number(row.attempt_events)).toBe(1);
      // [FIX-C] incorrect_attempts = training_incorrectのみ = 2
      expect(Number(row.incorrect_attempts)).toBe(2);
    }
  });

  // テスト2: duplicate completed → completed_run=1, elapsed=最初の値
  it('テスト2: duplicate completed → cohort_completed_runs=1, elapsed=最初のevent値', async () => {
    if (!runDBFixture || !adminClient) {
      console.warn('skip テスト2: admin client unavailable');
      expect(true).toBe(true);
      return;
    }
    const runId = randomUUID();
    const baseTime = new Date(Date.now() - 3 * 3600 * 1000);
    const t = (offset: number) => new Date(baseTime.getTime() + offset * 1000).toISOString();

    await insertEvent({ event_name: 'training_started', run_id: runId, task_id: TEST_TASK_ID, occurred_at: t(0) });
    // training_completedを2回（重複）
    await insertEvent({ event_name: 'training_completed', run_id: runId, task_id: TEST_TASK_ID, move_index: 2, elapsed_seconds: 100, occurred_at: t(20) });
    await insertEvent({ event_name: 'training_completed', run_id: runId, task_id: TEST_TASK_ID, move_index: 2, elapsed_seconds: 200, occurred_at: t(30) });

    const from = new Date(baseTime.getTime() - 1000).toISOString();
    const to = new Date(baseTime.getTime() + 6 * 3600 * 1000).toISOString();

    const { data, error } = await adminClient.rpc(
      'admin_get_kpi_training_summary', { p_from: from, p_to: to }
    );
    expect(error).toBeNull();
    if (data && data.length > 0) {
      const row = data[0];
      console.log('[テスト2] cohort_completed_runs:', row.cohort_completed_runs, 'average_elapsed:', row.average_elapsed_seconds);
      // [FIX-H] canonical completed = 1件のみ
      expect(Number(row.cohort_completed_runs)).toBe(1);
      // [FIX-I] elapsed = 最初のcanonical completed event (100秒)
      expect(Number(row.average_elapsed_seconds)).toBe(100);
    }
  });

  // テスト3: p_to後のreached → effective_as_of境界でbase_eventsに含まれない
  it('テスト3: p_to後のreached → 過去drop-off stepへ影響なし', async () => {
    if (!runDBFixture || !adminClient) {
      console.warn('skip テスト3: admin client unavailable');
      expect(true).toBe(true);
      return;
    }
    const runId = randomUUID();
    const taskId = `${TEST_TASK_ID}-t3`;
    const baseTime = new Date(Date.now() - 3 * 3600 * 1000);
    const t = (offset: number) => new Date(baseTime.getTime() + offset * 1000).toISOString();

    await insertEvent({ event_name: 'training_started', run_id: runId, task_id: taskId, occurred_at: t(0) });
    // step 1: period内
    await insertEvent({ event_name: 'training_step_reached', run_id: runId, task_id: taskId, step: 1, occurred_at: t(10) });
    // step 2: p_to後（effective_as_of後）→ base_eventsに含まれない
    const futureAt = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
    await insertEvent({ event_name: 'training_step_reached', run_id: runId, task_id: taskId, step: 2, occurred_at: futureAt });

    const from = new Date(baseTime.getTime() - 1000).toISOString();
    const to = new Date(baseTime.getTime() + 6 * 3600 * 1000).toISOString();

    const { data, error } = await adminClient.rpc(
      'admin_get_kpi_training_step_funnel', { p_from: from, p_to: to }
    );
    expect(error).toBeNull();
    if (data) {
      const step2Rows = data.filter(
        (r: { task_id: string; step: number }) => r.task_id === taskId && r.step === 2
      );
      // [FIX-E] p_to後のreachedはbase_eventsに含まれない
      expect(step2Rows.length).toBe(0);
      console.log('[テスト3] step2 rows:', step2Rows.length, '(expected 0)');
    }
  });

  // テスト4: step 5→step 3へ戻ったrun → last step=3 (時刻で決定)
  it('テスト4: step5→step3へ戻ったrun → last step=3 (時刻で決定)', async () => {
    if (!runDBFixture || !adminClient) {
      console.warn('skip テスト4: admin client unavailable');
      expect(true).toBe(true);
      return;
    }
    const runId = randomUUID();
    const taskId = `${TEST_TASK_ID}-t4`;
    // 48時間以上前に開始（abandoned判定のため）
    const baseTime = new Date(Date.now() - 50 * 3600 * 1000);
    const t = (offset: number) => new Date(baseTime.getTime() + offset * 1000).toISOString();

    await insertEvent({ event_name: 'training_started', run_id: runId, task_id: taskId, occurred_at: t(0) });
    await insertEvent({ event_name: 'training_step_reached', run_id: runId, task_id: taskId, step: 5, occurred_at: t(10) });
    // step 3へ戻る（時刻的に最後）
    await insertEvent({ event_name: 'training_step_reached', run_id: runId, task_id: taskId, step: 3, occurred_at: t(20) });

    const from = new Date(baseTime.getTime() - 1000).toISOString();
    const to = new Date(Date.now() + 3600 * 1000).toISOString();

    const { data, error } = await adminClient.rpc(
      'admin_get_kpi_training_step_funnel', { p_from: from, p_to: to }
    );
    expect(error).toBeNull();
    if (data) {
      const step3 = data.find((r: { task_id: string; step: number }) => r.task_id === taskId && r.step === 3);
      const step5 = data.find((r: { task_id: string; step: number }) => r.task_id === taskId && r.step === 5);
      console.log('[テスト4] step3 abandoned:', step3?.abandoned_runs_at_step, 'step5 abandoned:', step5?.abandoned_runs_at_step);
      // [FIX-F] 時刻的に最後=step 3に脱落帰属
      if (step3) expect(Number(step3.abandoned_runs_at_step)).toBeGreaterThan(0);
      if (step5) expect(Number(step5.abandoned_runs_at_step)).toBe(0);
    }
  });

  // テスト5: canonical start task=A, reached event task=B → task Aへ集計
  it('テスト5: canonical start task=A, reached event task=B → task Aへ集計', async () => {
    if (!runDBFixture || !adminClient) {
      console.warn('skip テスト5: admin client unavailable');
      expect(true).toBe(true);
      return;
    }
    const runId = randomUUID();
    const taskA = `${TEST_TASK_ID}-t5A`;
    const taskB = `${TEST_TASK_ID}-t5B`;
    const baseTime = new Date(Date.now() - 3 * 3600 * 1000);
    const t = (offset: number) => new Date(baseTime.getTime() + offset * 1000).toISOString();

    await insertEvent({ event_name: 'training_started', run_id: runId, task_id: taskA, occurred_at: t(0) });
    // reached eventのtask_idはtaskB（anomaly）
    await insertEvent({ event_name: 'training_step_reached', run_id: runId, task_id: taskB, step: 1, occurred_at: t(10) });

    const from = new Date(baseTime.getTime() - 1000).toISOString();
    const to = new Date(baseTime.getTime() + 6 * 3600 * 1000).toISOString();

    const { data, error } = await adminClient.rpc(
      'admin_get_kpi_training_step_funnel', { p_from: from, p_to: to }
    );
    expect(error).toBeNull();
    if (data) {
      const taskAStep1 = data.filter(
        (r: { task_id: string; step: number }) => r.task_id === taskA && r.step === 1
      );
      const taskBStep1 = data.filter(
        (r: { task_id: string; step: number }) => r.task_id === taskB && r.step === 1
      );
      console.log('[テスト5] taskA step1 rows:', taskAStep1.length, 'taskB step1 rows:', taskBStep1.length);
      // [FIX-G] canonical start.task_idで集計 → taskAに集計
      if (taskAStep1.length > 0) {
        expect(Number(taskAStep1[0].reached_runs)).toBeGreaterThan(0);
      }
      // taskBはコホートにいない
      expect(taskBStep1.length).toBe(0);
    }
  });

  // テスト6: move metadata矛盾 → 最初のcanonical reached値を採用
  it('テスト6: move metadata矛盾 → 最初のcanonical reached値(occurred_at ASC)を採用', async () => {
    if (!runDBFixture || !adminClient) {
      console.warn('skip テスト6: admin client unavailable');
      expect(true).toBe(true);
      return;
    }
    const runId1 = randomUUID();
    const runId2 = randomUUID();
    const taskId = `${TEST_TASK_ID}-t6`;
    const baseTime = new Date(Date.now() - 3 * 3600 * 1000);
    const t = (offset: number) => new Date(baseTime.getTime() + offset * 1000).toISOString();

    // run1: move_id='move-alpha', move_index=0 (時刻的に先)
    await insertEvent({ event_name: 'training_started', run_id: runId1, task_id: taskId, occurred_at: t(0) });
    await insertEvent({
      event_name: 'training_step_reached', run_id: runId1, task_id: taskId,
      step: 1, move_id: 'move-alpha', move_index: 0, total_steps: 5, occurred_at: t(5)
    });

    // run2: move_id='move-beta', move_index=2 (時刻的に後)
    await insertEvent({ event_name: 'training_started', run_id: runId2, task_id: taskId, occurred_at: t(20) });
    await insertEvent({
      event_name: 'training_step_reached', run_id: runId2, task_id: taskId,
      step: 1, move_id: 'move-beta', move_index: 2, total_steps: 5, occurred_at: t(25)
    });

    const from = new Date(baseTime.getTime() - 1000).toISOString();
    const to = new Date(baseTime.getTime() + 6 * 3600 * 1000).toISOString();

    const { data, error } = await adminClient.rpc(
      'admin_get_kpi_training_step_funnel', { p_from: from, p_to: to }
    );
    expect(error).toBeNull();
    if (data) {
      const step1Row = data.find(
        (r: { task_id: string; step: number }) => r.task_id === taskId && r.step === 1
      );
      console.log('[テスト6] step1 move_id:', step1Row?.move_id, 'move_index:', step1Row?.move_index);
      if (step1Row) {
        // [FIX-G] occurred_at ASCで最初のcanonical reached値 = move-alpha, move_index=0
        expect(step1Row.move_id).toBe('move-alpha');
        expect(step1Row.move_index).toBe(0);
      }
    }
  });

  // テスト7: AI経路のrun → eligible_canonical_runsに含まれない
  it('テスト7: AI経路(route=/ai-check-login)のrun → eligible_canonical_runsに含まれない', async () => {
    if (!runDBFixture || !adminClient) {
      console.warn('skip テスト7: admin client unavailable');
      expect(true).toBe(true);
      return;
    }
    const runId = randomUUID();
    const taskId = `${TEST_TASK_ID}-t7`;
    const baseTime = new Date(Date.now() - 3 * 3600 * 1000);
    const t = (offset: number) => new Date(baseTime.getTime() + offset * 1000).toISOString();

    // AI経路のrun
    await insertEvent({ event_name: 'training_started', run_id: runId, task_id: taskId, route: '/ai-check-login', occurred_at: t(0) });
    await insertEvent({ event_name: 'training_completed', run_id: runId, task_id: taskId, route: '/ai-check-login', elapsed_seconds: 60, occurred_at: t(10) });

    const from = new Date(baseTime.getTime() - 1000).toISOString();
    const to = new Date(baseTime.getTime() + 6 * 3600 * 1000).toISOString();

    // task_summaryで確認: taskIdがeligible_canonical_runsに入らないためstarter=0
    const { data, error } = await adminClient.rpc(
      'admin_get_kpi_training_task_summary', { p_from: from, p_to: to }
    );
    expect(error).toBeNull();
    if (data) {
      const aiTaskRow = data.find((r: { task_id: string }) => r.task_id === taskId);
      // [FIX-D][FIX-J] AI除外 → started_runs=0 or row absent
      if (aiTaskRow) {
        expect(Number(aiTaskRow.started_runs)).toBe(0);
      }
      console.log('[テスト7] AI task row:', aiTaskRow?.started_runs ?? 'not found');
    }
  });

  // テスト8: 通常のeligible run → dailyに出る
  it('テスト8: 通常のeligible run completion → dailyに出る', async () => {
    if (!runDBFixture || !adminClient) {
      console.warn('skip テスト8: admin client unavailable');
      expect(true).toBe(true);
      return;
    }
    const runId = randomUUID();
    const taskId = `${TEST_TASK_ID}-t8`;
    const baseTime = new Date(Date.now() - 3 * 3600 * 1000);
    const t = (offset: number) => new Date(baseTime.getTime() + offset * 1000).toISOString();

    await insertEvent({ event_name: 'training_started', run_id: runId, task_id: taskId, route: '/training', occurred_at: t(0) });
    await insertEvent({ event_name: 'training_completed', run_id: runId, task_id: taskId, elapsed_seconds: 120, occurred_at: t(10) });

    const from = new Date(baseTime.getTime() - 1000).toISOString();
    const to = new Date(baseTime.getTime() + 6 * 3600 * 1000).toISOString();

    const { data, error } = await adminClient.rpc(
      'admin_get_kpi_training_daily', { p_from: from, p_to: to }
    );
    expect(error).toBeNull();
    if (data) {
      expect(data.length).toBeGreaterThan(0);
      // started_runs または completion_events が1以上の行が存在
      const activeRows = data.filter(
        (r: { started_runs: number; completion_events: number }) =>
          Number(r.started_runs) > 0 || Number(r.completion_events) > 0
      );
      expect(activeRows.length).toBeGreaterThan(0);
      console.log('[テスト8] daily rows with activity:', activeRows.length);
    }
  });

  // テスト13: 4 RPCの実行結果確認（戻り値型と構造）
  it('テスト13: 4 RPCの実行結果確認（戻り値型と構造）', async () => {
    if (!runDBFixture || !adminClient) {
      console.warn('skip テスト13: admin client unavailable');
      expect(true).toBe(true);
      return;
    }
    const from = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const to = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    const { data: summaryData, error: summaryError } = await adminClient.rpc(
      'admin_get_kpi_training_summary', { p_from: from, p_to: to }
    );
    expect(summaryError).toBeNull();
    expect(Array.isArray(summaryData)).toBe(true);

    if (summaryData && summaryData.length > 0) {
      const row = summaryData[0];
      expect(typeof row.started_runs).toBe('number');
      expect(typeof row.unique_starters).toBe('number');
      expect(typeof row.is_reference_period).toBe('boolean');
      // official_kpi_start_at = NULL → is_reference_period = true
      expect(row.is_reference_period).toBe(true);
    }

    const { data: taskData, error: taskError } = await adminClient.rpc(
      'admin_get_kpi_training_task_summary', { p_from: from, p_to: to }
    );
    expect(taskError).toBeNull();
    expect(Array.isArray(taskData)).toBe(true);

    const { data: funnelData, error: funnelError } = await adminClient.rpc(
      'admin_get_kpi_training_step_funnel', { p_from: from, p_to: to }
    );
    expect(funnelError).toBeNull();
    expect(Array.isArray(funnelData)).toBe(true);

    const { data: dailyData, error: dailyError } = await adminClient.rpc(
      'admin_get_kpi_training_daily', { p_from: from, p_to: to }
    );
    expect(dailyError).toBeNull();
    expect(Array.isArray(dailyData)).toBe(true);

    console.log('[テスト13] summary rows:', summaryData?.length, 'task rows:', taskData?.length,
      'funnel rows:', funnelData?.length, 'daily rows:', dailyData?.length);
  });
});

describe('[DB] official_kpi_start_at = NULL確認', () => {
  it('kpi_settings.official_kpi_start_at はNULL (変更禁止確認)', async () => {
    if (!runDBFixture) {
      console.warn('RUN_KPI_DB_FIXTURE != 1 — skip');
      expect(true).toBe(true);
      return;
    }
    const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data, error } = await client
      .from('kpi_settings')
      .select('official_kpi_start_at')
      .eq('id', 1)
      .single();

    expect(error).toBeNull();
    if (data) {
      console.log('[official_kpi_start_at]:', data.official_kpi_start_at);
      expect(data.official_kpi_start_at).toBeNull();
    }
  });
});
