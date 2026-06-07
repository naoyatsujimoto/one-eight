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
  // match_logs から初手を直接 SELECT して RPC ロジックをシミュレート
  const { data: logs } = await sb
    .from('match_logs')
    .select('id, human_color, full_record')
    .eq('user_id', uid)
    .in('mode', ['human_vs_cpu', 'online_pvp'])
    .not('full_record', 'is', null);

  if (!logs || logs.length === 0) {
    console.log('No logs found');
    return;
  }

  // p_move_index=0 の場合: full_record[0] を返す（全対局）
  // p_human_color=null → フィルタなし
  // p_human_color='black' → player='black' のみ
  // p_human_color='white' → player='white' のみ

  const firstMoves = logs.map(l => ({
    id: (l.id as string).substring(0, 8),
    human_color: l.human_color,
    first_move: (l.full_record as any[])?.[0],
  }));

  console.log('=== Simulating RPC p_move_index=0, p_human_color=null ===');
  const noFilter = firstMoves.filter(m => m.first_move != null);
  console.log(`Total first moves: ${noFilter.length}`);
  
  // GROUP BY positioning, build_type, build_gate, build_gates, build_placed_gate_ids
  const grouped = new Map<string, number>();
  for (const m of noFilter) {
    const fm = m.first_move;
    const pos = fm.positioning ?? 'P';
    const btype = fm.build?.type ?? 'skip';
    const key = `${pos}|${btype}`;
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  console.log('Grouped results:');
  [...grouped.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`  ${k}: ${v}`);
  });

  console.log('\n=== Simulating RPC p_move_index=0, p_human_color=\'black\' ===');
  const blackFilter = firstMoves.filter(m => m.first_move?.player === 'black');
  console.log(`Filtered (player=black) first moves: ${blackFilter.length}`);
  
  console.log('\n=== Simulating RPC p_move_index=0, p_human_color=\'white\' ===');
  const whiteFilter = firstMoves.filter(m => m.first_move?.player === 'white');
  console.log(`Filtered (player=white) first moves: ${whiteFilter.length}`);

  // 実際の unique positioning を確認
  console.log('\n=== Unique positioning values ===');
  const positions = new Set(noFilter.map(m => m.first_move?.positioning));
  console.log([...positions]);

  // build type distribution
  console.log('\n=== Build type distribution ===');
  const buildTypes = new Map<string, number>();
  for (const m of noFilter) {
    const btype = m.first_move?.build?.type ?? 'skip';
    buildTypes.set(btype, (buildTypes.get(btype) ?? 0) + 1);
  }
  console.log(Object.fromEntries(buildTypes));
}

main().catch(console.error);
