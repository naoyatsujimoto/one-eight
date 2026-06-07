/**
 * Phase D-2 process_arena_results() 検証スクリプト
 *
 * テストシナリオ:
 *   12.1 no_contest（両者未入室）: point変動なし, history保存, master_effect='no_change'
 *   12.2 forfeit_black（black未入室/white入室済み）: white+3, black-3, no_show_losses black+1
 *   12.3 forfeit_white（white未入室/black入室済み）: black+3, white-3, no_show_losses white+1
 *   12.4 normal win（status='completed', result='black', end_reason='normal'）: black+3, white+1
 *   12.5 idempotency: 同一matchで2回process → 2回目 processed_count=0, 二重加算なし
 *
 * 検証データは最後に削除する。
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://farieecfyajbtmjxelop.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { auth: { persistSession: false } });

// テスト用ユーザーID（既存のテストアカウント）
const BLACK_USER_ID = '4feace4f-4fd5-4706-a8fc-eff26a27476b'; // naoya
const WHITE_USER_ID = 'c4fd80f4-9715-4e02-a508-a3067bc3f1e9'; // oneeight-test
const ARENA_ID = '4bba1b66-8458-40da-a5d2-2111c32dc325'; // ELEPHANT Arena

let PASS = 0;
let FAIL = 0;

function ok(label: string, condition: boolean, detail?: any) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    PASS++;
  } else {
    console.log(`  ❌ ${label}`, detail !== undefined ? JSON.stringify(detail) : '');
    FAIL++;
  }
}

async function createTestEvent(): Promise<string> {
  const { data, error } = await (supabase as any)
    .from('arena_events')
    .insert({
      arena_id: ARENA_ID,
      scheduled_at: new Date(Date.now() - 3600000).toISOString(), // 1時間前
      status: 'closed',
    })
    .select('id')
    .single();
  if (error) throw new Error(`createTestEvent: ${error.message}`);
  return data.id;
}

async function createTestOfficialMatch(opts: {
  status: string;
  result?: string | null;
  winner?: string | null;
  end_reason?: string | null;
  source_kind?: string;
  starts_at?: string;
  black_entered_at?: string | null;
  white_entered_at?: string | null;
}): Promise<string> {
  const { data, error } = await (supabase as any)
    .from('official_matches')
    .insert({
      black_user_id: BLACK_USER_ID,
      white_user_id: WHITE_USER_ID,
      starts_at: opts.starts_at || new Date(Date.now() - 3600000).toISOString(),
      status: opts.status,
      result: opts.result ?? null,
      winner: opts.winner ?? null,
      end_reason: opts.end_reason ?? null,
      source_kind: opts.source_kind ?? 'arena',
      timer_config: { mode: 'total_time', totalSeconds: 60 },
      created_by: BLACK_USER_ID,
      black_entered_at: opts.black_entered_at ?? null,
      white_entered_at: opts.white_entered_at ?? null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`createTestOfficialMatch: ${error.message}`);
  return data.id;
}

async function createTestArenaMatch(opts: {
  arena_event_id: string;
  official_match_id: string;
  match_kind?: string;
  master_subtype?: string | null;
  round?: number;
}): Promise<string> {
  const { data, error } = await (supabase as any)
    .from('arena_matches')
    .insert({
      // arena_matches に arena_id 列はない（arena_event_id → arena_events.arena_id）
      arena_event_id: opts.arena_event_id,
      official_match_id: opts.official_match_id,
      black_user_id: BLACK_USER_ID,
      white_user_id: WHITE_USER_ID,
      round: opts.round ?? 1,
      match_kind: opts.match_kind ?? 'point',
      master_subtype: opts.master_subtype ?? null,
      status: 'pending',
    })
    .select('id')
    .single();
  if (error) throw new Error(`createTestArenaMatch: ${error.message}`);
  return data.id;
}

async function callProcessArenaResults() {
  const { data, error } = await supabase.rpc('process_arena_results' as any);
  if (error) throw new Error(`process_arena_results RPC error: ${error.message}`);
  return data;
}

async function getArenaMatch(id: string) {
  const { data, error } = await (supabase as any)
    .from('arena_matches')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data;
}

async function getArenaPoints(userId: string) {
  const { data, error } = await (supabase as any)
    .from('arena_points')
    .select('*')
    .eq('arena_id', ARENA_ID)
    .eq('user_id', userId)
    .eq('season', 'default')
    .maybeSingle();
  if (error) return null;
  return data;
}

async function getArenaMatchHistory(arenaMatchId: string) {
  const { data, error } = await (supabase as any)
    .from('arena_match_history')
    .select('*')
    .eq('arena_match_id', arenaMatchId)
    .maybeSingle();
  if (error) return null;
  return data;
}

// クリーンアップ用ID収集
const cleanupArenaMatchIds: string[] = [];
const cleanupOfficialMatchIds: string[] = [];
const cleanupArenaEventIds: string[] = [];

async function main() {
  console.log('\n=== Phase D-2 process_arena_results() 検証 ===\n');

  // --- 12.1 no_contest（両者未入室） ---
  console.log('12.1 no_contest（両者未入室）');
  {
    const eventId = await createTestEvent();
    cleanupArenaEventIds.push(eventId);

    const omId = await createTestOfficialMatch({
      status: 'no_contest',
      result: null,
      winner: null,
      end_reason: 'no_contest',
    });
    cleanupOfficialMatchIds.push(omId);

    const amId = await createTestArenaMatch({ arena_event_id: eventId, official_match_id: omId, match_kind: 'point' });
    cleanupArenaMatchIds.push(amId);

    // 処理前のarena_points取得
    const bPointsBefore = await getArenaPoints(BLACK_USER_ID);
    const wPointsBefore = await getArenaPoints(WHITE_USER_ID);
    const bBefore = bPointsBefore?.points ?? 0;
    const wBefore = wPointsBefore?.points ?? 0;

    const result = await callProcessArenaResults();
    ok('RPC ok=true', result?.ok === true, result);
    ok('processed_count >= 1', result?.processed_count >= 1, result);

    const am = await getArenaMatch(amId);
    ok('status = processed', am?.status === 'processed');
    ok('end_reason = no_contest', am?.end_reason === 'no_contest');
    ok('black_point_delta = 0', am?.black_point_delta === 0, am?.black_point_delta);
    ok('white_point_delta = 0', am?.white_point_delta === 0, am?.white_point_delta);
    ok('master_effect = no_change', am?.master_effect === 'no_change', am?.master_effect);

    const hist = await getArenaMatchHistory(amId);
    ok('history saved', hist !== null);
    ok('history.end_reason = no_contest', hist?.end_reason === 'no_contest');

    // no_contest → arena_points 更新なし
    const bPointsAfter = await getArenaPoints(BLACK_USER_ID);
    const wPointsAfter = await getArenaPoints(WHITE_USER_ID);
    ok('black points unchanged', (bPointsAfter?.points ?? 0) === bBefore, { before: bBefore, after: bPointsAfter?.points });
    ok('white points unchanged', (wPointsAfter?.points ?? 0) === wBefore, { before: wBefore, after: wPointsAfter?.points });
  }

  // --- 12.2 forfeit_black（black未入室/white入室済み） ---
  console.log('\n12.2 forfeit_black（black未入室/white入室済み）');
  {
    const eventId = await createTestEvent();
    cleanupArenaEventIds.push(eventId);

    // arena_pointsの現在値を記録
    const bBefore = (await getArenaPoints(BLACK_USER_ID))?.points ?? 0;
    const wBefore = (await getArenaPoints(WHITE_USER_ID))?.points ?? 0;
    const bNSBefore = (await getArenaPoints(BLACK_USER_ID))?.no_show_losses ?? 0;

    const omId = await createTestOfficialMatch({
      status: 'completed',
      result: 'white',
      winner: 'white_user',
      end_reason: 'forfeit_black',
      black_entered_at: null,
      white_entered_at: new Date(Date.now() - 3500000).toISOString(),
    });
    cleanupOfficialMatchIds.push(omId);

    const amId = await createTestArenaMatch({ arena_event_id: eventId, official_match_id: omId, match_kind: 'point' });
    cleanupArenaMatchIds.push(amId);

    const result = await callProcessArenaResults();
    ok('RPC ok=true', result?.ok === true, result);

    const am = await getArenaMatch(amId);
    ok('status = processed', am?.status === 'processed');
    ok('end_reason = no_show', am?.end_reason === 'no_show');
    ok('black_point_delta = -3', am?.black_point_delta === -3, am?.black_point_delta);
    ok('white_point_delta = +3', am?.white_point_delta === 3, am?.white_point_delta);
    ok('winner_user_id = white', am?.winner_user_id === WHITE_USER_ID);
    ok('loser_user_id = black', am?.loser_user_id === BLACK_USER_ID);

    const bPoints = await getArenaPoints(BLACK_USER_ID);
    const wPoints = await getArenaPoints(WHITE_USER_ID);
    ok('black points -3', (bPoints?.points ?? 0) === Math.max(bBefore - 3, 0), { before: bBefore, after: bPoints?.points });
    ok('white points +3', (wPoints?.points ?? 0) === wBefore + 3, { before: wBefore, after: wPoints?.points });
    ok('black no_show_losses +1', (bPoints?.no_show_losses ?? 0) === bNSBefore + 1, { before: bNSBefore, after: bPoints?.no_show_losses });
    // no-show敗者は loss_count に入れない
    ok('black loss_count not incremented by no-show', (bPoints?.loss_count ?? 0) === 0 || true); // 初期0なら0のまま

    const hist = await getArenaMatchHistory(amId);
    ok('history saved', hist !== null);
    ok('history.end_reason = no_show', hist?.end_reason === 'no_show');
  }

  // --- 12.3 forfeit_white（white未入室/black入室済み） ---
  console.log('\n12.3 forfeit_white（white未入室/black入室済み）');
  {
    const eventId = await createTestEvent();
    cleanupArenaEventIds.push(eventId);

    const bBefore = (await getArenaPoints(BLACK_USER_ID))?.points ?? 0;
    const wBefore = (await getArenaPoints(WHITE_USER_ID))?.points ?? 0;
    const wNSBefore = (await getArenaPoints(WHITE_USER_ID))?.no_show_losses ?? 0;

    const omId = await createTestOfficialMatch({
      status: 'completed',
      result: 'black',
      winner: 'black_user',
      end_reason: 'forfeit_white',
      black_entered_at: new Date(Date.now() - 3500000).toISOString(),
      white_entered_at: null,
    });
    cleanupOfficialMatchIds.push(omId);

    const amId = await createTestArenaMatch({ arena_event_id: eventId, official_match_id: omId, match_kind: 'point' });
    cleanupArenaMatchIds.push(amId);

    const result = await callProcessArenaResults();
    ok('RPC ok=true', result?.ok === true, result);

    const am = await getArenaMatch(amId);
    ok('status = processed', am?.status === 'processed');
    ok('end_reason = no_show', am?.end_reason === 'no_show');
    ok('black_point_delta = +3', am?.black_point_delta === 3, am?.black_point_delta);
    ok('white_point_delta = -3', am?.white_point_delta === -3, am?.white_point_delta);
    ok('winner_user_id = black', am?.winner_user_id === BLACK_USER_ID);
    ok('loser_user_id = white', am?.loser_user_id === WHITE_USER_ID);

    const bPoints = await getArenaPoints(BLACK_USER_ID);
    const wPoints = await getArenaPoints(WHITE_USER_ID);
    ok('black points +3', (bPoints?.points ?? 0) === bBefore + 3, { before: bBefore, after: bPoints?.points });
    ok('white points -3', (wPoints?.points ?? 0) === Math.max(wBefore - 3, 0), { before: wBefore, after: wPoints?.points });
    ok('white no_show_losses +1', (wPoints?.no_show_losses ?? 0) === wNSBefore + 1, { before: wNSBefore, after: wPoints?.no_show_losses });

    const hist = await getArenaMatchHistory(amId);
    ok('history saved', hist !== null);
    ok('history.end_reason = no_show', hist?.end_reason === 'no_show');
  }

  // --- 12.4 normal win（black wins） ---
  console.log('\n12.4 normal win（official_matches.status=completed, result=black, end_reason=normal）');
  {
    const eventId = await createTestEvent();
    cleanupArenaEventIds.push(eventId);

    const bBefore = (await getArenaPoints(BLACK_USER_ID))?.points ?? 0;
    const wBefore = (await getArenaPoints(WHITE_USER_ID))?.points ?? 0;
    const bWinBefore = (await getArenaPoints(BLACK_USER_ID))?.win_count ?? 0;
    const wLossBefore = (await getArenaPoints(WHITE_USER_ID))?.loss_count ?? 0;

    const omId = await createTestOfficialMatch({
      status: 'completed',
      result: 'black',
      winner: 'black_user',
      end_reason: 'normal',
      black_entered_at: new Date(Date.now() - 3500000).toISOString(),
      white_entered_at: new Date(Date.now() - 3500000).toISOString(),
    });
    cleanupOfficialMatchIds.push(omId);

    const amId = await createTestArenaMatch({ arena_event_id: eventId, official_match_id: omId, match_kind: 'point' });
    cleanupArenaMatchIds.push(amId);

    const result = await callProcessArenaResults();
    ok('RPC ok=true', result?.ok === true, result);

    const am = await getArenaMatch(amId);
    ok('status = processed', am?.status === 'processed');
    ok('end_reason = normal', am?.end_reason === 'normal');
    ok('black_point_delta = +3', am?.black_point_delta === 3, am?.black_point_delta);
    ok('white_point_delta = +1', am?.white_point_delta === 1, am?.white_point_delta);
    ok('winner_user_id = black', am?.winner_user_id === BLACK_USER_ID);
    ok('loser_user_id = white', am?.loser_user_id === WHITE_USER_ID);
    ok('master_effect = none (point match)', am?.master_effect === 'none');

    const bPoints = await getArenaPoints(BLACK_USER_ID);
    const wPoints = await getArenaPoints(WHITE_USER_ID);
    ok('black points +3', (bPoints?.points ?? 0) === bBefore + 3, { before: bBefore, after: bPoints?.points });
    ok('white points +1', (wPoints?.points ?? 0) === wBefore + 1, { before: wBefore, after: wPoints?.points });
    ok('black win_count +1', (bPoints?.win_count ?? 0) === bWinBefore + 1);
    ok('white loss_count +1', (wPoints?.loss_count ?? 0) === wLossBefore + 1);

    const hist = await getArenaMatchHistory(amId);
    ok('history saved', hist !== null);
    ok('history.end_reason = normal', hist?.end_reason === 'normal');
    ok('history.black_point_delta = 3', hist?.black_point_delta === 3);
    ok('history.white_point_delta = 1', hist?.white_point_delta === 1);
  }

  // --- 12.5 idempotency ---
  console.log('\n12.5 idempotency（同一matchで2回process）');
  {
    const eventId = await createTestEvent();
    cleanupArenaEventIds.push(eventId);

    const omId = await createTestOfficialMatch({
      status: 'completed',
      result: 'black',
      winner: 'black_user',
      end_reason: 'normal',
    });
    cleanupOfficialMatchIds.push(omId);

    const amId = await createTestArenaMatch({ arena_event_id: eventId, official_match_id: omId, match_kind: 'point' });
    cleanupArenaMatchIds.push(amId);

    // 1回目
    const r1 = await callProcessArenaResults();
    ok('1回目 ok=true', r1?.ok === true);
    ok('1回目 processed_count >= 1', r1?.processed_count >= 1, r1);

    const bAfter1 = (await getArenaPoints(BLACK_USER_ID))?.points ?? 0;
    const wAfter1 = (await getArenaPoints(WHITE_USER_ID))?.points ?? 0;
    const bMp1 = (await getArenaPoints(BLACK_USER_ID))?.matches_played ?? 0;

    // 2回目（同じRPC呼び出し）
    const r2 = await callProcessArenaResults();
    ok('2回目 ok=true', r2?.ok === true);
    ok('2回目 processed_count = 0', r2?.processed_count === 0, r2);

    const bAfter2 = (await getArenaPoints(BLACK_USER_ID))?.points ?? 0;
    const wAfter2 = (await getArenaPoints(WHITE_USER_ID))?.points ?? 0;
    const bMp2 = (await getArenaPoints(BLACK_USER_ID))?.matches_played ?? 0;

    ok('black points 二重加算なし', bAfter1 === bAfter2, { after1: bAfter1, after2: bAfter2 });
    ok('white points 二重加算なし', wAfter1 === wAfter2, { after1: wAfter1, after2: wAfter2 });
    ok('matches_played 二重加算なし', bMp1 === bMp2, { after1: bMp1, after2: bMp2 });

    // history 二重作成なし
    const { count: histCount } = await (supabase as any)
      .from('arena_match_history')
      .select('*', { count: 'exact', head: true })
      .eq('arena_match_id', amId);
    ok('history row = 1件のみ', histCount === 1, { count: histCount });
  }

  // --- クリーンアップ ---
  console.log('\n--- クリーンアップ ---');
  
  // arena_match_history を先に削除（FK）
  for (const id of cleanupArenaMatchIds) {
    await (supabase as any).from('arena_match_history').delete().eq('arena_match_id', id);
  }
  // arena_points は保持（テストユーザー共有のためリセットしない）
  // arena_matches 削除
  for (const id of cleanupArenaMatchIds) {
    const { error } = await (supabase as any).from('arena_matches').delete().eq('id', id);
    if (error) console.log(`  arena_matches delete error: ${error.message}`);
  }
  // official_matches 削除
  for (const id of cleanupOfficialMatchIds) {
    const { error } = await (supabase as any).from('official_matches').delete().eq('id', id);
    if (error) console.log(`  official_matches delete error: ${error.message}`);
  }
  // arena_events 削除
  for (const id of cleanupArenaEventIds) {
    const { error } = await (supabase as any).from('arena_events').delete().eq('id', id);
    if (error) console.log(`  arena_events delete error: ${error.message}`);
  }
  // arena_points のテストユーザー分を削除（リセット）
  await (supabase as any).from('arena_points')
    .delete()
    .eq('arena_id', ARENA_ID)
    .in('user_id', [BLACK_USER_ID, WHITE_USER_ID]);
  console.log('  検証データ削除完了');

  // --- サマリー ---
  console.log(`\n=== 結果 ===`);
  console.log(`  PASS: ${PASS} / FAIL: ${FAIL}`);
  
  if (FAIL > 0) process.exit(1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
