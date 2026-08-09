// Phase A Step A-2: 削除実行スクリプト
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://farieecfyajbtmjxelop.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { auth: { persistSession: false } });

const TARGET_IDS = [
  '29734867-3df2-43d2-ab41-c0d67dc4fc9f',
  '286d8590-c1b6-45d6-bc97-a067bd2614f2'
];

async function main() {
  console.log('=== Phase A Step A-2: 削除実行 ===\n');

  const { data, error } = await supabase
    .from('arena_points')
    .delete()
    .in('id', TARGET_IDS)
    .select('id, arena_id, user_id, season');

  if (error) {
    console.error('削除エラー:', error);
    process.exit(1);
  }

  console.log('削除されたレコード:');
  console.log(JSON.stringify(data, null, 2));
  console.log(`\n削除件数: ${data?.length ?? 0}`);

  console.log('\n=== Step A-2 完了 ===');
}

main().catch(console.error);
