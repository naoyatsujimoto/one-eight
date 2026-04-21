/**
 * PostmortemModal.tsx — 対局の勝敗を分けた一手を分析して表示するポップアップ
 */
import { useEffect, useState } from 'react';
import { runPostmortem, type PostmortemResult } from '../game/postmortem';
import { loadPostmortemCache, savePostmortemCache } from '../game/storage';
import type { MoveRecord } from '../game/types';
import { useLang } from '../lib/lang';

interface Props {
  history: MoveRecord[];
  gameId: string;
  onClose: () => void;
}

export function PostmortemModal({ history, gameId, onClose }: Props) {
  const { t } = useLang();
  const [result, setResult] = useState<PostmortemResult | null>(null);
  const [analyzing, setAnalyzing] = useState(true);

  useEffect(() => {
    // キャッシュヒット確認
    const cached = loadPostmortemCache(gameId);
    if (cached) {
      setResult(cached);
      setAnalyzing(false);
      return;
    }
    setAnalyzing(true);
    setResult(null);
    // 非同期でレンダリングさせてからminimaxを実行
    const timer = setTimeout(() => {
      const r = runPostmortem(history);
      savePostmortemCache(gameId, r);
      setResult(r);
      setAnalyzing(false);
    }, 30);
    return () => clearTimeout(timer);
  }, [gameId, history]);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>{t.postmortem}</span>
          <button type="button" onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        {analyzing && (
          <div style={styles.center}>
            <div style={styles.spinner} />
            <p style={styles.muted}>{t.analyzing}</p>
          </div>
        )}

        {!analyzing && result && result.rows.length < 3 && (
          <p style={styles.muted}>{t.noAnalysis}</p>
        )}

        {!analyzing && result && result.rows.length >= 3 && (
          <>
            {/* 決定的な一手 */}
            <section style={styles.section}>
              <div style={styles.sectionTitle}>{t.decisiveMove}</div>
              {result.decisiveCrossing ? (
                <div style={styles.decisiveBox}>
                  <div style={styles.decisiveMoveNum}>Move #{result.decisiveCrossing.moveNum}</div>
                  <div style={styles.decisivePlayed}>{result.decisiveCrossing.played}</div>
                  <div style={styles.decisiveWP}>
                    WP {pct(result.decisiveCrossing.fromWP)} → {pct(result.decisiveCrossing.toWP)}
                    {' '}{result.decisiveCrossing.direction === 'down' ? '↓' : '↑'}
                    <span style={{ marginLeft: 6, color: '#888', fontSize: '0.75rem' }}>
                      ({result.decisiveCrossing.player === 'black' ? 'Black' : 'White'})
                    </span>
                  </div>
                </div>
              ) : (
                <p style={styles.muted}>—</p>
              )}
            </section>

            {/* 勝率グラフ */}
            <section style={styles.section}>
              <div style={styles.sectionTitle}>Win Probability (Black)</div>
              <WPChart rows={result.rows} wpInitial={result.wpInitial} decisiveMoveNum={result.decisiveCrossing?.moveNum ?? null} />
            </section>

            {/* Blackの損失top3 */}
            {result.topBlackLosses.length > 0 && (
              <section style={styles.section}>
                <div style={styles.sectionTitle}>{t.topLosses}</div>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Move</th>
                      <th style={styles.th}>Played</th>
                      <th style={styles.th}>Best</th>
                      <th style={styles.th}>ΔWP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.topBlackLosses.map((r) => (
                      <tr key={r.moveNum}>
                        <td style={styles.td}>#{r.moveNum}</td>
                        <td style={{ ...styles.td, color: '#e53' }}>{r.played}</td>
                        <td style={{ ...styles.td, color: '#27a' }}>{r.best ?? '—'}</td>
                        <td style={styles.td}>{r.wpSwing !== null ? `${(r.wpSwing * 100).toFixed(1)}pt` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── WPチャート（SVG） ────────────────────────────────────────────────────────

interface WPChartProps {
  rows: PostmortemResult['rows'];
  wpInitial: number;
  decisiveMoveNum: number | null;
}

function WPChart({ rows, wpInitial, decisiveMoveNum }: WPChartProps) {
  const W = 320;
  const H = 100;
  const PAD = { top: 8, bottom: 8, left: 28, right: 8 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const wps = [wpInitial, ...rows.map(r => r.wpAfter)];
  const n = wps.length;

  function xOf(i: number) {
    return PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  }
  function yOf(wp: number) {
    return PAD.top + (1 - wp) * plotH;
  }

  const polyline = wps.map((wp, i) => `${xOf(i)},${yOf(wp)}`).join(' ');

  // 決定的一手のX座標
  const decisiveX = decisiveMoveNum !== null
    ? (() => {
        const idx = rows.findIndex(r => r.moveNum === decisiveMoveNum);
        return idx >= 0 ? xOf(idx + 1) : null;
      })()
    : null;

  const y50 = yOf(0.5);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {/* 背景 */}
      <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="#f9f9f9" rx={3} />

      {/* 50%ライン */}
      <line x1={PAD.left} y1={y50} x2={PAD.left + plotW} y2={y50}
        stroke="#ccc" strokeWidth={1} strokeDasharray="4 3" />

      {/* Y軸ラベル */}
      <text x={PAD.left - 4} y={PAD.top + 4} textAnchor="end" fontSize={9} fill="#aaa">100%</text>
      <text x={PAD.left - 4} y={y50 + 4} textAnchor="end" fontSize={9} fill="#aaa">50%</text>
      <text x={PAD.left - 4} y={PAD.top + plotH + 2} textAnchor="end" fontSize={9} fill="#aaa">0%</text>

      {/* WP折れ線 */}
      <polyline points={polyline} fill="none" stroke="#222" strokeWidth={1.5} strokeLinejoin="round" />

      {/* 決定的一手マーカー */}
      {decisiveX !== null && (() => {
        const r = rows.find(r => r.moveNum === decisiveMoveNum);
        if (!r) return null;
        const cy = yOf(r.wpAfter);
        return (
          <g>
            <line x1={decisiveX} y1={PAD.top} x2={decisiveX} y2={PAD.top + plotH}
              stroke="#e53" strokeWidth={1} strokeDasharray="3 2" />
            <circle cx={decisiveX} cy={cy} r={4} fill="#e53" />
          </g>
        );
      })()}
    </svg>
  );
}

// ─── ヘルパー ──────────────────────────────────────────────────────────────────

function pct(wp: number): string {
  return `${(wp * 100).toFixed(1)}%`;
}

// ─── スタイル ─────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 300,
  },
  card: {
    background: '#fff',
    borderRadius: 10,
    padding: '1.25rem',
    width: '92%',
    maxWidth: 400,
    maxHeight: '85vh',
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
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '2rem 0',
    gap: 12,
  },
  spinner: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    border: '3px solid #eee',
    borderTopColor: '#222',
    animation: 'spin 0.8s linear infinite',
  },
  muted: {
    color: '#999',
    textAlign: 'center',
    fontSize: '0.85rem',
  },
  section: {
    marginBottom: '1.2rem',
  },
  sectionTitle: {
    fontSize: '0.72rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: '#888',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  decisiveBox: {
    background: '#fff8f6',
    border: '1px solid #fbb',
    borderRadius: 8,
    padding: '0.7rem 0.9rem',
  },
  decisiveMoveNum: {
    fontSize: '0.72rem',
    color: '#e53',
    fontWeight: 700,
    marginBottom: 2,
  },
  decisivePlayed: {
    fontSize: '1rem',
    fontWeight: 700,
    color: '#222',
    marginBottom: 4,
  },
  decisiveWP: {
    fontSize: '0.82rem',
    color: '#555',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.78rem',
  },
  th: {
    textAlign: 'left',
    padding: '0.35rem 0.4rem',
    borderBottom: '1px solid #eee',
    color: '#888',
    fontWeight: 600,
  },
  td: {
    padding: '0.35rem 0.4rem',
    borderBottom: '1px solid #f0f0f0',
  },
};

// CSS animation for spinner (global injection)
if (typeof document !== 'undefined' && !document.getElementById('pm-spinner-style')) {
  const style = document.createElement('style');
  style.id = 'pm-spinner-style';
  style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);
}
