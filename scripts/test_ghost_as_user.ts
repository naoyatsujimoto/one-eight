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

// anon key で接続（フロントエンドと同じ）
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function main() {
  // service_role key でユーザーの session token を取得するのは不可能
  // 代わりに service_role で直接 SQL を実行してシミュレート
  
  // service_role で connect
  const sbAdmin = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  // match_logs から初手データを取得して RPC ロジックをシミュレート
  const { data: logs } = await sbAdmin
    .from('match_logs')
    .select('full_record')
    .eq('user_id', '9924668a-a5ee-4bd3-a71e-f8f993e3f094')
    .in('mode', ['human_vs_cpu', 'online_pvp'])
    .not('full_record', 'is', null);
  
  if (!logs) { console.log('No logs'); return; }
  
  const uid = '9924668a-a5ee-4bd3-a71e-f8f993e3f094';
  
  // p_move_index=0, p_human_color=null の場合をシミュレート
  console.log('=== Simulating get_ghost_moves(p_canonical_hash="", p_human_color=null, p_move_index=0) ===');
  
  // RPC SQL ロジックに従って実行
  const firstMoves = logs
    .map(l => (l.full_record as any[])?.[0])
    .filter(Boolean)
    .filter(m => true); // p_human_color=null → フィルタなし
  
  console.log('Raw first moves count:', firstMoves.length);
  
  // GROUP BY pos, btype, b_gate, b_gates, b_placed
  type GroupKey = string;
  const grouped = new Map<GroupKey, { count: number; positioning: string; build_type: string; build_gate: number | null; build_gates: number[] | null; build_placed_gate_ids: number[] | null }>();
  
  for (const m of firstMoves) {
    const pos = m.positioning ?? 'P';
    const btype = m.build?.type ?? 'skip';
    
    let b_gate: number | null = null;
    let b_gates: number[] | null = null;
    let b_placed: number[] | null = null;
    
    if (btype === 'massive') {
      b_gate = m.build?.gate != null ? Number(m.build.gate) : null;
    } else if (btype === 'selective') {
      const gts = m.build?.gates as number[] | null;
      b_gates = gts ? gts.filter((g: number) => g > 0).sort((a: number, b: number) => a - b) : null;
    } else if (btype === 'quad') {
      const pgIds = m.build?.placedGateIds as number[] | null;
      b_placed = pgIds ? pgIds.sort((a: number, b: number) => a - b) : null;
    }
    
    const key = `${pos}|${btype}|${b_gate}|${JSON.stringify(b_gates)}|${JSON.stringify(b_placed)}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count++;
    } else {
      grouped.set(key, { count: 1, positioning: pos, build_type: btype, build_gate: b_gate, build_gates: b_gates, build_placed_gate_ids: b_placed });
    }
  }
  
  const results = [...grouped.values()].sort((a, b) => b.count - a.count);
  console.log(`Grouped result: ${results.length} rows`);
  results.forEach(r => {
    console.log({
      positioning: r.positioning,
      build_type: r.build_type,
      build_gate: r.build_gate,
      build_gates: r.build_gates,
      build_placed_gate_ids: r.build_placed_gate_ids,
      frequency: r.count,
    });
  });
  
  // p_human_color='black' の場合
  console.log('\n=== p_human_color=\'black\' ===');
  const blackMoves = logs
    .map(l => (l.full_record as any[])?.[0])
    .filter(Boolean)
    .filter(m => m.player === 'black');
  console.log('Filtered count:', blackMoves.length);
}

main().catch(console.error);
