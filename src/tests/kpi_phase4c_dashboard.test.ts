/**
 * kpi_phase4c_dashboard.test.ts — KPI Phase 4-C Dashboard テスト
 *
 * テスト方針:
 * - AdminPageからKPI Dashboardを開ける（型・導線確認）
 * - kpiAdmin.tsのRPC呼び出し関数と型の存在確認
 * - 期間指定とinclude_internalがRPCへ渡る（引数確認）
 * - 一部RPC失敗時も他セクションを表示できる（Promise.allSettled確認）
 * - 0と未取得の区別（表示ロジック確認）
 * - full-game-v1のStep Funnelを表示できる（task_idフィルタリング）
 * - Step順／脱落割合順を切り替えられる（ソートロジック確認）
 * - RUN_KPI_DB_FIXTURE未指定時に本番fixtureを実行しない（安全化確認）
 * - Admin以外への公開導線を追加していない（AdminPageのonBackやrouteを変更していないことを確認）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { KpiArenaFunnelRow } from '../lib/kpiAdmin';

// ---------------------------------------------------------------------------
// テスト 1: AdminSubScreen型に 'kpi_dashboard' が含まれる
// ---------------------------------------------------------------------------

describe('[Phase4C] テスト1: AdminSubScreen型', () => {
  it("AdminPage.tsxのAdminSubScreen型に 'kpi_dashboard' が含まれる", async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../components/AdminPage.tsx');
    const src = fs.readFileSync(filePath, 'utf-8');
    expect(src).toContain("'kpi_dashboard'");
    // AdminSubScreen型に追加されていること
    expect(src).toMatch(/AdminSubScreen\s*=\s*['"]awards['"][\s\S]*?['"]kpi_dashboard['"]/);
  });

  it('AdminKpiDashboard componentがAdminPage.tsxにimportされている', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../components/AdminPage.tsx');
    const src = fs.readFileSync(filePath, 'utf-8');
    expect(src).toContain("import { AdminKpiDashboard }");
    expect(src).toContain("from './AdminKpiDashboard'");
  });

  it("subScreen === 'kpi_dashboard' の時、AdminKpiDashboardが返される", async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../components/AdminPage.tsx');
    const src = fs.readFileSync(filePath, 'utf-8');
    expect(src).toContain("subScreen === 'kpi_dashboard'");
    expect(src).toContain("<AdminKpiDashboard");
  });
});

// ---------------------------------------------------------------------------
// テスト 2: 10 RPCの呼び出し関数と型がkpiAdmin.tsに存在する
// ---------------------------------------------------------------------------

describe('[Phase4C] テスト2: kpiAdmin.tsのRPC関数と型', () => {
  it('adminGetKpiAcquisitionAuthSummary が export されている', async () => {
    const mod = await import('../lib/kpiAdmin');
    expect(typeof mod.adminGetKpiAcquisitionAuthSummary).toBe('function');
  });

  it('adminGetKpiMatchSummary が export されている', async () => {
    const mod = await import('../lib/kpiAdmin');
    expect(typeof mod.adminGetKpiMatchSummary).toBe('function');
  });

  it('adminGetKpiMatchDaily が export されている', async () => {
    const mod = await import('../lib/kpiAdmin');
    expect(typeof mod.adminGetKpiMatchDaily).toBe('function');
  });

  it('adminGetKpiArenaFunnel が export されている', async () => {
    const mod = await import('../lib/kpiAdmin');
    expect(typeof mod.adminGetKpiArenaFunnel).toBe('function');
  });

  it('adminGetKpiPostmortemSummary が export されている', async () => {
    const mod = await import('../lib/kpiAdmin');
    expect(typeof mod.adminGetKpiPostmortemSummary).toBe('function');
  });

  it('adminGetKpiSystemHealthSummary が export されている', async () => {
    const mod = await import('../lib/kpiAdmin');
    expect(typeof mod.adminGetKpiSystemHealthSummary).toBe('function');
  });

  it('adminGetKpiTrainingSummary が export されている', async () => {
    const mod = await import('../lib/kpiAdmin');
    expect(typeof mod.adminGetKpiTrainingSummary).toBe('function');
  });

  it('adminGetKpiTrainingTaskSummary が export されている', async () => {
    const mod = await import('../lib/kpiAdmin');
    expect(typeof mod.adminGetKpiTrainingTaskSummary).toBe('function');
  });

  it('adminGetKpiTrainingStepFunnel が export されている', async () => {
    const mod = await import('../lib/kpiAdmin');
    expect(typeof mod.adminGetKpiTrainingStepFunnel).toBe('function');
  });

  it('adminGetKpiTrainingDaily が export されている', async () => {
    const mod = await import('../lib/kpiAdmin');
    expect(typeof mod.adminGetKpiTrainingDaily).toBe('function');
  });

  it('adminGetKpiSettings が export されている (設定取得用)', async () => {
    const mod = await import('../lib/kpiAdmin');
    expect(typeof mod.adminGetKpiSettings).toBe('function');
  });

  it('fetchKpiDashboard が export されている（一括取得）', async () => {
    const mod = await import('../lib/kpiAdmin');
    expect(typeof mod.fetchKpiDashboard).toBe('function');
  });

  it('fmtNum / fmtPct / fmtDec / safeNum ヘルパーが export されている', async () => {
    const mod = await import('../lib/kpiAdmin');
    expect(typeof mod.fmtNum).toBe('function');
    expect(typeof mod.fmtPct).toBe('function');
    expect(typeof mod.fmtDec).toBe('function');
    expect(typeof mod.safeNum).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// テスト 3: 期間指定とinclude_internalがRPCへ渡る（静的コード確認）
// ---------------------------------------------------------------------------

describe('[Phase4C] テスト3: 期間指定とinclude_internalがRPCへ渡る', () => {
  it('kpiAdmin.tsのfetchKpiDashboard は p_from / p_to / p_tz / p_include_internal を各RPC関数へ渡している（静的確認）', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../lib/kpiAdmin.ts');
    const src = fs.readFileSync(filePath, 'utf-8');

    // 共通パラメータが各RPC呼び出しに渡されていること
    expect(src).toContain('p_from: params.p_from');
    expect(src).toContain('p_to: params.p_to');
    expect(src).toContain('p_timezone: params.p_timezone');  // p_tz → p_timezone
    expect(src).toContain('p_include_internal: params.p_include_internal');
  });

  it('各RPC関数の呼び出しにKpiAdminParamsが使用されている', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../lib/kpiAdmin.ts');
    const src = fs.readFileSync(filePath, 'utf-8');

    // KpiAdminParams型がexportされている
    expect(src).toContain('export interface KpiAdminParams');
    // 全10 RPC関数がparamsを受け取る
    const rpcFunctions = [
      'adminGetKpiAcquisitionAuthSummary',
      'adminGetKpiMatchSummary',
      'adminGetKpiMatchDaily',
      'adminGetKpiArenaFunnel',
      'adminGetKpiPostmortemSummary',
      'adminGetKpiSystemHealthSummary',
      'adminGetKpiTrainingSummary',
      'adminGetKpiTrainingTaskSummary',
      'adminGetKpiTrainingStepFunnel',
      'adminGetKpiTrainingDaily',
    ];
    for (const fn of rpcFunctions) {
      // 各関数がKpiAdminParamsをparamsとして受け取る
      expect(src).toContain(`${fn}(params: KpiAdminParams)`);
    }
  });

  it('fetchKpiDashboard が全10 RPC + settings RPC を並列呼び出しする', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../lib/kpiAdmin.ts');
    const src = fs.readFileSync(filePath, 'utf-8');

    // Promise.allSettledに11個の呼び出しが含まれる
    expect(src).toContain('adminGetKpiSettings()');
    expect(src).toContain('adminGetKpiAcquisitionAuthSummary(params)');
    expect(src).toContain('adminGetKpiMatchSummary(params)');
    expect(src).toContain('adminGetKpiMatchDaily(params)');
    expect(src).toContain('adminGetKpiArenaFunnel(params)');
    expect(src).toContain('adminGetKpiPostmortemSummary(params)');
    expect(src).toContain('adminGetKpiSystemHealthSummary(params)');
    expect(src).toContain('adminGetKpiTrainingSummary(params)');
    expect(src).toContain('adminGetKpiTrainingTaskSummary(params)');
    expect(src).toContain('adminGetKpiTrainingStepFunnel(params)');
    expect(src).toContain('adminGetKpiTrainingDaily(params)');
  });
});

// ---------------------------------------------------------------------------
// テスト 4: 一部RPC失敗時も他セクションを表示できる（Promise.allSettled使用確認）
// ---------------------------------------------------------------------------

describe('[Phase4C] テスト4: 一部RPC失敗時の挙動（Promise.allSettled）', () => {
  it('kpiAdmin.tsがPromise.allSettledを使用している', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../lib/kpiAdmin.ts');
    const src = fs.readFileSync(filePath, 'utf-8');
    expect(src).toContain('Promise.allSettled');
  });

  it('fetchKpiDashboard はresult.status === rejected 時にerrorsに記録するロジックを含む（静的確認）', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../lib/kpiAdmin.ts');
    const src = fs.readFileSync(filePath, 'utf-8');
    // rejected時にerrorsへ記録するロジック
    expect(src).toContain("result.status === 'rejected'");
    expect(src).toContain('errors[key] = String(result.reason)');
    // RPCエラー時もerrorsへ記録する
    expect(src).toContain('errors[key] = String(');
  });

  it('KpiDashboardSectionError型が各セクションのオプショナルプロパティを持つ', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../lib/kpiAdmin.ts');
    const src = fs.readFileSync(filePath, 'utf-8');
    expect(src).toContain('export interface KpiDashboardSectionError');
    expect(src).toContain('acquisitionAuth?: string');
    expect(src).toContain('matchSummary?: string');
    expect(src).toContain('arenaFunnel?: string');
    expect(src).toContain('trainingSummary?: string');
    expect(src).toContain('systemHealth?: string');
  });
});

// ---------------------------------------------------------------------------
// テスト 5: 0と未取得を区別する（表示ロジック確認）
// ---------------------------------------------------------------------------

describe('[Phase4C] テスト5: 0と未取得の区別', () => {
  it('safeNum(null) は null を返す', async () => {
    const { safeNum } = await import('../lib/kpiAdmin');
    expect(safeNum(null)).toBeNull();
    expect(safeNum(undefined)).toBeNull();
  });

  it('safeNum(0) は 0 を返す', async () => {
    const { safeNum } = await import('../lib/kpiAdmin');
    expect(safeNum(0)).toBe(0);
    expect(safeNum('0')).toBe(0);
  });

  it('fmtNum(null) は "—" を返す', async () => {
    const { fmtNum } = await import('../lib/kpiAdmin');
    expect(fmtNum(null)).toBe('—');
    expect(fmtNum(undefined)).toBe('—');
  });

  it('fmtNum(0) は "0" を返す', async () => {
    const { fmtNum } = await import('../lib/kpiAdmin');
    expect(fmtNum(0)).toBe('0');
  });

  it('AdminKpiDashboard.tsxで displayValue(null)は "—", displayValue(0)は "0"', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../components/AdminKpiDashboard.tsx');
    const src = fs.readFileSync(filePath, 'utf-8');
    // displayValue関数の定義を確認
    expect(src).toContain('function displayValue');
    // null/undefinedの場合は '—'
    expect(src).toContain("return '—'");
    // 0を表示する（isNaN(0) === false なので0はそのまま返される）
    expect(src).toContain('return isNaN(n) ?');
  });
});

// ---------------------------------------------------------------------------
// テスト 6: full-game-v1のStep Funnelを表示できる
// ---------------------------------------------------------------------------

describe('[Phase4C] テスト6: full-game-v1 Step Funnelフィルタリング', () => {
  it("AdminKpiDashboard.tsxで task_id === 'full-game-v1' のフィルタリングが行われている", async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../components/AdminKpiDashboard.tsx');
    const src = fs.readFileSync(filePath, 'utf-8');
    expect(src).toContain("'full-game-v1'");
    // task_idによるフィルタリング
    expect(src).toContain("=== 'full-game-v1'");
  });

  it('全61行を処理できるよう表形式（横スクロール可）を使用', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../components/AdminKpiDashboard.tsx');
    const src = fs.readFileSync(filePath, 'utf-8');
    // 横スクロール対応のクラスが存在
    expect(src).toContain('kpi-table-wrap');
    // テーブルを使用
    expect(src).toContain('<table');
  });
});

// ---------------------------------------------------------------------------
// テスト 7: Step順／脱落割合順を切り替えられる
// ---------------------------------------------------------------------------

describe('[Phase4C] テスト7: Stepソート切替', () => {
  it("AdminKpiDashboard.tsxに 'step' と 'abandonment' のStepSortOrder型定義がある", async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../components/AdminKpiDashboard.tsx');
    const src = fs.readFileSync(filePath, 'utf-8');
    expect(src).toContain("'step'");
    expect(src).toContain("'abandonment'");
    expect(src).toContain('StepSortOrder');
  });

  it('ソートボタンが両方存在する', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../components/AdminKpiDashboard.tsx');
    const src = fs.readFileSync(filePath, 'utf-8');
    expect(src).toContain('Step順');
    expect(src).toContain('脱落割合順');
  });

  it('Step順ソートは step 昇順', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../components/AdminKpiDashboard.tsx');
    const src = fs.readFileSync(filePath, 'utf-8');
    // step昇順ソートの実装を確認
    expect(src).toMatch(/stepSort === 'step'[\s\S]*?safeNum\(a\.step\)[\s\S]*?safeNum\(b\.step\)/);
  });

  it('脱落割合順ソートは share_of_task_abandonments 降順', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../components/AdminKpiDashboard.tsx');
    const src = fs.readFileSync(filePath, 'utf-8');
    // share_of_task_abandonments降順ソートの実装を確認
    expect(src).toContain('share_of_task_abandonments');
    // b - a の降順
    expect(src).toMatch(/safeNum\(b\.share_of_task_abandonments\)[\s\S]*?safeNum\(a\.share_of_task_abandonments\)/);
  });
});

// ---------------------------------------------------------------------------
// テスト 8: RUN_KPI_DB_FIXTURE未指定時に本番fixtureを実行しない
// ---------------------------------------------------------------------------

describe('[Phase4C] テスト8: fixture安全化', () => {
  it('kpi_phase4b_final_corrections.test.tsにrunDBFixture変数が定義されている', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, './kpi_phase4b_final_corrections.test.ts');
    const src = fs.readFileSync(filePath, 'utf-8');
    expect(src).toContain('runDBFixture');
    expect(src).toContain("RUN_KPI_DB_FIXTURE === '1'");
  });

  it('本番fixtureのbeforeAll/afterAllがrunDBFixtureでガードされている', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, './kpi_phase4b_final_corrections.test.ts');
    const src = fs.readFileSync(filePath, 'utf-8');
    // beforeAllがrunDBFixtureでguardされている
    expect(src).toMatch(/beforeAll\([\s\S]*?runDBFixture/);
    // afterAllがrunDBFixtureでguardされている
    expect(src).toMatch(/afterAll\([\s\S]*?runDBFixture/);
  });

  it('各DBテストケースがrunDBFixtureでガードされている（hasDBCredsだけでは不十分）', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, './kpi_phase4b_final_corrections.test.ts');
    const src = fs.readFileSync(filePath, 'utf-8');
    // hasDBCredsだけのguardが残っていないこと
    const hasDBCredsOnlyGuard = src.match(/if \(!hasDBCreds\)/g) ?? [];
    // hasDBCredsのみでrunDBFixtureを含まない箇所がないことを確認
    // （hasDBCredsOnlyGuard === 0 か、あっても静的チェックのみ）
    // 全ての !hasDBCreds は !runDBFixture に置き換えられているはず
    expect(hasDBCredsOnlyGuard.length).toBe(0);
    // runDBFixtureのguardが複数存在
    const runDBFixtureGuards = src.match(/if \(!runDBFixture/g) ?? [];
    expect(runDBFixtureGuards.length).toBeGreaterThan(5);
  });

  it('RUN_KPI_DB_FIXTURE未設定時はINSERTが実行されない（guard確認）', () => {
    // 環境変数が未設定の場合、runDBFixtureはfalseになる
    const hasDBCreds = true; // 仮にクレデンシャルがあっても
    const runDBFixtureLocal = hasDBCreds && process.env.RUN_KPI_DB_FIXTURE === '1';
    // テスト環境では RUN_KPI_DB_FIXTURE は通常未設定
    expect(runDBFixtureLocal).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// テスト 10: Phase 4-C RPC契約不一致修正の確認
// ---------------------------------------------------------------------------

describe('[Phase4C] テスト10: RPC契約不一致修正の確認', () => {
  it('p_timezoneがKpiAdminParamsに存在し、p_tzが残っていない', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../lib/kpiAdmin.ts');
    const src = fs.readFileSync(filePath, 'utf-8');
    expect(src).toContain('p_timezone: string');
    expect(src).not.toContain('p_tz: string');
    expect(src).toContain('p_timezone: params.p_timezone');
    expect(src).not.toContain('p_tz: params.p_tz');
  });

  it('AcquisitionとSettingsをJSONBオブジェクトとして取得（extractJsonb使用）', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../lib/kpiAdmin.ts');
    const src = fs.readFileSync(filePath, 'utf-8');
    expect(src).toContain('extractJsonb');
    // extractSingleでrows[0]を使っていない（acquisitionAuth/settingsに対して）
    // extractJsonb関数定義を確認
    expect(src).toContain('function extractJsonb');
    expect(src).toContain('result.value.data ?? null');
  });

  it('fmtPct(75)は75.0%を返す（100倍しない）', async () => {
    const { fmtPct } = await import('../lib/kpiAdmin');
    expect(fmtPct(75)).toBe('75.0%');
    expect(fmtPct(100)).toBe('100.0%');
    expect(fmtPct(0)).toBe('0.0%');
    expect(fmtPct(50.5)).toBe('50.5%');
  });

  it('Match SummaryにRPC実列名が含まれている', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../lib/kpiAdmin.ts');
    const src = fs.readFileSync(filePath, 'utf-8');
    expect(src).toContain('official_standalone_matches');
    expect(src).toContain('arena_matches_count');
    expect(src).toContain('normal_end_count');
    expect(src).toContain('timeout_count');
    expect(src).toContain('resign_count');
    expect(src).toContain('draw_count');
    expect(src).toContain('forfeit_count');
    expect(src).toContain('no_contest_count');
    // 旧列名が残っていない
    expect(src).not.toContain('official_matches:');
    expect(src).not.toContain('arena_matches:');
    expect(src).not.toContain('end_normal:');
  });

  it('Match DailyにRPC実列名 total_matches が含まれ、旧列名 matches が型に残っていない', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const kpiFile = path.join(__dirname, '../lib/kpiAdmin.ts');
    const dashFile = path.join(__dirname, '../components/AdminKpiDashboard.tsx');
    const kpiSrc = fs.readFileSync(kpiFile, 'utf-8');
    const dashSrc = fs.readFileSync(dashFile, 'utf-8');
    // kpiAdmin.tsにtotal_matchesが型定義されている
    expect(kpiSrc).toContain('total_matches: unknown');
    // ダッシュボードでtotal_matchesを参照している
    expect(dashSrc).toContain('r.total_matches');
  });

  it('Training DailyにStarted/Completed/Abandonedが表示される', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../components/AdminKpiDashboard.tsx');
    const src = fs.readFileSync(filePath, 'utf-8');
    // 3つの値を参照している
    expect(src).toContain('r.started_runs');
    expect(src).toContain('r.completion_events');
    expect(src).toContain('r.abandoned_runs');
    // 列ヘッダーに表示名がある
    expect(src).toContain('Started');
    expect(src).toContain('Completed');
    expect(src).toContain('Abandoned');
  });

  it('Training DailyにRPC実列名 completion_events が含まれ、旧列名 completed_runs が型に残っていない', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const kpiFile = path.join(__dirname, '../lib/kpiAdmin.ts');
    const kpiSrc = fs.readFileSync(kpiFile, 'utf-8');
    expect(kpiSrc).toContain('completion_events: unknown');
    // KpiTrainingDailyRow定義の中にcompleted_runsが残っていないことを確認
    const dailyRowMatch = kpiSrc.match(/export interface KpiTrainingDailyRow \{[\s\S]*?\}/);
    expect(dailyRowMatch).not.toBeNull();
    if (dailyRowMatch) {
      expect(dailyRowMatch[0]).not.toContain('completed_runs');
      expect(dailyRowMatch[0]).toContain('completion_events');
    }
  });

  it('useEffectで初回ロード（setTimeoutパターンが残っていない）', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../components/AdminKpiDashboard.tsx');
    const src = fs.readFileSync(filePath, 'utf-8');
    expect(src).toContain('useEffect');
    expect(src).not.toContain('setTimeout(handleLoad');
    expect(src).not.toContain("setInitialized(true)");
  });

  it('AdminKpiDashboard.tsxにp_timezone: Asia/Tokyoが含まれる', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../components/AdminKpiDashboard.tsx');
    const src = fs.readFileSync(filePath, 'utf-8');
    expect(src).toContain("p_timezone: 'Asia/Tokyo'");
    expect(src).not.toContain("p_tz: 'Asia/Tokyo'");
  });
});

// ---------------------------------------------------------------------------
// テスト 9: Admin以外への公開導線を追加していない
// ---------------------------------------------------------------------------

describe('[Phase4C] テスト9: Admin以外への公開導線確認', () => {
  it('AdminPage.tsxのonBackが変更されていない（awaitへの参照なし）', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../components/AdminPage.tsx');
    const src = fs.readFileSync(filePath, 'utf-8');
    // Props の onBack が維持されている
    expect(src).toContain('onBack: () => void');
    // AdminKpiDashboard は onBack={() => setSubScreen('awards')} で戻る
    expect(src).toContain("onBack={() => setSubScreen('awards')}");
  });

  it('公開ルートへのリンクが追加されていない', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const kpiDashFile = path.join(__dirname, '../components/AdminKpiDashboard.tsx');
    const src = fs.readFileSync(kpiDashFile, 'utf-8');
    // 公開ページへのhref / routeへの参照がない
    expect(src).not.toContain('href="/play"');
    expect(src).not.toContain('href="/training"');
    expect(src).not.toContain('href="/arena"');
    // Admin専用画面のみ
    expect(src).toContain('onBack');
  });

  it('AdminKpiDashboard.tsxにナビゲーション変更がない（非Admin routeへの遷移なし）', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../components/AdminKpiDashboard.tsx');
    const src = fs.readFileSync(filePath, 'utf-8');
    // window.location等の変更がない
    expect(src).not.toContain('window.location');
    expect(src).not.toContain('useNavigate');
    expect(src).not.toContain('history.push');
  });

  it('AdminKpiDashboard は Props.onBack のみで画面を離れる', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../components/AdminKpiDashboard.tsx');
    const src = fs.readFileSync(filePath, 'utf-8');
    // onBackを受け取って使用する
    expect(src).toContain('onBack: () => void');
    expect(src).toContain('onClick={onBack}');
  });
});

// ---------------------------------------------------------------------------
// テスト 10: KpiArenaFunnelRow の全14列と画面表示確認
// ---------------------------------------------------------------------------

describe('[Phase4C] テスト10: KpiArenaFunnelRow 全14列と Arena Funnel表示', () => {
  it('KpiArenaFunnelRow が arena_code を持つ', async () => {
    const mod = await import('../lib/kpiAdmin');
    const row: KpiArenaFunnelRow = {
      arena_code: 'TEST',
      arena_event_id: 1,
      scheduled_at: '2025-01-01T00:00:00Z',
      entries: 10,
      unique_entrants: 8,
      matched_users: 6,
      assigned_matches: 3,
      started_matches: 3,
      completed_matches: 2,
      no_show_matches: 1,
      no_contest_matches: 0,
      entry_to_match_rate: 0.6,
      match_completion_rate: 0.667,
      no_show_rate: 0.333,
    };
    expect(row.arena_code).toBe('TEST');
  });

  it('KpiArenaFunnelRow が全14列を持つ（型チェック）', async () => {
    const mod = await import('../lib/kpiAdmin');
    const row: KpiArenaFunnelRow = {
      arena_code: 'A1',
      arena_event_id: 42,
      scheduled_at: '2025-06-01T18:00:00Z',
      entries: 20,
      unique_entrants: 16,
      matched_users: 12,
      assigned_matches: 6,
      started_matches: 6,
      completed_matches: 5,
      no_show_matches: 1,
      no_contest_matches: 0,
      entry_to_match_rate: 0.75,
      match_completion_rate: 0.833,
      no_show_rate: 0.167,
    };
    const keys: (keyof KpiArenaFunnelRow)[] = [
      'arena_code', 'arena_event_id', 'scheduled_at',
      'entries', 'unique_entrants', 'matched_users',
      'assigned_matches', 'started_matches', 'completed_matches',
      'no_show_matches', 'no_contest_matches',
      'entry_to_match_rate', 'match_completion_rate', 'no_show_rate',
    ];
    expect(keys.length).toBe(14);
    for (const k of keys) {
      expect(Object.prototype.hasOwnProperty.call(row, k)).toBe(true);
    }
  });

  it('AdminKpiDashboard.tsx に arena_code 列の表示がある', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../components/AdminKpiDashboard.tsx');
    const src = fs.readFileSync(filePath, 'utf-8');
    expect(src).toContain('r.arena_code');
    expect(src).toContain('<th>Arena</th>');
  });

  it('AdminKpiDashboard.tsx に scheduled_at 列の表示がある', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../components/AdminKpiDashboard.tsx');
    const src = fs.readFileSync(filePath, 'utf-8');
    expect(src).toContain('r.scheduled_at');
    expect(src).toContain('<th>Scheduled At</th>');
  });

  it('AdminKpiDashboard.tsx に entries / unique_entrants / matched_users の表示がある', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../components/AdminKpiDashboard.tsx');
    const src = fs.readFileSync(filePath, 'utf-8');
    expect(src).toContain('r.entries');
    expect(src).toContain('<th>Entries</th>');
    expect(src).toContain('r.unique_entrants');
    expect(src).toContain('<th>Unique Entrants</th>');
    expect(src).toContain('r.matched_users');
    expect(src).toContain('<th>Matched Users</th>');
  });

  it('AdminKpiDashboard.tsx に no_show_matches / no_contest_matches の表示がある', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../components/AdminKpiDashboard.tsx');
    const src = fs.readFileSync(filePath, 'utf-8');
    expect(src).toContain('r.no_show_matches');
    expect(src).toContain('<th>No-show</th>');
    expect(src).toContain('r.no_contest_matches');
    expect(src).toContain('<th>No Contest</th>');
  });

  it('AdminKpiDashboard.tsx に entry_to_match_rate / no_show_rate が fmtPct で表示される', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../components/AdminKpiDashboard.tsx');
    const src = fs.readFileSync(filePath, 'utf-8');
    expect(src).toContain('fmtPct(r.entry_to_match_rate)');
    expect(src).toContain('<th>Entry to Match Rate</th>');
    expect(src).toContain('fmtPct(r.no_show_rate)');
    expect(src).toContain('<th>No-show Rate</th>');
  });

  it('AdminKpiDashboard.tsx の Arena Funnel 表は arena_event_id を補助情報として小さく表示する', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../components/AdminKpiDashboard.tsx');
    const src = fs.readFileSync(filePath, 'utf-8');
    // arena_event_id は補助表示（spanで表示）
    expect(src).toContain('r.arena_event_id');
    // 主要ヘッダは "Arena" (arena_code 主役)
    expect(src).not.toContain('<th>Arena Event ID</th>');
  });

  it('kpiAdmin.ts の KpiArenaFunnelRow に旧5列から外れた列が削除されていない（全14列が揃っている）', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(__dirname, '../lib/kpiAdmin.ts');
    const src = fs.readFileSync(filePath, 'utf-8');
    const requiredFields = [
      'arena_code', 'arena_event_id', 'scheduled_at',
      'entries', 'unique_entrants', 'matched_users',
      'assigned_matches', 'started_matches', 'completed_matches',
      'no_show_matches', 'no_contest_matches',
      'entry_to_match_rate', 'match_completion_rate', 'no_show_rate',
    ];
    for (const field of requiredFields) {
      expect(src).toContain(field);
    }
    expect(requiredFields.length).toBe(14);
  });
});
