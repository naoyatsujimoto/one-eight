import { readFileSync } from 'fs';
try {
  const lines = readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/.env', 'utf-8').split('\n');
  for (const line of lines) { const t=line.trim(); if(!t||t.startsWith('#'))continue; const idx=t.indexOf('='); if(idx<0)continue; const k=t.slice(0,idx).trim(); const v=t.slice(idx+1).trim().replace(/^["']|["']$/g,''); if(!process.env[k])process.env[k]=v; }
} catch {}

import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const LOG_ID = '113969e1-929f-48c2-92f1-d1cff4e2bff4';

async function main() {
  // Step 1: match_logs の全カラムを確認
  console.log('=== Step 1: match_logs カラム一覧 ===\n');
  const { data: sample } = await sb.from('match_logs').select('*').limit(1).single();
  if (sample) {
    console.log('存在するカラム:');
    for (const key of Object.keys(sample)) {
      const val = (sample as any)[key];
      const preview = val === null ? 'null' : typeof val === 'object' ? '[object]' : String(val).slice(0, 60);
      console.log(`  ${key}: ${preview}`);
    }
  }

  // Step 2: 該当対局の全カラム値を確認
  console.log('\n=== Step 2: 113969e1 の全カラム値 ===\n');
  const { data: log } = await sb.from('match_logs').select('*').eq('id', LOG_ID).single();
  if (log) {
    for (const key of Object.keys(log as object)) {
      const val = (log as any)[key];
      if (key === 'full_record') {
        console.log(`  ${key}: [array length=${Array.isArray(val) ? val.length : '?'}]`);
      } else if (val === null) {
        console.log(`  ${key}: null`);
      } else if (typeof val === 'object') {
        console.log(`  ${key}: ${JSON.stringify(val).slice(0, 100)}`);
      } else {
        console.log(`  ${key}: ${String(val).slice(0, 100)}`);
      }
    }
  }

  // Step 3: difficulty 関連カラムの確認
  console.log('\n=== Step 3: difficulty 関連カラム ===\n');
  const diffCols = ['difficulty', 'cpu_difficulty', 'settings', 'metadata', 'mode', 'human_color'];
  for (const col of diffCols) {
    if (log && col in (log as object)) {
      console.log(`  ✅ ${col}: ${JSON.stringify((log as any)[col])}`);
    } else {
      console.log(`  ❌ ${col}: カラムなし`);
    }
  }

  // Step 4: full_record から difficulty を推測できるか
  console.log('\n=== Step 4: full_record から難易度推測 ===\n');
  const fr = (log as any).full_record;
  if (fr && fr.length > 0) {
    // full_record[0] に difficulty フィールドがあるか
    console.log('full_record[0] のキー:', Object.keys(fr[0]).join(', '));
    if (fr[0].difficulty) console.log(`  full_record[0].difficulty: ${fr[0].difficulty}`);
    if (fr[0].cpuDifficulty) console.log(`  full_record[0].cpuDifficulty: ${fr[0].cpuDifficulty}`);

    // CPU手番（white）の手を確認して難易度を推測
    const whiteMoves = fr.filter((mv: any) => mv.player === 'white').slice(0, 5);
    console.log('\nCPU(white)の最初の5手:');
    for (const mv of whiteMoves) {
      const b = mv.build;
      const detail = b?.type === 'massive' ? `gate=${b.gate}` :
                     b?.type === 'selective' ? `gates=${JSON.stringify(b.gates)}` :
                     b?.type === 'quad' ? `placed=${JSON.stringify(b.placedGateIds)}` : '';
      console.log(`  pos=${mv.positioning} type=${b?.type} ${detail}`);
    }
  }

  // Step 5: match_logs の saveMatchLog 呼び出し側を確認
  console.log('\n=== Step 5: saveMatchLog に difficulty は渡されているか ===\n');
  // matchLog.ts を確認
  const matchLogTs = readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/src/lib/matchLog.ts', 'utf-8');
  const saveSection = matchLogTs.split('\n').filter(l => l.includes('difficulty') || l.includes('cpu_difficulty') || l.includes('saveMatchLog')).slice(0, 20);
  console.log('matchLog.ts 内の difficulty 関連行:');
  for (const l of saveSection) console.log(`  ${l.trim()}`);

  // App.tsx の saveMatchLog 呼び出し箇所
  const appTs = readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/src/app/App.tsx', 'utf-8');
  const saveCall = appTs.split('\n').filter((l,i,arr) => {
    return l.includes('saveMatchLog') || (arr[i-1]?.includes('saveMatchLog') || arr[i+1]?.includes('saveMatchLog'));
  }).slice(0, 15);
  console.log('\nApp.tsx の saveMatchLog 呼び出し周辺:');
  for (const l of saveCall) console.log(`  ${l.trim()}`);

  // Step 6: Ghost 不表示との関係まとめ
  console.log('\n=== Step 6: Ghost 不表示との関係 ===\n');
  console.log('CPU難易度が保存されていない場合:');
  console.log('  → 113969e1 の再現時に、Naoyaが同じ難易度を使っていたか不明');
  console.log('  → 別難易度だと CPU が M2 で B quad 以外を選ぶ可能性がある');
  console.log('  → その場合、M2後のhashが 61f227bbe714b5ea にならない');
  console.log('  → RPC は canonical_hash でマッチングするため、hash が違えば空を返す');
  console.log('  → これが Ghost 不表示の直接原因になりえる');
}

main().catch(e => { console.error(e); process.exit(1); });
