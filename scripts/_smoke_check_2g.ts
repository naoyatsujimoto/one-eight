/**
 * 2G Final Smoke Check — READ-ONLY
 * SELECT / pg_get_functiondef / information_schema only. No DML/DDL/RPC.
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

async function sql(query: string): Promise<any[]> {
  const { data, error } = await sb.rpc('exec_sql_readonly', { query }).select();
  if (error) throw new Error(`RPC error: ${error.message}`);
  return data ?? [];
}

// Use REST API pg query via service role
async function pgq(q: string): Promise<any> {
  const res = await fetch(`${url}/rest/v1/rpc/exec_sql_readonly`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({ query: q }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

// Direct postgres via supabase-js rpc using pg_query workaround
// Actually let's use a different approach - query via supabase-js with .from() or raw SQL via pg

// Use the supabase REST API to execute SQL via a service role
async function rawSQL(q: string): Promise<{ data: any[]; error: any }> {
  // Try using supabase pg functions endpoint
  const res = await fetch(`${url}/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({ query: q }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { data: [], error: `HTTP ${res.status}: ${text}` };
  }
  const json = await res.json();
  return { data: json, error: null };
}

// Use postgres.js or node-postgres via environment
// Let's check if we can use the DATABASE_URL or build a connection string
import { execSync } from 'child_process';

function psql(q: string): string {
  // Use supabase CLI to run SQL
  try {
    // Try to get connection string from supabase
    const out = execSync(
      `cd /Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp && npx supabase db execute --linked -- "${q.replace(/"/g, '\\"')}" 2>&1`,
      { encoding: 'utf-8', timeout: 30000 }
    );
    return out;
  } catch (e: any) {
    return e.stdout || e.message || String(e);
  }
}

// Actually use npx supabase db execute with a file
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import * as os from 'os';

function psqlFile(q: string): string {
  const tmpFile = join(os.tmpdir(), `smoke_${Date.now()}.sql`);
  writeFileSync(tmpFile, q, 'utf-8');
  try {
    const out = execSync(
      `cd /Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp && npx supabase db execute --linked --file "${tmpFile}" 2>&1`,
      { encoding: 'utf-8', timeout: 30000 }
    );
    return out;
  } catch (e: any) {
    return (e.stdout ?? '') + (e.stderr ?? '') + (e.message ?? '');
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

// Section separator
function section(name: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${name}]`);
  console.log('='.repeat(60));
}

// ── CHECK 2: Payout RPC definitions ──────────────────────────
section('CHECK 2: Payout RPC hotfix');
const payoutSQL = `
SELECT proname, pg_get_functiondef(oid) AS def
FROM pg_proc
WHERE proname IN ('admin_mark_payout_paid','admin_mark_payout_failed','admin_cancel_payout','admin_retry_payout')
  AND pronamespace = 'public'::regnamespace
ORDER BY proname;
`;
console.log(psqlFile(payoutSQL));

// ── CHECK 3: arena_events duplicate ──────────────────────────
section('CHECK 3: arena_events duplicate');
const arenaDupSQL = `
SELECT arena_id, scheduled_at, count(*) AS count
FROM arena_events
GROUP BY arena_id, scheduled_at
HAVING count(*) > 1
ORDER BY scheduled_at DESC;
`;
console.log(psqlFile(arenaDupSQL));

section('CHECK 3: arena_events UNIQUE index');
const arenaIdxSQL = `
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'arena_events'
  AND indexdef ILIKE '%UNIQUE%';
`;
console.log(psqlFile(arenaIdxSQL));

// ── CHECK 4: ensure_next_arena_events ────────────────────────
section('CHECK 4: ensure_next_arena_events function def');
const ensureSQL = `SELECT pg_get_functiondef('ensure_next_arena_events'::regproc);`;
console.log(psqlFile(ensureSQL));

// ── CHECK 5: process_arena_results ───────────────────────────
section('CHECK 5: process_arena_results function def');
const processSQL = `SELECT pg_get_functiondef('process_arena_results'::regproc);`;
console.log(psqlFile(processSQL));

// ── CHECK 6: Arena unprocessed / master dupe ─────────────────
section('CHECK 6: Arena unprocessed official matches');
const unprocessedSQL = `
SELECT
  am.id AS arena_match_id,
  am.arena_event_id,
  am.status AS arena_match_status,
  am.processed_at,
  om.id AS official_match_id,
  om.status AS official_match_status,
  om.end_reason,
  om.source_kind,
  om.finished_at,
  om.ends_at
FROM arena_matches am
LEFT JOIN official_matches om ON om.id = am.official_match_id
WHERE am.processed_at IS NULL
  AND om.source_kind = 'arena'
  AND om.status IN ('completed','no_contest','cancelled','forfeited')
ORDER BY COALESCE(om.finished_at, om.ends_at) DESC;
`;
console.log(psqlFile(unprocessedSQL));

section('CHECK 6: active master dupe');
const masterDupeSQL = `
SELECT arena_id, season, count(*) AS active_count
FROM arena_master_history
WHERE status = 'official' AND dethroned_at IS NULL
GROUP BY arena_id, season
HAVING count(*) > 1;
`;
console.log(psqlFile(masterDupeSQL));

// ── CHECK 7: Prize/Award integrity ───────────────────────────
section('CHECK 7: prize_awards duplicate');
const prizeAwardDupSQL = `
SELECT
  source_arena_event_id,
  source_arena_match_id,
  recipient_user_id,
  count(*) AS dup_count
FROM prize_awards
WHERE source_kind = 'arena_master'
GROUP BY source_arena_event_id, source_arena_match_id, recipient_user_id
HAVING count(*) > 1;
`;
console.log(psqlFile(prizeAwardDupSQL));

section('CHECK 7: prize_awards status distribution');
const prizeStatusSQL = `
SELECT source_kind, status, count(*) AS count
FROM prize_awards
GROUP BY source_kind, status
ORDER BY source_kind, status;
`;
console.log(psqlFile(prizeStatusSQL));

// ── CHECK 9: Security ────────────────────────────────────────
section('CHECK 9: RLS disabled tables');
const rlsSQL = `
SELECT n.nspname AS schema, c.relname AS table_name, c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname = 'public'
  AND NOT c.relrowsecurity
ORDER BY c.relname;
`;
console.log(psqlFile(rlsSQL));

section('CHECK 9: anon-executable SECURITY DEFINER functions');
const anonExecSQL = `
SELECT n.nspname AS schema, p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef = true
  AND n.nspname = 'public'
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY p.proname, args;
`;
console.log(psqlFile(anonExecSQL));

section('CHECK 9: SECURITY DEFINER missing search_path');
const spSQL = `
SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE prosecdef = true
  AND pronamespace = 'public'::regnamespace
  AND (proconfig IS NULL OR NOT (proconfig::text LIKE '%search_path%'))
ORDER BY proname, args;
`;
console.log(psqlFile(spSQL));

console.log('\n\n=== DONE ===');
