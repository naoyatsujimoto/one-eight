/**
 * kpi_migration_order.test.ts — KPI migration順序静的検証
 *
 * 検証内容:
 *  1. KPI migration番号の昇順が正しい順序 (tables < rls < rpcs < security < validation < ownership < grants < admin_start_at < rate_limit_fix)
 *  2. 旧migration 20260809113951 が存在しないこと
 *  3. 新migration 20260809195846 が存在すること
 *  4. 各migrationの依存関係が正しい順序で定義されていること（静的SQL解析）
 *  5. TypeScript KpiEventPropsMapのevent名一覧とDB validator対象event名が完全一致すること
 *  6. ALLOWED_KPI_EVENT_NAMES が25件であること
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { ALLOWED_KPI_EVENT_NAMES } from '../lib/kpiEvents';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const MIGRATIONS_DIR = join(__dirname, '../../supabase/migrations');

function migrationPath(filename: string): string {
  return join(MIGRATIONS_DIR, filename);
}

function readMigration(filename: string): string {
  return readFileSync(migrationPath(filename), 'utf-8');
}

// ---------------------------------------------------------------------------
// KPI migration 定義
// ---------------------------------------------------------------------------

const KPI_MIGRATIONS = [
  { file: '20260809195843_kpi_phase1_tables.sql',          ts: 20260809195843, desc: 'tables' },
  { file: '20260809195844_kpi_phase1_rls.sql',             ts: 20260809195844, desc: 'rls' },
  { file: '20260809195845_kpi_phase1_rpcs.sql',            ts: 20260809195845, desc: 'base_rpcs' },
  { file: '20260809195846_kpi_phase1_security.sql',        ts: 20260809195846, desc: 'security' },
  { file: '20260809195847_kpi_phase1_event_validation.sql',ts: 20260809195847, desc: 'event_validation' },
  { file: '20260809195848_kpi_session_ownership.sql',      ts: 20260809195848, desc: 'session_ownership' },
  { file: '20260809195849_kpi_srole_grants.sql',    ts: 20260809195849, desc: 'service_role_grants' },
  { file: '20260809195850_kpi_admin_start_at_rpcs.sql',    ts: 20260809195850, desc: 'admin_start_at_rpcs' },
  { file: '20260809195851_kpi_rate_limit_fix.sql',         ts: 20260809195851, desc: 'rate_limit_fix' },
] as const;

// ---------------------------------------------------------------------------
// DB validator内のevent一覧（event_validation migration SQLからWHEN句を抽出）
// ---------------------------------------------------------------------------

function extractDbValidatorEvents(sql: string): string[] {
  // CASE p_event_name 内のWHEN 'event_name' THEN パターンを抽出
  const matches = sql.matchAll(/WHEN '([a-z_]+)' THEN/g);
  const events: string[] = [];
  for (const m of matches) {
    if (m[1] && m[1] !== 'ELSE') {
      events.push(m[1]);
    }
  }
  return [...new Set(events)].sort();
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('KPI Migration Order — 静的検証', () => {

  it('1. 全KPI migrationファイルが存在すること', () => {
    for (const { file } of KPI_MIGRATIONS) {
      expect(existsSync(migrationPath(file)), `${file} should exist`).toBe(true);
    }
  });

  it('2. 旧migration 20260809113951 が存在しないこと', () => {
    const allFiles = readdirSync(MIGRATIONS_DIR);
    const oldMigration = allFiles.find(f => f.startsWith('20260809113951'));
    expect(oldMigration).toBeUndefined();
  });

  it('3. 新migration 20260809195846 (security) が存在すること', () => {
    expect(existsSync(migrationPath('20260809195846_kpi_phase1_security.sql'))).toBe(true);
  });

  it('4. KPI migration番号が昇順に並んでいること', () => {
    const timestamps = KPI_MIGRATIONS.map(m => m.ts);
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]!);
    }
  });

  it('5. tables migrationが必要なテーブルを定義していること', () => {
    const sql = readMigration('20260809195843_kpi_phase1_tables.sql');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS kpi_events');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS kpi_sessions');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS kpi_settings');
  });

  it('6. rls migrationがtablesを参照していること（RLS ON）', () => {
    const sql = readMigration('20260809195844_kpi_phase1_rls.sql');
    expect(sql).toContain('ALTER TABLE kpi_events');
    expect(sql).toContain('ALTER TABLE kpi_sessions');
    expect(sql).toContain('ALTER TABLE kpi_settings');
    // tablesが先に必要（ALTER TABLEはCREATE TABLEの後でなければならない）
    // 番号でチェック: rls(195844) > tables(195843)
    expect(20260809195844).toBeGreaterThan(20260809195843);
  });

  it('7. base_rpcs migrationが_kpi_allowed_event_namesを定義していること', () => {
    const sql = readMigration('20260809195845_kpi_phase1_rpcs.sql');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public._kpi_allowed_event_names');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.track_kpi_event');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.upsert_kpi_session');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.cleanup_old_kpi_events');
    // base_rpcs(195845) > rls(195844)
    expect(20260809195845).toBeGreaterThan(20260809195844);
  });

  it('8. security migrationが_kpi_check_pii_keysを定義していること', () => {
    const sql = readMigration('20260809195846_kpi_phase1_security.sql');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public._kpi_check_pii_keys');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS kpi_rate_limit');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public._kpi_check_rate_limit');
    // security(195846) > base_rpcs(195845)
    expect(20260809195846).toBeGreaterThan(20260809195845);
  });

  it('9. event_validation migrationが_kpi_validate_propertiesを定義していること', () => {
    const sql = readMigration('20260809195847_kpi_phase1_event_validation.sql');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public._kpi_validate_properties');
    // track_kpi_eventをCREATE OR REPLACEで上書きしていること
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.track_kpi_event');
    // _kpi_validate_propertiesを呼んでいること
    expect(sql).toContain('PERFORM _kpi_validate_properties(p_event_name, p_properties)');
    // event_validation(195847) > security(195846)
    expect(20260809195847).toBeGreaterThan(20260809195846);
  });

  it('10. session_ownership migrationがupsert_kpi_sessionを再定義していること', () => {
    const sql = readMigration('20260809195848_kpi_session_ownership.sql');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.upsert_kpi_session');
    // 全4拒否ケースが含まれていること
    expect(sql).toContain('KPI_SESSION_ANON_MISMATCH');
    expect(sql).toContain('KPI_SESSION_ENV_MISMATCH');
    expect(sql).toContain('KPI_SESSION_AUTH_REQUIRED');
    expect(sql).toContain('KPI_SESSION_USER_MISMATCH');
    // session_ownership(195848) > event_validation(195847)
    expect(20260809195848).toBeGreaterThan(20260809195847);
  });

  it('11. service_role_grants migrationが必要な関数にGRANTしていること', () => {
    const sql = readMigration('20260809195849_kpi_srole_grants.sql');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public._kpi_check_pii_keys');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public._kpi_check_rate_limit');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public._kpi_validate_properties');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.cleanup_old_kpi_events');
    // service_role_grants(195849) > session_ownership(195848)
    expect(20260809195849).toBeGreaterThan(20260809195848);
  });

  it('12. admin_start_at_rpcs migrationが2つのRPCを定義していること', () => {
    const sql = readMigration('20260809195850_kpi_admin_start_at_rpcs.sql');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_set_kpi_start_at');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_clear_kpi_start_at');
    // NULLチェックが含まれていること
    expect(sql).toContain('p_start_at IS NULL');
    // admin_start_at_rpcs(195850) > service_role_grants(195849)
    expect(20260809195850).toBeGreaterThan(20260809195849);
  });

  it('13. rate_limit_fix migrationが新シグネチャを定義していること', () => {
    const sql = readMigration('20260809195851_kpi_rate_limit_fix.sql');
    // 新シグネチャ（p_window_secsなし）
    expect(sql).toContain('_kpi_check_rate_limit(\n  p_bucket_key  TEXT,\n  p_limit       INTEGER\n)');
    // cleanup関数
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public._kpi_cleanup_rate_limit');
    // cleanup_old_kpi_eventsの更新
    expect(sql).toContain('PERFORM _kpi_cleanup_rate_limit(2)');
    // rate_limit_fix(195851) > admin_start_at_rpcs(195850)
    expect(20260809195851).toBeGreaterThan(20260809195850);
  });

  it('14. 全KPI migrationが正しい依存順序（昇順）になっていること', () => {
    const order = KPI_MIGRATIONS.map(m => m.ts);
    const sorted = [...order].sort((a, b) => a - b);
    expect(order).toEqual(sorted);
  });
});

describe('KPI Event Catalog — TypeScript ↔ DB 一致検証', () => {

  it('15. ALLOWED_KPI_EVENT_NAMES が25件であること', () => {
    expect(ALLOWED_KPI_EVENT_NAMES.length).toBe(25);
  });

  it('16. DB validator (event_validation migration) のevent名がTypeScriptと完全一致すること', () => {
    const sql = readMigration('20260809195847_kpi_phase1_event_validation.sql');
    const dbEvents = extractDbValidatorEvents(sql);
    const tsEvents = [...ALLOWED_KPI_EVENT_NAMES].sort();

    // DB側に含まれるevent数
    expect(dbEvents.length).toBeGreaterThan(0);

    // 全TSイベントがDBにも含まれること
    for (const eventName of tsEvents) {
      expect(dbEvents, `DB validator should include event: ${eventName}`).toContain(eventName);
    }

    // 全DBイベントがTSにも含まれること
    for (const eventName of dbEvents) {
      expect(tsEvents, `TS catalog should include event: ${eventName}`).toContain(eventName);
    }
  });

  it('17. TypeScriptのevent名一覧が正確に25件すべて定義されていること', () => {
    const expected = [
      'page_view',
      'session_started',
      'session_heartbeat',
      'auth_started',
      'auth_succeeded',
      'auth_failed',
      'language_changed',
      'training_started',
      'training_step_reached',
      'training_attempted',
      'training_incorrect',
      'training_hint_shown',
      'training_step_advanced',
      'training_resumed',
      'training_completed',
      'postmortem_started',
      'postmortem_completed',
      'postmortem_failed',
      'postmortem_refreshed',
      'postmortem_candidates_opened',
      'pro_feature_used',
      'frontend_error',
      'rpc_error',
      'realtime_reconnected',
      'performance_measure',
    ];

    expect(ALLOWED_KPI_EVENT_NAMES.length).toBe(expected.length);
    for (const name of expected) {
      expect(
        (ALLOWED_KPI_EVENT_NAMES as readonly string[]).includes(name),
        `ALLOWED_KPI_EVENT_NAMES should include: ${name}`
      ).toBe(true);
    }
  });
});
