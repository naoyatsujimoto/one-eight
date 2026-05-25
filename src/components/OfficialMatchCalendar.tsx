/**
 * OfficialMatchCalendar.tsx — Official Match Calendar UI (OM-1b)
 *
 * セクション:
 *   - Mini-Calendar: 今月の月カレンダー（公式戦のある日をハイライト）
 *   - Upcoming Match Cards: 公式戦一覧（日時・対戦相手・色・Time Control・Status）
 *   - Enter Match ボタン: enter_official_match RPC 連携
 */

import { useEffect, useState, useCallback } from 'react';
import {
  listMyOfficialMatches,
  enterOfficialMatch,
  isEnterWindowOpen,
  msUntilStart,
  type OfficialMatchListItem,
  type OfficialMatchStatus,
} from '../lib/officialMatch';
import { useLang } from '../lib/lang';

// ─── 型 ──────────────────────────────────────────────────────────────────────

interface Props {
  /** onEnterOnlineGame(onlineGameId, isOfficial, startsAt) — 公式戦入室後にOnlineBoardへ遷移させる
   *  OM-1c: isOfficial=true / startsAt を渡す。
   */
  onEnterOnlineGame: (onlineGameId: string, isOfficial?: boolean, startsAt?: string | null) => void;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  OfficialMatchStatus,
  { label: string; className: string }
> = {
  scheduled: { label: 'Scheduled', className: 'om-badge om-badge-scheduled' },
  joinable:  { label: 'Join Now',  className: 'om-badge om-badge-joinable' },
  live:      { label: 'Live',      className: 'om-badge om-badge-live' },
  completed: { label: 'Completed', className: 'om-badge om-badge-completed' },
  cancelled: { label: 'Cancelled', className: 'om-badge om-badge-cancelled' },
  forfeited: { label: 'Forfeited', className: 'om-badge om-badge-forfeited' },
};

function StatusBadge({ status }: { status: OfficialMatchStatus }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: 'om-badge om-badge-scheduled' };
  return <span className={cfg.className}>{cfg.label}</span>;
}

// ─── Time Control 表示 ────────────────────────────────────────────────────────

function formatTimerConfig(cfg: Record<string, unknown> | null): string {
  if (!cfg) return '—';
  const mode = cfg.mode as string | undefined;
  if (mode === 'total_time') {
    const ms = cfg.total_time_ms as number | undefined;
    if (!ms) return 'Total';
    const min = Math.round(ms / 60000);
    return `${min}min Total`;
  }
  if (mode === 'per_move') {
    const ms = cfg.per_move_ms as number | undefined;
    if (!ms) return 'Per Move';
    const sec = Math.round(ms / 1000);
    return `${sec}s / Move`;
  }
  return 'No Clock';
}

// ─── Match Card ───────────────────────────────────────────────────────────────

function MatchCard({
  match,
  onEnter,
  entering,
  enterError,
}: {
  match: OfficialMatchListItem;
  onEnter: (matchId: string) => void;
  entering: boolean;
  enterError: string | null;
}) {
  const startsAt = new Date(match.starts_at);
  const dateStr = startsAt.toLocaleDateString('ja-JP', {
    month: 'short', day: 'numeric', weekday: 'short',
  });
  const timeStr = startsAt.toLocaleTimeString('ja-JP', {
    hour: '2-digit', minute: '2-digit',
  });

  // Enter ボタンの有効・無効判定
  const windowOpen = isEnterWindowOpen(match.starts_at);
  const canEnter =
    (match.status === 'joinable' || match.status === 'scheduled') &&
    windowOpen &&
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
          <span className="om-card-tc">{formatTimerConfig(match.timer_config)}</span>
          {countdownLabel && (
            <>
              <span className="om-card-dot">·</span>
              <span className="om-card-countdown">Starts in {countdownLabel}</span>
            </>
          )}
        </div>
      </div>

      {/* Enter Match ボタン / エラー */}
      {/* 完了・キャンセル・不戦敗: 入室不可・結果表示 */}
      {(match.status === 'completed' || match.status === 'cancelled' || match.status === 'forfeited') && (
        <div className="om-card-footer">
          {match.result && (
            <div className="om-card-result">
              {match.winner === 'black_user'
                ? (match.my_color === 'black' ? '⚔️ 勝利' : '⚔️ 敗北')
                : match.winner === 'white_user'
                ? (match.my_color === 'white' ? '⚔️ 勝利' : '⚔️ 敗北')
                : match.winner === 'draw' ? '⚔️ 引き分け' : ''}
            </div>
          )}
          <button
            type="button"
            className="om-enter-btn om-enter-btn-disabled"
            disabled
          >
            Enter Match
          </button>
        </div>
      )}

      {(match.status === 'joinable' || match.status === 'scheduled' || match.status === 'live') && (
        <div className="om-card-footer">
          {enterError && (
            <div className="om-enter-error">{enterError}</div>
          )}
          <button
            type="button"
            className={canEnter ? 'om-enter-btn' : 'om-enter-btn om-enter-btn-disabled'}
            disabled={!canEnter}
            onClick={() => onEnter(match.id)}
          >
            {entering ? 'Entering…' : 'Enter Match'}
          </button>
          {match.status === 'scheduled' && !windowOpen && (
            <span className="om-enter-note">Available 15 min before start</span>
          )}
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
}: {
  matches: OfficialMatchListItem[];
  selectedDate: number | null;
  onSelectDate: (day: number | null) => void;
}) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

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

  const today = now.getDate();
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

  return (
    <div className="om-mini-cal">
      <div className="om-mini-cal-header">{monthLabel}</div>
      <div className="om-mini-cal-grid">
        {DOW_LABELS.map((d, i) => (
          <div key={i} className="om-mini-cal-dow">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="om-mini-cal-empty" />;
          const hasMatch = matchDays.has(day);
          const isToday = day === today;
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
          Show all matches
        </button>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function OfficialMatchCalendar({ onEnterOnlineGame }: Props) {
  const { t } = useLang();
  const [matches, setMatches] = useState<OfficialMatchListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [enteringId, setEnteringId] = useState<string | null>(null);
  const [enterErrors, setEnterErrors] = useState<Record<string, string>>({});
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // 公式戦一覧を取得（今月 + 今後3ヶ月）
  const loadMatches = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const from = new Date();
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
      const to = new Date(from);
      to.setMonth(to.getMonth() + 3);

      const result = await listMyOfficialMatches({
        from: from.toISOString(),
        to: to.toISOString(),
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
  }, []);

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
      onEnterOnlineGame(result.onlineGameId, result.isOfficial, result.startsAt);
    }
  }, [onEnterOnlineGame]);

  // Mini-Calendar でフィルタリング
  const filteredMatches = selectedDay === null
    ? matches
    : matches.filter((m) => {
        const d = new Date(m.starts_at);
        const now = new Date();
        return (
          d.getDate() === selectedDay &&
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth()
        );
      });

  // 表示: scheduled/joinable/live を Upcoming、completed 以降を Past に分ける
  const upcomingMatches = filteredMatches.filter(
    (m) => m.status === 'scheduled' || m.status === 'joinable' || m.status === 'live'
  );
  const pastMatches = filteredMatches.filter(
    (m) => m.status === 'completed' || m.status === 'cancelled' || m.status === 'forfeited'
  );

  if (loading) {
    return (
      <div className="om-loading">Loading official matches…</div>
    );
  }

  if (loadError) {
    return (
      <div className="om-error">
        <span>Failed to load matches.</span>
        <button type="button" className="om-retry-btn" onClick={loadMatches}>
          Retry
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
      />

      {/* Upcoming Matches */}
      <div className="om-section-title">
        {selectedDay ? `Matches on ${selectedDay}` : 'Upcoming Matches'}
      </div>

      {upcomingMatches.length === 0 && (
        <div className="om-empty">
          {matches.length === 0
            ? 'No upcoming official matches'
            : selectedDay
            ? 'No matches on this date'
            : 'No upcoming matches'}
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
          />
        ))}
      </div>

      {/* Past Matches（折りたたみなし・最大5件表示） */}
      {pastMatches.length > 0 && (
        <>
          <div className="om-section-title om-section-title-muted">Recent Results</div>
          <div className="om-cards">
            {pastMatches.slice(0, 5).map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                onEnter={handleEnter}
                entering={enteringId === m.id}
                enterError={enterErrors[m.id] ?? null}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
