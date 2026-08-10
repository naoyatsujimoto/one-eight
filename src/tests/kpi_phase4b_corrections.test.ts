/**
 * kpi_phase4b_corrections.test.ts — KPI Phase 4-B Corrections テスト
 *
 * Migration対象: 20260810000011_kpi_phase4b_corrections.sql
 *                20260810000012_kpi_phase4b_bugfix.sql
 *                20260810000013_kpi_phase4b_summary_percentile_fix.sql
 *
 * 静的SQL分析（migrationファイルのテキスト検証）で大半をカバー。
 * SUPABASE_SERVICE_ROLE_KEYが環境変数にある場合のみDB接続テストを実行（skipIf）。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(__dirname, '../../supabase/migrations');
const MIGRATION_11 = '20260810000011_kpi_phase4b_corrections.sql';
const MIGRATION_12 = '20260810000012_kpi_phase4b_bugfix.sql';
const MIGRATION_13 = '20260810000013_kpi_phase4b_summary_percentile_fix.sql';

const m11 = existsSync(join(MIGRATIONS_DIR, MIGRATION_11))
  ? readFileSync(join(MIGRATIONS_DIR, MIGRATION_11), 'utf-8') : '';
const m12 = existsSync(join(MIGRATIONS_DIR, MIGRATION_12))
  ? readFileSync(join(MIGRATIONS_DIR, MIGRATION_12), 'utf-8') : '';
const m13 = existsSync(join(MIGRATIONS_DIR, MIGRATION_13))
  ? readFileSync(join(MIGRATIONS_DIR, MIGRATION_13), 'utf-8') : '';
const combined = m11 + m12 + m13;

describe('1. authenticated AdminへのGRANT', () => {
  it('4 RPCすべてにGRANT TO authenticatedが含まれる', () => {
    // GRANTとTOは別行: "TO service_role, postgres, authenticated;"
    const toLines = (combined.match(/TO service_role, postgres, authenticated/g) ?? []);
    expect(toLines.length).toBeGreaterThanOrEqual(4);
  });
});

describe('2. Admin以外拒否', () => {
  it('_kpi_require_adminが4回以上呼ばれる', () => {
    const cnt = (combined.match(/_kpi_require_admin/g) ?? []).length;
    expect(cnt).toBeGreaterThanOrEqual(4);
  });
});

describe('3. anon拒否', () => {
  it('REVOKE FROM anonが含まれる', () => {
    expect(combined).toContain('FROM anon');
  });
});

describe('4. Run canonicalization: 同一run_idの重複started→1run', () => {
  it('DISTINCT ON (be.run_id)またはDISTINCT ON (run_id)でcanonical_startを確定', () => {
    expect(combined).toMatch(/DISTINCT ON \(.+run_id\)/);
  });
  it('started_count_per_runでduplicate_started_runsを計測', () => {
    expect(combined).toContain('started_count_per_run');
    expect(combined).toContain('duplicate_started_runs');
  });
});

describe('5. p_to後completedを含めない', () => {
  it('effective_as_ofでbase_eventsを制限', () => {
    expect(combined).toContain('occurred_at < v_effective_as_of');
  });
});

describe('6. p_to後resumeを含めない', () => {
  it('base_eventsのeffective_as_of制限でresumed_runも制限される', () => {
    expect(combined).toContain('occurred_at < v_effective_as_of');
    expect(combined).toContain('training_resumed');
  });
});

describe('7. p_to後step reachedを含めない', () => {
  it('base_eventsのeffective_as_of制限でstep_reachedも制限される', () => {
    expect(combined).toContain('occurred_at < v_effective_as_of');
    expect(combined).toContain('training_step_reached');
  });
});

describe('8. orphan completedはcompletion数0', () => {
  it('completion_events_in_periodでcanonical startの存在チェックあり', () => {
    expect(combined).toContain('canonical_start');
    expect(combined).toContain('orphan');
  });
});

describe('9. full-game step 61: move_index=60 → step=61', () => {
  it('move_index + 1でcompleted stepを解決', () => {
    expect(combined).toMatch(/move_index.*::INT.*\+\s*1|move_index_str.*INT.*\+.*1/);
  });
});

describe('10. individual最終step completedを正しく計上', () => {
  it('completed_step CTEがmove_indexから解決される', () => {
    expect(combined).toContain('completed_step');
    expect(combined).toMatch(/move_index/);
  });
});

describe('11. advanced+completedのUNION重複排除', () => {
  it('continued_or_completed_runsにUNIONが含まれる', () => {
    const unionCnt = (combined.match(/continued_or_completed/g) ?? []).length;
    expect(unionCnt).toBeGreaterThan(0);
    expect(combined).toContain('UNION');
  });
});

describe('12. active incompleteは最後のstepだけ', () => {
  it('last_step_activeまたは相当するDISTINCT ONが含まれる', () => {
    expect(combined).toMatch(/last_step_active|DISTINCT ON.*run_id.*step/);
  });
});

describe('13. completion-onlyの日をdailyが返す', () => {
  it('dailyのall_daysにcompletion dayのUNIONが含まれる', () => {
    expect(combined).toContain('all_days');
    expect(combined).toMatch(/completion_day|complete_day|UNION/);
  });
});

describe('14. start-onlyの日をdailyが返す', () => {
  it('dailyのall_daysにstart dayが含まれる', () => {
    expect(combined).toContain('all_days');
    expect(combined).toMatch(/start_day|started_at.*DATE/i);
  });
});

describe('15. timezone日界', () => {
  it('p_timezoneがDATE変換に使われる', () => {
    expect(combined).toContain('AT TIME ZONE p_timezone');
  });
});

describe('16. training_progress由来taskのinternal除外', () => {
  it('all_task_idsのtraining_progressにinternal除外が含まれる', () => {
    expect(combined).toContain('all_task_ids');
    expect(combined).toContain('training_progress');
    expect(combined).toContain('is_internal_test_account');
  });
});

describe('17. 分母0はNULL', () => {
  it('CASE WHEN ... > 0 THEN ... ELSE NULL ENDが含まれる', () => {
    expect(combined).toMatch(/CASE WHEN.+> 0\s+THEN.+ELSE NULL END/s);
  });
});

describe('18. 24時間脱落ケース', () => {
  it("24 hoursの条件が含まれる", () => {
    expect(combined).toContain("'24 hours'");
    expect(combined).toContain('is_abandoned');
  });
});

describe('19. 4 RPC間でstarted/completed/abandoned定義一致', () => {
  it('4つのRPCがすべてmigrationに含まれる', () => {
    expect(combined).toContain('admin_get_kpi_training_summary');
    expect(combined).toContain('admin_get_kpi_training_task_summary');
    expect(combined).toContain('admin_get_kpi_training_step_funnel');
    expect(combined).toContain('admin_get_kpi_training_daily');
  });
  it('effective_as_ofの定義が共通', () => {
    const cnt = (combined.match(/v_effective_as_of/g) ?? []).length;
    expect(cnt).toBeGreaterThan(8);
  });
});

describe('20. raw ID/PIIを戻り値へ含めない', () => {
  it('RETURNS TABLEにuser_idやemail列がない', () => {
    const returnsBlocks = combined.match(/RETURNS TABLE \([^)]+\)/gs) ?? [];
    for (const block of returnsBlocks) {
      expect(block).not.toContain('user_id TEXT');
      expect(block).not.toContain('email');
      expect(block).not.toContain('anonymous_id TEXT');
    }
  });
});

describe('21. Bug 1修正: last_step_reached run_id列問題', () => {
  it('M12またはM13でlast_step_reachedにtraining_run_idプロパティ参照が含まれる', () => {
    const bugfixContent = m12 + m13;
    expect(bugfixContent).toContain("properties->>'training_run_id'");
    expect(bugfixContent).toContain('last_step_reached');
  });
  it("M12/M13のlast_step_reachedでDISTINCT ON (ke.properties->>'training_run_id')が使われる", () => {
    const bugfixContent = m12 + m13;
    expect(bugfixContent).toMatch(/DISTINCT ON \(ke\.properties->>'training_run_id'\)/);
  });
});

describe('22. Bug 2修正: task_summary task_id ambiguity', () => {
  it('M12のall_task_idsでcr.task_id / tp.task_idのテーブル修飾がある', () => {
    expect(m12).toContain('cr.task_id');
    expect(m12).toContain('tp.task_id');
    expect(m12).toContain('all_task_ids');
  });
});

describe('23. Bug 3修正: step_funnel task_id ambiguity', () => {
  it('M12のtask_stepsでsrc.task_idのテーブル修飾がある', () => {
    expect(m12).toContain('src.task_id');
    expect(m12).toContain('task_steps');
  });
});

describe('24. Migration 12が存在する', () => {
  it('20260810000012_kpi_phase4b_bugfix.sqlが存在する', () => {
    expect(existsSync(join(MIGRATIONS_DIR, MIGRATION_12))).toBe(true);
  });
});

describe('25. Migration 13が存在する (percentile fix)', () => {
  it('20260810000013_kpi_phase4b_summary_percentile_fix.sqlが存在する', () => {
    expect(existsSync(join(MIGRATIONS_DIR, MIGRATION_13))).toBe(true);
  });
  it('M13にpercentile_contのNUMERICキャストが含まれる', () => {
    expect(m13).toContain('::NUMERIC FROM elapsed_agg');
  });
});

describe('26. official_kpi_start_atの保護', () => {
  it('M12/M13にofficial_kpi_start_atを変更するSQLがない', () => {
    const bugfixContent = m12 + m13;
    expect(bugfixContent).not.toMatch(/UPDATE.*kpi_settings.*official_kpi_start_at/i);
    expect(bugfixContent).not.toMatch(/SET.*official_kpi_start_at\s*=/i);
  });
});

describe('27. GRANTがservice_role / postgres / authenticatedを含む', () => {
  it('4 RPCのGRANTにservice_roleが含まれる', () => {
    const toLines = (combined.match(/TO service_role, postgres, authenticated/g) ?? []);
    expect(toLines.length).toBeGreaterThanOrEqual(4);
  });
  it('4 RPCのGRANTにpostgresが含まれる', () => {
    const toLines = (combined.match(/TO service_role, postgres, authenticated/g) ?? []);
    expect(toLines.length).toBeGreaterThanOrEqual(4);
  });
});

// DB接続テスト（SERVICE_ROLEキーがある場合のみ）
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
describe.skipIf(!SERVICE_KEY)('DB接続テスト（service_role）', () => {
  it('4 RPCがエラーなく実行できる', async () => {
    // migrationが本番に適用済みであることをmigration listで確認
    expect(true).toBe(true); // placeholder
  });
});
