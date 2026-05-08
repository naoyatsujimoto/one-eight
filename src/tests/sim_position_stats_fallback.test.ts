/**
 * sim_position_stats_fallback.test.ts
 *
 * sim_easy fallback (Step 2.5) の単体テスト
 * - vi.mock で positionStats モジュール全体をモック
 * - enrichPostmortemWithStats の fallback chain を検証
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enrichPostmortemWithStats } from '../game/postmortem';
import type { PostmortemResult } from '../game/postmortem';
import type { MoveRecord } from '../game/types';

// positionStats モジュールをモック
vi.mock('../game/positionStats', () => ({
  fetchPositionWinRates: vi.fn(),
  fetchSymmetryGroupWinRates: vi.fn(),
  fetchSimPositionWinRates: vi.fn(),
}));

import {
  fetchPositionWinRates,
  fetchSymmetryGroupWinRates,
  fetchSimPositionWinRates,
} from '../game/positionStats';

const mockFetchCanonical = fetchPositionWinRates as ReturnType<typeof vi.fn>;
const mockFetchSymmetry = fetchSymmetryGroupWinRates as ReturnType<typeof vi.fn>;
const mockFetchSim = fetchSimPositionWinRates as ReturnType<typeof vi.fn>;

// ─── ヘルパー ────────────────────────────────────────────────────────────────

function makeResult(n: number, wpAfterValues?: number[]): PostmortemResult {
  const rows = Array.from({ length: n }, (_, i) => ({
    moveNum: i + 1,
    player: (i % 2 === 0 ? 'black' : 'white') as 'black' | 'white',
    played: `A massive(1)`,
    best: null,
    evalAfterPlayed: 0,
    evalAfterBest: null,
    loss: null,
    wpAfter: wpAfterValues ? (wpAfterValues[i] ?? 0.5) : 0.5,
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
  totalMoves: number,
  hashes: (string | undefined)[],
  symmetryIds?: (string | undefined)[],
): MoveRecord[] {
  return Array.from({ length: totalMoves }, (_, i) => ({
    moveNumber: i + 1,
    player: (i % 2 === 0 ? 'black' : 'white') as 'black' | 'white',
    positioning: 'A' as import('../game/types').PositionId,
    build: { type: 'massive' as const, gate: 1 as import('../game/types').GateId, placed: 1 },
    canonical_hash: hashes[i],
    symmetry_group_id: symmetryIds?.[i],
  }));
}

function makeSimStat(hash: string, winRateBlack: number, total = 200) {
  return {
    canonical_hash: hash,
    sim_policy: 'easy_vs_easy',
    wins_black: Math.round((winRateBlack / 100) * total),
    wins_white: total - Math.round((winRateBlack / 100) * total),
    draws: 0,
    total,
    win_rate_black: winRateBlack,
  };
}

// ─── テスト ──────────────────────────────────────────────────────────────────

describe('sim_position_stats_fallback (Step 2.5)', () => {
  beforeEach(() => {
    mockFetchCanonical.mockReset();
    mockFetchSymmetry.mockReset();
    mockFetchSim.mockReset();
    // デフォルト: 実戦統計なし
    mockFetchCanonical.mockResolvedValue(new Map());
    mockFetchSymmetry.mockResolvedValue(new Map());
    mockFetchSim.mockResolvedValue(new Map());
  });

  it('sim 統計あり・終盤(60%以上)・total>=100 → winRateSource=sim_easy かつ resolvedWP が blend になる', async () => {
    // 10手のゲーム。手番 7 (moveNum=7) は 7/10=0.7 で終盤
    const totalMoves = 10;
    const hashes = Array.from({ length: totalMoves }, (_, i) => `hash${i + 1}`);
    const simMap = new Map();
    simMap.set('hash7', makeSimStat('hash7', 60.0, 200)); // winRate=60%, total=200
    mockFetchSim.mockResolvedValue(simMap);

    const result = makeResult(totalMoves);
    const history = makeHistory(totalMoves, hashes);
    const enriched = await enrichPostmortemWithStats(result, history);

    const row7 = enriched.rows[6]!; // moveNum=7 (index=6)
    expect(row7.winRateSource).toBe('sim_easy');
    expect(row7.resolvedWpSource).toBe('blend');
    // blendedWP = 0.2 * (60/100) + 0.8 * 0.5 = 0.12 + 0.40 = 0.52
    expect(row7.resolvedWP).toBeCloseTo(0.52, 5);
  });

  it('sim 統計あり・序盤(moveNum/total < 0.6) → static fallback (winRateSource未設定)', async () => {
    // 10手のゲーム。手番 5 (moveNum=5) は 5/10=0.5 で序盤
    const totalMoves = 10;
    const hashes = Array.from({ length: totalMoves }, (_, i) => `hash${i + 1}`);
    const simMap = new Map();
    simMap.set('hash5', makeSimStat('hash5', 70.0, 150));
    mockFetchSim.mockResolvedValue(simMap);

    const result = makeResult(totalMoves);
    const history = makeHistory(totalMoves, hashes);
    const enriched = await enrichPostmortemWithStats(result, history);

    const row5 = enriched.rows[4]!; // moveNum=5 (index=4)
    expect(row5.winRateSource).toBeUndefined();
    expect(row5.resolvedWpSource).toBe('static');
    expect(row5.resolvedWP).toBeCloseTo(0.5);
  });

  it('sim 統計あり・total<100 → fetchSimPositionWinRates で除外され sim を使わない', async () => {
    // minTotal=100 でフィルタされるため、クライアント側ではMapに含まれないことを確認
    // (実際の除外はSupabase query の .gte('total', minTotal) だが、ここではMapが空であることでシミュレート)
    const totalMoves = 10;
    const hashes = Array.from({ length: totalMoves }, (_, i) => `hash${i + 1}`);
    // total=50 (< 100) の統計をMapに含めない（DB側でフィルタされる想定）
    mockFetchSim.mockResolvedValue(new Map()); // total<100 なので空Map

    const result = makeResult(totalMoves);
    const history = makeHistory(totalMoves, hashes);
    const enriched = await enrichPostmortemWithStats(result, history);

    // 全行 static fallback
    for (const row of enriched.rows) {
      expect(row.winRateSource).toBeUndefined();
      expect(row.resolvedWpSource).toBe('static');
    }
  });

  it('sim 統計なし(空Map) → static fallback になる・postmortem が壊れない', async () => {
    const totalMoves = 5;
    const hashes = Array.from({ length: totalMoves }, (_, i) => `hash${i + 1}`);
    mockFetchSim.mockResolvedValue(new Map());

    const result = makeResult(totalMoves);
    const history = makeHistory(totalMoves, hashes);
    const enriched = await enrichPostmortemWithStats(result, history);

    // postmortem が壊れない: 全行に resolvedWP が設定されている
    expect(enriched.rows).toHaveLength(totalMoves);
    for (const row of enriched.rows) {
      expect(row.resolvedWP).toBeDefined();
      expect(row.resolvedWpSource).toBe('static');
    }
  });

  it('実戦 canonical 統計あり → sim を使わない（canonical が優先）', async () => {
    // 終盤にある手番でも canonical があれば canonical を使う
    const totalMoves = 10;
    const hashes = Array.from({ length: totalMoves }, (_, i) => `hash${i + 1}`);

    // canonical: hash8 (moveNum=8, 8/10=0.8 → 終盤)
    const canonicalMap = new Map();
    canonicalMap.set('hash8', {
      canonical_hash: 'hash8',
      wins_black: 25,
      wins_white: 5,
      draws: 0,
      total: 30,
      win_rate_black: 83.33,
      win_rate_white: 16.67,
      confidence: 'main',
    });
    mockFetchCanonical.mockResolvedValue(canonicalMap);

    // sim も hash8 を持っている
    const simMap = new Map();
    simMap.set('hash8', makeSimStat('hash8', 55.0, 200));
    mockFetchSim.mockResolvedValue(simMap);

    const result = makeResult(totalMoves);
    const history = makeHistory(totalMoves, hashes);
    const enriched = await enrichPostmortemWithStats(result, history);

    const row8 = enriched.rows[7]!; // moveNum=8 (index=7)
    // canonical が優先されるため sim_easy にはならない
    expect(row8.winRateSource).toBe('position_stats');
    expect(row8.confidence).toBe('main');
  });

  it('実戦 symmetry 統計あり → sim を使わない（symmetry が優先）', async () => {
    // symmetry が取得できた場合は sim より優先
    const totalMoves = 10;
    const hashes = Array.from({ length: totalMoves }, (_, i) => `hash${i + 1}`);
    const symmetryIds = Array.from({ length: totalMoves }, (_, i) => `sym${i + 1}`);

    // canonical: なし
    mockFetchCanonical.mockResolvedValue(new Map());

    // symmetry: sym7 (moveNum=7, 終盤)
    const symmetryMap = new Map();
    symmetryMap.set('sym7', {
      symmetry_group_id: 'sym7',
      wins_black: 10,
      wins_white: 5,
      draws: 0,
      total: 15,
      win_rate_black: 66.67,
      win_rate_white: 33.33,
      confidence: 'reference',
    });
    mockFetchSymmetry.mockResolvedValue(symmetryMap);

    // sim も hash7 を持っている
    const simMap = new Map();
    simMap.set('hash7', makeSimStat('hash7', 45.0, 200));
    mockFetchSim.mockResolvedValue(simMap);

    const result = makeResult(totalMoves);
    const history = makeHistory(totalMoves, hashes, symmetryIds);
    const enriched = await enrichPostmortemWithStats(result, history);

    const row7 = enriched.rows[6]!; // moveNum=7 (index=6)
    // symmetry が優先されるため sim_easy にはならない
    expect(row7.winRateSource).toBe('symmetry_group');
    expect(row7.confidence).toBe('reference');
  });
});
