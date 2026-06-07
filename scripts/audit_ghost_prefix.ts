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

const TARGET_UID = '9924668a-a5ee-4bd3-a71e-f8f993e3f094';

type Build = { type: string; gate?: number; gates?: number[]; placedGateIds?: number[]; placed?: number };
type MoveRecord = { player?: string; positioning?: string; build?: Build; canonical_hash?: string; move_number?: number };

async function main() {
  // ── Step 1: 棋譜特定 ─────────────────────────────────────────────────────
  const { data: logs } = await sb
    .from('match_logs').select('id, user_id, full_record, mode, human_color')
    .eq('user_id', TARGET_UID)
    .in('mode', ['human_vs_cpu', 'online_pvp'])
    .not('full_record', 'is', null);

  console.log('=== Step 1: 対象棋譜の特定 ===\n');
  console.log('条件: full_record[0]=J selective([1,7]or[7,1])  full_record[1]=B quad  full_record[2]=G massive(7)');
  console.log();

  let targetLog: any = null;
  for (const log of (logs ?? [])) {
    const fr = log.full_record as MoveRecord[];
    if (!fr || fr.length < 3) continue;
    const m0 = fr[0], m1 = fr[1], m2 = fr[2];
    const isJSel = m0.positioning === 'J' && m0.build?.type === 'selective'
      && m0.build.gates?.some(g => g === 7) && m0.build.gates?.some(g => g === 1);
    const isBQuad = m1.positioning === 'B' && m1.build?.type === 'quad';
    const isGMassive7 = m2.positioning === 'G' && m2.build?.type === 'massive' && m2.build?.gate === 7;
    if (isJSel && isBQuad && isGMassive7) {
      targetLog = log;
      console.log(`✅ 発見: match_log.id = ${log.id}`);
      console.log(`   user_id: ${log.user_id}`);
      console.log();
      for (let i = 0; i < 3; i++) {
        const mv = fr[i];
        console.log(`full_record[${i}]:`);
        console.log(`  player=${mv.player} pos=${mv.positioning} type=${mv.build?.type}`);
        if (mv.build?.type === 'selective') console.log(`  gates=${JSON.stringify(mv.build.gates)}`);
        if (mv.build?.type === 'massive') console.log(`  gate=${mv.build.gate}`);
        if (mv.build?.type === 'quad') console.log(`  placedGateIds=${JSON.stringify(mv.build.placedGateIds)}`);
        console.log(`  canonical_hash=${mv.canonical_hash ?? '(none)'}`);
        console.log();
      }
      break;
    }
  }
  if (!targetLog) {
    console.log('❌ 条件に一致する棋譜が見つかりませんでした。');
    console.log('   条件を緩めて J selective ∧ B quad を含む棋譜を探します...\n');
    for (const log of (logs ?? [])) {
      const fr = log.full_record as MoveRecord[];
      if (!fr || fr.length < 2) continue;
      const m0 = fr[0], m1 = fr[1];
      const isJSel = m0.positioning === 'J' && m0.build?.type === 'selective';
      const isBQuad = m1.positioning === 'B' && m1.build?.type === 'quad';
      if (isJSel && isBQuad) {
        console.log(`  match_log.id=${log.id.slice(0,8)} fr[0]=${m0.positioning}/${m0.build?.type}/gates=${JSON.stringify(m0.build?.gates)} fr[1]=${m1.positioning}/${m1.build?.type} fr[2]=${fr[2]?.positioning}/${fr[2]?.build?.type}/gate=${fr[2]?.build?.gate}`);
        for (let i = 0; i < Math.min(3, fr.length); i++) {
          console.log(`    fr[${i}].canonical_hash=${fr[i].canonical_hash ?? '(none)'}`);
        }
      }
    }
    return;
  }

  const fr = targetLog.full_record as MoveRecord[];
  const hash_fr1 = fr[1].canonical_hash;
  const hash_fr2 = fr[2].canonical_hash; // これが M2後のhash (= p_canonical_hash として使うべき値)
  console.log(`full_record[1].canonical_hash = ${hash_fr1}`);
  console.log(`full_record[2].canonical_hash = ${hash_fr2}`);
  console.log();

  // ── Step 2: engine replay ────────────────────────────────────────────────
  console.log('=== Step 2: engine replay ===\n');
  const { createInitialState } = await import('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/src/game/initialState.ts');
  const { selectPosition, applySelectiveBuild, applyQuadBuild } = await import('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/src/game/engine.ts');
  const { computeCanonicalHashString } = await import('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/src/game/zobrist.ts');

  let state = createInitialState();
  console.log('初期状態: history.length=0, currentPlayer=' + state.currentPlayer);

  // M1: Black J selective([1,7]) — gates順序はfr[0]から取得
  const m0gates = fr[0].build?.gates as [number, number];
  state = selectPosition(state, 'J');
  state = applySelectiveBuild(state, m0gates);
  console.log(`M1後: history.length=${state.history.length}, currentPlayer=${state.currentPlayer}`);
  console.log(`  canonical_hash(M1後) = ${computeCanonicalHashString(state)}`);

  // M2: White B quad — placedGateIds から再現 (applyQuadBuild は全gate対象)
  state = selectPosition(state, 'B');
  state = applyQuadBuild(state);
  console.log(`M2後: history.length=${state.history.length}, currentPlayer=${state.currentPlayer}`);
  const replayHash = computeCanonicalHashString(state);
  console.log(`  canonical_hash(M2後) = ${replayHash}`);
  console.log();

  // ── Step 3: hash 比較 ────────────────────────────────────────────────────
  console.log('=== Step 3: hash 比較 ===\n');
  console.log(`full_record[1].canonical_hash (M1後の棋譜hash) = ${hash_fr1}`);
  console.log(`replay M1後の hash                             = ${computeCanonicalHashString((() => {
    let s = createInitialState();
    s = selectPosition(s, 'J');
    s = applySelectiveBuild(s, m0gates);
    return s;
  })())}`);
  console.log();
  console.log(`full_record[1].canonical_hash = fr[1] つまり M2(B quad)の手自体に付属するhash`);
  console.log(`  → これは M2が打たれた後の局面hash`);
  console.log(`  → replay M2後hash = ${replayHash}`);
  console.log();
  const match12 = hash_fr1 === replayHash;
  console.log(`[比較] fr[1].canonical_hash == replay M2後hash: ${match12 ? '✅ 一致' : '❌ 不一致'}`);
  if (!match12) {
    const replayHashM1 = computeCanonicalHashString((() => {
      let s = createInitialState();
      s = selectPosition(s, 'J');
      s = applySelectiveBuild(s, m0gates);
      return s;
    })());
    const match01 = hash_fr1 === replayHashM1;
    console.log(`[追加] fr[1].canonical_hash == replay M1後hash: ${match01 ? '✅ 一致 (1手ズレ!)' : '❌ 不一致'}`);
  }
  console.log();

  // ── Step 4: RPC ロジック確認 ─────────────────────────────────────────────
  console.log('=== Step 4: p_move_index=2 でのRPC探索シミュレーション ===\n');
  console.log('RPC条件: p_move_index=2, p_human_color=black');
  console.log(`p_canonical_hash (フロントから送られる値) = ${replayHash}`);
  console.log();
  console.log('RPC内部ロジック (p_move_index > 0):');
  console.log('  SELECT full_record -> (elem.ord::int) AS ghost_move');
  console.log('  FROM ... WHERE elem.move->>\'canonical_hash\' = p_canonical_hash');
  console.log('              AND elem.ord::int < jsonb_array_length(full_record)');
  console.log();
  console.log('つまり: full_record 内で canonical_hash = p_canonical_hash の MoveRecord を探し、');
  console.log('        その次のインデックスの手を返す');
  console.log();

  // full_record を走査して p_canonical_hash に一致する index を探す
  console.log(`対象棋譜 full_record 走査 (p_canonical_hash=${replayHash}):`)
  for (let i = 0; i < fr.length; i++) {
    const mv = fr[i];
    const h = mv.canonical_hash ?? '(none)';
    const match = h === replayHash;
    if (match || i < 4) {
      console.log(`  fr[${i}]: player=${mv.player} pos=${mv.positioning} canonical_hash=${h} ${match ? '← ✅ MATCH' : ''}`);
    }
  }
  console.log();

  // ORDINALITY は 1-based → fr[ord] でアクセス
  // ord=2 (fr[1]がマッチ) → full_record -> 2 = fr[2] = G massive(7) ✅
  // ord=1 (fr[0]がマッチ) → full_record -> 1 = fr[1] = B quad (不正解)
  console.log('=== Step 5: canonical_hash の "手が打たれた後のhash" 問題 ===\n');
  console.log('canonical_hash の定義: MoveRecord に付属する hash は「この手を打った後の局面」\n');
  console.log('full_record[0] (M1: J selective) の canonical_hash が示す局面:');
  console.log('  → M1を打った後の局面');
  console.log('full_record[1] (M2: B quad) の canonical_hash が示す局面:');
  console.log('  → M2を打った後の局面 (= Naoyaが M2後に見ている局面)');
  console.log();
  console.log('M3 Ghost取得時のフロント:');
  console.log(`  history.length = 2 → p_move_index = 2`);
  console.log(`  computeCanonicalHashString(state) = M2後hash = ${replayHash}`);
  console.log();
  console.log('RPC検索: full_record 内で canonical_hash = M2後hash の手は fr[1] (M2: B quad)');
  console.log('  ord=2 (1-based) → full_record -> 2 = fr[2] = G massive(7)');
  console.log();
  const fr1hash = fr[1].canonical_hash;
  if (fr1hash === replayHash) {
    console.log(`✅ fr[1].canonical_hash = ${fr1hash} → RPC は fr[2] = G massive(7) を返すはず`);
  } else {
    console.log(`❌ fr[1].canonical_hash = ${fr1hash}`);
    console.log(`   replay M2後hash    = ${replayHash}`);
    console.log('   → RPC は G massive(7) を返せない（hash 不一致）');
    console.log();
    console.log('p_move_index の使われ方を確認:');
    console.log('  App.tsx: p_move_index = state.history.length = 2');
    console.log('  RPC: WHERE p_move_index > 0 AND canonical_hash = p_canonical_hash');
    console.log('  → p_move_index は 0/1 の分岐にのみ使用。値 "2" は直接使用されない');
    console.log('  → "p_move_index > 0" 条件は満たされる (2 > 0 = true)');
  }
}
main().catch(e => { console.error(e); process.exit(1); });
