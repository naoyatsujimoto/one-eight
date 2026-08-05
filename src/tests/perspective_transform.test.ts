/**
 * perspective_transform.test.ts
 *
 * resolveLocalPerspective の単体テスト（8ケース）。
 *
 * 設計方針:
 *   - オフラインPvP (cpuPlayer===null): 端末共有・盤面回転なし → 常時 'black' 基準
 *   - CPU戦 (cpuPlayer!==null): 人間プレイヤーの選択色を基準にする
 *   - OnlineBoard / TrainingView は本関数を使用しない（現状維持を確認）
 */

import { describe, it, expect } from 'vitest';
import { resolveLocalPerspective } from '../app/App';
import fs from 'fs';
import path from 'path';

// ── resolveLocalPerspective の基本ケース ──────────────────────────────────────

describe('resolveLocalPerspective', () => {
  // ケース1: オフラインPvP・Black手番相当
  it('case1: offline PvP (cpuPlayer=null, black turn) → always black', () => {
    expect(resolveLocalPerspective(null, null)).toBe('black');
  });

  // ケース2: オフラインPvP・White手番相当
  it('case2: offline PvP (cpuPlayer=null, white turn) → always black (no flip)', () => {
    // White手番でも端末共有のため常時 'black' を返す
    expect(resolveLocalPerspective(null, null)).toBe('black');
  });

  // ケース3: CPU戦・人間がBlack
  it('case3: CPU=white, humanColor=black → black', () => {
    expect(resolveLocalPerspective('white', 'black')).toBe('black');
  });

  // ケース4: CPU戦・人間がWhite
  it('case4: CPU=black, humanColor=white → white', () => {
    expect(resolveLocalPerspective('black', 'white')).toBe('white');
  });

  // ケース5: humanColor未確定時（null）
  it('case5: CPU=white, humanColor=null → fallback to black', () => {
    expect(resolveLocalPerspective('white', null)).toBe('black');
  });
});

// ── App.tsx: Board と TurnInfo が同じ localPerspective を使用しているか確認 ──

describe('App.tsx source: Board and TurnInfo use the same localPerspective', () => {
  // ケース6: ソース確認テスト
  it('case6: App.tsx passes localPerspective to both Board and TurnInfo', () => {
    const appSrc = fs.readFileSync(
      path.resolve(__dirname, '../app/App.tsx'),
      'utf-8',
    );

    // resolveLocalPerspective 関数の定義が存在する
    expect(appSrc).toContain('export function resolveLocalPerspective(');

    // localPerspective の計算が存在する
    expect(appSrc).toContain('const localPerspective = resolveLocalPerspective(');

    // Board に labelPerspective={localPerspective} が渡されている
    expect(appSrc).toContain('labelPerspective={localPerspective}');

    // TurnInfo に perspective={localPerspective} が渡されている
    expect(appSrc).toContain('perspective={localPerspective}');
  });
});

// ── OnlineBoard: 独自の視点切替を維持している（変更なし確認） ────────────────

describe('OnlineBoard source: myColor-based perspective unchanged', () => {
  // ケース7: OnlineBoard は resolveLocalPerspective を使用しない
  it('case7: OnlineBoard uses myColor for perspective, not resolveLocalPerspective', () => {
    const onlineBoardSrc = fs.readFileSync(
      path.resolve(__dirname, '../components/OnlineBoard.tsx'),
      'utf-8',
    );

    // OnlineBoard は resolveLocalPerspective を import していない
    expect(onlineBoardSrc).not.toContain('resolveLocalPerspective');

    // myColor ベースの視点参照が存在する（Black視点が使われている）
    // OnlineBoard は myColor を使って labelPerspective を制御している
    expect(onlineBoardSrc).toContain('myColor');
  });
});

// ── TrainingView: Black固定を維持（変更なし確認） ────────────────────────────

describe('TrainingView source: black perspective fixed, unchanged', () => {
  // ケース8: TrainingView は 'black' 固定で resolveLocalPerspective を使用しない
  it('case8: TrainingView does not use resolveLocalPerspective (black fixed)', () => {
    const trainingViewSrc = fs.readFileSync(
      path.resolve(__dirname, '../components/TrainingView.tsx'),
      'utf-8',
    );

    // TrainingView は resolveLocalPerspective を使用しない
    expect(trainingViewSrc).not.toContain('resolveLocalPerspective');
  });
});
