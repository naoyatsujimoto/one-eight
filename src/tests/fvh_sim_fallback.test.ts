/**
 * fvh_sim_fallback.test.ts
 *
 * fast very hard (fastveryhard_vs_fastveryhard) sim fallback の回帰テスト
 *
 * Fallback priority (relevant portion):
 *   1. 実戦 canonical_hash
 *   2. 実戦 medium_pattern
 *   3. 実戦 symmetry_group
 *   4. fvh_sim_medium_pattern   ← fastveryhard_vs_fastveryhard, total>=30
 *   5. fvh_sim_position_only    ← fastveryhard_vs_fastveryhard, total>=100
 *   6. fh_sim_medium_pattern    ← fast_hard_vs_fast_hard
 *   7. fh_sim_position_only     ← fast_hard_vs_fast_hard
 *   8. sim_medium_pattern       ← easy_vs_easy
 *   9. sim_position_only        ← easy_vs_easy
 *  10. static
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enrichPostmortemWithStats } from '../game/postmortem';
import type { PostmortemResult } from '../game/postmortem';
import type { MoveRecord } from '../game/types';

// positionStats モジュールをモック
vi.mock('../game/positionStats', () => ({
  fetchPositionWinRates: vi.fn().mockResolvedValue(new Map()),
  fetchSymmetryGroupWinRates: vi.fn().mockResolvedValue(new Map()),
  fetchMediumPatternWinRates: vi.fn().mockResolvedValue(new Map()),
  fetchSimMediumPatternWinRates: vi.fn().mockResolvedValue(new Map()),
  fetchSimPositionOnlyWinRates: vi.fn().mockResolvedValue(new Map()),
}));

import {
  fetchPositionWinRates,
  fetchSymmetryGroupWinRates,
  fetchMediumPatternWinRates,
  fetchSimMediumPatternWinRates,
  fetchSimPositionOnlyWinRates,
} from '../game/positionStats';

const mockFetchCanonical = fetchPositionWinRates as ReturnType<typeof vi.fn>;
const mockFetchSymmetry = fetchSymmetryGroupWinRates as ReturnType<typeof vi.fn>;
const mockFetchMediumPattern = fetchMediumPatternWinRates as ReturnType<typeof vi.fn>;
const mockFetchSimMediumPattern = fetchSimMediumPatternWinRates as ReturnType<typeof vi.fn>;
const mockFetchSimPositionOnly = fetchSimPositionOnlyWinRates as ReturnType<typeof vi.fn>;

// ─── ヘルパー ──────────────────────────────────────────────────────────────────

function makeResult(n: number, wpAfters?: number[]): PostmortemResult {
  const rows = Array.from({ length: n }, (_, i) => ({
    moveNum: i + 1,
    player: (i % 2 === 0 ? 'black' : 'white') as 'black' | 'white',
    played: `A massive(1)`,
    best: null,
    evalAfterPlayed: 0,
    evalAfterBest: null,
    loss: null,
    wpAfter: wpAfters?.[i] ?? 0.5,
    wpAfterIfBest: null,
    wpSwing: null,
  }));
  return {
    rows,
    wpInitial: 0.5,
    decisiveCrossing: null,
    crossings: [],
    topBlackLosses: [],
  };
}

function makeHistory(
  opts: Array<{
    canonicalHash?: string;
    symmetryGroupId?: string;
    mediumPatternId?: string;
  }>
): MoveRecord[] {
  return opts.map((o, i) => ({
    moveNumber: i + 1,
    player: (i % 2 === 0 ? 'black' : 'white') as 'black' | 'white',
    positioning: 'A' as import('../game/types').PositionId,
    build: { type: 'massive' as const, gate: 1 as import('../game/types').GateId, placed: 1 },
    canonical_hash: o.canonicalHash,
    symmetry_group_id: o.symmetryGroupId,
    medium_pattern_id: o.mediumPatternId,
  }));
}

/** policy別にMapを返すモック設定用ヘルパー */
function setupSimMediumMock(data: Record<string, Map<string, unknown>>): void {
  mockFetchSimMediumPattern.mockImplementation(
    (_ids: string[], _min: number, policy: string) =>
      Promise.resolve(data[policy] ?? new Map()),
  );
}

function setupSimPositionOnlyMock(data: Record<string, Map<string, unknown>>): void {
  mockFetchSimPositionOnly.mockImplementation(
    (_ids: string[], _min: number, policy: string) =>
      Promise.resolve(data[policy] ?? new Map()),
  );
}

// ─── A. policy呼び出し ─────────────────────────────────────────────────────────

describe('A. policy呼び出し', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchCanonical.mockResolvedValue(new Map());
    mockFetchSymmetry.mockResolvedValue(new Map());
    mockFetchMediumPattern.mockResolvedValue(new Map());
    mockFetchSimMediumPattern.mockResolvedValue(new Map());
    mockFetchSimPositionOnly.mockResolvedValue(new Map());
  });

  it('medium で fastveryhard_vs_fastveryhard を total>=30 で取得する', async () => {
    const result = makeResult(1);
    const history = makeHistory([{ mediumPatternId: 'pat1' }]);
    await enrichPostmortemWithStats(result, history);

    expect(mockFetchSimMediumPattern).toHaveBeenCalledWith(
      expect.arrayContaining(['pat1']),
      30,
      'fastveryhard_vs_fastveryhard',
    );
  });

  it('position only で fastveryhard_vs_fastveryhard を total>=100 で取得する', async () => {
    const mediumPatternId = 'abcdef1234567890:0012';
    const positionOnlyId  = 'abcdef1234567890';
    const result = makeResult(1);
    const history = makeHistory([{ mediumPatternId }]);
    await enrichPostmortemWithStats(result, history);

    expect(mockFetchSimPositionOnly).toHaveBeenCalledWith(
      expect.arrayContaining([positionOnlyId]),
      100,
      'fastveryhard_vs_fastveryhard',
    );
  });

  it('3つのpolicy (fvh / fh / easy) が別々に呼ばれる', async () => {
    const result = makeResult(1);
    const history = makeHistory([{ mediumPatternId: 'pat1' }]);
    await enrichPostmortemWithStats(result, history);

    const simMedCalls = mockFetchSimMediumPattern.mock.calls.map((c: unknown[]) => c[2] as string);
    expect(simMedCalls).toContain('fastveryhard_vs_fastveryhard');
    expect(simMedCalls).toContain('fast_hard_vs_fast_hard');
    expect(simMedCalls).toContain('easy_vs_easy');

    const simPosCalls = mockFetchSimPositionOnly.mock.calls.map((c: unknown[]) => c[2] as string);
    expect(simPosCalls).toContain('fastveryhard_vs_fastveryhard');
    expect(simPosCalls).toContain('fast_hard_vs_fast_hard');
    expect(simPosCalls).toContain('easy_vs_easy');
  });
});

// ─── B. fast very hard medium採用 ─────────────────────────────────────────────

describe('B. fast very hard medium採用', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchCanonical.mockResolvedValue(new Map());
    mockFetchSymmetry.mockResolvedValue(new Map());
    mockFetchMediumPattern.mockResolvedValue(new Map()); // 実戦なし
    mockFetchSimPositionOnly.mockResolvedValue(new Map());
  });

  it('実戦統計なし・fvh mediumあり → fvh_sim_medium_pattern を採用する', async () => {
    const fvhMedMap = new Map([
      ['pat1', {
        medium_pattern_id: 'pat1',
        sim_policy: 'fastveryhard_vs_fastveryhard',
        wins_black: 24, wins_white: 6, draws: 0,
        total: 30,
        win_rate_black: 80.0,
      }],
    ]);
    setupSimMediumMock({
      'fastveryhard_vs_fastveryhard': fvhMedMap,
      'fast_hard_vs_fast_hard': new Map(),
      'easy_vs_easy': new Map(),
    });

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{ mediumPatternId: 'pat1' }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    expect(enriched.rows[0]!.winRateSource).toBe('fvh_sim_medium_pattern');
    expect(enriched.rows[0]!.sampleCount).toBe(30);
    expect(enriched.rows[0]!.confidence).toBe('reference');
  });

  it('winRateSource が fvh_sim_medium_pattern になる', async () => {
    const fvhMedMap = new Map([
      ['pat1', {
        medium_pattern_id: 'pat1',
        sim_policy: 'fastveryhard_vs_fastveryhard',
        wins_black: 60, wins_white: 40, draws: 0,
        total: 100,
        win_rate_black: 60.0,
      }],
    ]);
    setupSimMediumMock({
      'fastveryhard_vs_fastveryhard': fvhMedMap,
      'fast_hard_vs_fast_hard': new Map(),
      'easy_vs_easy': new Map(),
    });

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{ mediumPatternId: 'pat1' }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    expect(enriched.rows[0]!.winRateSource).toBe('fvh_sim_medium_pattern');
  });

  it('sampleCount が正しい (total=150)', async () => {
    const fvhMedMap = new Map([
      ['pat1', {
        medium_pattern_id: 'pat1',
        sim_policy: 'fastveryhard_vs_fastveryhard',
        wins_black: 90, wins_white: 60, draws: 0,
        total: 150,
        win_rate_black: 60.0,
      }],
    ]);
    setupSimMediumMock({
      'fastveryhard_vs_fastveryhard': fvhMedMap,
      'fast_hard_vs_fast_hard': new Map(),
      'easy_vs_easy': new Map(),
    });

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{ mediumPatternId: 'pat1' }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    expect(enriched.rows[0]!.sampleCount).toBe(150);
  });

  it('confidence が reference', async () => {
    const fvhMedMap = new Map([
      ['pat1', {
        medium_pattern_id: 'pat1',
        sim_policy: 'fastveryhard_vs_fastveryhard',
        wins_black: 600, wins_white: 400, draws: 0,
        total: 1000,
        win_rate_black: 60.0,
      }],
    ]);
    setupSimMediumMock({
      'fastveryhard_vs_fastveryhard': fvhMedMap,
      'fast_hard_vs_fast_hard': new Map(),
      'easy_vs_easy': new Map(),
    });

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{ mediumPatternId: 'pat1' }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    expect(enriched.rows[0]!.confidence).toBe('reference');
  });

  it('resolvedWP が 0.2×sim + 0.8×static のblend', async () => {
    // simWP = 70% → 0.70; staticWP = 0.50
    // expected = 0.2 * 0.70 + 0.8 * 0.50 = 0.14 + 0.40 = 0.54
    const fvhMedMap = new Map([
      ['pat1', {
        medium_pattern_id: 'pat1',
        sim_policy: 'fastveryhard_vs_fastveryhard',
        wins_black: 70, wins_white: 30, draws: 0,
        total: 100,
        win_rate_black: 70.0,
      }],
    ]);
    setupSimMediumMock({
      'fastveryhard_vs_fastveryhard': fvhMedMap,
      'fast_hard_vs_fast_hard': new Map(),
      'easy_vs_easy': new Map(),
    });

    const result = makeResult(1, [0.50]);
    const history = makeHistory([{ mediumPatternId: 'pat1' }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    expect(enriched.rows[0]!.resolvedWP).toBeCloseTo(0.54, 5);
    expect(enriched.rows[0]!.resolvedWpSource).toBe('blend');
  });
});

// ─── C. fast very hard position only採用 ──────────────────────────────────────

describe('C. fast very hard position only採用', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchCanonical.mockResolvedValue(new Map());
    mockFetchSymmetry.mockResolvedValue(new Map());
    mockFetchMediumPattern.mockResolvedValue(new Map());
    mockFetchSimMediumPattern.mockResolvedValue(new Map()); // fvh medium なし
  });

  it('fvh medium なし・fvh position_only あり → fvh_sim_position_only を採用する', async () => {
    const fvhPosMap = new Map([
      ['abcdef1234', {
        position_only_id: 'abcdef1234',
        wins_black: 65, wins_white: 35, draws: 0,
        total: 100,
        win_rate_black: 0.65, win_rate_white: 0.35,
        sim_policy: 'fastveryhard_vs_fastveryhard',
      }],
    ]);
    setupSimPositionOnlyMock({
      'fastveryhard_vs_fastveryhard': fvhPosMap,
      'fast_hard_vs_fast_hard': new Map(),
      'easy_vs_easy': new Map(),
    });

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{ mediumPatternId: 'abcdef1234:0010' }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    expect(enriched.rows[0]!.winRateSource).toBe('fvh_sim_position_only');
  });

  it('winRateSource が fvh_sim_position_only になる', async () => {
    const fvhPosMap = new Map([
      ['posid1', {
        position_only_id: 'posid1',
        wins_black: 70, wins_white: 30, draws: 0,
        total: 200,
        win_rate_black: 0.7, win_rate_white: 0.3,
        sim_policy: 'fastveryhard_vs_fastveryhard',
      }],
    ]);
    setupSimPositionOnlyMock({
      'fastveryhard_vs_fastveryhard': fvhPosMap,
      'fast_hard_vs_fast_hard': new Map(),
      'easy_vs_easy': new Map(),
    });

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{ mediumPatternId: 'posid1:0020' }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    expect(enriched.rows[0]!.winRateSource).toBe('fvh_sim_position_only');
  });

  it('resolvedWP が 0.1×position + 0.9×static のblend', async () => {
    // posWP = 0.70; staticWP = 0.50
    // expected = 0.1 * 0.70 + 0.9 * 0.50 = 0.07 + 0.45 = 0.52
    const fvhPosMap = new Map([
      ['posid1', {
        position_only_id: 'posid1',
        wins_black: 70, wins_white: 30, draws: 0,
        total: 100,
        win_rate_black: 0.7, win_rate_white: 0.3,
        sim_policy: 'fastveryhard_vs_fastveryhard',
      }],
    ]);
    setupSimPositionOnlyMock({
      'fastveryhard_vs_fastveryhard': fvhPosMap,
      'fast_hard_vs_fast_hard': new Map(),
      'easy_vs_easy': new Map(),
    });

    const result = makeResult(1, [0.50]);
    const history = makeHistory([{ mediumPatternId: 'posid1:0020' }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    expect(enriched.rows[0]!.resolvedWP).toBeCloseTo(0.52, 5);
    expect(enriched.rows[0]!.resolvedWpSource).toBe('blend');
  });
});

// ─── D. 閾値 ───────────────────────────────────────────────────────────────────

describe('D. 閾値', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchCanonical.mockResolvedValue(new Map());
    mockFetchSymmetry.mockResolvedValue(new Map());
    mockFetchMediumPattern.mockResolvedValue(new Map());
  });

  it('fvh medium が total<30 なら不採用（static fallback）', async () => {
    const fvhMedMap = new Map([
      ['pat1', {
        medium_pattern_id: 'pat1',
        sim_policy: 'fastveryhard_vs_fastveryhard',
        wins_black: 17, wins_white: 12, draws: 0,
        total: 29, // < 30
        win_rate_black: 58.6,
      }],
    ]);
    setupSimMediumMock({
      'fastveryhard_vs_fastveryhard': fvhMedMap,
      'fast_hard_vs_fast_hard': new Map(),
      'easy_vs_easy': new Map(),
    });
    mockFetchSimPositionOnly.mockResolvedValue(new Map());

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{ mediumPatternId: 'pat1' }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    expect(enriched.rows[0]!.winRateSource).toBeUndefined();
    expect(enriched.rows[0]!.resolvedWpSource).toBe('static');
  });

  it('fvh position_only が total<100 なら不採用（static fallback）', async () => {
    const fvhPosMap = new Map([
      ['posid1', {
        position_only_id: 'posid1',
        wins_black: 59, wins_white: 40, draws: 0,
        total: 99, // < 100
        win_rate_black: 0.596, win_rate_white: 0.404,
        sim_policy: 'fastveryhard_vs_fastveryhard',
      }],
    ]);
    setupSimMediumMock({
      'fastveryhard_vs_fastveryhard': new Map(),
      'fast_hard_vs_fast_hard': new Map(),
      'easy_vs_easy': new Map(),
    });
    setupSimPositionOnlyMock({
      'fastveryhard_vs_fastveryhard': fvhPosMap,
      'fast_hard_vs_fast_hard': new Map(),
      'easy_vs_easy': new Map(),
    });

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{ mediumPatternId: 'posid1:0010' }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    expect(enriched.rows[0]!.winRateSource).toBeUndefined();
    expect(enriched.rows[0]!.resolvedWpSource).toBe('static');
  });
});

// ─── E. policy優先順位 ─────────────────────────────────────────────────────────

describe('E. policy優先順位', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchCanonical.mockResolvedValue(new Map());
    mockFetchSymmetry.mockResolvedValue(new Map());
    mockFetchMediumPattern.mockResolvedValue(new Map());
  });

  it('fvh mediumとfh mediumが両方ある → fvh mediumを採用', async () => {
    const fvhMedMap = new Map([
      ['pat1', {
        medium_pattern_id: 'pat1',
        sim_policy: 'fastveryhard_vs_fastveryhard',
        wins_black: 60, wins_white: 40, draws: 0,
        total: 100, win_rate_black: 60.0,
      }],
    ]);
    const fhMedMap = new Map([
      ['pat1', {
        medium_pattern_id: 'pat1',
        sim_policy: 'fast_hard_vs_fast_hard',
        wins_black: 55, wins_white: 45, draws: 0,
        total: 100, win_rate_black: 55.0,
      }],
    ]);
    setupSimMediumMock({
      'fastveryhard_vs_fastveryhard': fvhMedMap,
      'fast_hard_vs_fast_hard': fhMedMap,
      'easy_vs_easy': new Map(),
    });
    mockFetchSimPositionOnly.mockResolvedValue(new Map());

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{ mediumPatternId: 'pat1' }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    expect(enriched.rows[0]!.winRateSource).toBe('fvh_sim_medium_pattern');
  });

  it('fvh position_onlyとfh mediumが両方ある → fvh position_onlyを採用', async () => {
    const fhMedMap = new Map([
      ['pat1', {
        medium_pattern_id: 'pat1',
        sim_policy: 'fast_hard_vs_fast_hard',
        wins_black: 55, wins_white: 45, draws: 0,
        total: 100, win_rate_black: 55.0,
      }],
    ]);
    const fvhPosMap = new Map([
      ['posid1', {
        position_only_id: 'posid1',
        wins_black: 70, wins_white: 30, draws: 0,
        total: 200,
        win_rate_black: 0.7, win_rate_white: 0.3,
        sim_policy: 'fastveryhard_vs_fastveryhard',
      }],
    ]);

    // fvh medium なし、fvh position_only あり
    setupSimMediumMock({
      'fastveryhard_vs_fastveryhard': new Map(),
      'fast_hard_vs_fast_hard': fhMedMap,
      'easy_vs_easy': new Map(),
    });
    setupSimPositionOnlyMock({
      'fastveryhard_vs_fastveryhard': fvhPosMap,
      'fast_hard_vs_fast_hard': new Map(),
      'easy_vs_easy': new Map(),
    });

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{ mediumPatternId: 'posid1:0010' }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    expect(enriched.rows[0]!.winRateSource).toBe('fvh_sim_position_only');
  });

  it('fvhが閾値未満・fhが閾値以上 → fhを採用', async () => {
    const fvhMedMap = new Map([
      ['pat1', {
        medium_pattern_id: 'pat1',
        sim_policy: 'fastveryhard_vs_fastveryhard',
        wins_black: 10, wins_white: 5, draws: 0,
        total: 15, // < 30 → 不採用
        win_rate_black: 66.7,
      }],
    ]);
    const fhMedMap = new Map([
      ['pat1', {
        medium_pattern_id: 'pat1',
        sim_policy: 'fast_hard_vs_fast_hard',
        wins_black: 60, wins_white: 40, draws: 0,
        total: 100, win_rate_black: 60.0,
      }],
    ]);
    setupSimMediumMock({
      'fastveryhard_vs_fastveryhard': fvhMedMap,
      'fast_hard_vs_fast_hard': fhMedMap,
      'easy_vs_easy': new Map(),
    });
    mockFetchSimPositionOnly.mockResolvedValue(new Map());

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{ mediumPatternId: 'pat1' }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    expect(enriched.rows[0]!.winRateSource).toBe('fh_sim_medium_pattern');
  });

  it('fvh・fhが不在、easyが存在 → easyを採用', async () => {
    const easyMedMap = new Map([
      ['pat1', {
        medium_pattern_id: 'pat1',
        sim_policy: 'easy_vs_easy',
        wins_black: 50, wins_white: 50, draws: 0,
        total: 100, win_rate_black: 50.0,
      }],
    ]);
    setupSimMediumMock({
      'fastveryhard_vs_fastveryhard': new Map(),
      'fast_hard_vs_fast_hard': new Map(),
      'easy_vs_easy': easyMedMap,
    });
    mockFetchSimPositionOnly.mockResolvedValue(new Map());

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{ mediumPatternId: 'pat1' }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    expect(enriched.rows[0]!.winRateSource).toBe('sim_medium_pattern');
  });
});

// ─── F. 実戦統計優先 ───────────────────────────────────────────────────────────

describe('F. 実戦統計優先', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('実戦canonicalがあればfvhより優先される', async () => {
    const canonMap = new Map([
      ['hash1', {
        canonical_hash: 'hash1',
        wins_black: 10, wins_white: 5, draws: 0,
        total: 15, win_rate_black: 66.67, win_rate_white: 33.33,
        confidence: 'reference',
      }],
    ]);
    mockFetchCanonical.mockResolvedValue(canonMap);
    mockFetchSymmetry.mockResolvedValue(new Map());
    mockFetchMediumPattern.mockResolvedValue(new Map());

    const fvhMedMap = new Map([
      ['pat1', {
        medium_pattern_id: 'pat1',
        sim_policy: 'fastveryhard_vs_fastveryhard',
        wins_black: 80, wins_white: 20, draws: 0,
        total: 100, win_rate_black: 80.0,
      }],
    ]);
    setupSimMediumMock({
      'fastveryhard_vs_fastveryhard': fvhMedMap,
      'fast_hard_vs_fast_hard': new Map(),
      'easy_vs_easy': new Map(),
    });
    mockFetchSimPositionOnly.mockResolvedValue(new Map());

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{ canonicalHash: 'hash1', mediumPatternId: 'pat1' }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    expect(enriched.rows[0]!.winRateSource).toBe('position_stats');
  });

  it('実戦mediumがあればfvhより優先される', async () => {
    mockFetchCanonical.mockResolvedValue(new Map());
    mockFetchSymmetry.mockResolvedValue(new Map());

    const realMedMap = new Map([
      ['pat1', {
        medium_pattern_id: 'pat1',
        wins_black: 8, wins_white: 2, draws: 0,
        total: 10, win_rate_black: 80.0, win_rate_white: 20.0,
      }],
    ]);
    mockFetchMediumPattern.mockResolvedValue(realMedMap);

    const fvhMedMap = new Map([
      ['pat1', {
        medium_pattern_id: 'pat1',
        sim_policy: 'fastveryhard_vs_fastveryhard',
        wins_black: 60, wins_white: 40, draws: 0,
        total: 100, win_rate_black: 60.0,
      }],
    ]);
    setupSimMediumMock({
      'fastveryhard_vs_fastveryhard': fvhMedMap,
      'fast_hard_vs_fast_hard': new Map(),
      'easy_vs_easy': new Map(),
    });
    mockFetchSimPositionOnly.mockResolvedValue(new Map());

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{ mediumPatternId: 'pat1' }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    expect(enriched.rows[0]!.winRateSource).toBe('medium_pattern');
  });

  it('symmetryがあればfvhより優先される', async () => {
    mockFetchCanonical.mockResolvedValue(new Map());

    const symMap = new Map([
      ['group1', {
        symmetry_group_id: 'group1',
        wins_black: 10, wins_white: 5, draws: 0,
        total: 15, win_rate_black: 66.67, win_rate_white: 33.33,
        confidence: 'reference',
      }],
    ]);
    mockFetchSymmetry.mockResolvedValue(symMap);
    mockFetchMediumPattern.mockResolvedValue(new Map());

    const fvhMedMap = new Map([
      ['pat1', {
        medium_pattern_id: 'pat1',
        sim_policy: 'fastveryhard_vs_fastveryhard',
        wins_black: 80, wins_white: 20, draws: 0,
        total: 100, win_rate_black: 80.0,
      }],
    ]);
    setupSimMediumMock({
      'fastveryhard_vs_fastveryhard': fvhMedMap,
      'fast_hard_vs_fast_hard': new Map(),
      'easy_vs_easy': new Map(),
    });
    mockFetchSimPositionOnly.mockResolvedValue(new Map());

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{
      canonicalHash: 'hash1',
      symmetryGroupId: 'group1',
      mediumPatternId: 'pat1',
    }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    expect(enriched.rows[0]!.winRateSource).toBe('symmetry_group');
  });
});

// ─── G. 障害時fallback ─────────────────────────────────────────────────────────

describe('G. 障害時fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchCanonical.mockResolvedValue(new Map());
    mockFetchSymmetry.mockResolvedValue(new Map());
    mockFetchMediumPattern.mockResolvedValue(new Map());
  });

  it('fvh取得がerrorでも、Postmortem全体が失敗しない', async () => {
    // fvh のみエラー、fh と easy は正常
    const fhMedMap = new Map([
      ['pat1', {
        medium_pattern_id: 'pat1',
        sim_policy: 'fast_hard_vs_fast_hard',
        wins_black: 55, wins_white: 45, draws: 0,
        total: 100, win_rate_black: 55.0,
      }],
    ]);
    mockFetchSimMediumPattern.mockImplementation(
      (_ids: string[], _min: number, policy: string) => {
        if (policy === 'fastveryhard_vs_fastveryhard') return Promise.reject(new Error('network error'));
        if (policy === 'fast_hard_vs_fast_hard') return Promise.resolve(fhMedMap);
        return Promise.resolve(new Map());
      }
    );
    mockFetchSimPositionOnly.mockResolvedValue(new Map());

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{ mediumPatternId: 'pat1' }]);

    // エラーを投げずに完了することを確認
    const enriched = await enrichPostmortemWithStats(result, history);
    expect(enriched.rows).toHaveLength(1);
    // fvh がエラーでも fh にfallback
    expect(enriched.rows[0]!.winRateSource).toBe('fh_sim_medium_pattern');
  });

  it('fvh取得が空Mapでも、fh／easy／staticへ正常にfallback', async () => {
    setupSimMediumMock({
      'fastveryhard_vs_fastveryhard': new Map(), // 空
      'fast_hard_vs_fast_hard': new Map(),
      'easy_vs_easy': new Map(),
    });
    mockFetchSimPositionOnly.mockResolvedValue(new Map());

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{ mediumPatternId: 'pat1' }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    expect(enriched.rows).toHaveLength(1);
    expect(enriched.rows[0]!.resolvedWpSource).toBe('static');
  });

  it('fvh position_only取得がerrorでも、fh／easy／staticへfallback', async () => {
    setupSimMediumMock({
      'fastveryhard_vs_fastveryhard': new Map(),
      'fast_hard_vs_fast_hard': new Map(),
      'easy_vs_easy': new Map(),
    });
    mockFetchSimPositionOnly.mockImplementation(
      (_ids: string[], _min: number, policy: string) => {
        if (policy === 'fastveryhard_vs_fastveryhard') return Promise.reject(new Error('timeout'));
        return Promise.resolve(new Map());
      }
    );

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{ mediumPatternId: 'posid1:0010' }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    expect(enriched.rows).toHaveLength(1);
    expect(enriched.rows[0]!.resolvedWpSource).toBe('static');
  });
});

// ─── H. 既存保証 ───────────────────────────────────────────────────────────────

describe('H. 既存保証', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchCanonical.mockResolvedValue(new Map());
    mockFetchSymmetry.mockResolvedValue(new Map());
    mockFetchMediumPattern.mockResolvedValue(new Map());
    mockFetchSimMediumPattern.mockResolvedValue(new Map());
    mockFetchSimPositionOnly.mockResolvedValue(new Map());
  });

  it('candidateMoves は変更されずに保持される', async () => {
    const result = makeResult(1, [0.5]);
    result.rows[0]!.candidateMoves = [
      { rank: 1, move: 'A massive(1)', wp: 0.6, wpDiff: 0.1 },
    ];
    const history = makeHistory([{ mediumPatternId: 'pat1' }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    expect(enriched.rows[0]!.candidateMoves).toEqual([
      { rank: 1, move: 'A massive(1)', wp: 0.6, wpDiff: 0.1 },
    ]);
  });

  it('resolvedWpSource は "static" | "blend" | "historic" のいずれかを維持', async () => {
    const fvhMedMap = new Map([
      ['pat1', {
        medium_pattern_id: 'pat1',
        sim_policy: 'fastveryhard_vs_fastveryhard',
        wins_black: 60, wins_white: 40, draws: 0,
        total: 100, win_rate_black: 60.0,
      }],
    ]);
    setupSimMediumMock({
      'fastveryhard_vs_fastveryhard': fvhMedMap,
      'fast_hard_vs_fast_hard': new Map(),
      'easy_vs_easy': new Map(),
    });

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{ mediumPatternId: 'pat1' }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    const src = enriched.rows[0]!.resolvedWpSource;
    expect(['static', 'blend', 'historic']).toContain(src);
  });

  it('fh sim medium fallback の既存挙動が維持される（winRateSource=fh_sim_medium_pattern）', async () => {
    const fhMedMap = new Map([
      ['pat1', {
        medium_pattern_id: 'pat1',
        sim_policy: 'fast_hard_vs_fast_hard',
        wins_black: 55, wins_white: 45, draws: 0,
        total: 100, win_rate_black: 55.0,
      }],
    ]);
    setupSimMediumMock({
      'fastveryhard_vs_fastveryhard': new Map(),
      'fast_hard_vs_fast_hard': fhMedMap,
      'easy_vs_easy': new Map(),
    });
    mockFetchSimPositionOnly.mockResolvedValue(new Map());

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{ mediumPatternId: 'pat1' }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    expect(enriched.rows[0]!.winRateSource).toBe('fh_sim_medium_pattern');
  });

  it('fh position_only fallback の既存挙動が維持される（winRateSource=fh_sim_position_only）', async () => {
    const fhPosMap = new Map([
      ['posid1', {
        position_only_id: 'posid1',
        wins_black: 60, wins_white: 40, draws: 0,
        total: 150, win_rate_black: 0.6, win_rate_white: 0.4,
        sim_policy: 'fast_hard_vs_fast_hard',
      }],
    ]);
    setupSimMediumMock({
      'fastveryhard_vs_fastveryhard': new Map(),
      'fast_hard_vs_fast_hard': new Map(),
      'easy_vs_easy': new Map(),
    });
    setupSimPositionOnlyMock({
      'fastveryhard_vs_fastveryhard': new Map(),
      'fast_hard_vs_fast_hard': fhPosMap,
      'easy_vs_easy': new Map(),
    });

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{ mediumPatternId: 'posid1:0010' }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    expect(enriched.rows[0]!.winRateSource).toBe('fh_sim_position_only');
  });

  it('easy medium fallback の既存挙動が維持される（winRateSource=sim_medium_pattern）', async () => {
    const easyMedMap = new Map([
      ['pat1', {
        medium_pattern_id: 'pat1',
        sim_policy: 'easy_vs_easy',
        wins_black: 60, wins_white: 40, draws: 0,
        total: 100, win_rate_black: 60.0,
      }],
    ]);
    setupSimMediumMock({
      'fastveryhard_vs_fastveryhard': new Map(),
      'fast_hard_vs_fast_hard': new Map(),
      'easy_vs_easy': easyMedMap,
    });
    mockFetchSimPositionOnly.mockResolvedValue(new Map());

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{ mediumPatternId: 'pat1' }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    expect(enriched.rows[0]!.winRateSource).toBe('sim_medium_pattern');
  });

  it('easy position_only fallback の既存挙動が維持される（winRateSource=sim_position_only）', async () => {
    const easyPosMap = new Map([
      ['posid1', {
        position_only_id: 'posid1',
        wins_black: 60, wins_white: 40, draws: 0,
        total: 150, win_rate_black: 0.6, win_rate_white: 0.4,
        sim_policy: 'easy_vs_easy',
      }],
    ]);
    setupSimMediumMock({
      'fastveryhard_vs_fastveryhard': new Map(),
      'fast_hard_vs_fast_hard': new Map(),
      'easy_vs_easy': new Map(),
    });
    setupSimPositionOnlyMock({
      'fastveryhard_vs_fastveryhard': new Map(),
      'fast_hard_vs_fast_hard': new Map(),
      'easy_vs_easy': easyPosMap,
    });

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{ mediumPatternId: 'posid1:0010' }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    expect(enriched.rows[0]!.winRateSource).toBe('sim_position_only');
  });
});
