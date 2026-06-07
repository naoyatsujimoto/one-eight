import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '');

const { count: c1 } = await supabase.from('sim_match_logs').select('*', {count:'exact',head:true}).eq('sim_batch_id', 'easy_20260508_008');
console.log('batch_008 count:', c1);

const { count: total } = await supabase.from('sim_match_logs').select('*', {count:'exact',head:true});
console.log('total sim_match_logs:', total);

const { data: batchData } = await supabase.from('sim_match_logs').select('sim_batch_id').limit(20000);
if (batchData) {
  const batchCounts: Record<string, number> = {};
  for (const row of batchData) {
    batchCounts[row.sim_batch_id] = (batchCounts[row.sim_batch_id] ?? 0) + 1;
  }
  console.log('batch counts:', JSON.stringify(batchCounts, null, 2));
}
