/**
 * verify_phase_d2.ts — Phase D補正検証 (read-only)
 * exec_sql_readonly RPC経由で本番状態を確認する。
 * 実行: npx tsx scripts/verify_phase_d2.ts
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

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
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function rq(query: string): Promise<unknown[]> {
  const { data, error } = await sb.rpc('exec_sql_readonly', { query });
  if (error) throw new Error(`exec_sql_readonly: ${error.message}`);
  return (data as unknown[]) ?? [];
}

async function main() {
  console.log('=== Phase D補正 検証 ===\n');

  // 1. trigger
  console.log('=== trigger ===');
  const trig = await rq(`
    SELECT t.tgname, p.proname AS fn_name, fn.nspname AS fn_schema, t.tgenabled
    FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_proc p ON p.oid=t.tgfoid
    JOIN pg_namespace fn ON fn.oid=p.pronamespace
    WHERE c.relname='users' AND n.nspname='auth' AND NOT t.tgisinternal
    ORDER BY t.tgname
  `) as {tgname:string; fn_name:string; fn_schema:string; tgenabled:string}[];

  for (const r of trig) {
    const ok = r.tgenabled === 'O';
    console.log(`  ${r.tgname}: ${r.fn_schema}.${r.fn_name}() → ${ok ? 'ENABLED ✅' : `disabled(${r.tgenabled}) ❌`}`);
  }
  const ours = trig.find(r => r.tgname === 'on_auth_user_created');
  if (!ours) { console.error('❌ on_auth_user_created not found'); process.exit(1); }
  if (ours.tgenabled !== 'O') { console.error(`❌ enabled=${ours.tgenabled}`); process.exit(1); }
  if (ours.fn_name !== 'handle_new_user') { console.error(`❌ fn_name=${ours.fn_name}`); process.exit(1); }
  console.log('→ trigger ✅ enabled, references public.handle_new_user()\n');

  // 2. pg_get_functiondef
  console.log('=== pg_get_functiondef search_path ===');
  const def = await rq(`
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='handle_new_user'
  `) as {def:string}[];
  if (!def.length) { console.error('❌ handle_new_user not found'); process.exit(1); }
  const funcdef = def[0]!.def;
  const spLine = funcdef.match(/SET search_path[^\n]*/i)?.[0] ?? '(none)';
  console.log(`  search_path line: "${spLine}"`);
  const emptyOk = /SET search_path\s+(TO|=)\s+''/i.test(funcdef);
  console.log(`  search_path='' : ${emptyOk ? '✅' : '❌'}`);
  if (!emptyOk) { console.error('❌ search_path not empty'); process.exit(1); }
  console.log('');

  // 3. 行数
  console.log('=== auth.users / profiles 行数 ===');
  const cnt = await rq(`
    SELECT
      (SELECT COUNT(*)::int FROM auth.users WHERE deleted_at IS NULL) AS auth_users,
      (SELECT COUNT(*)::int FROM public.profiles) AS profiles,
      (SELECT COUNT(*)::int FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE p.id IS NULL AND u.deleted_at IS NULL) AS missing,
      (SELECT COUNT(*)::int FROM public.profiles p LEFT JOIN auth.users u ON u.id=p.id WHERE u.id IS NULL) AS orphan
  `) as {auth_users:number; profiles:number; missing:number; orphan:number}[];
  const c = cnt[0]!;
  console.log(`  auth.users = ${c.auth_users} ${c.auth_users===17?'✅':'⚠️'}`);
  console.log(`  profiles   = ${c.profiles}   ${c.profiles===17?'✅':'⚠️'}`);
  console.log(`  missing    = ${c.missing}     ${c.missing===0?'✅':'❌'}`);
  console.log(`  orphan     = ${c.orphan}      ${c.orphan===0?'✅':'❌'}`);
  console.log('');

  // 4. profiles 保護列
  console.log('=== profiles保護列 ===');
  const rows = await rq(`
    SELECT plan, subscription_status, is_admin, is_internal_test_account, internal_plan_override, lang
    FROM public.profiles ORDER BY created_at LIMIT 20
  `) as {plan:string; subscription_status:string; is_admin:boolean; is_internal_test_account:boolean; internal_plan_override:string|null; lang:string}[];
  console.log(`  rows: ${rows.length}`);
  console.log(`  is_admin=true: ${rows.filter(r=>r.is_admin).length}件`);
  console.log(`  is_internal_test_account=true: ${rows.filter(r=>r.is_internal_test_account).length}件`);
  console.log(`  plan=pro: ${rows.filter(r=>r.plan==='pro').length}件`);
  console.log('');

  // 5. lang DEFAULT
  console.log('=== profiles.lang DEFAULT ===');
  const langDef = await rq(`
    SELECT column_default FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='lang'
  `) as {column_default:string}[];
  const ld = langDef[0]?.column_default ?? 'N/A';
  console.log(`  column_default: ${ld}`);
  const isJa = String(ld).includes('ja');
  console.log(`  lang DEFAULT = ja: ${isJa ? '✅ (現行schemaのDEFAULT値と一致するため採用)' : '⚠️'}`);

  console.log('\n=== 全検証完了 ✅ ===');
}

main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1); });
