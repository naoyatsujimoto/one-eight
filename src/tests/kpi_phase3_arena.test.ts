/**
 * kpi_phase3_arena.test.ts — KPI Phase 3 Arena KPI テスト
 *
 * テスト項目:
 *  1.  Arena no-show定義（end_reason='no_show'）
 *  2.  arena_match_historyの複数行→arena_match_id単位集計
 *  3.  内部/adminアカウント除外（対局全体を除外）
 *  4.  Arena Funnel migrationの存在確認
 *  5.  entry_to_match_rate / match_completion_rate / no_show_rate の計算ロジック
 *  6.  arena_definitionsとarena_eventsの結合確認
 *  7.  arena_entries statusのenum確認
 *  8.  arena_matches statusのenum確認
 *  9.  arena_matches end_reasonのenum確認（F04 migration後）
 * 10.  Admin権限検証（非adminは拒否）
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(__dirname, '../../supabase/migrations');

function readMigration(filename: string): string {
  return readFileSync(join(MIGRATIONS_DIR, filename), 'utf-8');
}

// ---------------------------------------------------------------------------
// Arena Funnel ロジック参照実装（TS側）
// ---------------------------------------------------------------------------

interface ArenaFunnelStats {
  entries: number;
  uniqueEntrants: number;
  matchedUsers: number;
  assignedMatches: number;
  startedMatches: number;
  completedMatches: number;
  noShowMatches: number;
  noContestMatches: number;
}

function computeFunnelRates(stats: ArenaFunnelStats) {
  const entryToMatchRate = stats.uniqueEntrants > 0
    ? Math.round(stats.matchedUsers / stats.uniqueEntrants * 100 * 100) / 100
    : null;
  const matchCompletionRate = stats.assignedMatches > 0
    ? Math.round(stats.completedMatches / stats.assignedMatches * 100 * 100) / 100
    : null;
  const noShowRate = stats.assignedMatches > 0
    ? Math.round(stats.noShowMatches / stats.assignedMatches * 100 * 100) / 100
    : null;
  return { entryToMatchRate, matchCompletionRate, noShowRate };
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('KPI Phase 3 — Arena KPI', () => {

  it('1. no-show定義: arena_matches.end_reason = "no_show" を使用', () => {
    const sql = readMigration('20260810000003_kpi_phase3_admin_arena.sql');
    expect(sql).toContain("end_reason = 'no_show'");
    // no_showはF04 migration後の正式な値
    expect(sql).not.toContain("end_reason = 'forfeit_black'");
    expect(sql).not.toContain("end_reason = 'forfeit_white'");
  });

  it('2. arena_match_history非使用: arena_matchesのid単位で集計', () => {
    const sql = readMigration('20260810000003_kpi_phase3_admin_arena.sql');
    // arena_match_historyテーブルはFROM/JOIN句に登場しない（コメント文字列は除く）
    // SQLのFROM句やJOIN句にarena_match_historyが含まれないことを確認
    const sqlWithoutComments = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(sqlWithoutComments).not.toContain('arena_match_history');
    // arena_matchesはDISTINCT am.idで集計
    expect(sql).toContain('COUNT(DISTINCT am.id)');
  });

  it('3. 内部アカウント除外: 片方でも内部アカウントなら対局ごと除外', () => {
    const sql = readMigration('20260810000003_kpi_phase3_admin_arena.sql');
    // IN (am.black_user_id, am.white_user_id) パターンで両側チェック
    expect(sql).toContain('am.black_user_id, am.white_user_id');
    expect(sql).toContain('is_admin');
    expect(sql).toContain('is_internal_test_account');
    expect(sql).toContain('p_include_internal');
  });

  it('4. Arena Funnel migration ファイルが存在すること', () => {
    expect(existsSync(join(MIGRATIONS_DIR, '20260810000003_kpi_phase3_admin_arena.sql'))).toBe(true);
  });

  it('5. entry_to_match_rate 計算ロジック: matched_users / unique_entrants * 100', () => {
    const stats: ArenaFunnelStats = {
      entries: 10,
      uniqueEntrants: 8,
      matchedUsers: 6,
      assignedMatches: 3,
      startedMatches: 3,
      completedMatches: 2,
      noShowMatches: 1,
      noContestMatches: 0,
    };
    const rates = computeFunnelRates(stats);
    expect(rates.entryToMatchRate).toBe(75); // 6/8 * 100
    expect(rates.matchCompletionRate).toBeCloseTo(66.67); // 2/3 * 100
    expect(rates.noShowRate).toBeCloseTo(33.33); // 1/3 * 100
  });

  it('6. entry_to_match_rate: uniqueEntrants=0 の場合 null を返す', () => {
    const stats: ArenaFunnelStats = {
      entries: 0,
      uniqueEntrants: 0,
      matchedUsers: 0,
      assignedMatches: 0,
      startedMatches: 0,
      completedMatches: 0,
      noShowMatches: 0,
      noContestMatches: 0,
    };
    const rates = computeFunnelRates(stats);
    expect(rates.entryToMatchRate).toBeNull();
    expect(rates.matchCompletionRate).toBeNull();
    expect(rates.noShowRate).toBeNull();
  });

  it('7. arena_entries status enum確認（Phase A migrationより）', () => {
    const sql = readMigration('20260606145118_arena_phase_a.sql');
    // Phase A定義: pending/matched/withdrawn/disqualified
    expect(sql).toContain("status IN ('pending','matched','withdrawn','disqualified')");
  });

  it('8. arena_matches status enum確認（最終版）', () => {
    const sql = readMigration('20260606220000_arena_phase_d1_5_schema_alignment.sql');
    // Phase D1.5: pending/active/completed/processed/cancelled
    expect(sql).toContain("status IN ('pending','active','completed','processed','cancelled')");
  });

  it('9. arena_matches end_reason enum確認（F04 migration後の正式セット）', () => {
    const sql = readMigration('20260717130000_arena_f04_fix_end_reason_check.sql');
    // F04後: normal/timeout/resign/draw/draw_agreement/no_show/no_contest/cancelled
    expect(sql).toContain("'normal'");
    expect(sql).toContain("'timeout'");
    expect(sql).toContain("'resign'");
    expect(sql).toContain("'draw'");
    expect(sql).toContain("'no_show'");
    expect(sql).toContain("'no_contest'");
    expect(sql).toContain("'cancelled'");
    // 'forfeit'はF04で削除
    // no_showで対応
  });

  it('10. Admin権限検証: _kpi_require_admin が arena funnel RPC に含まれる', () => {
    const sql = readMigration('20260810000003_kpi_phase3_admin_arena.sql');
    expect(sql).toContain('_kpi_require_admin');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('REVOKE ALL ON FUNCTION');
  });

  it('11. matched_users: CROSS JOIN LATERAL でblack/white両側のユニーク集計', () => {
    const sql = readMigration('20260810000003_kpi_phase3_admin_arena.sql');
    // CROSS JOIN LATERAL (VALUES) パターンで両側ユーザーを集計
    expect(sql).toContain('CROSS JOIN LATERAL');
    expect(sql).toContain('COUNT(DISTINCT uid)');
  });

  it('12. scheduled_at による期間フィルタリング', () => {
    const sql = readMigration('20260810000003_kpi_phase3_admin_arena.sql');
    expect(sql).toContain('ae.scheduled_at >= p_from');
    expect(sql).toContain('ae.scheduled_at < p_to');
  });
});
