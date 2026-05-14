/**
 * sim_position_only_fallback.test.ts
 *
 * sim_position_only_stats fallback chain の統合テスト
 *
 * テスト内容:
 * 1. fetchSimPositionOnlyWinRates が sim_position_only_stats を参照できること（mock）
 * 2. total < 100 の場合は fallback しないこと
 * 3. total >= 100 の場合、blend = 0.1 × posWP + 0.9 × staticWP であること
 * 4. winRateSource が 'sim_position_only' になること
 * 5. position_only_id = medium_pattern_id.split(':')[0] であること
 * 6. sim_medium_pattern が存在する場合は sim_position_only より優先されること
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
  fetchSimPositionOnlyWinRates: vi.fn(),
}));

import {
  fetchSimMediumPatternWinRates,
  fetchSimPositionOnlyWinRates,
} from '../game/positionStats';

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

// ─── テスト ────────────────────────────────────────────────────────────────────

describe('sim_position_only_fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchSimMediumPattern.mockResolvedValue(new Map());
    mockFetchSimPositionOnly.mockResolvedValue(new Map());
  });

  // 1. fetchSimPositionOnlyWinRates が呼ばれること
  it('fetchSimPositionOnlyWinRates が medium_pattern_id の part1 をキーに呼ばれること', async () => {
    const mediumPatternId = 'abcdef1234567890:0012';
    const positionOnlyId  = 'abcdef1234567890';

    mockFetchSimPositionOnly.mockResolvedValue(new Map([
      [positionOnlyId, {
        position_only_id: positionOnlyId,
        wins_black: 60, wins_white: 40, draws: 0,
        total: 100, win_rate_black: 0.6, win_rate_white: 0.4,
        sim_policy: 'easy_vs_easy',
      }],
    ]));

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{ mediumPatternId }]);
    await enrichPostmortemWithStats(result, history);

    expect(mockFetchSimPositionOnly).toHaveBeenCalledWith(
      expect.arrayContaining([positionOnlyId]),
      100,
    );
  });

  // 2. total < 100 の場合は fallback しないこと（static に落ちる）
  it('total < 100 の場合は sim_position_only fallback を使わず static になること', async () => {
    const mediumPatternId = 'abcdef1234567890:0012';
    const positionOnlyId  = 'abcdef1234567890';

    // total=50 → 閾値未満
    mockFetchSimPositionOnly.mockResolvedValue(new Map([
      [positionOnlyId, {
        position_only_id: positionOnlyId,
        wins_black: 30, wins_white: 20, draws: 0,
        total: 50, win_rate_black: 0.6, win_rate_white: 0.4,
        sim_policy: 'easy_vs_easy',
      }],
    ]));

    const result = makeResult(1, [0.55]);
    const history = makeHistory([{ mediumPatternId }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    const row = enriched.rows[0]!;
    expect(row.winRateSource).toBeUndefined();
    expect(row.resolvedWpSource).toBe('static');
    expect(row.resolvedWP).toBeCloseTo(0.55);
  });

  // 3. total >= 100 の場合、blend = 0.1 × posWP + 0.9 × staticWP
  it('total >= 100 の場合、blend = 0.1 × posWP + 0.9 × staticWP になること', async () => {
    const mediumPatternId = 'abcdef1234567890:0012';
    const positionOnlyId  = 'abcdef1234567890';
    const posWP = 0.7;  // win_rate_black (0–1 scale)
    const staticWP = 0.5;

    mockFetchSimPositionOnly.mockResolvedValue(new Map([
      [positionOnlyId, {
        position_only_id: positionOnlyId,
        wins_black: 70, wins_white: 30, draws: 0,
        total: 100, win_rate_black: posWP, win_rate_white: 1 - posWP,
        sim_policy: 'easy_vs_easy',
      }],
    ]));

    const result = makeResult(1, [staticWP]);
    const history = makeHistory([{ mediumPatternId }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    const row = enriched.rows[0]!;
    const expectedWP = 0.1 * posWP + 0.9 * staticWP;
    expect(row.resolvedWP).toBeCloseTo(expectedWP, 5);
    expect(row.resolvedWpSource).toBe('blend');
  });

  // 4. winRateSource が 'sim_position_only' になること
  it('sim_position_only fallback 使用時に winRateSource が sim_position_only になること', async () => {
    const mediumPatternId = 'abcdef1234567890:0012';
    const positionOnlyId  = 'abcdef1234567890';

    mockFetchSimPositionOnly.mockResolvedValue(new Map([
      [positionOnlyId, {
        position_only_id: positionOnlyId,
        wins_black: 60, wins_white: 40, draws: 0,
        total: 150, win_rate_black: 0.6, win_rate_white: 0.4,
        sim_policy: 'easy_vs_easy',
      }],
    ]));

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{ mediumPatternId }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    const row = enriched.rows[0]!;
    expect(row.winRateSource).toBe('sim_position_only');
    expect(row.sampleCount).toBe(150);
    expect(row.confidence).toBe('reference');
  });

  // 5. position_only_id = medium_pattern_id.split(':')[0]
  it('position_only_id が medium_pattern_id の ":" より前の部分であること', async () => {
    const part1 = 'abcdef1234567890';
    const part2 = '0021';
    const mediumPatternId = `${part1}:${part2}`;

    const capturedIds: string[] = [];
    mockFetchSimPositionOnly.mockImplementation(async (ids: string[]) => {
      capturedIds.push(...ids);
      return new Map();
    });

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{ mediumPatternId }]);
    await enrichPostmortemWithStats(result, history);

    expect(capturedIds).toContain(part1);
    expect(capturedIds).not.toContain(part2);
    expect(capturedIds.every((id: string) => !id.includes(':'))).toBe(true);
  });

  // 6. sim_medium_pattern が存在する場合は sim_position_only より優先されること
  it('sim_medium_pattern が total>=30 なら sim_position_only より優先されること', async () => {
    const mediumPatternId = 'abcdef1234567890:0012';
    const positionOnlyId  = 'abcdef1234567890';

    // sim_medium_pattern: total=50 (>= 30) が存在
    mockFetchSimMediumPattern.mockResolvedValue(new Map([
      [mediumPatternId, {
        medium_pattern_id: mediumPatternId,
        wins_black: 30, wins_white: 20, draws: 0,
        total: 50, win_rate_black: 60, // 0-100スケール
        sim_policy: 'easy_vs_easy',
      }],
    ]));

    // sim_position_only: total=200 が存在（より多いが優先されない）
    mockFetchSimPositionOnly.mockResolvedValue(new Map([
      [positionOnlyId, {
        position_only_id: positionOnlyId,
        wins_black: 120, wins_white: 80, draws: 0,
        total: 200, win_rate_black: 0.6, win_rate_white: 0.4,
        sim_policy: 'easy_vs_easy',
      }],
    ]));

    const result = makeResult(1, [0.5]);
    const history = makeHistory([{ mediumPatternId }]);
    const enriched = await enrichPostmortemWithStats(result, history);

    const row = enriched.rows[0]!;
    // sim_medium_pattern が優先されるべき
    expect(row.winRateSource).toBe('sim_medium_pattern');
  });
});
