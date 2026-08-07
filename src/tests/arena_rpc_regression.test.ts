/**
 * arena_rpc_regression.test.ts
 * ONE EIGHT — Arena RPC 退行修正 回帰テスト
 *
 * 20260806230002_master_reward_read_rpcs.sql による退行を
 * 20260807213000_fix_arena_rpc_regression.sql で修正したことを検証する。
 *
 * 実DB接続不要。migrationファイルのソース静的解析のみで動作する。
 *
 * テスト項目:
 *  1. get_arena_detailがarena_pointsをtop_ranking正本として使わない
 *  2. arena_match_historyの直近90日だけを集計する
 *  3. 現在のactive Masterをランキングから除外する（v_current_master_uid）
 *  4. Master報酬2フィールドを返す（detail / overview）
 *  5. scheduled/open/closedのnext eventを返す（detail / overview）
 *  6. previous_results_pendingの正しい仕様を維持する（v_prev_event_id / v_next_event_scheduled_at）
 *  7. SECURITY DEFINER / SET search_path = public
 *  8. anon/authenticatedのGRANT EXECUTE
 *  9. season='test_d2_1_verify'がランキングに混入しない（arena_pointsをtop_rankingで参照しない）
 * 10. black_point_delta / white_point_delta の両方を集計する
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS = path.resolve(__dirname, '../../supabase/migrations');
const FIX_SQL = fs.readFileSync(
  path.join(MIGRATIONS, '20260807213000_fix_arena_rpc_regression.sql'),
  'utf-8'
);

// get_arena_detail セクションとget_arena_overviewセクションに分割
// "2. get_arena_detail" の見出しで区切る
const DETAIL_START = FIX_SQL.indexOf('CREATE OR REPLACE FUNCTION get_arena_detail');
const DETAIL_SQL = FIX_SQL.slice(DETAIL_START);

const OVERVIEW_START = FIX_SQL.indexOf('CREATE OR REPLACE FUNCTION get_arena_overview');
const OVERVIEW_END   = DETAIL_START;
const OVERVIEW_SQL   = FIX_SQL.slice(OVERVIEW_START, OVERVIEW_END);

// ---------------------------------------------------------------------------
// 1. top_ranking に arena_points を使わない
// ---------------------------------------------------------------------------
describe('get_arena_detail — top_ranking source', () => {
  it('top_rankingセクションでarena_pointsを参照しない', () => {
    // top_rankingコメントから ranked; までを抽出
    const rankStart = DETAIL_SQL.indexOf('-- top_ranking:');
    const rankEnd   = DETAIL_SQL.indexOf('ranked;', rankStart) + 'ranked;'.length;
    const rankBlock = DETAIL_SQL.slice(rankStart, rankEnd);
    expect(rankBlock).not.toContain('arena_points');
  });

  it('top_rankingセクションでarena_match_historyを参照する', () => {
    const rankStart = DETAIL_SQL.indexOf('-- top_ranking:');
    const rankEnd   = DETAIL_SQL.indexOf('ranked;', rankStart) + 'ranked;'.length;
    const rankBlock = DETAIL_SQL.slice(rankStart, rankEnd);
    expect(rankBlock).toContain('arena_match_history');
  });
});

// ---------------------------------------------------------------------------
// 2. 直近90日フィルター
// ---------------------------------------------------------------------------
describe('get_arena_detail — 90日フィルター', () => {
  it("interval '90 days' が存在する", () => {
    expect(DETAIL_SQL).toContain("interval '90 days'");
  });

  it('event_datetime >= now() - interval が存在する', () => {
    expect(DETAIL_SQL).toContain('event_datetime >= now() - interval');
  });
});

// ---------------------------------------------------------------------------
// 3. active Master除外
// ---------------------------------------------------------------------------
describe('get_arena_detail — active Master除外', () => {
  it('v_current_master_uid 変数が宣言されている', () => {
    expect(DETAIL_SQL).toContain('v_current_master_uid');
  });

  it('ランキング集計でv_current_master_uidによる除外がある', () => {
    const rankStart = DETAIL_SQL.indexOf('-- top_ranking:');
    const rankEnd   = DETAIL_SQL.indexOf('ranked;', rankStart) + 'ranked;'.length;
    const rankBlock = DETAIL_SQL.slice(rankStart, rankEnd);
    expect(rankBlock).toContain('v_current_master_uid');
  });

  it('dethroned_at IS NULLでMasterを特定している', () => {
    // v_current_master_uid取得クエリ内
    const masterUidStart = DETAIL_SQL.indexOf('-- 現在のMaster user_id を取得');
    const masterUidEnd   = DETAIL_SQL.indexOf('-- 現在のMaster 表示情報', masterUidStart);
    const block = DETAIL_SQL.slice(masterUidStart, masterUidEnd);
    expect(block).toContain('dethroned_at IS NULL');
  });
});

// ---------------------------------------------------------------------------
// 4. Master報酬2フィールド
// ---------------------------------------------------------------------------
describe('Master報酬フィールド', () => {
  it('get_arena_detail: master_reward_amount_cents を返す', () => {
    expect(DETAIL_SQL).toContain('master_reward_amount_cents');
  });

  it('get_arena_detail: master_reward_currency を返す', () => {
    expect(DETAIL_SQL).toContain('master_reward_currency');
  });

  it('get_arena_overview: master_reward_amount_cents を返す', () => {
    expect(OVERVIEW_SQL).toContain('master_reward_amount_cents');
  });

  it('get_arena_overview: master_reward_currency を返す', () => {
    expect(OVERVIEW_SQL).toContain('master_reward_currency');
  });
});

// ---------------------------------------------------------------------------
// 5. next_event: scheduled/open/closed を対象にする
// ---------------------------------------------------------------------------
describe("next_event: status IN ('scheduled','open','closed')", () => {
  it("get_arena_detail: next_eventで'closed'がIN条件に含まれる", () => {
    // next_event取得クエリを探す
    const nextStart = DETAIL_SQL.indexOf('-- 次回event');
    const nextEnd   = DETAIL_SQL.indexOf('ORDER BY ae.scheduled_at ASC', nextStart) + 50;
    const block = DETAIL_SQL.slice(nextStart, nextEnd);
    expect(block).toContain("'closed'");
    expect(block).toContain("'scheduled'");
    expect(block).toContain("'open'");
  });

  it("get_arena_overview: next_eventで'closed'がIN条件に含まれる", () => {
    const nextStart = OVERVIEW_SQL.indexOf("'scheduled', 'open', 'closed'");
    expect(nextStart).toBeGreaterThan(-1);
  });
});

// ---------------------------------------------------------------------------
// 6. previous_results_pending: v_prev_event_id / v_next_event_scheduled_at 方式
// ---------------------------------------------------------------------------
describe('previous_results_pending — 正しい仕様', () => {
  it('get_arena_detail: v_prev_event_id 変数が宣言されている', () => {
    expect(DETAIL_SQL).toContain('v_prev_event_id');
  });

  it('get_arena_detail: v_next_event_scheduled_at 変数が宣言されている', () => {
    expect(DETAIL_SQL).toContain('v_next_event_scheduled_at');
  });

  it('get_arena_detail: v_next_event_id 変数が宣言されている', () => {
    expect(DETAIL_SQL).toContain('v_next_event_id');
  });

  it('get_arena_detail: v_next_event_scheduled_at を使って前回Eventを特定している', () => {
    const pendStart = DETAIL_SQL.indexOf('-- previous_results_pending:');
    const pendEnd   = DETAIL_SQL.indexOf('v_previous_results_pending;', pendStart) + 'v_previous_results_pending;'.length;
    const block = DETAIL_SQL.slice(pendStart, pendEnd);
    expect(block).toContain('v_next_event_scheduled_at');
    expect(block).toContain('v_prev_event_id');
  });

  it("get_arena_overview: 直近前回Event基準の判定がある（ORDER BY scheduled_at DESC LIMIT 1）", () => {
    const pendStart = OVERVIEW_SQL.indexOf('previous_results_pending');
    const pendEnd   = OVERVIEW_SQL.indexOf('END', pendStart) + 10;
    const block = OVERVIEW_SQL.slice(pendStart, pendEnd);
    expect(block).toContain('ORDER BY prev_ae.scheduled_at DESC');
  });
});

// ---------------------------------------------------------------------------
// 7. SECURITY DEFINER / SET search_path = public
// ---------------------------------------------------------------------------
describe('SECURITY DEFINER / search_path', () => {
  it('get_arena_detail: SECURITY DEFINER が含まれる', () => {
    expect(DETAIL_SQL).toContain('SECURITY DEFINER');
  });

  it('get_arena_detail: SET search_path = public が含まれる', () => {
    expect(DETAIL_SQL).toContain('SET search_path = public');
  });

  it('get_arena_overview: SECURITY DEFINER が含まれる', () => {
    expect(OVERVIEW_SQL).toContain('SECURITY DEFINER');
  });

  it('get_arena_overview: SET search_path = public が含まれる', () => {
    expect(OVERVIEW_SQL).toContain('SET search_path = public');
  });
});

// ---------------------------------------------------------------------------
// 8. GRANT EXECUTE
// ---------------------------------------------------------------------------
describe('GRANT EXECUTE', () => {
  it('get_arena_detail: anon に EXECUTE 権限を付与している', () => {
    expect(DETAIL_SQL).toContain('GRANT EXECUTE ON FUNCTION get_arena_detail');
    expect(DETAIL_SQL).toContain('anon');
  });

  it('get_arena_detail: authenticated に EXECUTE 権限を付与している', () => {
    expect(DETAIL_SQL).toContain('authenticated');
  });

  it('get_arena_overview: anon に EXECUTE 権限を付与している', () => {
    expect(OVERVIEW_SQL).toContain('GRANT EXECUTE ON FUNCTION get_arena_overview');
    expect(OVERVIEW_SQL).toContain('anon');
  });
});

// ---------------------------------------------------------------------------
// 9. season='test_d2_1_verify'混入防止
//    arena_pointsをtop_rankingの正本として使わないことで担保する
// ---------------------------------------------------------------------------
describe('season混入防止', () => {
  it('top_rankingでarena_pointsを参照しないためtest seasonは混入しない', () => {
    const rankStart = DETAIL_SQL.indexOf('-- top_ranking:');
    const rankEnd   = DETAIL_SQL.indexOf('ranked;', rankStart) + 'ranked;'.length;
    const rankBlock = DETAIL_SQL.slice(rankStart, rankEnd);
    // arena_pointsへの参照がない
    expect(rankBlock).not.toContain('arena_points');
    // arena_match_historyが正本
    expect(rankBlock).toContain('arena_match_history');
  });
});

// ---------------------------------------------------------------------------
// 10. black_point_delta / white_point_delta の両方を集計
// ---------------------------------------------------------------------------
describe('get_arena_detail — point_delta集計', () => {
  it('black_point_delta を集計している', () => {
    const rankStart = DETAIL_SQL.indexOf('-- top_ranking:');
    const rankEnd   = DETAIL_SQL.indexOf('ranked;', rankStart) + 'ranked;'.length;
    const rankBlock = DETAIL_SQL.slice(rankStart, rankEnd);
    expect(rankBlock).toContain('black_point_delta');
  });

  it('white_point_delta を集計している', () => {
    const rankStart = DETAIL_SQL.indexOf('-- top_ranking:');
    const rankEnd   = DETAIL_SQL.indexOf('ranked;', rankStart) + 'ranked;'.length;
    const rankBlock = DETAIL_SQL.slice(rankStart, rankEnd);
    expect(rankBlock).toContain('white_point_delta');
  });

  it('UNION ALL でblack/white両方を合算している', () => {
    const rankStart = DETAIL_SQL.indexOf('-- top_ranking:');
    const rankEnd   = DETAIL_SQL.indexOf('ranked;', rankStart) + 'ranked;'.length;
    const rankBlock = DETAIL_SQL.slice(rankStart, rankEnd);
    expect(rankBlock).toContain('UNION ALL');
  });
});
