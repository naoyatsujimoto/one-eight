/**
 * _check_d2_1_constraints.ts
 * Phase D-2.1 事前確認スクリプト
 *
 * 確認内容:
 * 1. arena_points のCHECK制約（points >= 0 のような制約がないか）
 * 2. process_arena_results() の現在のDB定義にGREATESTが含まれるか
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://farieecfyajbtmjxelop.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  console.log('=== Phase D-2.1 事前確認 ===\n');

  // 1. arena_points のCHECK制約確認
  // information_schema.check_constraints を使用
  console.log('--- 1. arena_points CHECK制約確認 ---');
  
  const { data: checkConstraints, error: ccErr } = await supabase
    .from('information_schema.check_constraints' as any)
    .select('constraint_name, check_clause')
    .eq('constraint_schema', 'public');

  if (ccErr) {
    console.log('information_schema.check_constraints 直接参照エラー:', ccErr.message);
    console.log('別の方法で確認します...');
  } else {
    // arena_pointsに関連するものを抽出
    const arenaPointsConstraints = (checkConstraints || []).filter((c: any) => 
      c.constraint_name && c.constraint_name.toLowerCase().includes('arena_point')
    );
    console.log('arena_points関連のCHECK制約:', JSON.stringify(arenaPointsConstraints, null, 2));
  }

  // 2. pg_constraint を Supabase REST API経由で確認
  // supabase.from('pg_catalog.pg_constraint') は通常使えないため、
  // 別のアプローチ：verify_function RPCが存在しなければ直接テスト
  console.log('\n--- 2. process_arena_results() のDB上の定義確認 ---');
  
  // Supabase REST APIでpg_procを確認する試み
  const response = await fetch(`${url}/rest/v1/rpc/pg_get_function_def`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({ func_name: 'process_arena_results' }),
  });
  
  if (response.ok) {
    const data = await response.json();
    console.log('pg_get_function_def結果:', data);
  } else {
    console.log('pg_get_function_def RPC不存在（想定内）');
  }

  // 3. 実際のpoints挙動を確認するための小テスト
  // arena_pointsに直接insertを試みてマイナス値が入るか確認
  console.log('\n--- 3. arena_points マイナス値INSERT可否確認 ---');
  
  // 既存arena_definitionのIDを取得
  const { data: arenaDef, error: adErr } = await supabase
    .from('arena_definitions')
    .select('id, code')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (adErr || !arenaDef) {
    console.error('arena_definitions取得エラー:', adErr);
    process.exit(1);
  }
  
  console.log('テスト用arena:', arenaDef.code, arenaDef.id);

  // テスト用ユーザー（既存ユーザー）
  const TEST_USER = '34f99a7e-72ef-40be-8c7f-4d4900dce8e7';
  const TEST_SEASON = 'test_d2_1_constraint_check';
  
  // まずマイナス値でINSERTを試みる
  const { data: insertData, error: insertErr } = await supabase
    .from('arena_points')
    .insert({
      arena_id: arenaDef.id,
      user_id: TEST_USER,
      season: TEST_SEASON,
      points: -1,  // マイナス値
      win_count: 0,
      loss_count: 0,
      draw_count: 0,
    })
    .select('id, points')
    .single();

  if (insertErr) {
    if (insertErr.message.includes('violates check constraint') || 
        insertErr.code === '23514') {
      console.log('⚠️ CHECK制約によりマイナス値INSERT拒否:', insertErr.message);
      console.log('⚠️ arena_pointsにpoints >= 0 制約が存在します！');
      console.log('⚠️ この場合、実装を進めずに報告を返す必要があります。');
    } else {
      console.log('INSERT エラー（別の原因）:', insertErr.message);
    }
  } else {
    console.log('✅ マイナス値(-1)のINSERT成功 → CHECK制約なし');
    console.log('  挿入されたpoints:', insertData?.points);
    
    // テストデータ削除
    const { error: delErr } = await supabase
      .from('arena_points')
      .delete()
      .eq('id', insertData!.id);
    
    if (delErr) {
      console.log('⚠️ テストデータ削除失敗 ID:', insertData!.id, delErr.message);
    } else {
      console.log('✅ テストデータ削除完了');
    }
  }

  console.log('\n=== 確認完了 ===');
}

main().catch(console.error);
