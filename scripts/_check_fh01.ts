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

const {count:c1} = await sb.from('sim_match_logs').select('*',{count:'exact',head:true}).eq('sim_batch_id','fahard_20260515_001');
const {count:c2} = await sb.from('sim_match_logs').select('*',{count:'exact',head:true});
const {count:c3} = await sb.from('sim_match_logs').select('*',{count:'exact',head:true}).eq('sim_policy','easy_vs_easy');
const {count:ml} = await sb.from('match_logs').select('*',{count:'exact',head:true});
const {count:ps} = await sb.from('position_stats').select('*',{count:'exact',head:true});
console.log(`fahard_20260515_001: ${c1}`);
console.log(`sim_match_logs total: ${c2}`);
console.log(`easy_vs_easy: ${c3}`);
console.log(`match_logs: ${ml}`);
console.log(`position_stats: ${ps}`);
