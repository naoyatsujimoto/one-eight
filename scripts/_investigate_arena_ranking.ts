import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://farieecfyajbtmjxelop.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  // arena_points カラム確認
  const { data: apSample, error: apErr } = await (supabase as any)
    .from('arena_points')
    .select('*')
    .limit(5);
  if (apErr) console.error('arena_points error:', apErr.message);
  else {
    console.log('arena_points sample:');
    console.log(JSON.stringify(apSample, null, 2));
    if (apSample?.length > 0) {
      console.log('arena_points columns:', Object.keys(apSample[0]));
    }
  }

  // arena_match_history カラム確認
  const { data: amhSample, error: amhErr } = await (supabase as any)
    .from('arena_match_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);
  if (amhErr) console.error('arena_match_history error:', amhErr.message);
  else {
    console.log('\narena_match_history sample:');
    console.log(JSON.stringify(amhSample, null, 2));
    if (amhSample?.length > 0) {
      console.log('arena_match_history columns:', Object.keys(amhSample[0]));
    } else {
      console.log('arena_match_history: 0 rows');
    }
  }

  // arena_matches カラム確認 (status=processedのもの)
  const { data: amSample, error: amErr } = await (supabase as any)
    .from('arena_matches')
    .select('*')
    .eq('status', 'processed')
    .limit(5);
  if (amErr) console.error('arena_matches error:', amErr.message);
  else {
    console.log('\narena_matches (processed) sample:');
    console.log(JSON.stringify(amSample, null, 2));
    if (amSample?.length > 0) {
      console.log('arena_matches columns:', Object.keys(amSample[0]));
    }
  }

  // get_arena_detail で top_ranking の内容を確認
  const { data: defs } = await (supabase as any)
    .from('arena_definitions')
    .select('id, code, display_name')
    .limit(2);
  console.log('\narena_definitions:', JSON.stringify(defs, null, 2));

  if (defs && defs.length > 0) {
    const arenaId = defs[0].id;
    const { data: detail, error: detErr } = await supabase.rpc('get_arena_detail', { p_arena_id: arenaId });
    if (detErr) console.error('get_arena_detail error:', detErr.message);
    else {
      const d = detail as any;
      console.log('\nget_arena_detail top_ranking:', JSON.stringify(d?.top_ranking, null, 2));
    }
  }

  // information_schema でカラム確認
  const { data: schemaCols, error: schErr } = await (supabase as any)
    .rpc('get_arena_overview');
  if (schErr) console.error('get_arena_overview error:', schErr.message);
  else {
    const arr = Array.isArray(schemaCols) ? schemaCols : [];
    if (arr.length > 0) {
      console.log('\nget_arena_overview[0] keys:', Object.keys(arr[0]));
    }
  }
}

main().catch(console.error);
