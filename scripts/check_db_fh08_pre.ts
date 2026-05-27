import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('ERROR: env missing'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  const { count: fh07count } = await supabase
    .from('sim_match_logs')
    .select('*', { count: 'exact', head: true })
    .eq('sim_batch_id', 'fahard_20260519_007');
  
  const { count: fhTotal } = await supabase
    .from('sim_match_logs')
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', 'fast_hard_vs_fast_hard');
  
  const { count: easyCount } = await supabase
    .from('sim_match_logs')
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', 'easy_vs_easy');
  
  const { count: matchCount } = await supabase
    .from('match_logs')
    .select('*', { count: 'exact', head: true });
  
  const { count: posCount } = await supabase
    .from('position_stats')
    .select('*', { count: 'exact', head: true });
  
  const { count: medCount } = await supabase
    .from('medium_pattern_stats')
    .select('*', { count: 'exact', head: true });

  console.log('=== DB事前確認 ===');
  console.log(`fahard_20260519_007: ${fh07count}件`);
  console.log(`fast_hard_vs_fast_hard 合計: ${fhTotal}件`);
  console.log(`easy_vs_easy: ${easyCount}件`);
  console.log(`match_logs: ${matchCount}件`);
  console.log(`position_stats: ${posCount}件`);
  console.log(`medium_pattern_stats: ${medCount}件`);
}

main().catch(console.error);
