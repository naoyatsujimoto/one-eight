// _verify_arena_c1_5.ts — Phase C-1.5 arena_entries.status確認スクリプト

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// .env ロード
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

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false }
});

async function main() {
  console.log('=== Phase C-1.5 arena_entries.status 確認 ===\n');

  // 1. CHECK制約名を確認
  console.log('--- 1. CHECK制約確認 ---');
  const { data: constraints, error: ce } = await supabase.rpc('exec_sql', {
    query: `
      SELECT
        conname AS constraint_name,
        pg_get_constraintdef(oid) AS constraint_def
      FROM pg_constraint
      WHERE conrelid = 'public.arena_entries'::regclass
        AND contype = 'c'
    `
  });
  if (ce) {
    // exec_sql RPCがなければ別途確認
    console.log('exec_sql RPC not available:', ce.message);
    // フォールバック: information_schema
    const { data: d2, error: e2 } = await supabase
      .from('information_schema.check_constraints')
      .select('*')
      .like('constraint_name', '%arena_entries%');
    console.log('info_schema:', d2, e2);
  } else {
    console.log('CHECK constraints:', JSON.stringify(constraints, null, 2));
  }

  // 2. 既存行のstatus集計
  console.log('\n--- 2. 既存行のstatus集計 ---');
  const { data: statusCounts, error: sce } = await supabase
    .rpc('exec_sql', {
      query: `
        SELECT status, COUNT(*) as cnt
        FROM arena_entries
        GROUP BY status
        ORDER BY status
      `
    });
  if (sce) {
    console.log('exec_sql RPC unavailable for status count:', sce.message);
    // service_role から直接SELECT
    const { data: directCount, error: dce } = await supabase
      .from('arena_entries')
      .select('status');
    if (dce) {
      console.log('direct select error:', dce.message);
    } else {
      console.log('all rows status:', directCount);
    }
  } else {
    console.log('status counts:', JSON.stringify(statusCounts, null, 2));
  }

  // 3. withdrawnの行を確認
  console.log('\n--- 3. withdrawn行確認 ---');
  const { data: withdrawn, error: we } = await supabase
    .from('arena_entries')
    .select('id, arena_event_id, user_id, status, created_at')
    .eq('status', 'withdrawn');
  if (we) {
    console.log('error:', we.message);
  } else {
    console.log('withdrawn rows:', withdrawn?.length ?? 0, 'rows');
    if (withdrawn && withdrawn.length > 0) {
      console.log(JSON.stringify(withdrawn, null, 2));
    }
  }

  // 4. pending行を確認
  console.log('\n--- 4. pending行確認 ---');
  const { data: pending, error: pe } = await supabase
    .from('arena_entries')
    .select('id, arena_event_id, user_id, status, created_at')
    .eq('status', 'pending');
  if (pe) {
    console.log('error:', pe.message);
  } else {
    console.log('pending rows:', pending?.length ?? 0, 'rows');
    if (pending && pending.length > 0) {
      console.log(JSON.stringify(pending, null, 2));
    }
  }

  // 5. 全行確認
  console.log('\n--- 5. 全行確認 ---');
  const { data: allRows, error: are } = await supabase
    .from('arena_entries')
    .select('id, status, created_at')
    .order('created_at');
  if (are) {
    console.log('error:', are.message);
  } else {
    console.log('total rows:', allRows?.length ?? 0);
    if (allRows && allRows.length > 0) {
      console.log(JSON.stringify(allRows, null, 2));
    }
  }

  // 6. enter_arena_eventのDEFAULT status確認
  console.log('\n--- 6. enter_arena_event RPC のstatus DEFAULT確認 ---');
  const { data: rpcDef, error: rde } = await supabase.rpc('exec_sql', {
    query: `
      SELECT prosrc
      FROM pg_proc
      WHERE proname = 'enter_arena_event'
      LIMIT 1
    `
  });
  if (rde) {
    console.log('exec_sql not available:', rde.message);
  } else {
    const src = (rpcDef as any)?.[0]?.prosrc ?? '';
    const lines = src.split('\n');
    const statusLines = lines.filter((l: string) => l.includes('status') || l.includes('pending'));
    console.log('enter_arena_event status-related lines:');
    statusLines.forEach((l: string) => console.log(' ', l));
  }

  console.log('\n=== 確認完了 ===');
}

main().catch(console.error);
