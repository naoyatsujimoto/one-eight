/**
 * _audit_profiles_trigger.ts — READ-ONLY
 * Phase D: profiles行作成triggerの存在確認 + auth.users vs profiles 欠落監査
 *
 * 実行: npx tsx scripts/_audit_profiles_trigger.ts
 */
import { readFileSync } from 'fs';
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
} catch {}

import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) { console.error('env missing'); process.exit(1); }

const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  console.log('=== Phase D: profiles trigger & row audit ===\n');

  // 1. trigger存在確認
  const { data: triggers, error: tErr } = await sb
    .from('information_schema.triggers')
    .select('trigger_name, event_object_schema, event_object_table, event_manipulation, action_timing')
    .eq('trigger_schema', 'public')
    .order('trigger_name');

  if (tErr) {
    // information_schema.triggersはRLS対象外のはずだが念のため
    console.log('triggers query error (trying pg_trigger):', tErr.message);
  } else {
    console.log('=== Triggers in public schema ===');
    console.log(JSON.stringify(triggers, null, 2));
  }

  // auth.triggers（handle_new_user系）
  const { data: authTrig, error: atErr } = await sb.rpc('exec_sql_readonly', {
    query: `
      SELECT t.tgname, c.relname as table_name,
             p.proname as function_name,
             CASE t.tgtype & 1 WHEN 1 THEN 'ROW' ELSE 'STATEMENT' END as row_or_statement,
             CASE t.tgtype & 66 WHEN 2 THEN 'BEFORE' WHEN 64 THEN 'INSTEAD OF' ELSE 'AFTER' END as timing
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('auth', 'public')
        AND c.relname = 'users'
        AND NOT t.tgisinternal
      ORDER BY t.tgname;
    `
  });
  if (atErr) {
    console.log('auth.users trigger query error:', atErr.message);
  } else {
    console.log('\n=== Triggers on auth.users ===');
    console.log(JSON.stringify(authTrig, null, 2));
  }

  // 2. profiles行欠落監査
  // auth.users に存在するが profiles に行がない ユーザーを検索
  const { data: missing, error: mErr } = await sb.rpc('exec_sql_readonly', {
    query: `
      SELECT
        u.id,
        u.email,
        u.created_at,
        u.confirmed_at,
        u.last_sign_in_at
      FROM auth.users u
      LEFT JOIN public.profiles p ON p.id = u.id
      WHERE p.id IS NULL
        AND u.deleted_at IS NULL
      ORDER BY u.created_at DESC
      LIMIT 50;
    `
  });
  if (mErr) {
    console.log('missing profiles query error:', mErr.message);
  } else {
    const rows = missing as { id: string; email: string; created_at: string }[];
    console.log(`\n=== Auth users WITHOUT profiles row: ${rows.length} 件 ===`);
    if (rows.length === 0) {
      console.log('欠落なし ✅');
    } else {
      // emailは秘密情報のためIDと日付のみ表示
      for (const r of rows) {
        console.log(`  id=${r.id.slice(0, 8)}… created=${r.created_at}`);
      }
      console.log(`\n合計 ${rows.length} 件の欠落ユーザーが存在します。`);
    }
  }

  // 3. profiles総数 vs auth.users総数
  const { data: counts, error: cErr } = await sb.rpc('exec_sql_readonly', {
    query: `
      SELECT
        (SELECT COUNT(*) FROM auth.users WHERE deleted_at IS NULL) AS auth_users_count,
        (SELECT COUNT(*) FROM public.profiles) AS profiles_count;
    `
  });
  if (cErr) {
    console.log('count query error:', cErr.message);
  } else {
    console.log('\n=== User count summary ===');
    console.log(JSON.stringify(counts, null, 2));
  }

  console.log('\n=== 監査完了 ===');
}

main().catch(console.error);
