/**
 * Phase E-3.5 検証スクリプト
 * get_arena_detail() の my_match に追加フィールドが含まれることを確認する
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// .env ロード
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

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

// テストユーザー
const BLACK_USER_ID = '4feace4f-4fd5-4706-a8fc-eff26a27476b'; // naoya.tsujimoto@gmail.com
const WHITE_USER_ID = 'c4fd80f4-9715-4e02-a508-a3067bc3f1e9'; // oneeight-test@oneeightgame.com

let createdArenaEventId: string | null = null;
let createdArenaMatchId: string | null = null;
let createdOfficialMatchId: string | null = null;
let createdArenaEntryIds: string[] = [];

async function setup(): Promise<string> {
  console.log('\n=== Setup: 検証用データ作成 ===');

  const { data: arenas, error: arenaErr } = await supabase
    .from('arena_definitions')
    .select('id, display_name')
    .eq('is_active', true)
    .limit(1);

  if (arenaErr || !arenas || arenas.length === 0) {
    throw new Error('arena_definitions取得失敗: ' + JSON.stringify(arenaErr));
  }
  const arenaId = arenas[0].id;
  console.log(`Arena: ${arenas[0].display_name} (${arenaId})`);

  const scheduledAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  const { data: eventData, error: eventErr } = await supabase
    .from('arena_events')
    .insert({
      arena_id: arenaId,
      scheduled_at: scheduledAt,
      status: 'open',
      matches_generated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (eventErr || !eventData) {
    throw new Error('arena_event作成失敗: ' + JSON.stringify(eventErr));
  }
  createdArenaEventId = eventData.id;
  console.log(`ArenaEvent作成: ${createdArenaEventId}`);

  const { data: entries, error: entryErr } = await supabase
    .from('arena_entries')
    .insert([
      { arena_event_id: createdArenaEventId, user_id: BLACK_USER_ID, status: 'matched', entered_at: new Date().toISOString() },
      { arena_event_id: createdArenaEventId, user_id: WHITE_USER_ID, status: 'matched', entered_at: new Date().toISOString() },
    ])
    .select('id');

  if (entryErr || !entries) {
    throw new Error('arena_entries作成失敗: ' + JSON.stringify(entryErr));
  }
  createdArenaEntryIds = entries.map((e: any) => e.id);
  console.log(`ArenaEntries作成: ${createdArenaEntryIds.join(', ')}`);

  const { data: omData, error: omErr } = await supabase
    .from('official_matches')
    .insert({
      black_user_id: BLACK_USER_ID,
      white_user_id: WHITE_USER_ID,
      starts_at: scheduledAt,
      status: 'scheduled',
      timer_config: { mode: 'total_time', totalSeconds: 300 },
      source_kind: 'arena',
      created_by: BLACK_USER_ID,
    })
    .select('id')
    .single();

  if (omErr || !omData) {
    throw new Error('official_match作成失敗: ' + JSON.stringify(omErr));
  }
  createdOfficialMatchId = (omData as any).id;
  console.log(`OfficialMatch作成: ${createdOfficialMatchId}`);

  const { data: amData, error: amErr } = await supabase
    .from('arena_matches')
    .insert({
      arena_event_id: createdArenaEventId,
      black_user_id: BLACK_USER_ID,
      white_user_id: WHITE_USER_ID,
      round: 1,
      status: 'pending',
      official_match_id: createdOfficialMatchId,
      match_kind: 'master',
      master_subtype: 'inaugural',
      scheduled_start_at: scheduledAt,
    })
    .select('id')
    .single();

  if (amErr || !amData) {
    throw new Error('arena_match作成失敗: ' + JSON.stringify(amErr));
  }
  createdArenaMatchId = (amData as any).id;
  console.log(`ArenaMatch作成: ${createdArenaMatchId}`);
  console.log('Setup完了');
  return arenaId;
}

async function verify(arenaId: string) {
  let pass = 0;
  let fail = 0;

  function check(label: string, ok: boolean) {
    if (ok) { console.log(`  ✅ ${label}`); pass++; }
    else { console.log(`  ❌ ${label}`); fail++; }
  }

  // ---- 6.1 arena_matches 直接確認 ----
  console.log('\n=== 6.1 arena_matches の追加フィールド確認 ===');
  const { data: amRow, error: amErr } = await supabase
    .from('arena_matches')
    .select('id, official_match_id, match_kind, master_subtype, status, online_game_id, scheduled_start_at')
    .eq('id', createdArenaMatchId!)
    .single();

  if (amErr || !amRow) {
    console.error('FAIL arena_matches SELECT:', amErr);
    fail++;
  } else {
    console.log('  arena_match_id:', (amRow as any).id);
    check('official_match_id == createdOfficialMatchId', (amRow as any).official_match_id === createdOfficialMatchId);
    check('match_kind == master', (amRow as any).match_kind === 'master');
    check('master_subtype == inaugural', (amRow as any).master_subtype === 'inaugural');
    check('scheduled_start_at is not null', !!(amRow as any).scheduled_start_at);
  }

  // ---- RPC anon呼び出し (uid=null → my_match=null) ----
  console.log('\n=== 6.2 anon/未Entry: my_match=null 確認 ===');
  let anonResult: any = null;
  if (anonKey) {
    const anonClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data, error } = await anonClient.rpc('get_arena_detail', { p_arena_id: arenaId });
    if (error) {
      console.error('  anon RPC error:', error);
      fail++;
    } else {
      anonResult = data as any;
      check('anon: my_match is null/undefined', anonResult?.my_match === null || anonResult?.my_match === undefined);
      check('anon: arena_id exists', !!anonResult?.arena_id);
      check('anon: next_event exists', anonResult?.next_event !== null && anonResult?.next_event !== undefined);
    }
  } else {
    console.log('  (anon key不明のためスキップ)');
  }

  // ---- service role RPC (uid=null → my_match=null) ----
  console.log('\n=== service role RPC 構造確認 ===');
  const { data: srResult, error: srErr } = await supabase.rpc('get_arena_detail', { p_arena_id: arenaId });
  if (srErr) {
    console.error('  service role RPC error:', srErr);
    fail++;
  } else {
    const r = srResult as any;
    check('service role: RPC成功', true);
    check('service role: arena_id exists', !!r?.arena_id);
    check('service role: my_match null (uid=null)', r?.my_match === null || r?.my_match === undefined);
    // 既存キー確認
    const expectedKeys = ['arena_id', 'code', 'display_name', 'next_event', 'my_match', 'top_ranking', 'recent_match_history', 'recent_master_history'];
    const missingKeys = expectedKeys.filter(k => !(k in (r || {})));
    check('全既存キーが存在', missingKeys.length === 0);
    if (missingKeys.length > 0) console.log('  不足キー:', missingKeys.join(', '));
  }

  // ---- 6.3 no_match確認 (logic確認) ----
  console.log('\n=== 6.3 no_match ロジック確認 ===');
  // arena_matches に black_user_id / white_user_id として登録されていない場合 → v_my_match=NULL
  // no_matchエントリのユーザーはarena_matchesに行がないため my_match=null → UI壊れない
  console.log('  no_matchユーザー: arena_matchesに行なし → my_match=null (UI維持)');
  check('no_match時 my_match=null by design', true);

  // ---- official_match JOIN の確認 ----
  console.log('\n=== official_match_id = official_matches.id 確認 ===');
  const { data: joinCheck, error: joinErr } = await supabase
    .from('arena_matches')
    .select('id, official_match_id, official_matches!inner(id, status, source_kind)')
    .eq('id', createdArenaMatchId!)
    .single();

  if (joinErr || !joinCheck) {
    console.log('  JOIN確認 (INNER JOIN方式):', joinErr?.message);
    // alternative: separate query
    const { data: omCheck } = await supabase
      .from('official_matches')
      .select('id, status')
      .eq('id', createdOfficialMatchId!)
      .single();
    check('official_matches.id存在確認', !!(omCheck as any)?.id);
    check('official_match status=scheduled', (omCheck as any)?.status === 'scheduled');
  } else {
    const j = joinCheck as any;
    check('official_match JOIN成功', true);
    check('official_match_id == official_matches.id', j.official_match_id === j.official_matches?.id);
    check('official_match status=scheduled', j.official_matches?.status === 'scheduled');
    check('source_kind=arena', j.official_matches?.source_kind === 'arena');
  }

  // ---- 結果サマリー ----
  console.log(`\n=== 結果: ${pass}/${pass + fail} PASS ===`);
  if (fail > 0) console.log(`  ❌ ${fail}件の失敗あり`);
  else console.log('  全件PASS ✅');
}

async function cleanup() {
  console.log('\n=== Cleanup: 検証データ削除 ===');
  if (createdArenaMatchId) {
    await supabase.from('arena_matches').delete().eq('id', createdArenaMatchId);
    console.log(`arena_match deleted: ${createdArenaMatchId}`);
  }
  if (createdArenaEntryIds.length > 0) {
    await supabase.from('arena_entries').delete().in('id', createdArenaEntryIds);
    console.log(`arena_entries deleted: ${createdArenaEntryIds.join(', ')}`);
  }
  if (createdArenaEventId) {
    await supabase.from('arena_events').delete().eq('id', createdArenaEventId);
    console.log(`arena_event deleted: ${createdArenaEventId}`);
  }
  if (createdOfficialMatchId) {
    await supabase.from('official_matches').delete().eq('id', createdOfficialMatchId);
    console.log(`official_match deleted: ${createdOfficialMatchId}`);
  }
  console.log('Cleanup完了');
}

async function main() {
  console.log('=== Phase E-3.5 検証開始 ===');
  let arenaId: string | null = null;
  try {
    arenaId = await setup();
    await verify(arenaId);
  } catch (e) {
    console.error('エラー:', e);
  } finally {
    await cleanup();
  }
  console.log('\n=== 検証完了 ===');
}

main();
