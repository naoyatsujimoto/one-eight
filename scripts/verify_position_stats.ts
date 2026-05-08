import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const { count } = await sb.from('position_stats').select('*', { count: 'exact', head: true });
console.log('position_stats 総行数:', count);

const { data } = await sb.from('position_stats')
  .select('mode_group, wins_white, wins_black, draws, total')
  .eq('mode_group', 'all')
  .limit(3);
console.log('サンプル3件:', JSON.stringify(data, null, 2));
