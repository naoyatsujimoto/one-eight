import { readFileSync } from 'fs';
try {
  const lines = readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/.env', 'utf-8').split('\n');
  for (const line of lines) {
    const t = line.trim(); if (!t||t.startsWith('#')) continue;
    const idx = t.indexOf('='); if (idx<0) continue;
    const k = t.slice(0,idx).trim(); const v = t.slice(idx+1).trim().replace(/^["']|["']$/g,'');
    if (!process.env[k]) process.env[k] = v;
  }
} catch {}
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function main() {
  const { data: defs } = await (sb as any).from('arena_definitions').select('id, code');
  const codeMap: Record<string, string> = {};
  for (const d of (defs||[])) codeMap[d.id] = d.code;

  const { data: all } = await (sb as any)
    .from('arena_events').select('id, arena_id, status, scheduled_at, created_at, matches_generated_at')
    .order('scheduled_at', { ascending: true });

  console.log(`arena_events 総数: ${(all||[]).length}`);
  for (const ev of (all||[])) {
    const jst = (iso: string) => new Date(new Date(iso).getTime()+9*3600*1000).toISOString().replace('T',' ').substring(0,16)+' JST';
    console.log(`  ${codeMap[ev.arena_id]??'?'} scheduled=${jst(ev.scheduled_at)} status=${ev.status} created=${jst(ev.created_at)} id=${ev.id.substring(0,8)}...`);
  }
}
main().catch(console.error);
