/**
 * diagnose_s13.ts
 * sim_medium_pattern_stats 閾値減少の原因診断
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('env missing'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  // 1. スキーマ確認（サンプル行）
  console.log('=== 1. sim_medium_pattern_stats サンプル行 ===');
  const { data: sample } = await supabase
    .from('sim_medium_pattern_stats')
    .select('*')
    .limit(5);
  if (sample) sample.forEach(r => console.log(JSON.stringify(r)));

  // 2. sim_policy 別件数
  console.log('\n=== 2. sim_policy 別件数 ===');
  const { count: easyCount } = await supabase
    .from('sim_medium_pattern_stats')
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', 'easy_vs_easy');
  const { count: totalCount } = await supabase
    .from('sim_medium_pattern_stats')
    .select('*', { count: 'exact', head: true });
  console.log(`easy_vs_easy: ${easyCount}`);
  console.log(`全件: ${totalCount}`);

  // 3. total 閾値 直接クエリ
  console.log('\n=== 3. total閾値 直接クエリ (easy_vs_easy) ===');
  const { count: c30 } = await supabase.from('sim_medium_pattern_stats').select('*',{count:'exact',head:true}).eq('sim_policy','easy_vs_easy').gte('total',30);
  const { count: c50 } = await supabase.from('sim_medium_pattern_stats').select('*',{count:'exact',head:true}).eq('sim_policy','easy_vs_easy').gte('total',50);
  const { count: c100 } = await supabase.from('sim_medium_pattern_stats').select('*',{count:'exact',head:true}).eq('sim_policy','easy_vs_easy').gte('total',100);
  const { count: c200 } = await supabase.from('sim_medium_pattern_stats').select('*',{count:'exact',head:true}).eq('sim_policy','easy_vs_easy').gte('total',200);
  const { count: c500 } = await supabase.from('sim_medium_pattern_stats').select('*',{count:'exact',head:true}).eq('sim_policy','easy_vs_easy').gte('total',500);
  console.log(`>=30: ${c30}`);
  console.log(`>=50: ${c50}`);
  console.log(`>=100: ${c100}`);
  console.log(`>=200: ${c200}`);
  console.log(`>=500: ${c500}`);

  // 4. total 上位10件
  const { data: maxRows } = await supabase
    .from('sim_medium_pattern_stats')
    .select('medium_pattern_id, sim_policy, total, wins_black, wins_white, draws')
    .eq('sim_policy', 'easy_vs_easy')
    .order('total', { ascending: false })
    .limit(10);
  console.log('\n=== 4. total 上位10件 ===');
  if (maxRows) maxRows.forEach(r => console.log(JSON.stringify(r)));

  // 5. 対象pattern
  console.log('\n=== 5. pattern 06865a5f36ac5df5:1011 ===');
  const { data: p } = await supabase
    .from('sim_medium_pattern_stats')
    .select('*')
    .eq('medium_pattern_id', '06865a5f36ac5df5:1011');
  if (p) p.forEach(r => console.log(JSON.stringify(r)));
  else console.log('not found');

  // 6. mode_group カラムが存在するか確認（サンプルのキー一覧）
  console.log('\n=== 6. カラム一覧 (キー) ===');
  const { data: colSample } = await supabase
    .from('sim_medium_pattern_stats')
    .select('*')
    .limit(1);
  if (colSample && colSample.length > 0) {
    console.log('カラム:', Object.keys(colSample[0]).join(', '));
  }

  // 7. 前回stats_s12.tsの集計ロジックとの差異確認のため、
  //    sim_match_logs から batch別件数確認
  console.log('\n=== 7. sim_match_logs batch別件数 ===');
  const batches = [
    'easy_20260507_001','easy_20260508_002','easy_20260508_003',
    'easy_20260508_004','easy_20260508_005','easy_20260508_006',
    'easy_20260508_007','easy_20260511_008','easy_20260512_009',
    'easy_20260512_010','easy_20260512_011','easy_20260512_012',
    'easy_20260512_013'
  ];
  for (const b of batches) {
    const { count } = await supabase
      .from('sim_match_logs')
      .select('*', { count: 'exact', head: true })
      .eq('sim_batch_id', b);
    console.log(`  ${b}: ${count ?? 0} 件`);
  }
  const { count: simTotal } = await supabase
    .from('sim_match_logs')
    .select('*', { count: 'exact', head: true });
  console.log(`  総計: ${simTotal} 件`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
