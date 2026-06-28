/**
 * 2G Read-Only Verify: Master exclusion from top_ranking
 * Checks get_arena_detail function definition and real data for JAGUAR/ELEPHANT
 */
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
import postgres from 'postgres';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';
const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '';

const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

async function main() {
  // 1. arena_ids for JAGUAR / ELEPHANT
  const { data: arenas, error: arenaErr } = await sb
    .from('arena_definitions')
    .select('id, code, display_name')
    .in('code', ['jaguar', 'elephant', 'JAGUAR', 'ELEPHANT']);

  if (arenaErr) { console.error('arena fetch error:', arenaErr.message); process.exit(1); }
  console.log('Arenas:', JSON.stringify(arenas, null, 2));

  // 2. Current masters
  const { data: masters, error: masterErr } = await sb
    .from('arena_master_history')
    .select('arena_id, user_id, status, dethroned_at, crowned_at')
    .is('dethroned_at', null);

  if (masterErr) { console.error('master fetch error:', masterErr.message); process.exit(1); }
  console.log('\nCurrent Masters (dethroned_at IS NULL):', JSON.stringify(masters, null, 2));

  // 3. get_arena_detail for each arena
  for (const arena of (arenas || [])) {
    console.log(`\n=== get_arena_detail for ${arena.code} (${arena.id}) ===`);
    const { data, error } = await sb.rpc('get_arena_detail', { p_arena_id: arena.id });
    if (error) { console.error('RPC error:', error.message); continue; }

    const currentMasterUid = data?.current_master_user_id;
    const currentMasterName = data?.current_master_display_name;
    const ranking = data?.top_ranking || [];

    console.log(`Current Master: ${currentMasterName} (${currentMasterUid})`);
    console.log(`top_ranking count: ${ranking.length}`);
    console.log('top_ranking:', JSON.stringify(ranking, null, 2));

    // Check master is NOT in ranking
    const masterInRanking = ranking.some((r: any) => r.user_id === currentMasterUid);
    if (masterInRanking) {
      console.error(`❌ FAIL: Current Master (${currentMasterName}) is still in top_ranking!`);
    } else {
      console.log(`✅ OK: Current Master (${currentMasterName}) is NOT in top_ranking`);
    }

    // Check recent_master_history is present
    const masterHistory = data?.recent_master_history || [];
    console.log(`Master history count: ${masterHistory.length} ✅`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
