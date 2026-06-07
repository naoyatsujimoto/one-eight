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
  // v2 特有の引数 p_move_index を使って呼ぶ（v1 にはこの引数がない）
  // v1 の場合は "Could not find the function" エラーが出るはず
  // ただし service_role では auth.uid()=NULL → 空配列が返るため、
  // エラーが出るかどうかで v1/v2 を判断する

  // v2 の RPC: get_ghost_moves(TEXT, TEXT, INTEGER)
  const { data: v2test, error: v2err } = await (sb as any).rpc('get_ghost_moves', {
    p_canonical_hash: '',
    p_human_color: null,
    p_move_index: 0,
  });
  
  if (v2err) {
    console.log('v2 call error:', v2err.message, v2err.code);
    console.log('→ v2 migration NOT applied to production');
  } else {
    console.log('v2 call success: 0 rows (expected, auth.uid=null)');
    console.log('→ v2 migration IS applied to production');
  }

  // v1 相当の呼び方 (p_move_index なし) でも試す
  const { data: v1test, error: v1err } = await (sb as any).rpc('get_ghost_moves', {
    p_canonical_hash: '',
    p_human_color: null,
  });
  
  if (v1err) {
    console.log('v1-style call error:', v1err.message);
  } else {
    console.log('v1-style call success:', v1test?.length ?? 0, 'rows');
  }
}

main().catch(console.error);
