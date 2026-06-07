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

async function main() {
  // routines テーブルから get_ghost_moves の情報を確認
  const { data: routines, error: rErr } = await sb
    .from('information_schema.routines')
    .select('routine_name, security_type, data_type')
    .eq('routine_schema', 'public')
    .eq('routine_name', 'get_ghost_moves');
    
  if (rErr) {
    console.log('routines error:', rErr.message);
  } else {
    console.log('routines:', routines);
  }

  // parameters を確認
  const { data: params, error: pErr } = await sb
    .from('information_schema.parameters')
    .select('parameter_name, udt_name, ordinal_position')
    .eq('specific_schema', 'public')
    .like('specific_name', '%get_ghost_moves%')
    .order('ordinal_position');
    
  if (pErr) {
    console.log('params error:', pErr.message);
  } else {
    console.log('params:', params);
  }

  // columns を確認 (返却カラム)
  // pg_proc + pg_type で確認
  // 代わりに: RPC を実際に呼んで返ってくるカラムを確認
  // 注意: service_role では auth.uid()=NULL → 空配列が返る (v1/v2関係なく)
  const { data: rpcResult, error: rpcErr } = await (sb as any).rpc('get_ghost_moves', {
    p_canonical_hash: 'test',
    p_human_color: null,
    p_move_index: 0,
  });
  
  console.log('RPC test call:', rpcErr ? `error: ${rpcErr.message}` : `${rpcResult?.length ?? 0} rows`);
  if (rpcResult && rpcResult.length > 0) {
    console.log('First row keys:', Object.keys(rpcResult[0]));
  } else if (!rpcErr) {
    console.log('Empty result (expected: service_role has NULL auth.uid())');
    // カラム名は空でも分かる
  }
}

main().catch(console.error);
