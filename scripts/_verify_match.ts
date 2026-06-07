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
async function main() {
  const { data, error } = await sb
    .from('official_matches')
    .select('id,status,timer_config,black_user_id,white_user_id,starts_at,online_game_id')
    .eq('id', 'fa3516bb-65d5-477a-a044-d8ce176e5a1c')
    .single();
  if (error) { console.error(error); process.exit(1); }
  console.log(JSON.stringify(data, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
