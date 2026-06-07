import * as fs from 'fs';
try {
  const lines = fs.readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/.env', 'utf-8').split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx < 0) continue;
    const key = t.slice(0, idx).trim();
    const val = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch {}

import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('ERROR: env missing'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  const { count: batchCnt } = await supabase.from('sim_match_logs').select('*',{count:'exact',head:true}).eq('sim_batch_id','fahard_20260520_008');
  const { count: fhTotal }  = await supabase.from('sim_match_logs').select('*',{count:'exact',head:true}).eq('sim_policy','fast_hard_vs_fast_hard');
  const { count: easyCnt }  = await supabase.from('sim_match_logs').select('*',{count:'exact',head:true}).eq('sim_policy','easy_vs_easy');
  const { count: matchCnt } = await supabase.from('match_logs').select('*',{count:'exact',head:true});
  const { count: posCnt }   = await supabase.from('position_stats').select('*',{count:'exact',head:true});
  const { count: medCnt }   = await supabase.from('medium_pattern_stats').select('*',{count:'exact',head:true});

  // sim_medium_pattern_stats (fast_hard_vs_fast_hard)
  const { count: smedTotal } = await supabase.from('sim_medium_pattern_stats').select('*',{count:'exact',head:true}).eq('sim_policy','fast_hard_vs_fast_hard');
  const r30  = await supabase.from('sim_medium_pattern_stats').select('*',{count:'exact',head:true}).eq('sim_policy','fast_hard_vs_fast_hard').gte('total',30);
  const r50  = await supabase.from('sim_medium_pattern_stats').select('*',{count:'exact',head:true}).eq('sim_policy','fast_hard_vs_fast_hard').gte('total',50);
  const r100 = await supabase.from('sim_medium_pattern_stats').select('*',{count:'exact',head:true}).eq('sim_policy','fast_hard_vs_fast_hard').gte('total',100);
  const r200 = await supabase.from('sim_medium_pattern_stats').select('*',{count:'exact',head:true}).eq('sim_policy','fast_hard_vs_fast_hard').gte('total',200);
  const r500 = await supabase.from('sim_medium_pattern_stats').select('*',{count:'exact',head:true}).eq('sim_policy','fast_hard_vs_fast_hard').gte('total',500);

  // sim_position_only_stats (fast_hard_vs_fast_hard)
  const { count: sposTotal } = await supabase.from('sim_position_only_stats').select('*',{count:'exact',head:true}).eq('sim_policy','fast_hard_vs_fast_hard');
  const p30  = await supabase.from('sim_position_only_stats').select('*',{count:'exact',head:true}).eq('sim_policy','fast_hard_vs_fast_hard').gte('total',30);
  const p50  = await supabase.from('sim_position_only_stats').select('*',{count:'exact',head:true}).eq('sim_policy','fast_hard_vs_fast_hard').gte('total',50);
  const p100 = await supabase.from('sim_position_only_stats').select('*',{count:'exact',head:true}).eq('sim_policy','fast_hard_vs_fast_hard').gte('total',100);
  const p200 = await supabase.from('sim_position_only_stats').select('*',{count:'exact',head:true}).eq('sim_policy','fast_hard_vs_fast_hard').gte('total',200);
  const p500 = await supabase.from('sim_position_only_stats').select('*',{count:'exact',head:true}).eq('sim_policy','fast_hard_vs_fast_hard').gte('total',500);

  console.log('=== DB最終確認 ===');
  console.log(`sim_match_logs (fahard_20260520_008): ${batchCnt}件`);
  console.log(`sim_match_logs (fast_hard_vs_fast_hard) 合計: ${fhTotal}件`);
  console.log(`sim_match_logs (easy_vs_easy): ${easyCnt}件`);
  console.log(`match_logs: ${matchCnt}件`);
  console.log(`position_stats: ${posCnt}件`);
  console.log(`medium_pattern_stats: ${medCnt}件`);
  console.log('--- sim_medium_pattern_stats (fast_hard_vs_fast_hard) ---');
  console.log(`総件数: ${smedTotal}`);
  console.log(`total>=30: ${r30.count}`);
  console.log(`total>=50: ${r50.count}`);
  console.log(`total>=100: ${r100.count}`);
  console.log(`total>=200: ${r200.count}`);
  console.log(`total>=500: ${r500.count}`);
  console.log('--- sim_position_only_stats (fast_hard_vs_fast_hard) ---');
  console.log(`総件数: ${sposTotal}`);
  console.log(`total>=30: ${p30.count}`);
  console.log(`total>=50: ${p50.count}`);
  console.log(`total>=100: ${p100.count}`);
  console.log(`total>=200: ${p200.count}`);
  console.log(`total>=500: ${p500.count}`);
}

main().catch(console.error);
