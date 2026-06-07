import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://farieecfyajbtmjxelop.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function checkTable(table: string) {
  // Use a SELECT with specific columns to verify existence
  const { data, error } = await (supabase as any).from(table).select('id').limit(1);
  if (error) return `table=${table} error: ${error.message}`;
  return `table=${table} ok, rows=${data?.length}`;
}

async function main() {
  // Check arena_events for results_processed_at by trying to select it
  const { data: ev, error: evErr } = await (supabase as any)
    .from('arena_events')
    .select('id, status, results_processed_at')
    .limit(1);
  if (evErr) {
    console.log('arena_events.results_processed_at: MISSING -', evErr.message);
  } else {
    console.log('arena_events.results_processed_at: EXISTS');
  }

  // Check arena_matches
  const { data: am, error: amErr } = await (supabase as any)
    .from('arena_matches')
    .select('id, status, processed_at, master_effect, black_point_delta, white_point_delta, winner_user_id, loser_user_id, end_reason')
    .limit(1);
  if (amErr) console.log('arena_matches cols check ERROR:', amErr.message);
  else console.log('arena_matches key cols: OK');

  // Check arena_points
  const { data: ap, error: apErr } = await (supabase as any)
    .from('arena_points')
    .select('id, arena_id, user_id, season, points, win_count, loss_count, draw_count, no_show_losses, participations, matches_played, last_played_event_id')
    .limit(1);
  if (apErr) console.log('arena_points cols check ERROR:', apErr.message);
  else console.log('arena_points key cols: OK');

  // Check arena_master_history
  const { data: mh, error: mhErr } = await (supabase as any)
    .from('arena_master_history')
    .select('id, arena_id, user_id, season, status, reason, dethroned_at, crowned_at, source_arena_event_id, source_arena_match_id, source_official_match_id')
    .limit(1);
  if (mhErr) console.log('arena_master_history cols check ERROR:', mhErr.message);
  else console.log('arena_master_history key cols: OK');

  // Check arena_definitions
  const { data: ad, error: adErr } = await (supabase as any)
    .from('arena_definitions')
    .select('id, current_master_user_id, current_interim_master_user_id, current_master_since_event_id, current_interim_since_event_id')
    .limit(1);
  if (adErr) console.log('arena_definitions cols check ERROR:', adErr.message);
  else console.log('arena_definitions key cols: OK, rows=' + ad?.length);

  // Check arena_match_history
  const { data: ah, error: ahErr } = await (supabase as any)
    .from('arena_match_history')
    .select('id, arena_match_id, match_kind, end_reason, master_effect, black_point_delta, white_point_delta')
    .limit(1);
  if (ahErr) console.log('arena_match_history cols check ERROR:', ahErr.message);
  else console.log('arena_match_history key cols: OK');
}

main().catch(console.error);
