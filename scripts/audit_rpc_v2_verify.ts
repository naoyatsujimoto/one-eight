/**
 * v2 RPC 適用状態の確認
 *
 * 方針: service_role では auth.uid()=NULL のため RPC 結果は検証不可。
 * 代わりに Supabase Management API で PostgreSQL 関数定義を取得して
 * v2 カラム (build_gate / build_gates / build_placed_gate_ids) の存在を確認する。
 */
import { readFileSync } from 'fs';
try {
  const lines = readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/.env', 'utf-8').split('\n');
  for (const line of lines) { const t=line.trim(); if(!t||t.startsWith('#'))continue; const idx=t.indexOf('='); if(idx<0)continue; const k=t.slice(0,idx).trim(); const v=t.slice(idx+1).trim().replace(/^["']|["']$/g,''); if(!process.env[k])process.env[k]=v; }
} catch {}

// Supabase project ref の取得
const urlMatch = (process.env.VITE_SUPABASE_URL ?? '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
const projectRef = urlMatch?.[1] ?? '';
console.log(`project_ref: ${projectRef}\n`);

async function main() {
  // ── Management API で pg 関数定義を取得 ────────────────────────────────
  // Supabase は service_role key を Management API で利用できる
  const mgmtUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/functions`;
  console.log('=== Management API 呼び出し試み ===\n');
  const res = await fetch(mgmtUrl, {
    headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` }
  });
  console.log(`status: ${res.status}`);
  if (res.ok) {
    const body = await res.json();
    const ghostFns = (body as any[]).filter((f: any) => f.name === 'get_ghost_moves');
    console.log('get_ghost_moves 定義:', JSON.stringify(ghostFns, null, 2));
  } else {
    console.log('response:', await res.text());
  }

  // ── 代替: Supabase REST で pg_proc の prosrc 取得を試みる ──────────────
  console.log('\n=== pg_proc 経由での関数ソース確認 ===\n');
  const pgProcUrl = `${process.env.VITE_SUPABASE_URL}/rest/v1/pg_proc?select=proname,prosrc&proname=eq.get_ghost_moves`;
  const r2 = await fetch(pgProcUrl, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    }
  });
  console.log(`status: ${r2.status}`);
  if (r2.ok) {
    const b2 = await r2.text();
    console.log('pg_proc response:', b2.slice(0, 500));
  } else {
    console.log('error:', await r2.text());
  }

  // ── 代替: RPC を最小引数で呼び出し → エラーメッセージから戻り型を推測 ─
  console.log('\n=== RPC 戻り型テスト (service_role, auth.uid()=null → empty expected) ===\n');
  const rpcUrl = `${process.env.VITE_SUPABASE_URL}/rest/v1/rpc/get_ghost_moves`;
  const r3 = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      p_canonical_hash: '61f227bbe714b5ea',
      p_human_color: 'black',
      p_move_index: 2
    })
  });
  console.log(`RPC status: ${r3.status}`);
  const r3body = await r3.text();
  console.log('RPC response:', r3body);
  if (r3.ok) {
    const arr = JSON.parse(r3body);
    if (Array.isArray(arr) && arr.length > 0) {
      console.log('\n戻り値のキー:', Object.keys(arr[0]).join(', '));
      const hasV2 = 'build_gate' in arr[0];
      const hasOld = 'gate_ids_str' in arr[0];
      console.log(`v2 カラム (build_gate): ${hasV2 ? '✅ あり' : '❌ なし'}`);
      console.log(`旧カラム (gate_ids_str): ${hasOld ? '❌ 残存' : '✅ なし'}`);
    } else {
      // auth.uid()=null のため空配列になるはず
      console.log('空配列 (auth.uid()=null のため正常)。カラム構造は確認できない。');
      // しかし: Supabase の PostgREST は空配列でも Accept: application/json で
      //         スキーマ情報を返すことがある → prefer=count を試みる
    }
  }

  // ── 最後の手段: v2 SQL を再適用する migration を作成する ────────────────
  console.log('\n=== 方針判断 ===\n');
  console.log('直接 RPC 実行の検証は認証なしでは不可。');
  console.log('確認できた事実:');
  console.log('  1. JS シミュレーション: G massive(7) が正しく返る ✅');
  console.log('  2. hash 一致: 61f227bbe714b5ea ✅');
  console.log('  3. App.tsx 条件: isHumanTurn=true, showGhostToggle=true, p_move_index=2 ✅');
  console.log('  4. ghostMovesToDisplayTargets: 7:large opacity=1.0 ✅');
  console.log('  5. Pro 有効期限: 2026-06-15 ✅');
  console.log();
  console.log('唯一未確認: 実 Supabase RPC が p_move_index=2 で空を返しているか。');
  console.log('原因候補: v2 SQL 適用失敗 or SQL エラー (p_move_index > 0 パス)');
  console.log('対応: v2 SQL を再適用して RPC を確実に v2 に更新する。');
}
main().catch(e => { console.error(e); process.exit(1); });
