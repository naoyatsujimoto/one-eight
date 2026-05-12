/**
 * postmortemPrecompute.ts — ゲーム終了後のPostmortem事前計算スケジューラ
 *
 * 責務:
 *   - ゲーム終了直後に呼び出し、バックグラウンドで runPostmortem を実行する
 *   - 結果を localStorage（postmortem cache）に保存する
 *   - PostmortemModal を開いた時点でキャッシュがあれば即表示できる
 *
 * 設計:
 *   - postmortem.ts → storage.ts の循環 import を避けるため独立ファイルに分離
 *   - requestIdleCallback が使える環境ではアイドル時間を利用（ブラウザ負荷最小化）
 *   - 使えない場合は setTimeout(1500ms) でフォールバック
 *   - cache が既に存在する場合はスキップ（二重実行防止）
 *   - 計算失敗時もゲーム進行・結果表示に影響を与えない（silent catch）
 */

import { runPostmortem, enrichPostmortemWithStats } from './postmortem';
import { savePostmortemCache, loadPostmortemCache } from './storage';
import type { MoveRecord } from './types';

/**
 * ゲーム終了後にPostmortem事前計算をバックグラウンドでスケジュールする。
 *
 * @param gameId   PostmortemModal が参照する cache key（GameRecord.game_id と一致させる）
 * @param history  対局の棋譜（MoveRecord[]）
 */
export function schedulePostmortemPrecompute(gameId: string, history: MoveRecord[]): void {
  // cache が既にある場合はスキップ
  if (loadPostmortemCache(gameId)) return;

  const doCompute = () => {
    // race guard: 別タブや別呼び出しで既に計算済みの場合はスキップ
    if (loadPostmortemCache(gameId)) return;
    try {
      const base = runPostmortem(history);
      savePostmortemCache(gameId, base);
      // 統計（enrichPostmortemWithStats）は非同期で追加し、完了後に上書き保存
      enrichPostmortemWithStats(base, history)
        .then(enriched => savePostmortemCache(gameId, enriched))
        .catch(() => {/* silent: 統計失敗時は minimax 結果のみで表示 */});
    } catch {
      // 事前計算失敗 → cache なしのまま PostmortemModal がフォールバック実行する
    }
  };

  if (typeof requestIdleCallback !== 'undefined') {
    // ブラウザのアイドル時間（結果画面表示・保存処理の後）に実行
    requestIdleCallback(doCompute, { timeout: 5000 });
  } else {
    // Safari / 古いブラウザ向け: 1.5秒遅延後に実行
    setTimeout(doCompute, 1500);
  }
}
