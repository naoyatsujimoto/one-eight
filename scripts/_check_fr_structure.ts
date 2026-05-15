import { readFileSync } from 'fs';
import { resolve } from 'path';
try {
  const lines = readFileSync(resolve(process.cwd(), '.env'), 'utf-8').split('\n');
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
const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data, error } = await supabase
    .from('match_logs')
    .select('id, full_record')
    .eq('id', '113969e1-929f-48c2-92f1-d1cff4e2bff4')
    .single();

  if (error) { console.log('err:', error.message); return; }
  const fr = data?.full_record;
  console.log('full_record type:', typeof fr);
  if (fr === null) { console.log('full_record is null'); return; }
  if (typeof fr === 'string') {
    console.log('is string, first 200 chars:', fr.slice(0, 200));
    try {
      const parsed = JSON.parse(fr);
      console.log('parsed keys:', Object.keys(parsed));
      const hist = parsed.history ?? parsed.moves ?? parsed.records;
      console.log('history length:', hist?.length);
      if (hist?.[0]) console.log('move[0]:', JSON.stringify(hist[0]).slice(0, 300));
    } catch(e) { console.log('parse error', e); }
  } else if (Array.isArray(fr)) {
    console.log('is array, length:', fr.length);
    if (fr[0]) console.log('fr[0]:', JSON.stringify(fr[0]).slice(0, 300));
  } else {
    console.log('keys:', Object.keys(fr as Record<string,unknown>));
    const frObj = fr as Record<string, unknown>;
    for (const k of Object.keys(frObj)) {
      const v = frObj[k];
      if (Array.isArray(v)) {
        console.log(`  ${k}: array length ${v.length}`);
        if (v[0]) console.log(`  ${k}[0]:`, JSON.stringify(v[0]).slice(0, 200));
      } else {
        console.log(`  ${k}:`, JSON.stringify(v)?.slice(0, 100));
      }
    }
  }
}
main();
