/**
 * OfficialArenaOverview.tsx — Official Arena read-only display (Phase E-1)
 *
 * 表示情報:
 *   - ELEPHANT Arena / JAGUAR Arena カード
 *   - 次回開催日時・Entry締切
 *   - 現在のMaster / Interim Master
 *   - 自分のEntry状態
 *   - Pro required 表示
 *   - Entry coming soon ボタン（非活性）
 *
 * 禁止事項:
 *   - enter_arena_event() を呼ばない
 *   - Entry確認モーダルを作らない
 *   - DB/RPC/schema変更なし
 */

import { useEffect, useState, useCallback } from 'react';
import { getArenaOverview, getArenaDetail, type ArenaOverviewItem, type ArenaDetailData } from '../lib/arena';
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

// ─── Arena Detail Modal ───────────────────────────────────────────────────────

function ArenaDetailModal({
  arenaId,
  onClose,
}: {
  arenaId: string;
  onClose: () => void;
}) {
  const { t, lang } = useLang();
  const [detail, setDetail] = useState<ArenaDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getArenaDetail(arenaId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if ('error' in result) {
        setError(result.error);
      } else {
        setDetail(result);
      }
    });
    return () => { cancelled = true; };
  }, [arenaId]);

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.card} onClick={(e) => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <button type="button" style={modalStyles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={modalStyles.body}>
          {loading && (
            <p style={modalStyles.loadingText}>{t.loading}</p>
          )}
          {error && (
            <p style={modalStyles.errorText}>{error}</p>
          )}
          {detail && !loading && (
            <DetailContent detail={detail} lang={lang} t={t} />
          )}
        </div>
      </div>
    </div>
  );
}

function DetailContent({
  detail,
  lang,
  t,
}: {
  detail: ArenaDetailData;
  lang: string;
  t: ReturnType<typeof useLang>['t'];
}) {
  const masterName = detail.current_master_display_name;
  const interimName = detail.current_interim_master_display_name;

  return (
    <div>
      <h2 style={modalStyles.title}>{detail.display_name}</h2>

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
                <th style={modalStyles.th}>{lang === 'ja' ? '名前' : 'Name'}</th>
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
                  {lang === 'ja' ? '勝: ' : 'W: '}{mh.winner_display_name}
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
                {mh.ended_at ? ` — ${formatDate(mh.ended_at, lang)}` : (lang === 'ja' ? ' (現在)' : ' (current)')}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Entry coming soon notice */}
      <div style={modalStyles.entrySoon}>
        <button type="button" style={modalStyles.entrySoonBtn} disabled>
          {t.arenaEntrySoon}
        </button>
      </div>
    </div>
  );
}

// ─── Arena Card ───────────────────────────────────────────────────────────────

function ArenaCard({
  arena,
  onViewDetail,
}: {
  arena: ArenaOverviewItem;
  onViewDetail: (id: string) => void;
}) {
  const { t, lang } = useLang();
  const masterName = arena.current_master_display_name;
  const interimName = arena.current_interim_master_display_name;
  const myStatus = arena.my_entry_status;

  function renderMyEntryStatus() {
    if (!myStatus) return t.arenaNotEntered;
    return myStatus; // pending / matched / no_match etc.
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
        <span style={cardStyles.value}>{renderMyEntryStatus()}</span>
      </div>

      {/* Entry coming soon button */}
      <div style={cardStyles.footer}>
        <button type="button" style={cardStyles.entrySoonBtn} disabled>
          {t.arenaEntrySoon}
        </button>
        <span style={cardStyles.detailHint}>{t.arenaTapForDetail}</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function OfficialArenaOverview() {
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

  return (
    <div style={overviewStyles.root}>
      {/* Section heading */}
      <div style={overviewStyles.sectionTitle}>{t.arenaOfficialArena}</div>

      {/* Arena cards */}
      <div style={overviewStyles.cards}>
        {arenas.map((arena) => (
          <ArenaCard
            key={arena.arena_id}
            arena={arena}
            onViewDetail={setDetailArenaId}
          />
        ))}
      </div>

      {/* Detail modal */}
      {detailArenaId && (
        <ArenaDetailModal
          arenaId={detailArenaId}
          onClose={() => setDetailArenaId(null)}
        />
      )}
    </div>
  );
}

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
  entrySoonBtn: {
    padding: '0.4rem 0.85rem',
    fontSize: '0.78rem',
    background: '#e8e3de',
    color: '#888',
    border: '1px solid #d0cbc5',
    borderRadius: 5,
    cursor: 'default',
    letterSpacing: '0.01em',
  },
  detailHint: {
    fontSize: '0.68rem',
    color: '#aaa',
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
  entrySoon: {
    marginTop: '1rem',
    textAlign: 'center',
  },
  entrySoonBtn: {
    padding: '0.5rem 1.2rem',
    fontSize: '0.82rem',
    background: '#e8e3de',
    color: '#888',
    border: '1px solid #d0cbc5',
    borderRadius: 5,
    cursor: 'default',
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
