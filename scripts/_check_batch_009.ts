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
} catch { /* */ }
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const {count:c} = await s.from('sim_match_logs').select('*',{count:'exact',head:true}).eq('sim_batch_id','fvhard_20260806_009');
console.log('fvhard_20260806_009:', c);
const {count:fvh} = await s.from('sim_match_logs').select('*',{count:'exact',head:true}).eq('sim_policy','fastveryhard_vs_fastveryhard');
console.log('fastveryhard_vs_fastveryhard:', fvh);
const {count:fh} = await s.from('sim_match_logs').select('*',{count:'exact',head:true}).eq('sim_policy','fast_hard_vs_fast_hard');
console.log('fast_hard_vs_fast_hard:', fh);
const {count:easy} = await s.from('sim_match_logs').select('*',{count:'exact',head:true}).eq('sim_policy','easy_vs_easy');
console.log('easy_vs_easy:', easy);
