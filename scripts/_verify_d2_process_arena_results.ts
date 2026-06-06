/**
 * _verify_d2_process_arena_results.ts
 * Phase D-2 process_arena_results() RPC 検証スクリプト
 *
 * テスト項目:
 * 1. no_contest       → Point更新なし, master_effect='no_change'
 * 2. forfeit_black    → white+3, black-3(min0), no_show_losses+1
 * 3. forfeit_white    → black+3, white-3(min0), no_show_losses+1
 * 4. normal win (black wins) → black+3, white+1
 * 5. idempotency      → 2回目 processed_count=0, points二重加算なし
 *
 * 検証データはすべて最後に削除する。
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://farieecfyajbtmjxelop.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { auth: { persistSession: false } });

// テスト用ユーザー（既存ユーザーを使用）
const USER_BLACK = '34f99a7e-72ef-40be-8c7f-4d4900dce8e7';  // kurare109@gmail.com
const USER_WHITE = 'e68a0189-ffe2-41c1-afd0-b0e60a47dd1f'; // kumagawa@tentomushi.co.jp

// 既存 arena_definition
const ARENA_ID = '4bba1b66-8458-40da-a5d2-2111c32dc325'; // ELEPHANT Master

// クリーンアップ用ID集積
const createdOfficialMatchIds: string[] = [];
const createdArenaMatchIds: string[] = [];
const createdArenaEventIds: string[] = [];
const createdArenaPointsKeys: Array<{arena_id: string, user_id: string, season: string}> = [];
const createdArenaMatchHistoryIds: string[] = [];

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
  }
}

async function createTestArenaEvent(): Promise<string> {
  const { data, error } = await (supabase as any)
    .from('arena_events')
    .insert({
      arena_id: ARENA_ID,
      status: 'scheduled',
      scheduled_at: new Date(Date.now() - 3600000).toISOString(), // 1時間前
    })
    .select('id')
    .single();
  if (error) throw new Error(`arena_events insert failed: ${error.message}`);
  createdArenaEventIds.push(data.id);
  return data.id;
}

async function createTestOfficialMatch(overrides: Record<string, any> = {}): Promise<string> {
  const { data, error } = await (supabase as any)
    .from('official_matches')
    .insert({
      black_user_id: USER_BLACK,
      white_user_id: USER_WHITE,
      source_kind: 'arena',
      created_by: USER_BLACK, // NOT NULL必須
      starts_at: new Date(Date.now() - 3600000).toISOString(), // 1時間前
      timer_config: { totalSeconds: 600 },
      ...overrides,
    })
    .select('id')
    .single();
  if (error) throw new Error(`official_matches insert failed: ${error.message}`);
  createdOfficialMatchIds.push(data.id);
  return data.id;
}

async function createTestArenaMatch(
  arenaEventId: string,
  officialMatchId: string,
  overrides: Record<string, any> = {}
): Promise<string> {
  const { data, error } = await (supabase as any)
    .from('arena_matches')
    .insert({
      arena_event_id: arenaEventId,
      official_match_id: officialMatchId,
      black_user_id: USER_BLACK,
      white_user_id: USER_WHITE,
      round: 1,
      match_kind: 'point',
      status: 'pending',
      scheduled_start_at: new Date(Date.now() - 3600000).toISOString(),
      ...overrides,
    })
    .select('id')
    .single();
  if (error) throw new Error(`arena_matches insert failed: ${error.message}`);
  createdArenaMatchIds.push(data.id);
  return data.id;
}

async function getArenaPoints(userId: string): Promise<any> {
  const { data } = await (supabase as any)
    .from('arena_points')
    .select('points, win_count, loss_count, draw_count, no_show_losses, participations, matches_played')
    .eq('arena_id', ARENA_ID)
    .eq('user_id', userId)
    .eq('season', 'default')
    .single();
  return data;
}

async function callProcessArenaResults(): Promise<any> {
  const { data, error } = await supabase.rpc('process_arena_results');
  if (error) throw new Error(`RPC error: ${error.message}`);
  return data;
}

// ================================================================
// Test 1: no_contest
// ================================================================
async function testNoContest() {
  console.log('\n=== Test 1: no_contest ===');
  
  const eventId = await createTestArenaEvent();
  const omId = await createTestOfficialMatch({
    status: 'no_contest',
    result: null,
    winner: null,
    end_reason: 'no_contest',
    ends_at: new Date().toISOString(),
    black_entered_at: null,
    white_entered_at: null,
  });
  const amId = await createTestArenaMatch(eventId, omId);
  
  // 処理前のpoints取得
  const blackBefore = await getArenaPoints(USER_BLACK);
  const whiteBefore = await getArenaPoints(USER_WHITE);
  
  const result = await callProcessArenaResults();
  console.log('  RPC result:', JSON.stringify(result));
  assert(result.ok === true, 'RPC ok=true');
  assert(result.processed_count >= 1, `processed_count >= 1 (got ${result.processed_count})`);
  
  // arena_matches が processed になっていること
  const { data: am } = await (supabase as any)
    .from('arena_matches')
    .select('status, end_reason, master_effect, black_point_delta, white_point_delta, winner_user_id, loser_user_id')
    .eq('id', amId)
    .single();
  console.log('  arena_match after:', JSON.stringify(am));
  assert(am?.status === 'processed', 'arena_match status=processed');
  assert(am?.end_reason === 'no_contest', 'end_reason=no_contest');
  // match_kind='point' の場合 master_effect='none' が正しい（master戦でないため）
  assert(am?.master_effect === 'none', 'master_effect=none (match_kind=point)');
  assert(am?.black_point_delta === 0, 'black_point_delta=0');
  assert(am?.white_point_delta === 0, 'white_point_delta=0');
  assert(am?.winner_user_id === null, 'winner_user_id=null');
  
  // Points が変化していないこと
  const blackAfter = await getArenaPoints(USER_BLACK);
  const whiteAfter = await getArenaPoints(USER_WHITE);
  
  if (blackBefore && blackAfter) {
    assert(blackAfter.points === blackBefore.points, `black points unchanged (${blackBefore.points} → ${blackAfter.points})`);
  } else if (!blackBefore && !blackAfter) {
    assert(true, 'black: no arena_points row created (correct for no_contest)');
  } else {
    assert(false, `black points state unexpected: before=${JSON.stringify(blackBefore)}, after=${JSON.stringify(blackAfter)}`);
  }
  
  // arena_match_history 確認
  const { data: hist } = await (supabase as any)
    .from('arena_match_history')
    .select('end_reason, master_effect, black_point_delta, white_point_delta')
    .eq('arena_match_id', amId)
    .single();
  if (hist) createdArenaMatchHistoryIds.push(amId);
  assert(hist !== null, 'arena_match_history row saved');
  assert(hist?.end_reason === 'no_contest', 'history end_reason=no_contest');
}

// ================================================================
// Test 2: forfeit_black (black no-show → white wins)
// ================================================================
async function testForfeitBlack() {
  console.log('\n=== Test 2: forfeit_black ===');
  
  const eventId = await createTestArenaEvent();
  const omId = await createTestOfficialMatch({
    status: 'completed',
    result: 'white',
    winner: 'white_user',
    end_reason: 'forfeit_black',
    ends_at: new Date().toISOString(),
    black_entered_at: null,
    white_entered_at: new Date().toISOString(),
  });
  const amId = await createTestArenaMatch(eventId, omId);
  
  // 処理前のpoints
  const blackBefore = await getArenaPoints(USER_BLACK);
  const whiteBefore = await getArenaPoints(USER_WHITE);
  
  const result = await callProcessArenaResults();
  console.log('  RPC result:', JSON.stringify(result));
  assert(result.ok === true, 'RPC ok=true');
  
  const { data: am } = await (supabase as any)
    .from('arena_matches')
    .select('status, end_reason, master_effect, black_point_delta, white_point_delta, winner_user_id, loser_user_id')
    .eq('id', amId)
    .single();
  console.log('  arena_match after:', JSON.stringify(am));
  assert(am?.status === 'processed', 'arena_match status=processed');
  assert(am?.end_reason === 'no_show', 'end_reason=no_show');
  assert(am?.black_point_delta === -3, 'black_point_delta=-3');
  assert(am?.white_point_delta === 3, 'white_point_delta=3');
  assert(am?.winner_user_id === USER_WHITE, 'winner=white');
  assert(am?.loser_user_id === USER_BLACK, 'loser=black');
  
  // Points確認
  const blackAfter = await getArenaPoints(USER_BLACK);
  const whiteAfter = await getArenaPoints(USER_WHITE);
  console.log('  black points:', JSON.stringify(blackAfter));
  console.log('  white points:', JSON.stringify(whiteAfter));
  
  // GREATESTによりDB上のpoints + delta が 0 未満にならないことを確認
  const blackExpected = Math.max((blackBefore?.points ?? 0) + (-3), 0);
  assert(blackAfter?.points === blackExpected, `black points=${blackExpected} (got ${blackAfter?.points}) [GREATEST保護]`);
  assert(blackAfter?.no_show_losses >= 1, `black no_show_losses >= 1 (got ${blackAfter?.no_show_losses})`);
  
  const whiteExpected = (whiteBefore?.points ?? 0) + 3;
  assert(whiteAfter?.points === whiteExpected, `white points=${whiteExpected} (got ${whiteAfter?.points})`);
  assert(whiteAfter?.win_count >= 1, `white win_count >= 1 (got ${whiteAfter?.win_count})`);
}

// ================================================================
// Test 3: forfeit_white (white no-show → black wins)
// ================================================================
async function testForfeitWhite() {
  console.log('\n=== Test 3: forfeit_white ===');
  
  const eventId = await createTestArenaEvent();
  const omId = await createTestOfficialMatch({
    status: 'completed',
    result: 'black',
    winner: 'black_user',
    end_reason: 'forfeit_white',
    ends_at: new Date().toISOString(),
    black_entered_at: new Date().toISOString(),
    white_entered_at: null,
  });
  const amId = await createTestArenaMatch(eventId, omId);
  
  const blackBefore = await getArenaPoints(USER_BLACK);
  const whiteBefore = await getArenaPoints(USER_WHITE);
  
  const result = await callProcessArenaResults();
  console.log('  RPC result:', JSON.stringify(result));
  assert(result.ok === true, 'RPC ok=true');
  
  const { data: am } = await (supabase as any)
    .from('arena_matches')
    .select('status, end_reason, black_point_delta, white_point_delta, winner_user_id, loser_user_id')
    .eq('id', amId)
    .single();
  console.log('  arena_match after:', JSON.stringify(am));
  assert(am?.status === 'processed', 'arena_match status=processed');
  assert(am?.end_reason === 'no_show', 'end_reason=no_show');
  assert(am?.black_point_delta === 3, 'black_point_delta=3');
  assert(am?.white_point_delta === -3, 'white_point_delta=-3');
  assert(am?.winner_user_id === USER_BLACK, 'winner=black');
  
  const blackAfter = await getArenaPoints(USER_BLACK);
  const whiteAfter = await getArenaPoints(USER_WHITE);
  console.log('  black points:', JSON.stringify(blackAfter));
  console.log('  white points:', JSON.stringify(whiteAfter));
  
  const blackExpected = (blackBefore?.points ?? 0) + 3;
  assert(blackAfter?.points === blackExpected, `black points=${blackExpected} (got ${blackAfter?.points})`);
  
  const whiteExpected = Math.max((whiteBefore?.points ?? 0) + (-3), 0);
  assert(whiteAfter?.points === whiteExpected, `white points=${whiteExpected} (got ${whiteAfter?.points})`);
  assert(whiteAfter?.no_show_losses >= 1, `white no_show_losses >= 1 (got ${whiteAfter?.no_show_losses})`);
}

// ================================================================
// Test 4: normal win (black wins)
// ================================================================
async function testNormalWin() {
  console.log('\n=== Test 4: normal win (black wins) ===');
  
  const eventId = await createTestArenaEvent();
  const omId = await createTestOfficialMatch({
    status: 'completed',
    result: 'black',
    winner: 'black_user',
    end_reason: 'normal',
    ends_at: new Date().toISOString(),
    black_entered_at: new Date().toISOString(),
    white_entered_at: new Date().toISOString(),
  });
  const amId = await createTestArenaMatch(eventId, omId);
  
  const blackBefore = await getArenaPoints(USER_BLACK);
  const whiteBefore = await getArenaPoints(USER_WHITE);
  
  const result = await callProcessArenaResults();
  console.log('  RPC result:', JSON.stringify(result));
  assert(result.ok === true, 'RPC ok=true');
  
  const { data: am } = await (supabase as any)
    .from('arena_matches')
    .select('status, end_reason, black_point_delta, white_point_delta, winner_user_id, loser_user_id')
    .eq('id', amId)
    .single();
  console.log('  arena_match after:', JSON.stringify(am));
  assert(am?.status === 'processed', 'arena_match status=processed');
  assert(am?.end_reason === 'normal', 'end_reason=normal');
  assert(am?.black_point_delta === 3, 'black_point_delta=3');
  assert(am?.white_point_delta === 1, 'white_point_delta=1');
  assert(am?.winner_user_id === USER_BLACK, 'winner=black');
  assert(am?.loser_user_id === USER_WHITE, 'loser=white');
  
  const blackAfter = await getArenaPoints(USER_BLACK);
  const whiteAfter = await getArenaPoints(USER_WHITE);
  console.log('  black points:', JSON.stringify(blackAfter));
  console.log('  white points:', JSON.stringify(whiteAfter));
  
  const blackExpected = (blackBefore?.points ?? 0) + 3;
  assert(blackAfter?.points === blackExpected, `black points=${blackExpected} (got ${blackAfter?.points})`);
  assert(blackAfter?.win_count >= 1, `black win_count >= 1`);
  
  const whiteExpected = (whiteBefore?.points ?? 0) + 1;
  assert(whiteAfter?.points === whiteExpected, `white points=${whiteExpected} (got ${whiteAfter?.points})`);
}

// ================================================================
// Test 5: idempotency (同じmatchで2回呼び出し)
// ================================================================
async function testIdempotency() {
  console.log('\n=== Test 5: idempotency ===');
  
  const eventId = await createTestArenaEvent();
  const omId = await createTestOfficialMatch({
    status: 'completed',
    result: 'black',
    winner: 'black_user',
    end_reason: 'normal',
    ends_at: new Date().toISOString(),
    black_entered_at: new Date().toISOString(),
    white_entered_at: new Date().toISOString(),
  });
  const amId = await createTestArenaMatch(eventId, omId);
  
  // 1回目
  const result1 = await callProcessArenaResults();
  console.log('  1回目 RPC result:', JSON.stringify(result1));
  assert(result1.ok === true, '1回目 RPC ok=true');
  assert(result1.processed_count >= 1, `1回目 processed_count >= 1 (got ${result1.processed_count})`);
  
  const blackAfter1 = await getArenaPoints(USER_BLACK);
  const whiteAfter1 = await getArenaPoints(USER_WHITE);
  console.log('  1回目後 black points:', blackAfter1?.points);
  console.log('  1回目後 white points:', whiteAfter1?.points);
  
  // 2回目
  const result2 = await callProcessArenaResults();
  console.log('  2回目 RPC result:', JSON.stringify(result2));
  assert(result2.ok === true, '2回目 RPC ok=true');
  assert(result2.processed_count === 0, `2回目 processed_count=0 (got ${result2.processed_count})`);
  
  const blackAfter2 = await getArenaPoints(USER_BLACK);
  const whiteAfter2 = await getArenaPoints(USER_WHITE);
  console.log('  2回目後 black points:', blackAfter2?.points);
  console.log('  2回目後 white points:', whiteAfter2?.points);
  
  assert(blackAfter2?.points === blackAfter1?.points, `black points 二重加算なし (${blackAfter1?.points} vs ${blackAfter2?.points})`);
  assert(whiteAfter2?.points === whiteAfter1?.points, `white points 二重加算なし (${whiteAfter1?.points} vs ${whiteAfter2?.points})`);
}

// ================================================================
// Cleanup
// ================================================================
async function cleanup() {
  console.log('\n=== Cleanup ===');
  const errors: string[] = [];
  
  // arena_match_history 削除（arena_match_idで）
  if (createdArenaMatchIds.length > 0) {
    const { error } = await (supabase as any)
      .from('arena_match_history')
      .delete()
      .in('arena_match_id', createdArenaMatchIds);
    if (error) errors.push(`arena_match_history: ${error.message}`);
    else console.log(`  arena_match_history deleted (arena_match_ids: ${createdArenaMatchIds.length})`);
  }
  
  // arena_matches 削除
  if (createdArenaMatchIds.length > 0) {
    const { error } = await (supabase as any)
      .from('arena_matches')
      .delete()
      .in('id', createdArenaMatchIds);
    if (error) errors.push(`arena_matches: ${error.message}`);
    else console.log(`  arena_matches deleted: ${createdArenaMatchIds.length}`);
  }
  
  // official_matches 削除
  if (createdOfficialMatchIds.length > 0) {
    const { error } = await (supabase as any)
      .from('official_matches')
      .delete()
      .in('id', createdOfficialMatchIds);
    if (error) errors.push(`official_matches: ${error.message}`);
    else console.log(`  official_matches deleted: ${createdOfficialMatchIds.length}`);
  }
  
  // arena_points 削除（arena_eventsの前に削除：外部キー制約回避）
  const { error: apErr } = await (supabase as any)
    .from('arena_points')
    .delete()
    .eq('arena_id', ARENA_ID)
    .in('user_id', [USER_BLACK, USER_WHITE]);
  if (apErr) errors.push(`arena_points: ${apErr.message}`);
  else console.log(`  arena_points deleted for test users`);

  // arena_events 削除（arena_pointsのFK参照解除後）
  if (createdArenaEventIds.length > 0) {
    const { error } = await (supabase as any)
      .from('arena_events')
      .delete()
      .in('id', createdArenaEventIds);
    if (error) errors.push(`arena_events: ${error.message}`);
    else console.log(`  arena_events deleted: ${createdArenaEventIds.length}`);
  }
  
  if (errors.length > 0) {
    console.error('  Cleanup errors:', errors);
  } else {
    console.log('  All cleanup completed ✅');
  }
  
  return errors;
}

// ================================================================
// Main
// ================================================================
async function main() {
  console.log('🔍 Phase D-2 process_arena_results() 検証スクリプト');
  console.log('='.repeat(50));
  
  try {
    await testNoContest();
    await testForfeitBlack();
    await testForfeitWhite();
    await testNormalWin();
    await testIdempotency();
  } catch (e) {
    console.error('Unexpected error:', e);
    failed++;
  }
  
  const cleanupErrors = await cleanup();
  
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  if (cleanupErrors.length > 0) {
    console.log(`⚠️ Cleanup errors (manual cleanup required):`, cleanupErrors);
    console.log('  arena_match_ids:', createdArenaMatchIds);
    console.log('  official_match_ids:', createdOfficialMatchIds);
    console.log('  arena_event_ids:', createdArenaEventIds);
  }
  
  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
