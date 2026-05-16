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
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// sim_medium_pattern_stats の policy一覧
const {data: policies} = await sb.from('sim_medium_pattern_stats').select('sim_policy').limit(5);
console.log('sim_medium_pattern_stats policies (sample):', JSON.stringify(policies?.map((r:any)=>r.sim_policy)));

// distinct policies
const {count: totalMed} = await sb.from('sim_medium_pattern_stats').select('*',{count:'exact',head:true});
const {count: easyMed} = await sb.from('sim_medium_pattern_stats').select('*',{count:'exact',head:true}).eq('sim_policy','easy_vs_easy');
const {count: fhMed} = await sb.from('sim_medium_pattern_stats').select('*',{count:'exact',head:true}).eq('sim_policy','fast_hard_vs_fast_hard');
console.log(`sim_medium_pattern_stats total: ${totalMed}`);
console.log(`  easy_vs_easy: ${easyMed}`);
console.log(`  fast_hard_vs_fast_hard: ${fhMed}`);

// sim_position_only_stats  
const {count: totalPos} = await sb.from('sim_position_only_stats').select('*',{count:'exact',head:true});
const {count: easyPos} = await sb.from('sim_position_only_stats').select('*',{count:'exact',head:true}).eq('sim_policy','easy_vs_easy');
const {count: fhPos} = await sb.from('sim_position_only_stats').select('*',{count:'exact',head:true}).eq('sim_policy','fast_hard_vs_fast_hard');
console.log(`sim_position_only_stats total: ${totalPos}`);
console.log(`  easy_vs_easy: ${easyPos}`);
console.log(`  fast_hard_vs_fast_hard: ${fhPos}`);
