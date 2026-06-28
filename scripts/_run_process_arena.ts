import { createClient } from '@supabase/supabase-js';
const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(url, key, { auth: { persistSession: false } });
const jst = (d: any) => d ? new Date(new Date(d).getTime()+9*3600*1000).toISOString().replace('T',' ').substring(0,19)+' JST' : '(null)';
const mask = (id: any) => id ? String(id).substring(0,8)+'...' : '(null)';

const EVENT_ID    = '4a8ba63c-9e62-4a3e-ae5f-eb43e921cdd0';
const ARENA_ID    = '4bba1b66-8458-40da-a5d2-2111c32dc325';
const OM_ID       = 'c56dadd2-602e-4f51-844f-189c723f6c88';

async function check(label: string) {
  console.log(`\n=== ${label} ===`);

  const { data: am } = await (sb as any)
    .from('arena_matches')
    .select('id, status, processed_at, winner_user_id, loser_user_id, end_reason, black_point_delta, white_point_delta, master_effect, official_match_id')
    .eq('arena_event_id', EVENT_ID).single();
  console.log(`arena_match: status=${am?.status} processed_at=${jst(am?.processed_at)} winner=${mask(am?.winner_user_id)} end_reason=${am?.end_reason} delta(b/w)=${am?.black_point_delta}/${am?.white_point_delta} effect=${am?.master_effect}`);

  const { data: om } = await (sb as any)
    .from('official_matches')
    .select('status, result, winner, end_reason, source_kind')
    .eq('id', OM_ID).single();
  console.log(`official_match: status=${om?.status} result=${om?.result} winner=${om?.winner} end_reason=${om?.end_reason} source_kind=${om?.source_kind}`);

  const { data: amh } = await (sb as any)
    .from('arena_match_history')
    .select('id, match_kind, end_reason, master_effect, black_point_delta, white_point_delta')
    .eq('arena_event_id', EVENT_ID);
  console.log(`arena_match_history rows: ${amh?.length ?? 0}`);
  amh?.forEach((h: any) => console.log(`  kind=${h.match_kind} end=${h.end_reason} effect=${h.master_effect} bp=${h.black_point_delta} wp=${h.white_point_delta}`));

  const { data: pts } = await (sb as any)
    .from('arena_points')
    .select('user_id, points, season, participations, win_count, loss_count')
    .eq('arena_id', ARENA_ID).eq('season', 'default').order('points', { ascending: false });
  console.log(`arena_points (default season):`);
  pts?.forEach((p: any) => console.log(`  user=${mask(p.user_id)} pts=${p.points} W=${p.win_count} L=${p.loss_count} participations=${p.participations}`));

  const { data: mh } = await (sb as any)
    .from('arena_master_history')
    .select('id, status, reason, user_id, crowned_at, dethroned_at')
    .eq('arena_id', ARENA_ID).order('crowned_at', { ascending: false });
  console.log(`arena_master_history rows: ${mh?.length ?? 0}`);
  mh?.forEach((h: any) => console.log(`  status=${h.status} reason=${h.reason} user=${mask(h.user_id)} crowned=${jst(h.crowned_at)} dethroned=${jst(h.dethroned_at)}`));
}

async function main() {
  console.log('====== process_arena_results() 1回実行 ======');
  console.log(`Time: ${jst(new Date())}`);

  // === 事前確認 ===
  await check('PRE-CHECK');

  // === 実行 (1回のみ) ===
  console.log('\n=== EXECUTE: process_arena_results() ===');
  const { data: result, error: execErr } = await (sb as any).rpc('process_arena_results');
  console.log('RPC error:', execErr?.message ?? 'none');
  console.log('RPC return value:');
  console.log(JSON.stringify(result, null, 2));

  if (result?.errors && Array.isArray(result.errors) && result.errors.length > 0) {
    console.log('\n⚠️ errors array is NON-EMPTY:');
    result.errors.forEach((e: any, i: number) => {
      const safe = { ...e };
      if (safe.arena_match_id) safe.arena_match_id = safe.arena_match_id.substring(0,8)+'...';
      console.log(`  [${i+1}]`, JSON.stringify(safe));
    });
  } else {
    console.log('\n✅ errors array is empty');
  }

  // === 事後確認 ===
  await check('POST-CHECK');

  // get_arena_overview
  console.log('\n=== get_arena_overview (ELEPHANT) ===');
  const { data: ov } = await (sb as any).rpc('get_arena_overview');
  const el = ov?.find((e: any) => e.code === 'ELEPHANT');
  console.log(`event_id=${el?.event_id ?? 'null'} event_status=${el?.event_status ?? 'null'} entry_count=${el?.entry_count}`);
  console.log(`current_master=${el?.current_master_display_name} previous_results_pending=${el?.previous_results_pending}`);

  // get_arena_detail
  console.log('\n=== get_arena_detail (ELEPHANT) ===');
  const { data: det } = await (sb as any).rpc('get_arena_detail', { p_arena_id: ARENA_ID });
  console.log(`recent_match_history: ${det?.recent_match_history?.length ?? 0} rows`);
  det?.recent_match_history?.forEach((h: any) => console.log(`  kind=${h.match_kind} end=${h.end_reason} effect=${h.master_effect}`));
  console.log(`recent_master_history: ${det?.recent_master_history?.length ?? 0} rows`);
  det?.recent_master_history?.forEach((h: any) => console.log(`  status=${h.status} user=${h.display_name} started=${jst(h.started_at)} ended=${jst(h.ended_at)}`));
  console.log(`current_master_display_name: ${det?.current_master_display_name}`);

  console.log('\n====== DONE. 実行回数: 1回 ======');
  console.log('手動UPDATE/INSERT/DELETE: なし');
  console.log('generate_arena_matches/ensure_next_arena_events: 未実行');
  console.log('重複event cleanup: 未実施');
}
main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
