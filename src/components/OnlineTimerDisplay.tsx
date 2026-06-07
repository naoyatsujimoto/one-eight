/**
 * OnlineTimerDisplay.tsx — オンライン対戦用タイムクロック表示コンポーネント
 *
 * per_move と total_time の表示計算を完全に分離した設計:
 *
 * ## per_move
 *   - Date.now() ベースで turnStartedAt からの経過時間を計算（serverUpdatedAt+drift は使わない）
 *   - 理由: serverUpdatedAt ≈ turnStartedAt（同一トランザクション）のため、
 *     再入室直後は localReceiveTime = Date.now() にリセットされ elapsed=0 になる
 *   - 再入室後も turnStartedAt から正確な経過時間を反映する
 *   - 上限を perMoveMs にクランプ → 31秒等の上振れ表示を防ぐ
 *   - 非手番プレイヤーは表示しない（per_move は手番側のみカウントダウン）
 *   - frozenUntil 前は perMoveMs で凍結（starts_at 前の待機時間を持ち時間に加算しない）
 *
 * ## total_time
 *   - Date.now() ベースで turnStartedAt（または frozenUntil）からの経過時間を計算
 *   - serverUpdatedAt + drift 近似は廃止（clock offset の正/負どちらでも表示バグを起こすため）
 *   - frozenUntil 前は全プレイヤー凍結
 *   - elapsed は 0 以上にクランプ（turnStartedAt が未来の場合）
 *   - 表示残り時間は [0, initialTotalMs] にクランプ（初期持ち時間を超えた表示を防ぐ）
 *
 * ## 共通
 *   - frozenUntil (公式戦 starts_at): この時刻まで時計を凍結
 *   - timer_config が null / mode === 'none' のときは何も表示しない
 *   - gameFinished=true のときはカウントダウン停止
 *
 * ## 過去のバグ履歴
 *   [OM-1d Bug 1] 2:40 表示（起動直後）
 *     原因: サーバークロックがクライアントより N 秒遅れ → serverNow < starts_at → elapsed 負値
 *            → remaining = 120000 + N*1000 に上振れ
 *     修正: elapsed = Math.max(0, ...) + clamp(result, 0, initialTotalMs)
 *
 *   [OM-1d Bug 2] 2:00 のまま止まる（Black 初手中）
 *     原因: Bug1 の修正で elapsed = Math.max(0, serverNow - starts_at) としたが、
 *            サーバークロックが N 秒遅れている限り serverNow = actual_UTC - N sec のまま。
 *            starts_at 後も serverNow < starts_at が続き elapsed = 0 → カウントダウン停止。
 *     修正: serverNow 近似を完全廃止し Date.now() を直接使用。
 *            apply_online_move は同一 v_now で turn_started_at / server_updated_at を更新するため
 *            serverNow ≈ turnStartedAt になり elapsed=0 になる問題もこれで解消。
 */
import { useEffect, useRef, useState } from 'react';
import type { TimerConfig } from '../game/timerTypes';

interface OnlineTimerDisplayProps {
  timerConfig: TimerConfig | null;
  blackRemainingMs: number | null;
  whiteRemainingMs: number | null;
  turnStartedAt: string | null;
  serverUpdatedAt: string | null;
  currentPlayer: 'black' | 'white';
  gameFinished?: boolean;
  /** OM-1c: 公式戦の開始時刻（ISO）。この時刻まで時計を凍結する。null=通常対戦 */
  frozenUntil?: string | null;
}

function formatMs(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getTimerClassName(ms: number): string {
  if (ms <= 10000) return 'online-timer-danger';
  if (ms <= 30000) return 'online-timer-warning';
  return '';
}

// ─── per_move 専用計算 ────────────────────────────────────────────────────────
/**
 * per_move の表示残り時間を計算する。
 *
 * Date.now() を基準に turnStartedAt からの経過時間を差し引く。
 * server_updated_at + drift 近似は使用しない。
 *
 * 【なぜ Date.now() を使うか】
 * apply_online_move は turn_started_at と server_updated_at を同一 v_now で更新する。
 * そのため serverUpdatedAt ≈ turnStartedAt となり、
 * serverNow = serverUpdatedAt + (now - localReceiveTime) の計算は
 * 再入室直後に localReceiveTime = Date.now() にリセットされるため
 * serverNow ≈ serverUpdatedAt ≈ turnStartedAt となり elapsed=0 を返す。
 * per_move ではタイムアウト判定を RPC が行うため、
 * クライアント表示での ±数秒のサーバークロックずれは許容できる。
 *
 * 戻り値: [0, perMoveMs] にクランプ（上振れ防止）
 */
function calcPerMoveRemainingMs(
  turnStartedAt: string | null,
  perMoveMs: number,
  frozenUntil: string | null | undefined,
): number {
  const now = Date.now();

  if (frozenUntil) {
    const frozenUntilMs = new Date(frozenUntil).getTime();
    // 定刻前: 常に perMoveMs を返す（凍結）
    if (now < frozenUntilMs) return perMoveMs;
    // 定刻後: effectiveStart = max(turnStartedAt, frozenUntil)
    // turnStartedAt が定刻前の場合（enter_official_match で turn_started_at = starts_at に設定）は
    // frozenUntil を起点とし、入室待機時間を持ち時間に加算しない
    const base = turnStartedAt
      ? Math.max(new Date(turnStartedAt).getTime(), frozenUntilMs)
      : frozenUntilMs;
    return Math.min(perMoveMs, Math.max(0, perMoveMs - (now - base)));
  }

  if (!turnStartedAt) return perMoveMs;
  const elapsed = now - new Date(turnStartedAt).getTime();
  return Math.min(perMoveMs, Math.max(0, perMoveMs - elapsed));
}

// ─── BY-4: total_time + byoyomi 表示段階ヘルパー ────────────────────────────────
/**
 * BY-4: total_time + byoyomi の表示段階を返す。
 * - 'normal': 通常持ち時間中（従来表示）
 * - 'byoyomi': 秒読み中（BY M:SS 表示）
 *
 * calcTotalTimeActiveRemainingMs の式は変えない。
 * 秒読み段階の少ない計算のみ追加する。
 */
function calcTotalTimeWithByoyomi(
  playerRemainingMs: number | null,
  turnStartedAt: string | null,
  frozenUntil: string | null | undefined,
  initialTotalMs: number,
  byoyomiMs: number,
): { phase: 'normal' | 'byoyomi'; remainingMs: number } {
  if (byoyomiMs <= 0) {
    return {
      phase: 'normal',
      remainingMs: calcTotalTimeActiveRemainingMs(playerRemainingMs, turnStartedAt, frozenUntil, initialTotalMs),
    };
  }

  const normalRemaining = calcTotalTimeActiveRemainingMs(playerRemainingMs, turnStartedAt, frozenUntil, initialTotalMs);
  if (normalRemaining > 0) {
    return { phase: 'normal', remainingMs: normalRemaining };
  }

  // 通常持ち時間切れ: 秒読み段階
  const now = Date.now();
  const rawPlayerMs = playerRemainingMs ?? initialTotalMs;
  let effectiveStart = turnStartedAt ? new Date(turnStartedAt).getTime() : now;
  if (frozenUntil) {
    const frozenUntilMs = new Date(frozenUntil).getTime();
    effectiveStart = Math.max(effectiveStart, frozenUntilMs);
  }
  const elapsed = Math.max(0, now - effectiveStart);
  const byoyomiUsed = Math.max(0, elapsed - rawPlayerMs);
  const byoyomiRemaining = Math.max(0, byoyomiMs - byoyomiUsed);

  return { phase: 'byoyomi', remainingMs: byoyomiRemaining };
}

// ─── total_time 専用計算 ──────────────────────────────────────────────────────
/**
 * total_time の手番プレイヤーの表示残り時間を計算する（手番側専用）。
 *
 * 【設計方針】
 * serverUpdatedAt + (now - localReceiveTime) によるサーバー時刻近似は廃止。
 * 理由:
 *   1. サーバークロックがクライアントより N 秒遅れている場合、serverNow = actual_UTC - N sec。
 *      ・N 秒遅れ → serverNow < effectiveStart → elapsed 負値 → 表示上振れ（例: 2:40）
 *      ・Math.max(0, elapsed) で 0 クランプすると、starts_at 後も N 秒間 elapsed = 0 のまま
 *        → タイマーが N 秒間止まって見える（今回のバグ）
 *   2. apply_online_move は turn_started_at = server_updated_at = v_now（同一トランザクション）。
 *      再入室直後に localReceiveTime がリセットされると serverNow ≈ turnStartedAt になり elapsed=0。
 *      per_move が Date.now() に切り替えた理由と同じ。
 *
 * Date.now() を直接使うことでいずれの問題も解消する。
 * タイムアウト判定は RPC 側が行うため、表示での ±数秒のずれは許容範囲。
 *
 * 戻り値: [0, initialTotalMs]
 */
function calcTotalTimeActiveRemainingMs(
  playerRemainingMs: number | null,
  turnStartedAt: string | null,
  frozenUntil: string | null | undefined,
  initialTotalMs: number,
): number {
  if (!turnStartedAt) return Math.min(playerRemainingMs ?? initialTotalMs, initialTotalMs);

  const now = Date.now();

  // effectiveStart: frozenUntil（公式戦 starts_at）以降に限定
  // 公式戦では turn_started_at = starts_at なので max は常に starts_at
  // 通常対戦では frozenUntil = null なので turnStartedAt をそのまま使う
  let effectiveStart = new Date(turnStartedAt).getTime();
  if (frozenUntil) {
    const frozenUntilMs = new Date(frozenUntil).getTime();
    effectiveStart = Math.max(effectiveStart, frozenUntilMs);
  }

  // elapsed: Date.now() 基準。turnStartedAt が未来の場合は 0 にクランプ
  const elapsed = Math.max(0, now - effectiveStart);

  // 結果を [0, initialTotalMs] にクランプ:
  //   上限: 初期持ち時間を超えた表示を防ぐ
  //   下限: 0 未満の表示を防ぐ
  return Math.min(initialTotalMs, Math.max(0, (playerRemainingMs ?? initialTotalMs) - elapsed));
}

// ─── コンポーネント ────────────────────────────────────────────────────────────
export function OnlineTimerDisplay({
  timerConfig,
  blackRemainingMs,
  whiteRemainingMs,
  turnStartedAt,
  serverUpdatedAt: _serverUpdatedAt,  // Date.now() 方式に移行したため未使用（互換性のため残す）
  currentPlayer,
  gameFinished = false,
  frozenUntil = null,
}: OnlineTimerDisplayProps) {
  const [tick, setTick] = useState(0);

  // 公式戦: frozenUntil 到達後に再描画のみトリガー
  useEffect(() => {
    if (!frozenUntil) return;
    const msUntilFrozen = new Date(frozenUntil).getTime() - Date.now();
    if (msUntilFrozen <= 0) return;
    const id = setTimeout(() => setTick((t) => t + 1), msUntilFrozen);
    return () => clearTimeout(id);
  }, [frozenUntil]);

  // 200ms ごとに再描画（ゲーム終了時はカウントダウン停止）
  useEffect(() => {
    if (!timerConfig || timerConfig.mode === 'none') return;
    if (gameFinished) return;
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, [timerConfig, gameFinished]);

  if (!timerConfig || timerConfig.mode === 'none') return null;

  // tick は再描画トリガー（参照して lint 警告を抑制）
  void tick;

  const mode = timerConfig.mode;
  const isFrozen = frozenUntil ? Date.now() < new Date(frozenUntil).getTime() : false;

  // ─── per_move ──────────────────────────────────────────────────────────────
  if (mode === 'per_move') {
    const perMoveMs = timerConfig.perMoveSeconds * 1000;
    const remaining = calcPerMoveRemainingMs(turnStartedAt, perMoveMs, frozenUntil);
    // 凍結中は警告色を出さない（0:30 のまま凍結されているため）
    const colorClass = isFrozen ? '' : getTimerClassName(remaining);
    return (
      <div className="online-timer-per-move">
        <span className="online-timer-per-move-symbol">
          {currentPlayer === 'black' ? '●' : '○'}
        </span>
        <span className={`online-timer-per-move-value ${colorClass}`}>
          {formatMs(remaining)}
        </span>
      </div>
    );
  }

  // ─── total_time ────────────────────────────────────────────────────────────
  if (mode === 'total_time') {
    const initialTotalMs = timerConfig.totalSeconds * 1000;
    // BY-4: byoyomiMs (0 なら秒読みなし)
    const byoyomiMs = (timerConfig.byoyomiSeconds ?? 0) * 1000;
    return (
      <div className="online-timer-bar">
        {(['black', 'white'] as const).map((player) => {
          const rawRemaining = player === 'black' ? blackRemainingMs : whiteRemainingMs;
          // 手番側のみ elapsed を差し引く。非手番側は DB の remaining_ms をそのまま表示。
          const isActive = !isFrozen && player === currentPlayer;

          // BY-4: 手番側は byoyomi 段階判定、非手番側は従来通り
          let displayStr: string;
          let colorClass: string;
          if (isActive) {
            const { phase, remainingMs } = calcTotalTimeWithByoyomi(
              rawRemaining,
              turnStartedAt,
              frozenUntil,
              initialTotalMs,
              byoyomiMs,
            );
            if (phase === 'byoyomi') {
              displayStr = `BY ${formatMs(remainingMs)}`;
              // 秒読み中は常に danger 色（残り時間は byoyomiSeconds 以下）
              colorClass = 'online-timer-danger';
            } else {
              displayStr = formatMs(remainingMs);
              colorClass = getTimerClassName(remainingMs);
            }
          } else {
            // 非手番側も [0, initialTotalMs] にクランプ（安全策）
            const remaining = Math.min(rawRemaining ?? initialTotalMs, initialTotalMs);
            displayStr = formatMs(remaining);
            colorClass = '';
          }

          return (
            <div
              key={player}
              className={`online-timer-player ${isActive ? 'online-timer-player-active' : 'online-timer-player-inactive'}`}
            >
              <span className="online-timer-symbol">{player === 'black' ? '●' : '○'}</span>
              <span className={`online-timer-value ${colorClass}`}>
                {displayStr}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return null;
}
