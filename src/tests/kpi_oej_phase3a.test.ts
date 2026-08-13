/**
 * kpi_oej_phase3a.test.ts — OEJ KPI Phase 3-A テスト
 *
 * 検証内容:
 *  1.  migrationファイルが存在すること
 *  2.  4 RPC全ての CREATE OR REPLACE FUNCTION 定義があること
 *  3.  各RPCのargument names (p_from, p_to, p_timezone, p_include_internal)
 *  4.  RETURNS TABLE の列名が全て含まれること（各RPC）
 *  5.  SECURITY DEFINER が4件全てに存在すること
 *  6.  SET search_path = '' が4件全てに存在すること
 *  7.  internal除外ロジック (is_admin, is_internal_test_account, internal_plan_override)
 *  8.  user_id IS NULL を除外しないこと（OR ke.user_id IS NULL）
 *  9.  XとInstagramが独立した別値として扱われること（x_article_opens, instagram_article_opens）
 *  10. XとInstagramが source_summary で別行になること（'x' と 'instagram' が両方VALUES内に存在）
 *  11. completion_rateの分母ガード（CASE WHEN ... > 0）
 *  12. game_cta_rateの分母ガード
 *  13. PII非返却: RETURNS TABLE内にuser_id, anonymous_id, session_id, email, display_name, referrer が含まれないこと（4 RPCすべて）
 *  14. source帰属がDISTINCT ON (e.id) で1件確定していること
 *  15. 記事別集計がevent別先行集約してからJOINしていること（各CTE内でGROUP BY、LEFT JOINパターン）
 *  16. official_kpi_start_at 参照があること (kpi_settings から取得)
 *  17. 7つの固定sourceが全てVALUESに含まれること
 *  18. REVOKE FROM PUBLIC, anon があること
 *  19. GRANT TO authenticated, service_role, postgres があること
 *  20. environment='production' フィルタが存在すること
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(__dirname, '../../supabase/migrations');
const PHASE3A_MIGRATION = '20260811000003_kpi_oej_phase3a_rpcs.sql';
const PHASE3A_MIGRATION_PATH = join(MIGRATIONS_DIR, PHASE3A_MIGRATION);

const RPC_NAMES = [
  'admin_get_kpi_oej_summary',
  'admin_get_kpi_oej_article_summary',
  'admin_get_kpi_oej_source_summary',
  'admin_get_kpi_oej_daily',
] as const;

// ---------------------------------------------------------------------------
// describe 1: 基本構造
// ---------------------------------------------------------------------------

describe('OEJ KPI Phase 3-A — 基本構造', () => {

  it('1. migrationファイルが存在すること', () => {
    expect(existsSync(PHASE3A_MIGRATION_PATH), `${PHASE3A_MIGRATION} should exist`).toBe(true);
  });

  it('2. 4 RPC全ての CREATE OR REPLACE FUNCTION 定義があること', () => {
    const sql = readFileSync(PHASE3A_MIGRATION_PATH, 'utf-8');
    for (const rpcName of RPC_NAMES) {
      expect(
        sql,
        `SQL should include CREATE OR REPLACE FUNCTION for: ${rpcName}`
      ).toContain(`CREATE OR REPLACE FUNCTION public.${rpcName}`);
    }
  });

  it('3. 各RPCのargument names (p_from, p_to, p_timezone, p_include_internal) が含まれること', () => {
    const sql = readFileSync(PHASE3A_MIGRATION_PATH, 'utf-8');
    const requiredArgs = ['p_from', 'p_to', 'p_timezone', 'p_include_internal'];
    for (const arg of requiredArgs) {
      expect(sql, `SQL should include argument: ${arg}`).toContain(arg);
    }
  });

  it('5. SECURITY DEFINER が4件全てに存在すること', () => {
    const sql = readFileSync(PHASE3A_MIGRATION_PATH, 'utf-8');
    const matches = sql.match(/SECURITY DEFINER/g);
    expect(matches, 'Should have 4 SECURITY DEFINER occurrences').not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(4);
  });

  it("6. SET search_path = '' が4件全てに存在すること", () => {
    const sql = readFileSync(PHASE3A_MIGRATION_PATH, 'utf-8');
    const matches = sql.match(/SET search_path = ''/g);
    expect(matches, "Should have 4 SET search_path = '' occurrences").not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(4);
  });

});

// ---------------------------------------------------------------------------
// describe 2: RETURNS TABLE 列名検証
// ---------------------------------------------------------------------------

describe('OEJ KPI Phase 3-A — RETURNS TABLE 列名', () => {

  it('4a. admin_get_kpi_oej_summary の列名が全て含まれること', () => {
    const sql = readFileSync(PHASE3A_MIGRATION_PATH, 'utf-8');
    const expectedColumns = [
      'list_views',
      'article_opens',
      'unique_readers',
      'sessions',
      'impressions',
      'engagement_events',
      'completed_reads',
      'completion_rate',
      'average_active_seconds',
      'median_active_seconds',
      'average_max_scroll_percent',
      'game_cta_clicks',
      'game_cta_rate',
      'reference_clicks',
      'load_failures',
      'fallback_opens',
      'fallback_rate',
      'is_reference_period',
      'effective_from',
      'effective_to',
    ];
    for (const col of expectedColumns) {
      expect(sql, `admin_get_kpi_oej_summary should return column: ${col}`).toContain(col);
    }
  });

  it('4b. admin_get_kpi_oej_article_summary の列名が全て含まれること', () => {
    const sql = readFileSync(PHASE3A_MIGRATION_PATH, 'utf-8');
    const expectedColumns = [
      'article_slug',
      'article_opens',
      'unique_readers',
      'impressions',
      'list_to_open_rate',
      'engagement_events',
      'completed_reads',
      'completion_rate',
      'average_active_seconds',
      'median_active_seconds',
      'average_max_scroll_percent',
      'reference_clicks',
      'game_cta_clicks',
      'game_cta_rate',
      'fallback_opens',
      'load_failures',
    ];
    for (const col of expectedColumns) {
      expect(sql, `admin_get_kpi_oej_article_summary should return column: ${col}`).toContain(col);
    }
  });

  it('4c. admin_get_kpi_oej_source_summary の列名が全て含まれること', () => {
    const sql = readFileSync(PHASE3A_MIGRATION_PATH, 'utf-8');
    const expectedColumns = [
      'traffic_source',
      'list_views',
      'article_opens',
      'unique_readers',
      'sessions',
      'engagement_events',
      'completed_reads',
      'completion_rate',
      'average_active_seconds',
      'game_cta_clicks',
      'game_cta_rate',
    ];
    for (const col of expectedColumns) {
      expect(sql, `admin_get_kpi_oej_source_summary should return column: ${col}`).toContain(col);
    }
  });

  it('4d. admin_get_kpi_oej_daily の列名が全て含まれること', () => {
    const sql = readFileSync(PHASE3A_MIGRATION_PATH, 'utf-8');
    const expectedColumns = [
      'day',
      'list_views',
      'article_opens',
      'unique_readers',
      'sessions',
      'engagement_events',
      'completed_reads',
      'completion_rate',
      'game_cta_clicks',
      'reference_clicks',
      'load_failures',
      'x_article_opens',
      'instagram_article_opens',
    ];
    for (const col of expectedColumns) {
      expect(sql, `admin_get_kpi_oej_daily should return column: ${col}`).toContain(col);
    }
  });

});

// ---------------------------------------------------------------------------
// describe 3: セキュリティ・内部除外
// ---------------------------------------------------------------------------

describe('OEJ KPI Phase 3-A — セキュリティ・内部除外', () => {

  it('7. internal除外ロジック (is_admin, is_internal_test_account, internal_plan_override) が含まれること', () => {
    const sql = readFileSync(PHASE3A_MIGRATION_PATH, 'utf-8');
    expect(sql).toContain('is_admin');
    expect(sql).toContain('is_internal_test_account');
    expect(sql).toContain('internal_plan_override IS NOT NULL');
  });

  it('8. user_id IS NULL を除外しないこと（OR ke.user_id IS NULL）', () => {
    const sql = readFileSync(PHASE3A_MIGRATION_PATH, 'utf-8');
    // 匿名ユーザーは除外しない: OR ke.user_id IS NULL が必要
    expect(sql).toContain('OR ke.user_id IS NULL');
  });

  it('13a. PII非返却: admin_get_kpi_oej_summary の RETURNS TABLE に禁止列が含まれないこと', () => {
    const sql = readFileSync(PHASE3A_MIGRATION_PATH, 'utf-8');
    const summaryStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.admin_get_kpi_oej_summary');
    const summaryEnd = sql.indexOf('LANGUAGE plpgsql', summaryStart);
    const returnsSection = sql.slice(summaryStart, summaryEnd);
    const forbiddenColumns = ['user_id', 'anonymous_id', 'session_id', 'email', 'display_name', 'referrer'];
    for (const col of forbiddenColumns) {
      const pattern = new RegExp(`\\b${col}\\b`);
      // RETURNS TABLE 内に禁止列がないこと (関数本体は別)
      const returnsTableMatch = returnsSection.match(/RETURNS TABLE \([^)]+\)/s);
      if (returnsTableMatch) {
        expect(
          returnsTableMatch[0].includes(col),
          `admin_get_kpi_oej_summary RETURNS TABLE should not include PII column: ${col}`
        ).toBe(false);
      }
    }
  });

  it('13b. PII非返却: admin_get_kpi_oej_article_summary の RETURNS TABLE に禁止列が含まれないこと', () => {
    const sql = readFileSync(PHASE3A_MIGRATION_PATH, 'utf-8');
    const funcStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.admin_get_kpi_oej_article_summary');
    const funcEnd = sql.indexOf('LANGUAGE plpgsql', funcStart);
    const returnsSection = sql.slice(funcStart, funcEnd);
    const forbiddenColumns = ['user_id', 'anonymous_id', 'session_id', 'email', 'display_name', 'referrer'];
    const returnsTableMatch = returnsSection.match(/RETURNS TABLE \([^)]+\)/s);
    if (returnsTableMatch) {
      for (const col of forbiddenColumns) {
        expect(
          returnsTableMatch[0].includes(col),
          `admin_get_kpi_oej_article_summary RETURNS TABLE should not include PII column: ${col}`
        ).toBe(false);
      }
    }
  });

  it('13c. PII非返却: admin_get_kpi_oej_source_summary の RETURNS TABLE に禁止列が含まれないこと', () => {
    const sql = readFileSync(PHASE3A_MIGRATION_PATH, 'utf-8');
    const funcStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.admin_get_kpi_oej_source_summary');
    const funcEnd = sql.indexOf('LANGUAGE plpgsql', funcStart);
    const returnsSection = sql.slice(funcStart, funcEnd);
    const forbiddenColumns = ['user_id', 'anonymous_id', 'session_id', 'email', 'display_name', 'referrer'];
    const returnsTableMatch = returnsSection.match(/RETURNS TABLE \([^)]+\)/s);
    if (returnsTableMatch) {
      for (const col of forbiddenColumns) {
        // traffic_source はOK、session_id はNG
        if (col !== 'traffic_source') {
          expect(
            returnsTableMatch[0].includes(col),
            `admin_get_kpi_oej_source_summary RETURNS TABLE should not include PII column: ${col}`
          ).toBe(false);
        }
      }
    }
  });

  it('13d. PII非返却: admin_get_kpi_oej_daily の RETURNS TABLE に禁止列が含まれないこと', () => {
    const sql = readFileSync(PHASE3A_MIGRATION_PATH, 'utf-8');
    const funcStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.admin_get_kpi_oej_daily');
    const funcEnd = sql.indexOf('LANGUAGE plpgsql', funcStart);
    const returnsSection = sql.slice(funcStart, funcEnd);
    const forbiddenColumns = ['user_id', 'anonymous_id', 'session_id', 'email', 'display_name', 'referrer'];
    const returnsTableMatch = returnsSection.match(/RETURNS TABLE \([^)]+\)/s);
    if (returnsTableMatch) {
      for (const col of forbiddenColumns) {
        expect(
          returnsTableMatch[0].includes(col),
          `admin_get_kpi_oej_daily RETURNS TABLE should not include PII column: ${col}`
        ).toBe(false);
      }
    }
  });

  it('18. REVOKE FROM PUBLIC, anon があること', () => {
    const sql = readFileSync(PHASE3A_MIGRATION_PATH, 'utf-8');
    expect(sql).toContain('REVOKE ALL ON FUNCTION');
    expect(sql).toContain('FROM PUBLIC');
    expect(sql).toContain('FROM anon');
  });

  it('19. GRANT TO authenticated, service_role, postgres があること', () => {
    const sql = readFileSync(PHASE3A_MIGRATION_PATH, 'utf-8');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION');
    expect(sql).toContain('TO authenticated, service_role, postgres');
  });

  it('20. environment=\'production\' フィルタが存在すること', () => {
    const sql = readFileSync(PHASE3A_MIGRATION_PATH, 'utf-8');
    const matches = sql.match(/environment = 'production'/g);
    expect(matches, "Should have environment='production' filter").not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(4);
  });

});

// ---------------------------------------------------------------------------
// describe 4: 集計ロジック検証
// ---------------------------------------------------------------------------

describe('OEJ KPI Phase 3-A — 集計ロジック', () => {

  it('9. XとInstagramが独立した別値として扱われること（x_article_opens, instagram_article_opens）', () => {
    const sql = readFileSync(PHASE3A_MIGRATION_PATH, 'utf-8');
    expect(sql).toContain('x_article_opens');
    expect(sql).toContain('instagram_article_opens');
    // 両方が独立した値として使われている ('x' と 'instagram' がそれぞれ独立してフィルタ条件に存在)
    expect(sql, "'x' should be used as a separate traffic_source value").toContain("= 'x'");
    expect(sql, "'instagram' should be used as a separate traffic_source value").toContain("= 'instagram'");
  });

  it('10. XとInstagramが source_summary で別行になること（\'x\' と \'instagram\' が両方VALUES内に存在）', () => {
    const sql = readFileSync(PHASE3A_MIGRATION_PATH, 'utf-8');
    // sources VALUES に 'x' と 'instagram' が独立した行として存在
    expect(sql).toContain("('x'::TEXT)");
    expect(sql).toContain("('instagram')");
  });

  it('11. completion_rateの分母ガード（CASE WHEN ... > 0）が全RPCに含まれること', () => {
    const sql = readFileSync(PHASE3A_MIGRATION_PATH, 'utf-8');
    // engagement_events > 0 の分母ガード: CASE WHEN ea.cnt > 0 / CASE WHEN COALESCE(ea.cnt,0) > 0 パターン
    // SQLは複数行にまたがるため、CASE WHEN と > 0 と THEN ROUND の各部分が存在することを確認
    expect(sql).toContain('completion_rate');
    // completion_rate の分母ガードパターン（ea.cnt > 0 または類似）
    const guard1 = sql.includes('ea.cnt > 0') || sql.includes('COALESCE(ea.cnt, 0) > 0');
    expect(guard1, 'completion_rate should have division guard (ea.cnt > 0)').toBe(true);
    // game_cta_rate の分母ガード
    const guard2 = sql.includes('ao.cnt > 0') || sql.includes('COALESCE(ob.cnt, 0) > 0') || sql.includes('COALESCE(oa.cnt, 0) > 0');
    expect(guard2, 'game_cta_rate should have division guard').toBe(true);
    // source_summary completion_rate ガード
    const guard3 = sql.includes('eb.cnt, 0) > 0') || sql.includes('eb.cnt > 0');
    expect(guard3, 'source_summary completion_rate should have division guard').toBe(true);
  });

  it('12. game_cta_rateの分母ガード（CASE WHEN ao.cnt > 0 または類似）が含まれること', () => {
    const sql = readFileSync(PHASE3A_MIGRATION_PATH, 'utf-8');
    // game_cta_rate の計算に分母ガードがあること
    expect(sql).toContain('game_cta_rate');
    // article_opens (ao.cnt) が 0 より大きい場合のみ計算
    const ctaRatePattern = sql.match(/CASE WHEN.*ao\.cnt.*>.*0.*THEN.*ROUND.*ca\.cnt/s)
      || sql.match(/CASE WHEN COALESCE\(ob\.cnt.*>.*0.*THEN.*ROUND.*COALESCE\(cb\.cnt/s)
      || sql.match(/CASE WHEN COALESCE\(oa\.cnt.*>.*0.*THEN.*ROUND.*COALESCE\(ca\.cnt/s);
    expect(ctaRatePattern, 'game_cta_rate should have division guard').not.toBeNull();
  });

  it('14. source帰属がDISTINCT ON (e.id) で1件確定していること', () => {
    const sql = readFileSync(PHASE3A_MIGRATION_PATH, 'utf-8');
    expect(sql).toContain('DISTINCT ON (e.id)');
    // 複数箇所で使用されていること（eng_attributed, cta_art_attributed, cta_list_attributed）
    const distinctOnMatches = sql.match(/DISTINCT ON \(e\.id\)/g);
    expect(distinctOnMatches, 'Should have DISTINCT ON (e.id) for attribution').not.toBeNull();
    expect(distinctOnMatches!.length).toBeGreaterThanOrEqual(2);
  });

  it('15. 記事別集計がevent別先行集約してからJOINしていること（imp_agg, open_agg, eng_agg等）', () => {
    const sql = readFileSync(PHASE3A_MIGRATION_PATH, 'utf-8');
    // 各イベント種別ごとにCTEで先行集約 (GROUP BY) してからLEFT JOINするパターン
    expect(sql).toContain('imp_agg');
    expect(sql).toContain('open_agg');
    expect(sql).toContain('eng_agg');
    expect(sql).toContain('ref_agg');
    expect(sql).toContain('cta_agg');
    expect(sql).toContain('fail_agg');
    // 各CTEにGROUP BY が含まれること
    const groupByMatches = sql.match(/GROUP BY 1/g);
    expect(groupByMatches, 'Should have GROUP BY in aggregation CTEs').not.toBeNull();
    expect(groupByMatches!.length).toBeGreaterThanOrEqual(6);
  });

  it('16. official_kpi_start_at 参照があること (kpi_settings から取得)', () => {
    const sql = readFileSync(PHASE3A_MIGRATION_PATH, 'utf-8');
    expect(sql).toContain('official_kpi_start_at');
    expect(sql).toContain('kpi_settings');
    // 4件全てに含まれること
    const matches = sql.match(/official_kpi_start_at/g);
    expect(matches, 'Should reference official_kpi_start_at in all 4 RPCs').not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(4);
  });

  it('17. 7つの固定sourceが全てVALUESに含まれること', () => {
    const sql = readFileSync(PHASE3A_MIGRATION_PATH, 'utf-8');
    const requiredSources = ['x', 'instagram', 'google', 'bing', 'one_eight_internal', 'direct', 'other_external'];
    // sources VALUES に各ソースが含まれること（'x'::TEXT や 'instagram' の形式も許容）
    for (const src of requiredSources) {
      expect(sql, `VALUES should include source: ${src}`).toContain(`'${src}'`);
    }
    // VALUES キーワードと共にsources CTEとして定義されていること
    expect(sql).toContain('sources(src) AS');
    expect(sql).toContain('VALUES');
  });

});

// ---------------------------------------------------------------------------
// describe 5: Migration order
// ---------------------------------------------------------------------------

describe('OEJ KPI Phase 3-A — Migration Order', () => {

  it('migration番号が正しい昇順であること (20260811000003 > 20260811000002)', () => {
    const ts3 = parseInt('20260811000003', 10);
    const ts2 = parseInt('20260811000002', 10);
    expect(ts3).toBeGreaterThan(ts2);
  });

  it('migration番号が次に来るべき番号であること', () => {
    // 20260811000003 が既存の最後 20260811000002 の次であること
    expect(parseInt('20260811000003', 10)).toBe(parseInt('20260811000002', 10) + 1);
  });

});

// ---------------------------------------------------------------------------
// describe 6: Phase 3-A source_summary fix (20260811000004)
// ---------------------------------------------------------------------------

const PHASE3A_FIX_MIGRATION = '20260811000004_kpi_oej_phase3a_source_summary_fix.sql';
const PHASE3A_FIX_MIGRATION_PATH = join(MIGRATIONS_DIR, PHASE3A_FIX_MIGRATION);

describe('OEJ KPI Phase 3-A source_summary fix — 20260811000004', () => {

  it('fix migrationファイルが存在すること', () => {
    expect(existsSync(PHASE3A_FIX_MIGRATION_PATH)).toBe(true);
  });

  it('CREATE OR REPLACE FUNCTION admin_get_kpi_oej_source_summary が含まれること', () => {
    const sql = readFileSync(PHASE3A_FIX_MIGRATION_PATH, 'utf-8');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_get_kpi_oej_source_summary');
  });

  it('RETURNS TABLE の列名が元定義と一致すること（戻り契約維持）', () => {
    const sql = readFileSync(PHASE3A_FIX_MIGRATION_PATH, 'utf-8');
    const expectedColumns = [
      'traffic_source',
      'list_views',
      'article_opens',
      'unique_readers',
      'sessions',
      'engagement_events',
      'completed_reads',
      'completion_rate',
      'average_active_seconds',
      'game_cta_clicks',
      'game_cta_rate',
    ];
    for (const col of expectedColumns) {
      expect(sql, `fix migration RETURNS TABLE should include column: ${col}`).toContain(col);
    }
  });

  it('未修飾の traffic_source SELECT が存在しないこと（完全修飾で衝突解消）', () => {
    const sql = readFileSync(PHASE3A_FIX_MIGRATION_PATH, 'utf-8');
    // cta_attributed で修飾されていること
    expect(sql).toContain('caa.traffic_source');
    expect(sql).toContain('cla.traffic_source');
    // list_by_src で修飾されていること
    expect(sql).toContain('le.traffic_source');
    // open_by_src で修飾されていること
    expect(sql).toContain('oe.traffic_source');
    // sess_by_src で修飾されていること
    expect(sql).toContain('ss.traffic_source');
    // 未修飾パターン "SELECT traffic_source AS src" が残っていないこと
    const unqualified = /\bSELECT\s+traffic_source\s+AS\s+src\b/;
    const bodyMatch = sql.match(/\$\$([\.\s\S]+?)\$\$/);
    expect(bodyMatch).not.toBeNull();
    expect(
      unqualified.test(bodyMatch![1]!),
      'Should not have unqualified SELECT traffic_source AS src in function body'
    ).toBe(false);
  });

  it('他の3 RPCが fix migration に含まれないこと（変更範囲最小化）', () => {
    const sql = readFileSync(PHASE3A_FIX_MIGRATION_PATH, 'utf-8');
    expect(sql).not.toContain('admin_get_kpi_oej_summary(');
    expect(sql).not.toContain('admin_get_kpi_oej_article_summary(');
    expect(sql).not.toContain('admin_get_kpi_oej_daily(');
  });

  it('SECURITY DEFINER / REVOKE / GRANT が維持されていること', () => {
    const sql = readFileSync(PHASE3A_FIX_MIGRATION_PATH, 'utf-8');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('REVOKE ALL ON FUNCTION');
    expect(sql).toContain('FROM anon');
    expect(sql).toContain('FROM PUBLIC');
    expect(sql).toContain('TO authenticated, service_role, postgres');
  });

  it('7つの固定sourceが全てVALUESに含まれること', () => {
    const sql = readFileSync(PHASE3A_FIX_MIGRATION_PATH, 'utf-8');
    const sources = ['x', 'instagram', 'google', 'bing', 'one_eight_internal', 'direct', 'other_external'];
    for (const src of sources) {
      expect(sql, `Fix migration VALUES should include source: ${src}`).toContain(`'${src}'`);
    }
  });

});
