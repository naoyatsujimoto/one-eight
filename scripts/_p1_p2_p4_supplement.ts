import { readFileSync } from 'fs';
try {
  const lines = readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/.env', 'utf-8').split('\n');
  for (const line of lines) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('='); if (idx < 0) continue;
    const k = t.slice(0, idx).trim();
    const v = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
} catch {}
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

function mask(id: string|null|undefined) { return id ? id.substring(0,8)+'...' : '(null)'; }

async function main() {
  // === P-1: prize_archive_logs 実カラム確認 ===
  console.log('=== P-1: prize_archive_logs 実カラム ===');
  const { data: full, error: fe } = await (sb as any).from('prize_archive_logs').select('*').limit(1);
  if (fe) { console.log('ERROR:', fe.message); }
  else if (full && full.length > 0) {
    console.log('カラム一覧:', Object.keys(full[0]).join(', '));
  } else {
    // 0件でもカラム名は返る場合あり、別途試みる
    const { data: d0, error: e0 } = await (sb as any).from('prize_archive_logs').select('id, event_type, actor_user_id').limit(1);
    console.log('event_type + actor_user_id:', e0 ? 'COLUMN ERROR: '+e0.message : 'OK');
    const { data: d1, error: e1 } = await (sb as any).from('prize_archive_logs').select('id, action, performed_by_user_id').limit(1);
    console.log('action + performed_by_user_id:', e1 ? 'COLUMN ERROR: '+e1.message : 'OK');
  }

  // event_type と action 両方試す（カラムが複数ある可能性）
  const { error: etErr } = await (sb as any).from('prize_archive_logs').select('event_type').limit(1);
  console.log('event_type カラム:', etErr ? '存在しない: '+etErr.message : '存在する');
  const { error: actErr } = await (sb as any).from('prize_archive_logs').select('action').limit(1);
  console.log('action カラム:', actErr ? '存在しない: '+actErr.message : '存在する');
  const { error: auidErr } = await (sb as any).from('prize_archive_logs').select('actor_user_id').limit(1);
  console.log('actor_user_id カラム:', auidErr ? '存在しない: '+auidErr.message : '存在する');
  const { error: pbuidErr } = await (sb as any).from('prize_archive_logs').select('performed_by_user_id').limit(1);
  console.log('performed_by_user_id カラム:', pbuidErr ? '存在しない: '+pbuidErr.message : '存在する');

  // === P-4: 未処理 arena_match の official_match 詳細 ===
  console.log('\n=== P-4: 未処理 arena_match の official_match ===');
  const { data: am, error: amErr } = await (sb as any)
    .from('arena_matches')
    .select('id, arena_event_id, status, processed_at, official_match_id')
    .is('processed_at', null);
  if (amErr) { console.log('arena_matches ERROR:', amErr.message); }
  else {
    console.log('未処理件数:', am?.length ?? 0);
    for (const m of (am || [])) {
      console.log('  arena_match_id:', mask(m.id), 'status:', m.status, 'om_id:', mask(m.official_match_id));
      if (m.official_match_id) {
        const { data: om, error: omErr } = await (sb as any)
          .from('official_matches')
          .select('id, status, source_kind, ends_at, updated_at')
          .eq('id', m.official_match_id)
          .limit(1);
        if (omErr) console.log('  official_match ERROR:', omErr.message);
        else if (om && om.length > 0) {
          console.log('  official_match: status='+om[0].status, 'source_kind='+om[0].source_kind, 'ends_at='+om[0].ends_at);
        } else {
          console.log('  official_match: NOT FOUND');
        }
      }
    }
  }

  // === P-2: UNIQUE制約 migration確認 ===
  console.log('\n=== P-2: UNIQUE制約 migration確認 ===');
  const { execSync } = await import('child_process');
  try {
    const r1 = execSync(
      `grep -rn "arena_events_arena_id_scheduled_at\\|UNIQUE.*arena_id.*scheduled_at\\|arena_id.*scheduled_at.*UNIQUE" supabase/migrations/ 2>/dev/null | head -20`,
      { encoding: 'utf8', cwd: '/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp' }
    );
    console.log('UNIQUE制約 migration grep:\n' + (r1 || '(なし)'));
  } catch {}

  // === P-6補完: RLSを migration で確認 ===
  console.log('\n=== P-6: RLS ENABLE/DISABLE migration確認 ===');
  try {
    const r2 = execSync(
      `grep -rn "ROW LEVEL SECURITY\\|ENABLE ROW\\|DISABLE ROW" supabase/migrations/ 2>/dev/null | grep -i "prize_archive_logs\\|prize_payouts\\|prize_temp_tax\\|paddle_webhook\\|admin_messages" | head -20`,
      { encoding: 'utf8', cwd: '/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp' }
    );
    console.log('機微テーブルRLS:\n' + (r2 || '(なし)'));
  } catch {}
  try {
    const r3 = execSync(
      `grep -rn "DISABLE ROW LEVEL" supabase/migrations/ 2>/dev/null | head -20`,
      { encoding: 'utf8', cwd: '/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp' }
    );
    console.log('\nDISABLE RLS migration grep:\n' + (r3 || '(なし)'));
  } catch {}

  // === P-6補完: search_path migration確認 ===
  console.log('\n=== P-6: search_path未設定RPC migration確認 ===');
  try {
    const r4 = execSync(
      `grep -rn "SET search_path" supabase/migrations/20260617144134_fix_search_path_high_risk_functions.sql 2>/dev/null | wc -l`,
      { encoding: 'utf8', cwd: '/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp' }
    );
    console.log('20260617144134 migration SET search_path 件数:', r4.trim());
  } catch {}

  // admin_messages の漏れ詳細（P-3補完）
  console.log('\n=== P-3: admin_messages source_id 漏れ の award詳細 ===');
  const missingAwardIds = ['9002b7c8', 'ae191520']; // maskした先頭部分
  const { data: allAwards, error: aaErr } = await (sb as any)
    .from('prize_awards')
    .select('id, source_kind, source_arena_event_id, source_arena_match_id, status, created_at')
    .eq('source_kind', 'arena_master');
  if (aaErr) { console.log('prize_awards ERROR:', aaErr.message); }
  else {
    for (const a of (allAwards || [])) {
      // admin_messages確認
      const { data: msg, error: msgErr } = await (sb as any)
        .from('admin_messages')
        .select('id')
        .eq('source_id', a.id)
        .limit(1);
      const hasMsgOk = !msgErr && msg && msg.length > 0;
      console.log(`  award_id=${mask(a.id)} status=${a.status} event_id=${mask(a.source_arena_event_id)} match_id=${mask(a.source_arena_match_id)} admin_msg=${hasMsgOk ? '✅' : '⚠️なし'} created=${a.created_at}`);
    }
  }
}
main().catch(console.error);
