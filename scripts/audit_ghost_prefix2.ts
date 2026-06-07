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

const TARGET_UID  = '9924668a-a5ee-4bd3-a71e-f8f993e3f094';
const P_HASH      = '61f227bbe714b5ea'; // M2(B quad)後のhash = fr[1].canonical_hash
const P_COLOR     = 'black';
const P_IDX       = 2;

type Build = { type: string; gate?: number; gates?: number[]; placedGateIds?: number[] };
type MoveRecord = { player?: string; positioning?: string; build?: Build; canonical_hash?: string };

async function main() {
  // ── Step 1: RPC の完全シミュレーション（service_role で直接） ─────────────
  console.log('=== RPC v2 完全シミュレーション ===\n');
  console.log(`p_canonical_hash = ${P_HASH}`);
  console.log(`p_human_color    = ${P_COLOR}`);
  console.log(`p_move_index     = ${P_IDX}\n`);

  const { data: logs } = await sb
    .from('match_logs').select('id, full_record, mode')
    .eq('user_id', TARGET_UID)
    .in('mode', ['human_vs_cpu', 'online_pvp'])
    .not('full_record', 'is', null);

  console.log(`対象 match_logs 件数: ${logs?.length ?? 0}\n`);

  // ghost_candidates の UNION ALL ロジックを JS で再現
  const ghostCandidates: { ghost_move: MoveRecord; from_log: string }[] = [];

  for (const log of (logs ?? [])) {
    const fr = log.full_record as MoveRecord[];
    if (!fr || fr.length === 0) continue;

    if (P_IDX === 0) {
      // 初手: fr[0] を直接使用
      ghostCandidates.push({ ghost_move: fr[0], from_log: log.id.slice(0,8) });
    } else {
      // p_move_index > 0: canonical_hash マッチした次の手
      for (let i = 0; i < fr.length; i++) {
        if (fr[i].canonical_hash === P_HASH && i + 1 < fr.length) {
          ghostCandidates.push({ ghost_move: fr[i + 1], from_log: log.id.slice(0,8) });
        }
      }
    }
  }

  console.log(`ghost_candidates 件数: ${ghostCandidates.length}`);
  if (ghostCandidates.length === 0) {
    console.log('❌ ghost_candidates が空 → RPC は空配列を返す');
    console.log('原因: p_canonical_hash に一致する MoveRecord が存在しないか、');
    console.log('      一致しても次の手が存在しない');
    return;
  }
  console.log();

  // filtered: player フィルタ適用
  const filtered = ghostCandidates.filter(c =>
    c.ghost_move && (!P_COLOR || c.ghost_move.player === P_COLOR)
  );

  console.log(`filtered (player=${P_COLOR}) 件数: ${filtered.length}`);
  for (const c of filtered) {
    const b = c.ghost_move.build;
    console.log(`  from_log=${c.from_log} player=${c.ghost_move.player} pos=${c.ghost_move.positioning} type=${b?.type} gate=${b?.gate} gates=${JSON.stringify(b?.gates)} placed=${JSON.stringify(b?.placedGateIds)}`);
  }
  console.log();

  // GROUP BY して frequency を集計
  const agg = new Map<string, { pos: string; btype: string; b_gate: number|null; b_gates: number[]|null; b_placed: number[]|null; freq: number }>();
  for (const c of filtered) {
    const mv = c.ghost_move;
    const pos = mv.positioning ?? 'P';
    const btype = mv.build?.type ?? 'skip';
    let b_gate: number|null = null, b_gates: number[]|null = null, b_placed: number[]|null = null;
    if (btype === 'massive') b_gate = mv.build?.gate != null ? mv.build.gate : null;
    else if (btype === 'selective' && mv.build?.gates) b_gates = mv.build.gates.filter(g => g > 0).sort((a,b)=>a-b);
    else if (btype === 'quad' && mv.build?.placedGateIds) b_placed = [...mv.build.placedGateIds].sort((a,b)=>a-b);
    const key = `${pos}|${btype}|${b_gate}|${JSON.stringify(b_gates)}|${JSON.stringify(b_placed)}`;
    const ex = agg.get(key);
    if (ex) ex.freq++;
    else agg.set(key, { pos, btype, b_gate, b_gates, b_placed, freq: 1 });
  }

  console.log('=== RPC 返却シミュレーション（GROUP BY 集計結果） ===\n');
  const sorted = [...agg.values()].sort((a,b) => b.freq - a.freq);
  if (sorted.length === 0) {
    console.log('❌ 集計結果が0件 → RPC は空配列を返す');
    return;
  }
  for (const r of sorted) {
    const g12 = r.b_gate === 7 ? ' ← G massive(7)' : '';
    console.log(`  pos=${r.pos} type=${r.btype} gate=${r.b_gate} gates=${JSON.stringify(r.b_gates)} placed=${JSON.stringify(r.b_placed)} freq=${r.freq}${g12}`);
  }

  // ── Step 2: App.tsx の p_canonical_hash 計算を再確認 ───────────────────
  console.log('\n=== App.tsx から渡される p_canonical_hash の確認 ===\n');
  const { createInitialState } = await import('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/src/game/initialState.ts');
  const { selectPosition, applySelectiveBuild, applyQuadBuild } = await import('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/src/game/engine.ts');
  const { computeCanonicalHashString } = await import('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/src/game/zobrist.ts');

  // 両パターン確認: gates=[7,1] と [1,7]
  for (const gatesOrder of [[7,1], [1,7]] as [number,number][]) {
    let s = createInitialState();
    s = selectPosition(s, 'J');
    s = applySelectiveBuild(s, gatesOrder);
    s = selectPosition(s, 'B');
    s = applyQuadBuild(s);
    const h = computeCanonicalHashString(s);
    const match = h === P_HASH;
    console.log(`gates=${JSON.stringify(gatesOrder)}: hash=${h} ${match ? '✅ = P_HASH' : `❌ ≠ P_HASH(${P_HASH})`}`);
  }

  // ── Step 3: フロント側の Ghost 表示確認 ─────────────────────────────────
  console.log('\n=== Step 3: ghostMovesToDisplayTargets 適用結果 ===\n');
  const { ghostMovesToDisplayTargets } = await import('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/src/game/ghostUtils.ts');
  type GM = Parameters<typeof ghostMovesToDisplayTargets>[0][0];

  const ghostMoves: GM[] = sorted.map(r => ({
    positioning: r.pos,
    build_type: r.btype,
    build_gate: r.b_gate,
    build_gates: r.b_gates,
    build_placed_gate_ids: r.b_placed,
    frequency: r.freq,
  }));

  const { opacityMap, gateMap } = ghostMovesToDisplayTargets(ghostMoves);
  console.log('opacityMap (Position):');
  for (const [pos, op] of opacityMap) console.log(`  ${pos}: ${op.toFixed(3)}`);
  console.log('gateMap (Gate:pocket):');
  for (const [k, op] of gateMap) console.log(`  ${k}: ${op.toFixed(3)}`);
  if (gateMap.size === 0) {
    console.log('  (空)');
    console.log('  → Board には Ghost が表示されない');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
