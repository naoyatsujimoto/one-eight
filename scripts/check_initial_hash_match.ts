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
import { createInitialState } from '../src/game/initialState';
import { computeCanonicalHashString } from '../src/game/zobrist';

const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const uid = '9924668a-a5ee-4bd3-a71e-f8f993e3f094';

async function main() {
  // 現在の初手 hash
  const initialState = createInitialState('white');
  const currentHash = computeCanonicalHashString(initialState);
  console.log('Current initial hash:', currentHash);
  
  // match_logs の canonical_hash を確認
  const { data: logs } = await sb
    .from('match_logs')
    .select('id, full_record')
    .eq('user_id', uid)
    .in('mode', ['human_vs_cpu', 'online_pvp'])
    .not('full_record', 'is', null)
    .limit(10);
  
  console.log('\nmatch_logs first move canonical_hash:');
  logs?.forEach(l => {
    const fr = l.full_record as any[];
    const firstHash = fr?.[0]?.canonical_hash;
    const matches = firstHash === currentHash;
    console.log({
      id: (l.id as string).substring(0, 8),
      first_hash: firstHash ? firstHash.substring(0, 16) : 'null',
      matches_current: matches,
    });
  });
  
  // p_move_index=0 では canonical_hash マッチングをしない
  // full_record[0] を直接使用するので hash は無関係
  // でも p_move_index>0 では canonical_hash でマッチングする
  
  // では初手の canonical_hash を match_logs で確認
  const allFirstHashes = logs?.map(l => {
    const fr = l.full_record as any[];
    return fr?.[0]?.canonical_hash;
  }).filter(Boolean);
  
  const uniqueHashes = [...new Set(allFirstHashes)];
  console.log('\nUnique first move hashes in match_logs:', uniqueHashes);
  
  if (!uniqueHashes.includes(currentHash)) {
    console.log('\n⚠️  MISMATCH: Current hash NOT found in match_logs!');
    console.log('This means p_move_index>0 queries will NOT find matching records');
    console.log('But p_move_index=0 returns full_record[0] directly (no hash match needed)');
  } else {
    console.log('\n✓ Current hash found in match_logs');
  }
}

main().catch(console.error);
