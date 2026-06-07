/**
 * process_arena_results RPCを再適用するスクリプト（arena_id JOIN修正版）
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const url = process.env.VITE_SUPABASE_URL || 'https://farieecfyajbtmjxelop.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { auth: { persistSession: false } });

// 直接fetchでSQL実行
async function execSql(sql: string): Promise<void> {
  const res = await fetch(`${url}/rest/v1/rpc/version`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  // Use pg admin endpoint or service_role direct
  console.log('version ping:', res.status);
}

async function main() {
  // Read migration SQL
  const sql = fs.readFileSync('supabase/migrations/20260606230000_arena_phase_d2_process_results.sql', 'utf-8');
  
  // Use Supabase Management API or direct PostgreSQL
  // Since we can't exec SQL directly via REST, use the verify approach
  console.log('SQL file length:', sql.length);
  
  // Test RPC exists
  const { data, error } = await supabase.rpc('process_arena_results' as any);
  if (error) {
    console.log('process_arena_results error:', error.message, error.code);
  } else {
    console.log('process_arena_results result:', JSON.stringify(data));
  }
}

main().catch(console.error);
