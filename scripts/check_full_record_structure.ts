import { readFileSync } from 'fs';
try {
  const lines = readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/.env', 'utf-8').split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx < 0) continue;
    const k = t.slice(0, idx).trim();
    const v = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
} catch {}
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const uid = '9924668a-a5ee-4bd3-a71e-f8f993e3f094';

async function main() {
  const { data: logs } = await sb
    .from('match_logs')
    .select('id, full_record')
    .eq('user_id', uid)
    .in('mode', ['human_vs_cpu', 'online_pvp'])
    .not('full_record', 'is', null)
    .limit(5);
  
  logs?.forEach(l => {
    const fr = l.full_record as any[];
    const m = fr?.[0];
    if (!m) return;
    console.log(`--- id: ${(l.id as string).substring(0, 8)} ---`);
    console.log('  player:', m.player);
    console.log('  positioning:', m.positioning);
    console.log('  build (full):', JSON.stringify(m.build));
    console.log('  build.type:', m.build?.type);
    console.log('  build.gate:', m.build?.gate);
    console.log('  build.gates:', m.build?.gates);
    console.log('  build.placedGateIds:', m.build?.placedGateIds);
    console.log('  build keys:', m.build ? Object.keys(m.build) : 'null');
    console.log('');
  });
}

main().catch(console.error);
