// BY-2.5: DB state verification (read-only)
import { readFileSync } from 'fs';
try {
  const lines = readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/.env', 'utf-8').split('\n');
  for (const line of lines) { const t=line.trim(); if(!t||t.startsWith('#'))continue; const idx=t.indexOf('='); if(idx<0)continue; const k=t.slice(0,idx).trim(); const v=t.slice(idx+1).trim().replace(/^["']|["']$/g,''); if(!process.env[k])process.env[k]=v; }
} catch {}

import { createClient } from '@supabase/supabase-js';
const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  console.log('=== BY-2.5: DB状態確認 ===\n');

  // 1. online_games カラム確認（official_starts_at が存在するか）
  console.log('--- online_games カラム確認 ---');
  const { data: r1, error: e1 } = await sb
    .from('online_games')
    .select('official_starts_at')
    .limit(1);
  if (e1) {
    console.log('official_starts_at SELECT ERROR:', e1.message);
    console.log('→ カラムが存在しない可能性 (om1c未適用の可能性あり)');
  } else {
    console.log('official_starts_at カラム存在: ✅');
    console.log('sample:', JSON.stringify(r1));
  }

  // 2. online_games にある recent games の official_starts_at 値確認
  console.log('\n--- recent online_games official_starts_at 値 ---');
  const { data: r2, error: e2 } = await sb
    .from('online_games')
    .select('id, status, official_starts_at, created_at')
    .not('official_starts_at', 'is', null)
    .order('created_at', { ascending: false })
    .limit(3);
  if (e2) {
    console.log('ERROR:', e2.message);
  } else {
    console.log('official_starts_at NOT NULL の games:', r2?.length ?? 0, '件');
    console.log(JSON.stringify(r2, null, 2));
  }

  // 3. apply_online_move の戻り値確認 (service_role で呼び出し → auth.uid()=null → not_your_turn 相当のエラー)
  // このエラーメッセージの中身でどのバージョンの関数が入っているか確認
  console.log('\n--- apply_online_move RPC エラーメッセージ確認 ---');
  const { data: r3, error: e3 } = await sb.rpc('apply_online_move' as any, {
    p_game_id: '00000000-0000-0000-0000-000000000000',
    p_expected_move_number: 1,
    p_new_game_state: {},
    p_next_player_id: '00000000-0000-0000-0000-000000000001',
  });
  if (e3) {
    console.log('Error message:', e3.message);
    console.log('Error code:', e3.code);
    // game_not_found → 関数到達確認
  } else {
    console.log('Unexpected success:', r3);
  }

  // 4. enter_official_match の戻り値フィールドを確認する (同様にエラー確認)
  console.log('\n--- enter_official_match RPC signature確認 ---');
  const { data: r4, error: e4 } = await sb.rpc('enter_official_match' as any, {
    p_match_id: '00000000-0000-0000-0000-000000000000',
    p_initial_state: {},
  });
  if (e4) {
    console.log('enter_official_match Error:', e4.message);
  } else {
    console.log('Result keys:', Object.keys(r4 || {}));
    // is_official, starts_at があれば om1c 適用済み
    console.log('has is_official:', 'is_official' in (r4 || {}));
    console.log('has starts_at:', 'starts_at' in (r4 || {}));
  }
}

main().catch(console.error);
