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
  // 1. match_logs の件数確認
  const { count } = await sb
    .from('match_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', uid)
    .in('mode', ['human_vs_cpu', 'online_pvp']);
  console.log('match_logs count (total):', count);

  // 2. full_record がある件数
  const { count: count2 } = await sb
    .from('match_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', uid)
    .in('mode', ['human_vs_cpu', 'online_pvp'])
    .not('full_record', 'is', null);
  console.log('match_logs count (with full_record):', count2);

  // 3. サンプル確認（human_color と first move player）
  const { data: logs } = await sb
    .from('match_logs')
    .select('id, mode, human_color, winner, move_count, full_record')
    .eq('user_id', uid)
    .in('mode', ['human_vs_cpu', 'online_pvp'])
    .not('full_record', 'is', null)
    .limit(10);

  console.log('\nsample logs:');
  logs?.forEach(l => {
    const fr = l.full_record as any[];
    console.log({
      id: (l.id as string).substring(0, 8),
      mode: l.mode,
      human_color: l.human_color,
      winner: l.winner,
      move_count: l.move_count,
      full_record_len: fr?.length,
      first_move_player: fr?.[0]?.player,
      first_move_positioning: fr?.[0]?.positioning,
      first_move_build_type: fr?.[0]?.build?.type,
      first_move_has_hash: !!(fr?.[0]?.canonical_hash),
    });
  });

  // 4. human_color='black' の件数確認
  const { count: countBlack } = await sb
    .from('match_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', uid)
    .in('mode', ['human_vs_cpu', 'online_pvp'])
    .not('full_record', 'is', null)
    .eq('human_color', 'black');
  console.log('\nmatch_logs with human_color=black:', countBlack);

  const { count: countWhite } = await sb
    .from('match_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', uid)
    .in('mode', ['human_vs_cpu', 'online_pvp'])
    .not('full_record', 'is', null)
    .eq('human_color', 'white');
  console.log('match_logs with human_color=white:', countWhite);

  // 5. human_color=null の件数確認
  const { count: countNull } = await sb
    .from('match_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', uid)
    .in('mode', ['human_vs_cpu', 'online_pvp'])
    .not('full_record', 'is', null)
    .is('human_color', null);
  console.log('match_logs with human_color=null:', countNull);
}

main().catch(console.error);
