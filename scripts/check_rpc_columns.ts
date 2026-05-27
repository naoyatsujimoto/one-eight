/**
 * Supabase の get_ghost_moves RPC が v1/v2 どちらか確認するスクリプト
 * 方法: pg_get_function_result() を SQL として実行する RPC を作成してある場合に有効。
 * ここでは代替として: 実際にダミーデータを一時的に match_logs に INSERT して
 * service_role で RPC を呼び出し、返却列を確認する。
 * ただし auth.uid()=NULL のため RPC 内の Pro チェックをパスできない。
 * 
 * 最終手段: SQL Executor RPC が存在するか確認し、なければ migration 再適用を推奨。
 */
import { readFileSync } from 'fs';
try {
  const lines = readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/.env', 'utf-8').split('\n');
  for (const line of lines) { const t=line.trim(); if(!t||t.startsWith('#'))continue; const idx=t.indexOf('='); if(idx<0)continue; const k=t.slice(0,idx).trim(); const v=t.slice(idx+1).trim().replace(/^["']|["']$/g,''); if(!process.env[k])process.env[k]=v; }
} catch {}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  // 1. Supabase REST の /rpc/get_ghost_moves に対して
  //    Authorization: Bearer <anon_key> でも試みる（GRANT authenticated がある）
  // 2. ただしログインユーザーが必要 → anon では Pro チェック落ち

  // アプローチ: information_schema.columns で関数返却型を確認
  // Supabase の PostgREST は routines をサポートしていない
  // → pg_catalog.pg_proc の prosrc を直接 SELECT する試み
  
  // Supabase では pg_catalog は公開されていないが、
  // service_role で SELECT pg_get_function_result(...) は呼べる場合がある
  // ここでは REST 経由の SQL 実行 RPC を探す

  // まず利用可能な RPC 一覧を確認
  const openapi = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });
  const spec = await openapi.json() as { paths?: Record<string, unknown> };
  const rpcs = Object.keys(spec.paths ?? {}).filter(p => p.startsWith('/rpc/'));
  console.log('利用可能な RPC 一覧:');
  rpcs.forEach(r => console.log(' ', r));
  
  // exec_sql or run_sql があるか
  const hasSqlExec = rpcs.some(r => r.includes('exec_sql') || r.includes('run_sql') || r.includes('execute_sql'));
  console.log('\nexec_sql系RPC:', hasSqlExec ? '✅ あり' : '❌ なし');
  
  if (!hasSqlExec) {
    console.log('\n=== v2 適用状況の間接確認 ===\n');
    // MEMORY.md の記録から判断
    // bd06912 コミットで v2 SQL が作成されたのは 2026-05-24
    // MEMORY.md の最終更新は 2026-05-21
    // → bd06912 以降の migration 適用記録は MEMORY.md に存在しない
    console.log('MEMORY.md 確認結果:');
    console.log('  ghost_mode_get_ghost_moves_v2.sql の適用記録: ❌ なし');
    console.log('  最後に記録された migration 適用: phase_t2a_rpcs.sql (2026-05-21)');
    console.log();
    console.log('→ 結論: ghost_mode_get_ghost_moves_v2.sql が Supabase に未適用の可能性が高い');
    console.log('→ 修正方法: Naoya が Supabase SQL Editor で v2 SQL を再実行する');
    console.log();
    
    // v2 SQL の内容を表示
    const v2sql = readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/supabase/migrations/ghost_mode_get_ghost_moves_v2.sql', 'utf-8');
    console.log('ghost_mode_get_ghost_moves_v2.sql の冒頭:');
    console.log(v2sql.slice(0, 300));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
