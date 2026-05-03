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
import { useEffect, useState } from 'react';
import { fetchUserPageStats, fetchPublicUserPageStats, type UserPageStats, type MatchLogRow } from '../lib/matchLog';
import { loadAggregates, loadGameRecords, cacheGameRecord, type GameRecord, type Aggregates } from '../game/analytics';
import { PostmortemModal } from './PostmortemModal';
import { useLang } from '../lib/lang';
import type { Lang } from '../lib/lang';
import { getProfile, upsertProfile } from '../lib/profile';
import { CpuProfile } from './CpuProfile';
import type { CpuDifficulty } from '../game/ai';

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
}

export function UserPage({ userId, userEmail, onBack, viewOnly = false, targetUserId }: Props) {
  const { t, lang, setLangWithSync } = useLang();
  // t is also used in inline JSX below
  const [stats, setStats] = useState<UserPageStats | null>(null);
  const [agg, setAgg] = useState<Aggregates | null>(null);
  const [loading, setLoading] = useState(true);
  const [postmortemGame, setPostmortemGame] = useState<GameRecord | null>(null);
  const [localMap, setLocalMap] = useState<Map<string, GameRecord>>(new Map());
  const [statsPublic, setStatsPublic] = useState(false);
  const [openCpuDiff, setOpenCpuDiff] = useState<CpuDifficulty | null>(null);
  const displayUserId = (viewOnly && targetUserId) ? targetUserId : userId;
  const defaultName = userEmail ? userEmail.split('@')[0] : 'Player';
  const [username, setUsername] = useState<string>(() => {
    if (viewOnly) return '…';
    return loadUsername(userId) ?? defaultName ?? 'Player';
  });
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

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
    }
    // Load profile: stats_public + display name
    getProfile(displayUserId).then((profile) => {
      if (profile) {
        setStatsPublic(profile.stats_public ?? false);
        if (viewOnly && profile.display_name) {
          setUsername(profile.display_name);
        } else if (!viewOnly && !profile.display_name) {
          // Supabaseに display_name がない場合、localName または defaultName を同期
          const nameToSync = loadUsername(userId) || defaultName;
          upsertProfile(userId, { display_name: nameToSync }).catch(() => {/* silent */});
        }
      } else if (viewOnly) {
        setUsername('Unknown');
      } else {
        // プロフィール行自体未作成の場合も同様に同期
        const nameToSync = loadUsername(userId) || defaultName;
        upsertProfile(userId, { display_name: nameToSync }).catch(() => {/* silent */});
      }
    });
  }, [displayUserId, viewOnly]);

  function handleEditName() {
    setNameInput(username);
    setEditingName(true);
  }
  async function handleStatsPublicChange(val: boolean) {
    setStatsPublic(val);
    await upsertProfile(userId, { stats_public: val });
  }

  function handleSaveName() {
    const trimmed = nameInput.trim();
    if (trimmed) {
      setUsername(trimmed);
      saveUsername(userId, trimmed);
      // Supabase にも同期（相手が参照できるように）
      upsertProfile(userId, { display_name: trimmed }).catch(() => {/* silent */});
    }
    setEditingName(false);
  }
  function handleCancelEdit() {
    setEditingName(false);
  }

  const playerName = username;
  const shortId = displayUserId.slice(0, 8).toUpperCase();

  return (
    <div style={s.page}>
      {/* トップバー */}
      <header style={s.topbar}>
        <button type="button" onClick={onBack} style={s.backBtn}>{t.userBack}</button>
        <span style={s.topbarTitle}>ONE EIGHT</span>
        <span style={{ width: 64 }} />
      </header>

      <div style={s.scrollArea}>

        {/* ── Section 1: プロフィールヘッダー ── */}
        <section style={s.section}>
          <div style={s.profileHeader}>
            <div style={s.avatar}>{(playerName ?? 'P').slice(0, 1).toUpperCase()}</div>
            <div style={s.profileInfo}>
              {!viewOnly && editingName ? (
                <div style={s.nameEditRow}>
                  <input
                    style={s.nameInput}
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') handleCancelEdit(); }}
                    maxLength={30}
                    autoFocus
                  />
                  <button type="button" style={s.nameBtn} onClick={handleSaveName}>{t.userSaveName}</button>
                  <button type="button" style={{ ...s.nameBtn, ...s.nameBtnCancel }} onClick={handleCancelEdit}>{t.userCancelEdit}</button>
                </div>
              ) : (
                <div style={s.nameRow}>
                  <span style={s.playerName}>{playerName}</span>
                  {!viewOnly && <button type="button" style={s.editNameBtn} onClick={handleEditName}>{t.userEditName}</button>}
                </div>
              )}
              <div style={s.playerId}>ID: {shortId}</div>
            </div>
          </div>
          <div style={s.profileGrid}>
            <ProfileItem label={t.userJoined} value={
              stats?.joinedAt
                ? new Date(stats.joinedAt).toLocaleDateString('ja-JP')
                : '—'
            } />
            <ProfileItem label={t.userRating} value="— (Coming Soon)" muted />
            <ProfileItem label={t.userDomesticRank} value="— (Coming Soon)" muted />
            <ProfileItem label={t.userSeasonRank} value="— (Coming Soon)" muted />
          </div>

          {/* 言語設定・公開設定（自分のページのみ） */}
          {!viewOnly && (
            <>
              <div style={s.langSettingRow}>
                <span style={s.langSettingLabel}>{t.langLabel}</span>
                <div style={s.langBtnGroup}>
                  {(['en', 'ja'] as Lang[]).map((l) => (
                    <button
                      key={l}
                      type="button"
                      style={{ ...s.langBtn, ...(lang === l ? s.langBtnActive : {}) }}
                      onClick={() => setLangWithSync(l)}
                    >
                      {l === 'en' ? 'English' : '日本語'}
                    </button>
                  ))}
                </div>
              </div>
              <div style={s.langSettingRow}>
                <span style={s.langSettingLabel}>{t.statsVisibility}</span>
                <div style={s.langBtnGroup}>
                  {([true, false] as const).map((val) => (
                    <button
                      key={String(val)}
                      type="button"
                      style={{ ...s.langBtn, ...(statsPublic === val ? s.langBtnActive : {}) }}
                      onClick={() => handleStatsPublicChange(val)}
                    >
                      {val ? t.statsPublic : t.statsPrivate}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>

        {/* viewOnly + 非公開: プライベートメッセージを表示して以降のセクションを非表示 */}
        {viewOnly && !statsPublic && (
          <section style={s.section}>
            <p style={{ color: '#aaa', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>
              {t.statsPrivateMsg}
            </p>
          </section>
        )}

        {/* ── Section 2: 成績サマリー ── */}
        {(!viewOnly || statsPublic) && (
        <>
        <section style={s.section}>
          <SectionTitle title={t.userProfile} />
          {loading ? <Muted text="Loading…" /> : stats && (
            <>
              <div style={s.statGrid}>
                <StatCard label={t.userTotalGames} value={stats.total} />
                <StatCard label={t.userWinRate} value={pct(stats.winRate)} />
                <StatCard label={t.userBlackWinRate} value={pct(stats.blackWinRate)} />
                <StatCard label={t.userWhiteWinRate} value={pct(stats.whiteWinRate)} />
                <StatCard label={t.userCpuWinRate} value={pct(stats.cpuWinRate)} />
                <StatCard label={t.userPvpWinRate} value={pct(stats.pvpWinRate)} />
              </div>
              {stats.recent20.length > 0 && (
                <div style={s.recent20Wrap}>
                  <div style={s.sectionLabel}>{t.userRecent20}</div>
                  <div style={s.dotRow}>
                    {stats.recent20.map((r, i) => (
                      <span
                        key={i}
                        style={{
                          ...s.dot,
                          background: r.win === null ? '#bbb' : r.win ? '#2e7d32' : '#c62828',
                        }}
                        title={r.win === null ? '△' : r.win ? '○' : '×'}
                      />
                    ))}
                  </div>
                  <div style={s.dotLegend}>
                    <span style={{ color: '#2e7d32' }}>● Win</span>
                    <span style={{ color: '#c62828', marginLeft: 10 }}>● Loss</span>
                    <span style={{ color: '#bbb', marginLeft: 10 }}>● Draw</span>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* ── Section 3: レーティング推移（Coming Soon）── */}
        {!viewOnly && (
          <section style={s.section}>
            <SectionTitle title={t.userRatingHistory} soon />
            <Muted text={t.onlineComingSoon} />
          </section>
        )}

        {/* ── Section 4: プレイ傾向 ── */}
        <section style={s.section}>
          <SectionTitle title={t.userTrends} />
          {agg ? <TrendSection agg={agg} /> : <Muted text={t.userNoData} />}
        </section>

        {/* ── Section 5: 最近の対局（viewOnly時は非表示）── */}
        {!viewOnly && (
          <section style={s.section}>
            <SectionTitle title={t.userRecentGames} />
            {loading ? <Muted text="Loading…" /> : stats && stats.recentGames.length > 0 ? ( // eslint-disable-line
              <RecentGamesTable
                games={stats.recentGames}
                localMap={localMap}
                onPostmortem={setPostmortemGame}
              />
            ) : <Muted text={t.userNoData} />}
          </section>
        )}

        {/* ── Section 6: 代表棋譜（viewOnly時は非表示）── */}
        {!viewOnly && (
          <section style={s.section}>
            <SectionTitle title={t.userFeaturedGames} />
            {loading ? <Muted text="Loading…" /> : stats && (
              <FeaturedGames stats={stats} onPostmortem={setPostmortemGame} />
            )}
          </section>
        )}

        {/* ── Section 7: 大会実績（Coming Soon）── */}
        <section style={s.section}>
          <SectionTitle title={t.userTournamentHistory} soon />
          <Muted text={t.onlineComingSoon} />
        </section>

        {/* ── Section 8: 称号 / バッジ（Coming Soon）── */}
        <section style={s.section}>
          <SectionTitle title={t.userBadges} soon />
          <Muted text={t.onlineComingSoon} />
        </section>

        {/* ── CPU Profiles ── */}
        {!viewOnly && (
          <section style={s.section}>
            <SectionTitle title={t.cpuProfiles} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['normal', 'hard', 'very_hard'] as CpuDifficulty[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  style={s.cpuBtn}
                  onClick={() => setOpenCpuDiff(d)}
                >
                  {d === 'normal' ? 'Agnesi' : d === 'hard' ? 'al-Kashi' : 'Maupertuis'}
                </button>
              ))}
            </div>
          </section>
        )}
        </>
        )}

      </div>

      {openCpuDiff && (
        <CpuProfile difficulty={openCpuDiff} onClose={() => setOpenCpuDiff(null)} />
      )}

      {postmortemGame && (
        <PostmortemModal
          history={postmortemGame.full_record}
          gameId={postmortemGame.game_id}
          onClose={() => setPostmortemGame(null)}
        />
      )}
    </div>
  );
}

// ── 成績サマリー ──────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={s.statCard}>
      <div style={s.statValue}>{value}</div>
      <div style={s.statLabel}>{label}</div>
    </div>
  );
}

function ProfileItem({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div style={s.profileItem}>
      <div style={{ ...s.profileItemLabel }}>{label}</div>
      <div style={{ ...s.profileItemValue, ...(muted ? { color: '#aaa' } : {}) }}>{value}</div>
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

// ── 最近の対局テーブル ────────────────────────────────────────────────────────

function RecentGamesTable({
  games,
  localMap,
  onPostmortem,
}: {
  games: MatchLogRow[];
  localMap: Map<string, GameRecord>;
  onPostmortem: (r: GameRecord) => void;
}) {
  const { t } = useLang();
  return (
    <div style={{ overflowX: 'auto' }}>
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
            const isWin = r.winner !== null && r.winner !== 'draw' && r.human_color !== null && r.winner === r.human_color;
            const isDraw = r.winner === 'draw';
            const result = isDraw ? '△' : isWin ? '○' : '×';
            const resultColor = isDraw ? '#888' : isWin ? '#2e7d32' : '#c62828';
            const side = r.human_color === 'black' ? t.userSideBlack : r.human_color === 'white' ? t.userSideWhite : '—';
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
                <td style={s.td}>{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                <td style={{ ...s.td, fontWeight: 700, color: resultColor }}>{result}</td>
                <td style={s.td}>{side}</td>
                <td style={s.td}>{r.move_count}</td>
                <td style={s.td}>{modeLabel}</td>
                <td style={s.td}>
                  {gameRecord ? (
                    <button type="button" style={s.analyzeBtn} onClick={handleAnalyze}>{t.analyze}</button>
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

// ── 代表棋譜 ──────────────────────────────────────────────────────────────────

function FeaturedGames({
  stats,
  onPostmortem,
}: {
  stats: UserPageStats;
  onPostmortem: (r: GameRecord) => void;
}) {
  const { t } = useLang();
  const cards: { label: string; game: GameRecord | null; soon?: boolean }[] = [
    { label: t.userBestWin, game: stats.bestWin },
    { label: t.userLongestGame, game: stats.longestGame },
    { label: t.userUpsetWin, game: stats.upsetWin },
    { label: t.userTournamentGame, game: null, soon: true },
    { label: t.userPinnedGame, game: null, soon: true },
  ];

  return (
    <div style={s.featuredScroll}>
      {cards.map(({ label, game, soon }) => (
        <div key={label} style={{ ...s.featuredCard, ...(soon || !game ? { opacity: 0.5 } : {}) }}>
          <div style={s.featuredLabel}>{label}</div>
          {soon ? (
            <span style={s.soonBadge}>{t.onlineComingSoon}</span>
          ) : game ? (
            <>
              <div style={s.featuredMeta}>{game.move_count} moves · {game.winner ?? '—'}</div>
              <button type="button" style={s.analyzeBtn} onClick={() => onPostmortem(game)}>{t.userViewGame}</button>
            </>
          ) : (
            <div style={{ color: '#bbb', fontSize: '0.78rem' }}>{t.userNoData}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── 共通部品 ──────────────────────────────────────────────────────────────────

function SectionTitle({ title, soon }: { title: string; soon?: boolean }) {
  return (
    <div style={s.sectionTitleRow}>
      <span style={s.sectionTitle}>{title}</span>
      {soon && <span style={s.soonBadge}>Coming Soon</span>}
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
