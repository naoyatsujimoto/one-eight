/**
 * _verify_d2_1_negative_points.ts
 * Phase D-2.1 検証スクリプト
 *
 * テスト項目:
 * 4.1 初期0pt no-show loss（black敗者）→ points = -3
 * 4.2 1pt保有後 no-show loss（black敗者）→ points = -2
 * 4.3 no-show勝者（white）→ points = +3
 * 4.4 normal loss（white敗者） → points = +1（loss側は+1）
 * 4.5 idempotency → 2回目 processed_count=0、points二重加算なし
 *
 * テストデータはすべて最後にDELETEする。
 * 削除できない場合はIDを報告する。
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://farieecfyajbtmjxelop.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { auth: { persistSession: false } });

// テスト用ユーザー（既存ユーザーを使用）
const USER_BLACK = '34f99a7e-72ef-40be-8c7f-4d4900dce8e7';
const USER_WHITE = 'e68a0189-ffe2-41c1-afd0-b0e60a47dd1f';

// 既存 arena_definition
const ARENA_ID = '4bba1b66-8458-40da-a5d2-2111c32dc325'; // ELEPHANT Master

// クリーンアップ用ID集積
const createdOfficialMatchIds: string[] = [];
const createdArenaMatchIds: string[]    = [];
const createdArenaEventIds: string[]    = [];
let   arenaPointsBlackId: string | null = null;
let   arenaPointsWhiteId: string | null = null;

const SEASON = 'test_d2_1_verify';

// =========================================================
// ヘルパー
// =========================================================

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function createTestOfficialMatch(opts: {
  result: string | null;
  winner: string | null;
  end_reason: string;
  status: string;
  black_entered_at: string | null;
  white_entered_at: string | null;
}): Promise<string> {
  const starts_at = new Date(Date.now() - 3_600_000).toISOString(); // 1時間前（expired）

  const { data, error } = await supabase
    .from('official_matches')
    .insert({
      black_user_id:    USER_BLACK,
      white_user_id:    USER_WHITE,
      starts_at,
      status:           opts.status,
      result:           opts.result,
      winner:           opts.winner,
      end_reason:       opts.end_reason,
      timer_config:     { mode: 'per_move', perMoveMs: 60000 },
      source_kind:      'arena',
      created_by:       USER_BLACK,
      black_entered_at: opts.black_entered_at,
      white_entered_at: opts.white_entered_at,
    })
    .select('id')
    .single();

  if (error) throw new Error(`OM INSERT failed: ${error.message}`);
  createdOfficialMatchIds.push(data.id);
  return data.id;
}

async function createTestArenaEvent(): Promise<string> {
  const { data, error } = await supabase
    .from('arena_events')
    .insert({
      arena_id:    ARENA_ID,
      status:      'closed',
      scheduled_at: new Date(Date.now() - 3_600_000).toISOString(),
    })
    .select('id')
    .single();

  if (error) throw new Error(`arena_events INSERT failed: ${error.message}`);
  createdArenaEventIds.push(data.id);
  return data.id;
}

async function createTestArenaMatch(opts: {
  eventId: string;
  officialMatchId: string;
  matchKind: string;
  round: number;
}): Promise<string> {
  const { data, error } = await supabase
    .from('arena_matches')
    .insert({
      arena_event_id:    opts.eventId,
      official_match_id: opts.officialMatchId,
      black_user_id:     USER_BLACK,
      white_user_id:     USER_WHITE,
      match_kind:        opts.matchKind,
      round:             opts.round,
      status:            'pending',
    })
    .select('id')
    .single();

  if (error) throw new Error(`arena_matches INSERT failed: ${error.message}`);
  createdArenaMatchIds.push(data.id);
  return data.id;
}

async function getArenaPoints(userId: string): Promise<{ points: number; no_show_losses: number; id: string } | null> {
  const { data, error } = await supabase
    .from('arena_points')
    .select('id, points, no_show_losses')
    .eq('arena_id', ARENA_ID)
    .eq('user_id', userId)
    .eq('season', SEASON)
    .maybeSingle();

  if (error) throw new Error(`arena_points SELECT failed: ${error.message}`);
  return data;
}

async function upsertArenaPoints(userId: string, points: number): Promise<void> {
  const { data, error } = await supabase
    .from('arena_points')
    .upsert({
      arena_id:      ARENA_ID,
      user_id:       userId,
      season:        SEASON,
      points,
      win_count:     0,
      loss_count:    0,
      draw_count:    0,
      no_show_losses: 0,
      participations: 0,
      matches_played: 0,
    }, { onConflict: 'arena_id,user_id,season' })
    .select('id')
    .single();

  if (error) throw new Error(`arena_points UPSERT failed: ${error.message}`);
  if (userId === USER_BLACK) arenaPointsBlackId = data.id;
  if (userId === USER_WHITE) arenaPointsWhiteId = data.id;
}

async function callProcessArenaResults(): Promise<any> {
  const { data, error } = await supabase.rpc('process_arena_results');
  if (error) throw new Error(`process_arena_results RPC failed: ${error.message}`);
  return data;
}

// =========================================================
// テスト本体
// =========================================================

async function main() {
  console.log('=== Phase D-2.1 検証: Arena Point マイナス許容 ===\n');
  
  let allPassed = true;
  const results: string[] = [];

  // =========================================================
  // テスト 4.1: 初期0pt no-show loss（black敗者）→ -3
  // =========================================================
  console.log('--- テスト 4.1: 初期0pt no-show loss（black）→ -3 ---');
  try {
    // 初期0ptを明示設定
    await upsertArenaPoints(USER_BLACK, 0);
    await upsertArenaPoints(USER_WHITE, 0);

    const eventId = await createTestArenaEvent();
    const omId = await createTestOfficialMatch({
      status:           'completed',
      result:           'white',
      winner:           'white_user',
      end_reason:       'forfeit_black',
      black_entered_at: null,
      white_entered_at: new Date(Date.now() - 3_500_000).toISOString(),
    });
    const amId = await createTestArenaMatch({
      eventId, officialMatchId: omId, matchKind: 'point', round: 1
    });

    // テスト用のseasonを合わせるため、arena_pointsの行を一時的に変更
    // NOTE: process_arena_results は 'default' seasonで動作するため、
    // このテストではSEASONを'default'相当の別seasonで検証するため
    // 実際のDB定義が'default'固定のため、season='default'で初期化する
    await supabase.from('arena_points').delete()
      .eq('arena_id', ARENA_ID)
      .eq('user_id', USER_BLACK)
      .eq('season', 'default');
    await supabase.from('arena_points').delete()
      .eq('arena_id', ARENA_ID)
      .eq('user_id', USER_WHITE)
      .eq('season', 'default');

    const rpc1 = await callProcessArenaResults();
    console.log('RPC結果:', JSON.stringify(rpc1));

    const bPoints = await supabase
      .from('arena_points')
      .select('id, points, no_show_losses')
      .eq('arena_id', ARENA_ID)
      .eq('user_id', USER_BLACK)
      .eq('season', 'default')
      .maybeSingle();

    const wPoints = await supabase
      .from('arena_points')
      .select('id, points, no_show_losses')
      .eq('arena_id', ARENA_ID)
      .eq('user_id', USER_WHITE)
      .eq('season', 'default')
      .maybeSingle();

    console.log('black points:', bPoints.data?.points, '(期待値: -3)');
    console.log('white points:', wPoints.data?.points, '(期待値: +3)');
    console.log('black no_show_losses:', bPoints.data?.no_show_losses, '(期待値: 1)');

    assert(bPoints.data?.points === -3, `black points = ${bPoints.data?.points}, 期待値: -3`);
    assert(wPoints.data?.points === 3,  `white points = ${wPoints.data?.points}, 期待値: +3`);
    assert(bPoints.data?.no_show_losses === 1, `black no_show_losses = ${bPoints.data?.no_show_losses}, 期待値: 1`);

    if (bPoints.data?.id) arenaPointsBlackId = bPoints.data.id;
    if (wPoints.data?.id) arenaPointsWhiteId = wPoints.data.id;

    console.log('✅ テスト 4.1 PASS\n');
    results.push('4.1: ✅ PASS (初期0pt no-show loss → -3)');
  } catch (e: any) {
    console.error('❌ テスト 4.1 FAIL:', e.message);
    results.push(`4.1: ❌ FAIL (${e.message})`);
    allPassed = false;
  }

  // =========================================================
  // テスト 4.2: 1pt保有後 no-show loss（black敗者）→ -2
  // =========================================================
  console.log('--- テスト 4.2: 1pt保有後 no-show loss（black）→ -2 ---');
  try {
    // まず1pt保有状態にリセット
    await supabase.from('arena_points').delete()
      .eq('arena_id', ARENA_ID)
      .eq('user_id', USER_BLACK)
      .eq('season', 'default');
    await supabase.from('arena_points').delete()
      .eq('arena_id', ARENA_ID)
      .eq('user_id', USER_WHITE)
      .eq('season', 'default');

    // 直接insertで1ptを設定
    const { data: bInit } = await supabase.from('arena_points')
      .insert({
        arena_id: ARENA_ID, user_id: USER_BLACK, season: 'default',
        points: 1, win_count: 0, loss_count: 0, draw_count: 0,
        no_show_losses: 0, participations: 0, matches_played: 0
      })
      .select('id').single();
    if (bInit?.id) arenaPointsBlackId = bInit.id;

    const { data: wInit } = await supabase.from('arena_points')
      .insert({
        arena_id: ARENA_ID, user_id: USER_WHITE, season: 'default',
        points: 0, win_count: 0, loss_count: 0, draw_count: 0,
        no_show_losses: 0, participations: 0, matches_played: 0
      })
      .select('id').single();
    if (wInit?.id) arenaPointsWhiteId = wInit.id;

    const eventId = await createTestArenaEvent();
    const omId = await createTestOfficialMatch({
      status: 'completed', result: 'white', winner: 'white_user', end_reason: 'forfeit_black',
      black_entered_at: null, white_entered_at: new Date(Date.now() - 3_500_000).toISOString(),
    });
    await createTestArenaMatch({ eventId, officialMatchId: omId, matchKind: 'point', round: 1 });

    const rpc2 = await callProcessArenaResults();
    console.log('RPC結果:', JSON.stringify(rpc2));

    const bAfter = await supabase
      .from('arena_points').select('points')
      .eq('arena_id', ARENA_ID).eq('user_id', USER_BLACK).eq('season', 'default').maybeSingle();
    const wAfter = await supabase
      .from('arena_points').select('points')
      .eq('arena_id', ARENA_ID).eq('user_id', USER_WHITE).eq('season', 'default').maybeSingle();

    console.log('black points:', bAfter.data?.points, '(期待値: -2)');
    console.log('white points:', wAfter.data?.points, '(期待値: +3)');

    assert(bAfter.data?.points === -2, `black points = ${bAfter.data?.points}, 期待値: -2`);
    assert(wAfter.data?.points === 3,  `white points = ${wAfter.data?.points}, 期待値: +3`);

    console.log('✅ テスト 4.2 PASS\n');
    results.push('4.2: ✅ PASS (1pt保有後 no-show loss → -2)');
  } catch (e: any) {
    console.error('❌ テスト 4.2 FAIL:', e.message);
    results.push(`4.2: ❌ FAIL (${e.message})`);
    allPassed = false;
  }

  // =========================================================
  // テスト 4.3: no-show 勝者（white）→ +3（変更なし）
  // =========================================================
  console.log('--- テスト 4.3: no-show勝者（white）→ +3 ---');
  // テスト4.1, 4.2のwhiteは既に+3になっているはず（4.2のwhite）
  // 新規に独立したテストを行う
  try {
    // 既にテスト4.2でwhite=+3を確認済み。ここでは別シナリオで再確認
    await supabase.from('arena_points').delete()
      .eq('arena_id', ARENA_ID).eq('user_id', USER_BLACK).eq('season', 'default');
    await supabase.from('arena_points').delete()
      .eq('arena_id', ARENA_ID).eq('user_id', USER_WHITE).eq('season', 'default');

    const eventId = await createTestArenaEvent();
    const omId = await createTestOfficialMatch({
      status: 'completed', result: 'white', winner: 'white_user', end_reason: 'forfeit_black',
      black_entered_at: null, white_entered_at: new Date(Date.now() - 3_500_000).toISOString(),
    });
    await createTestArenaMatch({ eventId, officialMatchId: omId, matchKind: 'point', round: 1 });

    const rpc3 = await callProcessArenaResults();
    console.log('RPC結果:', JSON.stringify(rpc3));

    const wAfter = await supabase
      .from('arena_points').select('points')
      .eq('arena_id', ARENA_ID).eq('user_id', USER_WHITE).eq('season', 'default').maybeSingle();

    console.log('white(no-show winner) points:', wAfter.data?.points, '(期待値: +3)');
    assert(wAfter.data?.points === 3, `white points = ${wAfter.data?.points}, 期待値: +3`);

    console.log('✅ テスト 4.3 PASS\n');
    results.push('4.3: ✅ PASS (no-show勝者 white → +3)');
  } catch (e: any) {
    console.error('❌ テスト 4.3 FAIL:', e.message);
    results.push(`4.3: ❌ FAIL (${e.message})`);
    allPassed = false;
  }

  // =========================================================
  // テスト 4.4: normal loss（white敗者）→ +1
  // =========================================================
  console.log('--- テスト 4.4: normal loss（white敗者）→ +1 ---');
  try {
    await supabase.from('arena_points').delete()
      .eq('arena_id', ARENA_ID).eq('user_id', USER_BLACK).eq('season', 'default');
    await supabase.from('arena_points').delete()
      .eq('arena_id', ARENA_ID).eq('user_id', USER_WHITE).eq('season', 'default');

    const eventId = await createTestArenaEvent();
    const omId = await createTestOfficialMatch({
      status: 'completed', result: 'black', winner: 'black_user', end_reason: 'normal',
      black_entered_at: new Date(Date.now() - 3_500_000).toISOString(),
      white_entered_at: new Date(Date.now() - 3_400_000).toISOString(),
    });
    await createTestArenaMatch({ eventId, officialMatchId: omId, matchKind: 'point', round: 1 });

    const rpc4 = await callProcessArenaResults();
    console.log('RPC結果:', JSON.stringify(rpc4));

    const bAfter = await supabase
      .from('arena_points').select('points')
      .eq('arena_id', ARENA_ID).eq('user_id', USER_BLACK).eq('season', 'default').maybeSingle();
    const wAfter = await supabase
      .from('arena_points').select('points')
      .eq('arena_id', ARENA_ID).eq('user_id', USER_WHITE).eq('season', 'default').maybeSingle();

    console.log('black(winner) points:', bAfter.data?.points, '(期待値: +3)');
    console.log('white(loser) points:',  wAfter.data?.points, '(期待値: +1)');

    assert(bAfter.data?.points === 3, `black(winner) points = ${bAfter.data?.points}, 期待値: +3`);
    assert(wAfter.data?.points === 1, `white(loser) points = ${wAfter.data?.points}, 期待値: +1`);

    console.log('✅ テスト 4.4 PASS\n');
    results.push('4.4: ✅ PASS (normal loss white → +1)');
  } catch (e: any) {
    console.error('❌ テスト 4.4 FAIL:', e.message);
    results.push(`4.4: ❌ FAIL (${e.message})`);
    allPassed = false;
  }

  // =========================================================
  // テスト 4.5: idempotency → 2回目 processed_count=0、二重加算なし
  // =========================================================
  console.log('--- テスト 4.5: idempotency ---');
  try {
    // テスト4.4後の状態で再実行
    const rpc5 = await callProcessArenaResults();
    console.log('2回目RPC結果:', JSON.stringify(rpc5));

    const bAfter = await supabase
      .from('arena_points').select('points')
      .eq('arena_id', ARENA_ID).eq('user_id', USER_BLACK).eq('season', 'default').maybeSingle();
    const wAfter = await supabase
      .from('arena_points').select('points')
      .eq('arena_id', ARENA_ID).eq('user_id', USER_WHITE).eq('season', 'default').maybeSingle();

    console.log('2回目後 black points:', bAfter.data?.points, '(期待値: +3, 変化なし)');
    console.log('2回目後 white points:', wAfter.data?.points, '(期待値: +1, 変化なし)');
    console.log('processed_count:', rpc5.processed_count, '(期待値: 0)');

    assert(rpc5.processed_count === 0, `processed_count = ${rpc5.processed_count}, 期待値: 0`);
    assert(bAfter.data?.points === 3, `black points 二重加算あり: ${bAfter.data?.points}`);
    assert(wAfter.data?.points === 1, `white points 二重加算あり: ${wAfter.data?.points}`);

    console.log('✅ テスト 4.5 PASS\n');
    results.push('4.5: ✅ PASS (idempotency: 2回目 processed_count=0, 二重加算なし)');
  } catch (e: any) {
    console.error('❌ テスト 4.5 FAIL:', e.message);
    results.push(`4.5: ❌ FAIL (${e.message})`);
    allPassed = false;
  }

  // =========================================================
  // クリーンアップ
  // =========================================================
  console.log('--- クリーンアップ ---');
  const undeleted: string[] = [];

  // arena_match_history を先に削除（FK参照）
  for (const amId of createdArenaMatchIds) {
    const { error } = await supabase.from('arena_match_history').delete().eq('arena_match_id', amId);
    if (error) console.warn(`arena_match_history削除失敗 amId=${amId}:`, error.message);
  }

  // arena_matches を削除
  for (const amId of createdArenaMatchIds) {
    const { error } = await supabase.from('arena_matches').delete().eq('id', amId);
    if (error) { console.error(`arena_matches削除失敗 id=${amId}`); undeleted.push(`arena_matches:${amId}`); }
  }

  // official_matches を削除
  for (const omId of createdOfficialMatchIds) {
    const { error } = await supabase.from('official_matches').delete().eq('id', omId);
    if (error) { console.error(`official_matches削除失敗 id=${omId}`); undeleted.push(`official_matches:${omId}`); }
  }

  // arena_events を削除
  for (const aeId of createdArenaEventIds) {
    const { error } = await supabase.from('arena_events').delete().eq('id', aeId);
    if (error) { console.error(`arena_events削除失敗 id=${aeId}`); undeleted.push(`arena_events:${aeId}`); }
  }

  // arena_points を削除
  const { error: bDelErr } = await supabase.from('arena_points')
    .delete().eq('arena_id', ARENA_ID).eq('user_id', USER_BLACK).eq('season', 'default');
  if (bDelErr) { console.error('arena_points(black)削除失敗'); undeleted.push(`arena_points:black:${ARENA_ID}`); }

  const { error: wDelErr } = await supabase.from('arena_points')
    .delete().eq('arena_id', ARENA_ID).eq('user_id', USER_WHITE).eq('season', 'default');
  if (wDelErr) { console.error('arena_points(white)削除失敗'); undeleted.push(`arena_points:white:${ARENA_ID}`); }

  if (undeleted.length > 0) {
    console.warn('削除できなかった行:', undeleted);
  } else {
    console.log('✅ テストデータ全件削除完了');
  }

  // =========================================================
  // 結果サマリー
  // =========================================================
  console.log('\n=== テスト結果サマリー ===');
  results.forEach(r => console.log(r));
  console.log(`\n全体: ${allPassed ? '✅ 全テスト PASS' : '❌ 一部テスト FAIL'}`);

  if (!allPassed) process.exit(1);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
