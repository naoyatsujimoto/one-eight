/**
 * PostmortemModal.tsx — 対局の勝敗を分けた一手を分析して表示するポップアップ
 *
 * autoStart=true の場合:
 *   - マウント直後に分析を開始する
 *   - 分析中はモーダル（オーバーレイ）を非表示にし、呼び出し元のボタン状態のみで進捗を示す
 *   - 分析完了後に結果モーダルを表示する
 *   - onAnalyzing(true/false) で分析中状態を呼び出し元に通知する
 */
import { useRef, useState, useEffect } from 'react';
import { runPostmortemAsync, enrichPostmortemWithStats, buildResolvedWPSeries, type PostmortemResult } from '../game/postmortem';
import { STRATEGY_FLAG_LABEL, type StrategyFlag } from '../game/strategyPatterns';
import { loadPostmortemCache, savePostmortemCache } from '../game/storage';
import type { MoveRecord } from '../game/types';
import { useLang } from '../lib/lang';

interface Props {
  history: MoveRecord[];
  gameId: string;
  onClose: () => void;
  /** true の場合、マウント直後に分析を自動開始し、分析中はモーダルを非表示にする */
  autoStart?: boolean;
  /** 分析中状態の変化を呼び出し元に通知する (autoStart=true 時に使用) */
  onAnalyzing?: (analyzing: boolean) => void;
}

/** 手数ベースの所要時間推定（秒） depth=3 minimax: 1手あたり約0.15秒 */
function estimateSec(moveCount: number): number {
  return Math.max(5, Math.round(moveCount * 0.15));
}

export function PostmortemModal({ history, gameId, onClose, autoStart = false, onAnalyzing }: Props) {
  const { t } = useLang();
  const [result, setResult] = useState<PostmortemResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  // gameId 単位の in-flight 管理（二重実行防止）
  const inFlightRef = useRef<Set<string>>(new Set());

  // autoStart: マウント直後に分析を自動開始
  useEffect(() => {
    if (autoStart) {
      handleAnalyze();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAnalyze() {
    // 二重実行防止
    if (inFlightRef.current.has(gameId)) return;

    // cache 確認
    const cached = loadPostmortemCache(gameId);
    if (cached) {
      setResult(cached);
      // cache hit 時も最新統計を非同期取得
      enrichPostmortemWithStats(cached, history)
        .then(enriched => { setResult(enriched); })
        .catch(() => {});
      return;
    }

    // 分析開始
    inFlightRef.current.add(gameId);
    setAnalyzing(true);
    onAnalyzing?.(true);
    setAnalyzeError(null);
    setResult(null);

    try {
      // setTimeout(0) で UI スレッドを一時開放
      const base = await new Promise<PostmortemResult>((resolve, reject) => {
        setTimeout(async () => {
          try {
            resolve(await runPostmortemAsync(history, () => !inFlightRef.current.has(gameId)));
          } catch (e) {
            reject(e);
          }
        }, 0);
      });

      savePostmortemCache(gameId, base);
      setResult(base);
      setAnalyzing(false);
      onAnalyzing?.(false);

      // 統計を非同期で取得してオーバーレイ
      enrichPostmortemWithStats(base, history)
        .then(enriched => { setResult(enriched); })
        .catch(() => {/* fallback: 統計なしで表示継続 */});
    } catch {
      setAnalyzeError('分析に失敗しました。再試行してください。');
      setAnalyzing(false);
      onAnalyzing?.(false);
    } finally {
      inFlightRef.current.delete(gameId);
    }
  }

  // autoStart モード: 分析中はモーダルを表示しない（ボタン側のみで状態を示す）
  if (autoStart && analyzing) {
    return null;
  }

  // autoStart モード: 分析前（まだ result がない、エラーもない）はモーダルを表示しない
  if (autoStart && !result && !analyzeError) {
    return null;
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>{t.postmortem}</span>
          <button type="button" onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        {/* Analyze ボタン: autoStart でない場合かつ未分析時・エラー時に表示 */}
        {!autoStart && !analyzing && !result && (
          <div style={styles.center}>
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={analyzing}
              style={styles.analyzeStartBtn}
            >
              Analyze
            </button>
            {analyzeError && (
              <p style={{ ...styles.muted, color: '#e53', marginTop: 8 }}>{analyzeError}</p>
            )}
          </div>
        )}

        {/* エラー表示 (autoStart モード): 再試行ボタンを表示 */}
        {autoStart && analyzeError && (
          <div style={styles.center}>
            <p style={{ ...styles.muted, color: '#e53' }}>{analyzeError}</p>
            <button
              type="button"
              onClick={handleAnalyze}
              style={styles.analyzeStartBtn}
            >
              再試行
            </button>
          </div>
        )}

        {/* 分析中スピナー: autoStart でない場合のみ表示（autoStart は呼び出し元ボタンで示す） */}
        {!autoStart && analyzing && (
          <div style={styles.center}>
            <div style={styles.spinner} />
            <p style={styles.muted}>{t.analyzing}</p>
            <p style={styles.estimateText}>{t.analyzingEstimate(estimateSec(history.length))}</p>
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
                  <StrategicFlagBadges
                    flags={result.rows.find(r => r.moveNum === result.decisiveCrossing!.moveNum)?.strategicFlags}
                  />
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

            {/* 棋譜一覧 */}
            {result.rows.length > 0 && (
              <section style={styles.section}>
                <div style={styles.sectionTitle}>{t.historySection}</div>
                <HistoryList rows={result.rows} wpInitial={result.wpInitial} />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── 戦略フラグバッジ ────────────────────────────────────────────────────────

function StrategicFlagBadges({ flags }: { flags?: StrategyFlag[] }) {
  if (!flags || flags.length === 0) return null;
  return (
    <div style={styles.flagRow}>
      {flags.map(flag => (
        <span key={flag} style={styles.flagBadge}>{STRATEGY_FLAG_LABEL[flag]}</span>
      ))}
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

  const wps = [wpInitial, ...rows.map(r => r.resolvedWP ?? r.wpAfter)];
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

// ─── HISTORY リスト ──────────────────────────────────────────────────────────

interface HistoryListProps {
  rows: PostmortemResult['rows'];
  wpInitial: number;
}

function HistoryList({ rows, wpInitial }: HistoryListProps) {
  const resolvedSeries = buildResolvedWPSeries(rows, wpInitial);
  return (
    <div style={styles.historyList}>
      {rows.map((r, i) => {
        const prevWP = resolvedSeries[i]!;
        const curWP = resolvedSeries[i + 1]!;
        const delta = curWP - prevWP;
        const deltaText = `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}pt`;
        return (
          <div key={r.moveNum} style={styles.historyRow}>
            <span style={styles.historyNum}>#{r.moveNum}</span>
            <span style={styles.historyMove}>{r.played}</span>
            <span style={styles.historyWP}>{pct(curWP)}</span>
            <span style={{ ...styles.historyDelta, color: delta >= 0 ? '#27a' : '#e53' }}>
              {deltaText}
            </span>
          </div>
        );
      })}
    </div>
  );
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
  analyzeStartBtn: {
    background: '#222',
    border: 'none',
    borderRadius: 8,
    fontSize: '0.9rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
    color: '#fff',
    cursor: 'pointer',
    padding: '0.55rem 1.75rem',
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
  estimateText: {
    color: '#bbb',
    textAlign: 'center',
    fontSize: '0.75rem',
    marginTop: -6,
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
  historyList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 0,
  },
  historyRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
    padding: '0.28rem 0',
    borderBottom: '1px solid #f3f3f3',
    fontSize: '0.78rem',
  },
  historyNum: {
    color: '#bbb',
    fontVariantNumeric: 'tabular-nums',
    minWidth: 32,
    flexShrink: 0,
    fontSize: '0.72rem',
  },
  historyMove: {
    flex: 1,
    color: '#333',
    wordBreak: 'break-all' as const,
  },
  historyWP: {
    color: '#555',
    fontVariantNumeric: 'tabular-nums',
    flexShrink: 0,
    minWidth: 44,
    textAlign: 'right' as const,
  },
  historyDelta: {
    fontVariantNumeric: 'tabular-nums',
    flexShrink: 0,
    minWidth: 52,
    textAlign: 'right' as const,
    fontSize: '0.72rem',
  },
  flagRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 4,
    marginTop: 8,
  },
  flagBadge: {
    fontSize: '0.65rem',
    fontWeight: 600,
    letterSpacing: '0.03em',
    color: '#7a5c1e',
    background: '#fdf0d0',
    border: '1px solid #e8c97a',
    borderRadius: 4,
    padding: '1px 6px',
    whiteSpace: 'nowrap' as const,
  },
};

// CSS animation for spinner (global injection)
if (typeof document !== 'undefined' && !document.getElementById('pm-spinner-style')) {
  const style = document.createElement('style');
  style.id = 'pm-spinner-style';
  style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);
}
