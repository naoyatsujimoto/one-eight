import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL ?? '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const sb = createClient(url, key);

const { data, error } = await sb.from('position_stats').select('canonical_hash, mode_group, total').like('canonical_hash', '__test_%');
if (error) { console.error('fetch error:', error.message); process.exit(1); }

console.log('test data rows:', data?.length ?? 0);
if (data && data.length > 0) {
  console.log(data);
  const { error: delErr } = await sb.from('position_stats').delete().like('canonical_hash', '__test_%');
  if (delErr) { console.error('delete error:', delErr.message); process.exit(1); }
  console.log('deleted.');
} else {
  console.log('テストデータなし。削除不要。');
}
