import { readFileSync } from 'fs';
try {
  const lines = readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/.env', 'utf-8').split('\n');
  for (const line of lines) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('='); if (idx < 0) continue;
    const k = t.slice(0, idx).trim(); const v = t.slice(idx+1).trim().replace(/^["']|["']$/g,'');
    if (!process.env[k]) process.env[k] = v;
  }
} catch {}
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function main() {
  // 全重複グループ取得 (created_at昇順=正規候補)
  const { data: all } = await (sb as any).from('arena_events')
    .select('id, arena_id, status, scheduled_at, matches_generated_at, created_at')
    .order('created_at', { ascending: true });

  const grouped: Record<string, any[]> = {};
  for (const ev of (all||[])) {
    const key = `${ev.arena_id}__${ev.scheduled_at}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(ev);
  }
  const dupGroups = Object.entries(grouped).filter(([_,rows])=>rows.length>1);

  console.log('=== 正規event (created_at最古) フルUUID ===');
  for (const [key, rows] of dupGroups) {
    console.log(`正規: ${rows[0].id}  scheduled=${rows[0].scheduled_at}  created=${rows[0].created_at}`);
  }
  console.log('\n=== cleanup候補 フルUUID ===');
  for (const [key, rows] of dupGroups) {
    for (const r of rows.slice(1)) {
      console.log(`cleanup: ${r.id}  scheduled=${r.scheduled_at}  created=${r.created_at}  matches_gen=${r.matches_generated_at}`);
    }
  }

  // 正規eventの関連データ確認
  const canonicalIds = dupGroups.map(([_,rows])=>rows[0].id);
  console.log('\n=== 正規event関連データ確認 ===');
  for (const id of canonicalIds) {
    const { count: ec } = await (sb as any).from('arena_entries').select('*',{count:'exact',head:true}).eq('arena_event_id',id);
    const { count: mc } = await (sb as any).from('arena_matches').select('*',{count:'exact',head:true}).eq('arena_event_id',id);
    const { count: hc } = await (sb as any).from('arena_match_history').select('*',{count:'exact',head:true}).eq('arena_event_id',id);
    const { count: pc } = await (sb as any).from('prize_awards').select('*',{count:'exact',head:true}).eq('source_arena_event_id',id);
    console.log(`id=${id}: entries=${ec} matches=${mc} history=${hc} prize_awards=${pc}`);
  }
}
main().catch(console.error);
