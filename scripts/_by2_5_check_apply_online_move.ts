// BY-2.5: apply_online_move 実DB定義確認スクリプト (read-only)
import { readFileSync } from 'fs';
try {
  const lines = readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/.env', 'utf-8').split('\n');
  for (const line of lines) { const t=line.trim(); if(!t||t.startsWith('#'))continue; const idx=t.indexOf('='); if(idx<0)continue; const k=t.slice(0,idx).trim(); const v=t.slice(idx+1).trim().replace(/^["']|["']$/g,''); if(!process.env[k])process.env[k]=v; }
} catch {}

import { createClient } from '@supabase/supabase-js';
const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  console.log('=== BY-2.5: apply_online_move 実DB確認 ===\n');
  console.log('URL:', url);

  // 1. information_schema.routines (routine_definition)
  console.log('\n--- information_schema.routines ---');
  const { data: r1, error: e1 } = await (sb as any)
    .schema('information_schema')
    .from('routines')
    .select('routine_name, routine_definition, external_language, security_type, data_type, sql_data_access')
    .eq('routine_schema', 'public')
    .eq('routine_name', 'apply_online_move');
  if (e1) console.log('ERROR:', e1.message);
  else console.log(JSON.stringify(r1, null, 2));

  // 2. information_schema.parameters
  console.log('\n--- information_schema.parameters ---');
  const { data: r2, error: e2 } = await (sb as any)
    .schema('information_schema')
    .from('parameters')
    .select('specific_name, ordinal_position, parameter_name, data_type, parameter_mode, parameter_default')
    .eq('specific_schema', 'public')
    .like('specific_name', 'apply_online_move%')
    .order('ordinal_position');
  if (e2) console.log('ERROR:', e2.message);
  else console.log(JSON.stringify(r2, null, 2));

  // 3. Try exec_sql_readonly RPC for pg_get_functiondef
  console.log('\n--- exec_sql_readonly (pg_get_functiondef) ---');
  const { data: r3, error: e3 } = await sb.rpc('exec_sql_readonly' as any, {
    sql: "SELECT pg_get_functiondef(oid) as funcdef FROM pg_proc WHERE proname = 'apply_online_move'"
  });
  if (e3) console.log('exec_sql_readonly ERROR:', e3.message);
  else console.log(JSON.stringify(r3, null, 2));

  // 4. Supabase Management API attempt (no auth token - will likely fail)
  // project ref: farieecfyajbtmjxelop
  console.log('\n--- Supabase Management API (SQL query endpoint) ---');
  try {
    const resp = await fetch('https://api.supabase.com/v1/projects/farieecfyajbtmjxelop/database/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_ACCESS_TOKEN || 'not_set'}`,
      },
      body: JSON.stringify({
        query: "SELECT pg_get_functiondef(oid) as funcdef FROM pg_proc WHERE proname = 'apply_online_move'"
      }),
    });
    const text = await resp.text();
    console.log('Management API status:', resp.status);
    console.log('body:', text.slice(0, 1000));
  } catch(err: any) {
    console.log('Management API error:', err.message);
  }
}

main().catch(console.error);
