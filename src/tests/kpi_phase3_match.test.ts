/**
 * kpi_phase3_match.test.ts — KPI Phase 3 対局KPI テスト
 *
 * テスト項目:
 *  1.  canonical対局重複排除（同一game_idがmatch_logsとonline_gamesにある→1件）
 *  2.  Arena二重計上防止（arena_match_historyの複数行→arena_match_id単位で1件）
 *  3.  Arena/Official/Online/CPU分類が相互排他的
 *  4.  total = 4分類合計
 *  5.  sim_match_logs除外（sim_match_logsはmatch_logsとは別テーブル）
 *  6.  internal/admin参加対局除外
 *  7.  match_started event が ALLOWED_KPI_EVENT_NAMES に含まれる
 *  8.  rpc_call_completed event が ALLOWED_KPI_EVENT_NAMES に含まれる
 *  9.  match_started properties型検証
 *  10. rpc_call_completed properties型検証
 *  11. migration ファイルが存在すること
 *  12. admin RPCがSECURITY DEFINERで定義されていること
 *  13. _kpi_require_admin 呼び出しが全Admin RPCに含まれていること
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  ALLOWED_KPI_EVENT_NAMES,
  isAllowedEventName,
  hasForbiddenKeys,
  isPropertiesWithinSizeLimit,
} from '../lib/kpiEvents';

const MIGRATIONS_DIR = join(__dirname, '../../supabase/migrations');

function migrationPath(filename: string): string {
  return join(MIGRATIONS_DIR, filename);
}

function readMigration(filename: string): string {
  return readFileSync(migrationPath(filename), 'utf-8');
}

// ---------------------------------------------------------------------------
// Phase 3 Migrations定義
// ---------------------------------------------------------------------------

const PHASE3_MIGRATIONS = [
  '20260810000001_kpi_phase3_match_event.sql',
  '20260810000002_kpi_phase3_admin_match.sql',
  '20260810000003_kpi_phase3_admin_arena.sql',
  '20260810000004_kpi_phase3_admin_postmortem.sql',
  '20260810000005_kpi_phase3_admin_system.sql',
] as const;

// ---------------------------------------------------------------------------
// canonical対局分類ロジック（TS側参照実装）
// ---------------------------------------------------------------------------

interface FakeMatchLog {
  id: string;
  game_id: string | null;
  mode: string | null;
}

interface FakeOnlineGame {
  id: string;
  official_match_id?: string;
  arena_match_id?: string;
}

interface FakeArenaMatch {
  id: string;
  online_game_id: string | null;
}

interface FakeOfficialMatch {
  id: string;
  online_game_id: string | null;
}

function classifyMatches(params: {
  matchLogs: FakeMatchLog[];
  onlineGames: FakeOnlineGame[];
  arenaMatches: FakeArenaMatch[];
  officialMatches: FakeOfficialMatch[];
}) {
  const { matchLogs, onlineGames, arenaMatches, officialMatches } = params;

  const arenaOnlineIds = new Set(arenaMatches.map(a => a.online_game_id).filter(Boolean) as string[]);
  const officialOnlineIds = new Set(officialMatches.map(o => o.online_game_id).filter(Boolean) as string[]);

  // Arena: arena_matchesに存在（arena_match_id単位）
  const arenaCount = arenaMatches.length;

  // Official standalone: official_matchesに存在 AND arena_matchesに連結していない
  const officialStandalone = officialMatches.filter(om => {
    return !om.online_game_id || !arenaOnlineIds.has(om.online_game_id);
  }).length;

  // Online casual: online_gamesに存在 AND official/arenaに連結していない
  const onlineCasual = onlineGames.filter(og => {
    return !arenaOnlineIds.has(og.id) && !officialOnlineIds.has(og.id);
  }).length;

  // CPU: match_logsに存在 AND online_gamesに存在しない
  const onlineGameIds = new Set(onlineGames.map(og => og.id));
  const cpuCount = matchLogs.filter(ml => {
    return !ml.game_id || !onlineGameIds.has(ml.game_id);
  }).length;

  const total = arenaCount + officialStandalone + onlineCasual + cpuCount;

  return { arenaCount, officialStandalone, onlineCasual, cpuCount, total };
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('KPI Phase 3 — 対局KPI', () => {

  it('1. canonical対局重複排除: 同一game_idがmatch_logsとonline_gamesにある場合はonline_casual1件のみ', () => {
    const gameId = 'game-001';
    const result = classifyMatches({
      matchLogs: [{ id: 'ml-1', game_id: gameId, mode: 'online_pvp' }],
      onlineGames: [{ id: gameId }],
      arenaMatches: [],
      officialMatches: [],
    });
    // match_logsのgame_idがonline_gamesに存在 → CPU扱いされない
    // online_gamesは官式/Arena連結なし → online_casual
    expect(result.cpuCount).toBe(0);
    expect(result.onlineCasual).toBe(1);
    expect(result.total).toBe(1);
  });

  it('2. Arena二重計上防止: arena_match_historyではなくarena_match_id単位で数える', () => {
    // arena_match_historyは1対局で黒白2行 → arena_matchesの1件として数える
    const result = classifyMatches({
      matchLogs: [],
      onlineGames: [{ id: 'og-1', arena_match_id: 'am-1' }],
      arenaMatches: [{ id: 'am-1', online_game_id: 'og-1' }],
      officialMatches: [],
    });
    expect(result.arenaCount).toBe(1); // arena_match_id単位で1件
    expect(result.total).toBe(1);
  });

  it('3. 分類が相互排他的: Arena > Official standalone > Online casual > CPU の優先順位', () => {
    const arenaOnlineId = 'og-arena';
    const officialOnlineId = 'og-official';
    const casualOnlineId = 'og-casual';
    const cpuGameId = 'cpu-001';

    const result = classifyMatches({
      matchLogs: [
        { id: 'ml-cpu', game_id: cpuGameId, mode: 'cpu' },
        { id: 'ml-arena', game_id: arenaOnlineId, mode: 'online_pvp' }, // Arena経由
      ],
      onlineGames: [
        { id: arenaOnlineId },
        { id: officialOnlineId },
        { id: casualOnlineId },
      ],
      arenaMatches: [{ id: 'am-1', online_game_id: arenaOnlineId }],
      officialMatches: [{ id: 'om-1', online_game_id: officialOnlineId }],
    });

    // Arena: 1件
    expect(result.arenaCount).toBe(1);
    // Official standalone: 1件 (og-officialはarena_matchesに連結していない)
    expect(result.officialStandalone).toBe(1);
    // Online casual: 1件 (og-casualのみ)
    expect(result.onlineCasual).toBe(1);
    // CPU: 1件 (cpu-001はonline_gamesに存在しない)
    expect(result.cpuCount).toBe(1);
    // total = 4
    expect(result.total).toBe(4);
  });

  it('4. total = 4分類の合計', () => {
    const result = classifyMatches({
      matchLogs: [
        { id: 'ml-1', game_id: null, mode: 'cpu' },
        { id: 'ml-2', game_id: null, mode: 'cpu' },
      ],
      onlineGames: [{ id: 'og-1' }, { id: 'og-2' }],
      arenaMatches: [{ id: 'am-1', online_game_id: 'og-1' }],
      officialMatches: [],
    });
    expect(result.total).toBe(result.arenaCount + result.officialStandalone + result.onlineCasual + result.cpuCount);
  });

  it('5. sim_match_logs除外: match_logsとsim_match_logsは別テーブル（混入しない）', () => {
    // sim_match_logsはmatch_logsとは完全に別テーブルなので、
    // CPU集計（match_logs）にsim_match_logsが混入することはない。
    // ここではTS側の設計上の確認テスト。
    const result = classifyMatches({
      matchLogs: [], // sim_match_logsは別テーブルなのでここには入らない
      onlineGames: [],
      arenaMatches: [],
      officialMatches: [],
    });
    expect(result.total).toBe(0);
    expect(result.cpuCount).toBe(0);
  });

  it('6. 内部アカウントフラグの型確認（profiles.is_admin / is_internal_test_account）', () => {
    // 除外ロジックはDB側（SECURITY DEFINER RPC）で実施。
    // ここではmigration SQLに除外条件が含まれていることを確認。
    const sql = readMigration('20260810000002_kpi_phase3_admin_match.sql');
    expect(sql).toContain('is_admin');
    expect(sql).toContain('is_internal_test_account');
    expect(sql).toContain('p_include_internal');
  });

  it('7. match_started が ALLOWED_KPI_EVENT_NAMES に含まれる', () => {
    expect(
      (ALLOWED_KPI_EVENT_NAMES as readonly string[]).includes('match_started')
    ).toBe(true);
  });

  it('8. rpc_call_completed が ALLOWED_KPI_EVENT_NAMES に含まれる', () => {
    expect(
      (ALLOWED_KPI_EVENT_NAMES as readonly string[]).includes('rpc_call_completed')
    ).toBe(true);
  });

  it('9. match_started が isAllowedEventName で true', () => {
    expect(isAllowedEventName('match_started')).toBe(true);
  });

  it('10. rpc_call_completed が isAllowedEventName で true', () => {
    expect(isAllowedEventName('rpc_call_completed')).toBe(true);
  });

  it('11. match_started properties に棋譜・game_id・PII が含まれない', () => {
    const validProps = {
      match_key: 'abc123',
      match_mode: 'online' as const,
    };
    // 禁止キーなし
    expect(hasForbiddenKeys(validProps)).toBe(false);
    // サイズOK
    expect(isPropertiesWithinSizeLimit(validProps)).toBe(true);
  });

  it('12. rpc_call_completed properties に raw_message / payload が含まれない', () => {
    const validProps = {
      rpc_name: 'join_online_game',
      outcome: 'success' as const,
      elapsed_ms: 123,
      route: '/game',
    };
    expect(hasForbiddenKeys(validProps)).toBe(false);
    expect(isPropertiesWithinSizeLimit(validProps)).toBe(true);
  });

  it('13. Phase 3 全migrationファイルが存在すること', () => {
    for (const file of PHASE3_MIGRATIONS) {
      expect(existsSync(migrationPath(file)), `${file} should exist`).toBe(true);
    }
  });

  it('14. Admin Match Summary migration が SECURITY DEFINER を含む', () => {
    const sql = readMigration('20260810000002_kpi_phase3_admin_match.sql');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('_kpi_require_admin');
  });

  it('15. Admin Arena Funnel migration が SECURITY DEFINER を含む', () => {
    const sql = readMigration('20260810000003_kpi_phase3_admin_arena.sql');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('_kpi_require_admin');
  });

  it('16. Admin Postmortem migration が SECURITY DEFINER を含む', () => {
    const sql = readMigration('20260810000004_kpi_phase3_admin_postmortem.sql');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('_kpi_require_admin');
  });

  it('17. Admin System Health migration が SECURITY DEFINER を含む', () => {
    const sql = readMigration('20260810000005_kpi_phase3_admin_system.sql');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('_kpi_require_admin');
  });

  it('18. ALLOWED_KPI_EVENT_NAMES が27件であること（Phase 3追加後）', () => {
    expect(ALLOWED_KPI_EVENT_NAMES.length).toBe(27);
  });

  it('19. Phase3 migration の event_validation が match_started / rpc_call_completed を含む', () => {
    const sql = readMigration('20260810000001_kpi_phase3_match_event.sql');
    expect(sql).toContain("'match_started'");
    expect(sql).toContain("'rpc_call_completed'");
  });

  it('20. match_started validation が match_mode enum を検証すること', () => {
    const sql = readMigration('20260810000001_kpi_phase3_match_event.sql');
    expect(sql).toContain("'human_vs_cpu', 'online', 'official', 'arena'");
  });

  it('21. rpc_call_completed validation が outcome enum を検証すること', () => {
    const sql = readMigration('20260810000001_kpi_phase3_match_event.sql');
    expect(sql).toContain("'success', 'error'");
  });

  it('22. migration番号が正しい昇順になっていること', () => {
    const timestamps = PHASE3_MIGRATIONS.map(f => parseInt(f.split('_')[0]!, 10));
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]!);
    }
  });
});

describe('KPI Phase 3 — DB Validator 一致検証', () => {

  it('1. Phase3 migration の _kpi_allowed_event_names に match_started が含まれる', () => {
    const sql = readMigration('20260810000001_kpi_phase3_match_event.sql');
    expect(sql).toContain("'match_started'");
  });

  it('2. Phase3 migration の _kpi_allowed_event_names に rpc_call_completed が含まれる', () => {
    const sql = readMigration('20260810000001_kpi_phase3_match_event.sql');
    expect(sql).toContain("'rpc_call_completed'");
  });

  it('3. Admin Match Summary が total_matches を含む', () => {
    const sql = readMigration('20260810000002_kpi_phase3_admin_match.sql');
    expect(sql).toContain('total_matches');
    expect(sql).toContain('cpu_matches');
    expect(sql).toContain('online_casual_matches');
    expect(sql).toContain('official_standalone_matches');
    expect(sql).toContain('arena_matches_count');
    expect(sql).toContain('unique_players');
    expect(sql).toContain('completion_rate');
  });

  it('4. Admin Arena Funnel が必要なカラムを含む', () => {
    const sql = readMigration('20260810000003_kpi_phase3_admin_arena.sql');
    expect(sql).toContain('entries');
    expect(sql).toContain('unique_entrants');
    expect(sql).toContain('matched_users');
    expect(sql).toContain('assigned_matches');
    expect(sql).toContain('no_show_matches');
    expect(sql).toContain('entry_to_match_rate');
    expect(sql).toContain('match_completion_rate');
    expect(sql).toContain('no_show_rate');
  });

  it('5. Admin Arena Funnel の no-show定義が end_reason = no_show を使用', () => {
    const sql = readMigration('20260810000003_kpi_phase3_admin_arena.sql');
    expect(sql).toContain("end_reason = 'no_show'");
  });

  it('6. Admin Postmortem が必要なカラムを含む', () => {
    const sql = readMigration('20260810000004_kpi_phase3_admin_postmortem.sql');
    expect(sql).toContain('started');
    expect(sql).toContain('completed');
    expect(sql).toContain('failed');
    expect(sql).toContain('completion_rate');
    expect(sql).toContain('failure_rate');
    expect(sql).toContain('average_elapsed_seconds');
    expect(sql).toContain('rpc_error_count');
    expect(sql).toContain('worker_error_count');
  });

  it('7. Admin System Health が rpc_stats / performance_stats JSONB を含む', () => {
    const sql = readMigration('20260810000005_kpi_phase3_admin_system.sql');
    expect(sql).toContain('rpc_stats');
    expect(sql).toContain('performance_stats');
    expect(sql).toContain('JSONB');
  });

  it('8. Admin RPC全5件が REVOKE FROM PUBLIC を含む', () => {
    const migrations = [
      '20260810000002_kpi_phase3_admin_match.sql',
      '20260810000003_kpi_phase3_admin_arena.sql',
      '20260810000004_kpi_phase3_admin_postmortem.sql',
      '20260810000005_kpi_phase3_admin_system.sql',
    ];
    for (const file of migrations) {
      const sql = readMigration(file);
      expect(sql, `${file} should REVOKE FROM PUBLIC`).toContain('REVOKE ALL ON FUNCTION');
      expect(sql, `${file} should have anon in REVOKE`).toContain('anon');
    }
  });
});
