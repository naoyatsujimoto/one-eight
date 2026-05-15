import { useEffect, useState } from 'react';
import type { MyStats as MyStatsData, MatchLogRow } from '../lib/matchLog';
import { fetchMyStats } from '../lib/matchLog';
import { loadGameRecords, type GameRecord } from '../game/analytics';
import { clearPostmortemCache } from '../game/storage';
import { PostmortemModal } from './PostmortemModal';
import { useLang } from '../lib/lang';
import { getProfile, isProActive } from '../lib/profile';

interface Props {
  userId: string;
  onClose: () => void;
}

export function MyStats({ userId, onClose }: Props) {
  const { t } = useLang();
  const [stats, setStats] = useState<MyStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [localMap, setLocalMap] = useState<Map<string, GameRecord>>(new Map());
  const [postmortemGame, setPostmortemGame] = useState<GameRecord | null>(null);
  // 分析中の game_id（ボタン色変更 + disabled 制御）
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  // 更新中の game_id（ボタン disabled 制御）
  const [refreshingGameId, setRefreshingGameId] = useState<string | null>(null);
  const [proActive, setProActive] = useState<boolean>(false);

  useEffect(() => {
    fetchMyStats(userId).then((s) => {
      setStats(s);
      setLoading(false);
    });
    // game_id → GameRecord のマップを作成
    const records = loadGameRecords(20);
    const map = new Map<string, GameRecord>();
    for (const r of records) map.set(r.game_id, r);
    setLocalMap(map);
    // プラン取得
    getProfile(userId).then((profile) => {
      if (profile) setProActive(isProActive(profile));
    });
  }, [userId]);

  // 分析ボタンのハンドラ: autoStart モードで分析を開始（ポップアップなし）
  function handleAnalyzeClick(record: GameRecord) {
    if (analyzingId === record.game_id) return; // 二重押し防止
    setAnalyzingId(record.game_id);
    setPostmortemGame(record);
  }

  // 分析中状態の変化を PostmortemModal から受け取る
  function handleAnalyzingChange(active: boolean) {
    if (!active) {
      setAnalyzingId(null);
    }
  }

  // 更新ボタンのハンドラ: cache 削除→autoStart モードで再分析
  function handleRefresh(record: GameRecord) {
    clearPostmortemCache(record.game_id); // 対象 game_id の cache のみ削除
    setRefreshingGameId(record.game_id);
    handleAnalyzeClick(record);
  }

  // モーダル close: 状態リセット
  function handlePostmortemClose() {
    setPostmortemGame(null);
    setRefreshingGameId(null);
    setAnalyzingId(null);
  }

  // Supabase記録にない場合はローカルのみのリストを補完表示
  const localOnlyRecords = Array.from(localMap.values()).filter(
    (r) => !stats?.recent.some((s) => s.game_id === r.game_id),
  );

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>My Stats</span>
          <button type="button" onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        {loading && <p style={styles.muted}>Loading…</p>}

        {!loading && stats && (
          <>
            <div style={styles.summary}>
              <StatItem label="Total" value={stats.total} />
              <StatItem label="Wins" value={stats.wins} />
              <StatItem label="Losses" value={stats.losses} />
              <StatItem label="Draws" value={stats.draws} />
            </div>

            {stats.recent.length === 0 && localOnlyRecords.length === 0 && (
              <p style={styles.muted}>対戦記録がありません</p>
            )}

            {(stats.recent.length > 0 || localOnlyRecords.length > 0) && (
              <>
                <div style={styles.sectionLabel}>{t.gameHistory}</div>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Mode</th>
                      <th style={styles.th}>Winner</th>
                      <th style={styles.th}>Moves</th>
                      <th style={styles.th}>Date</th>
                      <th style={styles.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Supabase記録（ローカルが一致すれば分析ボタン付き） */}
                    {stats.recent.map((r: MatchLogRow) => {
                      const local = localMap.get(r.game_id);
                      return (
                        <tr key={r.game_id}>
                          <td style={styles.td}>{r.mode === 'human_vs_cpu' ? 'vs CPU' : 'H×H'}</td>
                          <td style={styles.td}>{r.winner ?? '—'}</td>
                          <td style={styles.td}>{r.move_count}</td>
                          <td style={styles.td}>{r.created_at ? new Date(r.created_at).toLocaleDateString('ja-JP') : '—'}</td>
                          <td style={styles.td}>
                            {local ? (
                              <div style={styles.btnGroup}>
                                <button
                                  type="button"
                                  style={analyzingId === local.game_id ? styles.analyzingBtn : styles.analyzeBtn}
                                  disabled={analyzingId === local.game_id}
                                  onClick={() => handleAnalyzeClick(local)}
                                >
                                  {analyzingId === local.game_id ? t.analyzing : t.analyze}
                                </button>
                                <button
                                  type="button"
                                  style={refreshingGameId === local.game_id ? styles.refreshingBtn : styles.refreshBtn}
                                  disabled={refreshingGameId === local.game_id}
                                  onClick={() => handleRefresh(local)}
                                >
                                  {refreshingGameId === local.game_id ? t.refreshing : t.refresh}
                                </button>
                              </div>
                            ) : (
                              <span style={styles.noData}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {/* ローカルのみの記録（Supabaseに未登録） */}
                    {localOnlyRecords.map((r) => (
                      <tr key={r.game_id}>
                        <td style={styles.td}>{r.mode === 'human_vs_cpu' ? 'vs CPU' : 'H×H'}</td>
                        <td style={styles.td}>{r.winner ?? '—'}</td>
                        <td style={styles.td}>{r.move_count}</td>
                        <td style={styles.td}>{new Date(r.ended_at).toLocaleDateString('ja-JP')}</td>
                        <td style={styles.td}>
                          <div style={styles.btnGroup}>
                            <button
                              type="button"
                              style={analyzingId === r.game_id ? styles.analyzingBtn : styles.analyzeBtn}
                              disabled={analyzingId === r.game_id}
                              onClick={() => handleAnalyzeClick(r)}
                            >
                              {analyzingId === r.game_id ? t.analyzing : t.analyze}
                            </button>
                            <button
                              type="button"
                              style={refreshingGameId === r.game_id ? styles.refreshingBtn : styles.refreshBtn}
                              disabled={refreshingGameId === r.game_id}
                              onClick={() => handleRefresh(r)}
                            >
                              {refreshingGameId === r.game_id ? t.refreshing : t.refresh}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Upgrade 導線: 無料ユーザーのみ表示 */}
                {!proActive && (
                  <div style={styles.upgradeBanner}>
                    過去の全対局を見るには Pro プランへ
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* 分析モーダル (autoStart=true: 分析中は非表示、完了後に表示) */}
      {postmortemGame && (
        <PostmortemModal
          history={postmortemGame.full_record}
          gameId={postmortemGame.game_id}
          onClose={handlePostmortemClose}
          autoStart
          onAnalyzing={handleAnalyzingChange}
        />
      )}
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: '0.72rem', color: '#777', marginTop: 2 }}>{label}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },
  card: {
    background: '#fff',
    borderRadius: 10,
    padding: '1.25rem',
    width: '90%',
    maxWidth: 420,
    maxHeight: '80vh',
    overflowY: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  title: {
    fontWeight: 700,
    fontSize: '1rem',
    letterSpacing: '0.05em',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '1rem',
    cursor: 'pointer',
    color: '#555',
  },
  summary: {
    display: 'flex',
    gap: '1.5rem',
    justifyContent: 'center',
    marginBottom: '1.25rem',
    padding: '0.75rem',
    background: '#f8f8f8',
    borderRadius: 8,
  },
  sectionLabel: {
    fontSize: '0.72rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: '#888',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.8rem',
  },
  th: {
    textAlign: 'left',
    padding: '0.4rem 0.5rem',
    borderBottom: '1px solid #eee',
    color: '#888',
    fontWeight: 600,
  },
  td: {
    padding: '0.4rem 0.5rem',
    borderBottom: '1px solid #f0f0f0',
  },
  muted: {
    color: '#999',
    textAlign: 'center',
    fontSize: '0.85rem',
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
    fontSize: '0.72rem',
    padding: '2px 8px',
    cursor: 'pointer',
    color: '#444',
    whiteSpace: 'nowrap',
  },
  analyzingBtn: {
    background: 'none',
    border: '1px solid #ddd',
    borderRadius: 4,
    fontSize: '0.72rem',
    padding: '2px 8px',
    cursor: 'not-allowed',
    color: '#bbb',
    whiteSpace: 'nowrap',
    opacity: 0.5,
  },
  refreshBtn: {
    background: 'none',
    border: '1px solid #c8d8f0',
    borderRadius: 4,
    fontSize: '0.72rem',
    padding: '2px 8px',
    cursor: 'pointer',
    color: '#3a7bd5',
    whiteSpace: 'nowrap',
  },
  refreshingBtn: {
    background: 'none',
    border: '1px solid #ddd',
    borderRadius: 4,
    fontSize: '0.72rem',
    padding: '2px 8px',
    cursor: 'default',
    color: '#aaa',
    whiteSpace: 'nowrap',
  },
  noData: {
    color: '#ccc',
    fontSize: '0.8rem',
  },
  upgradeBanner: {
    marginTop: '1rem',
    padding: '0.6rem 0.75rem',
    background: '#f4f7ff',
    border: '1px solid #d0daf8',
    borderRadius: 6,
    fontSize: '0.8rem',
    color: '#4a6abf',
    textAlign: 'center' as const,
  },
};
