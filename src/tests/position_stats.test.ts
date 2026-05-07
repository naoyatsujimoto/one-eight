/**
 * positionStats.ts のユニットテスト
 * Supabase RPC はモックしない（ネットワークなし環境での動作確認のみ）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enrichPostmortemWithStats } from '../game/postmortem';
import type { PostmortemResult } from '../game/postmortem';
import type { MoveRecord } from '../game/types';

// positionStats モジュールをモック
vi.mock('../game/positionStats', () => ({
  fetchPositionWinRates: vi.fn(),
}));

import { fetchPositionWinRates } from '../game/positionStats';
const mockFetch = fetchPositionWinRates as ReturnType<typeof vi.fn>;

function makeResult(n: number): PostmortemResult {
  const rows = Array.from({ length: n }, (_, i) => ({
    moveNum: i + 1,
    player: (i % 2 === 0 ? 'black' : 'white') as 'black' | 'white',
    played: `A massive(1)`,
    best: null,
    evalAfterPlayed: 0,
    evalAfterBest: null,
    loss: null,
    wpAfter: 0.5,
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

function makeHistory(hashes: (string | undefined)[]): MoveRecord[] {
  return hashes.map((h, i) => ({
    moveNumber: i + 1,
    player: (i % 2 === 0 ? 'black' : 'white') as 'black' | 'white',
    positioning: 'A' as import('../game/types').PositionId,
    build: { type: 'massive' as const, gate: 1 as import('../game/types').GateId, placed: 1 },
    canonical_hash: h,
  }));
}

describe('enrichPostmortemWithStats', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('RPC失敗時はrowsを変更しない', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));
    const result = makeResult(2);
    const history = makeHistory(['hash1', 'hash2']);
    const enriched = await enrichPostmortemWithStats(result, history);
    expect(enriched.rows[0]!.historicWinRate).toBeUndefined();
    expect(enriched.rows[1]!.historicWinRate).toBeUndefined();
  });

  it('空マップ返却時はrowsを変更しない', async () => {
    mockFetch.mockResolvedValue(new Map());
    const result = makeResult(2);
    const history = makeHistory(['hash1', 'hash2']);
    const enriched = await enrichPostmortemWithStats(result, history);
    expect(enriched.rows[0]!.historicWinRate).toBeUndefined();
  });

  it('confidence=hiddenの統計は付加しない', async () => {
    const statMap = new Map();
    statMap.set('hash1', {
      canonical_hash: 'hash1', wins_black: 2, wins_white: 1, draws: 0, total: 3,
      win_rate_black: 66.67, win_rate_white: 33.33, confidence: 'hidden',
    });
    mockFetch.mockResolvedValue(statMap);
    const result = makeResult(2);
    const history = makeHistory(['hash1', 'hash2']);
    const enriched = await enrichPostmortemWithStats(result, history);
    expect(enriched.rows[0]!.historicWinRate).toBeUndefined();
  });

  it('confidence=referenceの統計を付加する', async () => {
    const statMap = new Map();
    statMap.set('hash1', {
      canonical_hash: 'hash1', wins_black: 4, wins_white: 3, draws: 0, total: 7,
      win_rate_black: 57.14, win_rate_white: 42.86, confidence: 'reference',
    });
    mockFetch.mockResolvedValue(statMap);
    const result = makeResult(2);
    const history = makeHistory(['hash1', 'hash2']);
    const enriched = await enrichPostmortemWithStats(result, history);
    expect(enriched.rows[0]!.historicWinRate).toBeCloseTo(57.14);
    expect(enriched.rows[0]!.sampleCount).toBe(7);
    expect(enriched.rows[0]!.confidence).toBe('reference');
    expect(enriched.rows[0]!.winRateSource).toBe('position_stats');
  });

  it('confidence=mainの統計を付加する', async () => {
    const statMap = new Map();
    statMap.set('hash2', {
      canonical_hash: 'hash2', wins_black: 20, wins_white: 10, draws: 0, total: 30,
      win_rate_black: 66.67, win_rate_white: 33.33, confidence: 'main',
    });
    mockFetch.mockResolvedValue(statMap);
    const result = makeResult(2);
    const history = makeHistory(['hash1', 'hash2']);
    const enriched = await enrichPostmortemWithStats(result, history);
    expect(enriched.rows[0]!.historicWinRate).toBeUndefined(); // hash1 に統計なし
    expect(enriched.rows[1]!.historicWinRate).toBeCloseTo(66.67);
    expect(enriched.rows[1]!.confidence).toBe('main');
  });

  it('canonical_hashがundefinedの行はスキップする', async () => {
    mockFetch.mockResolvedValue(new Map());
    const result = makeResult(2);
    const history = makeHistory([undefined, 'hash2']);
    const enriched = await enrichPostmortemWithStats(result, history);
    expect(enriched.rows[0]!.historicWinRate).toBeUndefined();
  });

  it('historyが空の場合はresultをそのまま返す', async () => {
    const result = makeResult(0);
    const enriched = await enrichPostmortemWithStats(result, []);
    expect(enriched.rows).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('DECISIVE MOVEはenrich後にswingベースで再計算される（行数<3の場合はnull）', async () => {
    const statMap = new Map();
    statMap.set('hash1', {
      canonical_hash: 'hash1', wins_black: 4, wins_white: 3, draws: 0, total: 7,
      win_rate_black: 57.14, win_rate_white: 42.86, confidence: 'reference',
    });
    mockFetch.mockResolvedValue(statMap);
    const result = makeResult(1);
    result.decisiveCrossing = {
      moveNum: 1, player: 'black', played: 'A massive(1)',
      fromWP: 0.55, toWP: 0.45, direction: 'down',
    };
    const history = makeHistory(['hash1']);
    const enriched = await enrichPostmortemWithStats(result, history);
    // rows.length < 3 のため computeDecisiveMoveFromSwing は null を返す（新仕様）
    expect(enriched.decisiveCrossing).toBeNull();
  });
});
