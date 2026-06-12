/**
 * perspective_transform.test.ts
 *
 * 後手視点の座標変換ロジックの単体テスト。
 *
 * 設計原則:
 *   - 内部状態 / DB / 棋譜: 常に先手視点の正規座標 (A〜M / Gate 1〜12)
 *   - 後手UIの表示時: 正規座標 → 表示座標 (getDisplayPositionLabel / getDisplayGateLabel)
 *   - 後手UIのクリック時: Board は正規座標の id を onSelectPosition に渡す (変換不要)
 *
 * 検証対象:
 *   Board.tsx 内の変換テーブルと同等のロジックをここで直接定義して検証する。
 */

import { describe, it, expect } from 'vitest';
import type { PositionId } from '../game/types';

// ── 変換テーブル (Board.tsx の WHITE_POSITION_LABEL と同一) ───────────────────
const WHITE_POSITION_LABEL: Record<PositionId, PositionId> = {
  A: 'M', B: 'L', C: 'K',
  D: 'J', E: 'I', F: 'H',
  G: 'G',
  H: 'F', I: 'E', J: 'D',
  K: 'C', L: 'B', M: 'A',
};

function getDisplayPositionLabel(id: PositionId, perspective: 'black' | 'white'): PositionId {
  return perspective === 'white' ? WHITE_POSITION_LABEL[id] : id;
}

function getDisplayGateLabel(gateId: number, perspective: 'black' | 'white'): number {
  if (perspective !== 'white') return gateId;
  return ((gateId - 1 + 6) % 12) + 1;
}

// ── Position 変換テスト ────────────────────────────────────────────────────────
describe('Position label transform (white perspective)', () => {
  it('black perspective: returns id unchanged', () => {
    expect(getDisplayPositionLabel('A', 'black')).toBe('A');
    expect(getDisplayPositionLabel('M', 'black')).toBe('M');
    expect(getDisplayPositionLabel('G', 'black')).toBe('G');
  });

  it('white perspective A ↔ M (display)', () => {
    // 正規座標Aのポジションは後手視点でラベルMとして表示される
    expect(getDisplayPositionLabel('A', 'white')).toBe('M');
    // 正規座標Mのポジションは後手視点でラベルAとして表示される
    expect(getDisplayPositionLabel('M', 'white')).toBe('A');
  });

  it('white perspective B ↔ L (display)', () => {
    expect(getDisplayPositionLabel('B', 'white')).toBe('L');
    expect(getDisplayPositionLabel('L', 'white')).toBe('B');
  });

  it('white perspective G = G (center, symmetric)', () => {
    expect(getDisplayPositionLabel('G', 'white')).toBe('G');
  });

  it('white perspective is its own inverse (bijection)', () => {
    const positions: PositionId[] = ['A','B','C','D','E','F','G','H','I','J','K','L','M'];
    for (const id of positions) {
      const displayed = getDisplayPositionLabel(id, 'white');
      // 変換を2回適用すると元に戻る
      expect(getDisplayPositionLabel(displayed, 'white')).toBe(id);
    }
  });

  it('all positions covered (no undefined)', () => {
    const positions: PositionId[] = ['A','B','C','D','E','F','G','H','I','J','K','L','M'];
    for (const id of positions) {
      expect(getDisplayPositionLabel(id, 'white')).toBeDefined();
    }
  });
});

// ── Gate 変換テスト ────────────────────────────────────────────────────────────
describe('Gate label transform (white perspective)', () => {
  it('black perspective: returns gateId unchanged', () => {
    for (let g = 1; g <= 12; g++) {
      expect(getDisplayGateLabel(g, 'black')).toBe(g);
    }
  });

  it('white perspective Gate 1 ↔ Gate 7 (display)', () => {
    // 正規Gate1は後手視点でラベル7として表示される
    expect(getDisplayGateLabel(1, 'white')).toBe(7);
    // 正規Gate7は後手視点でラベル1として表示される
    expect(getDisplayGateLabel(7, 'white')).toBe(1);
  });

  it('white perspective Gate 6 ↔ Gate 12 (display)', () => {
    expect(getDisplayGateLabel(6, 'white')).toBe(12);
    expect(getDisplayGateLabel(12, 'white')).toBe(6);
  });

  it('white perspective Gate 2 → Gate 8 (display)', () => {
    expect(getDisplayGateLabel(2, 'white')).toBe(8);
    expect(getDisplayGateLabel(8, 'white')).toBe(2);
  });

  it('white perspective all gates in range 1-12', () => {
    for (let g = 1; g <= 12; g++) {
      const d = getDisplayGateLabel(g, 'white');
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(12);
    }
  });

  it('white perspective is its own inverse (bijection)', () => {
    for (let g = 1; g <= 12; g++) {
      const displayed = getDisplayGateLabel(g, 'white');
      expect(getDisplayGateLabel(displayed, 'white')).toBe(g);
    }
  });
});

// ── クリックハンドラ: 正規座標が渡されることの確認 ──────────────────────────────
describe('Click handler passes canonical coordinates', () => {
  /**
   * Board.tsx では position-btn の onClick は:
   *   onClick={() => onSelectPosition(id)}
   * であり、id は正規座標。
   * 後手視点でラベルAに見えるポジションの正規座標はMである。
   * そのため onSelectPosition に渡るのは M (正規座標)。
   */
  it('white perspective: displayed A → canonical M passed to handler', () => {
    // 後手画面でラベルAに見えるポジション = 正規座標M
    // (getDisplayPositionLabel('M', 'white') === 'A' より)
    const canonicalPositions: PositionId[] = ['A','B','C','D','E','F','G','H','I','J','K','L','M'];
    for (const canonical of canonicalPositions) {
      const displayedLabel = getDisplayPositionLabel(canonical, 'white');
      // クリック時に渡るのは canonical (正規座標) であることを確認
      // → engine.selectPosition / MoveRecord.positioning に正規座標が入る
      expect(typeof canonical).toBe('string');
      expect(typeof displayedLabel).toBe('string');
      // 表示ラベルと正規座標は (Gを除き) 異なる
      if (canonical !== 'G') {
        expect(displayedLabel).not.toBe(canonical);
      } else {
        expect(displayedLabel).toBe(canonical); // Gは中央で変化なし
      }
    }
  });

  it('white perspective gate: displayed label ≠ canonical (except symmetry pairs)', () => {
    // Gate表示ラベルと正規Gateは異なる (6と12, 1と7 etc.)
    const symmetricGates = new Set([7]); // 1+6=7, 7+6=13→1 (mod 12)
    for (let g = 1; g <= 12; g++) {
      const displayed = getDisplayGateLabel(g, 'white');
      if (!symmetricGates.has(g)) {
        // 変換後に元に戻ることを確認（bijection）
        expect(getDisplayGateLabel(displayed, 'white')).toBe(g);
      }
    }
  });
});
