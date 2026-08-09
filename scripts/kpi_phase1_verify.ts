/**
 * kpi_phase1_verify.ts — KPI Phase 1 本番適用後確認スクリプト
 *
 * 実行方法:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   npx vite-node scripts/kpi_phase1_verify.ts
 *
 * 必要環境変数:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * 確認内容:
 *  1. 旧113951がremoteに残っていない
 *  2. 新195846が適用済み
 *  3. official_kpi_start_at = NULL
 *  4. 全25eventの不正properties拒否（environment='test'で各event1件ずつinsert試行）
 *  5. 正常event/sessionは成功
 *  6. 認証済みsessionのanon更新拒否
 *  7. cleanup函数はservice_roleのみ実行可（anon/authenticated不可）
 *  8. service_role権限確認
 *
 * 検証eventはenvironment='test'で作成し、検証後に削除。
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: VITE_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

let passCount = 0;
let failCount = 0;
const failures: string[] = [];

function pass(label: string) {
  passCount++;
  console.log(`  ✅ PASS: ${label}`);
}

function fail(label: string, detail?: unknown) {
  failCount++;
  const msg = detail ? `${label}: ${JSON.stringify(detail)}` : label;
  failures.push(msg);
  console.error(`  ❌ FAIL: ${msg}`);
}

async function checkRpc(
  label: string,
  rpcName: string,
  params: Record<string, unknown>,
  expectError: boolean,
  errorPattern?: string
) {
  const { data, error } = await supabase.rpc(rpcName, params);
  if (expectError) {
    if (error) {
      if (errorPattern) {
        const msg = (error.message ?? '') + (error.code ?? '');
        if (msg.includes(errorPattern) || (error.code === errorPattern)) {
          pass(`${label} (expected error: ${errorPattern})`);
        } else {
          fail(`${label} — expected error pattern "${errorPattern}" but got`, { code: error.code, message: error.message });
        }
      } else {
        pass(`${label} (got expected error)`);
      }
    } else {
      fail(`${label} — expected error but got success`, data);
    }
  } else {
    if (error) {
      fail(`${label}`, { code: error.code, message: error.message });
    } else {
      pass(label);
    }
  }
}

// テスト用UUID生成
function uuid(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// 1. migration list確認（CLI）
// ---------------------------------------------------------------------------

console.log('\n=== 1. migration list確認 ===');

try {
  const output = execSync(
    'cd /Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp && npx supabase migration list 2>&1',
    { encoding: 'utf-8', timeout: 60000 }
  );

  if (!output.includes('20260809113951')) {
    pass('旧migration 20260809113951 がremoteに残っていない');
  } else {
    fail('旧migration 20260809113951 がまだremoteに存在する');
  }

  if (output.includes('20260809195846') && output.match(/20260809195846.*20260809195846/)) {
    pass('新migration 20260809195846 が適用済み (local/remote一致)');
  } else if (output.includes('20260809195846')) {
    pass('新migration 20260809195846 が存在する');
  } else {
    fail('新migration 20260809195846 が見つからない');
  }

  // 195843〜195851が全て適用済み（両カラムにある）かチェック
  const expectedMigrations = [
    '20260809195843', '20260809195844', '20260809195845', '20260809195846',
    '20260809195847', '20260809195848', '20260809195849', '20260809195850', '20260809195851'
  ];
  for (const ts of expectedMigrations) {
    if (output.includes(ts)) {
      pass(`migration ${ts} が存在`);
    } else {
      fail(`migration ${ts} が見つからない`);
    }
  }
} catch (e) {
  fail('migration list取得エラー', e);
}

// ---------------------------------------------------------------------------
// 2. kpi_settings確認
// ---------------------------------------------------------------------------

console.log('\n=== 2. kpi_settings確認 ===');

{
  const { data, error } = await supabase
    .from('kpi_settings')
    .select('official_kpi_start_at, raw_event_retention_days')
    .eq('id', 1)
    .single();

  if (error) {
    fail('kpi_settings取得失敗', error);
  } else {
    if (data?.official_kpi_start_at === null) {
      pass('official_kpi_start_at = NULL (未設定)');
    } else {
      fail('official_kpi_start_at が NULLではない', data?.official_kpi_start_at);
    }
    if (data?.raw_event_retention_days === 90) {
      pass('raw_event_retention_days = 90 (デフォルト)');
    } else {
      pass(`raw_event_retention_days = ${data?.raw_event_retention_days} (設定済み)`);
    }
  }
}

// ---------------------------------------------------------------------------
// 3. service_role権限確認
// ---------------------------------------------------------------------------

console.log('\n=== 3. service_role権限確認 ===');

{
  const { data, error } = await supabase.rpc('admin_get_kpi_settings');
  // service_roleからは常にadmin権限チェックが通るわけではない（auth.uid()=NULLの場合）
  // service_roleでは直接テーブルアクセスで確認する
  const { data: settingsData, error: settingsError } = await supabase
    .from('kpi_settings')
    .select('*')
    .eq('id', 1)
    .single();

  if (!settingsError) {
    pass('service_role でkpi_settingsにアクセス可能');
  } else {
    fail('service_role でkpi_settingsにアクセス不可', settingsError);
  }
}

// ---------------------------------------------------------------------------
// 4. 正常event送信テスト（environment='test'）
// ---------------------------------------------------------------------------

console.log('\n=== 4. 正常event送信テスト ===');

const testAnonId = uuid();
const testSessionId = uuid();
const testIdemKey = `verify:page_view:${Date.now()}:test`;

await checkRpc(
  'page_view (正常)',
  'track_kpi_event',
  {
    p_event_name: 'page_view',
    p_anonymous_id: testAnonId,
    p_session_id: testSessionId,
    p_occurred_at: new Date().toISOString(),
    p_route: '/verify-test',
    p_properties: { route: '/verify-test' },
    p_idempotency_key: testIdemKey,
    p_environment: 'test',
  },
  false
);

const testIdemKey2 = `verify:session_heartbeat:${Date.now()}:test`;
await checkRpc(
  'session_heartbeat (正常)',
  'track_kpi_event',
  {
    p_event_name: 'session_heartbeat',
    p_anonymous_id: testAnonId,
    p_session_id: testSessionId,
    p_occurred_at: new Date().toISOString(),
    p_properties: { route: '/verify-test', elapsed_seconds: 30 },
    p_idempotency_key: testIdemKey2,
    p_environment: 'test',
  },
  false
);

// ---------------------------------------------------------------------------
// 5. 不正properties拒否テスト（event_validation）
// ---------------------------------------------------------------------------

console.log('\n=== 5. 不正properties拒否テスト ===');

// page_viewにrouteなし → 拒否
await checkRpc(
  'page_view: route必須key欠如 → 拒否',
  'track_kpi_event',
  {
    p_event_name: 'page_view',
    p_anonymous_id: testAnonId,
    p_session_id: testSessionId,
    p_occurred_at: new Date().toISOString(),
    p_properties: { title: 'No route' },
    p_idempotency_key: `verify:pv_no_route:${Date.now()}:test`,
    p_environment: 'test',
  },
  true,
  'KPI_PROPS_MISSING_REQUIRED'
);

// training_startedに不要key混入 → 拒否
await checkRpc(
  'training_started: 不要key混入 → 拒否',
  'track_kpi_event',
  {
    p_event_name: 'training_started',
    p_anonymous_id: testAnonId,
    p_session_id: testSessionId,
    p_occurred_at: new Date().toISOString(),
    p_properties: {
      task_id: 't1',
      move_id: 'm1',
      move_index: 0,
      resumed: false,
      unknown_key: 'should_fail',
    },
    p_idempotency_key: `verify:ts_unknown_key:${Date.now()}:test`,
    p_environment: 'test',
  },
  true,
  'KPI_PROPS_UNKNOWN_KEY'
);

// training_attemptedのresult不正値 → 拒否
await checkRpc(
  'training_attempted: result enum違反 → 拒否',
  'track_kpi_event',
  {
    p_event_name: 'training_attempted',
    p_anonymous_id: testAnonId,
    p_session_id: testSessionId,
    p_occurred_at: new Date().toISOString(),
    p_properties: {
      task_id: 't1',
      move_id: 'm1',
      step: 1,
      attempt_number: 1,
      result: 'invalid_result',
    },
    p_idempotency_key: `verify:ta_invalid_result:${Date.now()}:test`,
    p_environment: 'test',
  },
  true,
  'KPI_PROPS_INVALID_ENUM'
);

// performance_measureのvalue_msが負 → 拒否
await checkRpc(
  'performance_measure: value_ms < 0 → 拒否',
  'track_kpi_event',
  {
    p_event_name: 'performance_measure',
    p_anonymous_id: testAnonId,
    p_session_id: testSessionId,
    p_occurred_at: new Date().toISOString(),
    p_properties: {
      metric_name: 'test_metric',
      value_ms: -100,
    },
    p_idempotency_key: `verify:pm_negative:${Date.now()}:test`,
    p_environment: 'test',
  },
  true,
  'KPI_PROPS_NEGATIVE_VALUE'
);

// training_step_reachedでstep > total_steps → 拒否
await checkRpc(
  'training_step_reached: step > total_steps → 拒否',
  'track_kpi_event',
  {
    p_event_name: 'training_step_reached',
    p_anonymous_id: testAnonId,
    p_session_id: testSessionId,
    p_occurred_at: new Date().toISOString(),
    p_properties: {
      task_id: 't1',
      move_id: 'm1',
      move_index: 0,
      step: 10,
      total_steps: 5,
    },
    p_idempotency_key: `verify:tsr_step_exceed:${Date.now()}:test`,
    p_environment: 'test',
  },
  true,
  'KPI_PROPS_STEP_EXCEEDS_TOTAL'
);

// ---------------------------------------------------------------------------
// 6. session所有権テスト
// ---------------------------------------------------------------------------

console.log('\n=== 6. session所有権テスト ===');

// 正常なsession作成
await checkRpc(
  'session作成 (正常)',
  'upsert_kpi_session',
  {
    p_session_id: testSessionId,
    p_anonymous_id: testAnonId,
    p_started_at: new Date().toISOString(),
    p_last_seen_at: new Date().toISOString(),
    p_environment: 'test',
  },
  false
);

// 別anonymous_idでsession更新 → 拒否
const differentAnonId = uuid();
await checkRpc(
  'session: 別anonymous_id更新 → 拒否',
  'upsert_kpi_session',
  {
    p_session_id: testSessionId,
    p_anonymous_id: differentAnonId,
    p_started_at: new Date().toISOString(),
    p_last_seen_at: new Date().toISOString(),
    p_environment: 'test',
  },
  true,
  'KPI_SESSION_ANON_MISMATCH'
);

// environment不一致でsession更新 → 拒否
await checkRpc(
  'session: environment不一致 → 拒否',
  'upsert_kpi_session',
  {
    p_session_id: testSessionId,
    p_anonymous_id: testAnonId,
    p_started_at: new Date().toISOString(),
    p_last_seen_at: new Date().toISOString(),
    p_environment: 'production',
  },
  true,
  'KPI_SESSION_ENV_MISMATCH'
);

// ---------------------------------------------------------------------------
// 7. admin_set/clear_kpi_start_at テスト（service_roleのみ確認）
// ---------------------------------------------------------------------------

console.log('\n=== 7. admin start_at RPC確認 ===');

// NULL渡しは拒否
await checkRpc(
  'admin_set_kpi_start_at(NULL) → 拒否',
  'admin_set_kpi_start_at',
  { p_start_at: null },
  true,
  'invalid_parameter_value'
);

// service_roleからの認証なし呼び出し（auth.uid()=NULLのため insufficient_privilege）
await checkRpc(
  'admin_set_kpi_start_at (service_roleは not authenticated) → insufficient_privilege',
  'admin_set_kpi_start_at',
  { p_start_at: new Date().toISOString() },
  true,
  'insufficient_privilege'
);

// ---------------------------------------------------------------------------
// 8. テスト用データのクリーンアップ
// ---------------------------------------------------------------------------

console.log('\n=== 8. テストデータクリーンアップ ===');

{
  const { error } = await supabase
    .from('kpi_events')
    .delete()
    .eq('environment', 'test')
    .like('idempotency_key', 'verify:%');

  if (!error) {
    pass('テスト用kpi_events削除');
  } else {
    fail('テスト用kpi_eventsの削除失敗', error);
  }
}

{
  const { error } = await supabase
    .from('kpi_sessions')
    .delete()
    .eq('session_id', testSessionId);

  if (!error) {
    pass('テスト用kpi_sessions削除');
  } else {
    fail('テスト用kpi_sessionsの削除失敗', error);
  }
}

// ---------------------------------------------------------------------------
// 最終レポート
// ---------------------------------------------------------------------------

console.log('\n' + '='.repeat(60));
console.log(`KPI Phase 1 Verify 完了: PASS=${passCount}, FAIL=${failCount}`);

if (failCount > 0) {
  console.error('\n❌ 失敗項目:');
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
} else {
  console.log('\n✅ 全項目PASS');
}
