/**
 * GameBoardHeader.tsx — V5 Arc Progress ヘッダー
 *
 * Naoya 作成の「V5 — Arc Progress」モックを実アプリに移植した対局ヘッダー。
 * PvC / PvP / Online / Official Match 全モードで使用可能。
 *
 * ## 表示モード
 *
 * ### Online モード (mode === 'online')
 *   - OnlineTimerDisplay と同じ計算ロジックを使用
 *   - blackRemainingMs / whiteRemainingMs / turnStartedAt / frozenUntil を受け取る
 *   - ステータス pill: pregame / your-turn / opp-turn / warn / crit
 *
 * ### Local モード (mode === 'local')
 *   - App.tsx から playerTimers / currentMoveRemainingMs を受け取る
 *   - CPU手番中は opp-turn 扱い
 *
 * ## 変更禁止
 *   - タイマー計算式 (calcPerMoveRemainingMs / calcTotalTimeActiveRemainingMs) は変更しない
 *   - apply_online_move / claim_timeout / RPC / DB schema に触れない
 *   - timerConfig.mode === 'none' の場合は null を返す（タイマー非表示）
 *
 * ## CSS クラスプレフィックス
 *   - `gbh-` (GameBoardHeader) で既存クラスとの衝突を回避
 */
import { useEffect, useRef, useState } from 'react';
import type { TimerConfig } from '../game/timerTypes';

// ─── 型定義 ──────────────────────────────────────────────────────────────────

interface BaseProps {
  /** タイマー設定。null / mode='none' の場合は何も表示しない */
  timerConfig: TimerConfig | null;
  /** 現在手番プレイヤー */
  currentPlayer: 'black' | 'white';
  /** ゲーム終了時 true → タイマー停止 */
  gameFinished?: boolean;
}

interface OnlineProps extends BaseProps {
  mode: 'online';
  /** Online: 黒の残り時間 (ms) */
  blackRemainingMs: number | null;
  /** Online: 白の残り時間 (ms) */
  whiteRemainingMs: number | null;
  /** Online: 手番開始時刻 (ISO) */
  turnStartedAt: string | null;
  /** Online: サーバー更新時刻 (ISO) — 互換性のため残す */
  serverUpdatedAt?: string | null;
  /** Online: 公式戦の開始時刻 (ISO)。この時刻まで時計を凍結 */
  frozenUntil?: string | null;
  /** Online: 自分の手番かどうか (pill の表示に使用) */
  isMyTurn?: boolean;
  /** Online: 定刻前待機中かどうか */
  isBeforeOfficialStart?: boolean;
}

interface LocalProps extends BaseProps {
  mode: 'local';
  /** Local: total_time 用プレイヤー別残り時間 */
  playerTimers?: { black: number; white: number } | null;
  /** Local: per_move 用現在手番の残り時間 (ms) */
  currentMoveRemainingMs?: number | null;
  /** Local: CPU手番中かどうか */
  isCpuTurn?: boolean;
  /** BY-6: total_time + byoyomi 用: 手番プレイヤーの秒読み残り時間 (ms)。秒読み中でない場合は null */
  byoyomiActiveMs?: number | null;
}

export type GameBoardHeaderProps = OnlineProps | LocalProps;

// ─── 時刻フォーマット ──────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Online タイマー計算 (OnlineTimerDisplay.tsx からコピー・変更禁止) ──────────

function calcPerMoveRemainingMs(
  turnStartedAt: string | null,
  perMoveMs: number,
  frozenUntil: string | null | undefined,
): number {
  const now = Date.now();
  if (frozenUntil) {
    const frozenUntilMs = new Date(frozenUntil).getTime();
    if (now < frozenUntilMs) return perMoveMs;
    const base = turnStartedAt
      ? Math.max(new Date(turnStartedAt).getTime(), frozenUntilMs)
      : frozenUntilMs;
    return Math.min(perMoveMs, Math.max(0, perMoveMs - (now - base)));
  }
  if (!turnStartedAt) return perMoveMs;
  const elapsed = now - new Date(turnStartedAt).getTime();
  return Math.min(perMoveMs, Math.max(0, perMoveMs - elapsed));
}

function calcTotalTimeActiveRemainingMs(
  playerRemainingMs: number | null,
  turnStartedAt: string | null,
  frozenUntil: string | null | undefined,
  initialTotalMs: number,
): number {
  if (!turnStartedAt) return Math.min(playerRemainingMs ?? initialTotalMs, initialTotalMs);
  const now = Date.now();
  let effectiveStart = new Date(turnStartedAt).getTime();
  if (frozenUntil) {
    const frozenUntilMs = new Date(frozenUntil).getTime();
    effectiveStart = Math.max(effectiveStart, frozenUntilMs);
  }
  const elapsed = Math.max(0, now - effectiveStart);
  return Math.min(initialTotalMs, Math.max(0, (playerRemainingMs ?? initialTotalMs) - elapsed));
}

// ─── BY-4: total_time + byoyomi 表示段階ヘルパー (OnlineTimerDisplay と同一ロジック) ──
/**
 * BY-4: total_time + byoyomi の表示段階を返す。
 * 既存 calcTotalTimeActiveRemainingMs の式は変えない。
 * 秒読み段階の少ない計算のみ追加。
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

// ─── 警告レベル判定 ────────────────────────────────────────────────────────────

type WarnLevel = 'crit' | 'warn' | null;

function warningLevel(ms: number): WarnLevel {
  if (ms <= 10000) return 'crit';
  if (ms <= 30000) return 'warn';
  return null;
}

// ─── Arc Progress Face (SVGアーク + デジタル時刻) ────────────────────────────

interface ArcFaceProps {
  /** 残り時間 / 初期時間 の割合 [0, 1] */
  pct: number;
  /** デジタル表示時刻文字列 */
  timeStr: string;
  /** アークのストローク色 */
  color: string;
  /** 手番中かどうか */
  active: boolean;
  /** 警告レベル */
  warn: WarnLevel;
  /** プレイヤー名 ("BLACK" / "WHITE") */
  name: string;
  /** 駒ドットのスタイル ('black' | 'white') */
  piece: 'black' | 'white';
}

function ArcFace({ pct, timeStr, color, active, warn, name, piece }: ArcFaceProps) {
  const R = 36;
  const C = 2 * Math.PI * R;
  const dash = C * Math.max(0, Math.min(1, pct));

  // 警告色オーバーライド
  const strokeColor = warn === 'crit' ? '#c4493e' : warn === 'warn' ? '#c48a3e' : color;

  const cls = [
    'gbh-clock',
    active ? 'gbh-clock-active' : '',
    warn ? `gbh-clock-warn-${warn}` : '',
  ].filter(Boolean).join(' ');

  // 12分割の目盛り
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = (i * 30 - 90) * (Math.PI / 180);
    const isMajor = i % 3 === 0;
    const r1 = isMajor ? 29 : 30.5;
    const r2 = 33;
    return { i, a, r1, r2, isMajor };
  });

  return (
    <div className={cls}>
      <div className="gbh-clock-head">
        <span className={`gbh-piece-mini gbh-piece-${piece}`} />
        <span className="gbh-clock-name">{name}</span>
      </div>
      <div className="gbh-face-wrap">
        <svg className="gbh-arc-svg" viewBox="0 0 84 84" aria-hidden="true">
          {/* 背景円 */}
          <circle cx="42" cy="42" r={R} className="gbh-arc-bg" />
          {/* プログレスアーク */}
          <circle
            cx="42" cy="42" r={R}
            className="gbh-arc-fg"
            strokeDasharray={`${dash} ${C}`}
            stroke={strokeColor}
            transform="rotate(-90 42 42)"
          />
          {/* 目盛り */}
          {ticks.map(({ i, a, r1, r2, isMajor }) => (
            <line key={i}
              x1={42 + r1 * Math.cos(a)} y1={42 + r1 * Math.sin(a)}
              x2={42 + r2 * Math.cos(a)} y2={42 + r2 * Math.sin(a)}
              className={`gbh-tick${isMajor ? ' gbh-tick-major' : ''}`}
            />
          ))}
        </svg>
        <div className="gbh-face-inner">
          <span className="gbh-time-text">{timeStr}</span>
        </div>
        {active && <span className="gbh-pulse-ring" />}
      </div>
    </div>
  );
}

// ─── ステータス Pill ───────────────────────────────────────────────────────────

type StatusKind = 'pregame' | 'your-turn' | 'opp-turn' | 'warn' | 'crit';

interface StatusPillProps {
  kind: StatusKind;
  text: string;
}

function StatusPill({ kind, text }: StatusPillProps) {
  return (
    <div className={`gbh-status-pill gbh-status-${kind}`}>
      <span className="gbh-status-dot" />
      <span className="gbh-status-text">{text}</span>
    </div>
  );
}

// ─── メインコンポーネント ─────────────────────────────────────────────────────

export function GameBoardHeader(props: GameBoardHeaderProps) {
  const { timerConfig, currentPlayer, gameFinished = false } = props;
  const [tick, setTick] = useState(0);

  // frozenUntil サポート (Online のみ)
  const frozenUntil = props.mode === 'online' ? (props.frozenUntil ?? null) : null;
  const isBeforeOfficialStart = props.mode === 'online' ? (props.isBeforeOfficialStart ?? false) : false;

  // frozenUntil 到達後に再描画
  useEffect(() => {
    if (!frozenUntil) return;
    const msUntilFrozen = new Date(frozenUntil).getTime() - Date.now();
    if (msUntilFrozen <= 0) return;
    const id = setTimeout(() => setTick((t) => t + 1), msUntilFrozen);
    return () => clearTimeout(id);
  }, [frozenUntil]);

  // 200ms ごとに再描画
  useEffect(() => {
    if (!timerConfig || timerConfig.mode === 'none') return;
    if (gameFinished) return;
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, [timerConfig, gameFinished]);

  // timerConfig が null / none の場合は何も表示しない
  if (!timerConfig || timerConfig.mode === 'none') return null;

  void tick; // lint 抑制

  const isFrozen = frozenUntil ? Date.now() < new Date(frozenUntil).getTime() : false;
  const mode = timerConfig.mode;

  // ─── per_move ──────────────────────────────────────────────────────────────
  if (mode === 'per_move') {
    return <PerMoveHeader props={props} timerConfig={timerConfig as TimerConfig & { mode: 'per_move' }} currentPlayer={currentPlayer} isFrozen={isFrozen} />;
  }

  // ─── total_time ────────────────────────────────────────────────────────────
  if (mode === 'total_time') {
    return <TotalTimeHeader props={props} timerConfig={timerConfig as TimerConfig & { mode: 'total_time' }} currentPlayer={currentPlayer} isFrozen={isFrozen} isBeforeOfficialStart={isBeforeOfficialStart} />;
  }

  return null;
}

// ─── 待機カウントダウン文字列生成 ──────────────────────────────────────────────

function buildWaitingText(frozenUntil: string | null | undefined): string {
  if (!frozenUntil) return 'WAITING';
  const ms = new Date(frozenUntil).getTime() - Date.now();
  if (ms <= 0) return 'WAITING';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const timeStr = `${m}:${s.toString().padStart(2, '0')}`;
  return `WAITING · ${timeStr}`;
}

// ─── per_move サブコンポーネント ──────────────────────────────────────────────

function PerMoveHeader({
  props,
  timerConfig,
  currentPlayer,
  isFrozen,
}: {
  props: GameBoardHeaderProps;
  timerConfig: TimerConfig & { mode: 'per_move' };
  currentPlayer: 'black' | 'white';
  isFrozen: boolean;
}) {
  const perMoveMs = timerConfig.perMoveSeconds * 1000;

  // 残り時間計算
  let remaining: number;
  if (props.mode === 'online') {
    remaining = calcPerMoveRemainingMs(props.turnStartedAt ?? null, perMoveMs, props.frozenUntil ?? null);
  } else {
    remaining = props.currentMoveRemainingMs ?? perMoveMs;
  }

  const warn = isFrozen ? null : warningLevel(remaining);
  const pct = remaining / perMoveMs;

  // ステータス判定
  const isCpuTurn = props.mode === 'local' ? (props.isCpuTurn ?? false) : false;
  const isMyTurn = props.mode === 'online' ? (props.isMyTurn ?? true) : !isCpuTurn;
  const frozenUntilOnline = props.mode === 'online' ? (props.frozenUntil ?? null) : null;
  const statusKind: StatusKind = isFrozen ? 'pregame'
    : warn === 'crit' ? 'crit'
    : warn === 'warn' ? 'warn'
    : isMyTurn ? 'your-turn'
    : 'opp-turn';
  const statusText = isFrozen ? buildWaitingText(frozenUntilOnline)
    : isMyTurn ? 'YOUR MOVE'
    : 'THINKING';

  const activeColor = currentPlayer === 'black' ? '#3a2a1c' : '#9a8d76';
  const blackActive = currentPlayer === 'black';
  const whiteActive = currentPlayer === 'white';

  // per_move は手番側のみアーク表示
  const blackPct = blackActive ? pct : 1.0;
  const whitePct = whiteActive ? pct : 1.0;
  const blackWarn = blackActive ? warn : null;
  const whiteWarn = whiteActive ? warn : null;
  const blackMs = blackActive ? remaining : perMoveMs;
  const whiteMs = whiteActive ? remaining : perMoveMs;

  return (
    <div className="gbh-wrap">
      <div className="gbh-status-row">
        <StatusPill kind={statusKind} text={statusText} />
      </div>
      <div className="gbh-clocks-row">
        <ArcFace
          pct={blackPct}
          timeStr={formatMs(blackMs)}
          color={activeColor}
          active={blackActive}
          warn={blackWarn}
          name="BLACK"
          piece="black"
        />
        <div className="gbh-axis" />
        <ArcFace
          pct={whitePct}
          timeStr={formatMs(whiteMs)}
          color="#9a8d76"
          active={whiteActive}
          warn={whiteWarn}
          name="WHITE"
          piece="white"
        />
      </div>
    </div>
  );
}

// ─── total_time サブコンポーネント ────────────────────────────────────────────

function TotalTimeHeader({
  props,
  timerConfig,
  currentPlayer,
  isFrozen,
  isBeforeOfficialStart,
}: {
  props: GameBoardHeaderProps;
  timerConfig: TimerConfig & { mode: 'total_time' };
  currentPlayer: 'black' | 'white';
  isFrozen: boolean;
  isBeforeOfficialStart: boolean;
}) {
  const initialTotalMs = timerConfig.totalSeconds * 1000;
  // BY-4: byoyomiMs (0 なら秒読みなし)
  const byoyomiMs = (timerConfig.byoyomiSeconds ?? 0) * 1000;

  // 各プレイヤーの残り時間を計算
  // BY-4: 手番側 (online) は byoyomi 段階判定を使用
  let blackMs: number;
  let whiteMs: number;
  // BY-4: ArcFace に渡す表示文字列（秒読み中は "BY M:SS"）
  let blackTimeStr: string;
  let whiteTimeStr: string;
  // BY-4: 秒読み中の warn 上書き用
  let blackByoyomi = false;
  let whiteByoyomi = false;

  if (props.mode === 'online') {
    const turnStartedAt = props.turnStartedAt ?? null;
    const frozenUntil = props.frozenUntil ?? null;
    const blackActive = !isFrozen && currentPlayer === 'black';
    const whiteActive = !isFrozen && currentPlayer === 'white';

    if (blackActive) {
      const { phase, remainingMs } = calcTotalTimeWithByoyomi(
        props.blackRemainingMs ?? null, turnStartedAt, frozenUntil, initialTotalMs, byoyomiMs
      );
      blackMs = remainingMs;
      blackByoyomi = phase === 'byoyomi';
      blackTimeStr = blackByoyomi ? `BY ${formatMs(remainingMs)}` : formatMs(remainingMs);
    } else {
      blackMs = Math.min(props.blackRemainingMs ?? initialTotalMs, initialTotalMs);
      blackTimeStr = formatMs(blackMs);
    }

    if (whiteActive) {
      const { phase, remainingMs } = calcTotalTimeWithByoyomi(
        props.whiteRemainingMs ?? null, turnStartedAt, frozenUntil, initialTotalMs, byoyomiMs
      );
      whiteMs = remainingMs;
      whiteByoyomi = phase === 'byoyomi';
      whiteTimeStr = whiteByoyomi ? `BY ${formatMs(remainingMs)}` : formatMs(remainingMs);
    } else {
      whiteMs = Math.min(props.whiteRemainingMs ?? initialTotalMs, initialTotalMs);
      whiteTimeStr = formatMs(whiteMs);
    }
  } else {
    // Local (PvC): playerTimers から取得（BY-6: byoyomi 対応）
    const blackRaw = props.playerTimers?.black ?? initialTotalMs;
    const whiteRaw = props.playerTimers?.white ?? initialTotalMs;
    // BY-6: 秒読み中の残り時間（App.tsxから渡される）
    const byoyomiLeft = props.mode === 'local' ? (props.byoyomiActiveMs ?? null) : null;

    if (byoyomiMs > 0) {
      const blackActive = !isFrozen && currentPlayer === 'black';
      const whiteActive = !isFrozen && currentPlayer === 'white';

      if (blackActive && blackRaw <= 0 && byoyomiLeft !== null) {
        blackMs = 0;
        blackByoyomi = true;
        blackTimeStr = `BY ${formatMs(byoyomiLeft)}`;
      } else {
        blackMs = blackRaw;
        blackTimeStr = formatMs(blackMs);
      }

      if (whiteActive && whiteRaw <= 0 && byoyomiLeft !== null) {
        whiteMs = 0;
        whiteByoyomi = true;
        whiteTimeStr = `BY ${formatMs(byoyomiLeft)}`;
      } else {
        whiteMs = whiteRaw;
        whiteTimeStr = formatMs(whiteMs);
      }
    } else {
      blackMs = blackRaw;
      whiteMs = whiteRaw;
      blackTimeStr = formatMs(blackMs);
      whiteTimeStr = formatMs(whiteMs);
    }
  }

  // 手番側の残り時間で警告判定
  const activeMs = currentPlayer === 'black' ? blackMs : whiteMs;
  // BY-4: 秒読み中は crit 固定
  const activeByoyomi = currentPlayer === 'black' ? blackByoyomi : whiteByoyomi;
  const warn = isFrozen ? null : activeByoyomi ? 'crit' : warningLevel(activeMs);

  const blackPct = blackMs / initialTotalMs;
  const whitePct = whiteMs / initialTotalMs;
  const blackActive = !isFrozen && currentPlayer === 'black';
  const whiteActive = !isFrozen && currentPlayer === 'white';
  // BY-4: 秒読み中は crit 固定
  const blackWarn: WarnLevel = blackActive ? (blackByoyomi ? 'crit' : warn) : null;
  const whiteWarn: WarnLevel = whiteActive ? (whiteByoyomi ? 'crit' : warn) : null;

  // ステータス判定
  const isCpuTurn = props.mode === 'local' ? (props.isCpuTurn ?? false) : false;
  const isMyTurn = props.mode === 'online' ? (props.isMyTurn ?? true) : !isCpuTurn;

  let statusKind: StatusKind;
  let statusText: string;

  const frozenUntilForText = props.mode === 'online' ? (props.frozenUntil ?? null) : null;

  if (isFrozen || isBeforeOfficialStart) {
    statusKind = 'pregame';
    statusText = buildWaitingText(frozenUntilForText);
  } else if (warn === 'crit') {
    statusKind = 'crit';
    statusText = isMyTurn ? 'YOUR MOVE' : 'THINKING';
  } else if (warn === 'warn') {
    statusKind = 'warn';
    statusText = isMyTurn ? 'YOUR MOVE' : 'THINKING';
  } else if (isMyTurn) {
    statusKind = 'your-turn';
    statusText = 'YOUR MOVE';
  } else {
    statusKind = 'opp-turn';
    statusText = 'THINKING';
  }

  return (
    <div className="gbh-wrap">
      <div className="gbh-status-row">
        <StatusPill kind={statusKind} text={statusText} />
      </div>
      <div className="gbh-clocks-row">
        <ArcFace
          pct={blackPct}
          timeStr={blackTimeStr}
          color="#3a2a1c"
          active={blackActive}
          warn={blackWarn}
          name="BLACK"
          piece="black"
        />
        <div className="gbh-axis" />
        <ArcFace
          pct={whitePct}
          timeStr={whiteTimeStr}
          color="#9a8d76"
          active={whiteActive}
          warn={whiteWarn}
          name="WHITE"
          piece="white"
        />
      </div>
    </div>
  );
}
