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
 * 仕様（pocket size 独立表示）:
 * - gateMap のキーは `"${gateId}:${pocketSize}"` の複合キー。
 * - 同一 Gate 内の Large / Middle / Small は独立して保持し、相互に上書きしない。
 * - 上書きは「同じ gateId + 同じ pocketSize」でのみ発生し、opacity が高い方を採用。
 * - 例: Gate8 に massive(large) と selective(middle) の両履歴がある場合、
 *        "8:large" と "8:middle" の両方が登録され、同時表示される。
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
  /**
   * "${gateId}:${pocketSize}" → opacity
   *
   * 同一 Gate の Large / Middle / Small は独立したキーで保持される。
   * 例: "8:large", "8:middle", "8:small" はそれぞれ独立したエントリ。
   */
  gateMap: Map<string, number>;
}

/**
 * GhostMove 配列 → GhostDisplayTargets に変換する。
 *
 * @param ghostMoves  RPC から返った GhostMove 配列
 * @returns           Board 表示用の opacityMap / gateMap
 */
export function ghostMovesToDisplayTargets(ghostMoves: GhostMove[]): GhostDisplayTargets {
  const opacityMap = new Map<string, number>();
  const gateMap = new Map<string, number>(); // key: "${gateId}:${pocketSize}"

  if (!ghostMoves || ghostMoves.length === 0) return { opacityMap, gateMap };

  const maxFreq = Math.max(...ghostMoves.map((m) => m.frequency));

  for (const gm of ghostMoves) {
    const ratio = maxFreq > 0 ? gm.frequency / maxFreq : 0;
    // 非線形コントラスト補正: pow(ratio, 1.5) で中〜低頻度を圧縮し、高頻度を際立たせる
    // 低頻度(ratio≈0.1): opacity≈0.31  中頻度(ratio=0.5): opacity≈0.55  最大(ratio=1.0): opacity=1.0
    const contrastRatio = Math.pow(ratio, 1.5);
    const baseOpacity = 0.3 + contrastRatio * 0.7; // min=0.30 / max=1.0
    // 全体　1.5倍ほど濃くする（上限 clamp）
    // 濃度差・比率は維持し、全体の見た目だけ引き上げる
    const opacity = Math.min(1.0, baseOpacity * 1.5);

    // ── Position opacity ───────────────────────────────────────────────
    const existingOpacity = opacityMap.get(gm.positioning) ?? 0;
    if (opacity > existingOpacity) opacityMap.set(gm.positioning, opacity);

    // ── Gate map ───────────────────────────────────────────────────────
    let gateIds: number[] = [];
    let pocketSize: 'large' | 'middle' | 'small';

    if (gm.build_type === 'massive') {
      if (gm.build_gate != null && gm.build_gate > 0) {
        gateIds = [gm.build_gate];
        pocketSize = 'large';
      } else {
        continue;
      }
    } else if (gm.build_type === 'selective') {
      if (gm.build_gates && gm.build_gates.length > 0) {
        gateIds = gm.build_gates.filter((g) => g > 0);
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
      // キー: "${gateId}:${pocketSize}" — Large/Middle/Small を独立して保持
      // 同一キー内でのみ opacity の高い方を採用（異なる pocketSize は上書きしない）
      const key = `${gateId}:${pocketSize}`;
      const existingOp = gateMap.get(key) ?? 0;
      if (opacity > existingOp) {
        gateMap.set(key, opacity);
      }
    }
  }

  return { opacityMap, gateMap };
}

/**
 * gateMap から特定の Gate + pocketSize の opacity を取得するヘルパー。
 *
 * @param gateMap  ghostMovesToDisplayTargets の返却 gateMap
 * @param gateId   対象 Gate ID
 * @param pocketSize  'large' | 'middle' | 'small'
 * @returns opacity (0 = Ghost なし)
 */
export function getGhostPocketOpacity(
  gateMap: Map<string, number>,
  gateId: number,
  pocketSize: 'large' | 'middle' | 'small',
): number {
  return gateMap.get(`${gateId}:${pocketSize}`) ?? 0;
}
