/**
 * READ-ONLY investigation: ELEPHANT Arena 2026-06-20 22:00 JST
 * No INSERT / UPDATE / DELETE / state-changing RPC
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://farieecfyajbtmjxelop.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!key) { console.error('SUPABASE_SERVICE_ROLE_KEY not set'); process.exit(1); }

const supabase = createClient(url, key, { auth: { persistSession: false } });

function mask(id: string | null | undefined): string {
  if (!id) return '(null)';
  return id.substring(0, 8) + '...';
}

async function main() {
  console.log('=== ELEPHANT Arena 2026-06-20 22:00 JST — READ-ONLY INVESTIGATION ===\n');
  const now = new Date();
  console.log('Current time (UTC):', now.toISOString());
  console.log('Current time (JST):', new Date(now.getTime() + 9*3600*1000).toISOString().replace('T',' ').substring(0,19), 'JST\n');

  // 1. arena_definitions — ELEPHANT (code ILIKE)
  console.log('--- 1. arena_definitions (ELEPHANT) ---');
  const { data: defs, error: defsErr } = await (supabase as any)
    .from('arena_definitions')
    .select('id, code, display_name, entry_deadline_hours, is_active, timer_config, current_master_user_id, current_interim_master_user_id, weekday, start_time_jst')
    .ilike('code', '%ELEPHANT%');
  if (defsErr) console.error('defsErr:', defsErr);
  else {
    defs?.forEach((d: any) => {
      console.log(`  id: ${d.id}`);
      console.log(`  code: ${d.code}`);
      console.log(`  display_name: ${d.display_name}`);
      console.log(`  is_active: ${d.is_active}`);
      console.log(`  weekday: ${d.weekday} (0=Sun, 6=Sat)`);
      console.log(`  start_time_jst: ${d.start_time_jst}`);
      console.log(`  entry_deadline_hours: ${d.entry_deadline_hours}`);
      console.log(`  timer_config: ${JSON.stringify(d.timer_config)}`);
      console.log(`  current_master_user_id: ${mask(d.current_master_user_id)}`);
      console.log(`  current_interim_master_user_id: ${mask(d.current_interim_master_user_id)}`);
    });
  }

  if (!defs || defs.length === 0) {
    console.log('  ⚠️ ELEPHANT arena_definition not found. Check all arena_definitions:');
    const { data: allDefs } = await (supabase as any).from('arena_definitions').select('id, code, display_name, is_active');
    allDefs?.forEach((d: any) => console.log(`    code=${d.code} display=${d.display_name} active=${d.is_active} id=${d.id}`));
    return;
  }

  const def = defs[0];
  const arenaId = def.id;
  const entryDeadlineHours = def.entry_deadline_hours ?? 24;
  const timerTotalSec = def.timer_config?.totalSeconds ?? 600;

  // 2. arena_events — ELEPHANT, recent
  console.log('\n--- 2. arena_events (ELEPHANT, last 5) ---');
  const { data: evts, error: evtsErr } = await (supabase as any)
    .from('arena_events')
    .select('id, arena_id, status, scheduled_at, matches_generated_at, created_at')
    .eq('arena_id', arenaId)
    .order('scheduled_at', { ascending: false })
    .limit(5);
  if (evtsErr) console.error('evtsErr:', evtsErr);
  else {
    evts?.forEach((e: any) => {
      const deadlineUtc = new Date(new Date(e.scheduled_at).getTime() - entryDeadlineHours * 3600 * 1000);
      const scheduledJst = new Date(new Date(e.scheduled_at).getTime() + 9*3600*1000).toISOString().replace('T',' ').substring(0,19);
      const deadlineJst = new Date(deadlineUtc.getTime() + 9*3600*1000).toISOString().replace('T',' ').substring(0,19);
      const nowMs = now.getTime();
      const schMs = new Date(e.scheduled_at).getTime();
      const minsAgo = Math.round((nowMs - schMs) / 60000);
      console.log(`  id: ${e.id}`);
      console.log(`  status: ${e.status}`);
      console.log(`  scheduled_at (UTC): ${e.scheduled_at}  [${minsAgo > 0 ? minsAgo + ' min ago' : 'future'}]`);
      console.log(`  scheduled_at (JST): ${scheduledJst} JST`);
      console.log(`  entry_deadline (calc JST): ${deadlineJst} JST (= scheduled - ${entryDeadlineHours}h)`);
      console.log(`  matches_generated_at: ${e.matches_generated_at ?? '(null)'}`);
      console.log(`  created_at: ${e.created_at}`);
      console.log('');
    });
  }

  // Find target event near 2026-06-20 22:00 JST = 2026-06-20 13:00 UTC
  const todayDateStr = new Date(now.getTime() + 9*3600*1000).toISOString().substring(0,10);
  const targetUtcMs = new Date(`${todayDateStr}T13:00:00Z`).getTime();
  const targetEvent = evts?.find((e: any) => {
    const s = new Date(e.scheduled_at).getTime();
    return Math.abs(s - targetUtcMs) < 2 * 3600 * 1000; // within 2 hour
  });

  if (!targetEvent) {
    console.log(`  ⚠️ No arena_event found near ${todayDateStr} 22:00 JST`);
    // Check if there is any event today
    const todayEvt = evts?.find((e: any) => e.scheduled_at?.startsWith(todayDateStr));
    if (todayEvt) {
      console.log(`  Found event on ${todayDateStr}: scheduled_at=${todayEvt.scheduled_at} status=${todayEvt.status}`);
    }
    console.log('\n  [All recent events shown above ↑]\n');
  } else {
    console.log(`  ✅ Target event found: ${targetEvent.id} (status=${targetEvent.status})`);
  }

  const eventId = targetEvent?.id;
  if (!eventId) {
    // Even without target, let's check the latest event
    const latestEvent = evts?.[0];
    if (!latestEvent) { console.log('\n  No events found at all. Stop.'); return; }
    console.log(`\n  Using most recent event instead: ${latestEvent.id} (${latestEvent.scheduled_at})`);
    // Continue with most recent
  }
  const useEventId = eventId ?? evts?.[0]?.id;
  const useEvent = targetEvent ?? evts?.[0];

  // 3. arena_entries
  console.log('\n--- 3. arena_entries ---');
  const { data: entries, error: entriesErr } = await (supabase as any)
    .from('arena_entries')
    .select('id, arena_event_id, user_id, status, arena_match_id, created_at')
    .eq('arena_event_id', useEventId);
  if (entriesErr) console.error('entriesErr:', entriesErr);
  else {
    console.log(`  Total entries: ${entries?.length ?? 0}`);
    entries?.forEach((e: any, i: number) => {
      console.log(`  [${i+1}] user: ${mask(e.user_id)} | status: ${e.status} | arena_match_id: ${e.arena_match_id ? mask(e.arena_match_id) : '(null)'} | created: ${e.created_at}`);
    });
  }

  // 4. arena_matches
  console.log('\n--- 4. arena_matches ---');
  const { data: amatches, error: amatchErr } = await (supabase as any)
    .from('arena_matches')
    .select('id, arena_event_id, match_number, match_kind, master_subtype, status, official_match_id, scheduled_start_at, black_user_id, white_user_id, winner_user_id, loser_user_id, end_reason, black_point_delta, white_point_delta, master_effect, processed_at, created_at')
    .eq('arena_event_id', useEventId)
    .order('match_number', { ascending: true });
  if (amatchErr) console.error('amatchErr:', amatchErr);
  else {
    console.log(`  Total arena_matches: ${amatches?.length ?? 0}`);
    amatches?.forEach((m: any) => {
      console.log(`  match_number: ${m.match_number} | id: ${m.id}`);
      console.log(`    status: ${m.status}`);
      console.log(`    match_kind: ${m.match_kind} | master_subtype: ${m.master_subtype}`);
      console.log(`    official_match_id: ${m.official_match_id ? m.official_match_id : '(null)'}`);
      console.log(`    scheduled_start_at: ${m.scheduled_start_at ?? '(null)'}`);
      console.log(`    black_user: ${mask(m.black_user_id)} | white_user: ${mask(m.white_user_id)}`);
      console.log(`    winner_user: ${mask(m.winner_user_id)} | end_reason: ${m.end_reason ?? '(null)'}`);
      console.log(`    processed_at: ${m.processed_at ?? '(null)'}`);
      console.log(`    black_point_delta: ${m.black_point_delta ?? '(null)'} | white_point_delta: ${m.white_point_delta ?? '(null)'}`);
      console.log(`    master_effect: ${m.master_effect ?? '(null)'}`);
    });
  }

  // 5. official_matches linked to arena_matches
  const officialMatchIds = amatches?.filter((m: any) => m.official_match_id).map((m: any) => m.official_match_id) ?? [];
  console.log('\n--- 5. official_matches (linked to arena_matches) ---');
  if (officialMatchIds.length === 0) {
    console.log('  ⚠️ No official_match_id found in arena_matches.');
  } else {
    const { data: oms, error: omsErr } = await (supabase as any)
      .from('official_matches')
      .select('id, black_user_id, white_user_id, status, result, winner, end_reason, black_entered_at, white_entered_at, starts_at, finished_at, expires_at, source_kind, timer_config, created_at')
      .in('id', officialMatchIds);
    if (omsErr) console.error('omsErr:', omsErr);
    else {
      oms?.forEach((o: any) => {
        const omTimerSec = o.timer_config?.totalSeconds ?? timerTotalSec;
        const omByoyomiSec = o.timer_config?.byoyomiSeconds ?? 0;
        console.log(`  official_match id: ${o.id}`);
        console.log(`    source_kind: ${o.source_kind}`);
        console.log(`    status: ${o.status}`);
        console.log(`    result: ${o.result ?? '(null)'} | winner: ${o.winner ?? '(null)'} | end_reason: ${o.end_reason ?? '(null)'}`);
        console.log(`    black_user: ${mask(o.black_user_id)} | white_user: ${mask(o.white_user_id)}`);
        console.log(`    black_entered_at: ${o.black_entered_at ?? '(null)'}`);
        console.log(`    white_entered_at: ${o.white_entered_at ?? '(null)'}`);
        console.log(`    starts_at: ${o.starts_at ?? '(null)'}`);
        console.log(`    finished_at: ${o.finished_at ?? '(null)'}`);
        console.log(`    expires_at: ${o.expires_at ?? '(null)'}`);
        console.log(`    timer_config: ${JSON.stringify(o.timer_config)}`);
        // Analyze no-show condition for process_arena_results Pass 1
        if (o.starts_at && o.status in { 'scheduled': 1, 'joinable': 1, 'live': 1 }) {
          const startsAtMs = new Date(o.starts_at).getTime();
          const noShowDeadlineMs = startsAtMs + omTimerSec * 1000;
          const nowMs = now.getTime();
          const isExpired = nowMs > noShowDeadlineMs;
          const minsLeft = Math.round((noShowDeadlineMs - nowMs) / 60000);
          console.log(`    → Pass 1 no-show check: starts_at + ${omTimerSec}s = ${new Date(noShowDeadlineMs).toISOString()} JST: ${new Date(noShowDeadlineMs + 9*3600*1000).toISOString().replace('T',' ').substring(0,19)}`);
          console.log(`      → ${isExpired ? '✅ EXPIRED (no-show deadline passed ' + Math.abs(minsLeft) + ' min ago)' : '⚠️ NOT YET EXPIRED (' + minsLeft + ' min remaining)'}`);
        }
      });
    }
  }

  // 6. cron jobs — try schema access
  console.log('\n--- 6. cron.job (arena-related) ---');
  let cronJobIds: number[] = [];
  const { data: cjobs, error: cjErr } = await (supabase as any)
    .schema('cron')
    .from('job')
    .select('jobid, jobname, schedule, command, active')
    .or('jobname.ilike.%arena%,command.ilike.%arena%');
  if (cjErr) {
    console.log('  cron.job access error:', cjErr.message);
    // Try listing all cron jobs without filter
    const { data: allCjobs, error: allCjErr } = await (supabase as any)
      .schema('cron')
      .from('job')
      .select('jobid, jobname, schedule, active')
      .limit(20);
    if (allCjErr) console.log('  cron.job all access also failed:', allCjErr.message);
    else {
      console.log(`  All cron jobs (${allCjobs?.length ?? 0} found):`);
      allCjobs?.forEach((j: any) => {
        console.log(`    jobid:${j.jobid} | ${j.jobname} | ${j.schedule} | active:${j.active}`);
        if (j.jobname?.toLowerCase().includes('arena')) cronJobIds.push(j.jobid);
      });
    }
  } else {
    console.log(`  Found ${cjobs?.length ?? 0} arena cron jobs:`);
    cjobs?.forEach((j: any) => {
      cronJobIds.push(j.jobid);
      console.log(`  jobid: ${j.jobid} | name: ${j.jobname} | schedule: ${j.schedule} | active: ${j.active}`);
      console.log(`    command: ${j.command}`);
    });
  }

  // 7. cron job run details (recent 2h)
  console.log('\n--- 7. cron.job_run_details (last 2h) ---');
  const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000).toISOString();
  const { data: cronRuns, error: cronRunsErr } = await (supabase as any)
    .schema('cron')
    .from('job_run_details')
    .select('jobid, runid, status, return_message, start_time, end_time')
    .gte('start_time', twoHoursAgo)
    .order('start_time', { ascending: false })
    .limit(50);
  if (cronRunsErr) {
    console.log('  cron.job_run_details error:', cronRunsErr.message);
  } else {
    console.log(`  Total recent cron runs (last 2h): ${cronRuns?.length ?? 0}`);
    // Show arena-related or all recent
    const arenaRuns = cronRuns?.filter((r: any) => 
      r.return_message?.toLowerCase().includes('arena') || cronJobIds.includes(r.jobid)
    ) ?? [];
    if (arenaRuns.length > 0) {
      console.log(`  Arena cron runs: ${arenaRuns.length}`);
      arenaRuns.forEach((r: any) => {
        const startJst = new Date(new Date(r.start_time).getTime() + 9*3600*1000).toISOString().replace('T',' ').substring(0,19);
        console.log(`  [${startJst} JST] jobid:${r.jobid} status:${r.status}`);
        console.log(`    msg: ${r.return_message?.substring(0, 300)}`);
      });
    } else {
      console.log('  No arena-specific cron runs found in last 2h. Showing all:');
      cronRuns?.slice(0, 20).forEach((r: any) => {
        const startJst = new Date(new Date(r.start_time).getTime() + 9*3600*1000).toISOString().replace('T',' ').substring(0,19);
        console.log(`  [${startJst} JST] jobid:${r.jobid} status:${r.status} msg:${r.return_message?.substring(0,150)}`);
      });
    }
  }

  // 8. arena_match_history for this event
  console.log('\n--- 8. arena_match_history ---');
  const { data: amh, error: amhErr } = await (supabase as any)
    .from('arena_match_history')
    .select('id, arena_event_id, arena_match_id, winner_user_id, loser_user_id, end_reason, match_kind, master_effect, black_point_delta, white_point_delta, created_at')
    .eq('arena_event_id', useEventId);
  if (amhErr) console.log('  arena_match_history error:', amhErr.message);
  else {
    console.log(`  arena_match_history rows for this event: ${amh?.length ?? 0}`);
    amh?.forEach((h: any) => {
      console.log(`  match_kind: ${h.match_kind} | end_reason: ${h.end_reason} | master_effect: ${h.master_effect}`);
      console.log(`    winner: ${mask(h.winner_user_id)} | loser: ${mask(h.loser_user_id)}`);
      console.log(`    delta: black=${h.black_point_delta} white=${h.white_point_delta}`);
    });
  }

  // 9. arena_points for this arena
  console.log('\n--- 9. arena_points (this arena) ---');
  const { data: apts, error: aptsErr } = await (supabase as any)
    .from('arena_points')
    .select('id, arena_id, user_id, points, season, participations, no_show_losses, matches_played, last_played_event_id')
    .eq('arena_id', arenaId)
    .order('points', { ascending: false })
    .limit(10);
  if (aptsErr) console.log('  arena_points error:', aptsErr.message);
  else {
    console.log(`  Top arena_points rows: ${apts?.length ?? 0}`);
    apts?.forEach((p: any, i: number) => {
      console.log(`  [${i+1}] user: ${mask(p.user_id)} pts:${p.points} season:${p.season} participations:${p.participations} no_show:${p.no_show_losses}`);
    });
  }

  // ==================================================================
  // 10. DIAGNOSIS
  // ==================================================================
  console.log('\n=== DIAGNOSIS SUMMARY ===');
  const ev = useEvent;
  const entriesTot = entries?.length ?? 0;
  const matchesTot = amatches?.length ?? 0;
  const pendingMatches = amatches?.filter((m: any) => m.status === 'pending').length ?? 0;
  const activeMatches = amatches?.filter((m: any) => m.status === 'active').length ?? 0;
  const completedMatches = amatches?.filter((m: any) => m.status === 'completed').length ?? 0;
  const processedMatches = amatches?.filter((m: any) => m.status === 'processed').length ?? 0;
  const withOfficialMatch = amatches?.filter((m: any) => m.official_match_id).length ?? 0;
  const nowMs = now.getTime();

  console.log(`Target event: ${useEventId}`);
  console.log(`Event status: ${ev?.status}`);
  console.log(`Scheduled (JST): ${new Date(new Date(ev?.scheduled_at).getTime() + 9*3600*1000).toISOString().replace('T',' ').substring(0,19)} JST`);
  console.log(`matches_generated_at: ${ev?.matches_generated_at ?? '(null)'}`);
  console.log(`Entries: ${entriesTot}`);
  console.log(`arena_matches: total=${matchesTot} | pending=${pendingMatches} | active=${activeMatches} | completed=${completedMatches} | processed=${processedMatches}`);
  console.log(`arena_matches with official_match_id: ${withOfficialMatch}`);
  console.log(`arena_match_history rows: ${amh?.length ?? 0}`);

  console.log('\n--- Root cause candidates ---');

  if (!targetEvent) {
    console.log('🔴 A: Target event (2026-06-20 22:00 JST) NOT FOUND in arena_events');
    console.log('   → ensure_next_arena_events() may not have created it, or timezone mismatch');
  } else if (ev?.status === 'scheduled' && !ev?.matches_generated_at) {
    console.log('🔴 A: matches_generated_at IS NULL → run_pending_arena_match_generation() has NOT fired');
    console.log('   → pg_cron arena-generate-matches job may not be running');
    console.log('   → Or entry deadline condition not met (but entry_deadline is ' + entryDeadlineHours + 'h before = should be met)');
  } else if (matchesTot === 0 && ev?.matches_generated_at) {
    console.log('🟡 B: matches_generated_at is set BUT arena_matches is empty');
    console.log('   → generate_arena_matches() ran but found 0 entries (already_handled or 0/1 entrant)');
    console.log('   → Entries count:', entriesTot);
  } else if (matchesTot > 0 && withOfficialMatch === 0) {
    console.log('🔴 B2: arena_matches exist but NO official_match_id assigned');
    console.log('   → generate_arena_matches() created matches without official_matches');
  } else if (pendingMatches > 0 || activeMatches > 0) {
    // Check if official_matches are finished
    console.log('🟡 C/D: arena_matches still pending/active');
    if (officialMatchIds.length === 0) {
      console.log('   → No official_match_id linked — generate may have failed partway');
    } else {
      console.log('   → Check official_matches status above for no-show / expiry analysis');
    }
  } else if (completedMatches > 0 && processedMatches === 0) {
    console.log('🔴 D: arena_matches completed but NOT processed');
    console.log('   → process_arena_results() has NOT processed results yet');
    console.log('   → pg_cron arena-process-results job may not be running or has a condition guard');
  } else if (processedMatches > 0 && (amh?.length ?? 0) === 0) {
    console.log('🟡 D2: arena_matches processed but arena_match_history is empty');
    console.log('   → Possible insert failure in process_arena_results()');
  } else if (processedMatches === matchesTot && matchesTot > 0 && (amh?.length ?? 0) > 0) {
    console.log('✅ DB: Everything looks processed — possible UI/RPC display issue');
    console.log('   → Check get_arena_detail / get_arena_overview output');
  } else {
    console.log('⚠️ Unknown state — manual inspection needed');
  }

  console.log('\n=== END OF INVESTIGATION ===');
  console.log('READ-ONLY: No DB modifications made.');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
