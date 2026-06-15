/**
 * OfficialArenaOverview.tsx — Official Arena display + Entry (Phase E-2, E-3, E-4)
 *
 * Phase E-1: 読み取り表示
 * Phase E-2: Entry確認モーダル + enter_arena_event() 実行
 * Phase E-3: My Arena Match 表示 + Enter Match導線（coming soon）
 * Phase E-4: Enter Match本実装 — 既存 enterOfficialMatch() 経路を接続
 * Phase E-5: Arena result status表示（pending / processed）
 *
 * 表示情報:
 *   - ELEPHANT Arena / JAGUAR Arena カード
 *   - 次回開催日時・Entry締切
 *   - 現在のMaster / Interim Master
 *   - 自分のEntry状態（Entry済み / 締切済み / Pro required 等）
 *   - Entryボタン（条件付き表示）
 *   - [E-3] My Arena Match セクション（Entry後・Match生成後）
 *
 * Entry確認モーダル:
 *   - キャンセル不可注記
 *   - no-show penalty (-3 AP)
 *   - 確定 / 戻るボタン
 *
 * 禁止事項:
 *   - DB migration を変更しない
 *   - RPC を変更しない
 *   - cron / pg_cron を変更しない
 *   - generate_arena_matches() / process_arena_results() を変更しない
 *   - OfficialMatchCalendar を変更しない
 */

import { useEffect, useState, useCallback } from 'react';
import {
  getArenaOverview,
  getArenaDetail,
  enterArenaEvent,
  type ArenaOverviewItem,
  type ArenaDetailData,
  type EnterArenaEventResult,
} from '../lib/arena';
import { enterOfficialMatch } from '../lib/officialMatch';
import { useLang } from '../lib/lang';

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatDatetime(isoStr: string | null, lang: string): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-US', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(isoStr: string | null, lang: string): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  });
}

function formatTime(isoStr: string | null, lang: string): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleTimeString(lang === 'ja' ? 'ja-JP' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── My Arena Match 型 ──────────────────────────────────────────────────────

interface MyArenaMatch {
  match_no: number | null;
  match_kind: string | null;
  master_subtype: string | null;
  black_user_id: string | null;
  black_display_name: string | null;
  white_user_id: string | null;
  white_display_name: string | null;
  my_side: 'black' | 'white' | null;
  scheduled_start_at: string | null;
  /** E-3.5: official_matches.id — 入室時は enterOfficialMatch() に渡す */
  official_match_id: string | null;
  /** E-3.5: arena_matches.status */
  arena_match_status: string | null;
  /** E-3.5: official_matches.status */
  official_match_status: string | null;
  /** E-3.5: arena_matches.online_game_id（対局開始済みの場合のみ） */
  online_game_id: string | null;
}

/** my_entry_status の raw 値をユーザー向け表示文字列に変換
 *  raw の "pending" 等をそのまま表示しない
 */
function formatMyEntryStatus(
  status: string | null | undefined,
  t: ReturnType<typeof useLang>['t']
): string {
  if (!status || status === 'withdrawn') return t.arenaNotEntered;
  switch (status) {
    case 'pending':   return t.arenaEntryStatusPending;  // Entry済み・Pairing待ち
    case 'matched':   return t.arenaEntryStatusMatched;  // Match決定済み
    case 'no_match':  return t.arenaEntryStatusNoMatch;  // Match不成立
    default:          return t.arenaNotEntered;
  }
}

/** Entry deadline の過ぎているかどうか
 *  deadline が null / undefined / Invalid Date の場合は false（締切済み扱いしない）
 */
function isDeadlinePassed(deadline: string | null | undefined): boolean {
  if (!deadline) return false;
  const deadlineTime = Date.parse(deadline);
  if (!Number.isFinite(deadlineTime)) return false; // Invalid Date → 締切済み扱いしない
  return Date.now() >= deadlineTime;
}

/** Entry可能かどうか判定（pro必須・deadline・status チェックはサーバー側で確定） */
type EntryButtonState =
  | 'can_enter'       // Entryボタンを表示
  | 'already_entered' // Entry済み
  | 'deadline_passed' // 締切後
  | 'no_event'        // next_event なし
  | 'login_required'  // 非ログイン
  | 'pro_required';   // Free ユーザー

/**
 * ボタン状態判定の優先順位:
 * 1. next_event なし → no_event
 * 2. 未ログイン → login_required
 * 3. 非Pro → pro_required
 * 4. Entry済み → already_entered
 * 5. 締切後 → deadline_passed
 *    ・event_status が 'closed' / 'completed' / 'cancelled' の場合
 *    ・または deadline が有効かつ過去日時の場合
 * 6. Entry可能 → can_enter
 */
function getEntryButtonState(opts: {
  isLoggedIn: boolean;
  isProActive: boolean;
  myEntryStatus: string | null;
  entryDeadline: string | null;
  hasNextEvent: boolean;
  eventStatus: string | null;
}): EntryButtonState {
  const { isLoggedIn, isProActive, myEntryStatus, entryDeadline, hasNextEvent, eventStatus } = opts;

  if (!hasNextEvent) return 'no_event';
  if (!isLoggedIn) return 'login_required';
  if (!isProActive) return 'pro_required';
  if (myEntryStatus && myEntryStatus !== 'withdrawn') return 'already_entered';

  // event_status が明示的に「受付終了」系の場合のみ締切済み扱い
  // 'scheduled' はEntry受付中（enter_arena_event RPC が status='scheduled' のみ許可）
  const closedStatuses = ['closed', 'completed', 'cancelled'];
  if (eventStatus && closedStatuses.includes(eventStatus)) return 'deadline_passed';

  // deadline の日時比較（Invalid Date の場合は締切済みにしない）
  if (isDeadlinePassed(entryDeadline)) return 'deadline_passed';

  return 'can_enter';
}

// ─── Entry確認モーダル ──────────────────────────────────────────────────────────

interface EntryConfirmModalProps {
  arenaName: string;
  eventTime: string;
  entryDeadline: string;
  lang: string;
  onConfirm: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

function EntryConfirmModal({
  arenaName,
  eventTime,
  entryDeadline,
  lang,
  onConfirm,
  onBack,
  isSubmitting,
}: EntryConfirmModalProps) {
  const { t } = useLang();

  return (
    <div style={confirmModalStyles.overlay} onClick={onBack}>
      <div style={confirmModalStyles.card} onClick={(e) => e.stopPropagation()}>
        {/* Title */}
        <div style={confirmModalStyles.title}>{t.arenaConfirmEntryTitle}</div>

        {/* Body */}
        <div style={confirmModalStyles.body}>
          {/* Arena name */}
          <p style={confirmModalStyles.arenaName}>{arenaName}</p>

          {/* Cancel warning */}
          <p style={confirmModalStyles.warningBold}>{t.arenaEntryCannotCancel}</p>

          {/* Event details */}
          <div style={confirmModalStyles.detailRow}>
            <span style={confirmModalStyles.detailLabel}>{t.arenaEventTime}</span>
            <span style={confirmModalStyles.detailValue}>{eventTime}</span>
          </div>
          <div style={confirmModalStyles.detailRow}>
            <span style={confirmModalStyles.detailLabel}>{t.arenaEntryDeadline}</span>
            <span style={confirmModalStyles.detailValue}>{entryDeadline}</span>
          </div>

          {/* No-show warning */}
          <p style={confirmModalStyles.noShowText}>{t.arenaNoShowWarning}</p>
          <p style={confirmModalStyles.noShowPenalty}>{t.arenaNoShowPenalty}</p>

          {/* Pro only note */}
          <p style={confirmModalStyles.proNote}>{t.arenaProOnlyEntry}</p>
        </div>

        {/* Buttons */}
        <div style={confirmModalStyles.btnRow}>
          <button
            type="button"
            style={confirmModalStyles.backBtn}
            onClick={onBack}
            disabled={isSubmitting}
          >
            {t.arenaBackBtn}
          </button>
          <button
            type="button"
            style={{
              ...confirmModalStyles.confirmBtn,
              opacity: isSubmitting ? 0.6 : 1,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
            }}
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting
              ? t.arenaProcessing
              : t.arenaConfirmEntryBtn}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Arena Detail Modal ───────────────────────────────────────────────────────

interface ArenaDetailModalProps {
  arenaId: string;
  isLoggedIn: boolean;
  isProActive: boolean;
  onClose: () => void;
  onEntrySuccess: () => void;
  onEnterOnlineGame?: (onlineGameId: string, isOfficial?: boolean, startsAt?: string | null) => void;
}

function ArenaDetailModal({
  arenaId,
  isLoggedIn,
  isProActive,
  onClose,
  onEntrySuccess,
  onEnterOnlineGame,
}: ArenaDetailModalProps) {
  const { t, lang } = useLang();
  const [detail, setDetail] = useState<ArenaDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Entry 確認モーダル表示フラグ
  const [showEntryConfirm, setShowEntryConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [entrySuccessMsg, setEntrySuccessMsg] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getArenaDetail(arenaId);
    setLoading(false);
    if ('error' in result) {
      setError(result.error);
    } else {
      setDetail(result);
    }
  }, [arenaId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  /** Entry確認モーダルから「Confirm Entry」を押した後の処理 */
  async function handleConfirmEntry() {
    if (!detail?.next_event?.event_id) return;
    setIsSubmitting(true);
    setEntryError(null);

    const result: EnterArenaEventResult = await enterArenaEvent(detail.next_event.event_id);

    setIsSubmitting(false);
    setShowEntryConfirm(false);

    if (result.ok) {
      setEntrySuccessMsg(t.arenaEntryConfirmed);
      // overview と detail を再取得
      await loadDetail();
      onEntrySuccess();
    } else {
      // エラーメッセージをreason別に表示
      setEntryError(mapEntryErrorReason(result.reason, t));
    }
  }

  if (loading) {
    return (
      <div style={modalStyles.overlay} onClick={onClose}>
        <div style={modalStyles.card} onClick={(e) => e.stopPropagation()}>
          <div style={modalStyles.header}>
            <button type="button" style={modalStyles.closeBtn} onClick={onClose}>✕</button>
          </div>
          <div style={modalStyles.body}>
            <p style={modalStyles.loadingText}>{t.loading}</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={modalStyles.overlay} onClick={onClose}>
        <div style={modalStyles.card} onClick={(e) => e.stopPropagation()}>
          <div style={modalStyles.header}>
            <button type="button" style={modalStyles.closeBtn} onClick={onClose}>✕</button>
          </div>
          <div style={modalStyles.body}>
            <p style={modalStyles.errorText}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Entry button state
  const entryState = detail
    ? getEntryButtonState({
        isLoggedIn,
        isProActive,
        myEntryStatus: detail.my_entry_status,
        entryDeadline: detail.next_event?.entry_deadline ?? null,
        hasNextEvent: !!detail.next_event,
        eventStatus: detail.next_event?.event_status ?? null,
      })
    : 'no_event';

  return (
    <>
      <div style={modalStyles.overlay} onClick={onClose}>
        <div style={modalStyles.card} onClick={(e) => e.stopPropagation()}>
          <div style={modalStyles.header}>
            <button type="button" style={modalStyles.closeBtn} onClick={onClose}>✕</button>
          </div>
          <div style={modalStyles.body}>
            {detail && (
              <DetailContent
                detail={detail}
                lang={lang}
                t={t}
                entryState={entryState}
                entryError={entryError}
                entrySuccessMsg={entrySuccessMsg}
                onEntryClick={() => {
                  setEntryError(null);
                  setShowEntryConfirm(true);
                }}
                onEnterOnlineGame={onEnterOnlineGame}
              />
            )}
          </div>
        </div>
      </div>

      {/* Entry確認モーダル（詳細モーダルの上に重ねる） */}
      {showEntryConfirm && detail?.next_event && (
        <EntryConfirmModal
          arenaName={detail.display_name}
          eventTime={formatDatetime(detail.next_event.event_datetime, lang)}
          entryDeadline={formatDatetime(detail.next_event.entry_deadline, lang)}
          lang={lang}
          onConfirm={handleConfirmEntry}
          onBack={() => setShowEntryConfirm(false)}
          isSubmitting={isSubmitting}
        />
      )}
    </>
  );
}

/** Entry error reason → 表示メッセージ */
function mapEntryErrorReason(
  reason: string,
  t: ReturnType<typeof useLang>['t']
): string {
  switch (reason) {
    case 'not_authenticated': return t.arenaEntryErrNotAuthenticated;
    case 'pro_required': return t.arenaEntryErrProRequired;
    case 'already_entered': return t.arenaEntryErrAlreadyEntered;
    case 'entry_deadline_passed': return t.arenaEntryErrDeadlinePassed;
    case 'event_not_found': return t.arenaEntryErrEventNotFound;
    case 'event_not_open': return t.arenaEntryErrEventNotOpen;
    default: return t.arenaEntryErrUnknown;
  }
}

// ─── Detail Content ───────────────────────────────────────────────────────────

function DetailContent({
  detail,
  lang,
  t,
  entryState,
  entryError,
  entrySuccessMsg,
  onEntryClick,
  onEnterOnlineGame,
}: {
  detail: ArenaDetailData;
  lang: string;
  t: ReturnType<typeof useLang>['t'];
  entryState: EntryButtonState;
  entryError: string | null;
  entrySuccessMsg: string | null;
  onEntryClick: () => void;
  onEnterOnlineGame?: (onlineGameId: string, isOfficial?: boolean, startsAt?: string | null) => void;
}) {
  const masterName = detail.current_master_display_name;
  const interimName = detail.current_interim_master_display_name;

  // my_match from RPC (typed cast)
  const myMatch = detail.my_match as MyArenaMatch | null;

  return (
    <div>
      <h2 style={modalStyles.title}>{detail.display_name}</h2>

      {/* Entry status (E-3) */}
      {entryState === 'already_entered' && (
        <MyArenaMatchSection
          myEntryStatus={detail.my_entry_status}
          myMatch={myMatch}
          t={t}
          lang={lang}
          onEnterOnlineGame={onEnterOnlineGame}
        />
      )}

      {/* Next event */}
      <div style={modalStyles.section}>
        <div style={modalStyles.sectionLabel}>{t.arenaNextEvent}</div>
        {detail.next_event ? (
          <>
            <div style={modalStyles.value}>
              {formatDatetime(detail.next_event.event_datetime, lang)}
            </div>
            <div style={{ ...modalStyles.subValue, marginTop: 2 }}>
              {t.arenaEntryDeadline}: {formatDatetime(detail.next_event.entry_deadline, lang)}
            </div>
          </>
        ) : (
          <div style={modalStyles.value}>—</div>
        )}
      </div>

      {/* Current Master */}
      <div style={modalStyles.section}>
        <div style={modalStyles.sectionLabel}>{t.arenaCurrentMaster}</div>
        <div style={modalStyles.value}>
          {masterName ?? t.arenaNoMaster}
        </div>
      </div>

      {/* Interim Master (show only if present) */}
      {interimName && (
        <div style={modalStyles.section}>
          <div style={modalStyles.sectionLabel}>{t.arenaInterimMaster}</div>
          <div style={modalStyles.value}>{interimName}</div>
        </div>
      )}

      {/* Arena Point Ranking */}
      {detail.top_ranking && detail.top_ranking.length > 0 && (
        <div style={modalStyles.section}>
          <div style={modalStyles.sectionLabel}>{t.arenaPointRanking}</div>
          <table style={modalStyles.table}>
            <thead>
              <tr>
                <th style={modalStyles.th}>#</th>
                <th style={modalStyles.th}>{t.arenaName}</th>
                <th style={modalStyles.th}>Pt</th>
              </tr>
            </thead>
            <tbody>
              {detail.top_ranking.slice(0, 5).map((row, i) => (
                <tr key={row.user_id}>
                  <td style={modalStyles.td}>{i + 1}</td>
                  <td style={modalStyles.td}>{row.display_name ?? '—'}</td>
                  <td style={modalStyles.td}>{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent Match History */}
      {detail.recent_match_history && detail.recent_match_history.length > 0 && (
        <div style={modalStyles.section}>
          <div style={modalStyles.sectionLabel}>{t.arenaRecentMatchHistory}</div>
          {detail.recent_match_history.slice(0, 5).map((mh, i) => (
            <div key={i} style={modalStyles.historyRow}>
              <span style={modalStyles.historyDate}>
                {formatDate(mh.played_at, lang)}
              </span>
              <span style={modalStyles.historyPlayers}>
                {mh.black_display_name ?? '—'} vs {mh.white_display_name ?? '—'}
              </span>
              {mh.winner_display_name && (
                <span style={modalStyles.historyWinner}>
                  {t.arenaWin}{mh.winner_display_name}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Master History */}
      {detail.recent_master_history && detail.recent_master_history.length > 0 && (
        <div style={modalStyles.section}>
          <div style={modalStyles.sectionLabel}>{t.arenaMasterHistory}</div>
          {detail.recent_master_history.slice(0, 5).map((mh, i) => (
            <div key={i} style={modalStyles.historyRow}>
              <span style={modalStyles.historyPlayers}>
                {mh.display_name ?? '—'}
              </span>
              <span style={modalStyles.historyDate}>
                {formatDate(mh.started_at, lang)}
                {mh.ended_at ? ` — ${formatDate(mh.ended_at, lang)}` : ` ${t.arenaCurrent}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Entry section */}
      <div style={modalStyles.entrySection}>
        {entrySuccessMsg && (
          <div style={modalStyles.entrySuccess}>{entrySuccessMsg}</div>
        )}
        {entryError && (
          <div style={modalStyles.entryErr}>{entryError}</div>
        )}
        <EntryButtonForDetail
          entryState={entryState}
          t={t}
          onEntryClick={onEntryClick}
        />
      </div>
    </div>
  );
}

// ─── My Arena Match Section (E-3) ──────────────────────────────────────────────────────

function MyArenaMatchSection({
  myEntryStatus,
  myMatch,
  t,
  lang,
  onEnterOnlineGame,
}: {
  myEntryStatus: string | null;
  myMatch: MyArenaMatch | null;
  t: ReturnType<typeof useLang>['t'];
  lang: string;
  onEnterOnlineGame?: (onlineGameId: string, isOfficial?: boolean, startsAt?: string | null) => void;
}) {
  const [entering, setEntering] = useState(false);
  const [enterError, setEnterError] = useState<string | null>(null);

  // my_entry_status: 'no_match' → 不成立表示
  if (myEntryStatus === 'no_match') {
    return (
      <div style={myMatchStyles.root}>
        <div style={modalStyles.sectionLabel}>{t.arenaMyArenaMatch}</div>
        <p style={myMatchStyles.noMatch}>{t.arenaNoMatchEstablished}</p>
        <p style={myMatchStyles.noMatchSub}>{t.arenaNoArenaPointsChanged}</p>
      </div>
    );
  }

  // Match未生成（またはmyMatchがNULL）
  if (!myMatch) {
    return (
      <div style={myMatchStyles.root}>
        <div style={modalStyles.sectionLabel}>{t.arenaMyArenaMatch}</div>
        <p style={myMatchStyles.info}>
          {myEntryStatus === 'matched'
            ? t.arenaMatchWillAppear
            : t.arenaPairingAfterDeadline}
        </p>
      </div>
    );
  }

  // Match生成済み
  const opponentName =
    myMatch.my_side === 'black'
      ? (myMatch.white_display_name ?? '—')
      : (myMatch.black_display_name ?? '—');
  const sideLabel = myMatch.my_side === 'black' ? t.arenaYouAreBlack : t.arenaYouAreWhite;

  function matchKindLabel(kind: string | null, subtype: string | null): string | null {
    if (kind === 'master') {
      if (subtype === 'inaugural') return t.arenaMatchKindInaugural;
      if (subtype === 'defend') return t.arenaMatchKindDefend;
      if (subtype === 'master_succession') return t.arenaMatchKindMasterSuccession;
      if (subtype === 'interim_set') return t.arenaMatchKindInterimSet;
      return t.arenaMasterMatch;
    }
    if (kind === 'point') return t.arenaPointMatch;
    return null;
  }

  const kindLabel = matchKindLabel(myMatch.match_kind, myMatch.master_subtype);

  // ─── Enter Match 状態判定 (E-4 / E-5) ───────────────────────────────────

  // E-5: Arena result処理済み（processed）判定
  const arenaResultProcessed = myMatch.arena_match_status === 'processed';

  // E-5: official match終了済み判定（linked official matchのstatus）
  const officialMatchFinished = (
    myMatch.official_match_status === 'completed' ||
    myMatch.official_match_status === 'cancelled' ||
    myMatch.official_match_status === 'forfeited' ||
    myMatch.official_match_status === 'no_contest'
  );

  // E-5: Arena result pending = official match終了済み かつ arena result未処理
  //   arena_match_status が pending/active/completed でも official matchが終われば pending 扱い
  const arenaResultPending = officialMatchFinished && !arenaResultProcessed;

  // E-4: arena_match_status が cancelled はMatch自体が不成立 → 既存matchDone表示
  const arenaMatchCancelled = myMatch.arena_match_status === 'cancelled';

  // official_match_idがある場合のみEnterボタン表示対象
  const hasOfficialMatchId = !!myMatch.official_match_id;

  // Enter Matchハンドラ（既存 enterOfficialMatch() を再利用）
  const handleEnterMatch = async () => {
    if (!myMatch.official_match_id || !onEnterOnlineGame) return;
    setEntering(true);
    setEnterError(null);
    const result = await enterOfficialMatch(myMatch.official_match_id);
    setEntering(false);
    if ('error' in result) {
      // 既存エラー文言マッピング
      const errMsg = mapEnterMatchError(result.error, t);
      setEnterError(errMsg);
    } else {
      onEnterOnlineGame(result.onlineGameId, result.isOfficial, result.startsAt);
    }
  };

  return (
    <div style={myMatchStyles.root}>
      <div style={modalStyles.sectionLabel}>{t.arenaMyArenaMatch}</div>
      <div style={myMatchStyles.matchCard}>
        {/* Match number + kind */}
        <div style={myMatchStyles.matchTitle}>
          {t.arenaMatchLabel} {myMatch.match_no ?? '?'}
          {kindLabel && (
            <span style={myMatchStyles.kindBadge}>{kindLabel}</span>
          )}
        </div>
        {/* Side */}
        <div style={myMatchStyles.row}>
          <span style={myMatchStyles.label}>{sideLabel}</span>
        </div>
        {/* Opponent */}
        <div style={myMatchStyles.row}>
          <span style={myMatchStyles.label}>{t.arenaOpponent}</span>
          <span style={myMatchStyles.value}>{opponentName}</span>
        </div>
        {/* Start time */}
        <div style={myMatchStyles.row}>
          <span style={myMatchStyles.label}>{t.arenaStartTime}</span>
          <span style={myMatchStyles.value}>
            {myMatch.scheduled_start_at
              ? formatDatetime(myMatch.scheduled_start_at, lang)
              : '—'}
          </span>
        </div>
        {/* Enter Match 導線 — E-4/E-5: result status 分岐 */}
        {arenaResultProcessed ? (
          // E-5: Arena result処理済み
          <div style={myMatchStyles.resultProcessed}>{t.arenaResultProcessed}</div>
        ) : arenaResultPending ? (
          // E-5: official match終了済み・Arena result未処理（最大10分程度の確認中）
          <div style={myMatchStyles.resultPending}>
            <div style={myMatchStyles.resultPendingTitle}>{t.arenaResultPendingTitle}</div>
            <div style={myMatchStyles.resultPendingBody}>{t.arenaResultPendingBody}</div>
            <div style={myMatchStyles.resultPendingNote}>{t.arenaResultPendingNote}</div>
            <div style={myMatchStyles.finalizingNotice}>
              {t.arenaFinalizingResults} {t.arenaFinalizingResultsHint}
            </div>
          </div>
        ) : arenaMatchCancelled ? (
          // Match自体がキャンセル（arena_match_statusがcancelled）
          <div style={myMatchStyles.matchDone}>{t.arenaMatchCompleted}</div>
        ) : hasOfficialMatchId && onEnterOnlineGame ? (
          // 入室可能
          <button
            type="button"
            style={entering ? myMatchStyles.enterBtnDisabled : myMatchStyles.enterBtn}
            disabled={entering}
            onClick={handleEnterMatch}
          >
            {entering ? '…' : t.arenaEnterMatch}
          </button>
        ) : (
          // official_match_idなし（まだMatch生成直後など）
          <div style={myMatchStyles.comingSoon}>{t.arenaEnterMatchUnavailable}</div>
        )}
        {/* エラー表示 */}
        {enterError && (
          <div style={myMatchStyles.enterError}>{enterError}</div>
        )}
      </div>
    </div>
  );
}

/** enter_official_match のエラーを日本語/英語の最低限文言にマッピング */
function mapEnterMatchError(err: string, t: ReturnType<typeof useLang>['t']): string {
  const lower = err.toLowerCase();
  if (lower.includes('not_authenticated') || lower.includes('not authenticated') || lower.includes('jwt')) {
    return 'Login required';
  }
  if (lower.includes('too_early') || lower.includes('not yet')) {
    return t.arenaMatchNotStartedYet;
  }
  if (lower.includes('expired') || lower.includes('already_finished') || lower.includes('no_contest') || lower.includes('forfeited') || lower.includes('completed')) {
    return t.arenaMatchNoLongerAvailable;
  }
  if (lower.includes('match_not_found') || lower.includes('not found')) {
    return t.arenaMatchNoLongerAvailable;
  }
  if (lower.includes('not_participant') || lower.includes('not a participant')) {
    return t.arenaMatchNoLongerAvailable;
  }
  return `${t.arenaEnterMatchFailed}: ${err}`;
}

function EntryButtonForDetail({
  entryState,
  t,
  onEntryClick,
}: {
  entryState: EntryButtonState;
  t: ReturnType<typeof useLang>['t'];
  onEntryClick: () => void;
}) {
  switch (entryState) {
    case 'can_enter':
      return (
        <button type="button" style={entryBtnStyles.active} onClick={onEntryClick}>
          {t.arenaEntryBtn}
        </button>
      );
    case 'already_entered':
      return (
        <div style={entryBtnStyles.stateLabel}>
          ✓ {t.arenaEntryConfirmed}
        </div>
      );
    case 'deadline_passed':
      return (
        <div style={entryBtnStyles.stateLabel}>
          {t.arenaEntryClosed}
        </div>
      );
    case 'login_required':
      return (
        <div style={entryBtnStyles.stateLabel}>
          {t.arenaLoginRequired}
        </div>
      );
    case 'pro_required':
      return (
        <div style={entryBtnStyles.stateLabel}>
          {t.arenaProRequired}
        </div>
      );
    case 'no_event':
      return (
        <div style={entryBtnStyles.stateLabel}>
          {t.arenaNoUpcomingEvent}
        </div>
      );
  }
}

// ─── Arena Card ───────────────────────────────────────────────────────────────

function ArenaCard({
  arena,
  isLoggedIn,
  isProActive,
  onViewDetail,
}: {
  arena: ArenaOverviewItem;
  isLoggedIn: boolean;
  isProActive: boolean;
  onViewDetail: (id: string) => void;
}) {
  const { t, lang } = useLang();
  const masterName = arena.current_master_display_name;
  const interimName = arena.current_interim_master_display_name;

  // Entry button state for card
  const entryState = getEntryButtonState({
    isLoggedIn,
    isProActive,
    myEntryStatus: arena.my_entry_status,
    entryDeadline: arena.entry_deadline,
    hasNextEvent: !!arena.event_id,
    eventStatus: arena.event_status,
  });

  function renderEntryStatusBadge() {
    switch (entryState) {
      case 'already_entered':
        return <span style={cardStyles.entryBadgeConfirmed}>✓ {t.arenaEntryConfirmed}</span>;
      case 'deadline_passed':
        return <span style={cardStyles.entryBadgeClosed}>{t.arenaEntryClosed}</span>;
      case 'login_required':
        return <span style={cardStyles.entryBadgeInfo}>{t.arenaLoginRequired}</span>;
      case 'pro_required':
        return <span style={cardStyles.entryBadgeInfo}>{t.arenaProRequired}</span>;
      case 'no_event':
        return <span style={cardStyles.entryBadgeInfo}>{t.arenaNoUpcomingEvent}</span>;
      case 'can_enter':
        return null; // カード上にはボタンを置かずタップで詳細へ誘導
    }
  }

  return (
    <div style={cardStyles.root} onClick={() => onViewDetail(arena.arena_id)}>
      {/* Arena name + Pro badge */}
      <div style={cardStyles.header}>
        <span style={cardStyles.arenaName}>{arena.display_name}</span>
        <span style={cardStyles.proBadge}>{t.arenaProRequired}</span>
      </div>

      {/* Title name */}
      <div style={cardStyles.titleName}>{arena.title_name}</div>

      {/* Next event datetime */}
      <div style={cardStyles.row}>
        <span style={cardStyles.label}>{t.arenaNextEvent}</span>
        <span style={cardStyles.value}>
          {arena.event_datetime ? (
            <>
              {formatDate(arena.event_datetime, lang)}{' '}
              {formatTime(arena.event_datetime, lang)}
            </>
          ) : '—'}
        </span>
      </div>

      {/* Entry deadline */}
      <div style={cardStyles.row}>
        <span style={cardStyles.label}>{t.arenaEntryDeadline}</span>
        <span style={cardStyles.value}>
          {arena.entry_deadline ? formatDatetime(arena.entry_deadline, lang) : '—'}
        </span>
      </div>

      {/* Current Master */}
      <div style={cardStyles.row}>
        <span style={cardStyles.label}>{t.arenaCurrentMaster}</span>
        <span style={cardStyles.value}>
          {masterName ?? t.arenaNoMaster}
        </span>
      </div>

      {/* Interim Master (show only if present) */}
      {interimName && (
        <div style={cardStyles.row}>
          <span style={cardStyles.label}>{t.arenaInterimMaster}</span>
          <span style={cardStyles.value}>{interimName}</span>
        </div>
      )}

      {/* My entry status */}
      <div style={cardStyles.row}>
        <span style={cardStyles.label}>{t.arenaMyEntry}</span>
        <span style={cardStyles.value}>
          {formatMyEntryStatus(arena.my_entry_status, t)}
        </span>
      </div>

      {/* Footer: entry badge + detail hint */}
      <div style={cardStyles.footer}>
        {renderEntryStatusBadge()}
        <span style={cardStyles.detailHintBtn}>{t.arenaTapForDetail}</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface OfficialArenaOverviewProps {
  /** ログイン中ユーザーID。未ログインは undefined */
  userId?: string;
  /** Pro active かどうか */
  isProActive?: boolean;
  /** Arena Match入室後に呼び出す callback */
  onEnterOnlineGame?: (onlineGameId: string, isOfficial?: boolean, startsAt?: string | null) => void;
}

export function OfficialArenaOverview({
  userId,
  isProActive: proActive = false,
  onEnterOnlineGame,
}: OfficialArenaOverviewProps) {
  const { t } = useLang();
  const [arenas, setArenas] = useState<ArenaOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailArenaId, setDetailArenaId] = useState<string | null>(null);

  const loadArenas = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getArenaOverview();
    setLoading(false);
    if ('error' in result) {
      setError(result.error);
    } else {
      setArenas(result);
    }
  }, []);

  useEffect(() => {
    loadArenas();
  }, [loadArenas]);

  if (loading) {
    return <div style={overviewStyles.loading}>{t.loading}</div>;
  }

  if (error) {
    return (
      <div style={overviewStyles.error}>
        <span style={overviewStyles.errorText}>{error}</span>
        <button type="button" style={overviewStyles.retryBtn} onClick={loadArenas}>
          {t.omRetry}
        </button>
      </div>
    );
  }

  if (arenas.length === 0) {
    return null;
  }

  const isLoggedIn = !!userId;

  return (
    <div style={overviewStyles.root}>
      {/* Section heading */}
      <div style={overviewStyles.sectionTitle}>{t.arenaOfficialArena}</div>

      {/* Arena Rules accordion */}
      <ArenaRulesAccordion />

      {/* Arena cards */}
      <div style={overviewStyles.cards}>
        {arenas.map((arena) => (
          <ArenaCard
            key={arena.arena_id}
            arena={arena}
            isLoggedIn={isLoggedIn}
            isProActive={proActive}
            onViewDetail={setDetailArenaId}
          />
        ))}
      </div>

      {/* Detail modal */}
      {detailArenaId && (
        <ArenaDetailModal
          arenaId={detailArenaId}
          isLoggedIn={isLoggedIn}
          isProActive={proActive}
          onClose={() => setDetailArenaId(null)}
          onEntrySuccess={loadArenas}
          onEnterOnlineGame={onEnterOnlineGame}
        />
      )}
    </div>
  );
}

// ─── Arena Rules Accordion ──────────────────────────────────────────────────

function ArenaRulesAccordion() {
  const { t } = useLang();

  const items: Array<{ title: string; body: string }> = [
    { title: t.arenaRulesEventTitle,    body: t.arenaRulesEventBody },
    { title: t.arenaRulesMatchingTitle, body: t.arenaRulesMatchingBody },
    { title: t.arenaRulesOrderTitle,    body: t.arenaRulesOrderBody },
    { title: t.arenaRulesPointTitle,    body: t.arenaRulesPointBody },
  ];

  return (
    <div style={rulesStyles.wrapper}>
      <details style={rulesStyles.outerDetails}>
        <summary style={rulesStyles.outerSummary}>{t.arenaRulesTitle}</summary>
        <div style={rulesStyles.innerList}>
          {items.map((item) => (
            <details key={item.title} style={rulesStyles.itemDetails}>
              <summary style={rulesStyles.itemSummary}>{item.title}</summary>
              <div style={rulesStyles.itemBody}>
                {item.body.split('\n').map((line, i) =>
                  line === '' ? <br key={i} /> : <span key={i} style={{ display: 'block' }}>{line}</span>
                )}
              </div>
            </details>
          ))}
        </div>
      </details>
    </div>
  );
}

const rulesStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    marginBottom: '0.75rem',
  },
  outerDetails: {
    border: '1px solid #e0dbd5',
    borderRadius: 6,
    background: '#faf8f5',
    overflow: 'hidden',
  },
  outerSummary: {
    fontSize: '0.78rem',
    fontWeight: 600,
    color: '#555',
    letterSpacing: '0.04em',
    padding: '0.55rem 0.75rem',
    cursor: 'pointer',
    userSelect: 'none',
    listStyle: 'none',
  },
  innerList: {
    borderTop: '1px solid #e8e3de',
    padding: '0.4rem 0.5rem 0.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  itemDetails: {
    borderRadius: 4,
    overflow: 'hidden',
  },
  itemSummary: {
    fontSize: '0.78rem',
    fontWeight: 600,
    color: '#444',
    padding: '0.4rem 0.5rem',
    cursor: 'pointer',
    userSelect: 'none',
    listStyle: 'none',
  },
  itemBody: {
    fontSize: '0.78rem',
    color: '#555',
    lineHeight: 1.65,
    padding: '0.3rem 0.75rem 0.5rem',
  },
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const overviewStyles: Record<string, React.CSSProperties> = {
  root: {
    marginBottom: '1.25rem',
  },
  sectionTitle: {
    fontSize: '0.72rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#555',
    marginBottom: '0.6rem',
    paddingBottom: '0.35rem',
    borderBottom: '1px solid #e8e3de',
  },
  cards: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  loading: {
    fontSize: '0.85rem',
    color: '#888',
    padding: '0.75rem 0',
  },
  error: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.75rem 0',
  },
  errorText: {
    fontSize: '0.8rem',
    color: '#c00',
  },
  retryBtn: {
    padding: '0.4rem 0.8rem',
    background: 'none',
    border: '1px solid #ccc',
    borderRadius: 4,
    fontSize: '0.8rem',
    cursor: 'pointer',
    color: '#444',
  },
};

const cardStyles: Record<string, React.CSSProperties> = {
  root: {
    background: '#faf8f5',
    border: '1px solid #e0dbd5',
    borderRadius: 8,
    padding: '0.9rem 1rem',
    cursor: 'pointer',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '0.15rem',
  },
  arenaName: {
    fontSize: '0.95rem',
    fontWeight: 700,
    color: '#111',
    letterSpacing: '0.02em',
  },
  proBadge: {
    fontSize: '0.65rem',
    fontWeight: 600,
    color: '#7a5c00',
    background: '#fff8dc',
    border: '1px solid #e8d080',
    borderRadius: 4,
    padding: '0.1rem 0.45rem',
    letterSpacing: '0.03em',
    flexShrink: 0,
    marginLeft: '0.5rem',
  },
  titleName: {
    fontSize: '0.75rem',
    color: '#888',
    marginBottom: '0.65rem',
    letterSpacing: '0.01em',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: '0.25rem',
    flexWrap: 'wrap' as const,
    gap: '0.2rem 0.5rem',
  },
  label: {
    fontSize: '0.72rem',
    color: '#888',
    flexShrink: 0,
  },
  value: {
    fontSize: '0.82rem',
    color: '#222',
    fontWeight: 500,
    textAlign: 'right' as const,
    wordBreak: 'break-word' as const,
  },
  footer: {
    marginTop: '0.75rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap' as const,
    gap: '0.35rem',
  },
  entryBadgeConfirmed: {
    fontSize: '0.72rem',
    fontWeight: 600,
    color: '#2a7a2a',
    background: '#e8f5e9',
    border: '1px solid #a5d6a7',
    borderRadius: 4,
    padding: '0.1rem 0.45rem',
  },
  entryBadgeClosed: {
    fontSize: '0.72rem',
    fontWeight: 600,
    color: '#888',
    background: '#f0f0f0',
    border: '1px solid #d0d0d0',
    borderRadius: 4,
    padding: '0.1rem 0.45rem',
  },
  entryBadgeInfo: {
    fontSize: '0.72rem',
    fontWeight: 500,
    color: '#666',
    background: 'transparent',
    border: 'none',
    borderRadius: 4,
    padding: '0.1rem 0',
  },
  detailHint: {
    fontSize: '0.68rem',
    color: '#aaa',
  },
  detailHintBtn: {
    fontSize: '0.7rem',
    color: '#555',
    fontWeight: 600,
    background: '#f0ede9',
    border: '1px solid #d0cbc5',
    borderRadius: 12,
    padding: '0.2rem 0.65rem',
    letterSpacing: '0.01em',
    flexShrink: 0 as const,
    display: 'inline-block',
  },
};

const modalStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 300,
  },
  card: {
    background: '#fff',
    borderRadius: 10,
    width: '90%',
    maxWidth: 380,
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    padding: '0.85rem 1rem 0',
    display: 'flex',
    justifyContent: 'flex-end',
    flexShrink: 0,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '1rem',
    cursor: 'pointer',
    color: '#555',
  },
  body: {
    padding: '0 1.1rem 1.25rem',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    WebkitOverflowScrolling: 'touch',
    flex: 1,
  },
  title: {
    fontSize: '1.05rem',
    fontWeight: 700,
    margin: '0 0 1rem',
    color: '#111',
  },
  section: {
    marginBottom: '1rem',
  },
  sectionLabel: {
    fontSize: '0.68rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#888',
    marginBottom: '0.3rem',
  },
  value: {
    fontSize: '0.88rem',
    color: '#111',
    fontWeight: 500,
  },
  subValue: {
    fontSize: '0.78rem',
    color: '#666',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.78rem',
  },
  th: {
    textAlign: 'left',
    padding: '0.2rem 0.4rem',
    color: '#888',
    fontWeight: 600,
    borderBottom: '1px solid #eee',
  },
  td: {
    padding: '0.25rem 0.4rem',
    color: '#222',
    borderBottom: '1px solid #f5f5f5',
  },
  historyRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.2rem 0.6rem',
    fontSize: '0.78rem',
    padding: '0.2rem 0',
    borderBottom: '1px solid #f5f5f5',
  },
  historyDate: {
    color: '#888',
    flexShrink: 0,
  },
  historyPlayers: {
    color: '#222',
    fontWeight: 500,
  },
  historyWinner: {
    color: '#555',
  },
  entrySection: {
    marginTop: '1.25rem',
    borderTop: '1px solid #f0ede9',
    paddingTop: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    alignItems: 'flex-start',
  },
  entrySuccess: {
    fontSize: '0.85rem',
    color: '#2a7a2a',
    fontWeight: 600,
  },
  entryErr: {
    fontSize: '0.82rem',
    color: '#c00',
  },
  loadingText: {
    fontSize: '0.85rem',
    color: '#888',
    textAlign: 'center',
    padding: '1rem 0',
  },
  errorText: {
    fontSize: '0.85rem',
    color: '#c00',
    textAlign: 'center',
    padding: '1rem 0',
  },
};

const entryBtnStyles: Record<string, React.CSSProperties> = {
  active: {
    padding: '0.55rem 1.3rem',
    fontSize: '0.85rem',
    fontWeight: 700,
    background: '#2c2c2c',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    letterSpacing: '0.02em',
    // iPhone誤タップ防止: 十分な高さを確保
    minHeight: 44,
    minWidth: 120,
  },
  stateLabel: {
    fontSize: '0.82rem',
    color: '#888',
    fontStyle: 'italic',
  },
};

const confirmModalStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 400, // detail modalの上に重ねる
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    width: '88%',
    maxWidth: 360,
    padding: '1.5rem 1.25rem 1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.85rem',
  },
  title: {
    fontSize: '1rem',
    fontWeight: 700,
    color: '#111',
    margin: 0,
    textAlign: 'center',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
  },
  arenaName: {
    fontSize: '0.95rem',
    fontWeight: 700,
    color: '#222',
    textAlign: 'center',
    margin: 0,
  },
  warningBold: {
    fontSize: '0.8rem',
    color: '#c00',
    fontWeight: 600,
    textAlign: 'center',
    margin: 0,
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: '0.5rem',
    fontSize: '0.82rem',
  },
  detailLabel: {
    color: '#888',
    flexShrink: 0,
    fontSize: '0.75rem',
  },
  detailValue: {
    color: '#222',
    fontWeight: 500,
    textAlign: 'right',
    wordBreak: 'break-word',
  },
  noShowText: {
    fontSize: '0.77rem',
    color: '#555',
    margin: 0,
    lineHeight: 1.5,
  },
  noShowPenalty: {
    fontSize: '0.77rem',
    color: '#c44',
    fontWeight: 600,
    margin: 0,
  },
  proNote: {
    fontSize: '0.72rem',
    color: '#7a5c00',
    margin: 0,
    background: '#fff8dc',
    border: '1px solid #e8d080',
    borderRadius: 4,
    padding: '0.3rem 0.5rem',
  },
  btnRow: {
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'center',
    marginTop: '0.25rem',
  },
  backBtn: {
    flex: 1,
    padding: '0.65rem 0.5rem',
    fontSize: '0.85rem',
    background: 'none',
    color: '#444',
    border: '1px solid #ccc',
    borderRadius: 6,
    cursor: 'pointer',
    // iPhone誤タップ防止
    minHeight: 44,
  },
  confirmBtn: {
    flex: 1,
    padding: '0.65rem 0.5rem',
    fontSize: '0.85rem',
    fontWeight: 700,
    background: '#2c2c2c',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    // iPhone誤タップ防止
    minHeight: 44,
  },
};

// ─── My Arena Match Styles ────────────────────────────────────────────────────

const myMatchStyles: Record<string, React.CSSProperties> = {
  root: {
    marginBottom: '1rem',
    padding: '0.75rem 0.85rem',
    background: '#f5f3ef',
    border: '1px solid #e0dbd5',
    borderRadius: 8,
  },
  matchCard: {
    marginTop: '0.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  matchTitle: {
    fontSize: '0.88rem',
    fontWeight: 700,
    color: '#111',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    flexWrap: 'wrap' as const,
  },
  kindBadge: {
    fontSize: '0.68rem',
    fontWeight: 600,
    color: '#7a5c00',
    background: '#fff8dc',
    border: '1px solid #e8d080',
    borderRadius: 4,
    padding: '0.1rem 0.4rem',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: '0.3rem 0.5rem',
    flexWrap: 'wrap' as const,
  },
  label: {
    fontSize: '0.75rem',
    color: '#888',
    flexShrink: 0,
  },
  value: {
    fontSize: '0.82rem',
    color: '#222',
    fontWeight: 500,
    textAlign: 'right' as const,
    wordBreak: 'break-word' as const,
  },
  info: {
    fontSize: '0.82rem',
    color: '#555',
    margin: '0.4rem 0 0',
    lineHeight: 1.5,
  },
  noMatch: {
    fontSize: '0.82rem',
    color: '#555',
    margin: '0.4rem 0 0',
    lineHeight: 1.5,
  },
  noMatchSub: {
    fontSize: '0.78rem',
    color: '#888',
    margin: '0.25rem 0 0',
  },
  enterBtn: {
    marginTop: '0.5rem',
    padding: '0.5rem 1.1rem',
    fontSize: '0.82rem',
    fontWeight: 700,
    background: '#2c2c2c',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    minHeight: 40,
    alignSelf: 'flex-start',
  },
  comingSoon: {
    marginTop: '0.5rem',
    fontSize: '0.78rem',
    color: '#aaa',
    fontStyle: 'italic',
  },
  enterBtnDisabled: {
    marginTop: '0.5rem',
    padding: '0.5rem 1.1rem',
    fontSize: '0.82rem',
    fontWeight: 700,
    background: '#888',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'not-allowed',
    minHeight: 40,
    alignSelf: 'flex-start',
    opacity: 0.7,
  },
  matchDone: {
    marginTop: '0.5rem',
    fontSize: '0.78rem',
    color: '#888',
  },
  enterError: {
    marginTop: '0.3rem',
    fontSize: '0.75rem',
    color: '#c0392b',
    lineHeight: 1.4,
  },
  // E-5: Arena result status styles
  resultPending: {
    marginTop: '0.6rem',
    padding: '0.55rem 0.65rem',
    background: '#f5f3ef',
    border: '1px solid #ddd9d3',
    borderRadius: 6,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.2rem',
  },
  resultPendingTitle: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#333',
    lineHeight: 1.4,
  },
  resultPendingBody: {
    fontSize: '0.78rem',
    color: '#555',
    lineHeight: 1.4,
  },
  resultPendingNote: {
    fontSize: '0.73rem',
    color: '#888',
    lineHeight: 1.45,
  },
  resultProcessed: {
    marginTop: '0.5rem',
    fontSize: '0.78rem',
    color: '#2a7a2a',
    fontWeight: 500,
  },
  finalizingNotice: {
    marginTop: '0.35rem',
    fontSize: '0.73rem',
    color: '#7a6a00',
    background: '#fffbea',
    border: '1px solid #e8d880',
    borderRadius: 4,
    padding: '0.25rem 0.45rem',
    lineHeight: 1.45,
  },
};
