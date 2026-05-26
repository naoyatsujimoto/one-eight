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
 *   - server_updated_at + (now - localReceiveTime) でサーバー時刻を近似
 *   - 手番側のみ elapsed を差し引く（非手番は DB の remaining_ms をそのまま表示）
 *   - frozenUntil 前は全プレイヤー凍結
 *
 * ## 共通
 *   - frozenUntil (公式戦 starts_at): この時刻まで時計を凍結
 *   - timer_config が null / mode === 'none' のときは何も表示しない
 *   - gameFinished=true のときはカウントダウン停止
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

// ─── total_time 専用計算 ──────────────────────────────────────────────────────
/**
 * total_time の手番プレイヤーの表示残り時間を計算する（手番側専用）。
 *
 * server_updated_at + (now - localReceiveTime) でサーバー現在時刻を近似し、
 * turnStartedAt からの経過時間を playerRemainingMs から差し引く。
 * Realtime 経由の更新では精度が高い（serverUpdatedAt ≈ now のため drift が小さい）。
 *
 * 戻り値: [0, ∞)
 */
function calcTotalTimeActiveRemainingMs(
  playerRemainingMs: number | null,
  turnStartedAt: string | null,
  serverUpdatedAt: string | null,
  localReceiveTime: number,
  frozenUntil: string | null | undefined,
): number {
  if (!turnStartedAt) return playerRemainingMs ?? 0;

  const now = Date.now();
  const serverNow = serverUpdatedAt
    ? new Date(serverUpdatedAt).getTime() + (now - localReceiveTime)
    : now;

  // frozenUntil が設定されている場合、effectiveStart を定刻以降に限定
  let effectiveStart = new Date(turnStartedAt).getTime();
  if (frozenUntil) {
    const frozenUntilMs = new Date(frozenUntil).getTime();
    effectiveStart = Math.max(effectiveStart, frozenUntilMs);
  }

  const elapsed = serverNow - effectiveStart;
  return Math.max(0, (playerRemainingMs ?? 0) - elapsed);
}

// ─── コンポーネント ────────────────────────────────────────────────────────────
export function OnlineTimerDisplay({
  timerConfig,
  blackRemainingMs,
  whiteRemainingMs,
  turnStartedAt,
  serverUpdatedAt,
  currentPlayer,
  gameFinished = false,
  frozenUntil = null,
}: OnlineTimerDisplayProps) {
  // total_time 専用: serverUpdatedAt の受信時刻を保持
  // per_move はこの ref を使わない
  const localReceiveTimeRef = useRef<number>(Date.now());
  const [tick, setTick] = useState(0);

  // total_time 用: serverUpdatedAt または turnStartedAt が変化したら受信時刻を更新
  // per_move はこの useEffect の影響を受けない（calcPerMoveRemainingMs は ref を参照しない）
  useEffect(() => {
    localReceiveTimeRef.current = Date.now();
  }, [serverUpdatedAt, turnStartedAt]);

  // 公式戦: frozenUntil 到達後に再描画のみトリガー
  // localReceiveTimeRef.current をここでリセットしてはいけない
  // （リセットすると total_time の serverNow ≈ serverUpdatedAt になり elapsed=0 になる）
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
    return (
      <div className="online-timer-bar">
        {(['black', 'white'] as const).map((player) => {
          const rawRemaining = player === 'black' ? blackRemainingMs : whiteRemainingMs;
          // 手番側のみ elapsed を差し引く。非手番側は DB の remaining_ms をそのまま表示。
          const isActive = !isFrozen && player === currentPlayer;
          const remaining = isActive
            ? calcTotalTimeActiveRemainingMs(
                rawRemaining,
                turnStartedAt,
                serverUpdatedAt,
                localReceiveTimeRef.current,
                frozenUntil,
              )
            : (rawRemaining ?? 0);
          const colorClass = isActive ? getTimerClassName(remaining) : '';
          return (
            <div
              key={player}
              className={`online-timer-player ${isActive ? 'online-timer-player-active' : 'online-timer-player-inactive'}`}
            >
              <span className="online-timer-symbol">{player === 'black' ? '●' : '○'}</span>
              <span className={`online-timer-value ${colorClass}`}>
                {formatMs(remaining)}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return null;
}
