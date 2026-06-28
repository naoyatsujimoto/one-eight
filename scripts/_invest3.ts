import { createClient } from '@supabase/supabase-js';
const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(url, key, { auth: { persistSession: false } });
const jst = (d: any) => d ? new Date(new Date(d).getTime()+9*3600*1000).toISOString().replace('T',' ').substring(0,19)+' JST' : '(null)';
const mask = (id: any) => id ? String(id).substring(0,8)+'...' : '(null)';

async function main() {
  const arenaId = '4bba1b66-8458-40da-a5d2-2111c32dc325';

  // 1. arena_master_history 全件確認 (statusカラム値を確認)
  console.log('=== arena_master_history (ELEPHANT) ===');
  const { data: amh, error: amhErr } = await (sb as any)
    .from('arena_master_history')
    .select('*')
    .eq('arena_id', arenaId)
    .order('crowned_at', { ascending: true });
  if (amhErr) console.log('  error:', amhErr.message);
  else {
    console.log(`  Total rows: ${amh?.length ?? 0}`);
    amh?.forEach((h: any) => {
      console.log(`  id:${h.id?.substring(0,8)} status:${h.status} reason:${h.reason} user:${mask(h.user_id)}`);
      console.log(`    crowned_at:${jst(h.crowned_at)} dethroned_at:${jst(h.dethroned_at)}`);
      console.log(`    season:${h.season} source_event:${h.source_arena_event_id?.substring(0,8)}`);
    });
  }

  // 2. arena_match_history schema - check ON CONFLICT target
  console.log('\n=== arena_match_history schema check ===');
  const { data: amhSchema, error: amhSErr } = await (sb as any)
    .from('arena_match_history')
    .select('*')
    .limit(3);
  if (amhSErr) console.log('  error:', amhSErr.message);
  else {
    if (amhSchema && amhSchema.length > 0) {
      console.log('  Columns:', Object.keys(amhSchema[0]).join(', '));
    } else {
      console.log('  No rows (empty table)');
      // Try to get column info from a single row
    }
  }

  // Check ON CONFLICT key via information_schema
  const { data: tc, error: tcErr } = await (sb as any)
    .from('information_schema.table_constraints')
    .select('constraint_name, constraint_type, table_name')
    .eq('table_name', 'arena_match_history');
  if (tcErr) console.log('  table_constraints error:', tcErr.message);
  else {
    console.log('  Constraints on arena_match_history:', JSON.stringify(tc, null, 2));
  }

  // arena_points constraints
  const { data: tc2, error: tcErr2 } = await (sb as any)
    .from('information_schema.table_constraints')
    .select('constraint_name, constraint_type, table_name')
    .eq('table_name', 'arena_points');
  if (tcErr2) console.log('  arena_points constraints error:', tcErr2.message);
  else console.log('  Constraints on arena_points:', JSON.stringify(tc2, null, 2));

  // 3. arena_events columns check
  console.log('\n=== arena_events columns check ===');
  const { data: aev } = await (sb as any)
    .from('arena_events')
    .select('*')
    .limit(1);
  if (aev && aev.length > 0) console.log('  Columns:', Object.keys(aev[0]).join(', '));

  // 4. ensure_next_arena_events() - function def via migration
  // Confirm its duplicate-prevention logic
  console.log('\n=== ensure_next_arena_events: duplicate check ===');
  // How many events per scheduled_at?
  const { data: evtGroups, error: evtGrpErr } = await (sb as any)
    .from('arena_events')
    .select('arena_id, scheduled_at')
    .eq('arena_id', arenaId);
  if (evtGrpErr) console.log('  error:', evtGrpErr.message);
  else {
    const grouped: Record<string, number> = {};
    evtGroups?.forEach((e: any) => {
      const key = e.scheduled_at;
      grouped[key] = (grouped[key] || 0) + 1;
    });
    const dupes = Object.entries(grouped).filter(([, cnt]) => cnt > 1);
    console.log(`  Dates with duplicate events: ${dupes.length}`);
    dupes.forEach(([date, cnt]) => console.log(`    ${jst(date)}: ${cnt} events`));
  }

  // 5. What does get_arena_detail show for previous results pending?
  console.log('\n=== get_arena_detail: previous_results_pending ===');
  const { data: det } = await (sb as any).rpc('get_arena_detail', { p_arena_id: arenaId });
  console.log(`  previous_results_pending: ${det?.previous_results_pending}`);
  console.log(`  next_event: ${det?.next_event ? JSON.stringify(det.next_event) : '(null)'}`);
  console.log(`  event_id from overview:`);
  const { data: ov } = await (sb as any).rpc('get_arena_overview');
  const el = ov?.find((e: any) => e.code === 'ELEPHANT');
  console.log(`    event_id: ${el?.event_id ?? '(null)'}`);
  console.log(`    event_status: ${el?.event_status ?? '(null)'}`);

  // 6. process_arena_results権限確認 via pg_proc
  console.log('\n=== pg_proc: process_arena_results GRANT status ===');
  const { data: pp, error: ppErr } = await (sb as any)
    .from('pg_proc')
    .select('proname, proacl, prosecdef')
    .eq('proname', 'process_arena_results')
    .limit(1);
  if (ppErr) console.log('  pg_proc error:', ppErr.message);
  else console.log('  process_arena_results pg_proc:', JSON.stringify(pp, null, 2));

  const { data: pp2, error: ppErr2 } = await (sb as any)
    .from('pg_proc')
    .select('proname, proacl, prosecdef')
    .eq('proname', 'run_pending_arena_match_generation')
    .limit(1);
  if (ppErr2) console.log('  pg_proc error:', ppErr2.message);
  else console.log('  run_pending_arena_match_generation:', JSON.stringify(pp2, null, 2));

  console.log('\nDONE. READ-ONLY. No modifications.');
}
main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
