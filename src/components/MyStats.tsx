import { useEffect, useState } from 'react';
import type { MyStats as MyStatsData, MatchLogRow } from '../lib/matchLog';
import { fetchMyStats } from '../lib/matchLog';

interface Props {
  userId: string;
  onClose: () => void;
}

export function MyStats({ userId, onClose }: Props) {
  const [stats, setStats] = useState<MyStatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyStats(userId).then((s) => {
      setStats(s);
      setLoading(false);
    });
  }, [userId]);

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

            {stats.recent.length === 0 ? (
              <p style={styles.muted}>対戦記録がありません</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Mode</th>
                    <th style={styles.th}>Winner</th>
                    <th style={styles.th}>Moves</th>
                    <th style={styles.th}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent.map((r: MatchLogRow) => (
                    <tr key={r.game_id}>
                      <td style={styles.td}>{r.mode === 'human_vs_cpu' ? 'vs CPU' : 'H×H'}</td>
                      <td style={styles.td}>{r.winner ?? '—'}</td>
                      <td style={styles.td}>{r.move_count}</td>
                      <td style={styles.td}>{r.created_at ? new Date(r.created_at).toLocaleDateString('ja-JP') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
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
};
