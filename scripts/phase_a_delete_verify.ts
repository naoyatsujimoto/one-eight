// Phase A Step A-3: 削除後確認スクリプト
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://farieecfyajbtmjxelop.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { auth: { persistSession: false } });

const TARGET_IDS = [
  '29734867-3df2-43d2-ab41-c0d67dc4fc9f',
  '286d8590-c1b6-45d6-bc97-a067bd2614f2'
];

async function main() {
  console.log('=== Phase A Step A-3: 削除後確認 ===\n');

  // 1. arena_points 全体件数（削除後）
  const { count: totalCount } = await supabase
    .from('arena_points')
    .select('*', { count: 'exact', head: true });
  console.log(`--- 1. arena_points 全体件数（削除後）: ${totalCount} ---`);
  console.log(`   期待値: 4 (6 - 2) → ${totalCount === 4 ? '✓ OK' : '✗ NG'}`);

  // 2. season='default'の件数
  const { count: defaultCount } = await supabase
    .from('arena_points')
    .select('*', { count: 'exact', head: true })
    .eq('season', 'default');
  console.log(`\n--- 2. season='default'の件数（削除後）: ${defaultCount} ---`);
  console.log(`   期待値: 4 (変化なし) → ${defaultCount === 4 ? '✓ OK' : '✗ NG'}`);

  // 3. season='test_d2_1_verify'の件数
  const { count: testCount } = await supabase
    .from('arena_points')
    .select('*', { count: 'exact', head: true })
    .eq('season', 'test_d2_1_verify');
  console.log(`\n--- 3. season='test_d2_1_verify'の件数（削除後）: ${testCount} ---`);
  console.log(`   期待値: 0 → ${testCount === 0 ? '✓ OK' : '✗ NG'}`);

  // 4. 対象2行が存在しないこと
  const { data: remaining, count: remainCount } = await supabase
    .from('arena_points')
    .select('id', { count: 'exact' })
    .in('id', TARGET_IDS);
  console.log(`\n--- 4. 対象2行の存在確認（削除後）: ${remainCount} 件 ---`);
  console.log(`   期待値: 0 → ${remainCount === 0 ? '✓ OK' : '✗ NG'}`);

  // 5. 関連テーブルの件数（変化なしであること）
  const { count: matchHistCount } = await supabase
    .from('arena_match_history')
    .select('*', { count: 'exact', head: true });
  console.log(`\n--- 5a. arena_match_history件数（削除後）: ${matchHistCount} ---`);
  console.log(`   期待値: 9 (変化なし) → ${matchHistCount === 9 ? '✓ OK' : '✗ NG'}`);

  const { count: masterHistCount } = await supabase
    .from('arena_master_history')
    .select('*', { count: 'exact', head: true });
  console.log(`--- 5b. arena_master_history件数（削除後）: ${masterHistCount} ---`);
  console.log(`   期待値: 7 (変化なし) → ${masterHistCount === 7 ? '✓ OK' : '✗ NG'}`);

  const { count: eventsCount } = await supabase
    .from('arena_events')
    .select('*', { count: 'exact', head: true });
  console.log(`--- 5c. arena_events件数（削除後）: ${eventsCount} ---`);
  console.log(`   期待値: 29 (変化なし) → ${eventsCount === 29 ? '✓ OK' : '✗ NG'}`);

  console.log('\n=== Step A-3 完了 ===');
}

main().catch(console.error);
