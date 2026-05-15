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

import { runPostmortemAsync, enrichPostmortemWithStats } from './postmortem';
import { savePostmortemCache, loadPostmortemCache } from './storage';
import type { MoveRecord } from './types';

// 実行中の事前計算をキャンセルするためのフラグ管理
const cancelledGames = new Set<string>();

/**
 * 指定した gameId の事前計算をキャンセルする。
 * New Game 等で不要になった場合に呼び出す。
 */
export function cancelPostmortemPrecompute(gameId: string): void {
  cancelledGames.add(gameId);
}

/**
 * ゲーム終了後にPostmortem事前計算をバックグラウンドでスケジュールする。
 *
 * runPostmortemAsync を使用し、各手の処理後に setTimeout(0) で制御をブラウザに
 * 返すことで UI スレッドをブロックしない。
 *
 * @param gameId   PostmortemModal が参照する cache key（GameRecord.game_id と一致させる）
 * @param history  対局の棋譜（MoveRecord[]）
 */
export function schedulePostmortemPrecompute(gameId: string, history: MoveRecord[]): void {
  // cache が既にある場合はスキップ
  if (loadPostmortemCache(gameId)) return;

  cancelledGames.delete(gameId);

  const doCompute = async () => {
    // race guard: 別タブや別呼び出しで既に計算済みの場合はスキップ
    if (loadPostmortemCache(gameId)) return;
    try {
      // キャンセルチェック付きの非同期版を使用（UI スレッドをブロックしない）
      const base = await runPostmortemAsync(history, () => cancelledGames.has(gameId));
      if (cancelledGames.has(gameId)) return;
      savePostmortemCache(gameId, base);
      // 統計（enrichPostmortemWithStats）は非同期で追加し、完了後に上書き保存
      enrichPostmortemWithStats(base, history)
        .then(enriched => {
          if (!cancelledGames.has(gameId)) savePostmortemCache(gameId, enriched);
        })
        .catch(() => {/* silent: 統計失敗時は minimax 結果のみで表示 */});
    } catch {
      // 事前計算失敗 → cache なしのまま PostmortemModal がフォールバック実行する
    }
  };

  if (typeof requestIdleCallback !== 'undefined') {
    // ブラウザのアイドル時間（結果画面表示・保存処理の後）に実行
    requestIdleCallback(() => { doCompute(); }, { timeout: 5000 });
  } else {
    // Safari / 古いブラウザ向け: 1.5秒遅延後に実行
    setTimeout(() => { doCompute(); }, 1500);
  }
}
