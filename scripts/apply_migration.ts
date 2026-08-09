// apply_migration.ts — Management API経由でSQLを直接実行
// supabase db pushの代替
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const url = process.env.VITE_SUPABASE_URL || 'https://farieecfyajbtmjxelop.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(url, key, { auth: { persistSession: false } });

const MIGRATION_FILE = path.resolve(
  __dirname,
  '../supabase/migrations/20260807213000_fix_arena_rpc_regression.sql'
);

async function main() {
  console.log('=== Migration適用開始 ===');
  console.log(`ファイル: ${MIGRATION_FILE}`);

  const sql = fs.readFileSync(MIGRATION_FILE, 'utf-8');
  console.log(`SQL長さ: ${sql.length} bytes`);

  // Supabase REST APIには直接SQL実行エンドポイントがないため
  // rpcとしてSQLをPostgRESTへ直接送信する代わりに
  // service_role keyでpostgrest経由でsql実行
  // /rest/v1/rpc/ には直接SQLを投げられないが、
  // pg_net や pgcrypto など拡張があれば可能
  // 代わりに: supabase-js の .rpc() で既存のexec_sql関数があるか試す

  // まずexec_sql関数があるか確認
  const { data: testData, error: testError } = await supabase
    .rpc('exec_sql', { sql: 'SELECT 1' });
  
  if (testError) {
    console.log('exec_sql関数なし。別の方法を試みます...');
    console.log('エラー:', testError.message);
    
    // Management API の /query エンドポイントを試す
    // POST https://{project_ref}.supabase.co/rest/v1/query は存在しない
    // Supabase Management API は https://api.supabase.com を使う
    console.log('\n→ SQLファイルの内容を標準出力して終了します。');
    console.log('→ 手動での適用が必要です。');
    process.exit(1);
  }

  console.log('exec_sql関数あり。実行します...');
  const { data, error } = await supabase.rpc('exec_sql', { sql });
  if (error) {
    console.error('SQL実行エラー:', error);
    process.exit(1);
  }
  console.log('Migration適用完了:', data);
}

main().catch(console.error);
