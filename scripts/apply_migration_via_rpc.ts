// apply_migration_via_rpc.ts
// Supabase Management API または service_role 経由でSQL migrationを適用
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://farieecfyajbtmjxelop.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PROJECT_REF = 'farieecfyajbtmjxelop';

const MIGRATION_FILE = path.resolve(
  __dirname,
  '../supabase/migrations/20260807213000_fix_arena_rpc_regression.sql'
);

async function main() {
  console.log('=== Migration適用（Management API経由）===');
  
  const sql = fs.readFileSync(MIGRATION_FILE, 'utf-8');
  console.log(`SQL長さ: ${sql.length} bytes`);

  // Supabase Management API: POST /v1/projects/{ref}/database/query
  // Authorization: Bearer <service_role or management token>
  const mgmtUrl = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
  
  const resp = await fetch(mgmtUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  console.log(`Management API status: ${resp.status}`);
  const body = await resp.text();
  console.log('Response:', body.substring(0, 500));

  if (resp.ok) {
    console.log('✓ Migration適用成功');
  } else {
    console.log('Management API失敗。service_role経由の直接RPC実行を試みます...');
    
    // Postgrest経由でSQL実行を試みる（custom functionが必要）
    // service_roleは直接SQLを実行できないが、pg_execute_sqlがあれば可能
    const rpcResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pg_execute_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({ sql_text: sql }),
    });
    console.log(`RPC status: ${rpcResp.status}`);
    const rpcBody = await rpcResp.text();
    console.log('RPC Response:', rpcBody.substring(0, 500));
  }
}

main().catch(console.error);
