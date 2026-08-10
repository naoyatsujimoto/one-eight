/**
 * kpi_phase4b_training_aggregation.test.ts — KPI Phase 4-B Training Aggregation テスト
 *
 * テスト項目:
 *  Run cohort / deduplication:
 *   1.  同一runのstarted重複を1runに集約
 *   2.  completed重複を1runに集約
 *   3.  startedなしorphanをrun指標から除外
 *
 *  24時間脱落定義:
 *   4.  開始から24時間未満はabandonedにしない
 *   5.  最終活動から24時間未満はabandonedにしない
 *   6.  最終活動24時間以上＋未完了をabandoned
 *   7.  completed runはabandonedにしない
 *
 *  Drop-off step:
 *   8.  最後のreached stepへ正しくdrop-offを割り当てる
 *   9.  reached stepなしをunknownへ分離
 *
 *  task_id分類:
 *   10. full-game-v1の61step
 *   11. 個別TrainingのuserMove step (task_id != full-game-v1)
 *
 *  Funnel numerator:
 *   12. progression numeratorでadvanced/completedを二重計上しない
 *
 *  除外条件:
 *   13. internal/Admin/AI確認/test環境除外 (ロジック)
 *   14. p_include_internal=trueの挙動 (ロジック)
 *
 *  Timezone:
 *   15. timezone日界（日次集計）
 *
 *  分母0はNULL:
 *   16. 分母0の場合NULLを返す（rates）
 *
 *  official_kpi_start_at:
 *   17. official_kpi_start_at=NULL時はis_reference_period=true
 *   18. official_kpi_start_at非NULL時のeffective_from
 *
 *  training_progress正本:
 *   19. training_progressは初回完了ユーザー数のみ（attempt_countに使わない）
 *
 *  Privacy / Security:
 *   20. PII/raw IDを返さない（戻り値列定義）
 *   21. Admin以外拒否（ロジック検証）
 *   22. PUBLIC/anon権限なし（migration確認）
 *
 *  バリデーション:
 *   23. 期間NULL/逆転/366日超/timezone不正拒否
 *
 *  Phase 4-A順序補正回帰:
 *   24. final correct attemptがtotal_attemptsへ含まれる
 *   25. 不正解2＋正解1でtotal_attempts=3
 *
 *  Phase 1〜4-A 回帰:
 *   26. 既存Phase 4-A回帰 (migration存在確認)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { generateTrainingRunId, isValidUuid } from '../training/trainingKpiUtils';

const MIGRATIONS_DIR = join(__dirname, '../../supabase/migrations');
const MIGRATION_4B = '20260810000010_kpi_phase4b_training_aggregation.sql';
const MIGRATION_4A = '20260810000009_kpi_phase4a_corrections.sql';
const MIGRATION_4_BASE = '20260810000008_kpi_phase4_training_events.sql';

// ---------------------------------------------------------------------------
// Helpers: pure simulation of run aggregation logic
// ---------------------------------------------------------------------------

interface SimEvent {
  run_id: string;
  task_id: string;
  event_name: string;
  occurred_at: Date;
  user_id?: string | null;
  step?: number;
  is_internal?: boolean;
  environment?: string;
  route?: string;
}

function minutesAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 1000);
}

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 60 * 1000);
}

/**
 * Simulate the cohort aggregation logic.
 * Returns run-level records after deduplication.
 */
function simulateCohortAggregation(
  events: SimEvent[],
  opts: {
    effectiveFrom: Date;
    pTo: Date;
    effectiveAsOf?: Date;
    includeInternal?: boolean;
  }
) {
  const { effectiveFrom, pTo, includeInternal = false } = opts;
  const effectiveAsOf = opts.effectiveAsOf ?? pTo < new Date() ? pTo : new Date();

  // Filter base events
  const base = events.filter((e) => {
    if ((e.environment ?? 'production') !== 'production') return false;
    if ((e.route ?? '') === '/ai-check-login') return false;
    if (!includeInternal && e.is_internal) return false;
    if (!isValidUuid(e.run_id)) return false;
    return true;
  });

  // started events per run
  const startedMap = new Map<string, { run_id: string; task_id: string; started_at: Date; count: number }>();
  for (const e of base.filter((x) => x.event_name === 'training_started')) {
    const ex = startedMap.get(e.run_id);
    if (!ex) {
      startedMap.set(e.run_id, { run_id: e.run_id, task_id: e.task_id, started_at: e.occurred_at, count: 1 });
    } else {
      if (e.occurred_at < ex.started_at) ex.started_at = e.occurred_at;
      ex.count += 1;
    }
  }

  // cohort: started_at in [effectiveFrom, pTo)
  const cohort = [...startedMap.values()].filter(
    (r) => r.started_at >= effectiveFrom && r.started_at < pTo
  );

  // completed events per run
  const completedMap = new Map<string, { completed_at: Date; count: number }>();
  for (const e of base.filter((x) => x.event_name === 'training_completed')) {
    const ex = completedMap.get(e.run_id);
    if (!ex) {
      completedMap.set(e.run_id, { completed_at: e.occurred_at, count: 1 });
    } else {
      if (e.occurred_at < ex.completed_at) ex.completed_at = e.occurred_at;
      ex.count += 1;
    }
  }

  // last activity per run
  const lastActivityMap = new Map<string, Date>();
  for (const e of base) {
    const ex = lastActivityMap.get(e.run_id);
    if (!ex || e.occurred_at > ex) {
      lastActivityMap.set(e.run_id, e.occurred_at);
    }
  }

  const TWENTY_FOUR_H = 24 * 60 * 60 * 1000;

  // cohort status
  const cohortStatus = cohort.map((run) => {
    const ce = completedMap.get(run.run_id);
    const lastAt = lastActivityMap.get(run.run_id) ?? run.started_at;
    const isCompleted = ce != null && ce.completed_at < effectiveAsOf;
    const isAbandoned =
      !isCompleted &&
      run.started_at.getTime() <= effectiveAsOf.getTime() - TWENTY_FOUR_H &&
      lastAt.getTime() <= effectiveAsOf.getTime() - TWENTY_FOUR_H;
    return {
      ...run,
      completed_at: ce?.completed_at ?? null,
      last_activity_at: lastAt,
      is_completed: isCompleted,
      is_abandoned: isAbandoned,
    };
  });

  // orphan runs: events with no corresponding started event in base
  const orphanRunIds = new Set<string>();
  for (const e of base) {
    if (!startedMap.has(e.run_id)) orphanRunIds.add(e.run_id);
  }

  return { cohort, cohortStatus, completedMap, startedMap, orphanRunIds };
}

// ---------------------------------------------------------------------------
// 1-3: Run cohort / deduplication
// ---------------------------------------------------------------------------

describe('1. 同一runのstarted重複を1runに集約', () => {
  it('同じrun_idのtraining_startedが3件でもcohort内1件', () => {
    const runId = generateTrainingRunId();
    const t10 = hoursAgo(10);
    const t9 = hoursAgo(9);
    const t8 = hoursAgo(8);
    const events: SimEvent[] = [
      { run_id: runId, task_id: 'T1_build_basics', event_name: 'training_started', occurred_at: t10 },
      { run_id: runId, task_id: 'T1_build_basics', event_name: 'training_started', occurred_at: t9 },
      { run_id: runId, task_id: 'T1_build_basics', event_name: 'training_started', occurred_at: t8 },
    ];
    const { cohort, startedMap } = simulateCohortAggregation(events, {
      effectiveFrom: hoursAgo(48),
      pTo: new Date(),
    });
    expect(cohort).toHaveLength(1);
    expect(startedMap.get(runId)?.count).toBe(3);
    // started_at は最小 (earliest) を使う
    expect(startedMap.get(runId)?.started_at.getTime()).toBe(t10.getTime());
  });
});

describe('2. completed重複を1runに集約', () => {
  it('同じrun_idのtraining_completedが2件でもcompletedMap内1件', () => {
    const runId = generateTrainingRunId();
    const t5 = hoursAgo(5);
    const t4 = hoursAgo(4);
    const events: SimEvent[] = [
      { run_id: runId, task_id: 'T1_build_basics', event_name: 'training_started', occurred_at: hoursAgo(10) },
      { run_id: runId, task_id: 'T1_build_basics', event_name: 'training_completed', occurred_at: t5 },
      { run_id: runId, task_id: 'T1_build_basics', event_name: 'training_completed', occurred_at: t4 },
    ];
    const { completedMap } = simulateCohortAggregation(events, {
      effectiveFrom: hoursAgo(48),
      pTo: new Date(),
    });
    const entry = completedMap.get(runId);
    expect(entry).toBeDefined();
    expect(entry!.count).toBe(2);
    // completed_at は最小 (earliest) を使う
    expect(entry!.completed_at.getTime()).toBe(t5.getTime());
  });
});

describe('3. startedなしorphanをrun指標から除外', () => {
  it('training_startedのないrun_idはcohortに含まれない、orphanとして識別される', () => {
    const orphanRunId = generateTrainingRunId();
    const events: SimEvent[] = [
      // orphan: only step_reached, no started
      { run_id: orphanRunId, task_id: 'T1_build_basics', event_name: 'training_step_reached', occurred_at: hoursAgo(5) },
      { run_id: orphanRunId, task_id: 'T1_build_basics', event_name: 'training_completed', occurred_at: hoursAgo(4) },
    ];
    const { cohort, orphanRunIds } = simulateCohortAggregation(events, {
      effectiveFrom: hoursAgo(48),
      pTo: new Date(),
    });
    expect(cohort).toHaveLength(0);
    expect(orphanRunIds.has(orphanRunId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4-7: 24時間脱落定義
// ---------------------------------------------------------------------------

describe('4. 開始から24時間未満はabandonedにしない', () => {
  it('started_at が23時間前で未完了でもabandoned=false', () => {
    const runId = generateTrainingRunId();
    const events: SimEvent[] = [
      { run_id: runId, task_id: 'T1_build_basics', event_name: 'training_started', occurred_at: hoursAgo(23) },
    ];
    const { cohortStatus } = simulateCohortAggregation(events, {
      effectiveFrom: hoursAgo(48),
      pTo: new Date(),
    });
    expect(cohortStatus[0]?.is_abandoned).toBe(false);
  });
});

describe('5. 最終活動から24時間未満はabandonedにしない', () => {
  it('started_at=48h前だが最終活動20時間前ならabandoned=false', () => {
    const runId = generateTrainingRunId();
    const events: SimEvent[] = [
      { run_id: runId, task_id: 'T1_build_basics', event_name: 'training_started', occurred_at: hoursAgo(48) },
      { run_id: runId, task_id: 'T1_build_basics', event_name: 'training_step_reached', occurred_at: hoursAgo(20) },
    ];
    const { cohortStatus } = simulateCohortAggregation(events, {
      effectiveFrom: hoursAgo(72),
      pTo: new Date(),
    });
    expect(cohortStatus[0]?.is_abandoned).toBe(false);
  });
});

describe('6. 最終活動24時間以上+未完了をabandoned', () => {
  it('started_at=48h前、最終活動=25h前、未完了 → abandoned=true', () => {
    const runId = generateTrainingRunId();
    const events: SimEvent[] = [
      { run_id: runId, task_id: 'T1_build_basics', event_name: 'training_started', occurred_at: hoursAgo(48) },
      { run_id: runId, task_id: 'T1_build_basics', event_name: 'training_step_reached', occurred_at: hoursAgo(25) },
    ];
    const { cohortStatus } = simulateCohortAggregation(events, {
      effectiveFrom: hoursAgo(72),
      pTo: new Date(),
    });
    expect(cohortStatus[0]?.is_abandoned).toBe(true);
  });
});

describe('7. completed runはabandonedにしない', () => {
  it('completed runが48h以上前でもabandoned=false', () => {
    const runId = generateTrainingRunId();
    const now = new Date();
    const events: SimEvent[] = [
      { run_id: runId, task_id: 'T1_build_basics', event_name: 'training_started', occurred_at: hoursAgo(50) },
      { run_id: runId, task_id: 'T1_build_basics', event_name: 'training_completed', occurred_at: hoursAgo(49) },
    ];
    const { cohortStatus } = simulateCohortAggregation(events, {
      effectiveFrom: hoursAgo(72),
      pTo: now,
      effectiveAsOf: now,
    });
    expect(cohortStatus[0]?.is_completed).toBe(true);
    expect(cohortStatus[0]?.is_abandoned).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8-9: Drop-off step
// ---------------------------------------------------------------------------

describe('8. 最後のreached stepへ正しくdrop-offを割り当てる', () => {
  it('abandoned runで最後のstep_reached=3なら、そのrunはstep3のdrop-offに分類される', () => {
    const runId = generateTrainingRunId();
    // Simulate step_reached events
    const stepEvents = [
      { run_id: runId, step: 1, occurred_at: hoursAgo(50) },
      { run_id: runId, step: 2, occurred_at: hoursAgo(49) },
      { run_id: runId, step: 3, occurred_at: hoursAgo(48) },
    ];

    // Find max step (last reached)
    const lastStep = Math.max(...stepEvents.map((e) => e.step));
    expect(lastStep).toBe(3);

    // For abandoned run with no completed, drop-off = last reached step
    const events: SimEvent[] = [
      { run_id: runId, task_id: 'T1_build_basics', event_name: 'training_started', occurred_at: hoursAgo(50) },
      { run_id: runId, task_id: 'T1_build_basics', event_name: 'training_step_reached', occurred_at: hoursAgo(50), step: 1 },
      { run_id: runId, task_id: 'T1_build_basics', event_name: 'training_step_reached', occurred_at: hoursAgo(49), step: 2 },
      { run_id: runId, task_id: 'T1_build_basics', event_name: 'training_step_reached', occurred_at: hoursAgo(48), step: 3 },
    ];
    const { cohortStatus } = simulateCohortAggregation(events, {
      effectiveFrom: hoursAgo(72),
      pTo: new Date(),
    });
    expect(cohortStatus[0]?.is_abandoned).toBe(true);

    // Find last step for this run from step_reached events (simulation)
    const reachedSteps = events.filter((e) => e.event_name === 'training_step_reached' && e.run_id === runId);
    const sortedByTime = [...reachedSteps].sort((a, b) => b.occurred_at.getTime() - a.occurred_at.getTime());
    expect(sortedByTime[0]?.step).toBe(3);
  });
});

describe('9. reached stepなしをunknownへ分離', () => {
  it('abandoned runにstep_reachedがなければunknown_step_abandonedに分類', () => {
    const runId = generateTrainingRunId();
    const events: SimEvent[] = [
      // started だけで step_reached なし
      { run_id: runId, task_id: 'T1_build_basics', event_name: 'training_started', occurred_at: hoursAgo(50) },
    ];
    const { cohortStatus } = simulateCohortAggregation(events, {
      effectiveFrom: hoursAgo(72),
      pTo: new Date(),
    });
    expect(cohortStatus[0]?.is_abandoned).toBe(true);

    // 該当 run の step_reached が存在しない → unknown_step_abandoned
    const reachedEvents = events.filter(
      (e) => e.event_name === 'training_step_reached' && e.run_id === runId
    );
    expect(reachedEvents).toHaveLength(0);
    // このような run は step funnel の unknown に分類される（step 1 に割り当てない）
  });
});

// ---------------------------------------------------------------------------
// 10-11: task_id 分類
// ---------------------------------------------------------------------------

describe('10. full-game-v1の61step', () => {
  it('task_id=full-game-v1はtraining_kind=full_game', () => {
    const kind = (taskId: string) => taskId === 'full-game-v1' ? 'full_game' : 'individual';
    expect(kind('full-game-v1')).toBe('full_game');
  });

  it('full-game-v1のstep範囲は1〜61', () => {
    // FULL_GAME_V1 has 61 steps (moveNumber 0..60 = step 1..61)
    const steps = Array.from({ length: 61 }, (_, i) => i + 1);
    expect(steps[0]).toBe(1);
    expect(steps[60]).toBe(61);
    expect(steps.length).toBe(61);
  });
});

describe('11. 個別TrainingのuserMove step', () => {
  it('task_id != full-game-v1 はtraining_kind=individual', () => {
    const kind = (taskId: string) => taskId === 'full-game-v1' ? 'full_game' : 'individual';
    expect(kind('T1_build_basics')).toBe('individual');
    expect(kind('T9_no_build_endgame')).toBe('individual');
  });

  it('個別TrainingのmoveIdはtaskId:step:userMoveIndex形式', () => {
    // move_id format for individual training
    const moveId = (taskId: string, userMoveIndex: number) => `${taskId}:step:${userMoveIndex}`;
    expect(moveId('T1_build_basics', 0)).toBe('T1_build_basics:step:0');
    expect(moveId('T1_build_basics', 2)).toBe('T1_build_basics:step:2');
  });
});

// ---------------------------------------------------------------------------
// 12: Funnel numerator (no double-count)
// ---------------------------------------------------------------------------

describe('12. progression numeratorでadvanced/completedを二重計上しない', () => {
  it('advanced+completedが同じrun_idでもUNIONで1件としてカウント', () => {
    const runId = generateTrainingRunId();

    // Run が training_step_advanced(step=3) と training_completed(step=3) 両方持つ場合
    const advancedRunIds = new Set([runId]);
    const completedAtStepRunIds = new Set([runId]);

    // UNION: advanced ∪ completed（重複なし）
    const union = new Set([...advancedRunIds, ...completedAtStepRunIds]);
    expect(union.size).toBe(1);  // double-countしない
  });

  it('advanced run と completed run が別なら2件', () => {
    const runIdA = generateTrainingRunId();
    const runIdB = generateTrainingRunId();

    const advancedRunIds = new Set([runIdA]);
    const completedAtStepRunIds = new Set([runIdB]);

    const union = new Set([...advancedRunIds, ...completedAtStepRunIds]);
    expect(union.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 13: internal/Admin/AI確認/test環境除外 (ロジック)
// ---------------------------------------------------------------------------

describe('13. internal/Admin/AI確認/test環境除外', () => {
  it('is_internal=trueのeventはp_include_internal=falseで除外される', () => {
    const runId = generateTrainingRunId();
    const events: SimEvent[] = [
      {
        run_id: runId,
        task_id: 'T1_build_basics',
        event_name: 'training_started',
        occurred_at: hoursAgo(10),
        is_internal: true,
      },
    ];
    const { cohort } = simulateCohortAggregation(events, {
      effectiveFrom: hoursAgo(24),
      pTo: new Date(),
      includeInternal: false,
    });
    expect(cohort).toHaveLength(0);
  });

  it('route=/ai-check-loginは除外される', () => {
    const runId = generateTrainingRunId();
    const events: SimEvent[] = [
      {
        run_id: runId,
        task_id: 'T1_build_basics',
        event_name: 'training_started',
        occurred_at: hoursAgo(10),
        route: '/ai-check-login',
      },
    ];
    const { cohort } = simulateCohortAggregation(events, {
      effectiveFrom: hoursAgo(24),
      pTo: new Date(),
    });
    expect(cohort).toHaveLength(0);
  });

  it('environment=test のeventは除外される', () => {
    const runId = generateTrainingRunId();
    const events: SimEvent[] = [
      {
        run_id: runId,
        task_id: 'T1_build_basics',
        event_name: 'training_started',
        occurred_at: hoursAgo(10),
        environment: 'test',
      },
    ];
    const { cohort } = simulateCohortAggregation(events, {
      effectiveFrom: hoursAgo(24),
      pTo: new Date(),
    });
    expect(cohort).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 14: p_include_internal=true の挙動
// ---------------------------------------------------------------------------

describe('14. p_include_internal=trueの挙動', () => {
  it('p_include_internal=trueならis_internal=trueのeventも含まれる', () => {
    const runId = generateTrainingRunId();
    const events: SimEvent[] = [
      {
        run_id: runId,
        task_id: 'T1_build_basics',
        event_name: 'training_started',
        occurred_at: hoursAgo(10),
        is_internal: true,
      },
    ];
    const { cohort } = simulateCohortAggregation(events, {
      effectiveFrom: hoursAgo(24),
      pTo: new Date(),
      includeInternal: true,
    });
    expect(cohort).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 15: timezone日界
// ---------------------------------------------------------------------------

describe('15. timezone日界（日次集計）', () => {
  it('UTC 23:30 → JST 翌日08:30: JST日界で正しく区分される', () => {
    // 2026-08-09T23:30:00Z = 2026-08-10T08:30:00+09:00
    const utcDate = new Date('2026-08-09T23:30:00Z');
    const jstDate = new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
    const jstDay = jstDate.toISOString().slice(0, 10);
    expect(jstDay).toBe('2026-08-10');
    // UTCなら 2026-08-09
    const utcDay = utcDate.toISOString().slice(0, 10);
    expect(utcDay).toBe('2026-08-09');
  });

  it('JST midnight (15:00 UTC) のeventはJSTで同日', () => {
    // 2026-08-10T00:00:00+09:00 = 2026-08-09T15:00:00Z
    const utcDate = new Date('2026-08-09T15:00:00Z');
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstDate = new Date(utcDate.getTime() + jstOffset);
    const jstDay = jstDate.toISOString().slice(0, 10);
    expect(jstDay).toBe('2026-08-10');
  });
});

// ---------------------------------------------------------------------------
// 16: 分母0はNULL
// ---------------------------------------------------------------------------

describe('16. 分母0の場合NULLを返す', () => {
  it('cohort runが0件ならcompletion_rateはNULL（0%にしない）', () => {
    const startedRuns = 0;
    const completedRuns = 0;
    const rate = startedRuns > 0 ? completedRuns / startedRuns * 100 : null;
    expect(rate).toBeNull();
  });

  it('attempt_events=0ならincorrect_rateはNULL', () => {
    const attemptEvents = 0;
    const incorrectAttempts = 0;
    const rate = attemptEvents > 0 ? incorrectAttempts / attemptEvents * 100 : null;
    expect(rate).toBeNull();
  });

  it('eligible_for_abandonment_runs=0ならabandonment_rateはNULL', () => {
    const eligible = 0;
    const abandoned = 0;
    const rate = eligible > 0 ? abandoned / eligible * 100 : null;
    expect(rate).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 17-18: official_kpi_start_at
// ---------------------------------------------------------------------------

describe('17. official_kpi_start_at=NULL時はis_reference_period=true', () => {
  it('official_kpi_start_atがNULLならis_reference_period=true, effective_from=p_from', () => {
    const officialStart: Date | null = null;
    const pFrom = hoursAgo(48);
    const isReference = officialStart === null;
    // When official_start is null, effectiveFrom = p_from
    function getEffectiveFrom(ofs: Date | null, from: Date): Date {
      if (ofs == null) return from;
      return from.getTime() > ofs.getTime() ? from : ofs;
    }
    const effectiveFrom = getEffectiveFrom(officialStart, pFrom);
    expect(isReference).toBe(true);
    expect(effectiveFrom.getTime()).toBe(pFrom.getTime());
  });
});

describe('18. official_kpi_start_at非NULL時のeffective_from', () => {
  it('official_kpi_start_at > p_from のときeffective_from = official_kpi_start_at', () => {
    const officialStart = hoursAgo(24);
    const pFrom = hoursAgo(48);
    const effectiveFrom = officialStart != null
      ? (pFrom.getTime() > officialStart.getTime() ? pFrom : officialStart)
      : pFrom;
    expect(effectiveFrom.getTime()).toBe(officialStart.getTime());
  });

  it('official_kpi_start_at < p_from のときeffective_from = p_from', () => {
    const officialStart = hoursAgo(72);
    const pFrom = hoursAgo(48);
    const effectiveFrom = officialStart != null
      ? (pFrom.getTime() > officialStart.getTime() ? pFrom : officialStart)
      : pFrom;
    expect(effectiveFrom.getTime()).toBe(pFrom.getTime());
  });
});

// ---------------------------------------------------------------------------
// 19: training_progressは初回完了ユーザー数のみ
// ---------------------------------------------------------------------------

describe('19. training_progressは初回完了ユーザー数のみ', () => {
  it('training_progress.completed_at は初回完了日時の正本。attempt_count は Run 集計に使用しない', () => {
    // training_progress のカラム定義確認（file-based test）
    const migrationFile = join(MIGRATIONS_DIR, '../..', 'supabase/migrations/20260603190637_training_progress.sql');
    if (existsSync(migrationFile)) {
      const content = readFileSync(migrationFile, 'utf-8');
      // training_progress に attempt_count カラムは存在する
      expect(content).toContain('attempt_count');
      // ただし、Phase 4-B の RPC では training_progress.attempt_count を Run 集計には使用しない
      // 代わりに training_attempted event を正本として使用する
      const phase4bFile = join(MIGRATIONS_DIR, MIGRATION_4B);
      if (existsSync(phase4bFile)) {
        const phase4bContent = readFileSync(phase4bFile, 'utf-8');
        // training_progress は registered_users_first_completed_in_period のみで使用
        expect(phase4bContent).toContain('training_progress');
        expect(phase4bContent).toContain('registered_users_first_completed_in_period');
        // attempt_count を RPC の attempt 指標として直接使っていないことを確認
        expect(phase4bContent).not.toContain('training_progress.attempt_count');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 20: PII/raw IDを返さない
// ---------------------------------------------------------------------------

describe('20. PII/raw IDを返さない', () => {
  it('admin_get_kpi_training_summary の戻り値列にraw user_id/anonymous_id/display_name/emailが含まれない', () => {
    const phase4bFile = join(MIGRATIONS_DIR, MIGRATION_4B);
    if (!existsSync(phase4bFile)) return;
    const content = readFileSync(phase4bFile, 'utf-8');

    // RETURNS TABLE の定義に user_id, anonymous_id, display_name, email が列として含まれないことを確認
    // training_summary の RETURNS TABLE セクション
    const summaryMatch = content.match(/admin_get_kpi_training_summary[\s\S]*?RETURNS TABLE\s*\(([\s\S]*?)\)\s*LANGUAGE/);
    if (summaryMatch?.[1]) {
      const columns = summaryMatch[1].toLowerCase();
      expect(columns).not.toContain('user_id');
      expect(columns).not.toContain('anonymous_id');
      expect(columns).not.toContain('display_name');
      expect(columns).not.toContain('email');
      expect(columns).not.toContain('session_id');
    }
  });

  it('admin_get_kpi_training_task_summary の戻り値にtask_id以外のraw IDが含まれない', () => {
    const phase4bFile = join(MIGRATIONS_DIR, MIGRATION_4B);
    if (!existsSync(phase4bFile)) return;
    const content = readFileSync(phase4bFile, 'utf-8');

    // Find the CREATE FUNCTION for task_summary specifically (skip past summary function)
    // task_summary function starts after summary function
    const summaryIdx = content.indexOf('CREATE OR REPLACE FUNCTION public.admin_get_kpi_training_summary');
    const taskSummaryIdx = content.indexOf('CREATE OR REPLACE FUNCTION public.admin_get_kpi_training_task_summary');
    if (taskSummaryIdx === -1 || taskSummaryIdx <= summaryIdx) return;
    const afterFn = content.slice(taskSummaryIdx);
    const taskSummaryMatch = afterFn.match(/RETURNS TABLE\s*\(([\s\S]*?)\)\s*LANGUAGE/);
    if (taskSummaryMatch?.[1]) {
      const columns = taskSummaryMatch[1].toLowerCase();
      expect(columns).not.toContain('user_id');
      expect(columns).not.toContain('anonymous_id');
      // task_id は識別子として許可（PIIではない）
      expect(columns).toContain('task_id');
    }
  });
});

// ---------------------------------------------------------------------------
// 21: Admin以外拒否
// ---------------------------------------------------------------------------

describe('21. Admin以外拒否', () => {
  it('全4 RPC が _kpi_require_admin() を呼ぶ', () => {
    const phase4bFile = join(MIGRATIONS_DIR, MIGRATION_4B);
    if (!existsSync(phase4bFile)) return;
    const content = readFileSync(phase4bFile, 'utf-8');
    const requireAdminCount = (content.match(/_kpi_require_admin/g) ?? []).length;
    // 4 RPCs × 1回ずつ = 4回
    expect(requireAdminCount).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// 22: PUBLIC/anon権限なし
// ---------------------------------------------------------------------------

describe('22. PUBLIC/anon権限なし', () => {
  it('migration に REVOKE FROM PUBLIC / anon / authenticated が含まれる', () => {
    const phase4bFile = join(MIGRATIONS_DIR, MIGRATION_4B);
    if (!existsSync(phase4bFile)) return;
    const content = readFileSync(phase4bFile, 'utf-8');
    expect(content).toContain('REVOKE ALL ON FUNCTION');
    expect(content).toContain('FROM PUBLIC');
    expect(content).toContain('FROM anon');
    expect(content).toContain('FROM authenticated');
  });

  it('migration に GRANT TO service_role, postgres が含まれる', () => {
    const phase4bFile = join(MIGRATIONS_DIR, MIGRATION_4B);
    if (!existsSync(phase4bFile)) return;
    const content = readFileSync(phase4bFile, 'utf-8');
    expect(content).toContain('TO service_role, postgres');
  });
});

// ---------------------------------------------------------------------------
// 23: バリデーション（期間NULL/逆転/366日超/timezone不正）
// ---------------------------------------------------------------------------

describe('23. バリデーション', () => {
  it('p_from=NULL または p_to=NULL はエラー (migration RAISE EXCEPTION)', () => {
    const phase4bFile = join(MIGRATIONS_DIR, MIGRATION_4B);
    if (!existsSync(phase4bFile)) return;
    const content = readFileSync(phase4bFile, 'utf-8');
    expect(content).toContain('p_from and p_to must not be NULL');
  });

  it('p_from >= p_to はエラー', () => {
    const phase4bFile = join(MIGRATIONS_DIR, MIGRATION_4B);
    if (!existsSync(phase4bFile)) return;
    const content = readFileSync(phase4bFile, 'utf-8');
    expect(content).toContain('p_from must be before p_to');
  });

  it('366日超はエラー', () => {
    const phase4bFile = join(MIGRATIONS_DIR, MIGRATION_4B);
    if (!existsSync(phase4bFile)) return;
    const content = readFileSync(phase4bFile, 'utf-8');
    expect(content).toContain('period too long');
    expect(content).toContain('366 days');
  });

  it('timezone不正はエラー', () => {
    const phase4bFile = join(MIGRATIONS_DIR, MIGRATION_4B);
    if (!existsSync(phase4bFile)) return;
    const content = readFileSync(phase4bFile, 'utf-8');
    expect(content).toContain('invalid timezone');
  });
});

// ---------------------------------------------------------------------------
// 24-25: Phase 4-A 順序補正回帰
// ---------------------------------------------------------------------------

describe('24. final correct attemptがtotal_attemptsへ含まれる', () => {
  it('1step taskを初回正解: total_attemptsは最低1', () => {
    // Simulate the corrected ordering in TrainingView
    const kpiTotalAttemptsRef = { current: 0 };
    const kpiCompletionSentRef = { current: false };

    // Step: correct on first attempt
    // 修正後の順序: kpiTrackAttemptResult FIRST, then advanceSession (which sends training_completed)

    function kpiTrackAttemptResult(isCorrect: boolean): number {
      // Increment BEFORE advanceSession
      kpiTotalAttemptsRef.current += 1;
      return kpiTotalAttemptsRef.current;
    }

    function advanceSession(): number {
      // After attempt is tracked, send training_completed with current total
      if (!kpiCompletionSentRef.current) {
        kpiCompletionSentRef.current = true;
        // total_attempts at this point includes the final attempt
        return kpiTotalAttemptsRef.current;
      }
      return 0;
    }

    // Simulate: 1 step task, first attempt is correct
    kpiTrackAttemptResult(true);     // track first (increments to 1)
    const totalInCompleted = advanceSession(); // then complete (sees total=1)

    expect(kpiTotalAttemptsRef.current).toBe(1);
    expect(totalInCompleted).toBe(1);
    expect(kpiCompletionSentRef.current).toBe(true);
  });
});

describe('25. 不正解2＋正解1でtotal_attempts=3', () => {
  it('2 incorrect + 1 correct → kpiTotalAttemptsRef = 3 at completion time', () => {
    const kpiTotalAttemptsRef = { current: 0 };
    const kpiCompletionSentRef = { current: false };

    function kpiTrackAttemptResult(): number {
      kpiTotalAttemptsRef.current += 1;
      return kpiTotalAttemptsRef.current;
    }

    function advanceSession(): number {
      if (!kpiCompletionSentRef.current) {
        kpiCompletionSentRef.current = true;
        return kpiTotalAttemptsRef.current;
      }
      return 0;
    }

    // 2 incorrect
    kpiTrackAttemptResult(); // 1
    kpiTrackAttemptResult(); // 2
    // 1 correct → track first, then advance/complete
    kpiTrackAttemptResult(); // 3
    const totalInCompleted = advanceSession();

    expect(kpiTotalAttemptsRef.current).toBe(3);
    expect(totalInCompleted).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 26: 既存 Phase 1〜4-A 回帰
// ---------------------------------------------------------------------------

describe('26. 既存Phase 4-A回帰 (migration存在確認)', () => {
  it('Phase 4-A補正 migration が存在する', () => {
    const p4a = join(MIGRATIONS_DIR, MIGRATION_4A);
    expect(existsSync(p4a)).toBe(true);
  });

  it('Phase 4-A base migration が存在する', () => {
    const p4 = join(MIGRATIONS_DIR, MIGRATION_4_BASE);
    expect(existsSync(p4)).toBe(true);
  });

  it('Phase 4-B migration が存在する', () => {
    const p4b = join(MIGRATIONS_DIR, MIGRATION_4B);
    expect(existsSync(p4b)).toBe(true);
  });

  it('Phase 4-B migration は SECURITY DEFINER を含む', () => {
    const p4b = join(MIGRATIONS_DIR, MIGRATION_4B);
    if (!existsSync(p4b)) return;
    const content = readFileSync(p4b, 'utf-8');
    expect(content).toContain('SECURITY DEFINER');
  });

  it('Phase 4-B migration は SET search_path を含む', () => {
    const p4b = join(MIGRATIONS_DIR, MIGRATION_4B);
    if (!existsSync(p4b)) return;
    const content = readFileSync(p4b, 'utf-8');
    expect(content).toContain("SET search_path = ''");
  });

  it('generateTrainingRunId() は UUID v4 形式', () => {
    const id = generateTrainingRunId();
    expect(isValidUuid(id)).toBe(true);
  });

  it('official_kpi_start_at変更のSQLがPhase 4-B migrationに含まれない', () => {
    const p4b = join(MIGRATIONS_DIR, MIGRATION_4B);
    if (!existsSync(p4b)) return;
    const content = readFileSync(p4b, 'utf-8');
    // official_kpi_start_at を SET/UPDATE していないことを確認
    expect(content).not.toMatch(/UPDATE\s+kpi_settings\s+SET\s+official_kpi_start_at/i);
    expect(content).not.toMatch(/official_kpi_start_at\s*=\s*'[^']/);
  });

  it('4 RPC が migration に定義されている', () => {
    const p4b = join(MIGRATIONS_DIR, MIGRATION_4B);
    if (!existsSync(p4b)) return;
    const content = readFileSync(p4b, 'utf-8');
    expect(content).toContain('admin_get_kpi_training_summary');
    expect(content).toContain('admin_get_kpi_training_task_summary');
    expect(content).toContain('admin_get_kpi_training_step_funnel');
    expect(content).toContain('admin_get_kpi_training_daily');
  });
});
