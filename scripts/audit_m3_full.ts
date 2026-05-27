import { readFileSync } from 'fs';
try {
  const lines = readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/.env', 'utf-8').split('\n');
  for (const line of lines) { const t=line.trim(); if(!t||t.startsWith('#'))continue; const idx=t.indexOf('='); if(idx<0)continue; const k=t.slice(0,idx).trim(); const v=t.slice(idx+1).trim().replace(/^["']|["']$/g,''); if(!process.env[k])process.env[k]=v; }
} catch {}

import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const { createInitialState } = await import('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/src/game/initialState.ts');
const { selectPosition, applySelectiveBuild, applyQuadBuildForGates } = await import('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/src/game/engine.ts');
const { computeCanonicalHashString } = await import('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/src/game/zobrist.ts');
const { ghostMovesToDisplayTargets } = await import('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/src/game/ghostUtils.ts');

async function main() {
  // ── Step 1: App.tsx と同じ経路で M2後 state を再現 ─────────────────────
  // CPU は applyQuadBuildForGates(state, [2,3,6,11]) を使う
  console.log('=== Step 1: App.tsx 経路で M2後 state を再現 ===\n');
  let state = createInitialState();
  console.log(`初期: history=${state.history.length} player=${state.currentPlayer} moveNumber=${(state as any).moveNumber}`);

  // M1: black J selective([7,1])
  state = selectPosition(state, 'J');
  state = applySelectiveBuild(state, [7, 1]);
  const hashAfterM1 = computeCanonicalHashString(state);
  console.log(`M1後: history=${state.history.length} player=${state.currentPlayer} moveNumber=${(state as any).moveNumber} hash=${hashAfterM1}`);

  // M2: white B quad — applyQuadBuildForGates([2,3,6,11]) ← CPUが実際に使う関数
  state = selectPosition(state, 'B');
  state = applyQuadBuildForGates(state, [2, 3, 6, 11]);
  const hashAfterM2 = computeCanonicalHashString(state);
  console.log(`M2後: history=${state.history.length} player=${state.currentPlayer} moveNumber=${(state as any).moveNumber} hash=${hashAfterM2}`);
  console.log(`  expected: 61f227bbe714b5ea`);
  console.log(`  match:    ${hashAfterM2 === '61f227bbe714b5ea' ? '✅' : '❌'}`);

  // ── Step 2: App.tsx の Ghost fetch 条件を確認 ──────────────────────────
  console.log('\n=== Step 2: App.tsx Ghost fetch 条件監査 ===\n');
  console.log('useEffect deps: [ghostModeActive, showGhostToggle, state.history.length, state.currentPlayer]');
  console.log();
  console.log('M2後の値:');
  console.log(`  state.history.length = ${state.history.length}  (変化: 1→2 → effect 再実行 ✅)`);
  console.log(`  state.currentPlayer  = ${state.currentPlayer}   (変化: white→black → effect 再実行 ✅)`);
  console.log();

  const cpuPlayer = 'white';
  const gameEnded = false;
  const gameMode  = 'human_vs_cpu';
  const isHumanTurn = !gameEnded && cpuPlayer !== null && state.currentPlayer !== cpuPlayer;
  const humanColor  = cpuPlayer === 'black' ? 'white' : 'black';

  console.log('effect 内の条件チェック:');
  console.log(`  ghostModeActive: (ユーザー操作 — ON 前提)`);
  console.log(`  showGhostToggle: proActive && gameMode !== 'human_vs_human'`);
  console.log(`    → proActive は非同期フェッチ済みと仮定`);
  console.log(`    → gameMode = '${gameMode}' ≠ 'human_vs_human' ✅`);
  console.log(`  isHumanTurn = ${isHumanTurn} ✅`);
  console.log(`  humanColor  = '${humanColor}' ✅`);
  console.log();
  console.log('fetchGhostMoves に渡される値:');
  console.log(`  hash         = ${hashAfterM2}`);
  console.log(`  humanColor   = '${humanColor}'`);
  console.log(`  p_move_index = ${state.history.length}`);

  // ── Step 3: RPC 相当 SQL をサービスロールで直接実行 ─────────────────────
  console.log('\n=== Step 3: RPC 相当クエリをサービスロール直接実行 ===\n');
  console.log('注意: service_role では auth.uid() = NULL のため RPC 直接呼び出し不可。');
  console.log('match_logs を直接クエリして RPC ロジックを JS で再現。\n');

  const UID = '9924668a-a5ee-4bd3-a71e-f8f993e3f094';
  const { data: logs } = await sb
    .from('match_logs').select('id, full_record, mode')
    .eq('user_id', UID).in('mode', ['human_vs_cpu', 'online_pvp'])
    .not('full_record', 'is', null);

  type MR = { player?: string; positioning?: string; build?: any; canonical_hash?: string };
  const candidates: { ghost_move: MR }[] = [];
  for (const log of (logs ?? [])) {
    const fr = log.full_record as MR[];
    if (!fr) continue;
    for (let i = 0; i < fr.length; i++) {
      if (fr[i].canonical_hash === hashAfterM2 && i + 1 < fr.length) {
        candidates.push({ ghost_move: fr[i + 1] });
      }
    }
  }
  const filtered = candidates.filter(c => c.ghost_move?.player === humanColor);
  console.log(`canonical_hash '${hashAfterM2}' マッチ: ${candidates.length}件`);
  console.log(`player='${humanColor}' フィルタ後: ${filtered.length}件`);
  filtered.forEach(c => {
    const b = c.ghost_move.build;
    console.log(`  pos=${c.ghost_move.positioning} type=${b?.type} gate=${b?.gate} gates=${JSON.stringify(b?.gates)} placed=${JSON.stringify(b?.placedGateIds)}`);
  });

  // GROUP BY
  const agg = new Map<string, { pos: string; btype: string; b_gate: number|null; b_gates: number[]|null; b_placed: number[]|null; freq: number }>();
  for (const c of filtered) {
    const mv = c.ghost_move;
    const pos = mv.positioning ?? 'P'; const btype = mv.build?.type ?? 'skip';
    let b_gate: number|null = null, b_gates: number[]|null = null, b_placed: number[]|null = null;
    if (btype === 'massive') b_gate = mv.build?.gate ?? null;
    else if (btype === 'selective' && mv.build?.gates) b_gates = mv.build.gates.filter((g: number) => g > 0).sort((a:number,b:number)=>a-b);
    else if (btype === 'quad' && mv.build?.placedGateIds) b_placed = [...mv.build.placedGateIds].sort((a:number,b:number)=>a-b);
    const key = `${pos}|${btype}|${b_gate}|${JSON.stringify(b_gates)}|${JSON.stringify(b_placed)}`;
    const ex = agg.get(key);
    if (ex) ex.freq++; else agg.set(key, { pos, btype, b_gate, b_gates, b_placed, freq: 1 });
  }
  const sorted = [...agg.values()].sort((a,b) => b.freq - a.freq);
  console.log('\nRPC 返却シミュレーション:');
  sorted.forEach(r => console.log(`  pos=${r.pos} type=${r.btype} gate=${r.b_gate} gates=${JSON.stringify(r.b_gates)} placed=${JSON.stringify(r.b_placed)} freq=${r.freq}`));

  // ── Step 4: ghostMovesToDisplayTargets 確認 ──────────────────────────────
  console.log('\n=== Step 4: ghostMovesToDisplayTargets 確認 ===\n');
  type GM = Parameters<typeof ghostMovesToDisplayTargets>[0][0];
  const ghostMoves: GM[] = sorted.map(r => ({
    positioning: r.pos, build_type: r.btype,
    build_gate: r.b_gate, build_gates: r.b_gates, build_placed_gate_ids: r.b_placed, frequency: r.freq
  }));
  const { opacityMap, gateMap } = ghostMovesToDisplayTargets(ghostMoves);
  console.log('opacityMap:', Object.fromEntries(opacityMap));
  console.log('gateMap:', Object.fromEntries(gateMap));
  console.log(`G position: ${opacityMap.has('G') ? `✅ opacity=${opacityMap.get('G')?.toFixed(3)}` : '❌ なし'}`);
  console.log(`7:large:    ${gateMap.has('7:large') ? `✅ opacity=${gateMap.get('7:large')?.toFixed(3)}` : '❌ なし'}`);

  // ── Step 5: Vercel 本番の JS ハッシュ確認 ─────────────────────────────────
  console.log('\n=== Step 5: Vercel 本番の deploy 確認 ===\n');
  const latestCommit = (await import('child_process').then(m => m.execSync('cd /Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp && git log --oneline -3', {encoding:'utf-8'}))).trim();
  console.log('ローカル最新:');
  latestCommit.split('\n').forEach(l => console.log('  ' + l));

  // ── Step 6: fetchGhostMoves の RPC 名・戻り型確認 ─────────────────────
  console.log('\n=== Step 6: fetchGhostMoves 実装確認 ===\n');
  const matchLogSrc = readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/src/lib/matchLog.ts', 'utf-8');
  const lines = matchLogSrc.split('\n');
  const start = lines.findIndex(l => l.includes('export async function fetchGhostMoves'));
  lines.slice(start, start + 15).forEach(l => console.log('  ' + l));
}

main().catch(e => { console.error(e); process.exit(1); });
