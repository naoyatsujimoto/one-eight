import { readFileSync } from 'fs';
try {
  const lines = readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/.env', 'utf-8').split('\n');
  for (const line of lines) { const t=line.trim(); if(!t||t.startsWith('#'))continue; const idx=t.indexOf('='); if(idx<0)continue; const k=t.slice(0,idx).trim(); const v=t.slice(idx+1).trim().replace(/^["']|["']$/g,''); if(!process.env[k])process.env[k]=v; }
} catch {}

import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { createInitialState } = await import('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/src/game/initialState.ts');
const { selectPosition, applySelectiveBuild, applyQuadBuild } = await import('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/src/game/engine.ts');
const { computeCanonicalHashString } = await import('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/src/game/zobrist.ts');

const LOG_ID = '113969e1-929f-48c2-92f1-d1cff4e2bff4';
type MR = { player?: string; positioning?: string; build?: any; canonical_hash?: string; move_number?: number };

async function main() {
  const { data: log } = await sb.from('match_logs').select('full_record').eq('id', LOG_ID).single();
  const fr = log!.full_record as MR[];

  console.log('=== 113969e1 の move_number 確認 ===\n');
  for (let i = 0; i < Math.min(5, fr.length); i++) {
    const mv = fr[i];
    console.log(`fr[${i}]: player=${mv.player} pos=${mv.positioning} type=${mv.build?.type} move_number=${mv.move_number ?? '(none)'} canonical_hash=${mv.canonical_hash ?? '(none)'}`);
  }

  console.log('\n=== initialState の moveNumber ===\n');
  const s0 = createInitialState();
  console.log(`初期 moveNumber = ${(s0 as any).moveNumber}`);

  // M1 → M2 replay でmoveNumberを追跡
  let s = createInitialState();
  console.log(`M0: moveNumber=${(s as any).moveNumber}, currentPlayer=${s.currentPlayer}`);
  s = selectPosition(s, 'J');
  s = applySelectiveBuild(s, [7,1] as [number,number]);
  console.log(`M1後: moveNumber=${(s as any).moveNumber}, currentPlayer=${s.currentPlayer}, hash=${computeCanonicalHashString(s)}`);
  s = selectPosition(s, 'B');
  s = applyQuadBuild(s);
  console.log(`M2後: moveNumber=${(s as any).moveNumber}, currentPlayer=${s.currentPlayer}, hash=${computeCanonicalHashString(s)}`);

  console.log(`\n期待: fr[1].canonical_hash=${fr[1].canonical_hash}`);
  console.log(`実際: replay M2後hash      =${computeCanonicalHashString(s)}`);
  const match = computeCanonicalHashString(s) === fr[1].canonical_hash;
  console.log(`一致: ${match ? '✅' : '❌'}`);

  // fr[1].move_number と replay moveNumber が一致するか
  console.log(`\nfr[1].move_number=${fr[1].move_number ?? '(none)'}  replay moveNumber after M2=${(s as any).moveNumber}`);
  if (fr[1].move_number !== undefined) {
    console.log(`move_number 一致: ${fr[1].move_number === (s as any).moveNumber ? '✅' : '❌ 不一致!'}`);
  }

  // ハッシュに moveNumber が含まれる確認
  console.log('\n=== moveNumber が hash に与える影響 ===\n');
  // 同じ盤面で moveNumber を変えたときに hash が変わるか
  const s2 = { ...(s as any), moveNumber: (s as any).moveNumber + 1 };
  const h1 = computeCanonicalHashString(s as any);
  const h2 = computeCanonicalHashString(s2);
  console.log(`moveNumber=${(s as any).moveNumber}: hash=${h1}`);
  console.log(`moveNumber=${(s as any).moveNumber + 1}: hash=${h2}`);
  console.log(`moveNumber変化でhashが変わる: ${h1 !== h2 ? '✅ YES (hashにmoveNumberが含まれる)' : 'NO'}`);

  // 結論
  console.log('\n=== 結論 ===\n');
  if (h1 !== h2) {
    console.log('canonical_hash に moveNumber が含まれる。');
    console.log('再現時のゲームが同じ moveNumber から始まるなら問題なし。');
    console.log('ただし: ゲームを途中から再開した場合や moveNumber がずれると不一致になる。');
    if (fr[1].move_number !== undefined && fr[1].move_number !== (s as any).moveNumber) {
      console.log('❌ fr[1].move_number と replay moveNumber が不一致 → これが原因');
    } else if (match) {
      console.log('✅ moveNumber 含む hash が一致 → hash 問題なし');
      console.log('問題は App.tsx の Ghost fetch タイミングか、別の原因');
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
