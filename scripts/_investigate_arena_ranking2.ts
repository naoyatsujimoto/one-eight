import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// .env load
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

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false }
});

async function main() {
  // 1. arena_points カラムと全データ確認
  const { data: apData, error: apErr } = await supabase
    .from('arena_points' as any)
    .select('*')
    .limit(10);
  if (apErr) console.error('[arena_points error]', apErr.message);
  else {
    console.log('[arena_points count]', apData?.length);
    if (apData && apData.length > 0) {
      console.log('[arena_points columns]', Object.keys(apData[0]));
      console.log('[arena_points sample]', JSON.stringify(apData.slice(0,3), null, 2));
    }
  }

  // 2. arena_match_history カラム確認
  const { data: amhData, error: amhErr } = await supabase
    .from('arena_match_history' as any)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);
  if (amhErr) console.error('[arena_match_history error]', amhErr.message);
  else {
    console.log('\n[arena_match_history count]', amhData?.length);
    if (amhData && amhData.length > 0) {
      console.log('[arena_match_history columns]', Object.keys(amhData[0]));
      console.log('[arena_match_history sample]', JSON.stringify(amhData.slice(0,3), null, 2));
    }
  }

  // 3. arena_definitions 確認
  const { data: adData, error: adErr } = await supabase
    .from('arena_definitions' as any)
    .select('id, code, display_name')
    .limit(5);
  if (adErr) console.error('[arena_definitions error]', adErr.message);
  else {
    console.log('\n[arena_definitions]', JSON.stringify(adData, null, 2));
  }

  // 4. get_arena_detail で top_ranking 確認
  if (adData && adData.length > 0) {
    for (const ad of adData) {
      const { data: detailData, error: detErr } = await supabase.rpc('get_arena_detail', { p_arena_id: (ad as any).id });
      if (detErr) {
        console.error(`[get_arena_detail (${(ad as any).code}) error]`, detErr.message);
      } else {
        const d = detailData as any;
        console.log(`\n[get_arena_detail (${(ad as any).code})] top_ranking:`, JSON.stringify(d?.top_ranking, null, 2));
        console.log(`[get_arena_detail (${(ad as any).code})] top_ranking keys:`, 
          d?.top_ranking?.[0] ? Object.keys(d.top_ranking[0]) : 'no data');
      }
    }
  }

  // 5. arena_match_history date/timestamp カラムを確認（point_delta等）
  console.log('\n[arena_match_history full schema check via matches]');
  const { data: amData, error: amErr } = await supabase
    .from('arena_matches' as any)
    .select('*')
    .eq('status', 'processed')
    .limit(5);
  if (amErr) console.error('[arena_matches error]', amErr.message);
  else {
    console.log('[arena_matches (processed) count]', amData?.length);
    if (amData && amData.length > 0) {
      console.log('[arena_matches columns]', Object.keys(amData[0]));
      console.log('[arena_matches sample]', JSON.stringify(amData.slice(0,2), null, 2));
    }
  }
}

main().catch(console.error);
