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
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UID = '9924668a-a5ee-4bd3-a71e-f8f993e3f094';

type BuildData = {
  type?: string;
  gate?: number | null;
  gates?: (number|null)[];
  placedGateIds?: number[];
};
type MoveRecord = {
  player?: string; positioning?: string; build?: BuildData;
  canonical_hash?: string; move_number?: number;
};

async function main() {
  const { data: logs, error } = await supabase
    .from('match_logs')
    .select('id, mode, human_color, full_record, created_at')
    .eq('user_id', UID)
    .in('mode', ['human_vs_cpu', 'online_pvp'])
    .not('full_record', 'is', null)
    .order('created_at', { ascending: false });

  if (error) { console.error(error.message); return; }
  console.log(`uid=9924668a 対局数: ${logs?.length ?? 0}\n`);

  // 全対局の full_record[0] を完全に表示
  console.log('=== 全対局 full_record[0] (player=black のみ) ===\n');
  for (const log of (logs ?? [])) {
    const fr = log.full_record as MoveRecord[];
    if (!fr || fr.length === 0) continue;
    const mv = fr[0];
    if (mv.player !== 'black') { console.log(`  [${log.id.slice(0,8)}] player=${mv.player} → SKIP`); continue; }
    const b = mv.build;
    const gateStr = b?.type === 'massive' ? `gate=${b.gate}` :
                    b?.type === 'selective' ? `gates=${JSON.stringify(b.gates)}` :
                    b?.type === 'quad' ? `placedGateIds=${JSON.stringify(b.placedGateIds)}` : 'n/a';
    const g12 = (
      (b?.type === 'massive' && b.gate === 12) ||
      (b?.type === 'selective' && b.gates?.some(g => g === 12)) ||
      (b?.type === 'quad' && b.placedGateIds?.includes(12))
    ) ? ' ← ★Gate12' : '';
    const g7 = (
      (b?.type === 'massive' && b.gate === 7) ||
      (b?.type === 'selective' && b.gates?.some(g => g === 7)) ||
      (b?.type === 'quad' && b.placedGateIds?.includes(7))
    ) ? ' ← Gate7' : '';
    console.log(`  [${log.id.slice(0,8)}] pos=${mv.positioning} type=${b?.type} ${gateStr}${g12}${g7}`);
  }

  // v2 RPC シミュレーション：ORDER BY freq DESC（同 freq は DB順, 実際の RPC 順を模倣）
  console.log('\n=== v2 RPC ghostGateMap 競合ログ（Gate7/Gate12/Gate8 に絞る） ===\n');
  const agg = new Map<string, {
    pos: string; btype: string;
    b_gate: number|null; b_gates: number[]|null; b_placed: number[]|null; freq: number;
  }>();
  for (const log of (logs ?? [])) {
    const fr = log.full_record as MoveRecord[];
    if (!fr || fr.length === 0) continue;
    const mv = fr[0];
    if (mv.player !== 'black') continue;
    const pos = mv.positioning ?? 'P';
    const btype = mv.build?.type ?? 'skip';
    let b_gate: number|null = null, b_gates: number[]|null = null, b_placed: number[]|null = null;
    if (btype === 'massive') {
      b_gate = (mv.build?.gate != null && mv.build.gate > 0) ? mv.build.gate : null;
    } else if (btype === 'selective' && mv.build?.gates) {
      b_gates = mv.build.gates.filter((g): g is number => g != null && g > 0).sort((a,b) => a-b);
    } else if (btype === 'quad' && mv.build?.placedGateIds) {
      b_placed = [...mv.build.placedGateIds].sort((a,b) => a-b);
    }
    const key = `${pos}|${btype}|${b_gate}|${JSON.stringify(b_gates)}|${JSON.stringify(b_placed)}`;
    const ex = agg.get(key);
    if (ex) ex.freq++;
    else agg.set(key, { pos, btype, b_gate, b_gates, b_placed, freq: 1 });
  }

  const sorted = [...agg.values()].sort((a, b) => b.freq - a.freq);
  const maxFreq = sorted[0]?.freq ?? 1;
  const gateMap = new Map<number, { opacity: number; pocketSize: string; source: string }>();

  for (const r of sorted) {
    const op = 0.4 + (r.freq / maxFreq) * 0.6;
    let gateIds: number[] = [], ps: string;
    if (r.btype === 'massive' && r.b_gate != null && r.b_gate > 0) { gateIds=[r.b_gate]; ps='large'; }
    else if (r.btype === 'selective' && r.b_gates && r.b_gates.length > 0) { gateIds=r.b_gates.filter(g=>g>0); ps='middle'; }
    else if (r.btype === 'quad' && r.b_placed && r.b_placed.length > 0) { gateIds=r.b_placed.filter(g=>g>0); ps='small'; }
    else continue;

    for (const gid of gateIds) {
      if (gid === 7 || gid === 8 || gid === 12) {
        const ex = gateMap.get(gid);
        const action = !ex ? 'SET' : op > ex.opacity ? 'OVERWRITE' : 'SKIP(same/lower)';
        console.log(`  Gate${gid}: [${action}] pos=${r.pos} type=${r.btype} → ${ps}/${op.toFixed(3)}  現在=${ex ? `${ex.pocketSize}/${ex.opacity.toFixed(3)}` : 'none'}`);
        if (!ex || op > ex.opacity) gateMap.set(gid, { opacity: op, pocketSize: ps, source: `${r.pos}/${r.btype}` });
      }
    }
  }

  console.log('\n=== ghostGateMap 最終（Gate7/8/12） ===');
  for (const gid of [7, 8, 12]) {
    const v = gateMap.get(gid);
    console.log(`  Gate${gid}: ${v ? `${v.pocketSize} / opacity=${v.opacity.toFixed(3)} / source=${v.source}` : '未登録'}`);
  }

  console.log('\n=== 判定 ===');
  const g7 = gateMap.get(7), g8 = gateMap.get(8), g12 = gateMap.get(12);
  console.log(`Naoya観察 vs シミュレーション:`);
  console.log(`  Gate7:  Naoya=Large,  sim=${g7?.pocketSize ?? '未登録'}  ${g7?.pocketSize === 'large' ? '✅一致' : '❌不一致'}`);
  console.log(`  Gate8:  Naoya=なし,   sim=${g8?.pocketSize ?? '未登録'}  ${!g8 || g8.pocketSize !== 'middle' ? '✅一致(middle不表示が期待)' : '→ middleが表示されるはずだが Naoya は見ていない'}`);
  console.log(`  Gate12: Naoya=Large,  sim=${g12?.pocketSize ?? '未登録'}  ${g12?.pocketSize === 'large' ? '✅一致' : '❌不一致 → 原因不明'}`);
}

main().catch(e => { console.error(e); process.exit(1); });
