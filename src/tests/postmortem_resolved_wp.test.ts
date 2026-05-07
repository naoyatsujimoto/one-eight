/**
 * postmortem_resolved_wp.test.ts
 * resolvedWP 系列 と DECISIVE MOVE 改善のユニットテスト
 */
import { describe, it, expect } from 'vitest';
import { buildResolvedWPSeries } from '../game/postmortem';
import type { PostmortemMoveRow } from '../game/postmortem';

function makeRow(overrides: Partial<PostmortemMoveRow> & { wpAfter: number }): PostmortemMoveRow {
  return {
    moveNum: 1,
    player: 'black',
    played: 'A massive(1)',
    best: null,
    evalAfterPlayed: 0,
    evalAfterBest: null,
    loss: null,
    wpAfterIfBest: null,
    wpSwing: null,
    ...overrides,
  };
}

describe('buildResolvedWPSeries', () => {
  it('resolvedWP がない行は wpAfter を使う', () => {
    const rows = [
      makeRow({ moveNum: 1, wpAfter: 0.55 }),
      makeRow({ moveNum: 2, wpAfter: 0.45 }),
    ];
    const series = buildResolvedWPSeries(rows, 0.5);
    expect(series).toEqual([0.5, 0.55, 0.45]);
  });

  it('resolvedWP がある行はそちらを優先する', () => {
    const rows = [
      makeRow({ moveNum: 1, wpAfter: 0.55, resolvedWP: 0.62 }),
      makeRow({ moveNum: 2, wpAfter: 0.45 }),
    ];
    const series = buildResolvedWPSeries(rows, 0.5);
    expect(series[1]).toBeCloseTo(0.62);
    expect(series[2]).toBeCloseTo(0.45);
  });

  it('空配列の場合は wpInitial のみ返す', () => {
    const series = buildResolvedWPSeries([], 0.5);
    expect(series).toEqual([0.5]);
  });

  it('全行 resolvedWP 設定済みの場合はすべて採用', () => {
    const rows = [
      makeRow({ moveNum: 1, wpAfter: 0.5, resolvedWP: 0.7 }),
      makeRow({ moveNum: 2, wpAfter: 0.5, resolvedWP: 0.3 }),
      makeRow({ moveNum: 3, wpAfter: 0.5, resolvedWP: 0.6 }),
    ];
    const series = buildResolvedWPSeries(rows, 0.5);
    expect(series).toHaveLength(4);
    expect(series[1]).toBeCloseTo(0.7);
    expect(series[2]).toBeCloseTo(0.3);
    expect(series[3]).toBeCloseTo(0.6);
  });
});

// NOTE: computeDecisiveMoveFromSwing は内部関数のため直接テストしない。
// enrichPostmortemWithStats 経由の統合テストは position_stats.test.ts で担保。
