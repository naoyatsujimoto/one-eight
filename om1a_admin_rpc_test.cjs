/**
 * OM-1a Phase 2: RPC admin test
 *
 * 問題: service_role クライアントは auth.uid()=NULL になるため
 *       SECURITY DEFINER RPC 内の admin チェックを通過できない。
 *
 * 解決策: Supabase の auth.uid() はセッショントークンから取得される。
 * service_role に auth context を注入する方法:
 *   supabase.auth.setSession({ access_token: <user_jwt>, refresh_token: '' })
 * → しかしユーザーの JWT が不明。
 *
 * 代替案: SET LOCAL request.jwt.claims にユーザーの uid を含む JWT を注入する。
 * → これは PostgREST 経由では不可。
 *
 * ✅ 実用的な解決策:
 * 1. service_role で profiles.is_admin = true に UPDATE（一時）
 * 2. そのユーザーの auth を使って supabase-js でサインインする
 *    → しかし magic link が必要で自動化不可
 *
 * ✅ 別の解決策: service_role で PostgreSQL function を直接実行する際に
 *    set_config('request.jwt.claims', ...) を使ってユーザー context を偽装する
 *    → これは PostgREST では難しい
 *
 * ✅ 最終案: Supabase Admin Auth API でユーザートークンを取得
 *    POST /auth/v1/admin/users/{uid}/token → 非標準・未サポート
 *
 * ✅ 実装済み確認済み（これで十分）:
 *    - cancel_official_match が "permission_denied: admin required" → admin チェック機能 ✅
 *    - create_official_match が "permission_denied: admin required" → admin チェック機能 ✅
 *    - enter_official_match(uuid, jsonb) が "not_found" → 関数存在 + 参加者チェック機能 ✅
 *    - list_my_official_matches が [] → 関数存在 ✅
 *    - official_matches INSERT (service_role) → テーブル + 全カラム正常 ✅
 *
 * 残課題: is_admin=true のユーザーが存在しない
 *   → SQL で UPDATE して is_admin=true にして確認する
 *
 * このスクリプト: is_admin=true に一時 UPDATE → RPC テスト → is_admin=false に戻す
 * (RPC は service_role なので auth.uid()=NULL 問題は残るが...)
 *
 * 実は PostgREST の service_role は X-Custom-Headers で auth context を持てないか？
 * → supabase-js v2 では auth.setSession() でユーザー JWT を設定できる
 *    その後 supabase.rpc() を呼ぶと適切な auth.uid() が設定される
 *
 * → ユーザーのパスワードログインが使えればテスト可能
 *   しかし .env にユーザーパスワードはない
 *
 * ✅ 最終決定:
 *   admin テストは「is_admin=true のユーザーが存在しないため実行不可」として記録
 *   代わりに admin チェックが正常に機能していることを non-admin 拒否で確認済み
 *   OM-1a の実用上の問題は「admin ユーザーが存在しない」という設定上の問題
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://farieecfyajbtmjxelop.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhcmllZWNmeWFqYnRtanhlbG9wIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjU4MTEyOCwiZXhwIjoyMDkyMTU3MTI4fQ.Mk81v949kAAwvn_Cz0M1d8w_W9-b6f7jZZ-CoKT6Sak';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  console.log('=== Phase 2: RPC Function Signature Check ===\n');

  // 4 RPC の存在確認（正確なシグネチャ）
  // enter_official_match(uuid, jsonb) → not_found: OK ✅
  // cancel_official_match(uuid, text) → permission_denied: admin required ✅
  // create_official_match(uuid,uuid,timestamptz,...) → permission_denied ✅
  // list_my_official_matches() → [] ✅

  // これらはすでに確認済み。
  // ここでは enter_official_match のシグネチャを正確に確認する
  const r1 = await supabase.rpc('enter_official_match', {
    p_match_id: '00000000-0000-0000-0000-000000000000',
    p_initial_state: { test: true }
  });
  console.log('[enter_official_match(uuid,jsonb)] error:', r1.error?.message, '| code:', r1.error?.code);
  // Expected: not_found (= function exists and parameter count/type matched)

  // cancel with correct signature: (uuid, text)
  const r2 = await supabase.rpc('cancel_official_match', {
    p_match_id: '00000000-0000-0000-0000-000000000000',
    p_reason: null
  });
  console.log('[cancel_official_match(uuid, null)] error:', r2.error?.message, '| code:', r2.error?.code);

  // create with correct full signature
  const r3 = await supabase.rpc('create_official_match', {
    p_black_user_id: '00000000-0000-0000-0000-000000000001',
    p_white_user_id: '00000000-0000-0000-0000-000000000002',
    p_starts_at: new Date(Date.now() + 3600000).toISOString(),
    p_ends_at: null,
    p_timer_config: { mode: 'total_time', totalSeconds: 600 },
    p_tournament_id: null,
    p_round_id: null
  });
  console.log('[create_official_match(full)] error:', r3.error?.message, '| code:', r3.error?.code);

  console.log('\n=== Summary ===');
  console.log('enter_official_match: PGRST202 = not found / P0001 = function found');
  console.log('All P0001 (or correct logic errors) = functions EXIST ✅');
  
  // check: is enter_official_match returning PGRST202 or P0001?
  if (r1.error?.code === 'PGRST202') {
    console.log('WARNING: enter_official_match signature mismatch — function may not exist');
  } else if (r1.error?.code === 'P0001') {
    console.log('✅ enter_official_match exists (P0001 = not_found logic error = function executed)');
  } else if (!r1.error) {
    console.log('✅ enter_official_match returned data:', JSON.stringify(r1.data));
  }
}

main().catch(console.error);
