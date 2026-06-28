import { createClient } from '@supabase/supabase-js';
const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(url, key, { auth: { persistSession: false } });
const jst = (d: any) => d ? new Date(new Date(d).getTime()+9*3600*1000).toISOString().replace('T',' ').substring(0,19)+' JST' : '(null)';
const mask = (id: any) => id ? String(id).substring(0,8)+'...' : '(null)';

async function main() {
  // A-3: routine_privileges for process_arena_results
  console.log('=== A-3: routine_privileges for process_arena_results ===');
  const { data: rp, error: rpErr } = await (sb as any)
    .from('information_schema.routine_privileges')
    .select('grantor, grantee, privilege_type, is_grantable')
    .eq('routine_name', 'process_arena_results');
  if (rpErr) console.log('  error:', rpErr.message);
  else rp?.forEach((r: any) => console.log(`  grantee:${r.grantee} | ${r.privilege_type} | grantable:${r.is_grantable}`));

  // A-3: all arena-related function privileges
  console.log('\n=== A-3: all arena function privileges ===');
  const { data: rp2, error: rpErr2 } = await (sb as any)
    .from('information_schema.routine_privileges')
    .select('routine_name, grantee, privilege_type')
    .ilike('routine_name', '%arena%')
    .order('routine_name');
  if (rpErr2) console.log('  error:', rpErr2.message);
  else rp2?.forEach((r: any) => console.log(`  ${r.routine_name} | ${r.grantee} | ${r.privilege_type}`));

  // A-3: run_pending_arena_match_generation privileges
  console.log('\n=== A-3: run_pending_arena_match_generation privileges ===');
  const { data: rp3, error: rpErr3 } = await (sb as any)
    .from('information_schema.routine_privileges')
    .select('grantor, grantee, privilege_type')
    .eq('routine_name', 'run_pending_arena_match_generation');
  if (rpErr3) console.log('  error:', rpErr3.message);
  else rp3?.forEach((r: any) => console.log(`  grantee:${r.grantee} | ${r.privilege_type}`));

  // B: 先週ELEPHANT event (6/13) detail
  const lastWeekEventId = '366e8c44-0000-0000-0000-000000000000'; // placeholder - find it
  const arenaId = '4bba1b66-8458-40da-a5d2-2111c32dc325';

  // Get ALL events for comparison
  console.log('\n=== B: All ELEPHANT events sorted by scheduled_at ===');
  const { data: allEvts } = await (sb as any)
    .from('arena_events')
    .select('id, status, scheduled_at, matches_generated_at, created_at')
    .eq('arena_id', arenaId)
    .order('scheduled_at', { ascending: true });

  for (const e of allEvts ?? []) {
    const { data: ents } = await (sb as any).from('arena_entries').select('id').eq('arena_event_id', e.id);
    const { data: ams } = await (sb as any).from('arena_matches').select('id, status, processed_at, official_match_id').eq('arena_event_id', e.id);
    const { data: amh } = await (sb as any).from('arena_match_history').select('id').eq('arena_event_id', e.id);
    const hasOm = ams?.filter((m: any) => m.official_match_id).length ?? 0;
    const pending = ams?.filter((m: any) => m.status === 'pending').length ?? 0;
    const processed = ams?.filter((m: any) => m.status === 'processed').length ?? 0;
    console.log(`  ${e.id.substring(0,8)} sched:${jst(e.scheduled_at)} status:${e.status} entries:${ents?.length??0} matches:${ams?.length??0}(pend:${pending} proc:${processed} om:${hasOm}) history:${amh?.length??0} mg:${e.matches_generated_at?'yes':'no'}`);
  }

  // B: For processed events - check official_match status
  console.log('\n=== B: Processed arena_matches detail ===');
  const { data: procMatches } = await (sb as any)
    .from('arena_matches')
    .select('id, arena_event_id, status, processed_at, official_match_id, winner_user_id, end_reason')
    .eq('status', 'processed');
  for (const m of procMatches ?? []) {
    console.log(`  arena_match:${m.id.substring(0,8)} status:${m.status} processed_at:${jst(m.processed_at)}`);
    if (m.official_match_id) {
      const { data: om } = await (sb as any)
        .from('official_matches')
        .select('id, status, result, winner, end_reason, source_kind, starts_at')
        .eq('id', m.official_match_id)
        .single();
      if (om) console.log(`    om: status:${om.status} result:${om.result} winner:${om.winner} end_reason:${om.end_reason} starts_at:${jst(om.starts_at)}`);
    }
  }

  // B: arena_match_history for 6/13 event
  console.log('\n=== B: arena_match_history for 6/13 ELEPHANT ===');
  const { data: lastWeekEvts } = await (sb as any)
    .from('arena_events')
    .select('id, status, scheduled_at, matches_generated_at')
    .eq('arena_id', arenaId)
    .gte('scheduled_at', '2026-06-13T12:00:00Z')
    .lt('scheduled_at', '2026-06-14T00:00:00Z');
  for (const e of lastWeekEvts ?? []) {
    const { data: amh } = await (sb as any)
      .from('arena_match_history')
      .select('*')
      .eq('arena_event_id', e.id);
    console.log(`  event:${e.id.substring(0,8)} status:${e.status} amh_count:${amh?.length??0}`);
    amh?.forEach((h: any) => console.log(`    match_kind:${h.match_kind} end_reason:${h.end_reason} effect:${h.master_effect} bp:${h.black_point_delta} wp:${h.white_point_delta}`));
  }

  // A-1: pg_cron via schema  
  console.log('\n=== A-1: pg_cron job registration ===');
  const { data: cjobs, error: cjErr } = await (sb as any)
    .schema('cron')
    .from('job')
    .select('jobid, jobname, schedule, command, active, database, username, nodename');
  if (cjErr) {
    console.log('  cron.job error:', cjErr.message);
  } else {
    console.log(`  Total cron jobs: ${cjobs?.length}`);
    cjobs?.filter((j: any) => j.jobname?.includes('arena') || j.command?.includes('arena'))
      .forEach((j: any) => {
        console.log(`  jobid:${j.jobid} name:${j.jobname} schedule:${j.schedule} active:${j.active}`);
        console.log(`    db:${j.database} user:${j.username} node:${j.nodename}`);
        console.log(`    cmd:${j.command}`);
      });
  }

  // A-1: cron run details
  console.log('\n=== A-1: cron.job_run_details ===');
  const { data: crd, error: crdErr } = await (sb as any)
    .schema('cron')
    .from('job_run_details')
    .select('jobid, status, return_message, start_time, end_time')
    .order('start_time', { ascending: false })
    .limit(30);
  if (crdErr) console.log('  cron.job_run_details error:', crdErr.message);
  else {
    console.log(`  Recent runs: ${crd?.length}`);
    crd?.forEach((r: any) => {
      const startJst = jst(r.start_time);
      console.log(`  [${startJst}] jobid:${r.jobid} status:${r.status} msg:${r.return_message?.substring(0,200)}`);
    });
  }

  console.log('\nDONE. READ-ONLY. No modifications.');
}
main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
