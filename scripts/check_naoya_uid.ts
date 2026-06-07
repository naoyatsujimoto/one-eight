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

const TARGET_UID = '9924668a-a5ee-4bd3-a71e-f8f993e3f094';

type MoveRecord = {
  player?: string;
  positioning?: string;
  build?: { type?: string; gate?: number; gates?: (number|null)[]; placedGateIds?: number[] };
  canonical_hash?: string;
  move_number?: number;
};

async function main() {
  const { data: logs, error } = await supabase
    .from('match_logs')
    .select('id, user_id, mode, human_color, full_record, created_at')
    .eq('user_id', TARGET_UID)
    .in('mode', ['human_vs_cpu', 'online_pvp'])
    .not('full_record', 'is', null);

  if (error) { console.error(error.message); return; }

  console.log(`uid=9924668a... の対局数: ${logs?.length ?? 0}\n`);

  // v2 RPC シミュレーション: p_move_index=0, p_human_color=black
  const agg = new Map<string, {
    pos: string; btype: string;
    b_gate: number|null; b_gates: number[]|null; b_placed: number[]|null;
    freq: number; matchLogId: string;
  }>();

  for (const log of (logs ?? [])) {
    const fr = log.full_record as MoveRecord[];
    if (!fr || fr.length === 0) continue;
    const mv = fr[0];
    if (mv.player !== 'black') continue;

    const pos = mv.positioning ?? 'P';
    const btype = mv.build?.type ?? 'skip';
    let b_gate: number|null = null;
    let b_gates: number[]|null = null;
    let b_placed: number[]|null = null;

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
    else agg.set(key, { pos, btype, b_gate, b_gates, b_placed, freq: 1, matchLogId: log.id });
  }

  const sorted = [...agg.values()].sort((a, b) => b.freq - a.freq);
  const maxFreq = sorted[0]?.freq ?? 1;

  console.log('=== p_move_index=0 / p_human_color=black / v2 RPC シミュレーション ===\n');
  console.log('rank | pos | type        | b_gate | b_gates   | b_placed | freq | opacity');
  console.log('-----|-----|-------------|--------|-----------|----------|------|--------');
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const op = (0.4 + (r.freq / maxFreq) * 0.6).toFixed(3);
    const g12 = (r.b_gates?.includes(12) || r.b_gate === 12 || r.b_placed?.includes(12)) ? ' ← ★Gate12' : '';
    console.log(
      `  ${String(i+1).padStart(2)} | ${r.pos.padEnd(3)} | ${r.btype.padEnd(11)} | ` +
      `${String(r.b_gate ?? '-').padEnd(6)} | ${JSON.stringify(r.b_gates ?? null).padEnd(9)} | ` +
      `${JSON.stringify(r.b_placed ?? null).padEnd(8)} | ${String(r.freq).padEnd(4)} | ${op}${g12}`
    );
  }

  // Gate12 詳細
  console.log('\n=== Gate12 を含む初手行の詳細 ===\n');
  const gate12Rows = sorted.filter(r =>
    r.b_gates?.includes(12) || r.b_gate === 12 || r.b_placed?.includes(12)
  );
  if (gate12Rows.length === 0) {
    console.log('  Gate12 を含む行は存在しません。');
    console.log('  → Naoya(9924668a)の初手GhostにGate12は含まれないはず。');
  } else {
    for (const r of gate12Rows) {
      console.log(`  positioning=${r.pos}  build_type=${r.btype}`);
      console.log(`  build_gate=${r.b_gate}  build_gates=${JSON.stringify(r.b_gates)}  b_placed=${JSON.stringify(r.b_placed)}`);
      console.log(`  freq=${r.freq}  opacity=${(0.4 + r.freq/maxFreq*0.6).toFixed(3)}`);
      console.log(`  match_log.id=${r.matchLogId}`);
      if (r.btype === 'selective' && r.b_gates) {
        const n = r.b_gates.length;
        if (n === 2) {
          console.log(`  ✅ 2-gate selective → Board: Gate${r.b_gates[0]}(middle) AND Gate${r.b_gates[1]}(middle) 両方表示`);
          console.log(`  → Gate8も同時にmiddle表示されているはず`);
        } else if (n === 1) {
          console.log(`  ⚠️  1-gate selective → Board: Gate${r.b_gates[0]}(middle) のみ表示`);
        }
      }
    }
  }

  // ghostMovesToDisplayTargets シミュレーション
  console.log('\n=== ghostGateMap シミュレーション（Board.tsx 表示対象） ===\n');
  const gateMap = new Map<number, { pocketSize: string; opacity: number }>();
  const opMap = new Map<string, number>();
  for (const r of sorted) {
    const op = 0.4 + (r.freq / maxFreq) * 0.6;
    const exOp = opMap.get(r.pos) ?? 0;
    if (op > exOp) opMap.set(r.pos, op);

    let gateIds: number[] = [];
    let ps: string;
    if (r.btype === 'massive' && r.b_gate != null && r.b_gate > 0) {
      gateIds = [r.b_gate]; ps = 'large';
    } else if (r.btype === 'selective' && r.b_gates && r.b_gates.length > 0) {
      gateIds = r.b_gates.filter(g => g > 0); ps = 'middle';
    } else if (r.btype === 'quad' && r.b_placed && r.b_placed.length > 0) {
      gateIds = r.b_placed.filter(g => g > 0); ps = 'small';
    } else continue;

    for (const gid of gateIds) {
      const ex = gateMap.get(gid);
      if (!ex || op > ex.opacity) gateMap.set(gid, { pocketSize: ps, opacity: op });
    }
  }

  console.log('gateId | pocketSize | opacity');
  console.log('-------|------------|--------');
  for (const [gid, v] of [...gateMap.entries()].sort((a,b) => a[0]-b[0])) {
    const mark = gid === 12 ? ' ← Gate12' : (gid === 8 ? ' ← Gate8' : '');
    console.log(`    ${String(gid).padStart(2)} | ${v.pocketSize.padEnd(10)} | ${v.opacity.toFixed(3)}${mark}`);
  }

  console.log('\npositioningOpacityMap:');
  for (const [pos, op] of [...opMap.entries()].sort()) {
    console.log(`  ${pos}: ${op.toFixed(3)}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
