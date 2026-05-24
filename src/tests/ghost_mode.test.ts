/**
 * Ghost Mode テスト
 *
 * 目的:
 *   1. p_move_index の設定ロジック（state.history.length の使用）
 *   2. GhostMove → 表示ターゲット変換（ghostMovesToDisplayTargets）
 *      - massive / selective / quad のpocketSize正確性
 *      - 初手 selective は必ず 2 Gate
 *      - selective single (mid-game [gate,0]) は 1 Gate middle（互換）
 *      - 不正値 (0 / null / undefined) が gateMap に混入しない
 *   3. ON/OFF: ghostMoves が空なら opacityMap / gateMap が空
 *   4. pocket size 独立表示: 同一 Gate の Large / Middle / Small が相互に上書きしない
 */

import { describe, it, expect } from 'vitest';
import { createInitialState } from '../game/initialState';
import { selectPosition, applyMassiveBuild, applySelectiveBuild } from '../game/engine';
import { ghostMovesToDisplayTargets } from '../game/ghostUtils';
import type { GhostMove } from '../lib/matchLog';

// ---------------------------------------------------------------------------
// ヘルパー: 初期状態の確認（p_move_index 計算の根拠）
// ---------------------------------------------------------------------------
describe('Ghost Mode — p_move_index の根拠', () => {
  it('初期状態: history.length=0 → p_move_index=0（人間black初手）', () => {
    const state = createInitialState();
    expect(state.history.length).toBe(0);
    expect(state.currentPlayer).toBe('black');
    // App.tsx: fetchGhostMoves(hash, humanColor, state.history.length)
    // humanColor='black', p_move_index=0
    const p_move_index = state.history.length;
    expect(p_move_index).toBe(0);
  });

  it('CPU(black)が1手打った後: history.length=1 → 人間white初手は p_move_index=1', () => {
    // CPU=black が D/massive/Gate3 を打ったと仮定
    const s0 = createInitialState();
    const s1 = selectPosition(s0, 'D');
    const s2 = applyMassiveBuild(s1, 3);
    expect(s2.history.length).toBe(1);
    expect(s2.currentPlayer).toBe('white');
    // humanColor='white', p_move_index=1
    const p_move_index = s2.history.length;
    expect(p_move_index).toBe(1);
  });

  it('人間black が1手打った後: history.length=1 → 次Ghost取得は p_move_index=1', () => {
    const s0 = createInitialState();
    const s1 = selectPosition(s0, 'I');
    const s2 = applySelectiveBuild(s1, [8, 12]);
    expect(s2.history.length).toBe(1);
    const p_move_index = s2.history.length;
    expect(p_move_index).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ghostMovesToDisplayTargets — 基本変換テスト
// ---------------------------------------------------------------------------
describe('ghostMovesToDisplayTargets — 基本変換', () => {
  it('空配列 → opacityMap / gateMap が空', () => {
    const { opacityMap, gateMap } = ghostMovesToDisplayTargets([]);
    expect(opacityMap.size).toBe(0);
    expect(gateMap.size).toBe(0);
  });

  it('massive → Position 丸 + Gate large pocket', () => {
    const gm: GhostMove = {
      positioning: 'D',
      build_type: 'massive',
      build_gate: 3,
      build_gates: null,
      build_placed_gate_ids: null,
      frequency: 5,
    };
    const { opacityMap, gateMap } = ghostMovesToDisplayTargets([gm]);
    expect(opacityMap.get('D')).toBeGreaterThan(0);
    expect(gateMap.get('3:large')).toBeGreaterThan(0);
    // middle / small は存在しない
    expect(gateMap.has('3:middle')).toBe(false);
    expect(gateMap.has('3:small')).toBe(false);
  });

  it('selective (2 gates) → Position 丸 + Gate8/Gate12 両方に middle pocket', () => {
    const gm: GhostMove = {
      positioning: 'I',
      build_type: 'selective',
      build_gate: null,
      build_gates: [8, 12],
      build_placed_gate_ids: null,
      frequency: 1,
    };
    const { opacityMap, gateMap } = ghostMovesToDisplayTargets([gm]);
    expect(opacityMap.get('I')).toBeGreaterThan(0);
    expect(gateMap.get('8:middle')).toBeGreaterThan(0);
    expect(gateMap.get('12:middle')).toBeGreaterThan(0);
    // 両方同一opacityのはず
    expect(gateMap.get('8:middle')).toBe(gateMap.get('12:middle'));
    // large / small は存在しない
    expect(gateMap.has('8:large')).toBe(false);
    expect(gateMap.has('12:large')).toBe(false);
  });

  it('quad → Position 丸 + 4 Gate small pocket', () => {
    const gm: GhostMove = {
      positioning: 'J',
      build_type: 'quad',
      build_gate: null,
      build_gates: null,
      build_placed_gate_ids: [1, 5, 7, 9],
      frequency: 1,
    };
    const { opacityMap, gateMap } = ghostMovesToDisplayTargets([gm]);
    expect(opacityMap.get('J')).toBeGreaterThan(0);
    for (const gid of [1, 5, 7, 9]) {
      expect(gateMap.get(`${gid}:small`)).toBeGreaterThan(0);
      expect(gateMap.has(`${gid}:large`)).toBe(false);
      expect(gateMap.has(`${gid}:middle`)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 初手 Ghost の不変条件
// ---------------------------------------------------------------------------
describe('Ghost Mode — 初手不変条件', () => {
  it('初手 selective: build_gates.length === 2 → 2 Gate middle 表示', () => {
    const gm: GhostMove = {
      positioning: 'I',
      build_type: 'selective',
      build_gate: null,
      build_gates: [8, 12],
      build_placed_gate_ids: null,
      frequency: 1,
    };
    const { gateMap } = ghostMovesToDisplayTargets([gm]);
    const middles = [...gateMap.keys()].filter((k) => k.endsWith(':middle'));
    // 初手 selective は必ず 2 Gate
    expect(middles.length).toBe(2);
  });

  it('初手 massive: build_gate=3 → 1 Gate large 表示', () => {
    const gm: GhostMove = {
      positioning: 'D',
      build_type: 'massive',
      build_gate: 3,
      build_gates: null,
      build_placed_gate_ids: null,
      frequency: 19,
    };
    const { gateMap } = ghostMovesToDisplayTargets([gm]);
    const larges = [...gateMap.keys()].filter((k) => k.endsWith(':large'));
    expect(larges.length).toBe(1);
    expect(larges[0]).toBe('3:large');
  });

  it('初手 quad: 4 Gate small 表示', () => {
    const gm: GhostMove = {
      positioning: 'J',
      build_type: 'quad',
      build_gate: null,
      build_gates: null,
      build_placed_gate_ids: [1, 5, 7, 9],
      frequency: 1,
    };
    const { gateMap } = ghostMovesToDisplayTargets([gm]);
    const smalls = [...gateMap.keys()].filter((k) => k.endsWith(':small'));
    expect(smalls.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 中終盤 selective single (gate_ids=[gate]) 互換
// ---------------------------------------------------------------------------
describe('Ghost Mode — 中終盤 selective single 互換', () => {
  it('build_gates=[4]（0 除去済み）→ 1 Gate middle 表示（壊れない）', () => {
    // RPC v2 は 0 を除去して返す。フロントはそのまま表示する。
    const gm: GhostMove = {
      positioning: 'C',
      build_type: 'selective',
      build_gate: null,
      build_gates: [4], // 0 は RPC 側で除去済み
      build_placed_gate_ids: null,
      frequency: 1,
    };
    const { gateMap } = ghostMovesToDisplayTargets([gm]);
    expect(gateMap.get('4:middle')).toBeGreaterThan(0);
    // 0 は絶対に登録されない
    expect(gateMap.has('0:middle')).toBe(false);
    expect(gateMap.has('0:large')).toBe(false);
    expect(gateMap.has('0:small')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 不正値の排除
// ---------------------------------------------------------------------------
describe('Ghost Mode — 不正値排除', () => {
  it('build_gate=0 (massive 不正値) → gateMap に 0:* が登録されない', () => {
    const gm: GhostMove = {
      positioning: 'D',
      build_type: 'massive',
      build_gate: 0,
      build_gates: null,
      build_placed_gate_ids: null,
      frequency: 1,
    };
    const { gateMap } = ghostMovesToDisplayTargets([gm]);
    expect(gateMap.has('0:large')).toBe(false);
    expect(gateMap.size).toBe(0);
  });

  it('build_gate=null (massive) → gateMap に登録されない', () => {
    const gm: GhostMove = {
      positioning: 'D',
      build_type: 'massive',
      build_gate: null,
      build_gates: null,
      build_placed_gate_ids: null,
      frequency: 1,
    };
    const { gateMap } = ghostMovesToDisplayTargets([gm]);
    expect(gateMap.size).toBe(0);
  });

  it('build_type="skip" → gateMap に登録されない', () => {
    const gm: GhostMove = {
      positioning: 'P',
      build_type: 'skip',
      build_gate: null,
      build_gates: null,
      build_placed_gate_ids: null,
      frequency: 3,
    };
    const { gateMap } = ghostMovesToDisplayTargets([gm]);
    expect(gateMap.size).toBe(0);
  });

  it('build_gates に 0 が混入しても gateMap に 0:* が登録されない（念のためフィルタ確認）', () => {
    const gm: GhostMove = {
      positioning: 'C',
      build_type: 'selective',
      build_gate: null,
      build_gates: [4, 0], // 通常は RPC 側で除去済みだが念のため
      build_placed_gate_ids: null,
      frequency: 1,
    };
    const { gateMap } = ghostMovesToDisplayTargets([gm]);
    expect(gateMap.has('0:middle')).toBe(false);
    expect(gateMap.get('4:middle')).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// opacity 比率計算
// ---------------------------------------------------------------------------
describe('Ghost Mode — opacity 計算', () => {
  it('max frequency の行は opacity=1.0', () => {
    const gm: GhostMove = {
      positioning: 'D',
      build_type: 'massive',
      build_gate: 3,
      build_gates: null,
      build_placed_gate_ids: null,
      frequency: 10,
    };
    const { gateMap } = ghostMovesToDisplayTargets([gm]);
    expect(gateMap.get('3:large')).toBe(1.0);
  });

  it('frequency=1, max=10 → boosted opacity = min(1.0, baseOpacity*1.5) ≈ 0.483', () => {
    const moves: GhostMove[] = [
      {
        positioning: 'D', build_type: 'massive', build_gate: 3,
        build_gates: null, build_placed_gate_ids: null, frequency: 10,
      },
      {
        positioning: 'G', build_type: 'massive', build_gate: 7,
        build_gates: null, build_placed_gate_ids: null, frequency: 1,
      },
    ];
    const { gateMap } = ghostMovesToDisplayTargets(moves);
    expect(gateMap.get('3:large')).toBeCloseTo(1.0, 5);
    // ratio=0.1, base≈0.322, boosted=min(1.0, 0.322*1.5)≈0.483
    const expected71 = Math.min(1.0, (0.3 + Math.pow(0.1, 1.5) * 0.7) * 1.5);
    expect(gateMap.get('7:large')).toBeCloseTo(expected71, 4);
  });

  it('同 gateId + 同 pocketSize に複数エントリ競合時、opacity が高い方が残る', () => {
    // Gate1 に massive(large, freq=10) と別の massive(large, freq=5) が競合
    const moves: GhostMove[] = [
      {
        positioning: 'D', build_type: 'massive', build_gate: 1,
        build_gates: null, build_placed_gate_ids: null, frequency: 10,
      },
      {
        positioning: 'G', build_type: 'massive', build_gate: 1,
        build_gates: null, build_placed_gate_ids: null, frequency: 5,
      },
    ];
    const { gateMap } = ghostMovesToDisplayTargets(moves);
    // maxFreq=10: freq=10 → opacity=1.0, freq=5 → opacity=0.7
    // 同一キー "1:large" は opacity が高い方(1.0)を採用
    expect(gateMap.get('1:large')).toBeCloseTo(1.0, 5);
  });

  it('同 gateId でも pocketSize が異なる場合はそれぞれ独立して保持される', () => {
    // Gate1 に massive(large, freq=10) と quad(small, freq=5) が混在
    const moves: GhostMove[] = [
      {
        positioning: 'D', build_type: 'massive', build_gate: 1,
        build_gates: null, build_placed_gate_ids: null, frequency: 10,
      },
      {
        positioning: 'J', build_type: 'quad', build_gate: null,
        build_gates: null, build_placed_gate_ids: [1, 5, 7, 9], frequency: 5,
      },
    ];
    const { gateMap } = ghostMovesToDisplayTargets(moves);
    // maxFreq=10: massive(freq=10)→opacity=1.0, quad(freq=5)→boosted≈0.821
    // Gate1: large と small が独立して保持される（上書きしない）
    const expectedSmall = Math.min(1.0, (0.3 + Math.pow(0.5, 1.5) * 0.7) * 1.5);
    expect(gateMap.get('1:large')).toBeCloseTo(1.0, 5);
    expect(gateMap.get('1:small')).toBeCloseTo(expectedSmall, 4);
  });
});

// ---------------------------------------------------------------------------
// pocket size 独立表示（メイン仕様）
// ---------------------------------------------------------------------------
describe('Ghost Mode — pocket size 独立表示（メイン仕様）', () => {
  it('Gate8 に massive(large) + selective(middle) 履歴があれば両方表示', () => {
    const moves: GhostMove[] = [
      { positioning: 'I', build_type: 'massive', build_gate: 8, build_gates: null, build_placed_gate_ids: null, frequency: 1 },
      { positioning: 'I', build_type: 'selective', build_gate: null, build_gates: [8, 12], build_placed_gate_ids: null, frequency: 1 },
    ];
    const { gateMap } = ghostMovesToDisplayTargets(moves);
    expect(gateMap.get('8:large')).toBeGreaterThan(0);   // massive から
    expect(gateMap.get('8:middle')).toBeGreaterThan(0);  // selective から（上書きされない）
    expect(gateMap.get('12:middle')).toBeGreaterThan(0); // selective のペア
    expect(gateMap.has('12:large')).toBe(false);
  });

  it('Gate10 に massive(large) + quad(small) 履歴があれば両方表示', () => {
    const moves: GhostMove[] = [
      { positioning: 'G', build_type: 'massive', build_gate: 10, build_gates: null, build_placed_gate_ids: null, frequency: 1 },
      { positioning: 'G', build_type: 'quad', build_gate: null, build_gates: null, build_placed_gate_ids: [1, 4, 7, 10], frequency: 1 },
    ];
    const { gateMap } = ghostMovesToDisplayTargets(moves);
    expect(gateMap.get('10:large')).toBeGreaterThan(0);
    expect(gateMap.get('10:small')).toBeGreaterThan(0);
    expect(gateMap.get('1:small')).toBeGreaterThan(0);
    expect(gateMap.get('4:small')).toBeGreaterThan(0);
  });

  it('Gate3 に selective(middle) + quad(small) 履歴があれば両方表示', () => {
    const moves: GhostMove[] = [
      { positioning: 'D', build_type: 'selective', build_gate: null, build_gates: [3, 6], build_placed_gate_ids: null, frequency: 2 },
      { positioning: 'D', build_type: 'quad', build_gate: null, build_gates: null, build_placed_gate_ids: [3, 6, 9, 12], frequency: 1 },
    ];
    const { gateMap } = ghostMovesToDisplayTargets(moves);
    expect(gateMap.get('3:middle')).toBeGreaterThan(0);
    expect(gateMap.get('3:small')).toBeGreaterThan(0);
    // large は存在しない
    expect(gateMap.has('3:large')).toBe(false);
  });

  it('3種すべての履歴がある Gate: large / middle / small がすべて独立して保持される', () => {
    const moves: GhostMove[] = [
      { positioning: 'A', build_type: 'massive', build_gate: 1, build_gates: null, build_placed_gate_ids: null, frequency: 3 },
      { positioning: 'A', build_type: 'selective', build_gate: null, build_gates: [1, 4], build_placed_gate_ids: null, frequency: 2 },
      { positioning: 'A', build_type: 'quad', build_gate: null, build_gates: null, build_placed_gate_ids: [1, 4, 7, 10], frequency: 1 },
    ];
    const { gateMap } = ghostMovesToDisplayTargets(moves);
    // Gate1 に 3 種すべて存在
    expect(gateMap.get('1:large')).toBeGreaterThan(0);
    expect(gateMap.get('1:middle')).toBeGreaterThan(0);
    expect(gateMap.get('1:small')).toBeGreaterThan(0);
    // maxFreq=3 + 1.5x boost:
    //   large(freq=3):  base=1.0 → boosted=min(1.0, 1.5)=1.0
    //   middle(freq=2): base≈0.681 → boosted=min(1.0, 1.021)=1.0 (clamp)
    //   small(freq=1):  base≈0.435 → boosted≈0.652
    // large≥middle≥small（上位2つは clamp で同値になりえる）
    expect(gateMap.get('1:large')!).toBeGreaterThanOrEqual(gateMap.get('1:middle')!);
    expect(gateMap.get('1:middle')!).toBeGreaterThan(gateMap.get('1:small')!);
  });
});
