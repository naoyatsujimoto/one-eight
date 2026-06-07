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
  // service_role でも RPC の応答時間を確認（auth.uid=null → 空が返るが速度は分かる）
  const t0 = Date.now();
  const { data, error } = await (sb as any).rpc('get_ghost_moves', {
    p_canonical_hash: '',
    p_human_color: null,
    p_move_index: 0,
  });
  const t1 = Date.now();
  console.log('RPC response time:', t1 - t0, 'ms');
  console.log('Result:', data, error?.message);
}

main().catch(console.error);
