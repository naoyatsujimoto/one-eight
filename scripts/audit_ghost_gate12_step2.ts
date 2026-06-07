/**
 * Ghost Mode 監査 Step2
 * - p_move_index=0 での初手 Ghost で Gate12 が出る可能性をさらに掘り下げる
 * - 初手の selective build の gate_ids_str を全て確認する
 * - Gate12 が first gate (gates[0]) に含まれるケースを探す
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
try {
  const envPath = resolve(process.cwd(), '.env');
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch {}

import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  console.log('=== Ghost Mode 監査 Step2: 初手 Ghost の全 gate_ids_str ===\n');

  const { data: logs, error: logsErr } = await supabase
    .from('match_logs')
    .select('id, user_id, mode, human_color, full_record')
    .in('mode', ['human_vs_cpu', 'online_pvp'])
    .not('full_record', 'is', null)
    .limit(500);

  if (logsErr) {
    console.error('match_logs fetch error:', logsErr.message);
    return;
  }

  console.log(`取得 match_logs 件数: ${logs?.length ?? 0}\n`);

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

  // 初手 (full_record[0]) の selective build 全件サンプル
  console.log('--- 初手 selective build の gate_ids_str（全件） ---');
  let selectiveFirst = 0;
  for (const log of (logs ?? [])) {
    const fr = log.full_record as MoveRecord[] | null;
    if (!fr || !Array.isArray(fr) || fr.length === 0) continue;
    const mv = fr[0];
    if (mv.build?.type !== 'selective') continue;
    const gates = mv.build.gates;
    const g0 = gates?.[0] != null ? String(gates[0]) : '';
    const g1 = gates?.[1] != null ? String(gates[1]) : '';
    const gate_ids_str = `${g0},${g1}`;
    // Board.tsx での変換
    const ids = gate_ids_str.split(',').map(Number).filter((n) => !isNaN(n) && n > 0);

    console.log(`  match_log.id: ${log.id}`);
    console.log(`    gates raw: ${JSON.stringify(gates)}`);
    console.log(`    gate_ids_str (RPC生成): "${gate_ids_str}"`);
    console.log(`    ids (Board filter n>0): [${ids.join(', ')}]`);
    console.log(`    Gate12 含む: ${ids.includes(12)}`);
    console.log();
    selectiveFirst++;
  }
  console.log(`初手 selective 件数: ${selectiveFirst}\n`);

  // Gate12 が含まれる初手を特定
  console.log('--- Gate12 を含む初手（全 build type） ---');
  for (const log of (logs ?? [])) {
    const fr = log.full_record as MoveRecord[] | null;
    if (!fr || !Array.isArray(fr) || fr.length === 0) continue;
    const mv = fr[0];
    const b = mv.build;
    if (!b) continue;

    let gateIds: number[] = [];
    if (b.type === 'massive' && b.gate != null) gateIds = [b.gate];
    else if (b.type === 'selective' && b.gates) gateIds = b.gates.filter((x): x is number => x != null && x > 0);
    else if (b.type === 'quad' && b.placedGateIds) gateIds = b.placedGateIds;

    if (gateIds.includes(12)) {
      console.log(`  match_log.id: ${log.id}, build: ${JSON.stringify(b)}`);
      console.log(`    positioning: ${mv.positioning}, player: ${mv.player}`);
    }
  }

  // p_move_index=0 でのRPC挙動を正確にシミュレート
  // (RPCはp_human_colorもフィルタする)
  // App.tsx: fetchGhostMoves(hash, humanColor, state.history.length)
  // humanColor = PvC の場合は 'black' or 'white'
  // p_human_color で player フィルタされる
  console.log('\n--- p_move_index=0, p_human_color=black での RPC シミュレーション ---');
  const firstMoveAgg: Map<string, { pos: string; btype: string; gate_ids_str: string; freq: number }> = new Map();
  for (const log of (logs ?? [])) {
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
    const existing = firstMoveAgg.get(key);
    if (existing) existing.freq++;
    else firstMoveAgg.set(key, { pos, btype, gate_ids_str: gate_ids_str ?? 'null', freq: 1 });
  }

  console.log('RPC 返却シミュレーション（GROUP BY pos/btype/gate_ids_str、ORDER BY freq DESC）:');
  const sorted = [...firstMoveAgg.values()].sort((a, b) => b.freq - a.freq);
  for (const row of sorted) {
    const ids = row.gate_ids_str !== 'null'
      ? row.gate_ids_str.split(',').map(Number).filter((n) => !isNaN(n) && n > 0)
      : [];
    console.log(`  pos=${row.pos} btype=${row.btype} gate_ids_str="${row.gate_ids_str}" freq=${row.freq}`);
    console.log(`    Board変換後 ids: [${ids.join(', ')}]`);
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
