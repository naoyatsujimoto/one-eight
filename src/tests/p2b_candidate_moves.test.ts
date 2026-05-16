/**
 * p2b_candidate_moves.test.ts
 *
 * Phase P-2b バグ確認テスト:
 * 1. runPostmortem が Black 手に candidateMoves を生成するか
 * 2. enrichPostmortemWithStats が candidateMoves を保持するか
 * 3. isProActive の判定ロジックが正しいか
 */

import { describe, it, expect, vi } from 'vitest';
import { runPostmortem, enrichPostmortemWithStats } from '../game/postmortem';
import { isProActive } from '../lib/profile';
import type { PostmortemResult } from '../game/postmortem';
import type { MoveRecord } from '../game/types';

// positionStats をモック（Supabase不要）
vi.mock('../game/positionStats', () => ({
  fetchPositionWinRates: vi.fn().mockResolvedValue(new Map()),
  fetchSymmetryGroupWinRates: vi.fn().mockResolvedValue(new Map()),
  fetchMediumPatternWinRates: vi.fn().mockResolvedValue(new Map()),
  fetchSimMediumPatternWinRates: vi.fn().mockResolvedValue(new Map()),
  fetchSimPositionOnlyWinRates: vi.fn().mockResolvedValue(new Map()),
}));

// ─── isProActive テスト ────────────────────────────────────────────────────────

describe('isProActive', () => {
  it('plan=pro, status=active, current_period_end=未来 → true', () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(isProActive({ plan: 'pro', subscription_status: 'active', current_period_end: future })).toBe(true);
  });

  it('plan=pro, status=active, current_period_end=null → true', () => {
    expect(isProActive({ plan: 'pro', subscription_status: 'active', current_period_end: null })).toBe(true);
  });

  it('plan=free, status=active → false', () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(isProActive({ plan: 'free', subscription_status: 'active', current_period_end: future })).toBe(false);
  });

  it('plan=pro, status=inactive → false', () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(isProActive({ plan: 'pro', subscription_status: 'inactive', current_period_end: future })).toBe(false);
  });

  it('plan=pro, status=active, current_period_end=過去 → false', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(isProActive({ plan: 'pro', subscription_status: 'active', current_period_end: past })).toBe(false);
  });
});

import { createInitialState } from '../game/initialState';
import { selectPosition, applyMassiveBuild } from '../game/engine';
import type { GameState, GateId, PositionId } from '../game/types';

// ─── runPostmortem の candidateMoves テスト ───────────────────────────────────

function makeMinimalHistory(): MoveRecord[] {
  let state: GameState = createInitialState(null);
  const records: MoveRecord[] = [];

  const moves: Array<{ player: 'black' | 'white'; posId: PositionId; gateId: GateId }> = [
    { player: 'black', posId: 'A', gateId: 1 },
    { player: 'white', posId: 'C', gateId: 3 },
    { player: 'black', posId: 'D', gateId: 7 },
    { player: 'white', posId: 'E', gateId: 4 },
    { player: 'black', posId: 'G', gateId: 1 },
    { player: 'white', posId: 'K', gateId: 9 },
  ];

  for (const { player, posId, gateId } of moves) {
    const s1 = selectPosition({ ...state, currentPlayer: player }, posId);
    const s2 = applyMassiveBuild(s1, gateId as GateId);
    const last = s2.history[s2.history.length - 1];
    if (last) records.push(last);
    state = s2;
  }

  return records;
}

describe('runPostmortem -- candidateMoves (Phase P-2b)', () => {
  it('空の棋譜でも runPostmortem は正常に動作する', () => {
    const emptyHistory: MoveRecord[] = [];
    const result = runPostmortem(emptyHistory);
    expect(result).toBeDefined();
    expect(result.rows).toEqual([]);
    expect(result.wpInitial).toBeGreaterThan(0);
    expect(result.wpInitial).toBeLessThan(1);
  });

  it('実際の棋譜: Black 手の全行に candidateMoves が存在する', () => {
    const history = makeMinimalHistory();
    const result = runPostmortem(history);

    expect(result.rows.length).toBeGreaterThan(0);

    for (const row of result.rows) {
      if (row.player === 'black') {
        // Black 手には candidateMoves が存在するはず
        expect(row.candidateMoves).toBeDefined();
        expect(Array.isArray(row.candidateMoves)).toBe(true);
        expect(row.candidateMoves!.length).toBeGreaterThan(0);
        // rank が 1-indexed で正しいか
        expect(row.candidateMoves![0]!.rank).toBe(1);
        // wp が 0-1 の範囲か
        for (const c of row.candidateMoves!) {
          expect(c.wp).toBeGreaterThanOrEqual(0);
          expect(c.wp).toBeLessThanOrEqual(1);
          expect(typeof c.move).toBe('string');
          expect(typeof c.wpDiff).toBe('number');
        }
      } else {
        // White 手には candidateMoves がないはず
        expect(row.candidateMoves).toBeUndefined();
      }
    }
  });

  it('enrichPostmortemWithStats は candidateMoves を保持する', async () => {
    // candidateMoves を持つモック result を作成
    const mockCandidates = [
      { rank: 1, move: 'A massive(1)', wp: 0.6, wpDiff: 0.1 },
      { rank: 2, move: 'B selective(2,3)', wp: 0.55, wpDiff: 0.05 },
      { rank: 3, move: 'C quad', wp: 0.50, wpDiff: 0.0 },
    ];

    const mockResult: PostmortemResult = {
      rows: [
        {
          moveNum: 1,
          player: 'black',
          played: 'A massive(1)',
          best: 'A massive(1)',
          evalAfterPlayed: 100,
          evalAfterBest: 100,
          loss: 0,
          wpAfter: 0.5,
          wpAfterIfBest: 0.6,
          wpSwing: 0.1,
          candidateMoves: mockCandidates,
        },
        {
          moveNum: 2,
          player: 'white',
          played: 'B massive(2)',
          best: null,
          evalAfterPlayed: 80,
          evalAfterBest: null,
          loss: null,
          wpAfter: 0.45,
          wpAfterIfBest: null,
          wpSwing: null,
          candidateMoves: undefined,  // White 手は candidateMoves なし
        },
        {
          moveNum: 3,
          player: 'black',
          played: 'C massive(3)',
          best: 'C massive(3)',
          evalAfterPlayed: 120,
          evalAfterBest: 120,
          loss: 0,
          wpAfter: 0.55,
          wpAfterIfBest: 0.55,
          wpSwing: 0,
          candidateMoves: mockCandidates,
        },
      ],
      wpInitial: 0.5,
      decisiveCrossing: null,
      crossings: [],
      topBlackLosses: [],
    };

    const mockHistory: MoveRecord[] = [
      {
        moveNumber: 1,
        player: 'black',
        positioning: 'A',
        build: { type: 'massive', gate: 1 },
      } as unknown as MoveRecord,
      {
        moveNumber: 2,
        player: 'white',
        positioning: 'B',
        build: { type: 'massive', gate: 2 },
      } as unknown as MoveRecord,
      {
        moveNumber: 3,
        player: 'black',
        positioning: 'C',
        build: { type: 'massive', gate: 3 },
      } as unknown as MoveRecord,
    ];

    const enriched = await enrichPostmortemWithStats(mockResult, mockHistory);

    // candidateMoves が保持されているか確認
    expect(enriched.rows[0]?.candidateMoves).toBeDefined();
    expect(enriched.rows[0]?.candidateMoves).toHaveLength(3);
    expect(enriched.rows[0]?.candidateMoves?.[0]?.rank).toBe(1);
    expect(enriched.rows[0]?.candidateMoves?.[0]?.move).toBe('A massive(1)');

    // White 手は candidateMoves なし
    expect(enriched.rows[1]?.candidateMoves).toBeUndefined();

    // 3手目も candidateMoves 保持
    expect(enriched.rows[2]?.candidateMoves).toBeDefined();
    expect(enriched.rows[2]?.candidateMoves).toHaveLength(3);
  });

  it('Black 手の hasCandidates チェック: candidateMoves が存在する行のみ true', () => {
    const mockResult: PostmortemResult = {
      rows: [
        {
          moveNum: 1,
          player: 'black',
          played: 'A massive(1)',
          best: 'A massive(1)',
          evalAfterPlayed: 100,
          evalAfterBest: 100,
          loss: 0,
          wpAfter: 0.5,
          wpAfterIfBest: 0.6,
          wpSwing: 0.1,
          candidateMoves: [
            { rank: 1, move: 'A massive(1)', wp: 0.6, wpDiff: 0.1 },
          ],
        },
        {
          moveNum: 2,
          player: 'white',
          played: 'B massive(2)',
          best: null,
          evalAfterPlayed: 80,
          evalAfterBest: null,
          loss: null,
          wpAfter: 0.45,
          wpAfterIfBest: null,
          wpSwing: null,
        },
      ],
      wpInitial: 0.5,
      decisiveCrossing: null,
      crossings: [],
      topBlackLosses: [],
    };

    // PostmortemModal の HistoryList と同じロジック
    for (const r of mockResult.rows) {
      const hasCandidates = r.player === 'black' && !!r.candidateMoves && r.candidateMoves.length > 0;
      if (r.player === 'black') {
        expect(hasCandidates).toBe(true);  // Black手 + candidateMoves あり → true
      } else {
        expect(hasCandidates).toBe(false); // White手 → false
      }
    }
  });
});
