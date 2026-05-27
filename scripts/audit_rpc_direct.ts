import { readFileSync } from 'fs';
try {
  const lines = readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/.env', 'utf-8').split('\n');
  for (const line of lines) { const t=line.trim(); if(!t||t.startsWith('#'))continue; const idx=t.indexOf('='); if(idx<0)continue; const k=t.slice(0,idx).trim(); const v=t.slice(idx+1).trim().replace(/^["']|["']$/g,''); if(!process.env[k])process.env[k]=v; }
} catch {}

import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const UID  = '9924668a-a5ee-4bd3-a71e-f8f993e3f094';
const HASH = '61f227bbe714b5ea';

async function main() {
  // ── 実際の RPC 定義を pg_proc で確認 ─────────────────────────────────
  console.log('=== get_ghost_moves 関数定義確認 ===\n');

  // information_schema.routines は Supabase REST 経由でアクセス可能
  const { data: routines, error: rErr } = await sb
    .schema('information_schema')
    .from('routines' as any)
    .select('routine_name, external_language, security_type, routine_body')
    .eq('routine_schema', 'public')
    .eq('routine_name', 'get_ghost_moves');

  if (rErr) {
    console.log('information_schema.routines:', rErr.message);
  } else {
    console.log('routines:', JSON.stringify(routines, null, 2));
  }

  // return type を確認
  const { data: params, error: pErr } = await sb
    .schema('information_schema')
    .from('parameters' as any)
    .select('parameter_name, data_type, parameter_mode, ordinal_position')
    .eq('specific_schema', 'public')
    .eq('specific_name', 'get_ghost_moves')
    .order('ordinal_position');

  if (pErr) {
    console.log('information_schema.parameters:', pErr.message);
  } else {
    console.log('\nRPC パラメータ:', JSON.stringify(params, null, 2));
  }

  // ── admin API で user を確認し、generateLink でトークン取得を試みる ───
  console.log('\n=== Supabase admin API ===\n');
  const { data: userData, error: uErr } = await sb.auth.admin.getUserById(UID);
  if (uErr) {
    console.log('getUserById error:', uErr.message);
  } else {
    console.log('user:', userData.user?.email, '/ last_sign_in:', userData.user?.last_sign_in_at);
  }

  // ── 実際の RPC をユーザートークンで呼ぶ唯一の方法:
  //    signInWithPassword でトークンを取得して supabase client に設定
  //    → パスワードが必要。.env に存在すれば使用。
  const testEmail = 'tsujimoto@tentomushi.co.jp';
  const testPwd   = process.env.TEST_USER_PASSWORD || process.env.USER_PASSWORD;

  if (testPwd) {
    console.log('\nTEST_USER_PASSWORD あり → 認証ユーザーとして RPC 呼び出し...\n');
    const sbUser = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
    const { data: signIn, error: signInErr } = await sbUser.auth.signInWithPassword({
      email: testEmail, password: testPwd
    });
    if (signInErr) {
      console.log('signIn error:', signInErr.message);
    } else {
      console.log('認証成功! user:', signIn.user?.email);
      // 認証された client で RPC 呼び出し
      const { data: rpcData, error: rpcErr } = await sbUser.rpc('get_ghost_moves', {
        p_canonical_hash: HASH,
        p_human_color: 'black',
        p_move_index: 2
      });
      if (rpcErr) {
        console.log('RPC error:', rpcErr.message);
      } else {
        console.log(`\nRPC 実行結果 (p_move_index=2, hash=${HASH}):`);
        console.log(`  count: ${Array.isArray(rpcData) ? rpcData.length : '?'}`);
        console.log(`  data: ${JSON.stringify(rpcData, null, 2)}`);
        const hasG7 = Array.isArray(rpcData) && rpcData.some((r: any) =>
          r.positioning === 'G' && r.build_type === 'massive' && r.build_gate === 7
        );
        console.log(`  G massive(7) 含む: ${hasG7 ? '✅ YES' : '❌ NO'}`);
        if (!hasG7 && Array.isArray(rpcData)) {
          console.log('  → 原因: 実 RPC が G massive(7) を返していない');
          console.log('  → SQL または auth コンテキストの問題');
        }
      }
      await sbUser.auth.signOut();
    }
  } else {
    console.log('\nTEST_USER_PASSWORD 未設定。パスワード認証でのRPC直接実行スキップ。');
    console.log('代替: information_schema で return column を確認して v2 適用状態を検証。\n');

    // return columns 確認
    const { data: cols, error: cErr } = await sb
      .schema('information_schema')
      .from('columns' as any)
      .select('table_name, column_name, data_type')
      .eq('table_schema', 'public')
      .like('table_name', '%ghost%');

    if (cErr) console.log('columns error:', cErr.message);
    else console.log('ghost 関連テーブル:', JSON.stringify(cols, null, 2));
  }
}
main().catch(e => { console.error(e); process.exit(1); });
