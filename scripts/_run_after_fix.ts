import { createClient } from '@supabase/supabase-js';
const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(url, key, { auth: { persistSession: false } });
const jst = (d: any) => d ? new Date(new Date(d).getTime()+9*3600*1000).toISOString().replace('T',' ').substring(0,19)+' JST' : '(null)';
const mask = (id: any) => id ? String(id).substring(0,8)+'...' : '(null)';
const EVENT_ID = '4a8ba63c-9e62-4a3e-ae5f-eb43e921cdd0';
const ARENA_ID = '4bba1b66-8458-40da-a5d2-2111c32dc325';
const OM_ID    = 'c56dadd2-602e-4f51-844f-189c723f6c88';

async function main() {
  console.log('=== PRE-CHECK ===');
  const { data: am0 } = await (sb as any).from('arena_matches').select('status, processed_at, winner_user_id, loser_user_id, end_reason, black_point_delta, white_point_delta, master_effect, official_match_id').eq('arena_event_id', EVENT_ID).single();
  console.log(`arena_match: status=${am0?.status} processed_at=${jst(am0?.processed_at)}`);
  const { data: amh0 } = await (sb as any).from('arena_match_history').select('id').eq('arena_event_id', EVENT_ID);
  console.log(`arena_match_history: ${amh0?.length ?? 0} rows`);

  // === process_arena_results() 1回のみ実行 ===
  console.log('\n=== EXECUTE process_arena_results() ===');
  const { data: res, error: resErr } = await (sb as any).rpc('process_arena_results');
  console.log('error:', resErr?.message ?? 'none');
  console.log('return:', JSON.stringify(res, null, 2));

  if (res?.errors?.length > 0) {
    console.log('\n⚠️ errors:');
    res.errors.forEach((e: any, i: number) => {
      const s = { ...e };
      if (s.arena_match_id) s.arena_match_id = s.arena_match_id.substring(0,8)+'...';
      console.log(`  [${i+1}]`, JSON.stringify(s));
    });
  } else {
    console.log('✅ errors array empty');
  }

  // === POST-CHECK ===
  console.log('\n=== POST-CHECK ===');
  const { data: am } = await (sb as any).from('arena_matches').select('id, status, processed_at, winner_user_id, loser_user_id, end_reason, black_point_delta, white_point_delta, master_effect').eq('arena_event_id', EVENT_ID).single();
  console.log(`arena_match:`);
  console.log(`  status=${am?.status}  processed_at=${jst(am?.processed_at)}`);
  console.log(`  winner=${mask(am?.winner_user_id)}  loser=${mask(am?.loser_user_id)}`);
  console.log(`  end_reason=${am?.end_reason}  delta(b/w)=${am?.black_point_delta}/${am?.white_point_delta}  effect=${am?.master_effect}`);

  const { data: amh } = await (sb as any).from('arena_match_history').select('id, match_kind, end_reason, master_effect, black_point_delta, white_point_delta, winner_user_id, loser_user_id').eq('arena_event_id', EVENT_ID);
  console.log(`\narena_match_history: ${amh?.length ?? 0} rows`);
  amh?.forEach((h: any) => console.log(`  kind=${h.match_kind} end=${h.end_reason} effect=${h.master_effect} bp=${h.black_point_delta} wp=${h.white_point_delta} winner=${mask(h.winner_user_id)}`));

  const { data: pts } = await (sb as any).from('arena_points').select('user_id, points, season, win_count, loss_count, participations').eq('arena_id', ARENA_ID).eq('season', 'default').order('points', { ascending: false });
  console.log(`\narena_points (default):`);
  pts?.forEach((p: any) => console.log(`  user=${mask(p.user_id)} pts=${p.points} W=${p.win_count} L=${p.loss_count}`));

  const { data: mh } = await (sb as any).from('arena_master_history').select('id, status, reason, user_id, crowned_at, dethroned_at').eq('arena_id', ARENA_ID).order('crowned_at', { ascending: false });
  console.log(`\narena_master_history: ${mh?.length ?? 0} rows`);
  mh?.forEach((h: any) => console.log(`  status=${h.status} reason=${h.reason} user=${mask(h.user_id)} crowned=${jst(h.crowned_at)} dethroned=${jst(h.dethroned_at)}`));
  const activeOfficial = mh?.filter((h: any) => h.status === 'official' && !h.dethroned_at) ?? [];
  console.log(`  active official count: ${activeOfficial.length} (must be 1)`);

  const { data: ev } = await (sb as any).from('arena_events').select('id, status, results_processed_at').eq('id', EVENT_ID).single();
  console.log(`\narena_event: status=${ev?.status} results_processed_at=${jst(ev?.results_processed_at)}`);

  const { data: ov } = await (sb as any).rpc('get_arena_overview');
  const el = ov?.find((e: any) => e.code === 'ELEPHANT');
  console.log(`\nget_arena_overview: event_id=${el?.event_id ?? 'null'} event_status=${el?.event_status ?? 'null'} current_master=${el?.current_master_display_name}`);

  const { data: det } = await (sb as any).rpc('get_arena_detail', { p_arena_id: ARENA_ID });
  console.log(`get_arena_detail:`);
  console.log(`  current_master=${det?.current_master_display_name}`);
  console.log(`  recent_match_history: ${det?.recent_match_history?.length ?? 0} rows`);
  det?.recent_match_history?.forEach((h: any) => console.log(`    kind=${h.match_kind} end=${h.end_reason} effect=${h.master_effect}`));
  console.log(`  recent_master_history: ${det?.recent_master_history?.length ?? 0} rows`);
  det?.recent_master_history?.forEach((h: any) => console.log(`    status=${h.status} user=${h.display_name} started=${jst(h.started_at)} ended=${jst(h.ended_at)}`));

  console.log('\n====== DONE ======');
  console.log('実行回数: 1回のみ');
  console.log('手動UPDATE/INSERT/DELETE: なし');
  console.log('generate_arena_matches / ensure_next_arena_events: 未実行');
  console.log('重複event cleanup: 未実施');
}
main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
