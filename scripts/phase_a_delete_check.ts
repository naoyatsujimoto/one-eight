// Phase A Step A-1: 削除前確認スクリプト
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://farieecfyajbtmjxelop.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { auth: { persistSession: false } });

const TARGET_IDS = [
  '29734867-3df2-43d2-ab41-c0d67dc4fc9f',
  '286d8590-c1b6-45d6-bc97-a067bd2614f2'
];

async function main() {
  console.log('=== Phase A Step A-1: 削除前確認 ===\n');

  // 1. 対象2行の全カラム
  console.log('--- 1. 対象2行の全カラム ---');
  const { data: targetRows, error: targetError } = await supabase
    .from('arena_points')
    .select('id, arena_id, user_id, season, points, win_count, loss_count, draw_count, created_at, updated_at')
    .in('id', TARGET_IDS);

  if (targetError) {
    console.error('Error fetching target rows:', targetError);
  } else {
    console.log(JSON.stringify(targetRows, null, 2));
  }

  // 2. 各 user_id の display_name
  console.log('\n--- 2. 各 user_id の display_name ---');
  if (targetRows && targetRows.length > 0) {
    const userIds = targetRows.map((r: any) => r.user_id).filter(Boolean);
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', userIds);
    if (profileError) {
      console.error('Error fetching profiles:', profileError);
    } else {
      console.log(JSON.stringify(profiles, null, 2));
    }
  }

  // 3. arena_points 全体件数（削除前）
  const { count: totalCount } = await supabase
    .from('arena_points')
    .select('*', { count: 'exact', head: true });
  console.log(`\n--- 3. arena_points 全体件数（削除前）: ${totalCount} ---`);

  // 4. season='default'の件数
  const { count: defaultCount } = await supabase
    .from('arena_points')
    .select('*', { count: 'exact', head: true })
    .eq('season', 'default');
  console.log(`\n--- 4. season='default'の件数（削除前）: ${defaultCount} ---`);

  // 5. season='test_d2_1_verify'の件数
  const { count: testCount } = await supabase
    .from('arena_points')
    .select('*', { count: 'exact', head: true })
    .eq('season', 'test_d2_1_verify');
  console.log(`\n--- 5. season='test_d2_1_verify'の件数（削除前）: ${testCount} ---`);

  // 6. 関連テーブルの件数
  const { count: matchHistCount } = await supabase
    .from('arena_match_history')
    .select('*', { count: 'exact', head: true });
  console.log(`\n--- 6a. arena_match_history件数（削除前）: ${matchHistCount} ---`);

  const { count: masterHistCount } = await supabase
    .from('arena_master_history')
    .select('*', { count: 'exact', head: true });
  console.log(`--- 6b. arena_master_history件数（削除前）: ${masterHistCount} ---`);

  const { count: eventsCount } = await supabase
    .from('arena_events')
    .select('*', { count: 'exact', head: true });
  console.log(`--- 6c. arena_events件数（削除前）: ${eventsCount} ---`);

  console.log('\n=== Step A-1 完了 ===');
}

main().catch(console.error);
