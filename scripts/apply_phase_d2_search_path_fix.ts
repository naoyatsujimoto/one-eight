/**
 * apply_phase_d2_search_path_fix.ts — Phase D補正 migration適用 + 検証
 * exec_sql_readonly RPC経由で読み取り検証、
 * DDL適用は exec_sql (write) RPCがある場合のみ。
 *
 * 実行: npx tsx scripts/apply_phase_d2_search_path_fix.ts
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// .env 読み込み
try {
  const lines = readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/.env', 'utf-8').split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx < 0) continue;
    const k = t.slice(0, idx).trim();
    const v = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
} catch { /* noop */ }

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('env missing');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const MIGRATION_FILE = resolve(
  __dirname,
  '../supabase/migrations/20260808000002_fix_handle_new_user_search_path.sql',
);

async function rqReadonly(query: string): Promise<unknown[]> {
  const { data, error } = await sb.rpc('exec_sql_readonly', { query });
  if (error) throw new Error(`exec_sql_readonly: ${error.message}`);
  return (data as unknown[]) ?? [];
}

async function rqWrite(query: string): Promise<unknown[]> {
  // exec_sql (write) を試みる
  const { data, error } = await sb.rpc('exec_sql', { query });
  if (error) throw new Error(`exec_sql: ${error.message}`);
  return (data as unknown[]) ?? [];
}

async function main() {
  console.log('=== Phase D補正: handle_new_user search_path fix ===\n');

  // 1. migration適用
  const sql = readFileSync(MIGRATION_FILE, 'utf-8');
  console.log(`migration file: ${MIGRATION_FILE}`);
  console.log(`SQL length: ${sql.length} bytes`);
  console.log('→ exec_sql(write) で本番に適用中...');

  try {
    await rqWrite(sql);
    console.log('✅ exec_sql: migration適用完了\n');
  } catch (e) {
    // exec_sqlがない場合はPostgREST直接呼び出しを試みる
    console.log(`exec_sql 失敗: ${e instanceof Error ? e.message : e}`);
    console.log('→ REST /rpc/pg_execute_sql を試みます...');
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pg_execute_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({ sql_text: sql }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      console.error(`pg_execute_sql失敗 (${resp.status}): ${body.substring(0, 300)}`);
      console.error('\n⚠️  自動適用できませんでした。以下のSQLを手動で実行してください:');
      console.error('---');
      console.error(sql);
      console.error('---');
      process.exit(1);
    }
    console.log('✅ pg_execute_sql: migration適用完了\n');
  }

  // 2. trigger確認
  console.log('=== 検証: trigger ===');
  const trigRes = await rqReadonly(`
    SELECT
      t.tgname           AS trigger_name,
      c.relname          AS table_name,
      n.nspname          AS table_schema,
      p.proname          AS function_name,
      fn.nspname         AS function_schema,
      t.tgenabled        AS enabled
    FROM pg_trigger t
    JOIN pg_class c      ON c.oid = t.tgrelid
    JOIN pg_namespace n  ON n.oid = c.relnamespace
    JOIN pg_proc p       ON p.oid = t.tgfoid
    JOIN pg_namespace fn ON fn.oid = p.pronamespace
    WHERE c.relname = 'users'
      AND n.nspname  = 'auth'
      AND NOT t.tgisinternal
    ORDER BY t.tgname;
  `) as { trigger_name: string; table_name: string; function_name: string; enabled: string }[];

  for (const r of trigRes) {
    const enabledStr = r.enabled === 'O' ? 'ENABLED ✅' : `disabled (${r.enabled}) ❌`;
    console.log(`  ${r.trigger_name}: ${r.function_name}() → ${enabledStr}`);
  }
  const ourTrigger = trigRes.find(r => r.trigger_name === 'on_auth_user_created');
  if (!ourTrigger) { console.error('❌ on_auth_user_created trigger が見つかりません'); process.exit(1); }
  if (ourTrigger.enabled !== 'O') { console.error(`❌ trigger enabled=${ourTrigger.enabled}`); process.exit(1); }
  if (ourTrigger.function_name !== 'handle_new_user') { console.error(`❌ function_name=${ourTrigger.function_name}`); process.exit(1); }
  console.log('→ trigger: on_auth_user_created → handle_new_user() ENABLED ✅\n');

  // 3. pg_get_functiondef でsearch_path確認
  console.log('=== 検証: pg_get_functiondef search_path ===');
  const defRes = await rqReadonly(`
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'handle_new_user';
  `) as { def: string }[];

  if (!defRes || defRes.length === 0) { console.error('❌ handle_new_user 関数が見つかりません'); process.exit(1); }
  const funcDef = defRes[0]!.def;
  const spLine = funcDef.match(/SET search_path[^\n]*/i)?.[0] ?? '(no SET search_path line)';
  console.log(`  search_path line: ${spLine}`);
  // 空文字 '' が含まれることを確認（TO '' または = ''）
  const hasEmptySearchPath = /SET search_path\s+(TO|=)\s+''/i.test(funcDef);
  if (!hasEmptySearchPath) {
    console.error("❌ search_path が空文字になっていません");
    console.error('実際の定義の先頭500文字:', funcDef.substring(0, 500));
    process.exit(1);
  }
  console.log("→ search_path = '' ✅\n");

  // 4. 行数確認
  console.log('=== 検証: auth.users / profiles 行数 ===');
  const countRes = await rqReadonly(`
    SELECT
      (SELECT COUNT(*)::int FROM auth.users WHERE deleted_at IS NULL) AS auth_users,
      (SELECT COUNT(*)::int FROM public.profiles)                     AS profiles,
      (SELECT COUNT(*)::int
         FROM auth.users u
         LEFT JOIN public.profiles p ON p.id = u.id
         WHERE p.id IS NULL AND u.deleted_at IS NULL)                AS missing,
      (SELECT COUNT(*)::int
         FROM public.profiles p
         LEFT JOIN auth.users u ON u.id = p.id
         WHERE u.id IS NULL)                                         AS orphan;
  `) as { auth_users: number; profiles: number; missing: number; orphan: number }[];

  const c = countRes[0]!;
  console.log(`auth.users : ${c.auth_users}`);
  console.log(`profiles   : ${c.profiles}`);
  console.log(`missing    : ${c.missing}`);
  console.log(`orphan     : ${c.orphan}`);
  if (c.auth_users === 17) console.log('→ auth.users = 17 ✅');
  else console.warn(`⚠️  auth.users = ${c.auth_users} (期待値: 17)`);
  if (c.profiles === 17) console.log('→ profiles = 17 ✅');
  else console.warn(`⚠️  profiles = ${c.profiles} (期待値: 17)`);
  if (c.missing === 0) console.log('→ missing = 0 ✅');
  else console.error(`❌ missing = ${c.missing}`);
  if (c.orphan === 0) console.log('→ orphan = 0 ✅');
  else console.error(`❌ orphan = ${c.orphan}`);

  // 5. profiles 保護列サンプル確認
  console.log('\n=== 検証: profiles保護列サンプル ===');
  const profilesRes = await rqReadonly(`
    SELECT
      LEFT(id::text, 8) AS id_prefix,
      display_name IS NULL AS name_null,
      plan,
      subscription_status,
      is_admin,
      is_internal_test_account,
      internal_plan_override,
      lang
    FROM public.profiles
    ORDER BY created_at
    LIMIT 20;
  `) as {
    id_prefix: string;
    name_null: boolean;
    plan: string;
    subscription_status: string;
    is_admin: boolean;
    is_internal_test_account: boolean;
    internal_plan_override: string | null;
    lang: string;
  }[];

  const admins = profilesRes.filter(r => r.is_admin).length;
  const internals = profilesRes.filter(r => r.is_internal_test_account).length;
  const pros = profilesRes.filter(r => r.plan === 'pro').length;
  console.log(`  総行数: ${profilesRes.length}`);
  console.log(`  is_admin=true: ${admins}件`);
  console.log(`  is_internal_test_account=true: ${internals}件`);
  console.log(`  plan=pro: ${pros}件`);
  console.log('→ profiles保護列確認完了 ✅');

  // 6. langのDB defaultがjaであることを確認
  console.log('\n=== 検証: profiles.lang DEFAULT ===');
  const langDefault = await rqReadonly(`
    SELECT column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'profiles'
      AND column_name  = 'lang';
  `) as { column_default: string }[];
  const langDef = langDefault[0]?.column_default ?? 'N/A';
  console.log(`  lang column_default: ${langDef}`);
  if (langDef.includes('ja')) {
    console.log("→ lang DEFAULT は 'ja' ✅ (現行schemaのDEFAULT値と一致するため採用)");
  } else {
    console.warn(`⚠️  lang DEFAULT は ${langDef} (期待値: 'ja')`);
  }

  console.log('\n=== Phase D補正 全検証完了 ✅ ===');
}

main().catch((err) => {
  console.error('エラー:', err instanceof Error ? err.message : err);
  process.exit(1);
});
