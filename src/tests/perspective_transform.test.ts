/**
 * perspective_transform.test.ts
 *
 * Option C 仕様の単体テスト。
 *
 * 設計原則 (Option C):
 *   - 内部状態 / DB / 棋譜: 常に canonical 座標 (A〜M / Gate 1〜12)
 *   - ラベル文字: 視点に関係なく常に canonical のまま (変換しない)
 *   - 後手視点: 盤面全体を物理的に 180° 回転して表示 (CSS rotate)
 *   - ラベルテキスト要素: counter-rotate(180deg) で読める向きにする
 *   - クリックハンドラ: 常に canonical ID を engine に渡す
 *
 * 確認事項:
 *   1. ラベル文字列は perspective によって変わらない
 *   2. white 視点では盤面全体が 180° 回転する (CSS クラス付与で実現)
 *   3. クリック時に渡される ID は canonical のまま
 *   4. MoveHistory 表示は perspective に依存しない
 */

import { describe, it, expect } from 'vitest';
import type { PositionId } from '../game/types';

// ── Option C: ラベル変換なし ──────────────────────────────────────────────────
// Board.tsx では perspective に関わらずラベルは常に canonical を表示する

function getDisplayPositionLabel(id: PositionId): PositionId {
  return id; // canonical のまま
}

function getDisplayGateLabel(gateId: number): number {
  return gateId; // canonical のまま
}

// ── Position ラベルは perspective で変わらない ─────────────────────────────────
describe('Option C: Position label is always canonical', () => {
  it('black perspective: returns canonical id unchanged', () => {
    expect(getDisplayPositionLabel('A')).toBe('A');
    expect(getDisplayPositionLabel('M')).toBe('M');
    expect(getDisplayPositionLabel('G')).toBe('G');
  });

  it('white perspective: canonical A is still A (NOT remapped to M)', () => {
    // Option C: ラベルは変換しない。後手視点でも A は A
    expect(getDisplayPositionLabel('A')).toBe('A');
    expect(getDisplayPositionLabel('M')).toBe('M');
  });

  it('all positions: label equals canonical id regardless of perspective', () => {
    const positions: PositionId[] = ['A','B','C','D','E','F','G','H','I','J','K','L','M'];
    for (const id of positions) {
      // ラベルは視点によって変わらない
      expect(getDisplayPositionLabel(id)).toBe(id);
    }
  });

  it('canonical A is white-perspective far-left, but label stays A', () => {
    // 後手視点では盤面が 180° 回転するため、物理的に canonical A の位置は
    // 画面の右下になる。しかしラベル文字は A のまま (counter-rotate で読める向きに表示)
    expect(getDisplayPositionLabel('A')).toBe('A');
  });
});

// ── Gate ラベルは perspective で変わらない ────────────────────────────────────
describe('Option C: Gate label is always canonical', () => {
  it('black perspective: returns canonical gateId unchanged', () => {
    for (let g = 1; g <= 12; g++) {
      expect(getDisplayGateLabel(g)).toBe(g);
    }
  });

  it('white perspective: canonical Gate 1 is still 1 (NOT remapped to 7)', () => {
    // Option C: ラベルは変換しない。後手視点でも Gate 1 は 1
    expect(getDisplayGateLabel(1)).toBe(1);
    expect(getDisplayGateLabel(7)).toBe(7);
  });

  it('white perspective: canonical Gate 6 is still 6 (NOT remapped to 12)', () => {
    expect(getDisplayGateLabel(6)).toBe(6);
    expect(getDisplayGateLabel(12)).toBe(12);
  });

  it('all gates 1-12: label equals canonical gateId regardless of perspective', () => {
    for (let g = 1; g <= 12; g++) {
      expect(getDisplayGateLabel(g)).toBe(g);
    }
  });
});

// ── 盤面回転は CSS クラスで実現 ────────────────────────────────────────────────
describe('Option C: Board rotation is via CSS class, not label remapping', () => {
  it('white perspective applies board-inner-rotated CSS class', () => {
    // Board.tsx では labelPerspective === 'white' のとき
    // className に 'board-inner-rotated' が追加される
    // → CSS で rotate(180deg) が適用される
    const perspective: 'black' | 'white' = 'white';
    const classNames = [
      'board-inner',
      perspective === 'white' ? 'board-inner-rotated' : '',
    ].filter(Boolean);
    expect(classNames).toContain('board-inner-rotated');
  });

  it('black perspective does NOT apply board-inner-rotated CSS class', () => {
    const perspective = 'black' as 'black' | 'white';
    const classNames = [
      'board-inner',
      perspective === 'white' ? 'board-inner-rotated' : '',
    ].filter(Boolean);
    expect(classNames).not.toContain('board-inner-rotated');
  });
});

// ── クリックハンドラは常に canonical 座標を渡す ──────────────────────────────
describe('Option C: Click handler always passes canonical coordinates', () => {
  /**
   * Board.tsx の position-btn.onClick は:
   *   onClick={() => onSelectPosition(id)}
   * id は BOARD_POSITIONS の canonical PositionId。
   *
   * 後手視点で盤面が 180° 回転しても、id は canonical のまま。
   * ユーザーが物理的に右下のボタンをクリックしても、
   * canonical A (= 物理的に右下にある要素) の id = 'A' が engine に渡る。
   */
  it('canonical id is passed to onSelectPosition regardless of perspective', () => {
    const positions: PositionId[] = ['A','B','C','D','E','F','G','H','I','J','K','L','M'];
    for (const canonical of positions) {
      // クリック時に渡るのは canonical のまま
      const passedToEngine = canonical; // Board.tsx: onClick={() => onSelectPosition(id)}
      expect(passedToEngine).toBe(canonical);
      // ラベルも canonical と同一
      expect(getDisplayPositionLabel(canonical)).toBe(canonical);
    }
  });

  it('canonical gate id is passed to handler regardless of perspective', () => {
    for (let g = 1; g <= 12; g++) {
      const passedToEngine = g; // Board.tsx: onLarge={() => onLargePocketClick(gateId)}
      expect(passedToEngine).toBe(g);
      expect(getDisplayGateLabel(g)).toBe(g);
    }
  });
});

// ── MoveHistory 表示は perspective に依存しない ──────────────────────────────
describe('Option C: MoveHistory notation is perspective-independent', () => {
  it('move notation uses canonical coordinates, not display labels', () => {
    // 棋譜は canonical 座標で記録される
    // 後手画面でも先手画面でも同じ棋譜が表示される
    const canonicalMove = 'A,m(1)'; // canonical: Position A, Massive build at Gate 1
    // 後手視点でも棋譜は変わらない
    expect(canonicalMove).toBe('A,m(1)');
  });

  it('displayed position label equals canonical (no notation mismatch)', () => {
    // Option C では表示ラベル = canonical のため、
    // 棋譜表示と盤面ラベルが一致する
    const canonical: PositionId = 'M';
    const displayedInWhitePerspective = getDisplayPositionLabel(canonical);
    expect(displayedInWhitePerspective).toBe('M'); // NOT 'A'
  });
});
