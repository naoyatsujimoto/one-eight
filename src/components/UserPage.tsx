/**
 * UserPage.tsx — ユーザーページ（フルスクリーン）
 *
 * セクション:
 *   1. プロフィールヘッダー
 *   2. 成績サマリー
 *   3. レーティング推移（Coming Soon）
 *   4. プレイ傾向
 *   5. 最近の対局
 *   6. 代表棋譜
 *   7. 大会実績（Coming Soon）
 *   8. 称号 / バッジ（Coming Soon）
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import type React from 'react';
import { usePostmortemWorker } from '../hooks/usePostmortemWorker';
import { track } from '../lib/kpiTracker';
import { fetchUserPageStats, fetchPublicUserPageStats, type UserPageStats, type MatchLogRow } from '../lib/matchLog';
import { loadAggregates, loadGameRecords, cacheGameRecord, type GameRecord, type Aggregates } from '../game/analytics';
import { clearPostmortemCache } from '../game/storage';
import { PostmortemModal, type PostmortemGameMeta } from './PostmortemModal';
import { useLang } from '../lib/lang';
import type { LocaleCode } from '../lib/locales';
import { formatDate, formatDateTime, getIntlLocale } from '../lib/localeFormat';
import { CompactLanguageSelector } from './CompactLanguageSelector';
import { getProfile, upsertProfile, updateDisplayName, updateProfileStatsPublic, isProActive } from '../lib/profile';
import { OfficialMatchCalendar } from './OfficialMatchCalendar';
import { listMyOfficialMatches, type OfficialMatchListItem } from '../lib/officialMatch';
import { getMyArenaTitles, type ArenaTitle } from '../lib/arena';
import { getUserAwards, getUserAwardSubmissions, getUserHasPriorSubmission, type UserPrizeAwardRow } from '../lib/prizeUser';
import { PrizeClaimForm } from './PrizeClaimForm';
import type { SubmitTaxResult } from '../lib/prizeUser';
import './UserPage.css';


const USER_NAME_KEY_PREFIX = 'one8_username_';

function loadUsername(userId: string): string | null {
  try { return localStorage.getItem(USER_NAME_KEY_PREFIX + userId); } catch { return null; }
}
function saveUsername(userId: string, name: string) {
  try { localStorage.setItem(USER_NAME_KEY_PREFIX + userId, name); } catch { /* noop */ }
}

interface Props {
  userId: string;
  userEmail: string | null;
  onBack: () => void;
  /** 他ユーザーの STATS 閲覧モード（自分の編集不可） */
  viewOnly?: boolean;
  /** viewOnly 時に表示する対象ユーザーの ID */
  targetUserId?: string;
  /** 公式戦入室後に OnlineBoard へ遷移させるコールバック
   * OM-1c: isOfficial / startsAt を追加引数として渡す。
   */
  onEnterOnlineGame?: (onlineGameId: string, isOfficial?: boolean, startsAt?: string | null) => void;
}

export function UserPage({ userId, userEmail, onBack, viewOnly = false, targetUserId, onEnterOnlineGame }: Props) {
  const { t, lang, setLangWithSync } = useLang();
  // t is also used in inline JSX below
  const [stats, setStats] = useState<UserPageStats | null>(null);
  const [agg, setAgg] = useState<Aggregates | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentGamesPage, setRecentGamesPage] = useState(0);
  // シングルトン Worker（gameId 単位管理・キュー処理）
  const { getStatus, run: runWorker, dismiss: dismissWorker } = usePostmortemWorker();
  // モーダル表示対象の gameId（分析ボタンを押した対局）
  const [pendingModalGameId, setPendingModalGameId] = useState<string | null>(null);
  const pendingStatus = pendingModalGameId ? getStatus(pendingModalGameId) : null;
  // done になったら自動でモーダルを開く
  const showModal = pendingStatus?.status === 'done' && pendingStatus.history != null;
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [analyzeCompletedIds, setAnalyzeCompletedIds] = useState<Set<string>>(new Set());
  const [refreshCompletedIds, setRefreshCompletedIds] = useState<Set<string>>(new Set());
  const completionTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [localMap, setLocalMap] = useState<Map<string, GameRecord>>(new Map());
  const [statsPublic, setStatsPublic] = useState(false);
  const [proActive, setProActive] = useState(false);
  // online_game_id → OfficialMatchListItem のマップ
  // RecentGamesTable で human_color=null の online 対局の勝敗判定に使用
  const [officialGameMap, setOfficialGameMap] = useState<Map<string, OfficialMatchListItem>>(new Map());
  const [arenaTitles, setArenaTitles] = useState<ArenaTitle[]>([]);
  // RP-4: Reward / Prize
  const [prizeAwards, setPrizeAwards] = useState<UserPrizeAwardRow[]>([]);
  const [prizeSubmissions, setPrizeSubmissions] = useState<Record<string, { submission_id: string; status: string; delete_after: string | null; data_cleared_at: string | null }>>({});
  const [prizeClaimTarget, setPrizeClaimTarget] = useState<{ awardId: string; sourceKind: string | null } | null>(null);
  const [prizeClaimIsUpdate, setPrizeClaimIsUpdate] = useState(false);
  const [prizeSubmitResults, setPrizeSubmitResults] = useState<Record<string, SubmitTaxResult>>({});
  const [userHasPriorSubmission, setUserHasPriorSubmission] = useState(false);

  const displayUserId = (viewOnly && targetUserId) ? targetUserId : userId;
  const defaultName = userEmail ? userEmail.split('@')[0] : 'Player';
  const [username, setUsername] = useState<string>(() => {
    if (viewOnly) return '…';
    return loadUsername(userId) ?? defaultName ?? 'Player';
  });
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);
  const [savingStats, setSavingStats] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    const fetcher = viewOnly ? fetchPublicUserPageStats : fetchUserPageStats;
    fetcher(displayUserId).then((s) => {
      setStats(s);
      setLoading(false);
    });
    if (!viewOnly) {
      setAgg(loadAggregates());
      const records = loadGameRecords(100);
      const map = new Map<string, GameRecord>();
      for (const r of records) map.set(r.game_id, r);
      setLocalMap(map);

      // 公式戦マップを構築: online_game_id → OfficialMatchListItem
      // RecentGamesTable で human_color=null の勝敗判定に使用
      const from = new Date();
      from.setMonth(from.getMonth() - 6);
      from.setHours(0, 0, 0, 0);
      const to = new Date();
      to.setMonth(to.getMonth() + 3);
      listMyOfficialMatches({ from: from.toISOString(), to: to.toISOString(), includeArena: true }).then((res) => {
        if ('error' in res) return;
        const omMap = new Map<string, OfficialMatchListItem>();
        for (const om of res) {
          if (om.online_game_id) omMap.set(om.online_game_id, om);
        }
        setOfficialGameMap(omMap);
      });
    }
    // Load Arena titles (authenticated users only — own page)
    if (!viewOnly) {
      getMyArenaTitles().then((titles) => setArenaTitles(titles));
    }
    // Load Prize awards (authenticated users only — own page)
    if (!viewOnly) {
      getUserAwards().then(({ data }) => {
        if (data) {
          setPrizeAwards(data);
          const ids = data.map((a) => a.award_id);
          getUserAwardSubmissions(ids).then(({ data: subMap }) => {
            if (subMap) setPrizeSubmissions(subMap);
          });
        }
      });
      // user_id 単位での提出済みチェック
      getUserHasPriorSubmission().then(({ hasPrior }) => {
        setUserHasPriorSubmission(hasPrior);
      });
    }
    // Load profile: stats_public + display name
    getProfile(displayUserId).then((profile) => {
      if (profile) {
        setStatsPublic(profile.stats_public ?? false);
        setProActive(isProActive(profile));
        if (viewOnly && profile.display_name) {
          setUsername(profile.display_name);
        } else if (!viewOnly && !profile.display_name) {
          // Supabaseに display_name がない場合、localName または defaultName を同期
          const nameToSync: string = loadUsername(userId) || defaultName || 'Player';
          updateDisplayName(userId, nameToSync).catch((err) => {
            console.error('[UserPage] display_name init sync failed:', err instanceof Error ? err.message : String(err));
          });
        }
      } else if (viewOnly) {
        setUsername('Unknown');
      } else {
        // プロフィール行が存在しない異常ケース
        // INSERT権限がないため行作成は不可。サイレント失敗せずログに記録。
        // 通常はauth.users作成時のtriggerで行が作成されるはずなので、
        // 行不在は異常（trigger不備など）として扱う。
        console.error('[UserPage] profiles row missing for user:', userId);
      }
    });
  }, [displayUserId, viewOnly]);

  function handleEditName() {
    setNameInput(username);
    setEditingName(true);
  }
  async function handleStatsPublicChange(val: boolean) {
    if (savingStats) return;
    setSavingStats(true);
    setStatsError(null);
    try {
      await updateProfileStatsPublic(userId, val);
      setStatsPublic(val);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[UserPage] handleStatsPublicChange failed:', msg);
      setStatsError(t.statsSaveError);
    } finally {
      setSavingStats(false);
    }
  }

  async function handleSaveName() {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    if (savingName) return;

    setSavingName(true);
    setNameError(null);
    setNameSaved(false);

    try {
      // DB更新を先に実行（成功してからUIを更新）
      await updateDisplayName(userId, trimmed);
      // DB更新成功後にUIとlocalStorageを更新
      setUsername(trimmed);
      saveUsername(userId, trimmed);
      setNameSaved(true);
      setEditingName(false);
      setTimeout(() => setNameSaved(false), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[UserPage] handleSaveName failed:', msg);
      setNameError(t.profileSaveError);
      // 編集画面を閉じない（ユーザーが再試行できるように）
    } finally {
      setSavingName(false);
    }
  }
  // 候補手表示用: 現在分析中の対局の human_color
  const [currentHumanColor, setCurrentHumanColor] = useState<'black' | 'white' | null>(null);
  const [pendingModalGameRecord, setPendingModalGameRecord] = useState<GameRecord | null>(null);
  // 分析ボタンのハンドラ: シングルトン Worker に委譲
  const handleAnalyzeClick = useCallback((record: GameRecord) => {
    const st = getStatus(record.game_id);
    if (st.status === 'queued' || st.status === 'running') return;
    const hc = (record.human_color as 'black' | 'white' | null) ?? null;
    setCurrentHumanColor(hc);
    setPendingModalGameRecord(record);
    setPendingModalGameId(record.game_id);
    runWorker(record.game_id, record.full_record, hc);
  }, [getStatus, runWorker]);

  // 完了表示スケジューラー
  const scheduleCompletion = useCallback((gameId: string, kind: 'analyze' | 'refresh') => {
    const existing = completionTimersRef.current.get(gameId);
    if (existing) clearTimeout(existing);
    const setter = kind === 'analyze' ? setAnalyzeCompletedIds : setRefreshCompletedIds;
    setter(prev => new Set([...prev, gameId]));
    const t = setTimeout(() => {
      setter(prev => { const n = new Set(prev); n.delete(gameId); return n; });
      completionTimersRef.current.delete(gameId);
    }, 2500);
    completionTimersRef.current.set(gameId, t);
  }, []);

  // アンマウント時に全タイマーをクリア
  useEffect(() => {
    return () => {
      completionTimersRef.current.forEach(t => clearTimeout(t));
    };
  }, []);

  // refreshingIds の worker 状態を監視し、done/error 時に自動解除
  useEffect(() => {
    const toRemove: string[] = [];
    const toDone: string[] = [];
    for (const gameId of refreshingIds) {
      const st = getStatus(gameId);
      if (st.status === 'done') {
        toRemove.push(gameId);
        toDone.push(gameId);
      } else if (st.status === 'error') {
        toRemove.push(gameId);
      }
    }
    if (toRemove.length === 0) return;
    setRefreshingIds(prev => {
      const n = new Set(prev);
      toRemove.forEach(id => n.delete(id));
      return n;
    });
    for (const gameId of toDone) {
      scheduleCompletion(gameId, 'refresh');
    }
  // getStatusは _version 変化ごとに新参照になるため依存に入れる
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getStatus, scheduleCompletion]);

  function handleCancelEdit() {
    setEditingName(false);
    setNameError(null);
    setNameSaved(false);
  }

  const playerName = username;
  const shortId = displayUserId.slice(0, 8).toUpperCase();

  return (
    <div className="up-page">
      {/* トップバー */}
      <header style={s.topbar}>
        <button type="button" onClick={onBack} style={s.backBtn}>{t.userBack}</button>
        <span style={s.topbarTitle}>ONE EIGHT</span>
        <span style={{ width: 64 }} />
      </header>

      <div className="up-scroll">

        {/* ── Section 1: プロフィールヘッダー ── */}
        <section className="up-section">
          <div className="up-identity">
            <div className="up-avatar-row">
              <div className="up-avatar">{(playerName ?? 'P').slice(0, 1).toUpperCase()}</div>
              <div className="up-profile-info">
                {!viewOnly && editingName ? (
                  <div className="up-name-edit-row">
                    <input
                      className="up-name-input"
                      value={nameInput}
                      onChange={(e) => { setNameInput(e.target.value); setNameError(null); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') handleCancelEdit(); }}
                      maxLength={30}
                      autoFocus
                      disabled={savingName}
                    />
                    <button type="button" className="up-name-save-btn" onClick={handleSaveName} disabled={savingName}>
                      {savingName ? '…' : t.userSaveName}
                    </button>
                    <button type="button" className="up-name-cancel-btn" onClick={handleCancelEdit} disabled={savingName}>{t.userCancelEdit}</button>
                    {nameError && <span className="up-name-error">{nameError}</span>}
                  </div>
                ) : (
                  <div className="up-name-row">
                    <span className="up-player-name">{playerName}</span>
                    {!viewOnly && <button type="button" className="up-edit-name-btn" onClick={handleEditName}>{t.userEditName}</button>}
                    {!viewOnly && nameSaved && <span className="up-name-saved">{t.profileSaveSuccess}</span>}
                  </div>
                )}
                <div className="up-meta-row">
                  <span>ID {shortId}</span>
                  {!viewOnly && (
                    <>
                      <span>·</span>
                      <CompactLanguageSelector
                        selectedLocale={lang as LocaleCode}
                        onSelect={code => setLangWithSync(code)}
                        className="cls-root--profile"
                      />
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="up-facts-grid">
              <ProfileItem label={t.userJoined} value={
                stats?.joinedAt
                  ? formatDate(stats.joinedAt, lang)
                  : '—'
              } />
              <ProfileItem label={t.userRating} value={`— (${t.onlineComingSoon})`} muted />
              <ProfileItem label={t.userDomesticRank} value={`— (${t.onlineComingSoon})`} muted />
              <ProfileItem label={t.userSeasonRank} value={`— (${t.onlineComingSoon})`} muted />
            </div>

            {/* Pro ステータスバナー: 非Proユーザー向け Upgrade 導線のみ（自分のページのみ） */}
            {!viewOnly && !proActive && (
              <div className="up-pro-banner">
                <div>
                  <div className="up-pro-banner-title">{t.proUpgradeBannerTitle}</div>
                  <div className="up-pro-banner-desc">{t.proUpgradeBannerDesc}</div>
                </div>
                <a href="/pro.html" className="up-pro-banner-btn">{t.proUpgradeBtn}</a>
              </div>
            )}

            {/* 公開設定（自分のページのみ）*/}
            {!viewOnly && (
              <div className="up-visibility-row">
                <span className="up-visibility-label">{t.statsVisibility}</span>
                <div className="up-segment">
                  {([true, false] as const).map((val) => (
                    <button
                      key={String(val)}
                      type="button"
                      className={`up-segment-btn${statsPublic === val ? ' up-segment-btn--active' : ''}`}
                      onClick={() => handleStatsPublicChange(val)}
                      disabled={savingStats}
                    >
                      {val ? t.statsPublic : t.statsPrivate}
                    </button>
                  ))}
                </div>
                {statsError && <span className="up-name-error">{statsError}</span>}
              </div>
            )}
          </div>
        </section>

        {/* viewOnly + 非公開: プライベートメッセージを表示して以降のセクションを非表示 */}
        {viewOnly && !statsPublic && (
          <section className="up-section">
            <p className="up-private-msg">
              {t.statsPrivateMsg}
            </p>
          </section>
        )}

        {/* ── Section 2: 成績サマリー ── */}
        {(!viewOnly || statsPublic) && (
        <>
        <section className="up-section">
          <SectionTitle title={t.userProfile} />
          {loading ? <Muted text={t.loading} /> : stats && (
            <>
              <div className="up-stat-grid">
                <StatCard label={t.userTotalGames} value={stats.total} />
                <StatCard label={t.userWinRate} value={pct(stats.winRate)} />
                <StatCard label={t.userBlackWinRate} value={pct(stats.blackWinRate)} />
                <StatCard label={t.userWhiteWinRate} value={pct(stats.whiteWinRate)} />
                <StatCard label={t.userCpuWinRate} value={pct(stats.cpuWinRate)} />
                <StatCard label={t.userPvpWinRate} value={pct(stats.pvpWinRate)} />
              </div>
            </>
          )}
        </section>

        {/* ── Section 3: レーティング推移 ── */}
        {!viewOnly && (
          <section className="up-section">
            <SectionTitle title={t.userRatingHistory} />
            <div className="up-rating-placeholder">
              <span className="up-rating-placeholder-text">{t.onlineComingSoon}</span>
            </div>
          </section>
        )}

        {/* ── Section 5: 最近の対局（viewOnly時は非表示）── */}
        {!viewOnly && (
          <section className="up-section">
            <SectionTitle title={t.userRecentGames} />
            {loading ? <Muted text={t.loading} /> : stats && stats.recentGames.length > 0 ? (() => {
              const PAGE_SIZE = 8;
              const allGames = stats.recentGames;
              const totalPages = Math.ceil(allGames.length / PAGE_SIZE);
              const safePage = Math.min(recentGamesPage, totalPages - 1);
              const pageGames = allGames.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
              return (
                <>
                  <RecentGamesCard
                    games={pageGames}
                    localMap={localMap}
                    officialGameMap={officialGameMap}
                    currentUserId={userId}
                    onPostmortem={(r) => { const hc = (r.human_color as 'black' | 'white' | null) ?? null; setCurrentHumanColor(hc); setPendingModalGameRecord(r); setPendingModalGameId(r.game_id); runWorker(r.game_id, r.full_record, hc); }}
                    onRefresh={(record) => {
                      // queued/running中は操作不可
                      const currentSt = getStatus(record.game_id);
                      if (currentSt.status === 'queued' || currentSt.status === 'running') return;
                      dismissWorker(record.game_id);
                      clearPostmortemCache(record.game_id);
                      const existingTimer = completionTimersRef.current.get(record.game_id);
                      if (existingTimer) { clearTimeout(existingTimer); completionTimersRef.current.delete(record.game_id); }
                      setRefreshCompletedIds(prev => { const n = new Set(prev); n.delete(record.game_id); return n; });
                      setRefreshingIds(prev => new Set([...prev, record.game_id]));
                      handleAnalyzeClick(record);
                      // KPI: postmortem_refreshed
                      try { track('postmortem_refreshed', { trigger: 'user' }); } catch { /* ignore */ }
                    }}
                    getStatus={getStatus}
                    onAnalyzeClick={handleAnalyzeClick}
                    analyzeCompletedIds={analyzeCompletedIds}
                    refreshCompletedIds={refreshCompletedIds}
                    refreshingIds={refreshingIds}
                    proActive={proActive}
                  />
                  {totalPages > 1 && (
                    <div className="up-pagination">
                      <button
                        type="button"
                        className="up-pagination-prev"
                        onClick={() => setRecentGamesPage((p) => Math.max(0, p - 1))}
                        disabled={safePage === 0}
                      >
                        {t.userPrevPage}
                      </button>
                      <span className="up-pagination-label">
                        {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, allGames.length)} / {allGames.length}
                      </span>
                      <button
                        type="button"
                        className="up-pagination-next"
                        onClick={() => setRecentGamesPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={safePage === totalPages - 1}
                      >
                        {t.userNextPage}
                      </button>
                    </div>
                  )}
                </>
              );
            })() : <Muted text={t.userNoData} />}
          </section>
        )}

        {/* ── Section 6: Official Match Calendar (OM-1b) ── */}
        {!viewOnly && (
          <section className="up-section">
            <SectionTitle title={t.omOfficialMatches} />
            {/* STATS / UserPage からは入室不可。Online Play 誘導のみ表示。 */}
            <p style={{ fontSize: '0.82rem', color: '#888', marginBottom: '0.5rem' }}>
              {t.officialMatchEnterFromOnlinePlay}
            </p>
            <OfficialMatchCalendar
              variant="profile"
              enableEntry={false}
              includeArena={true}
              onEnterOnlineGame={onEnterOnlineGame}
              initialDay={new Date().getDate()}
              showRecentResults={true}
            />
          </section>
        )}

        {/* ── Section 6.5: Arena Titles (E-6) ── */}
        {!viewOnly && (
          <section className="up-section">
            <SectionTitle title={t.arenaArenaTitles} />
            {arenaTitles.length === 0 ? (
              <Muted text={t.arenaNoArenaTitles} />
            ) : (
              <div className="up-arena-section">
                {arenaTitles.map((title) => {
                  const code = title.arena_code?.toUpperCase();
                  const badgeSrc = code === 'ELEPHANT' ? '/badges/elephant_art.png'
                                 : code === 'JAGUAR'   ? '/badges/jaguar_art.png'
                                 : null;
                  return (
                    <div key={title.arena_id} className="up-arena-card">
                      {badgeSrc && (
                        <img
                          src={badgeSrc}
                          alt={code}
                          className="up-arena-img"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                      )}
                      <div className="up-arena-body">
                        <div className="up-arena-title-name">{title.title_name}</div>
                        <div className="up-arena-holder">{t.arenaTitleCurrentHolder}</div>
                      </div>
                      <div className="up-arena-date">
                        {new Date(title.started_at).toLocaleDateString(getIntlLocale(lang), {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── Section 6.8: Reward / Prize (RP-4) ── */}
        {!viewOnly && (
          <section className="up-section">
            <SectionTitle title={t.prizeSectionTitle} />
            <PrizeSection
              awards={prizeAwards}
              submissions={prizeSubmissions}
              submitResults={prizeSubmitResults}
              userHasPriorSubmission={userHasPriorSubmission}
              onClaim={(awardId, isUpdate) => {
                setPrizeClaimIsUpdate(isUpdate ?? false);
                const award = prizeAwards.find(a => a.award_id === awardId);
                setPrizeClaimTarget({ awardId, sourceKind: award?.source_kind ?? null });
              }}
            />
          </section>
        )}

        {/* ── Section 7 & 8: Coming Soon ── */}
        <section className="up-section">
          <SectionTitle title={t.userTournamentHistory} />
          <div className="up-coming-soon-list">
            <div className="up-coming-soon-item">
              <span className="up-coming-soon-label">{t.userTournamentHistory}</span>
              <span className="up-coming-soon-badge">{t.onlineComingSoon}</span>
            </div>
            <div className="up-coming-soon-item">
              <span className="up-coming-soon-label">{t.userBadges}</span>
              <span className="up-coming-soon-badge">{t.onlineComingSoon}</span>
            </div>
          </div>
        </section>

        {/* 旧Section 8 は上記のup-coming-soon-listに統合済み */}

        </>
        )}

      </div>

      {/* PrizeClaimForm モーダル */}
      {prizeClaimTarget !== null && (
        <PrizeClaimForm
          awardId={prizeClaimTarget.awardId}
          sourceKind={prizeClaimTarget.sourceKind}
          isUpdate={prizeClaimIsUpdate}
          onClose={() => { setPrizeClaimTarget(null); setPrizeClaimIsUpdate(false); }}
          onSuccess={(result) => {
            setPrizeSubmitResults(prev => ({ ...prev, [result.award_id]: result }));
            setPrizeSubmissions(prev => ({
              ...prev,
              [result.award_id]: {
                submission_id:   result.submission_id,
                status:          result.status,
                delete_after:    result.delete_after,
                data_cleared_at: null,
              },
            }));
            // 更新フローで提出した場合も提出済み扱いにする
            setUserHasPriorSubmission(true);
            setPrizeClaimTarget(null);
            setPrizeClaimIsUpdate(false);
          }}
        />
      )}

      {showModal && pendingModalGameId && pendingStatus?.status === 'done' && (
        <PostmortemModal
          history={pendingStatus.history}
          gameId={pendingModalGameId}
          onClose={() => {
            dismissWorker(pendingModalGameId);
            if (!refreshCompletedIds.has(pendingModalGameId)) {
              scheduleCompletion(pendingModalGameId, 'analyze');
            }
            setPendingModalGameId(null);
            setCurrentHumanColor(null);
            setPendingModalGameRecord(null);
          }}
          autoStart
          proActive={proActive}
          humanColor={currentHumanColor}
          gameMeta={pendingModalGameRecord ? {
            playedAt: pendingModalGameRecord.ended_at ?? pendingModalGameRecord.started_at,
            moveCount: pendingModalGameRecord.move_count,
            mode: pendingModalGameRecord.mode === 'human_vs_cpu'
              ? t.userTypeCpu
              : pendingModalGameRecord.mode === 'human_vs_human'
              ? t.userTypeHuman
              : undefined,
          } : undefined}
        />
      )}
    </div>
  );
}

// ── Reward / Prize Section (RP-4) ─────────────────────────────────────────────

function fmtPrizeAmount(cents: number, currency: string): string {
  // lang is available via useLang in PrizeSection below; this helper is called from there
return `${currency} ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function PrizeSection({
  awards,
  submissions,
  submitResults,
  userHasPriorSubmission,
  onClaim,
}: {
  awards: UserPrizeAwardRow[];
  submissions: Record<string, { submission_id: string; status: string; delete_after: string | null; data_cleared_at: string | null }>;
  submitResults: Record<string, SubmitTaxResult>;
  userHasPriorSubmission: boolean;
  onClaim: (awardId: string, isUpdate?: boolean) => void;
}) {
  const { t, lang } = useLang();
  if (awards.length === 0) {
    return <Muted text={t.prizeNoAwards} />;
  }

  return (
    <div className="up-prize-section">
      {awards.map((award) => {
        const submission = submissions[award.award_id];
        const submitResult = submitResults[award.award_id];
        // 初回提出: 提出済み submission がなく、かつ過去に一度も提出したことがないユーザー
        const canClaim = (award.status === 'eligible' || award.status === 'pending') && !submission && !userHasPriorSubmission;
        // 再提出不要: 提出済み submission がないが、過去に提出したことがある（情報変更時のみ提出）
        const noResubmitRequired = (award.status === 'eligible' || award.status === 'pending') && !submission && userHasPriorSubmission;
        const isSubmitted = submission && ['submitted', 'reviewed', 'archived'].includes(submission.status);
        const isDataCleared = submission?.status === 'data_cleared';
        // Arena名表示: arena_codeがある場合は「{ARENA_CODE} Master Reward」、なければ「Official Arena」
        const arenaLabel = award.arena_code
          ? `${award.arena_code} ${t.prizeMasterReward}`
          : t.prizeOfficialArena;

        // status pill の修飾クラスを既知の状態へ明示的にマッピング
        const statusPillModifier: Record<string, string> = {
          eligible: 'up-prize-status-pill--eligible',
          pending: 'up-prize-status-pill--pending',
          submitted: 'up-prize-status-pill--submitted',
          processed: 'up-prize-status-pill--processed',
          prepared: 'up-prize-status-pill--prepared',
          paid: 'up-prize-status-pill--paid',
          on_hold: 'up-prize-status-pill--warning',
          canceled: 'up-prize-status-pill--inactive',
          expired: 'up-prize-status-pill--inactive',
        };
        const pillModifier = statusPillModifier[award.status] ?? '';

        // 表示するstatus文字列
        const statusLabel =
          award.status === 'eligible' ? t.prizeStatusEligible
          : award.status === 'pending' ? t.prizeStatusPending
          : award.status === 'submitted' ? t.prizeStatusSubmitted
          : award.status === 'processed' ? t.prizeStatusProcessed
          : award.status === 'prepared' ? t.prizePreparingPayout
          : award.status === 'paid' ? t.prizePaid
          : award.status.toUpperCase();

        return (
          <div key={award.award_id} className="up-prize-row">
            {/* 1行目: 金額 + status pill */}
            <div className="up-prize-top">
              <div className="up-prize-amount">{fmtPrizeAmount(award.amount_cents, award.currency)}</div>
              <span className={`up-prize-status-pill${pillModifier ? ' ' + pillModifier : ''}`}>
                {statusLabel}
              </span>
            </div>

            {/* 2行目: Arena報酬名 + prize kind */}
            <div className="up-prize-title">
              {arenaLabel}　・　{award.prize_kind ? award.prize_kind : t.prizeKindCash}
            </div>

            {/* 3行目: Award ID */}
            <div className="up-prize-id">
              {t.prizeAwardId}: {award.award_id}
            </div>

            {/* meta: 作成日 / 支払準備中 / 支払済み / submit直後 / DB済み状態 / データ消去済み */}
            <div className="up-prize-meta">
              {award.created_at && (
                <span>{t.createdLabel}: {formatDate(award.created_at, lang)}</span>
              )}
              {award.payout_status === 'prepared' && !submitResult && (
                <span>{t.prizePreparingPayout}</span>
              )}
              {award.paid_at && (
                <span>✓ {t.prizePaid}: {formatDate(award.paid_at, lang)}</span>
              )}
              {/* Tax on file */}
              {noResubmitRequired && !submitResult && (
                <span>✓ {t.taxOnFile} — {t.taxOnFileDesc}</span>
              )}
              {/* submit直後のレスポンス */}
              {submitResult && (
                <>
                  <span>✓ {t.prizeSubmittedMsg}</span>
                  <span>{t.submissionId}: {submitResult.submission_id.slice(0, 8)}…</span>
                  {submitResult.delete_after && (
                    <span>{t.dataExpiration}: {formatDateTime(submitResult.delete_after, lang)}</span>
                  )}
                </>
              )}
              {/* DBから読み込んだ提出済み状態 */}
              {!submitResult && isSubmitted && (
                <>
                  <span>{t.prizeStatusSubmitted}</span>
                  {submission.delete_after && (
                    <span>{t.dataExpiration}: {formatDateTime(submission.delete_after, lang)}</span>
                  )}
                </>
              )}
              {/* データ消去済み */}
              {!submitResult && isDataCleared && (
                <span>{t.prizeStatusProcessed}</span>
              )}
              {/* on_hold / canceled / expired */}
              {award.status === 'on_hold' && <span>{t.prizeStatusOnHold}</span>}
              {award.status === 'canceled' && <span>{t.prizeStatusCanceled}</span>}
              {award.status === 'expired' && <span>{t.prizeStatusExpired}</span>}
            </div>

            {/* actions */}
            {(canClaim || (noResubmitRequired && !submitResult)) && (
              <div className="up-prize-actions">
                {canClaim && (
                  <button type="button" className="up-prize-action-btn" onClick={() => onClaim(award.award_id)}>
                    {t.prizeSubmitInfo}
                  </button>
                )}
                {noResubmitRequired && !submitResult && (
                  <button type="button" className="up-prize-action-btn" onClick={() => onClaim(award.award_id, true)}>
                    {t.updateInfoIfChanged}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// sp および prizeStatusColor は PrizeSection className 方式移行により削除

// ── 成績サマリー ──────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="up-stat-card">
      <div className="up-stat-value">{value}</div>
      <div className="up-stat-label">{label}</div>
    </div>
  );
}

function ProfileItem({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="up-fact-item">
      <div className="up-fact-label">{label}</div>
      <div className={`up-fact-value${muted ? ' up-fact-value--muted' : ''}`}>{value}</div>
    </div>
  );
}

// ── プレイ傾向 ────────────────────────────────────────────────────────────────

function TrendSection({ agg }: { agg: Aggregates }) {
  const { t } = useLang();
  const buildTypes = ['massive', 'selective', 'quad', 'skip'];
  const buildTotals = buildTypes.map((bt) => ({
    label: bt.charAt(0).toUpperCase() + bt.slice(1),
    tries: agg.byBuildType[bt]?.tries ?? 0,
  }));
  const buildSum = buildTotals.reduce((a, b) => a + b.tries, 0);

  const topPositions = Object.entries(agg.byPosition)
    .sort((a, b) => b[1].tries - a[1].tries)
    .slice(0, 5);

  const weakPositions = Object.entries(agg.byPosition)
    .filter(([, v]) => v.tries >= 3)
    .map(([k, v]) => ({ pos: k, rate: v.tries > 0 ? v.wins / v.tries : 0, tries: v.tries }))
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 3);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <div style={s.sectionLabel}>{t.userBuildUsage}</div>
        {buildTotals.filter((b) => b.tries > 0).map(({ label, tries }) => (
          <div key={label} style={s.barRow}>
            <div style={s.barLabel}>{label}</div>
            <div style={s.barTrack}>
              <div style={{
                ...s.barFill,
                width: buildSum > 0 ? `${(tries / buildSum) * 100}%` : '0%',
              }} />
            </div>
            <div style={s.barValue}>{buildSum > 0 ? `${Math.round((tries / buildSum) * 100)}%` : '—'}</div>
          </div>
        ))}
        {buildSum === 0 && <Muted text={t.userNoData} />}
      </div>

      {topPositions.length > 0 && (
        <div>
          <div style={s.sectionLabel}>{t.userFavPositions}</div>
          <div style={s.posRow}>
            {topPositions.map(([pos, v]) => (
              <div key={pos} style={s.posChip}>
                <span style={s.posLabel}>{pos}</span>
                <span style={s.posCount}>{v.tries}{t.userTimes}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {weakPositions.length > 0 && (
        <div>
          <div style={s.sectionLabel}>{t.userWeakPositions}</div>
          <div style={s.posRow}>
            {weakPositions.map(({ pos, rate, tries }) => (
              <div key={pos} style={{ ...s.posChip, background: '#fff0f0' }}>
                <span style={s.posLabel}>{pos}</span>
                <span style={s.posCount}>{pct(rate)} ({tries}{t.userTimes})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── resolveRecentGameDisplay: 勝敗・先後判定純粋関数 ───────────────────────────

export type RecentGameDisplay = {
  result: 'win' | 'loss' | 'draw' | 'neutral' | 'unknown';
  side: 'black' | 'white' | null;
};

export function resolveRecentGameDisplay(
  matchLog: MatchLogRow,
  officialMatch: OfficialMatchListItem | undefined,
  userId: string
): RecentGameDisplay {
  // official matchがある場合はofficial側を優先
  if (officialMatch) {
    // my_color: list_my_official_matches RPCが返すフィールド
    // フォールバック: black_user_id === userId の場合 'black'
    const myColorFromRpc = officialMatch.my_color;
    const myColorFallback: 'black' | 'white' =
      (officialMatch as unknown as { black_user_id?: string }).black_user_id === userId ? 'black' : 'white';
    const myColor: 'black' | 'white' = myColorFromRpc ?? myColorFallback;
    const side: 'black' | 'white' = myColor;

    if (
      officialMatch.status === 'cancelled' ||
      officialMatch.status === 'forfeited' ||
      officialMatch.status === 'no_contest'
    ) {
      return { result: 'neutral', side };
    }

    const winner = officialMatch.winner;
    if (!winner) return { result: 'unknown', side };
    if (winner === 'draw') return { result: 'draw', side };

    const iWon =
      (winner === 'black_user' && myColor === 'black') ||
      (winner === 'white_user' && myColor === 'white');
    return { result: iWon ? 'win' : 'loss', side };
  }

  // 通常対局: match_logsから判定
  const color = matchLog.human_color;
  if (!color) return { result: 'unknown', side: null };

  const side: 'black' | 'white' = color as 'black' | 'white';
  const winner = matchLog.winner;
  if (!winner) return { result: 'unknown', side };
  if (winner === 'draw') return { result: 'draw', side };

  // match_logs.winner は 'black' / 'white'（コマ色）
  // human_colorと一致すれば勝ち
  const iWon = winner === color;
  return { result: iWon ? 'win' : 'loss', side };
}

// ── 最近の対局テーブル ────────────────────────────────────────────────────────

function RecentGamesTable({
  games,
  localMap,
  officialGameMap = new Map(),
  currentUserId = '',
  onPostmortem,
  refreshingIds = new Set(),
  onRefresh,
  getStatus,
  onAnalyzeClick,
  analyzeCompletedIds = new Set(),
  refreshCompletedIds = new Set(),
  proActive = false,
}: {
  games: MatchLogRow[];
  localMap: Map<string, GameRecord>;
  officialGameMap?: Map<string, OfficialMatchListItem>;
  /** ログイン中のユーザー ID（公式戦先後判定に使用） */
  currentUserId?: string;
  onPostmortem: (r: GameRecord) => void;
  refreshingIds?: Set<string>;
  onRefresh?: (r: GameRecord) => void;
  getStatus?: (gameId: string) => import('../hooks/usePostmortemWorker').AnalysisJobStatus;
  onAnalyzeClick?: (r: GameRecord) => void;
  analyzeCompletedIds?: Set<string>;
  refreshCompletedIds?: Set<string>;
  proActive?: boolean;
}) {
  const { t, lang } = useLang();
  return (
    <div style={{ overflowX: 'auto' }}>
      {!proActive && (
        <div style={s.upgradeBanner}>
          <span>{t.proUpgradeGames}</span>
          <a href="/pro.html" style={s.upgradeBannerLink}>{t.proUpgradeBtn} →</a>
        </div>
      )}
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>{t.userColDate}</th>
            <th style={s.th}>{t.userColResult}</th>
            <th style={s.th}>{t.userColSide}</th>
            <th style={s.th}>{t.userColMoves}</th>
            <th style={s.th}>{t.userColType}</th>
            <th style={s.th}></th>
          </tr>
        </thead>
        <tbody>
          {games.map((r) => {
            // ── 勝敗・先後判定: resolveRecentGameDisplay を使用 ──────────────────
            // online_pvp で human_color=null の場合は officialGameMap を参照
            const om = (r.mode === 'online_pvp')
              ? officialGameMap.get(r.game_id)
              : undefined;
            // currentUserId を使用（propsで渡されたログイン中ユーザー ID）
            const display = resolveRecentGameDisplay(r, om, currentUserId);

            const result = display.result === 'draw' ? '△'
              : display.result === 'win'  ? '○'
              : display.result === 'loss' ? '×'
              : '—';
            const resultColor = display.result === 'draw'    ? '#888'
              : display.result === 'win'  ? '#2e7d32'
              : display.result === 'loss' ? '#c62828'
              : '#999';
            const side = display.side === 'black' ? t.userSideBlack
              : display.side === 'white' ? t.userSideWhite
              : '—';
            const modeLabel = r.mode === 'human_vs_cpu' ? t.userTypeCpu : r.mode === 'online_pvp' ? t.userTypeOnline : t.userTypeHuman;

            // ローカルキャッシュを優先。なければ Supabase の full_record からフォールバック
            const local = localMap.get(r.game_id);
            const remoteRecord: GameRecord | null =
              !local && r.full_record && r.full_record.length > 0
                ? {
                    game_id: r.game_id,
                    started_at: r.started_at,
                    ended_at: r.ended_at,
                    mode: r.mode as GameRecord['mode'],
                    human_color: r.human_color as GameRecord['human_color'],
                    winner: r.winner as GameRecord['winner'],
                    move_count: r.move_count,
                    first_3_plies: [],
                    full_record: r.full_record,
                  }
                : null;
            const gameRecord = local ?? remoteRecord;

            function handleAnalyze() {
              if (!gameRecord) return;
              // Supabase から復元した場合はローカルにキャッシュして次回以降即参照できるようにする
              if (!local && remoteRecord) {
                cacheGameRecord(remoteRecord);
              }
              onPostmortem(gameRecord);
            }

            return (
              <tr key={r.game_id}>
                <td style={s.td}>{r.created_at ? formatDate(r.created_at, lang) : '—'}</td>
                <td style={{ ...s.td, fontWeight: 700, color: resultColor }}>{result}</td>
                <td style={s.td}>{side}</td>
                <td style={s.td}>{r.move_count}</td>
                <td style={s.td}>{modeLabel}</td>
                <td style={s.td}>
                  {gameRecord ? (
                    <div style={s.btnGroup}>
                      {(() => {
                        const st = getStatus ? getStatus(r.game_id) : { status: 'idle' as const };
                        const busy = st.status === 'queued' || st.status === 'running';
                        const isDone = analyzeCompletedIds.has(r.game_id);
                        const label = busy
                          ? (st.status === 'queued' ? (t.analyzing + '…') : t.analyzing)
                          : isDone
                          ? t.analysisDone
                          : st.status === 'error'
                          ? (t.analyze + ' ↩')
                          : t.analyze;
                        return (
                          <button
                            type="button"
                            style={busy || isDone ? s.analyzingBtn : s.analyzeBtn}
                            disabled={busy}
                            onClick={() => onAnalyzeClick ? onAnalyzeClick(gameRecord) : handleAnalyze()}
                          >
                            {label}
                          </button>
                        );
                      })()}
                      {onRefresh && (
                        <button
                          type="button"
                          style={refreshingIds.has(r.game_id) ? s.refreshingBtn : s.refreshBtn}
                          disabled={refreshingIds.has(r.game_id)}
                          onClick={() => onRefresh(gameRecord)}
                        >
                          {refreshingIds.has(r.game_id)
                            ? t.refreshing
                            : refreshCompletedIds.has(r.game_id)
                            ? t.refreshDone
                            : t.refresh}
                        </button>
                      )}
                    </div>
                  ) : <span style={{ color: '#ccc' }}>—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── RecentGamesCard (v2 カードリスト形式) ─────────────────────────────────────────────

function RecentGamesCard({
  games,
  localMap,
  officialGameMap = new Map(),
  currentUserId = '',
  onPostmortem,
  refreshingIds = new Set(),
  onRefresh,
  getStatus,
  onAnalyzeClick,
  analyzeCompletedIds = new Set(),
  refreshCompletedIds = new Set(),
  proActive = false,
}: {
  games: MatchLogRow[];
  localMap: Map<string, GameRecord>;
  officialGameMap?: Map<string, OfficialMatchListItem>;
  currentUserId?: string;
  onPostmortem: (r: GameRecord) => void;
  refreshingIds?: Set<string>;
  onRefresh?: (r: GameRecord) => void;
  getStatus?: (gameId: string) => import('../hooks/usePostmortemWorker').AnalysisJobStatus;
  onAnalyzeClick?: (r: GameRecord) => void;
  analyzeCompletedIds?: Set<string>;
  refreshCompletedIds?: Set<string>;
  proActive?: boolean;
}) {
  const { t, lang } = useLang();
  return (
    <div className="up-games-card">
      {!proActive && (
        <div style={s.upgradeBanner}>
          <span>{t.proUpgradeGames}</span>
          <a href="/pro.html" style={s.upgradeBannerLink}>{t.proUpgradeBtn} →</a>
        </div>
      )}
      {games.map((r) => {
        const om = (r.mode === 'online_pvp')
          ? officialGameMap.get(r.game_id)
          : undefined;
        const display = resolveRecentGameDisplay(r, om, currentUserId);

        const resultSymbol = display.result === 'win'  ? '○'
          : display.result === 'loss' ? '×'
          : display.result === 'draw' ? '△'
          : '—';
        const badgeClass = display.result === 'win'  ? 'up-game-result-badge up-game-result-badge--win'
          : display.result === 'loss' ? 'up-game-result-badge up-game-result-badge--loss'
          : display.result === 'draw' ? 'up-game-result-badge up-game-result-badge--draw'
          : 'up-game-result-badge up-game-result-badge--neutral';

        const side = display.side === 'black' ? t.userSideBlack
          : display.side === 'white' ? t.userSideWhite
          : null;
        const modeLabel = r.mode === 'human_vs_cpu' ? t.userTypeCpu
          : r.mode === 'online_pvp' ? t.userTypeOnline
          : t.userTypeHuman;
        const detailParts = [
          side,
          r.move_count != null ? t.userMoveCount(r.move_count) : null,
          modeLabel,
        ].filter(Boolean).join(' · ');

        const local = localMap.get(r.game_id);
        const remoteRecord: GameRecord | null =
          !local && r.full_record && r.full_record.length > 0
            ? {
                game_id: r.game_id,
                started_at: r.started_at,
                ended_at: r.ended_at,
                mode: r.mode as GameRecord['mode'],
                human_color: r.human_color as GameRecord['human_color'],
                winner: r.winner as GameRecord['winner'],
                move_count: r.move_count,
                first_3_plies: [],
                full_record: r.full_record,
              }
            : null;
        const gameRecord = local ?? remoteRecord;

        function handleAnalyze() {
          if (!gameRecord) return;
          if (!local && remoteRecord) { cacheGameRecord(remoteRecord); }
          onPostmortem(gameRecord);
        }

        return (
          <div key={r.game_id} className="up-game-row">
            <div className={badgeClass}>{resultSymbol}</div>
            <div className="up-game-info">
              <span className="up-game-date">{r.created_at ? formatDate(r.created_at, lang) : '—'}</span>
              <span className="up-game-detail">{detailParts || '—'}</span>
            </div>
            <div className="up-game-actions">
              {gameRecord ? (
                <>
                  {(() => {
                    const st = getStatus ? getStatus(r.game_id) : { status: 'idle' as const };
                    const busy = st.status === 'queued' || st.status === 'running';
                    const isDone = analyzeCompletedIds.has(r.game_id);
                    const isError = st.status === 'error';
                    const label = busy
                      ? (st.status === 'queued' ? (t.analyzing + '…') : t.analyzing)
                      : isDone
                      ? t.analysisDone
                      : isError
                      ? (t.analyze + ' ↩')
                      : t.analyze;
                    const btnClass = busy
                      ? 'up-pill-btn up-pill-btn--disabled'
                      : isDone
                      ? 'up-pill-btn up-pill-btn--done'
                      : isError
                      ? 'up-pill-btn up-pill-btn--error'
                      : 'up-pill-btn';
                    return (
                      <button
                        type="button"
                        className={btnClass}
                        disabled={busy}
                        onClick={() => onAnalyzeClick ? onAnalyzeClick(gameRecord) : handleAnalyze()}
                      >
                        {label}
                      </button>
                    );
                  })()}
                  {onRefresh && (
                    <button
                      type="button"
                      className={refreshingIds.has(r.game_id) ? 'up-pill-btn up-pill-btn--disabled' : refreshCompletedIds.has(r.game_id) ? 'up-pill-btn up-pill-btn--done' : 'up-pill-btn'}
                      disabled={refreshingIds.has(r.game_id)}
                      onClick={() => onRefresh(gameRecord)}
                    >
                      {refreshingIds.has(r.game_id)
                        ? t.refreshing
                        : refreshCompletedIds.has(r.game_id)
                        ? t.refreshDone
                        : t.refresh}
                    </button>
                  )}
                </>
              ) : <span className="up-game-dash">—</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 共通部品 ──────────────────────────────────────────────────────────────────

function SectionTitle({ title, soon }: { title: string; soon?: boolean }) {
  const { t } = useLang();
  return (
    <div className="up-section-header">
      <h2 className="up-section-title">{title}</h2>
      {soon && <span className="up-section-soon">{t.onlineComingSoon}</span>}
    </div>
  );
}

function Muted({ text }: { text: string }) {
  return <p style={{ color: '#aaa', fontSize: '0.82rem', margin: '0.5rem 0' }}>{text}</p>;
}

function pct(val: number): string {
  return `${Math.round(val * 100)}%`;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    background: '#fff',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
  },
  topbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #eee',
    position: 'sticky',
    top: 0,
    background: '#fff',
    zIndex: 10,
  },
  topbarTitle: {
    fontWeight: 700,
    fontSize: '0.95rem',
    letterSpacing: '0.08em',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    fontSize: '0.85rem',
    cursor: 'pointer',
    color: '#555',
    padding: 0,
    width: 64,
    textAlign: 'left' as const,
  },

  scrollArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 0 2rem',
  },
  section: {
    padding: '1.25rem 1rem 0.5rem',
    borderBottom: '1px solid #f0f0f0',
  },
  // プロフィールヘッダー
  profileHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    marginBottom: '1rem',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: '50%',
    background: '#111',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.3rem',
    fontWeight: 700,
    flexShrink: 0,
  },
  profileInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  nameEditRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap' as const,
  },
  nameInput: {
    fontSize: '0.95rem',
    fontWeight: 700,
    border: '1px solid #ccc',
    borderRadius: 4,
    padding: '2px 6px',
    outline: 'none',
    width: 140,
  },
  nameBtn: {
    fontSize: '0.7rem',
    padding: '2px 8px',
    border: '1px solid #bbb',
    borderRadius: 4,
    background: '#111',
    color: '#fff',
    cursor: 'pointer',
  },
  nameBtnCancel: {
    background: '#fff',
    color: '#555',
  },
  editNameBtn: {
    fontSize: '0.68rem',
    padding: '1px 6px',
    border: '1px solid #ddd',
    borderRadius: 4,
    background: 'none',
    color: '#888',
    cursor: 'pointer',
  },
  playerName: {
    fontWeight: 700,
    fontSize: '1.1rem',
  },
  playerId: {
    fontSize: '0.75rem',
    color: '#888',
    fontFamily: 'monospace',
  },
  profileGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.5rem 1rem',
    marginBottom: '0.5rem',
  },
  langSettingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginTop: '0.75rem',
  },
  langSettingLabel: {
    fontSize: '0.72rem',
    color: '#999',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    flexShrink: 0,
  },
  langBtnGroup: {
    display: 'flex',
    gap: '0.4rem',
  },
  langBtn: {
    fontSize: '0.78rem',
    padding: '3px 10px',
    border: '1px solid #ccc',
    borderRadius: 4,
    background: 'none',
    color: '#555',
    cursor: 'pointer',
  },
  langBtnActive: {
    background: '#111',
    color: '#fff',
    borderColor: '#111',
  },
  profileItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  profileItemLabel: {
    fontSize: '0.68rem',
    color: '#999',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
  profileItemValue: {
    fontSize: '0.88rem',
    fontWeight: 600,
    color: '#111',
  },
  // 成績サマリー
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.5rem',
    marginBottom: '1rem',
  },
  statCard: {
    background: '#f8f8f8',
    borderRadius: 8,
    padding: '0.6rem 0.5rem',
    textAlign: 'center' as const,
  },
  statValue: {
    fontWeight: 700,
    fontSize: '1.2rem',
    color: '#111',
  },
  statLabel: {
    fontSize: '0.66rem',
    color: '#888',
    marginTop: 2,
    lineHeight: 1.3,
  },
  recent20Wrap: {
    marginTop: '0.5rem',
  },
  dotRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 4,
    margin: '0.4rem 0',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    display: 'inline-block',
  },
  dotLegend: {
    fontSize: '0.7rem',
    color: '#888',
  },
  // プレイ傾向
  barRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: 6,
  },
  barLabel: {
    width: 70,
    fontSize: '0.78rem',
    color: '#555',
    flexShrink: 0,
  },
  barTrack: {
    flex: 1,
    height: 8,
    background: '#eee',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    background: '#111',
    borderRadius: 4,
    transition: 'width 0.3s',
  },
  barValue: {
    width: 36,
    fontSize: '0.75rem',
    color: '#555',
    textAlign: 'right' as const,
    flexShrink: 0,
  },
  posRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
    marginTop: 6,
  },
  posChip: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '0.35rem 0.6rem',
    background: '#f0f0f0',
    borderRadius: 6,
    gap: 2,
  },
  posLabel: {
    fontWeight: 700,
    fontSize: '0.9rem',
  },
  posCount: {
    fontSize: '0.65rem',
    color: '#777',
  },
  // テーブル
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.78rem',
  },
  th: {
    textAlign: 'left' as const,
    padding: '0.4rem 0.4rem',
    borderBottom: '1px solid #eee',
    color: '#999',
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
  },
  td: {
    padding: '0.4rem 0.4rem',
    borderBottom: '1px solid #f5f5f5',
    whiteSpace: 'nowrap' as const,
  },
  upgradeBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    fontSize: '0.75rem',
    color: '#888',
    padding: '6px 4px 4px',
    borderTop: '1px solid #f0f0f0',
    marginTop: '4px',
  },
  upgradeBannerLink: {
    color: '#555',
    fontSize: '0.72rem',
    whiteSpace: 'nowrap' as const,
    textDecoration: 'none',
    flexShrink: 0,
  },
  // Pro status banner (profile section)
  proBadgeRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 0 4px',
    borderTop: '1px solid #f0f0f0',
    marginTop: '8px',
  },
  proBadge: {
    display: 'inline-block',
    background: '#111',
    color: '#fff',
    fontSize: '0.65rem',
    fontWeight: 700,
    letterSpacing: '0.12em',
    padding: '3px 9px',
    borderRadius: '3px',
  },
  proUpgradeBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    padding: '10px 12px',
    marginTop: '12px',
    background: '#fafafa',
    border: '1px solid #e8e8e8',
    borderRadius: '8px',
  },
  proUpgradeTitle: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#222',
    marginBottom: '2px',
  },
  proUpgradeDesc: {
    fontSize: '0.72rem',
    color: '#888',
  },
  proUpgradeBtn: {
    display: 'inline-block',
    background: '#111',
    color: '#fff',
    fontSize: '0.72rem',
    fontWeight: 600,
    padding: '6px 12px',
    borderRadius: '5px',
    textDecoration: 'none',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  btnGroup: {
    display: 'flex',
    gap: 4,
    alignItems: 'center',
  },
  analyzeBtn: {
    background: 'none',
    border: '1px solid #ddd',
    borderRadius: 4,
    fontSize: '0.7rem',
    padding: '2px 7px',
    cursor: 'pointer',
    color: '#444',
    whiteSpace: 'nowrap' as const,
  },
  analyzingBtn: {
    background: 'none',
    border: '1px solid #ddd',
    borderRadius: 4,
    fontSize: '0.7rem',
    padding: '2px 7px',
    cursor: 'not-allowed',
    color: '#bbb',
    whiteSpace: 'nowrap' as const,
    opacity: 0.5,
  },
  refreshBtn: {
    background: 'none',
    border: '1px solid #c8d8f0',
    borderRadius: 4,
    fontSize: '0.7rem',
    padding: '2px 7px',
    cursor: 'pointer',
    color: '#3a7bd5',
    whiteSpace: 'nowrap' as const,
  },
  refreshingBtn: {
    background: 'none',
    border: '1px solid #ddd',
    borderRadius: 4,
    fontSize: '0.7rem',
    padding: '2px 7px',
    cursor: 'default',
    color: '#aaa',
    whiteSpace: 'nowrap' as const,
  },
  cpuBtn: {
    padding: '0.5rem 1.1rem',
    background: '#111',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: '0.82rem',
    fontWeight: 600,
    cursor: 'pointer',
    letterSpacing: '0.04em',
  },
  // 代表棋譜
  featuredScroll: {
    display: 'flex',
    gap: '0.75rem',
    overflowX: 'auto',
    paddingBottom: '0.5rem',
  },
  featuredCard: {
    flexShrink: 0,
    width: 140,
    background: '#f8f8f8',
    borderRadius: 8,
    padding: '0.75rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  featuredLabel: {
    fontSize: '0.72rem',
    fontWeight: 700,
    color: '#555',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  featuredMeta: {
    fontSize: '0.75rem',
    color: '#777',
  },
  // 共通
  sectionTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.75rem',
  },
  sectionTitle: {
    fontWeight: 700,
    fontSize: '0.82rem',
    letterSpacing: '0.08em',
    color: '#111',
    textTransform: 'uppercase' as const,
  },
  sectionLabel: {
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    color: '#999',
    textTransform: 'uppercase' as const,
    marginBottom: 6,
  },
  soonBadge: {
    display: 'inline-block',
    padding: '0.1rem 0.5rem',
    background: '#e0e0e0',
    borderRadius: 4,
    fontSize: '0.68rem',
    color: '#555',
    fontWeight: 600,
    letterSpacing: '0.04em',
  },
};
