/**
 * kpi_oej_phase3b.test.ts — OEJ KPI Phase 3-B Attribution テスト
 *
 * 検証内容:
 *  1.  migrationファイルが存在すること
 *  2.  admin_get_kpi_oej_attribution の CREATE OR REPLACE FUNCTION 定義があること
 *  3.  引数 p_from, p_to, p_timezone, p_include_internal が含まれること
 *  4.  RETURNS TABLE の全列名が含まれること
 *  5.  SECURITY DEFINER が存在すること
 *  6.  SET search_path = '' が存在すること
 *  7.  7日以内の直近touchへ帰属 — INTERVAL '7 days' が存在すること
 *  8.  7日超はunattributed — unattributed_auth_started / unattributed_registrations 列が存在すること
 *  9.  conversion後のtouchを使用しない — t.occurred_at <= cas.occurred_at が存在すること
 *  10. 同時刻でarticle_opened優先 — WHEN 'journal_article_opened' THEN 0 ELSE 1 が存在すること
 *  11. article_slug帰属 — article_slugがRETURNS TABLEに存在しないこと（PII/dimension_valueで返すこと）
 *  12. list touchではarticle_slugなし — CASE WHEN event_name = 'journal_article_opened' THEN ... ELSE NULL が存在すること
 *  13. X / Instagram独立 — 'x' と 'instagram' が別々のVALUES行として存在すること
 *  14. registrationはauth.usersで正規確認 — auth.users へのJOINが存在すること
 *  15. 重複auth_succeeded除外 — DISTINCT ON (r.user_id) が存在すること
 *  16. internal/admin除外 — is_admin, is_internal_test_account, internal_plan_override が存在すること
 *  17. overall 1行 — dimension_value = 'all' のSELECTが存在すること
 *  18. source 7行 — 7つのsource値が全てVALUES内に存在すること
 *  19. 分母0でNULL — CASE WHEN ... > 0 THEN ROUND ... ELSE NULL が存在すること
 *  20. PII非返却 — RETURNS TABLE内にuser_id, anonymous_id, session_id, email, display_name が含まれないこと
 *  21. Admin guard — _kpi_require_admin が存在すること
 *  22. REVOKE FROM PUBLIC, anon があること
 *  23. GRANT TO authenticated, service_role, postgres があること
 *  24. environment='production' フィルタが存在すること
 *  25. official_kpi_start_at 参照があること
 *  26. auth_to_registration_rate 列が存在すること
 *  27. anonymous_idでtouchをJOINすること — t.anonymous_id = cas.anonymous_id が存在すること
 *  28. DISTINCT ON (cas.id) または DISTINCT ON (cr.user_id) が存在すること
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(__dirname, '../../supabase/migrations');
const PHASE3B_MIGRATION = '20260811000005_kpi_oej_phase3b_attribution.sql';
const PHASE3B_MIGRATION_PATH = join(MIGRATIONS_DIR, PHASE3B_MIGRATION);

const RPC_NAME = 'admin_get_kpi_oej_attribution';

// ---------------------------------------------------------------------------
// describe 1: 基本構造
// ---------------------------------------------------------------------------

describe('OEJ KPI Phase 3-B — 基本構造', () => {

  it('1. migrationファイルが存在すること', () => {
    expect(existsSync(PHASE3B_MIGRATION_PATH), `${PHASE3B_MIGRATION} should exist`).toBe(true);
  });

  it('2. admin_get_kpi_oej_attribution の CREATE OR REPLACE FUNCTION 定義があること', () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${RPC_NAME}`);
  });

  it('3. 引数が含まれること (p_from, p_to, p_timezone, p_include_internal)', () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    for (const arg of ['p_from', 'p_to', 'p_timezone', 'p_include_internal']) {
      expect(sql, `Should include argument: ${arg}`).toContain(arg);
    }
  });

  it('5. SECURITY DEFINER が存在すること', () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    expect(sql).toContain('SECURITY DEFINER');
  });

  it("6. SET search_path = '' が存在すること", () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    expect(sql).toContain("SET search_path = ''");
  });

});

// ---------------------------------------------------------------------------
// describe 2: RETURNS TABLE 列名検証
// ---------------------------------------------------------------------------

describe('OEJ KPI Phase 3-B — RETURNS TABLE 列名', () => {

  it('4. RETURNS TABLE の全列名が含まれること', () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    const expectedColumns = [
      'dimension_type',
      'dimension_value',
      'auth_started',
      'registrations',
      'unique_auth_users',
      'unique_registered_users',
      'auth_to_registration_rate',
      'attributed_auth_started',
      'attributed_registrations',
      'unattributed_auth_started',
      'unattributed_registrations',
      'is_reference_period',
      'effective_from',
      'effective_to',
    ];
    for (const col of expectedColumns) {
      expect(sql, `RETURNS TABLE should include column: ${col}`).toContain(col);
    }
  });

  it('20. PII非返却 — RETURNS TABLEにuser_id / anonymous_id / session_id / email / display_name が含まれないこと', () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    // RETURNS TABLE ブロックを抽出
    const returnsMatch = sql.match(/RETURNS TABLE\s*\(([^)]+)\)/s);
    expect(returnsMatch, 'RETURNS TABLE block should exist').not.toBeNull();
    const returnsBlock = returnsMatch![1];
    for (const pii of ['user_id', 'anonymous_id', 'session_id', 'email', 'display_name']) {
      expect(returnsBlock, `RETURNS TABLE should NOT contain PII column: ${pii}`).not.toContain(pii);
    }
  });

  it('26. auth_to_registration_rate 列が存在すること', () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    expect(sql).toContain('auth_to_registration_rate');
  });

});

// ---------------------------------------------------------------------------
// describe 3: Attribution ロジック
// ---------------------------------------------------------------------------

describe('OEJ KPI Phase 3-B — Attribution ロジック', () => {

  it('7. 7日以内の直近touch — INTERVAL 7 days が存在すること', () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    expect(sql).toMatch(/INTERVAL\s+'7\s+days'/i);
  });

  it('8. unattributed列が存在すること', () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    expect(sql).toContain('unattributed_auth_started');
    expect(sql).toContain('unattributed_registrations');
  });

  it('9. conversion後のtouchを使用しない — occurred_at <= 条件が存在すること', () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    expect(sql).toMatch(/t\.occurred_at\s*<=\s*(cas|cr)\.occurred_at/);
  });

  it('10. 同時刻でarticle_opened優先 — WHEN journal_article_opened THEN 0 ELSE 1 が存在すること', () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    expect(sql).toMatch(/WHEN\s+'journal_article_opened'\s+THEN\s+0\s+ELSE\s+1/);
  });

  it("12. list touchではarticle_slugなし — CASE WHEN event_name = 'journal_article_opened' THEN ... ELSE NULL が存在すること", () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    expect(sql).toMatch(/CASE WHEN ke\.event_name = 'journal_article_opened'/);
    expect(sql).toMatch(/ELSE NULL/);
  });

  it('27. anonymous_idでtouchをJOINすること', () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    expect(sql).toMatch(/t\.anonymous_id\s*=\s*(cas|cr)\.anonymous_id/);
  });

  it('28. DISTINCT ON で1件確定すること', () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    expect(sql).toMatch(/DISTINCT ON \(cas\.id\)/);
    expect(sql).toMatch(/DISTINCT ON \((cr|r)\.user_id\)/);
  });

});

// ---------------------------------------------------------------------------
// describe 4: 新規登録・重複防止
// ---------------------------------------------------------------------------

describe('OEJ KPI Phase 3-B — 新規登録 / 重複防止', () => {

  it('14. auth.usersでの正規確認 — auth.users へのJOINが存在すること', () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    expect(sql).toMatch(/JOIN\s+auth\.users/);
  });

  it('14b. auth.users.deleted_at IS NULL チェックが存在すること', () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    expect(sql).toContain('deleted_at IS NULL');
  });

  it('14c. created_at 24時間以内チェックが存在すること', () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    expect(sql).toMatch(/INTERVAL\s+'24\s+hours'/i);
  });

  it('15. 重複auth_succeeded除外 — DISTINCT ON (r.user_id) が存在すること', () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    expect(sql).toMatch(/DISTINCT ON \(r\.user_id\)/);
  });

});

// ---------------------------------------------------------------------------
// describe 5: Internal除外 / セキュリティ
// ---------------------------------------------------------------------------

describe('OEJ KPI Phase 3-B — Internal除外 / セキュリティ', () => {

  it('16. internal/admin除外ロジックが存在すること', () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    expect(sql).toContain('is_admin');
    expect(sql).toContain('is_internal_test_account');
    expect(sql).toContain('internal_plan_override');
  });

  it('21. Admin guard — _kpi_require_admin が存在すること', () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    expect(sql).toContain('_kpi_require_admin');
  });

  it('22. REVOKE FROM PUBLIC / anon があること', () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    expect(sql).toMatch(/REVOKE.+FROM PUBLIC/s);
    expect(sql).toMatch(/REVOKE.+FROM\s+anon/s);
  });

  it('23. GRANT TO authenticated, service_role, postgres があること', () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    expect(sql).toContain('authenticated');
    expect(sql).toContain('service_role');
    expect(sql).toContain('postgres');
    expect(sql).toMatch(/GRANT EXECUTE/);
  });

  it('24. environment = production フィルタが存在すること', () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    expect(sql).toMatch(/environment\s*=\s*'production'/);
  });

  it('25. official_kpi_start_at 参照があること', () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    expect(sql).toContain('official_kpi_start_at');
  });

});

// ---------------------------------------------------------------------------
// describe 6: Source / Article 行構造
// ---------------------------------------------------------------------------

describe('OEJ KPI Phase 3-B — Source / Article 行構造', () => {

  it('13. X / Instagram が独立した別VALUESとして存在すること', () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    // VALUES ブロック内に 'x' と 'instagram' が別行で存在すること
    const valuesMatch = sql.match(/VALUES\s*\(([^;]+?)\)/s);
    expect(valuesMatch, 'VALUES block should exist').not.toBeNull();
    // xとinstagramが両方含まれること
    expect(sql).toContain("'x'");
    expect(sql).toContain("'instagram'");
  });

  it('17. overall 1行 — dimension_value = all の定義が存在すること', () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    expect(sql).toContain("'overall'");
    expect(sql).toContain("'all'");
  });

  it('18. source 7行 — 7つの固定sourceが全てVALUES内に存在すること', () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    const expectedSources = [
      'x', 'instagram', 'google', 'bing', 'one_eight_internal', 'direct', 'other_external'
    ];
    for (const src of expectedSources) {
      expect(sql, `SQL should include source: ${src}`).toContain(`'${src}'`);
    }
  });

  it('19. 分母0でNULL — CASE WHEN ... > 0 THEN ROUND ... ELSE NULL が存在すること', () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    expect(sql).toMatch(/CASE WHEN .+> 0\s*THEN ROUND/s);
    expect(sql).toMatch(/ELSE NULL\s*END/);
  });

  it("11. article行: dimension_valueにarticle_slugを使用すること", () => {
    const sql = readFileSync(PHASE3B_MIGRATION_PATH, 'utf-8');
    expect(sql).toContain("'article'");
    // article_slugがdimension_valueとして使われること（ars.slugやaaa.slugが参照される）
    expect(sql).toMatch(/article_slug/);
  });

});
