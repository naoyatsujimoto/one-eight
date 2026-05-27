import { readFileSync } from 'fs';
import { resolve } from 'path';
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

type MoveRecord = {
  player?: string;
  positioning?: string;
  build?: {
    type?: string;
    gate?: number;
    gates?: (number | null)[];
    placedGateIds?: number[];
    placed?: number;
  };
  canonical_hash?: string;
  move_number?: number;
};

async function main() {
  // Step A: ユーザー別の対局数を確認（誰のデータか把握）
  const { data: logs } = await supabase
    .from('match_logs')
    .select('id, user_id, mode, human_color, full_record, created_at')
    .in('mode', ['human_vs_cpu', 'online_pvp'])
    .not('full_record', 'is', null)
    .order('created_at', { ascending: false });

  const userCount: Record<string, number> = {};
  for (const log of (logs ?? [])) {
    userCount[log.user_id] = (userCount[log.user_id] ?? 0) + 1;
  }
  console.log('=== ユーザー別対局数 ===');
  for (const [uid, cnt] of Object.entries(userCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  uid: ${uid.slice(0, 8)}... count: ${cnt}`);
  }
  console.log();

  // 最多対局ユーザー（= Naoya と仮定）でフィルタ
  const topUserId = Object.entries(userCount).sort((a, b) => b[1] - a[1])[0]?.[0];
  console.log(`最多対局ユーザー（想定Naoya）: ${topUserId?.slice(0, 8)}...\n`);

  const myLogs = (logs ?? []).filter(l => l.user_id === topUserId);
  console.log(`Naoya想定の対局数: ${myLogs.length}\n`);

  // Step B: Naoya想定データでの p_move_index=0 RPC シミュレーション（全手番）
  console.log('=== [Naoya想定] p_move_index=0, p_human_color=black RPC シミュレーション ===\n');
  const agg: Map<string, { pos: string; btype: string; gate_ids_str: string; freq: number }> = new Map();
  for (const log of myLogs) {
    const fr = log.full_record as MoveRecord[] | null;
    if (!fr || !Array.isArray(fr) || fr.length === 0) continue;
    const mv = fr[0];
    if (mv.player !== 'black') continue;

    const pos = mv.positioning ?? 'P';
    const btype = mv.build?.type ?? 'skip';
    let gate_ids_str: string | null = null;

    if (btype === 'massive' && mv.build?.gate != null) {
      gate_ids_str = String(mv.build.gate);
    } else if (btype === 'selective' && mv.build?.gates) {
      const g0 = mv.build.gates[0] != null ? String(mv.build.gates[0]) : '';
      const g1 = mv.build.gates[1] != null ? String(mv.build.gates[1]) : '';
      gate_ids_str = `${g0},${g1}`;
    } else if (btype === 'quad' && mv.build?.placedGateIds) {
      gate_ids_str = mv.build.placedGateIds.join(',');
    }

    const key = `${pos}|${btype}|${gate_ids_str ?? 'null'}`;
    const ex = agg.get(key);
    if (ex) ex.freq++;
    else agg.set(key, { pos, btype, gate_ids_str: gate_ids_str ?? 'null', freq: 1 });
  }

  const sorted = [...agg.values()].sort((a, b) => b.freq - a.freq);
  const maxFreq = sorted[0]?.freq ?? 1;

  console.log('RPC 返却シミュレーション（上位20件, p_human_color=black, ORDER BY freq DESC）:');
  console.log('rank | positioning | build_type  | gate_ids_str | frequency | Board ids | Gate12あり');
  console.log('-----|-------------|-------------|--------------|-----------|-----------|----------');
  for (let i = 0; i < Math.min(sorted.length, 20); i++) {
    const row = sorted[i];
    const ids = row.gate_ids_str !== 'null'
      ? row.gate_ids_str.split(',').map(Number).filter((n) => !isNaN(n) && n > 0)
      : [];
    const opacity = (0.4 + (row.freq / maxFreq) * 0.6).toFixed(3);
    const hasGate12 = ids.includes(12) ? '★' : '-';
    console.log(`  ${String(i+1).padStart(2)} | ${row.pos.padEnd(11)} | ${row.btype.padEnd(11)} | ${row.gate_ids_str.padEnd(12)} | ${String(row.freq).padEnd(9)} | [${ids.join(',')}] | ${hasGate12}`);
  }
  console.log();

  // Gate12 が含まれる行の詳細
  console.log('=== Gate12 を含む行の詳細 ===');
  for (const row of sorted) {
    const ids = row.gate_ids_str !== 'null'
      ? row.gate_ids_str.split(',').map(Number).filter((n) => !isNaN(n) && n > 0)
      : [];
    if (ids.includes(12)) {
      const opacity = (0.4 + (row.freq / maxFreq) * 0.6).toFixed(3);
      console.log(`  pos=${row.pos} btype=${row.btype} gate_ids_str="${row.gate_ids_str}" freq=${row.freq}`);
      console.log(`  → Board変換: ids=[${ids.join(',')}]`);
      console.log(`  → pocketSize: ${row.btype === 'massive' ? 'large' : row.btype === 'selective' ? 'middle' : 'small'}`);
      console.log(`  → opacity: ${opacity}`);
      console.log(`  → Ghost表示対象: ${ids.map(id => `Gate${id}`).join(' AND ')}`);
      console.log();
    }
  }

  // Gate8 が ghostGateMap に登録されるか確認
  console.log('=== ghostGateMap 最終状態（Naoya想定） ===');
  const ghostGateMap = new Map<number, { pocketSize: string; opacity: number }>();
  for (const row of sorted) {
    if (row.gate_ids_str === 'null') continue;
    const ids = row.gate_ids_str.split(',').map(Number).filter((n) => !isNaN(n) && n > 0);
    const opacity = 0.4 + (row.freq / maxFreq) * 0.6;
    const pocketSize = row.btype === 'massive' ? 'large' : row.btype === 'selective' ? 'middle' : 'small';
    for (const gateId of ids) {
      const ex = ghostGateMap.get(gateId);
      if (!ex || opacity > ex.opacity) {
        ghostGateMap.set(gateId, { pocketSize, opacity });
      }
    }
  }
  console.log('Gate | pocketSize | opacity');
  console.log('-----|------------|--------');
  for (const [gateId, v] of [...ghostGateMap.entries()].sort((a, b) => a[0] - b[0])) {
    const marker = gateId === 8 || gateId === 12 ? ' ← 注目' : '';
    console.log(`  ${String(gateId).padStart(2)} | ${v.pocketSize.padEnd(10)} | ${v.opacity.toFixed(3)}${marker}`);
  }
  console.log();

  // Gate8 の状態を詳細確認
  const gate8 = ghostGateMap.get(8);
  const gate12 = ghostGateMap.get(12);
  console.log(`Gate8  ghostGateMap: ${gate8 ? JSON.stringify(gate8) : '未登録'}`);
  console.log(`Gate12 ghostGateMap: ${gate12 ? JSON.stringify(gate12) : '未登録'}`);
  
  if (gate8 && gate12) {
    console.log('\n→ Gate8 AND Gate12 両方が ghostGateMap に登録されている');
    console.log('→ Board.tsx は両方にGhost表示を付けるはず');
    console.log('→ 画面でGate12単独に見えるなら: 原因D（視認性 / CSS / 重なり）の可能性');
    if (gate8.pocketSize !== gate12.pocketSize) {
      console.log(`→ ただし pocketSize が異なる: Gate8=${gate8.pocketSize}, Gate12=${gate12.pocketSize}`);
      console.log('  → pocketSizeの違いにより一方が上書きされている可能性あり');
    }
  } else if (!gate8 && gate12) {
    console.log('\n→ Gate8 は ghostGateMap に未登録 / Gate12 のみ登録');
    console.log('→ これが Gate12 単独表示の直接原因');
    console.log('→ 理由: Gate8 に対して別の row が先にpocketSize違いで上書きされている');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
