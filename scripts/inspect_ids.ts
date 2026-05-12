import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// sim_medium_pattern_stats のサンプル10件
const { data, error } = await s.from('sim_medium_pattern_stats').select('medium_pattern_id, total').eq('sim_policy','easy_vs_easy').limit(10);
console.log('medium_pattern_stats samples:', JSON.stringify(data?.map((r: any) => r.medium_pattern_id), null, 2));

// sim_position_stats のサンプル
const { data: d2 } = await s.from('sim_position_stats').select('canonical_hash, total').eq('sim_policy','easy_vs_easy').limit(5);
console.log('position_stats samples:', JSON.stringify(d2?.map((r: any) => r.canonical_hash), null, 2));

// sim_match_logs の full_record サンプル（1件）
const { data: d3 } = await s.from('sim_match_logs').select('full_record').eq('sim_batch_id','easy_20260511_009').limit(1);
const fr = (d3 as any)?.[0]?.full_record;
console.log('full_record[0] keys:', fr ? Object.keys(fr[0]).join(', ') : 'none');
console.log('full_record first 2:', JSON.stringify(fr?.slice(0,2), null, 2));
