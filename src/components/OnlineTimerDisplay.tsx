/**
 * OnlineTimerDisplay.tsx — オンライン対戦用タイムクロック表示コンポーネント
 *
 * - turn_started_at + remaining_ms + server_updated_at からカウントダウン計算
 * - 真の判定はRPC側（このコンポーネントは表示のみ）
 * - timer_config が null / mode === 'none' のときは何も表示しない
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

/**
 * サーバー基準のカウントダウン計算
 *
 * server_updated_at を受信した時点のローカル時刻を保持し、
 * そこからの経過時間でサーバー時刻を近似する。
 */
function calcDisplayRemainingMs(opts: {
  mode: 'total_time' | 'per_move';
  timerConfig: TimerConfig;
  playerRemainingMs: number | null;
  turnStartedAt: string | null;
  serverUpdatedAt: string | null;
  localReceiveTime: number;
}): number {
  const { mode, timerConfig, playerRemainingMs, turnStartedAt, serverUpdatedAt, localReceiveTime } = opts;
  if (!turnStartedAt) return playerRemainingMs ?? 0;

  const now = Date.now();
  // server_updated_at とローカル受信時刻の差分でサーバー時刻を近似
  const serverNow = serverUpdatedAt
    ? new Date(serverUpdatedAt).getTime() + (now - localReceiveTime)
    : now;

  const elapsedMs = serverNow - new Date(turnStartedAt).getTime();

  if (mode === 'per_move') {
    const limitMs = timerConfig.perMoveSeconds * 1000;
    return Math.max(0, limitMs - elapsedMs);
  }
  if (mode === 'total_time') {
    return Math.max(0, (playerRemainingMs ?? 0) - elapsedMs);
  }
  return playerRemainingMs ?? 0;
}

export function OnlineTimerDisplay({
  timerConfig,
  blackRemainingMs,
  whiteRemainingMs,
  turnStartedAt,
  serverUpdatedAt,
  currentPlayer,
}: OnlineTimerDisplayProps) {
  const localReceiveTimeRef = useRef<number>(Date.now());
  const [tick, setTick] = useState(0);

  // server_updated_at / turnStartedAt が変化したらローカル受信時刻を更新
  useEffect(() => {
    localReceiveTimeRef.current = Date.now();
  }, [serverUpdatedAt, turnStartedAt]);

  // 200ms ごとに再描画
  useEffect(() => {
    if (!timerConfig || timerConfig.mode === 'none') return;
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, [timerConfig]);

  if (!timerConfig || timerConfig.mode === 'none') return null;

  const mode = timerConfig.mode;

  if (mode === 'total_time') {
    return (
      <div className="online-timer-bar">
        {(['black', 'white'] as const).map((player) => {
          const rawRemaining = player === 'black' ? blackRemainingMs : whiteRemainingMs;
          const isActive = player === currentPlayer;
          const remaining = isActive
            ? calcDisplayRemainingMs({
                mode: 'total_time',
                timerConfig,
                playerRemainingMs: rawRemaining,
                turnStartedAt,
                serverUpdatedAt,
                localReceiveTime: localReceiveTimeRef.current,
              })
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

  if (mode === 'per_move') {
    const remaining = calcDisplayRemainingMs({
      mode: 'per_move',
      timerConfig,
      playerRemainingMs: null,
      turnStartedAt,
      serverUpdatedAt,
      localReceiveTime: localReceiveTimeRef.current,
    });
    const colorClass = getTimerClassName(remaining);
    return (
      <div className="online-timer-per-move">
        <span className="online-timer-per-move-symbol">
          {currentPlayer === 'black' ? '●' : '○'}
        </span>
        <span className={`online-timer-per-move-value ${colorClass}`}>
          {/* tick は再描画トリガーとして使用 */}
          {tick >= 0 ? formatMs(remaining) : ''}
        </span>
      </div>
    );
  }

  return null;
}
