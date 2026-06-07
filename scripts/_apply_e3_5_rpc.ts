/**
 * Phase E-3.5 — get_arena_detail RPC直接適用スクリプト
 * Supabase Management API /pg/query でSQLを実行する
 */
import { readFileSync } from 'fs';
import * as path from 'path';

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

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const projectRef = 'farieecfyajbtmjxelop';

const sqlPath = path.resolve('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/supabase/migrations/20260607150000_arena_phase_e3_5_rpc_extend.sql');
const sql = readFileSync(sqlPath, 'utf-8');

async function main() {
  console.log('E-3.5 RPC適用開始 (Management API /pg/query)...');
  console.log('SQL length:', sql.length);

  // Supabase Management API: POST /v1/projects/{ref}/database/query
  const url = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Response:', text.slice(0, 500));

  if (!res.ok) {
    // フォールバック: supabase.rpc 経由でなく、exec_sql があれば使う
    console.log('\nManagement API失敗。直接RPC実行を試みます...');
    process.exit(1);
  }

  console.log('✅ SQL適用成功');
}

main();
