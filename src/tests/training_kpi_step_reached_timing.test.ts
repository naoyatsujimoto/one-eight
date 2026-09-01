/**
 * training_kpi_step_reached_timing.test.ts
 *
 * KPI送信タイミング回帰テスト（commit 9d0336a 補正）
 *
 * 検証項目:
 *  1. startTask直後は training_started=1 / training_step_reached=0
 *  2. explanation途中は training_step_reached=0 のまま
 *  3. 最後のexplanationを進めた瞬間に training_step_reached=1（step=1）
 *  4. 同じstepIndexへの重複送信なし
 *  5. restart後も同じ挙動
 *  6. 直接interactive stepから始まるtaskは開始時にstep 1を1回
 *  7. cpu_fixed_moveから始まるtaskは自動進行後にstep 1を1回
 *
 * アプローチ:
 *  advanceSession ロジックを TrainingView.tsx のソースパターンで検証し、
 *  純粋関数シミュレーションで KPI 送信順序を確認する。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  countTotalUserMoves,
  countUserMovesBefore,
  taskMoveId,
  taskStep,
  taskMoveIndex,
} from '../training/trainingKpiUtils';
import type { TrainingStep } from '../training/types';

const TV_PATH = join(__dirname, '../components/TrainingView.tsx');
const tvSource = readFileSync(TV_PATH, 'utf-8');

// ---------------------------------------------------------------------------
// テスト用ミニタスク定義
// ---------------------------------------------------------------------------

/** explanation×2 → coordinate_pick×1 のシンプルなタスク */
function makeTaskWithExplanations() {
  const steps: TrainingStep[] = [
    { kind: 'explanation', labelKey: 'exp1' },
    { kind: 'explanation', labelKey: 'exp2' },
    { kind: 'coordinate_pick', targetType: 'position', target: 'A', labelKey: 'q1' },
    { kind: 'coordinate_pick', targetType: 'position', target: 'B', labelKey: 'q2' },
  ];
  return { id: 'test_task', steps };
}

/** interactive stepから始まるタスク（explanationなし） */
function makeTaskDirectInteractive() {
  const steps: TrainingStep[] = [
    { kind: 'coordinate_pick', targetType: 'position', target: 'A', labelKey: 'q1' },
    { kind: 'coordinate_pick', targetType: 'position', target: 'B', labelKey: 'q2' },
  ];
  return { id: 'test_direct', steps };
}

/** cpu_fixed_move×1 → user_move×1 のタスク */
function makeTaskCpuFirst() {
  const steps: TrainingStep[] = [
    { kind: 'cpu_fixed_move', move: { position: 'A', build: { type: 'massive', gate: 1 } } as any },
    { kind: 'user_move', expected: {} as any, labelKey: 'step1' },
  ];
  return { id: 'test_cpu_first', steps };
}

// ---------------------------------------------------------------------------
// advanceSession ロジックをミニ再現（副作用なし、KPI送信を記録）
// ---------------------------------------------------------------------------

interface KpiCall {
  event: string;
  props: Record<string, unknown>;
}

interface SimState {
  stepIndex: number;
  status: 'playing' | 'complete';
}

function simulateAdvanceSession(
  steps: TrainingStep[],
  initStepIndex: number,
  reachedSet: Set<number>,
  kpiCalls: KpiCall[],
  runId: string,
  taskId: string,
): SimState {
  let stepIndex = initStepIndex;
  let status: 'playing' | 'complete' = 'playing';

  // cpu_fixed_move を自動スキップ
  while (status === 'playing') {
    const step = steps[stepIndex];
    if (!step) {
      status = 'complete';
      break;
    }
    if (step.kind !== 'cpu_fixed_move') break;
    stepIndex += 1;
  }

  // interactive stepに到達したら training_step_reached を送信（重複なし）
  if (status === 'playing') {
    const step = steps[stepIndex];
    if (step && (step.kind === 'user_move' || step.kind === 'coordinate_pick') && !reachedSet.has(stepIndex)) {
      reachedSet.add(stepIndex);
      const totalUserMoves = countTotalUserMoves(steps);
      const userMoveIdx = countUserMovesBefore(steps, stepIndex);
      kpiCalls.push({
        event: 'training_step_reached',
        props: {
          training_run_id: runId,
          task_id: taskId,
          move_id: taskMoveId(taskId, userMoveIdx),
          move_index: taskMoveIndex(userMoveIdx),
          step: taskStep(userMoveIdx),
          total_steps: totalUserMoves,
        },
      });
    }
    // explanation stepではなにも送信しない
  }

  return { stepIndex, status };
}

function simulateStartTask(steps: TrainingStep[], taskId: string): {
  kpiCalls: KpiCall[];
  reachedSet: Set<number>;
  stepIndex: number;
} {
  const kpiCalls: KpiCall[] = [];
  const reachedSet = new Set<number>();
  const runId = 'test-run-id-00000000';

  // training_started
  kpiCalls.push({ event: 'training_started', props: { training_run_id: runId, task_id: taskId } });

  // advanceSession(makeSession) — stepIndex 0 から開始
  const state = simulateAdvanceSession(steps, 0, reachedSet, kpiCalls, runId, taskId);

  return { kpiCalls, reachedSet, stepIndex: state.stepIndex };
}

function simulateExplanationAdvance(
  steps: TrainingStep[],
  currentStepIndex: number,
  reachedSet: Set<number>,
  kpiCalls: KpiCall[],
  taskId: string,
): number {
  const runId = 'test-run-id-00000000';
  const nextIndex = currentStepIndex + 1;
  const state = simulateAdvanceSession(steps, nextIndex, reachedSet, kpiCalls, runId, taskId);
  return state.stepIndex;
}

// ---------------------------------------------------------------------------
// ソースコードパターン検証
// ---------------------------------------------------------------------------

describe('TrainingView ソースコード: startTask/handleRestart pattern', () => {
  it('startTask() が advanceSession(makeSession(task)) を呼んでいる', () => {
    expect(tvSource).toContain('commitSession(advanceSession(makeSession(task)))');
  });

  it('startTask() に training_step_reached の先行送信がない', () => {
    // startTask 関数内で直接 track('training_step_reached'... を呼ぶパターンが消えている
    // advanceSession 内の track は許容
    const startTaskBlock = tvSource.match(/function startTask[\s\S]*?setBuildState\(EMPTY_BUILD\);\s+setMode\('task'\);/)?.[0] ?? '';
    expect(startTaskBlock).toBeTruthy();
    expect(startTaskBlock).not.toContain("track('training_step_reached'");
  });

  it('handleRestart() が advanceSession(makeSession(task)) を呼んでいる', () => {
    // handleRestart（handleRestartStep ではない）にマッチ
    const restartBlock = tvSource.match(/function handleRestart\(\)[\s\S]*?setBuildState\(EMPTY_BUILD\);\s+\}/)?.[0] ?? '';
    expect(restartBlock).toBeTruthy();
    expect(restartBlock).toContain('commitSession(advanceSession(makeSession(task)))');
  });

  it('handleRestart() に training_step_reached の先行送信がない', () => {
    const restartBlock = tvSource.match(/function handleRestart\(\)[\s\S]*?setBuildState\(EMPTY_BUILD\);\s+\}/)?.[0] ?? '';
    expect(restartBlock).not.toContain("track('training_step_reached'");
  });

  it('startTask() に firstUserStep の先行登録がない', () => {
    const startTaskBlock = tvSource.match(/function startTask[\s\S]*?setBuildState\(EMPTY_BUILD\);\s+setMode\('task'\);/)?.[0] ?? '';
    expect(startTaskBlock).not.toContain('firstUserStep');
  });

  it('handleRestart() に firstUserStep の先行登録がない', () => {
    const restartBlock = tvSource.match(/function handleRestart\(\)[\s\S]*?setBuildState\(EMPTY_BUILD\);\s+\}/)?.[0] ?? '';
    expect(restartBlock).not.toContain('firstUserStep');
  });

  it('advanceSession() が explanation を到達済みとして記録しない', () => {
    // advanceSession 内の training_step_reached 送信は user_move / coordinate_pick にのみ
    const advanceBlock = tvSource.match(/function advanceSession[\s\S]*?return s;\s+\}/)?.[0] ?? '';
    expect(advanceBlock).toBeTruthy();
    expect(advanceBlock).toContain("nextStep.kind === 'user_move' || nextStep.kind === 'coordinate_pick'");
    expect(advanceBlock).not.toMatch(/nextStep\.kind === 'explanation'[\s\S]*?training_step_reached/);
  });
});

// ---------------------------------------------------------------------------
// 純粋関数シミュレーションによる KPI タイミング検証
// ---------------------------------------------------------------------------

describe('KPI タイミング: explanation から始まるタスク', () => {
  const { steps, id } = makeTaskWithExplanations();

  it('startTask直後: started=1 / reached=0', () => {
    const { kpiCalls } = simulateStartTask(steps, id);
    const started = kpiCalls.filter((c) => c.event === 'training_started').length;
    const reached = kpiCalls.filter((c) => c.event === 'training_step_reached').length;
    expect(started).toBe(1);
    expect(reached).toBe(0);
  });

  it('説明1枚目を進めた後: reached=0 のまま', () => {
    const { kpiCalls, reachedSet, stepIndex: si0 } = simulateStartTask(steps, id);
    // step 0 はexplanation → advance → step 1 もexplanation
    const si1 = simulateExplanationAdvance(steps, si0, reachedSet, kpiCalls, id);
    const reached = kpiCalls.filter((c) => c.event === 'training_step_reached').length;
    expect(si1).toBe(1); // まだexplanation (index 1)
    expect(reached).toBe(0);
  });

  it('最後のexplanation（2枚目）を進めた瞬間: reached=1 / step=1', () => {
    const { kpiCalls, reachedSet, stepIndex: si0 } = simulateStartTask(steps, id);
    // explanation 0 → advance to explanation 1
    const si1 = simulateExplanationAdvance(steps, si0, reachedSet, kpiCalls, id);
    // explanation 1 → advance to coordinate_pick 0 (interactive!)
    const si2 = simulateExplanationAdvance(steps, si1, reachedSet, kpiCalls, id);
    const reachedCalls = kpiCalls.filter((c) => c.event === 'training_step_reached');
    expect(reachedCalls.length).toBe(1);
    expect(reachedCalls[0]!.props['step']).toBe(1);
    expect(si2).toBe(2); // coordinate_pick at index 2
  });

  it('同じstepに再度advanceしても重複送信なし', () => {
    const { kpiCalls, reachedSet, stepIndex: si0 } = simulateStartTask(steps, id);
    const si1 = simulateExplanationAdvance(steps, si0, reachedSet, kpiCalls, id);
    simulateExplanationAdvance(steps, si1, reachedSet, kpiCalls, id);
    // 再度同じindexで advanceSession を呼んでも reachedSet によりスキップ
    simulateAdvanceSession(steps, 2, reachedSet, kpiCalls, 'test-run-id-00000000', id);
    const reached = kpiCalls.filter((c) => c.event === 'training_step_reached').length;
    expect(reached).toBe(1);
  });

  it('restart後も同じ挙動: started=2 / reached=0（説明中）', () => {
    const { kpiCalls, reachedSet: _rs } = simulateStartTask(steps, id);
    // restart: 新しい reachedSet でやり直し
    const kpiCalls2: KpiCall[] = [];
    const reachedSet2 = new Set<number>();
    kpiCalls2.push({ event: 'training_started', props: { training_run_id: 'run-2', task_id: id } });
    simulateAdvanceSession(steps, 0, reachedSet2, kpiCalls2, 'run-2', id);
    const allCalls = [...kpiCalls, ...kpiCalls2];
    const started = allCalls.filter((c) => c.event === 'training_started').length;
    const reached = allCalls.filter((c) => c.event === 'training_step_reached').length;
    expect(started).toBe(2);
    expect(reached).toBe(0);
  });
});

describe('KPI タイミング: 直接interactiveから始まるタスク', () => {
  const { steps, id } = makeTaskDirectInteractive();

  it('startTask直後: started=1 / reached=1（step=1）', () => {
    const { kpiCalls } = simulateStartTask(steps, id);
    const started = kpiCalls.filter((c) => c.event === 'training_started').length;
    const reached = kpiCalls.filter((c) => c.event === 'training_step_reached').length;
    expect(started).toBe(1);
    expect(reached).toBe(1);
    expect(kpiCalls.find((c) => c.event === 'training_step_reached')?.props['step']).toBe(1);
  });

  it('restart後も直後にreached=1', () => {
    const kpiCalls: KpiCall[] = [];
    const reachedSet = new Set<number>();
    kpiCalls.push({ event: 'training_started', props: {} });
    simulateAdvanceSession(steps, 0, reachedSet, kpiCalls, 'run-1', id);
    const reached = kpiCalls.filter((c) => c.event === 'training_step_reached').length;
    expect(reached).toBe(1);
  });
});

describe('KPI タイミング: cpu_fixed_moveから始まるタスク', () => {
  const { steps, id } = makeTaskCpuFirst();

  it('startTask直後（cpu自動適用後）: started=1 / reached=1（step=1）', () => {
    const { kpiCalls } = simulateStartTask(steps, id);
    const started = kpiCalls.filter((c) => c.event === 'training_started').length;
    const reached = kpiCalls.filter((c) => c.event === 'training_step_reached').length;
    expect(started).toBe(1);
    expect(reached).toBe(1);
    expect(kpiCalls.find((c) => c.event === 'training_step_reached')?.props['step']).toBe(1);
  });
});
