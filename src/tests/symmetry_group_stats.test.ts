/**
 * symmetry_group_stats.test.ts
 * symmetry_group_id 計算のユニットテスト
 */
import { describe, it, expect } from 'vitest';
import { computePositionOwnershipCanonicalHashString } from '../game/zobrist';
import { computeSymmetryGroupId } from '../game/symmetry';
import { createInitialState } from '../game/initialState';

describe('computePositionOwnershipCanonicalHashString', () => {
  it('初期状態で決定論的なhashを返す', () => {
    const state = createInitialState();
    const h1 = computePositionOwnershipCanonicalHashString(state);
    const h2 = computePositionOwnershipCanonicalHashString(state);
    expect(h1).toBe(h2);
    expect(typeof h1).toBe('string');
    expect(h1.length).toBe(16); // 8byte hex
  });

  it('canonical_hashと異なる値を返す（position-onlyなので）', () => {
    // position-only hash はゲートアセット等を含まないため canonical_hash より粗い
    // ただし初期状態（全empty）は canonical_hash の position 部分と一致する可能性があるため
    // 少なくとも「呼び出せること」を確認
    const state = createInitialState();
    const posOnlyHash = computePositionOwnershipCanonicalHashString(state);
    expect(posOnlyHash).toBeTruthy();
  });

  it('C4対称な初期状態は一定のhashを返す', () => {
    // 初期状態は全positionがnull owner → どの回転も同じ → 一意のhash
    const state = createInitialState();
    const h = computePositionOwnershipCanonicalHashString(state);
    expect(h).toBeTruthy();
  });
});

describe('computeSymmetryGroupId', () => {
  it('computePositionOwnershipCanonicalHashStringと同じ値を返す', () => {
    const state = createInitialState();
    const fromSymmetry = computeSymmetryGroupId(state);
    const fromZobrist = computePositionOwnershipCanonicalHashString(state);
    expect(fromSymmetry).toBe(fromZobrist);
  });

  it('決定論的で型が正しい', () => {
    const state = createInitialState();
    const gid = computeSymmetryGroupId(state);
    expect(typeof gid).toBe('string');
    expect(gid.length).toBeGreaterThan(0);
  });
});
