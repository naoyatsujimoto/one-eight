import { readFileSync } from 'fs';
import { resolve } from 'path';
try {
  const envPath = resolve(process.cwd(), '.env');
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch {}

import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data, error } = await supabase
    .from('sim_match_logs')
    .select('id, winner, full_record')
    .eq('sim_policy', 'easy_vs_easy')
    .limit(1);

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log('No data found');
    return;
  }

  const rec = data[0] as Record<string, unknown>;
  console.log('id:', rec.id);
  console.log('winner:', rec.winner);
  const fr = rec.full_record as Record<string, unknown> | null;
  console.log('full_record type:', typeof fr);
  if (fr && typeof fr === 'object') {
    console.log('full_record keys:', Object.keys(fr));
    if (fr.history && Array.isArray(fr.history)) {
      console.log('history length:', fr.history.length);
      console.log('history[0]:', JSON.stringify(fr.history[0]).substring(0, 300));
      console.log('history[1]:', JSON.stringify(fr.history[1] ?? null).substring(0, 300));
    } else {
      console.log('full_record sample:', JSON.stringify(fr).substring(0, 800));
    }
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
