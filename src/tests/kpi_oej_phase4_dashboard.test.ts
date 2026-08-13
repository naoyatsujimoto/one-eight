/**
 * kpi_oej_phase4_dashboard.test.ts — OEJ KPI Phase 4 Dashboard テスト
 *
 * 確認内容:
 *  1. 5 RPCがkpiAdmin.tsからexportされている
 *  2. p_timezone等の引数名がRPC契約と一致
 *  3. OEJセクションがDashboardに存在
 *  4. Overview主要項目が表示される
 *  5. XとInstagramがTraffic Sourceで独立表示
 *  6. X Opens / Instagram OpensがDailyで別列
 *  7. Attributionのoverall/source/article分類
 *  8. percentageを100倍していない（fmtPctがRPC値をそのまま使用）
 *  9. 空記事データでNo data
 * 10. 部分RPC失敗でDashboard全体を失敗させない
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const KPIADMIN_PATH = join(__dirname, '../lib/kpiAdmin.ts');
const DASHBOARD_PATH = join(__dirname, '../components/AdminKpiDashboard.tsx');

const kpiSrc = readFileSync(KPIADMIN_PATH, 'utf-8');
const dashSrc = readFileSync(DASHBOARD_PATH, 'utf-8');

// ---------------------------------------------------------------------------
// テスト 1: 5 RPCがkpiAdmin.tsからexportされている
// ---------------------------------------------------------------------------

describe('[OEJ Phase4] テスト1: 5 OEJ RPC関数がexportされている', () => {
  it('adminGetKpiOejSummary が export されている', async () => {
    const mod = await import('../lib/kpiAdmin');
    expect(typeof mod.adminGetKpiOejSummary).toBe('function');
  });

  it('adminGetKpiOejArticleSummary が export されている', async () => {
    const mod = await import('../lib/kpiAdmin');
    expect(typeof mod.adminGetKpiOejArticleSummary).toBe('function');
  });

  it('adminGetKpiOejSourceSummary が export されている', async () => {
    const mod = await import('../lib/kpiAdmin');
    expect(typeof mod.adminGetKpiOejSourceSummary).toBe('function');
  });

  it('adminGetKpiOejDaily が export されている', async () => {
    const mod = await import('../lib/kpiAdmin');
    expect(typeof mod.adminGetKpiOejDaily).toBe('function');
  });

  it('adminGetKpiOejAttribution が export されている', async () => {
    const mod = await import('../lib/kpiAdmin');
    expect(typeof mod.adminGetKpiOejAttribution).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// テスト 2: p_timezone等の引数名がRPC契約と一致
// ---------------------------------------------------------------------------

describe('[OEJ Phase4] テスト2: 引数名がRPC契約と一致', () => {
  it('5 OEJ RPCの呼び出しにp_from / p_to / p_timezone / p_include_internalが含まれる', () => {
    const oejRpcs = [
      'admin_get_kpi_oej_summary',
      'admin_get_kpi_oej_article_summary',
      'admin_get_kpi_oej_source_summary',
      'admin_get_kpi_oej_daily',
      'admin_get_kpi_oej_attribution',
    ];
    for (const rpc of oejRpcs) {
      expect(kpiSrc, `Should call ${rpc}`).toContain(rpc);
    }
    // 引数名確認
    expect(kpiSrc).toContain('p_from: params.p_from');
    expect(kpiSrc).toContain('p_to: params.p_to');
    expect(kpiSrc).toContain('p_timezone: params.p_timezone');
    expect(kpiSrc).toContain('p_include_internal: params.p_include_internal');
    // p_tz は使用しない
    expect(kpiSrc).not.toContain('p_tz: params.p_tz');
  });

  it('KpiOejSummaryRow, KpiOejArticleSummaryRow 等の型がexportされている', () => {
    expect(kpiSrc).toContain('export interface KpiOejSummaryRow');
    expect(kpiSrc).toContain('export interface KpiOejArticleSummaryRow');
    expect(kpiSrc).toContain('export interface KpiOejSourceSummaryRow');
    expect(kpiSrc).toContain('export interface KpiOejDailyRow');
    expect(kpiSrc).toContain('export interface KpiOejAttributionRow');
  });

  it('KpiOejDailyRow に x_article_opens / instagram_article_opens が含まれる', () => {
    const rowMatch = kpiSrc.match(/export interface KpiOejDailyRow \{[\s\S]*?\}/);
    expect(rowMatch).not.toBeNull();
    if (rowMatch) {
      expect(rowMatch[0]).toContain('x_article_opens');
      expect(rowMatch[0]).toContain('instagram_article_opens');
    }
  });

  it('KpiOejAttributionRow に dimension_type / dimension_value が含まれる', () => {
    const rowMatch = kpiSrc.match(/export interface KpiOejAttributionRow \{[\s\S]*?\}/);
    expect(rowMatch).not.toBeNull();
    if (rowMatch) {
      expect(rowMatch[0]).toContain('dimension_type');
      expect(rowMatch[0]).toContain('dimension_value');
      expect(rowMatch[0]).toContain('auth_to_registration_rate');
    }
  });
});

// ---------------------------------------------------------------------------
// テスト 3: OEJセクションがDashboardに存在
// ---------------------------------------------------------------------------

describe('[OEJ Phase4] テスト3: OEJセクションがDashboardに存在', () => {
  it("Section G: ONE EIGHT JOURNAL がDashboard.tsxに存在する", () => {
    expect(dashSrc).toContain('G. ONE EIGHT JOURNAL');
  });

  it('SectionOej コンポーネントがDashboard.tsxに定義されている', () => {
    expect(dashSrc).toContain('function SectionOej(');
  });

  it('SectionOejがメインレンダーに組み込まれている', () => {
    expect(dashSrc).toContain('<SectionOej');
  });

  it('oejSummary / oejArticle / oejSource / oejDaily / oejAttributionがDashboard.tsxで参照されている', () => {
    expect(dashSrc).toContain("data?.oejSummary");
    expect(dashSrc).toContain("data?.oejArticle");
    expect(dashSrc).toContain("data?.oejSource");
    expect(dashSrc).toContain("data?.oejDaily");
    expect(dashSrc).toContain("data?.oejAttribution");
  });

  it('KpiDashboardData にoejフィールドが追加されている', () => {
    expect(kpiSrc).toContain('oejSummary: KpiOejSummaryRow | null');
    expect(kpiSrc).toContain('oejArticle: KpiOejArticleSummaryRow[]');
    expect(kpiSrc).toContain('oejSource: KpiOejSourceSummaryRow[]');
    expect(kpiSrc).toContain('oejDaily: KpiOejDailyRow[]');
    expect(kpiSrc).toContain('oejAttribution: KpiOejAttributionRow[]');
  });

  it('KpiDashboardSectionError にoejエラーフィールドが追加されている', () => {
    expect(kpiSrc).toContain('oejSummary?: string');
    expect(kpiSrc).toContain('oejArticle?: string');
    expect(kpiSrc).toContain('oejSource?: string');
    expect(kpiSrc).toContain('oejDaily?: string');
    expect(kpiSrc).toContain('oejAttribution?: string');
  });
});

// ---------------------------------------------------------------------------
// テスト 4: Overview主要項目が表示される
// ---------------------------------------------------------------------------

describe('[OEJ Phase4] テスト4: Overview主要項目が表示される', () => {
  it('Unique Readersカードが表示される', () => {
    expect(dashSrc).toContain('Unique Readers');
    expect(dashSrc).toContain('data.unique_readers');
  });

  it('Article Opensカードが表示される', () => {
    expect(dashSrc).toContain('Article Opens');
    expect(dashSrc).toContain('data.article_opens');
  });

  it('Completion Rateカードが表示される', () => {
    expect(dashSrc).toContain('Completion Rate');
    expect(dashSrc).toContain('data.completion_rate');
  });

  it('Average Active Secondsカードが表示される', () => {
    expect(dashSrc).toContain('Avg Active Seconds');
    expect(dashSrc).toContain('data.average_active_seconds');
  });

  it('Game CTA Clicksカードが表示される', () => {
    expect(dashSrc).toContain('Game CTA Clicks');
    expect(dashSrc).toContain('data.game_cta_clicks');
  });

  it('Game CTA Rateカードが表示される', () => {
    expect(dashSrc).toContain('Game CTA Rate');
    expect(dashSrc).toContain('data.game_cta_rate');
  });

  it('Reference Clicksカードが表示される', () => {
    expect(dashSrc).toContain('Reference Clicks');
    expect(dashSrc).toContain('data.reference_clicks');
  });

  it('Load Failuresカードが表示される', () => {
    expect(dashSrc).toContain('Load Failures');
    expect(dashSrc).toContain('data.load_failures');
  });
});

// ---------------------------------------------------------------------------
// テスト 5: XとInstagramがTraffic Sourceで独立表示
// ---------------------------------------------------------------------------

describe('[OEJ Phase4] テスト5: XとInstagramがTraffic Sourceで独立表示', () => {
  it("OEJ_SOURCE_ORDERに 'x' と 'instagram' が独立エントリとして含まれる", () => {
    expect(dashSrc).toContain("'x'");
    expect(dashSrc).toContain("'instagram'");
    // SOURCE_ORDERとして定義されている
    expect(dashSrc).toContain('OEJ_SOURCE_ORDER');
  });

  it("OEJ_SOURCE_ORDER配列でxとinstagramが別エントリとして定義されている", () => {
    const match = dashSrc.match(/OEJ_SOURCE_ORDER\s*=\s*\[[\s\S]*?\]/);
    expect(match).not.toBeNull();
    if (match) {
      expect(match[0]).toContain("'x'");
      expect(match[0]).toContain("'instagram'");
      // 'social' や 'X/Instagram' のような合算エントリがないこと
      expect(match[0]).not.toContain("'social'");
      expect(match[0]).not.toContain("'X/Instagram'");
    }
  });

  it('Traffic Source表にSource列がある', () => {
    expect(dashSrc).toContain('<th>Source</th>');
    expect(dashSrc).toContain("r.traffic_source");
  });

  it('oejSourceSortがX/Instagramを独立ソートする', () => {
    expect(dashSrc).toContain('function oejSourceSort(');
    expect(dashSrc).toContain('OEJ_SOURCE_ORDER.indexOf(');
  });
});

// ---------------------------------------------------------------------------
// テスト 6: X Opens / Instagram OpensがDailyで別列
// ---------------------------------------------------------------------------

describe('[OEJ Phase4] テスト6: X Opens / Instagram OpensがDailyで別列', () => {
  it('Daily表にX Opens列がある', () => {
    expect(dashSrc).toContain('<th>X Opens</th>');
    expect(dashSrc).toContain('r.x_article_opens');
  });

  it('Daily表にInstagram Opens列がある', () => {
    expect(dashSrc).toContain('<th>Instagram Opens</th>');
    expect(dashSrc).toContain('r.instagram_article_opens');
  });

  it('X OpensとInstagram Opensが同一列に合算されていない', () => {
    // x_article_opens と instagram_article_opens が別々の <td> として存在
    // 合算している場合は両者が + で連結されるはず
    expect(dashSrc).not.toMatch(/x_article_opens\s*\+\s*instagram_article_opens/);
  });

  it('KpiOejDailyRow にx_article_opens / instagram_article_opensが含まれる', () => {
    expect(kpiSrc).toContain('x_article_opens:');
    expect(kpiSrc).toContain('instagram_article_opens:');
  });
});

// ---------------------------------------------------------------------------
// テスト 7: Attributionのoverall/source/article分類
// ---------------------------------------------------------------------------

describe('[OEJ Phase4] テスト7: Attributionのoverall/source/article分類', () => {
  it("dimension_type='overall'でoverall行をカードとして表示", () => {
    expect(dashSrc).toContain("'overall'");
    expect(dashSrc).toContain("overall.auth_started");
    expect(dashSrc).toContain("overall.registrations");
    expect(dashSrc).toContain("overall.attributed_registrations");
    expect(dashSrc).toContain("overall.unattributed_registrations");
  });

  it("dimension_type='source'でSource Attribution表を表示", () => {
    expect(dashSrc).toContain("'source'");
    expect(dashSrc).toContain('Source Attribution');
    expect(dashSrc).toContain('r.dimension_value');
  });

  it("dimension_type='article'でArticle Attribution表を表示", () => {
    expect(dashSrc).toContain("'article'");
    expect(dashSrc).toContain('Article Attribution');
  });

  it('Attributionでもauth_to_registration_rateが表示される', () => {
    expect(dashSrc).toContain('overall.auth_to_registration_rate');
    expect(dashSrc).toContain('r.auth_to_registration_rate');
  });

  it('attribution配列をdimension_typeでフィルタリングしている', () => {
    expect(dashSrc).toMatch(/filter\([\s\S]*?dimension_type[\s\S]*?===\s*['"]overall['"]/);
    expect(dashSrc).toMatch(/filter\([\s\S]*?dimension_type[\s\S]*?===\s*['"]source['"]/);
    expect(dashSrc).toMatch(/filter\([\s\S]*?dimension_type[\s\S]*?===\s*['"]article['"]/);
  });
});

// ---------------------------------------------------------------------------
// テスト 8: percentageを100倍していない
// ---------------------------------------------------------------------------

describe('[OEJ Phase4] テスト8: percentageを100倍していない', () => {
  it('fmtPct(75)は75.0%を返す（100倍しない）', async () => {
    const { fmtPct } = await import('../lib/kpiAdmin');
    expect(fmtPct(75)).toBe('75.0%');
    expect(fmtPct(100)).toBe('100.0%');
    expect(fmtPct(0)).toBe('0.0%');
  });

  it('Dashboard.tsxにてRPC値を*100している箇所がない', () => {
    // completion_rate * 100 のような乗算がないこと
    expect(dashSrc).not.toMatch(/completion_rate\s*\*\s*100/);
    expect(dashSrc).not.toMatch(/game_cta_rate\s*\*\s*100/);
    expect(dashSrc).not.toMatch(/auth_to_registration_rate\s*\*\s*100/);
  });

  it('OEJセクションでfmtPctを使用している（is_reference_period列は除く）', () => {
    // fmtPctが各パーセント列に使用されている
    expect(dashSrc).toContain('fmtPct(data.completion_rate)');
    expect(dashSrc).toContain('fmtPct(data.game_cta_rate)');
    expect(dashSrc).toContain('fmtPct(r.completion_rate)');
    expect(dashSrc).toContain('fmtPct(r.game_cta_rate)');
    expect(dashSrc).toContain('fmtPct(overall.auth_to_registration_rate)');
  });
});

// ---------------------------------------------------------------------------
// テスト 9: 空記事データでNo data
// ---------------------------------------------------------------------------

describe('[OEJ Phase4] テスト9: 空記事データでNo data表示', () => {
  it('Article PerformanceセクションがNo dataを表示する条件を持つ', () => {
    expect(dashSrc).toContain('C. Article Performance');
    // data.length === 0 の場合にNo dataを表示
    expect(dashSrc).toMatch(/data\.length === 0[\s\S]*?No data/);
  });

  it('Source PerformanceセクションがNo dataを表示する条件を持つ', () => {
    expect(dashSrc).toContain('B. Traffic Source');
    expect(dashSrc).toMatch(/data\.length === 0[\s\S]*?No data/);
  });

  it('Daily EセクションがNo dataを表示する条件を持つ', () => {
    expect(dashSrc).toContain('E. Daily');
    expect(dashSrc).toMatch(/data\.length === 0[\s\S]*?No data/);
  });
});

// ---------------------------------------------------------------------------
// テスト 10: 部分RPC失敗でDashboard全体を失敗させない
// ---------------------------------------------------------------------------

describe('[OEJ Phase4] テスト10: 部分RPC失敗でDashboard全体を失敗させない', () => {
  it('fetchKpiDashboard がPromise.allSettledを使用している', () => {
    expect(kpiSrc).toContain('Promise.allSettled');
  });

  it('5 OEJ RPCがPromise.allSettled内で呼ばれている', () => {
    expect(kpiSrc).toContain('adminGetKpiOejSummary(params)');
    expect(kpiSrc).toContain('adminGetKpiOejArticleSummary(params)');
    expect(kpiSrc).toContain('adminGetKpiOejSourceSummary(params)');
    expect(kpiSrc).toContain('adminGetKpiOejDaily(params)');
    expect(kpiSrc).toContain('adminGetKpiOejAttribution(params)');
  });

  it('OEJエラーはKpiDashboardSectionErrorに独立して記録される', () => {
    expect(kpiSrc).toContain("oejSummary?: string");
    expect(kpiSrc).toContain("oejArticle?: string");
    expect(kpiSrc).toContain("oejSource?: string");
    expect(kpiSrc).toContain("oejDaily?: string");
    expect(kpiSrc).toContain("oejAttribution?: string");
  });

  it('Dashboard.tsxでOEJエラーは各サブセクション別に表示される', () => {
    expect(dashSrc).toContain('summaryError={errors.oejSummary}');
    expect(dashSrc).toContain('articleError={errors.oejArticle}');
    expect(dashSrc).toContain('sourceError={errors.oejSource}');
    expect(dashSrc).toContain('dailyError={errors.oejDaily}');
    expect(dashSrc).toContain('attributionError={errors.oejAttribution}');
  });

  it('OEJ RPC失敗時にraw DB errorを表示しない（SectionError経由のみ）', () => {
    // SectionErrorコンポーネントを使用してエラーを表示
    expect(dashSrc).toContain('<SectionError msg={');
    // errorsにはmessageのみ（result.reasonのStringを使用）
    expect(kpiSrc).toContain("errors[key] = String(result.reason)");
  });
});
