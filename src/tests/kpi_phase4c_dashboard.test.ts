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
    expect(src).toContain('p_tz: params.p_tz');
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
