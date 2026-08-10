/**
 * kpi_phase4a_final_correction.test.ts — KPI Phase 4-A Final Corrections
 *
 * A. commitSession — sessionRef 即時更新
 * B. rapid double-tap 防止 (pure simulation)
 * C. handleFinish 二重実行防止 (pure simulation)
 * D. 保存経路
 * E. Move 46 / Move 58 回帰
 * F. 既存 KPI Phase 4-A 主要アサーション
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateTrainingRunId,
  isValidUuid,
  fullGameMoveId,
  fullGameMoveIndex,
  taskMoveId,
} from '../training/trainingKpiUtils';
import { ALLOWED_KPI_EVENT_NAMES } from '../lib/kpiEvents';
import { FULL_GAME_V1 } from '../training/tasks/fullGameV1';
import {
  saveTrainingProgress,
  loadTrainingProgress,
} from '../training/trainingProgress';
import type { TrainingProgressRecord } from '../training/trainingProgress';

// ── Supabase mock ─────────────────────────────────────────────────────────────

const mockFrom = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

function makeChain(data: unknown, error: { message: string } | null = null) {
  const chain: Record<string, unknown> = {};
  chain['select'] = vi.fn().mockReturnValue(chain);
  chain['eq'] = vi.fn().mockReturnValue(chain);
  chain['single'] = vi.fn().mockResolvedValue({ data, error });
  chain['upsert'] = vi.fn().mockResolvedValue({ data: null, error });
  chain['then'] = (resolve: (v: { data: unknown; error: typeof error }) => unknown) =>
    Promise.resolve({ data, error }).then(resolve);
  return chain;
}

function makeMockStorage(): Storage {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  } as Storage;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', makeMockStorage());
});

// ── A. commitSession — sessionRef 即時更新 ────────────────────────────────────

describe('A. commitSession — sessionRef即時更新', () => {
  it('1. commitSession後のsessionRef.currentは即時更新される（React effectを待たない）', () => {
    // Pure simulation of commitSession pattern
    type Session = { stepIndex: number; status: string };
    const initialSession: Session = { stepIndex: 0, status: 'playing' };

    let _state = initialSession;
    const sessionRef = { current: initialSession };

    // commitSession: updates ref synchronously, then state setter (simulated)
    function commitSession(next: Session) {
      sessionRef.current = next;
      _state = next; // simulate setState (no re-render needed here)
    }

    const next: Session = { stepIndex: 1, status: 'playing' };
    commitSession(next);

    // Ref is updated immediately (not waiting for React re-render effect)
    expect(sessionRef.current.stepIndex).toBe(1);
  });

  it('2. commitSession後の連続呼び出しで最新stateを参照する', () => {
    type Session = { stepIndex: number; status: string; attemptCount: number };
    let _state: Session = { stepIndex: 0, status: 'playing', attemptCount: 0 };
    const sessionRef = { current: _state };

    function commitSession(next: Session) {
      sessionRef.current = next;
      _state = next;
    }

    // First commit: advance step
    commitSession({ ...sessionRef.current, stepIndex: 1 });
    // Second commit: reads from sessionRef.current (already step 1)
    const captured = sessionRef.current.stepIndex;
    commitSession({ ...sessionRef.current, attemptCount: sessionRef.current.attemptCount + 1 });

    expect(captured).toBe(1);
    expect(sessionRef.current.stepIndex).toBe(1);
    expect(sessionRef.current.attemptCount).toBe(1);
  });
});

// ── B. rapid double-tap 防止 (pure simulation) ────────────────────────────────

type SimStep = { kind: 'user_move' | 'cpu_fixed_move' };
type SimSession = {
  stepIndex: number;
  status: 'playing' | 'complete';
  attemptCount: number;
};

interface TrackedEvent {
  name: string;
  props: Record<string, unknown>;
}

function createSessionSim(initialSteps: SimStep[]) {
  const initialSession: SimSession = { stepIndex: 0, status: 'playing', attemptCount: 0 };
  const sessionRef = { current: initialSession };
  const kpiStepAttemptCountsRef = { current: new Map<number, number>() };
  const kpiTotalAttemptsRef = { current: 0 };
  const trackedEvents: TrackedEvent[] = [];

  function commitSession(next: SimSession) {
    sessionRef.current = next;
  }

  function track(name: string, props: Record<string, unknown>) {
    trackedEvents.push({ name, props });
  }

  function handleCorrectMove() {
    const sess = sessionRef.current;
    if (sess.status !== 'playing') return;
    const step = initialSteps[sess.stepIndex];
    if (!step || step.kind !== 'user_move') return;

    const stepIdx = sess.stepIndex;
    // Advance step immediately
    commitSession({ ...sess, stepIndex: sess.stepIndex + 1 });

    // Track attempt
    const attemptNum = (kpiStepAttemptCountsRef.current.get(stepIdx) ?? 0) + 1;
    kpiStepAttemptCountsRef.current.set(stepIdx, attemptNum);
    kpiTotalAttemptsRef.current += 1;
    track('training_attempted', {
      step: stepIdx,
      attempt_number: attemptNum,
      result: 'correct',
    });
  }

  function handleIncorrectMove() {
    const sess = sessionRef.current;
    if (sess.status !== 'playing') return;
    // Does NOT advance step — stay on same step
    const stepIdx = sess.stepIndex;
    commitSession({ ...sess, attemptCount: sess.attemptCount + 1 });

    const attemptNum = (kpiStepAttemptCountsRef.current.get(stepIdx) ?? 0) + 1;
    kpiStepAttemptCountsRef.current.set(stepIdx, attemptNum);
    kpiTotalAttemptsRef.current += 1;
    track('training_attempted', {
      step: stepIdx,
      attempt_number: attemptNum,
      result: 'incorrect',
    });
  }

  return { sessionRef, trackedEvents, handleCorrectMove, handleIncorrectMove, kpiStepAttemptCountsRef, kpiTotalAttemptsRef };
}

describe('B. rapid double-tap防止 (pure simulation)', () => {
  it('3. 正解操作を再描画前に2回呼んでもtraining_attemptedはstep 0に対して1件', () => {
    const steps: SimStep[] = [
      { kind: 'user_move' },
      { kind: 'user_move' },
    ];
    const sim = createSessionSim(steps);

    // Simulate double-tap: both calls happen before React re-renders
    // First call: reads step 0, advances to step 1
    sim.handleCorrectMove();
    // Second call: reads step 1 (already updated in ref), not step 0
    sim.handleCorrectMove();

    // training_attempted for step 0 should be exactly 1 event
    const step0Events = sim.trackedEvents.filter(
      (e) => e.name === 'training_attempted' && e.props['step'] === 0
    );
    expect(step0Events).toHaveLength(1);
  });

  it('4. 不正解操作を再描画前に2回呼んだ場合、attempt_numberが1,2と重複しない', () => {
    const steps: SimStep[] = [
      { kind: 'user_move' },
    ];
    const sim = createSessionSim(steps);

    // Two incorrect moves on step 0
    sim.handleIncorrectMove();
    sim.handleIncorrectMove();

    const step0Events = sim.trackedEvents.filter(
      (e) => e.name === 'training_attempted' && e.props['step'] === 0
    );
    expect(step0Events).toHaveLength(2);
    // attempt_numbers should be 1, 2 (not duplicate 1, 1)
    expect(step0Events[0]?.props['attempt_number']).toBe(1);
    expect(step0Events[1]?.props['attempt_number']).toBe(2);
  });

  it('5. step advance直後の旧step操作は無視される（sessionRef.currentが新stepを指す）', () => {
    // Step 0 = user_move, Step 1 = cpu_fixed_move
    const steps: SimStep[] = [
      { kind: 'user_move' },
      { kind: 'cpu_fixed_move' },
    ];
    const sim = createSessionSim(steps);

    // First correct move: step 0 → step 1
    sim.handleCorrectMove();
    // Second call: step 1 is cpu_fixed_move → handler returns early (kind check)
    sim.handleCorrectMove();

    // Only 1 training_attempted event total
    expect(sim.trackedEvents.filter((e) => e.name === 'training_attempted')).toHaveLength(1);
  });
});

// ── C. handleFinish 二重実行防止 (pure simulation) ────────────────────────────

function makeHandleFinish(deps: {
  track: (name: string, props: unknown) => void;
  markFullGameCompleted: () => void;
  saveTrainingProgress: (userId: string | null, data: unknown) => Promise<void>;
  onComplete: () => void;
}) {
  const finishInFlightRef = { current: false };
  const kpiCompletionSentRef = { current: false };
  return async function handleFinish() {
    if (finishInFlightRef.current) return;
    finishInFlightRef.current = true;
    try {
      if (!kpiCompletionSentRef.current) {
        kpiCompletionSentRef.current = true;
        deps.track('training_completed', {});
      }
      deps.markFullGameCompleted();
      await deps.saveTrainingProgress(null, {});
    } catch (err) {
      // error handled
      void err;
    } finally {
      deps.onComplete();
    }
  };
}

describe('C. handleFinish二重実行防止 (pure simulation)', () => {
  it('6. handleFinishを2回呼んでもtraining_completedは1件', async () => {
    const track = vi.fn();
    const markFullGameCompleted = vi.fn();
    const saveTrainingProgress = vi.fn().mockResolvedValue(undefined);
    const onComplete = vi.fn();

    const handleFinish = makeHandleFinish({ track, markFullGameCompleted, saveTrainingProgress, onComplete });

    await Promise.all([handleFinish(), handleFinish()]);

    const completedEvents = track.mock.calls.filter((c) => c[0] === 'training_completed');
    expect(completedEvents).toHaveLength(1);
  });

  it('7. handleFinishを2回呼んでもsaveTrainingProgressは1回呼び出し', async () => {
    const track = vi.fn();
    const markFullGameCompleted = vi.fn();
    const saveTrainingProgress = vi.fn().mockResolvedValue(undefined);
    const onComplete = vi.fn();

    const handleFinish = makeHandleFinish({ track, markFullGameCompleted, saveTrainingProgress, onComplete });

    await Promise.all([handleFinish(), handleFinish()]);

    expect(saveTrainingProgress).toHaveBeenCalledTimes(1);
  });

  it('8. handleFinishを2回呼んでもonCompleteは1回', async () => {
    const track = vi.fn();
    const markFullGameCompleted = vi.fn();
    const saveTrainingProgress = vi.fn().mockResolvedValue(undefined);
    const onComplete = vi.fn();

    const handleFinish = makeHandleFinish({ track, markFullGameCompleted, saveTrainingProgress, onComplete });

    await Promise.all([handleFinish(), handleFinish()]);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('9. saveTrainingProgressがthrowしてもonCompleteは呼ばれる（try/finally）', async () => {
    const track = vi.fn();
    const markFullGameCompleted = vi.fn();
    const saveTrainingProgress = vi.fn().mockRejectedValue(new Error('DB error'));
    const onComplete = vi.fn();

    const handleFinish = makeHandleFinish({ track, markFullGameCompleted, saveTrainingProgress, onComplete });

    await handleFinish();

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

// ── D. 保存経路 ───────────────────────────────────────────────────────────────

describe('D. 保存経路', () => {
  it('10. 未ログイン時: saveTrainingProgress(null, ...) → localStorageに保存される', async () => {
    await saveTrainingProgress(null, {
      taskId: 'full-game-v1',
      completedAt: '2026-08-10T00:00:00.000Z',
      attemptCount: 3,
      bestAttemptCount: 3,
      lastCompletedStep: 61,
    });

    const records = await loadTrainingProgress(null);
    const rec = records.find((r: TrainingProgressRecord) => r.taskId === 'full-game-v1');
    expect(rec).toBeDefined();
    expect(rec!.completedAt).toBe('2026-08-10T00:00:00.000Z');
    // Supabase was NOT called
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('11. ログイン済み: saveTrainingProgress("user-id", ...) → Supabase upsert + localStorage', async () => {
    // Mock select (no existing row) + upsert
    const selectChain = makeChain(null, { message: 'no rows' });
    const upsertChain = makeChain(null);
    mockFrom.mockReturnValueOnce(selectChain).mockReturnValueOnce(upsertChain);

    await saveTrainingProgress('user-123', {
      taskId: 'full-game-v1',
      completedAt: '2026-08-10T00:00:00.000Z',
      attemptCount: 5,
      bestAttemptCount: 5,
      lastCompletedStep: 61,
    });

    // Supabase was called
    expect(mockFrom).toHaveBeenCalledWith('training_progress');
    expect(upsertChain['upsert']).toHaveBeenCalled();

    // localStorage was also updated
    const records = await loadTrainingProgress(null);
    const rec = records.find((r: TrainingProgressRecord) => r.taskId === 'full-game-v1');
    expect(rec).toBeDefined();
  });
});

// ── E. Move 46 / Move 58 回帰 ──────────────────────────────────────────────────

describe('E. Move 46 / Move 58 回帰', () => {
  it('12. Move 46 の move_id は "move:46"', () => {
    expect(fullGameMoveId(46)).toBe('move:46');
  });

  it('13. Move 58 の move_id は "move:58"', () => {
    expect(fullGameMoveId(58)).toBe('move:58');
  });

  it('14. Move 46 step が FULL_GAME_V1 に存在する', () => {
    const step46 = FULL_GAME_V1.steps.find((s) => s.moveNumber === 46);
    expect(step46).toBeDefined();
  });

  it('15. Move 58 step が FULL_GAME_V1 に存在する', () => {
    const step58 = FULL_GAME_V1.steps.find((s) => s.moveNumber === 58);
    expect(step58).toBeDefined();
  });
});

// ── F. 既存 KPI Phase 4-A 主要アサーション ────────────────────────────────────

describe('F. 既存KPI Phase 4-A 主要アサーション', () => {
  it('16. generateTrainingRunId() は UUID v4 形式', () => {
    const id = generateTrainingRunId();
    expect(isValidUuid(id)).toBe(true);
  });

  it('17. ALLOWED_KPI_EVENT_NAMES は 27 件', () => {
    expect(ALLOWED_KPI_EVENT_NAMES.length).toBe(27);
  });

  it('18. fullGameMoveId(0) は "move:0", fullGameMoveId(60) は "move:60"', () => {
    expect(fullGameMoveId(0)).toBe('move:0');
    expect(fullGameMoveId(60)).toBe('move:60');
  });

  it('19. taskMoveId("T1_build_basics", 0) は "T1_build_basics:step:0"', () => {
    expect(taskMoveId('T1_build_basics', 0)).toBe('T1_build_basics:step:0');
  });
});
