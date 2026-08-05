/**
 * PostmortemModal.tsx — 対局の勝敗を分けた一手を分析して表示するポップアップ
 *
 * autoStart=true の場合:
 *   - マウント直後に分析を開始する
 *   - 分析中はモーダル（オーバーレイ）を非表示にし、呼び出し元のボタン状態のみで進捗を示す
 *   - 分析完了後に結果モーダルを表示する
 *   - onAnalyzing(true/false) で分析中状態を呼び出し元に通知する
 */
import './PostmortemModal.css';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  enrichPostmortemWithStats,
  enrichWithCandidateMoves,
  buildResolvedWPSeries,
  type PostmortemResult,
  type CandidateMove,
} from '../game/postmortem';
import { STRATEGY_FLAG_LABEL, type StrategyFlag } from '../game/strategyPatterns';
import type { MoveRecord } from '../game/types';
import { useLang } from '../lib/lang';
import { usePostmortemWorker } from '../hooks/usePostmortemWorker';
import { formatDate } from '../lib/localeFormat';

// ─── GameMeta ─────────────────────────────────────────────────────────────────

export type PostmortemGameMeta = {
  playedAt?: string | null;
  moveCount?: number | null;
  mode?: string | null;
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  history: MoveRecord[];
  gameId: string;
  onClose: () => void;
  /** true の場合、マウント直後に分析を自動開始し、分析中はモーダルを非表示にする */
  autoStart?: boolean;
  /** 分析中状態の変化を呼び出し元に通知する (autoStart=true 時に使用) */
  onAnalyzing?: (analyzing: boolean) => void;
  /** Phase P-2b: Proアクティブユーザーかどうか（候補手表示制御用） */
  proActive?: boolean;
  /** 人間プレイヤーの手番色。候補手表示対象手番の制御用 */
  humanColor?: 'black' | 'white' | null;
  /** 対局メタ情報（ヘッダー表示用） */
  gameMeta?: PostmortemGameMeta;
}

/** 手数ベースの所要時間推定（秒） depth=3 minimax: 1手あたり約0.15秒 */
function estimateSec(moveCount: number): number {
  return Math.max(5, Math.round(moveCount * 0.15));
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PostmortemModal({
  history,
  gameId,
  onClose,
  autoStart = false,
  onAnalyzing,
  proActive = false,
  humanColor,
  gameMeta,
}: Props) {
  const { t, lang } = useLang();
  const [result, setResult] = useState<PostmortemResult | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [computingCandidates, setComputingCandidates] = useState(false);
  const [candidatesComputed, setCandidatesComputed] = useState(false);
  const candidateCancelRef = useRef<boolean>(false);
  const { getStatus, run: runWorker } = usePostmortemWorker();
  const jobStatus = getStatus(gameId);

  const analyzing = jobStatus.status === 'running';

  const handleAnalyze = useCallback(() => {
    const st = getStatus(gameId);
    if (st.status === 'queued' || st.status === 'running') return;
    if (st.status === 'done') {
      setResult(st.result);
      return;
    }
    setAnalyzeError(null);
    setResult(null);
    onAnalyzing?.(true);
    runWorker(gameId, history);
  }, [getStatus, gameId, history, onAnalyzing, runWorker]);

  useEffect(() => {
    const st = getStatus(gameId);
    if (st.status === 'done') {
      const base = st.result;
      setResult(base);
      onAnalyzing?.(false);
      enrichPostmortemWithStats(base, history)
        .then(enriched => setResult(enriched))
        .catch(() => {});
    }
    if (st.status === 'error') {
      setAnalyzeError('failed');
      onAnalyzing?.(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobStatus.status]);

  useEffect(() => {
    if (autoStart) handleAnalyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleShowCandidates = useCallback(async () => {
    if (!result || !humanColor || computingCandidates || candidatesComputed) return;
    candidateCancelRef.current = false;
    setComputingCandidates(true);
    try {
      const enriched = await enrichWithCandidateMoves(
        result,
        history,
        humanColor,
        () => candidateCancelRef.current,
      );
      setResult(enriched);
      setCandidatesComputed(true);
    } catch {
      // サイレントに無視
    } finally {
      setComputingCandidates(false);
    }
  }, [result, history, humanColor, computingCandidates, candidatesComputed]);

  useEffect(() => {
    return () => { candidateCancelRef.current = true; };
  }, []);

  // autoStart モード: 分析中・分析前はモーダルを表示しない
  if (autoStart && analyzing) return null;
  if (autoStart && !result && !analyzeError) return null;

  // ── Header meta string ──────────────────────────────────────────────────────
  const metaParts: string[] = [];
  if (gameMeta?.playedAt) {
    metaParts.push(formatDate(gameMeta.playedAt, lang));
  }
  if (gameMeta?.moveCount != null && gameMeta.moveCount > 0) {
    metaParts.push(t.userMoveCount(gameMeta.moveCount));
  }
  if (gameMeta?.mode) {
    metaParts.push(gameMeta.mode);
  }
  const metaLine = metaParts.join(' ・ ');

  return (
    <div className="pm-overlay" onClick={onClose}>
      <div className="pm-card" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="pm-header">
          <div className="pm-header-left">
            <span className="pm-title">{t.postmortem}</span>
            {metaLine && <span className="pm-meta">{metaLine}</span>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="pm-close-btn"
            aria-label={t.postmortemCloseLabel}
          >
            ✕
          </button>
        </div>

        {/* Analyze button (autoStart=false, 未分析時) */}
        {!autoStart && !analyzing && !result && (
          <div className="pm-center">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={analyzing}
              className="pm-action-btn"
            >
              {t.analyze}
            </button>
            {analyzeError && (
              <p className="pm-error-text">{t.analysisFailedMessage}</p>
            )}
          </div>
        )}

        {/* Error (autoStart モード) */}
        {autoStart && analyzeError && (
          <div className="pm-center">
            <p className="pm-error-text">{t.analysisFailedMessage}</p>
            <button
              type="button"
              onClick={handleAnalyze}
              className="pm-action-btn"
            >
              {t.postmortemRetry}
            </button>
          </div>
        )}

        {/* Spinner (autoStart=false, 分析中) */}
        {!autoStart && analyzing && (
          <div className="pm-center">
            <div className="pm-spinner" />
            <p className="pm-muted">{t.analyzing}</p>
            <p className="pm-estimate">{t.analyzingEstimate(estimateSec(history.length))}</p>
          </div>
        )}

        {/* データ不足 */}
        {!analyzing && result && result.rows.length < 3 && (
          <p className="pm-muted">{t.noAnalysis}</p>
        )}

        {/* 分析結果 */}
        {!analyzing && result && result.rows.length >= 3 && (
          <>
            {/* 決定的な一手 */}
            <section>
              <h2 className="pm-section-heading">{t.decisiveMove}</h2>
              {result.decisiveCrossing ? (
                <div className="pm-decisive-card">
                  <div className="pm-decisive-move-num">
                    {t.postmortemMoveNumber(result.decisiveCrossing.moveNum)}
                  </div>
                  <div className="pm-decisive-played">
                    {result.decisiveCrossing.played}
                  </div>
                  <div className="pm-decisive-wp">
                    <span className="pm-decisive-wp-from">
                      WP {pct(result.decisiveCrossing.fromWP)}
                    </span>
                    <span className="pm-decisive-wp-arrow">→</span>
                    <span className="pm-decisive-wp-to">
                      {pct(result.decisiveCrossing.toWP)}
                      {' '}{result.decisiveCrossing.direction === 'down' ? '↓' : '↑'}
                    </span>
                    <span className="pm-decisive-wp-player">
                      ({result.decisiveCrossing.player === 'black' ? 'Black' : 'White'})
                    </span>
                  </div>
                  <StrategicFlagBadges
                    flags={result.rows.find(r => r.moveNum === result.decisiveCrossing!.moveNum)?.strategicFlags}
                  />
                </div>
              ) : (
                <p className="pm-muted">—</p>
              )}
            </section>

            {/* 勝率グラフ */}
            <section>
              <div className="pm-chart-section-header">
                <h2 className="pm-section-heading" style={{ margin: 0 }}>{t.winProbability}</h2>
                <span className="pm-chart-black-label">BLACK</span>
              </div>
              <div className="pm-chart-card">
                <WPChart
                  rows={result.rows}
                  wpInitial={result.wpInitial}
                  decisiveMoveNum={result.decisiveCrossing?.moveNum ?? null}
                />
              </div>
              {/* 候補手ボタン: チャートの下・カード外 */}
              {proActive && humanColor && !candidatesComputed && (
                <div className="pm-candidate-btn-row">
                  <button
                    type="button"
                    onClick={handleShowCandidates}
                    disabled={computingCandidates}
                    className="pm-candidate-btn"
                  >
                    {computingCandidates ? t.computingCandidates : t.showCandidateMoves}
                  </button>
                </div>
              )}
            </section>

            {/* 棋譜一覧 */}
            {result.rows.length > 0 && (
              <section>
                <h2 className="pm-section-heading">{t.historySection}</h2>
                <HistoryList
                  rows={result.rows}
                  wpInitial={result.wpInitial}
                  proActive={proActive}
                  humanColor={humanColor}
                />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── StrategicFlagBadges ─────────────────────────────────────────────────────

function StrategicFlagBadges({ flags }: { flags?: StrategyFlag[] }) {
  if (!flags || flags.length === 0) return null;
  return (
    <div className="pm-flag-row">
      {flags.map(flag => (
        <span key={flag} className="pm-flag-badge">{STRATEGY_FLAG_LABEL[flag]}</span>
      ))}
    </div>
  );
}

// ─── WPChart ──────────────────────────────────────────────────────────────────

interface WPChartProps {
  rows: PostmortemResult['rows'];
  wpInitial: number;
  decisiveMoveNum: number | null;
}

function WPChart({ rows, wpInitial, decisiveMoveNum }: WPChartProps) {
  const W = 520;
  const H = 160;

  // buildResolvedWPSeries を使用（変更禁止の既存ロジック）
  const wps = [wpInitial, ...rows.map(r => r.resolvedWP ?? r.wpAfter)];
  const n = wps.length;

  function xOf(i: number): number {
    return n <= 1 ? 0 : (i / (n - 1)) * W;
  }
  function yOf(wp: number): number {
    // clamp 0-1, top=0, bottom=H
    const clamped = Math.max(0, Math.min(1, wp));
    return H - clamped * (H - 4) - 2;
  }

  const polylinePoints = wps
    .map((wp, i) => `${xOf(i).toFixed(1)},${yOf(wp).toFixed(1)}`)
    .join(' ');

  // 決定的一手
  const decisiveIdx = decisiveMoveNum !== null
    ? rows.findIndex(r => r.moveNum === decisiveMoveNum)
    : -1;
  const decisiveX = decisiveIdx >= 0 ? xOf(decisiveIdx + 1) : null;
  const decisiveY = decisiveIdx >= 0
    ? yOf(rows[decisiveIdx]!.resolvedWP ?? rows[decisiveIdx]!.wpAfter)
    : null;

  // X軸ラベル: 先頭・中央・最終。重複・NaN排除
  const totalMoves = rows.length;
  const firstLabel = 1;
  const lastLabel = totalMoves > 0 ? totalMoves : 1;
  const midLabel = totalMoves >= 3 ? Math.round((firstLabel + lastLabel) / 2) : null;
  // 重複チェック
  const xLabels: number[] = [firstLabel];
  if (midLabel !== null && midLabel !== firstLabel && midLabel !== lastLabel) xLabels.push(midLabel);
  if (lastLabel !== firstLabel) xLabels.push(lastLabel);

  const y50 = yOf(0.5);

  return (
    <div>
      <div className="pm-chart-inner">
        <div className="pm-chart-yaxis">
          <span>100</span>
          <span>50</span>
          <span>0</span>
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="pm-chart-svg"
          preserveAspectRatio="none"
        >
          {/* Grid */}
          <line x1="0" y1={y50} x2={W} y2={y50} stroke="#e8e8e4" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="0" y1="1" x2={W} y2="1" stroke="#f0f0ed" strokeWidth="1" />
          <line x1="0" y1={H - 1} x2={W} y2={H - 1} stroke="#f0f0ed" strokeWidth="1" />
          {/* WP折れ線 */}
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="#141413"
            strokeWidth="2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {/* 決定的一手マーカー */}
          {decisiveX !== null && decisiveY !== null && (
            <g>
              <line
                x1={decisiveX} y1="0" x2={decisiveX} y2={H}
                stroke="#141413" strokeWidth="1" strokeDasharray="3 3" opacity="0.4"
              />
              <circle cx={decisiveX} cy={decisiveY} r="5" fill="#141413" />
            </g>
          )}
        </svg>
      </div>
      {/* X軸ラベル */}
      <div className="pm-chart-xaxis">
        {xLabels.map(num => (
          <span key={num}>#{num}</span>
        ))}
      </div>
    </div>
  );
}

// ─── ヘルパー ─────────────────────────────────────────────────────────────────

function pct(wp: number): string {
  return `${(wp * 100).toFixed(1)}%`;
}

// ─── HistoryList ──────────────────────────────────────────────────────────────

const INITIAL_ROWS = 9;

interface HistoryListProps {
  rows: PostmortemResult['rows'];
  wpInitial: number;
  proActive?: boolean;
  humanColor?: 'black' | 'white' | null;
}

function HistoryList({ rows, wpInitial, proActive = false, humanColor }: HistoryListProps) {
  const { t } = useLang();
  const resolvedSeries = buildResolvedWPSeries(rows, wpInitial);
  const [expandedMoveNum, setExpandedMoveNum] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const visibleRows = showAll ? rows : rows.slice(0, INITIAL_ROWS);
  const hiddenCount = rows.length - INITIAL_ROWS;

  return (
    <div className="pm-history-card">
      {/* ヘッダー行 */}
      <div className="pm-history-header-row">
        <span className="pm-history-header-cell">NO.</span>
        <span className="pm-history-header-cell">MOVE</span>
        <span className="pm-history-header-cell right">WP(BLACK)</span>
        <span className="pm-history-header-cell" />
      </div>

      {visibleRows.map((r, i) => {
        const curWP = resolvedSeries[i + 1] ?? 0;
        const isHumanMove = humanColor != null && r.player === humanColor;
        const hasCandidates = isHumanMove && !!r.candidateMoves && r.candidateMoves.length > 0;
        const isExpanded = expandedMoveNum === r.moveNum;
        const tappable = hasCandidates;
        // bar width: clamp 0–100%
        const barPct = Math.max(0, Math.min(100, curWP * 100)).toFixed(1) + '%';

        return (
          <div key={r.moveNum}>
            <div
              className={`pm-history-row${tappable ? ' tappable' : ''}${isExpanded ? ' expanded' : ''}`}
              onClick={() => tappable && setExpandedMoveNum(prev => prev === r.moveNum ? null : r.moveNum)}
            >
              <span className="pm-history-num">#{r.moveNum}</span>
              <span className="pm-history-move">{r.played}</span>
              <span className="pm-history-wp">
                {pct(curWP)}
                {tappable && (
                  <span className="pm-history-chevron">{isExpanded ? '▲' : '▼'}</span>
                )}
              </span>
              <div className="pm-history-bar-cell">
                <div className="pm-history-bar-bg">
                  <div className="pm-history-bar-fill" style={{ width: barPct }} />
                </div>
              </div>
            </div>
            {isExpanded && hasCandidates && (
              <CandidateMovePanel
                candidates={r.candidateMoves!}
                proActive={proActive}
              />
            )}
          </div>
        );
      })}

      {/* Show-all ボタン */}
      {!showAll && hiddenCount > 0 && (
        <div className="pm-show-all-row">
          <button
            type="button"
            className="pm-show-all-btn"
            onClick={() => setShowAll(true)}
          >
            {t.postmortemShowAllMoves(rows.length)}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── CandidateMovePanel ───────────────────────────────────────────────────────

interface CandidateMovePanelProps {
  candidates: CandidateMove[];
  proActive: boolean;
}

function CandidateMovePanel({ candidates, proActive }: CandidateMovePanelProps) {
  const { t } = useLang();
  if (!proActive) {
    return (
      <div className="pm-candidate-panel">
        <span className="pm-candidate-upgrade">{t.proUpgradePrompt}</span>
      </div>
    );
  }
  return (
    <div className="pm-candidate-panel">
      <div className="pm-candidate-panel-label">{t.candidateMovesLabel}</div>
      {candidates.map(c => (
        <div key={c.rank} className="pm-candidate-row">
          <span className="pm-candidate-rank">#{c.rank}</span>
          <span className="pm-candidate-move">{c.move}</span>
          <span className="pm-candidate-wp">{pct(c.wp)}</span>
        </div>
      ))}
    </div>
  );
}
