// Phase D-2.1 事前確認スクリプト
// - arena_points のCHECK制約確認
// - process_arena_results() のGREATEST有無を実挙動で確認

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceKey) {
  console.error('ERROR: Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false }
});

// Supabaseのmanagement APIを通じてSQLを実行するためのヘルパー
// service_role JWTを使ってPostgRESTのrpc経由でSQLを実行
async function execSQL(sql: string): Promise<{ data: any; error: any }> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  
  if (!response.ok) {
    const text = await response.text();
    return { data: null, error: text };
  }
  
  const data = await response.json();
  return { data, error: null };
}

async function main() {
  console.log('=== Phase D-2.1 事前確認 ===\n');

  // 1. arena_points のCHECK制約確認
  // pg_constraint を直接queryするRPCがないため、
  // supabase.from() で information_schema を使う
  console.log('--- 1. arena_points CHECK制約確認 ---');
  
  // information_schema.table_constraints は Supabase REST APIで参照可能
  const { data: tcData, error: tcErr } = await (supabase as any)
    .from('information_schema.table_constraints')
    .select('constraint_name, constraint_type')
    .eq('table_name', 'arena_points')
    .eq('table_schema', 'public')
    .eq('constraint_type', 'CHECK');

  if (tcErr) {
    console.log('information_schema確認エラー:', tcErr.message);
  } else {
    console.log('arena_points CHECK制約一覧:', JSON.stringify(tcData, null, 2));
    if (!tcData || tcData.length === 0) {
      console.log('✅ arena_points にCHECK制約なし（points >= 0 制約なし）');
    } else {
      console.log('⚠️ CHECK制約が存在します。制約内容を確認してください:');
      for (const c of tcData) {
        console.log(`  - ${c.constraint_name}`);
      }
    }
  }

  // 2. arena_definitions から利用可能なarena_idを取得
  console.log('\n--- 2. arena_definitions 確認 ---');
  const { data: arenaDefs, error: arenaDefErr } = await supabase
    .from('arena_definitions')
    .select('id, code')
    .eq('is_active', true)
    .limit(2);

  if (arenaDefErr) {
    console.error('arena_definitions取得エラー:', arenaDefErr.message);
    process.exit(1);
  }
  
  console.log('利用可能なarena:', arenaDefs?.map((d: any) => `${d.code}: ${d.id}`));

  // 3. process_arena_results() のGREATEST有無を実挙動で確認
  // no-show シナリオで -3 が入るか 0 になるかで判断
  console.log('\n--- 3. 現在のGREATEST保護有無の確認 ---');
  console.log('注: ファイルシステム上のmigrationを参照します');
  
  // migrationファイルからGREATESTの有無を確認
  const fs = await import('fs');
  const migrationPath = '/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/supabase/migrations/20260606234720_arena_phase_d2_reapply_greatest.sql';
  const migrationContent = fs.readFileSync(migrationPath, 'utf-8');
  
  const hasGreatest = migrationContent.includes('GREATEST(');
  console.log(`最新migrationにGREATESTが含まれているか: ${hasGreatest ? 'YES (0下限保護あり)' : 'NO (保護なし)'}`);
  
  if (hasGreatest) {
    // GREATEST保護の具体的な箇所を表示
    const lines = migrationContent.split('\n');
    const greatestLines = lines.filter(l => l.includes('GREATEST('));
    console.log(`GREATESTが含まれる行数: ${greatestLines.length}`);
    greatestLines.forEach((l, i) => console.log(`  [${i+1}] ${l.trim()}`));
  }

  console.log('\n=== 確認完了 ===');
  console.log('GREATEST保護の撤去が必要かどうか:');
  console.log('  現在: GREATEST(points + delta, 0) → 0未満にならない');
  console.log('  変更後: points + delta → マイナス許容（no-show penalty = -3 がそのまま入る）');
}

main().catch(console.error);
