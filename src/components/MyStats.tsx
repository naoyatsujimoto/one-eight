import { useEffect, useState, useRef } from 'react';
import type { MyStats as MyStatsData, MatchLogRow } from '../lib/matchLog';
import { fetchMyStats } from '../lib/matchLog';
import { loadGameRecords, type GameRecord } from '../game/analytics';
import { clearPostmortemCache } from '../game/storage';
import { PostmortemModal } from './PostmortemModal';
import { usePostmortemWorker } from '../hooks/usePostmortemWorker';
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
  // 更新中の game_idセット（per-row 制御）
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  // 完了表示用セット
  const [analyzeCompletedIds, setAnalyzeCompletedIds] = useState<Set<string>>(new Set());
  const [refreshCompletedIds, setRefreshCompletedIds] = useState<Set<string>>(new Set());
  // 完了表示タイマー管理
  const completionTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [proActive, setProActive] = useState<boolean>(false);

  // シングルトン Worker（gameId 単位管理・キュー処理）
  const { getStatus, run: runWorker, dismiss: dismissWorker } = usePostmortemWorker();
  // モーダル表示対象の gameId
  const [pendingModalGameId, setPendingModalGameId] = useState<string | null>(null);
  const pendingStatus = pendingModalGameId ? getStatus(pendingModalGameId) : null;
  const showModal = pendingStatus?.status === 'done' && pendingStatus.history != null;

  useEffect(() => {
    fetchMyStats(userId).then((s) => {
      setStats(s);
      setLoading(false);
    });
    const records = loadGameRecords(20);
    const map = new Map<string, GameRecord>();
    for (const r of records) map.set(r.game_id, r);
    setLocalMap(map);
    getProfile(userId).then((profile) => {
      if (profile) setProActive(isProActive(profile));
    });
  }, [userId]);

  // 分析ボタンのハンドラ: シングルトン Worker に委譲
  // 候補手表示用: 現在分析中の対局の human_color
  const [currentHumanColor, setCurrentHumanColor] = useState<'black' | 'white' | null>(null);

  function handleAnalyzeClick(record: GameRecord) {
    const st = getStatus(record.game_id);
    if (st.status === 'queued' || st.status === 'running') return;
    const hc = (record.human_color as 'black' | 'white' | null) ?? null;
    setCurrentHumanColor(hc);
    setPendingModalGameId(record.game_id);
    runWorker(record.game_id, record.full_record, hc);
  }

  // 完了表示スケジューラー
  function scheduleCompletion(gameId: string, kind: 'analyze' | 'refresh') {
    const existing = completionTimersRef.current.get(gameId);
    if (existing) clearTimeout(existing);
    const setter = kind === 'analyze' ? setAnalyzeCompletedIds : setRefreshCompletedIds;
    setter(prev => new Set([...prev, gameId]));
    const t = setTimeout(() => {
      setter(prev => { const n = new Set(prev); n.delete(gameId); return n; });
      completionTimersRef.current.delete(gameId);
    }, 2500);
    completionTimersRef.current.set(gameId, t);
  }

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
  }, [getStatus]);

  // 更新ボタンのハンドラ: cache 削除→再分析
  function handleRefresh(record: GameRecord) {
    dismissWorker(record.game_id);
    clearPostmortemCache(record.game_id);
    // 既存の完了表示タイマーをクリア
    const existingTimer = completionTimersRef.current.get(record.game_id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      completionTimersRef.current.delete(record.game_id);
    }
    setRefreshCompletedIds(prev => { const n = new Set(prev); n.delete(record.game_id); return n; });
    setRefreshingIds(prev => new Set([...prev, record.game_id]));
    const hc = (record.human_color as 'black' | 'white' | null) ?? null;
    setCurrentHumanColor(hc);
    setPendingModalGameId(record.game_id);
    runWorker(record.game_id, record.full_record, hc);
  }

  // モーダル close
  function handlePostmortemClose() {
    if (pendingModalGameId) {
      dismissWorker(pendingModalGameId);
      // analyze 完了表示（refresh 完了済みの場合はスキップ）
      if (!refreshCompletedIds.has(pendingModalGameId)) {
        scheduleCompletion(pendingModalGameId, 'analyze');
      }
    }
    setPendingModalGameId(null);
    setCurrentHumanColor(null);
  }

  // Supabase記録にない場合はローカルのみのリストを補完表示
  const localOnlyRecords = Array.from(localMap.values()).filter(
    (r) => !stats?.recent.some((s) => s.game_id === r.game_id),
  );

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>{t.myStats}</span>
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
                                {(() => {
                                  const _st = getStatus(local.game_id);
                                  const busy = _st.status === 'queued' || _st.status === 'running';
                                  const isDone = analyzeCompletedIds.has(local.game_id);
                                  const label = busy
                                    ? (_st.status === 'queued' ? t.analyzing + '…' : t.analyzing)
                                    : isDone ? t.analysisDone : t.analyze;
                                  return (
                                    <button
                                      type="button"
                                      style={busy || isDone ? styles.analyzingBtn : styles.analyzeBtn}
                                      disabled={busy}
                                      onClick={() => handleAnalyzeClick(local)}
                                    >
                                      {label}
                                    </button>
                                  );
                                })()}
                                {(() => {
                                  const isRefreshing = refreshingIds.has(local.game_id);
                                  const isDone = refreshCompletedIds.has(local.game_id);
                                  return (
                                    <button
                                      type="button"
                                      style={isRefreshing ? styles.refreshingBtn : styles.refreshBtn}
                                      disabled={isRefreshing}
                                      onClick={() => handleRefresh(local)}
                                    >
                                      {isRefreshing ? t.refreshing : isDone ? t.refreshDone : t.refresh}
                                    </button>
                                  );
                                })()}
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
                            {(() => {
                              const _st = getStatus(r.game_id);
                              const busy = _st.status === 'queued' || _st.status === 'running';
                              const isDone = analyzeCompletedIds.has(r.game_id);
                              const label = busy
                                ? (_st.status === 'queued' ? t.analyzing + '…' : t.analyzing)
                                : isDone ? t.analysisDone : t.analyze;
                              return (
                                <button
                                  type="button"
                                  style={busy || isDone ? styles.analyzingBtn : styles.analyzeBtn}
                                  disabled={busy}
                                  onClick={() => handleAnalyzeClick(r)}
                                >
                                  {label}
                                </button>
                              );
                            })()}
                            {(() => {
                              const isRefreshing = refreshingIds.has(r.game_id);
                              const isDone = refreshCompletedIds.has(r.game_id);
                              return (
                                <button
                                  type="button"
                                  style={isRefreshing ? styles.refreshingBtn : styles.refreshBtn}
                                  disabled={isRefreshing}
                                  onClick={() => handleRefresh(r)}
                                >
                                  {isRefreshing ? t.refreshing : isDone ? t.refreshDone : t.refresh}
                                </button>
                              );
                            })()}
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

      {/* 分析モーダル: シングルトンの running/done/error 状態で表示。STATS開閉をまたいで継続する */}
      {showModal && pendingModalGameId && pendingStatus?.status === 'done' && (
        <PostmortemModal
          history={pendingStatus.history}
          gameId={pendingModalGameId}
          onClose={handlePostmortemClose}
          autoStart
          humanColor={currentHumanColor}
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
