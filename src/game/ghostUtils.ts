/**
 * Ghost Mode — 表示変換ユーティリティ
 *
 * RPC が返す GhostMove 配列から、Board 表示に必要な2種のマップを生成する。
 *
 * 設計方針:
 * - RPC は gate_ids_str（文字列）を返さない。型付きカラム (build_gate / build_gates /
 *   build_placed_gate_ids) を使う。
 * - フロント側での文字列 split / Number変換 / filter に依存しない。
 * - gate ID として 0 や NaN が混入しても ghostGateMap には登録しない。
 * - 不正データ（build_gate=0 等）も同様に除外する。
 *
 * 不変条件（テストで保証）:
 * - massive  → GateId 1件 + large pocket
 * - selective → 有効 GateId 1〜2件 + middle pocket（0 は RPC 側で除去済み）
 * - quad     → GateId 複数件 + small pocket
 * - 初手 (p_move_index=0) での selective は build_gates.length === 2
 */

import type { GhostMove } from '../lib/matchLog';

/** ghostMovesToDisplayTargets の返却型 */
export interface GhostDisplayTargets {
  /** positioning → opacity (0.4〜1.0、比率ベース) */
  opacityMap: Map<string, number>;
  /** gateId → {pocketSize, opacity} */
  gateMap: Map<number, { opacity: number; pocketSize: 'large' | 'middle' | 'small' }>;
}

/**
 * GhostMove 配列 → GhostDisplayTargets に変換する。
 *
 * @param ghostMoves  RPC から返った GhostMove 配列
 * @returns           Board 表示用の opacityMap / gateMap
 */
export function ghostMovesToDisplayTargets(ghostMoves: GhostMove[]): GhostDisplayTargets {
  const opacityMap = new Map<string, number>();
  const gateMap = new Map<number, { opacity: number; pocketSize: 'large' | 'middle' | 'small' }>();

  if (!ghostMoves || ghostMoves.length === 0) return { opacityMap, gateMap };

  const maxFreq = Math.max(...ghostMoves.map((m) => m.frequency));

  for (const gm of ghostMoves) {
    const ratio = maxFreq > 0 ? gm.frequency / maxFreq : 0;
    const opacity = 0.4 + ratio * 0.6; // min=0.4 / max=1.0

    // ── Position opacity ───────────────────────────────────────────────
    const existingOpacity = opacityMap.get(gm.positioning) ?? 0;
    if (opacity > existingOpacity) opacityMap.set(gm.positioning, opacity);

    // ── Gate map ───────────────────────────────────────────────────────
    let gateIds: number[] = [];
    let pocketSize: 'large' | 'middle' | 'small';

    if (gm.build_type === 'massive') {
      // build_gate が有効な正の整数のときのみ登録
      if (gm.build_gate != null && gm.build_gate > 0) {
        gateIds = [gm.build_gate];
        pocketSize = 'large';
      } else {
        continue;
      }
    } else if (gm.build_type === 'selective') {
      // build_gates は RPC 側で 0 除去・昇順ソート済み
      if (gm.build_gates && gm.build_gates.length > 0) {
        gateIds = gm.build_gates.filter((g) => g > 0); // 念のため再フィルタ
        pocketSize = 'middle';
      } else {
        continue;
      }
    } else if (gm.build_type === 'quad') {
      if (gm.build_placed_gate_ids && gm.build_placed_gate_ids.length > 0) {
        gateIds = gm.build_placed_gate_ids.filter((g) => g > 0);
        pocketSize = 'small';
      } else {
        continue;
      }
    } else {
      // 'skip' / unknown → 表示なし
      continue;
    }

    for (const gateId of gateIds) {
      const existing = gateMap.get(gateId);
      // 同一 gateId に複数エントリが競合する場合、opacity が高い方を採用
      if (!existing || opacity > existing.opacity) {
        gateMap.set(gateId, { opacity, pocketSize });
      }
    }
  }

  return { opacityMap, gateMap };
}
