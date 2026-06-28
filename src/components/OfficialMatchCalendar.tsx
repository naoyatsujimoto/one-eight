/**
 * OfficialMatchCalendar.tsx — Official Match Calendar UI (OM-1b)
 *
 * セクション:
 *   - Mini-Calendar: 今月の月カレンダー（公式戦のある日をハイライト）
 *   - Upcoming Match Cards: 公式戦一覧（日時・対戦相手・色・Time Control・Status）
 *   - Enter Match ボタン: enter_official_match RPC 連携
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  listMyOfficialMatches,
  enterOfficialMatch,
  checkOfficialMatchExpiry,
  isEnterWindowOpen,
  msUntilStart,
  type OfficialMatchListItem,
  type OfficialMatchStatus,
} from '../lib/officialMatch';
import { useLang, type Translations } from '../lib/lang';

// ─── 型 ──────────────────────────────────────────────────────────────────────

interface Props {
  /** onEnterOnlineGame(onlineGameId, isOfficial, startsAt) — 公式戦入室後にOnlineBoardへ遷移させる
   *  OM-1c: isOfficial=true / startsAt を渡す。
   *  enableEntry=false の場合は呼ばれない（Enter Match ボタン非表示）。
   */
  onEnterOnlineGame?: (onlineGameId: string, isOfficial?: boolean, startsAt?: string | null) => void;
  /** Enter Match ボタンを表示するか。デフォルト true（既存互換）。
   *  false にすると Enter Match ボタンを非表示にし、Online Play 誘導メッセージを表示する。
   */
  enableEntry?: boolean;
  /** tournament_id によるフィルタ。
   *  'ranked'     = tournament_id IS NULL のみ
   *  'tournament' = tournament_id IS NOT NULL のみ
   *  'all'        = 全件（デフォルト・既存互換）
   */
  filter?: 'ranked' | 'tournament' | 'all';
  /** フィルタ後に対局がなかった場合の空メッセージ（省略時はデフォルト文言）。 */
  emptyMessage?: string;
  /** Recent Results（過去履歴）セクションを表示するか。デフォルト true（既存互換）。
   *  Online Play 側では false を渡して非表示にする。
   *  STATS / UserPage 側は省略（true 相当）のまま。
   */
  showRecentResults?: boolean;
  /** カレンダーの初期選択日（1〜31）。
   *  省略時は null（全件表示）。
   *  STATS / UserPage 側は Today を渡して今日フィルタを初期適用する。
   */
  initialDay?: number | null;
  /** Arena由来（source_kind='arena'）のofficial_matchを含めるか。
   *  デフォルト: false（通常公式戦カレンダーではArena由来を除外）。
   *  Arenaモードの ranked カレンダーでは true を渡す。
   */
  includeArena?: boolean;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: OfficialMatchStatus }) {
  const { t } = useLang();
  const STATUS_LABELS: Record<OfficialMatchStatus, string> = {
    scheduled:  t.omStatusScheduled,
    joinable:   t.omStatusJoinNow,
    live:       t.omStatusLive,
    completed:  t.omStatusCompleted,
    cancelled:  t.omStatusCancelled,
    forfeited:  t.omStatusForfeited,
    no_contest: t.omStatusNoContest,
  };
  const className = `om-badge om-badge-${status}`;
  return <span className={className}>{STATUS_LABELS[status] ?? status}</span>;
}

// ─── Time Control 表示 ────────────────────────────────────────────────────────

function formatTimerConfig(cfg: Record<string, unknown> | null, t: Translations): string {
  if (!cfg) return '—';
  const mode = cfg.mode as string | undefined;
  if (mode === 'total_time') {
    const sec = cfg.totalSeconds as number | undefined;
    if (!sec) return t.omTimerTotal;
    const min = Math.floor(sec / 60);
    const rem = sec % 60;
    return rem > 0 ? `${min}m${rem}s / Player` : `${min}min / Player`;
  }
  if (mode === 'per_move') {
    const sec = cfg.perMoveSeconds as number | undefined;
    if (!sec) return t.omTimerPerMove;
    return `${sec}s / Move`;
  }
  return t.omTimerNoClock;
}

// ─── Match Card ───────────────────────────────────────────────────────────────

function MatchCard({
  match,
  onEnter,
  entering,
  enterError,
  enableEntry,
}: {
  match: OfficialMatchListItem;
  onEnter: (matchId: string) => void;
  entering: boolean;
  enterError: string | null;
  enableEntry: boolean;
}) {
  const { t } = useLang();
  const startsAt = new Date(match.starts_at);
  const dateStr = startsAt.toLocaleDateString('ja-JP', {
    month: 'short', day: 'numeric', weekday: 'short',
  });
  const timeStr = startsAt.toLocaleTimeString('ja-JP', {
    hour: '2-digit', minute: '2-digit',
  });

  // Enter ボタンの有効・無効判定
  // 「新規入室」と「再入室」を分けて判定する。
  // - 新規: status が scheduled/joinable かつ入室ウィンドウ内
  // - 再入室: status が live かつ online_game_id が存在（游び途中に縬けられる）
  // OM-1d: isEnterWindowOpen の上限は totalSeconds ベース（旧: 30分固定）
  const totalSeconds = (match.timer_config?.totalSeconds as number | undefined) ?? 600;
  const windowOpen = isEnterWindowOpen(match.starts_at, totalSeconds);
  const isReEntry = (match.status === 'live' || match.status === 'scheduled' || match.status === 'joinable')
    && match.online_game_id != null;
  const canEnter =
    (
      ((match.status === 'joinable' || match.status === 'scheduled') && windowOpen)
      || isReEntry
    ) &&
    !entering;

  // 残り時間表示（scheduled & 未開始時）
  const msLeft = msUntilStart(match.starts_at);
  let countdownLabel = '';
  if (match.status === 'scheduled' && msLeft > 0) {
    const totalSec = Math.ceil(msLeft / 1000);
    if (totalSec < 60) {
      countdownLabel = `${totalSec}s`;
    } else {
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      countdownLabel = sec > 0 ? `${min}m ${sec}s` : `${min}m`;
    }
  }

  const opponentName = match.opponent_display_name ?? match.opponent_id.slice(0, 8).toUpperCase();
  const myColorLabel = match.my_color === 'black' ? '⚫ Black' : '⚪ White';

  return (
    <div className={`om-card om-card-${match.status}`}>
      {/* ヘッダー行: 日時 + Status */}
      <div className="om-card-header">
        <div className="om-card-datetime">
          <span className="om-card-date">{dateStr}</span>
          <span className="om-card-time">{timeStr}</span>
        </div>
        <StatusBadge status={match.status} />
      </div>

      {/* 対戦情報 */}
      <div className="om-card-body">
        <div className="om-card-opponent">
          <span className="om-card-label">vs</span>
          <span className="om-card-opponent-name">{opponentName}</span>
        </div>
        <div className="om-card-meta">
          <span className="om-card-color">{myColorLabel}</span>
          <span className="om-card-dot">·</span>
          <span className="om-card-tc">{formatTimerConfig(match.timer_config, t)}</span>
          {countdownLabel && (
            <>
              <span className="om-card-dot">·</span>
              <span className="om-card-countdown">{t.omStartsIn(countdownLabel)}</span>
            </>
          )}
        </div>
      </div>

      {/* Enter Match ボタン / エラー */}
      {/* 完了・キャンセル・不戦敗: 入室不可・結果表示 */}
      {(match.status === 'completed' || match.status === 'cancelled' ||
        match.status === 'forfeited' || match.status === 'no_contest') && (
        <div className="om-card-footer">
          <div className="om-card-result">
            {(() => {
              // ─── neutral 表示（終局理由が勝敗と無関係） ───────────────────────
              if (match.status === 'no_contest')
                return <span className="om-result-neutral">— {t.omResultNeutralNoContest}</span>;
              if (match.status === 'cancelled')
                return <span className="om-result-neutral">— {t.omResultNeutralCancelled}</span>;
              if (match.status === 'forfeited')
                return <span className="om-result-neutral">— {t.omResultNeutralForfeited}</span>;

              // ─── 勝敗判定 ─────────────────────────────────────────────────────
              // winner: 'black_user' | 'white_user' | 'draw' | null
              // my_color: 'black' | 'white'
              const isWin =
                (match.winner === 'black_user' && match.my_color === 'black') ||
                (match.winner === 'white_user' && match.my_color === 'white');
              const isLoss =
                (match.winner === 'black_user' && match.my_color === 'white') ||
                (match.winner === 'white_user' && match.my_color === 'black');
              const isDraw = match.winner === 'draw';
              const isTimeout = match.end_reason === 'timeout';
              // forfeit_black / forfeit_white = no-show（timeout とは別概念）
              const isNoShow = match.end_reason === 'forfeit_black' || match.end_reason === 'forfeit_white';

              if (isDraw)
                return <span className="om-result-draw">△ {t.omResultDraw}</span>;
              if (isWin)
                return <span className="om-result-win">
                  ○ {isNoShow ? t.omResultWinNoShow : isTimeout ? t.omResultWinTimeout : t.omResultWin}
                </span>;
              if (isLoss)
                return <span className="om-result-loss">
                  × {isNoShow ? t.omResultLossNoShow : isTimeout ? t.omResultLossTimeout : t.omResultLoss}
                </span>;
              // winner 未確定 or null（完了状態で結果不明）
              return <span className="om-result-neutral">— </span>;
            })()}
          </div>
          <button type="button" className="om-enter-btn om-enter-btn-disabled" disabled>
            {t.omEnterMatch}
          </button>
        </div>
      )}

      {(match.status === 'joinable' || match.status === 'scheduled' || match.status === 'live') && (
        <div className="om-card-footer">
          {enableEntry ? (
            <>
              {enterError && (
                <div className="om-enter-error">{enterError}</div>
              )}
              <button
                type="button"
                className={canEnter ? 'om-enter-btn' : 'om-enter-btn om-enter-btn-disabled'}
                disabled={!canEnter}
                onClick={() => onEnter(match.id)}
              >
                {entering ? t.omEntering : t.omEnterMatch}
              </button>
              {match.status === 'scheduled' && !windowOpen && (
                <span className="om-enter-note">{t.omAvailable15Min}</span>
              )}
              {isReEntry && (
                <span className="om-enter-note">{t.omRejoinInProgress}</span>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── Mini Calendar ────────────────────────────────────────────────────────────

function MiniCalendar({
  matches,
  selectedDate,
  onSelectDate,
  year,
  month,
  onPrevMonth,
  onNextMonth,
  onToday,
}: {
  matches: OfficialMatchListItem[];
  selectedDate: number | null;
  onSelectDate: (day: number | null) => void;
  year: number;
  month: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
}) {
  // 月初の曜日（0=Sun）
  const firstDay = new Date(year, month, 1).getDay();
  // 月の日数
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // 公式戦がある日のセット
  const matchDays = new Set<number>();
  for (const m of matches) {
    const d = new Date(m.starts_at);
    if (d.getFullYear() === year && d.getMonth() === month) {
      matchDays.add(d.getDate());
    }
  }

  const { t } = useLang();
  const now = new Date();
  const todayYear = now.getFullYear();
  const todayMonth = now.getMonth();
  const todayDate = now.getDate();
  const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  // グリッド: 最大 6 週 × 7 = 42 セル
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric',
  });

  function handleClick(day: number | null) {
    if (!day) return;
    if (selectedDate === day) {
      onSelectDate(null); // トグル: 再クリックで全表示に戻す
    } else {
      onSelectDate(day);
    }
  }

  const isCurrentMonth = year === todayYear && month === todayMonth;

  return (
    <div className="om-mini-cal">
      <div className="om-mini-cal-nav">
        <button
          type="button"
          className="om-mini-cal-nav-btn"
          onClick={onPrevMonth}
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="om-mini-cal-header">{monthLabel}</span>
        <button
          type="button"
          className="om-mini-cal-nav-btn"
          onClick={onNextMonth}
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      {!isCurrentMonth && (
        <div className="om-mini-cal-today-row">
          <button
            type="button"
            className="om-mini-cal-today-btn"
            onClick={onToday}
          >
            {t.omToday}
          </button>
        </div>
      )}
      <div className="om-mini-cal-grid">
        {DOW_LABELS.map((d, i) => (
          <div key={i} className="om-mini-cal-dow">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="om-mini-cal-empty" />;
          const hasMatch = matchDays.has(day);
          const isToday = day === todayDate && isCurrentMonth;
          const isSelected = day === selectedDate;
          let cls = 'om-mini-cal-day';
          if (isToday) cls += ' om-mini-cal-today';
          if (hasMatch) cls += ' om-mini-cal-has-match';
          if (isSelected) cls += ' om-mini-cal-selected';
          return (
            <button
              key={i}
              type="button"
              className={cls}
              onClick={() => handleClick(day)}
              aria-label={`${monthLabel} ${day}${hasMatch ? ' (match)' : ''}`}
            >
              {day}
              {hasMatch && <span className="om-mini-cal-dot" />}
            </button>
          );
        })}
      </div>
      {selectedDate !== null && (
        <button
          type="button"
          className="om-mini-cal-clear"
          onClick={() => onSelectDate(null)}
        >
          {t.omShowAllMatches}
        </button>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function OfficialMatchCalendar({
  onEnterOnlineGame,
  enableEntry = true,
  filter = 'all',
  emptyMessage,
  showRecentResults = true,
  initialDay = null,
  includeArena = false,
}: Props) {
  const { t } = useLang();
  const [matches, setMatches] = useState<OfficialMatchListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [enteringId, setEnteringId] = useState<string | null>(null);
  const [enterErrors, setEnterErrors] = useState<Record<string, string>>({});
  const [selectedDay, setSelectedDay] = useState<number | null>(initialDay);

  // 表示中の年月 state（初期値: today）
  const nowInit = new Date();
  const [visibleYear, setVisibleYear] = useState<number>(nowInit.getFullYear());
  const [visibleMonth, setVisibleMonth] = useState<number>(nowInit.getMonth());

  // stale expiry チェック用 ref（無限ループ防止）
  const checkedExpiryIdsRef = useRef<Set<string>>(new Set());
  const expiryCheckInFlightRef = useRef(false);

  // 公式戦一覧を取得（過去12ヶ月 + 今後3ヶ月）
  const loadMatches = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const from = new Date();
      from.setMonth(from.getMonth() - 12);
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
      const to = new Date();
      to.setMonth(to.getMonth() + 3);

      const result = await listMyOfficialMatches({
        from: from.toISOString(),
        to: to.toISOString(),
        includeArena,
      });

      if ('error' in result) {
        setLoadError(result.error);
        setMatches([]);
      } else {
        // starts_at 昇順でソート
        const sorted = [...result].sort(
          (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
        );
        setMatches(sorted);
      }
    } catch (e) {
      setLoadError(String(e));
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [includeArena]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  // Enter Match
  const handleEnter = useCallback(async (matchId: string) => {
    setEnteringId(matchId);
    setEnterErrors((prev) => {
      const next = { ...prev };
      delete next[matchId];
      return next;
    });

    const result = await enterOfficialMatch(matchId);

    if ('error' in result) {
      setEnterErrors((prev) => ({ ...prev, [matchId]: result.error }));
      setEnteringId(null);
    } else {
      setEnteringId(null);
      // OM-1c: isOfficial=true / startsAt を渡す
      onEnterOnlineGame?.(result.onlineGameId, result.isOfficial, result.startsAt);
    }
  }, [onEnterOnlineGame]);

  // filter prop によるフィルタリング（ranked / tournament / all）
  const typeFilteredMatches = filter === 'ranked'
    ? matches.filter((m) => m.tournament_id == null)
    : filter === 'tournament'
    ? matches.filter((m) => m.tournament_id != null)
    : matches;

  // 月移動ハンドラ
  const handlePrevMonth = useCallback(() => {
    setVisibleYear((y) => visibleMonth === 0 ? y - 1 : y);
    setVisibleMonth((m) => m === 0 ? 11 : m - 1);
    setSelectedDay(null);
  }, [visibleMonth]);

  const handleNextMonth = useCallback(() => {
    setVisibleYear((y) => visibleMonth === 11 ? y + 1 : y);
    setVisibleMonth((m) => m === 11 ? 0 : m + 1);
    setSelectedDay(null);
  }, [visibleMonth]);

  const handleToday = useCallback(() => {
    const now = new Date();
    setVisibleYear(now.getFullYear());
    setVisibleMonth(now.getMonth());
    setSelectedDay(now.getDate());
  }, []);

  // Mini-Calendar でフィルタリング（常に visibleYear/visibleMonth で絞る）
  const filteredMatches = typeFilteredMatches.filter((m) => {
    const d = new Date(m.starts_at);
    if (d.getFullYear() !== visibleYear || d.getMonth() !== visibleMonth) return false;
    if (selectedDay !== null) return d.getDate() === selectedDay;
    return true;
  });

  // 表示: scheduled/joinable/live を Upcoming、completed 以降を Past に分ける
  const upcomingMatches = filteredMatches.filter(
    (m) => m.status === 'scheduled' || m.status === 'joinable' || m.status === 'live'
  );
  const pastMatches = filteredMatches.filter(
    (m) => m.status === 'completed' || m.status === 'cancelled' ||
           m.status === 'forfeited' || m.status === 'no_contest'
  );

  // OM-1d: stale な scheduled/joinable match を no_contest チェック（副作用のみ・非同期）
  // 無限ループ防止:
  //   - checkedExpiryIdsRef: 同一match.idを重複チェックしない
  //   - expiryCheckInFlightRef: 並行実行防止
  //   - actionableStale: 結果確定済み（winner/end_reason）は除外
  //   - silent reload: loading点滅を防ぐ
  useEffect(() => {
    // inFlight中は再実行しない
    if (expiryCheckInFlightRef.current) return;

    const actionableStale = matches.filter((m) => {
      // 確定済みステータスは除外
      if (['completed', 'cancelled', 'forfeited', 'no_contest'].includes(m.status)) return false;
      // winner または end_reason が確定済みなら除外（DB側で処理済みの可能性が高い）
      if (m.winner != null || m.end_reason != null) return false;
      // 既チェック済みIDはスキップ
      if (checkedExpiryIdsRef.current.has(m.id)) return false;
      // starts_at + totalSeconds を過ぎていれば expiry チェック対象
      const totalSec = (m.timer_config?.totalSeconds as number | undefined) ?? 600;
      const expiresAt = new Date(m.starts_at).getTime() + totalSec * 1000;
      return Date.now() > expiresAt;
    });

    if (actionableStale.length === 0) return;

    expiryCheckInFlightRef.current = true;
    // チェック済みIDをすぐに記録して再エントリを防ぐ
    for (const m of actionableStale) {
      checkedExpiryIdsRef.current.add(m.id);
    }

    void Promise.all(actionableStale.map((m) => checkOfficialMatchExpiry(m.id))).then(() => {
      expiryCheckInFlightRef.current = false;
      // silent=true: loading点滅を防ぎ、background refreshとして再取得
      void loadMatches({ silent: true });
    }).catch(() => {
      expiryCheckInFlightRef.current = false;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches]);

  if (loading) {
    return (
      <div className="om-loading">{t.omLoading}</div>
    );
  }

  if (loadError) {
    return (
      <div className="om-error">
        <span>{t.omLoadFailed}</span>
        <button type="button" className="om-retry-btn" onClick={() => loadMatches()}>
          {t.omRetry}
        </button>
      </div>
    );
  }

  return (
    <div className="om-root">
      {/* Mini Calendar */}
      <MiniCalendar
        matches={matches}
        selectedDate={selectedDay}
        onSelectDate={setSelectedDay}
        year={visibleYear}
        month={visibleMonth}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onToday={handleToday}
      />

      {/* Upcoming Matches */}
      <div className="om-section-title">
        {selectedDay
          ? t.omMatchesOn(new Date(visibleYear, visibleMonth, selectedDay).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }))
          : t.omUpcomingMatches}
      </div>

      {upcomingMatches.length === 0 && (
        <div className="om-empty">
          {emptyMessage ??
            (typeFilteredMatches.length === 0 && matches.length === 0
              ? t.omNoUpcomingOfficial
              : selectedDay && pastMatches.length === 0
              ? t.omNoMatchesOnDate
              : !selectedDay
              ? t.omNoUpcomingMatches
              : null)}
        </div>
      )}

      <div className="om-cards">
        {upcomingMatches.map((m) => (
          <MatchCard
            key={m.id}
            match={m}
            onEnter={handleEnter}
            entering={enteringId === m.id}
            enterError={enterErrors[m.id] ?? null}
            enableEntry={enableEntry}
          />
        ))}
      </div>

      {/* Past Matches（折りたたみなし・最大 5件表示）
           showRecentResults=false の場合（Online Play側）は非表示 */}
      {showRecentResults && pastMatches.length > 0 && (
        <>
          <div className="om-section-title om-section-title-muted">{t.omRecentResults}</div>
          <div className="om-cards">
            {pastMatches.slice(0, 5).map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                onEnter={handleEnter}
                entering={enteringId === m.id}
                enterError={enterErrors[m.id] ?? null}
                enableEntry={enableEntry}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
