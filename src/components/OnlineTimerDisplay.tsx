/**
 * OnlineTimerDisplay.tsx — オンライン対戦用タイムクロック表示コンポーネント
 *
 * - turn_started_at + remaining_ms + server_updated_at からカウントダウン計算
 * - 真の判定はRPC側（このコンポーネントは表示のみ）
 * - timer_config が null / mode === 'none' のときは何も表示しない
 * - OM-1c: frozenUntil が設定されている場合（公式戦定刻前）は時計を凍結表示する
 *   - elapsed の計算を frozenUntil 以降からのみ行う
 *   - 入室時刻を持ち時間に混ぜない
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

/**
 * サーバー基準のカウントダウン計算
 *
 * server_updated_at を受信した時点のローカル時刻を保持し、
 * そこからの経過時間でサーバー時刻を近似する。
 *
 * OM-1c: frozenUntil が指定された場合は定刻前凍結ロジックを適用する:
 *   - now < frozenUntil の間: elapsed=0 として残り時間を固定表示
 *   - now >= frozenUntil の後: 通常の server_updated_at ベースの計算を行う
 *     ただし turnStartedAt < frozenUntil の場合は frozenUntil を有効な起点とする
 *     （入室待機中は turn_started_at が定刻前を指している可能性があるため）
 *
 * 修正前バグ（2c06079）: 定刻後を「now - frozenUntilMs」固定で計算していたため
 *   MOVE 2 以降も「定刻からの総経過時間」が手番プレイヤーの持ち時間から引かれ続け、
 *   非手番プレイヤー（isActive=false）でも DB 値が定刻起点で減少して見えた。
 *   正しくは turnStartedAt（直近の着手時刻）を起点にすべき。
 */
function calcDisplayRemainingMs(opts: {
  mode: 'total_time' | 'per_move';
  timerConfig: TimerConfig;
  playerRemainingMs: number | null;
  turnStartedAt: string | null;
  serverUpdatedAt: string | null;
  localReceiveTime: number;
  frozenUntil?: string | null;
}): number {
  const { mode, timerConfig, playerRemainingMs, turnStartedAt, serverUpdatedAt, localReceiveTime, frozenUntil } = opts;
  if (!turnStartedAt) return playerRemainingMs ?? 0;

  const now = Date.now();

  // OM-1c: 定刻前凍結チェック
  // frozenUntil が設定されていて、まだその時刻に達していない場合は elapsed=0 として凍結
  if (frozenUntil) {
    const frozenUntilMs = new Date(frozenUntil).getTime();
    if (now < frozenUntilMs) {
      // 定刻前: elapsed=0 → 残り時間はそのまま（初期値を表示）
      if (mode === 'per_move') {
        return timerConfig.perMoveSeconds * 1000;
      }
      if (mode === 'total_time') {
        return playerRemainingMs ?? 0;
      }
      return playerRemainingMs ?? 0;
    }
    // 定刻後: 通常と同じ server_updated_at ベースの計算を行う
    // ただし turnStartedAt が定刻前を指している場合（入室直後の1手目）は frozenUntilMs を起点とする
    // これにより「入室待機時間」が持ち時間に加算されない
    const serverNowFrozen = serverUpdatedAt
      ? new Date(serverUpdatedAt).getTime() + (now - localReceiveTime)
      : now;
    const effectiveStart = Math.max(new Date(turnStartedAt).getTime(), frozenUntilMs);
    const elapsedMsFrozen = serverNowFrozen - effectiveStart;
    if (mode === 'per_move') {
      const limitMs = timerConfig.perMoveSeconds * 1000;
      return Math.max(0, limitMs - elapsedMsFrozen);
    }
    if (mode === 'total_time') {
      return Math.max(0, (playerRemainingMs ?? 0) - elapsedMsFrozen);
    }
    return playerRemainingMs ?? 0;
  }

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
  gameFinished = false,
  frozenUntil = null,
}: OnlineTimerDisplayProps) {
  const localReceiveTimeRef = useRef<number>(Date.now());
  const [tick, setTick] = useState(0);

  // server_updated_at / turnStartedAt が変化したらローカル受信時刻を更新
  useEffect(() => {
    localReceiveTimeRef.current = Date.now();
  }, [serverUpdatedAt, turnStartedAt]);

  // frozenUntil が設定されている場合、定刻到達後に再描画トリガーのみ行う
  // NOTE: localReceiveTimeRef.current をここでリセットしてはいけない。
  // リセットすると (now - localReceiveTime) ≈ 0 になり、
  // serverNowFrozen ≈ serverUpdatedAt（入室時刻）になってしまう。
  // effectiveStart = starts_at（入室時刻より後）との差が負となり、
  // per_move なら 30000 - 負値 = 数分超の値を表示するバグが発生する。
  // localReceiveTime は serverUpdatedAt 変化時のみ更新する（上の useEffect）。
  useEffect(() => {
    if (!frozenUntil) return;
    const ms = new Date(frozenUntil).getTime() - Date.now();
    if (ms <= 0) return; // 既に定刻後
    const id = setTimeout(() => {
      setTick((t) => t + 1); // 再描画のみ。localReceiveTimeRef はリセットしない。
    }, ms);
    return () => clearTimeout(id);
  }, [frozenUntil]);

  // 200ms ごとに再描画（ゲーム終了時はタイマー停止）
  useEffect(() => {
    if (!timerConfig || timerConfig.mode === 'none') return;
    if (gameFinished) return; // 終局後はカウントダウン停止
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, [timerConfig, gameFinished]);

  if (!timerConfig || timerConfig.mode === 'none') return null;

  const mode = timerConfig.mode;

  // OM-1c: 定刻前は全プレイヤーの時計を凍結（frozen 状態）
  const isFrozen = frozenUntil ? Date.now() < new Date(frozenUntil).getTime() : false;

  if (mode === 'total_time') {
    return (
      <div className="online-timer-bar">
        {(['black', 'white'] as const).map((player) => {
          const rawRemaining = player === 'black' ? blackRemainingMs : whiteRemainingMs;
          // 手番側のみ elapsed を差し引く。非手番側は DB の remaining_ms をそのまま表示する。
          // これにより「先手が2分考えて着手後も後手のタイマーが減らない」仕様を保証する。
          const isActive = !isFrozen && player === currentPlayer;
          const remaining = isActive
            ? calcDisplayRemainingMs({
                mode: 'total_time',
                timerConfig,
                playerRemainingMs: rawRemaining,
                turnStartedAt,
                serverUpdatedAt,
                localReceiveTime: localReceiveTimeRef.current,
                frozenUntil,
              })
            : (rawRemaining ?? 0);  // 非手番側: DB 値をそのまま表示（elapsed を引かない）
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
    const remaining = isFrozen
      ? timerConfig.perMoveSeconds * 1000
      : calcDisplayRemainingMs({
          mode: 'per_move',
          timerConfig,
          playerRemainingMs: null,
          turnStartedAt,
          serverUpdatedAt,
          localReceiveTime: localReceiveTimeRef.current,
          frozenUntil,
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
