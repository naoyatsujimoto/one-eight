/**
 * CpuProfile.tsx — CPU 難易度別プロフィール
 *
 * - 全プレイヤーの対CPU戦累計成績を表示
 * - CPU 側の手を full_record から抽出してプレイ傾向を計算
 */
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useLang } from '../lib/lang';
import type { CpuDifficulty } from '../game/ai';
import type { MoveRecord, GateId } from '../game/types';

const DIFFICULTY_LABELS: Record<CpuDifficulty, string> = {
  normal: 'Normal',
  hard: 'Hard',
  very_hard: 'Very Hard',
};

interface CpuGameRow {
  winner: string | null;
  human_color: string | null;
  move_count: number;
  full_record: MoveRecord[] | null;
}

interface CpuStats {
  total: number;
  cpuWins: number;
  cpuLosses: number;
  draws: number;
}

interface CpuAggregates {
  byBuildType: Record<string, number>;
  byPosition: Record<string, { tries: number; wins: number }>;
}

function computeStats(rows: CpuGameRow[]): CpuStats {
  let cpuWins = 0, cpuLosses = 0, draws = 0;
  for (const r of rows) {
    const cpuColor = r.human_color === 'black' ? 'white' : 'black';
    if (r.winner === 'draw') draws++;
    else if (r.winner === cpuColor) cpuWins++;
    else if (r.winner !== null) cpuLosses++;
  }
  return { total: rows.length, cpuWins, cpuLosses, draws };
}

function computeAggregates(rows: CpuGameRow[]): CpuAggregates {
  const byBuildType: Record<string, number> = {};
  const byPosition: Record<string, { tries: number; wins: number }> = {};

  for (const r of rows) {
    if (!r.full_record) continue;
    const cpuColor = r.human_color === 'black' ? 'white' : 'black';
    const cpuWon = r.winner === cpuColor;

    for (const move of r.full_record) {
      if (move.player !== cpuColor) continue;

      // Build type
      const bt = move.build.type;
      byBuildType[bt] = (byBuildType[bt] ?? 0) + 1;

      // Position
      const pos = move.positioning;
      if (pos !== 'P') {
        if (!byPosition[pos]) byPosition[pos] = { tries: 0, wins: 0 };
        byPosition[pos]!.tries++;
        if (cpuWon) byPosition[pos]!.wins++;
      }
    }
  }

  return { byBuildType, byPosition };
}

interface Props {
  difficulty: CpuDifficulty;
  onClose: () => void;
}

export function CpuProfile({ difficulty, onClose }: Props) {
  const { t } = useLang();
  const [rows, setRows] = useState<CpuGameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const label = DIFFICULTY_LABELS[difficulty];

  useEffect(() => {
    supabase
      .rpc('get_cpu_stats', { p_difficulty: difficulty })
      .then(({ data, error }) => {
        if (!error && data) setRows(data as CpuGameRow[]);
        setLoading(false);
      });
  }, [difficulty]);

  const stats = computeStats(rows);
  const agg = computeAggregates(rows);
  const pct = (n: number, d: number) => d > 0 ? `${Math.round((n / d) * 100)}%` : '—';

  // Build type 表示用ラベル
  const BUILD_LABELS: Record<string, string> = {
    massive: 'Massive', selective: 'Selective', quad: 'Quad', skip: 'Skip', 'no-build': 'No Build',
  };
  const buildEntries = Object.entries(agg.byBuildType)
    .filter(([k]) => k !== 'no-build' && k !== 'skip')
    .sort((a, b) => b[1] - a[1]);
  const buildTotal = buildEntries.reduce((s, [, v]) => s + v, 0);

  const topPositions = Object.entries(agg.byPosition)
    .sort((a, b) => b[1].tries - a[1].tries)
    .slice(0, 5);

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.card} onClick={(e) => e.stopPropagation()}>
        {/* ヘッダー */}
        <div style={s.header}>
          <div>
            <div style={s.eyebrow}>CPU</div>
            <div style={s.title}>{label}</div>
          </div>
          <button type="button" style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {loading && <p style={s.muted}>Loading…</p>}

        {!loading && rows.length === 0 && (
          <p style={s.muted}>{t.cpuNoGames}</p>
        )}

        {!loading && rows.length > 0 && (
          <>
            {/* 成績サマリー */}
            <div style={s.summary}>
              <StatItem label={t.cpuTotalGames} value={stats.total} />
              <StatItem label={t.cpuWins} value={stats.cpuWins} />
              <StatItem label={t.cpuLosses} value={stats.cpuLosses} />
              <StatItem label={t.cpuDraws} value={stats.draws} />
              <StatItem label={t.cpuWinRate} value={pct(stats.cpuWins, stats.total)} />
            </div>

            {/* Build 使用率 */}
            {buildEntries.length > 0 && (
              <div style={s.section}>
                <div style={s.sectionLabel}>{t.userBuildUsage}</div>
                {buildEntries.map(([bt, count]) => (
                  <div key={bt} style={s.barRow}>
                    <div style={s.barLabel}>{BUILD_LABELS[bt] ?? bt}</div>
                    <div style={s.barTrack}>
                      <div style={{
                        ...s.barFill,
                        width: buildTotal > 0 ? `${(count / buildTotal) * 100}%` : '0%',
                      }} />
                    </div>
                    <div style={s.barValue}>
                      {buildTotal > 0 ? `${Math.round((count / buildTotal) * 100)}%` : '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* よく選ぶポジション */}
            {topPositions.length > 0 && (
              <div style={s.section}>
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
          </>
        )}
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: '0.7rem', color: '#777', marginTop: 2 }}>{label}</div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 210,
  },
  card: {
    background: '#fff', borderRadius: 10, padding: '1.25rem',
    width: '90%', maxWidth: 400, maxHeight: '80vh', overflowY: 'auto',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: '1rem',
  },
  eyebrow: { fontSize: '0.65rem', fontWeight: 700, color: '#aaa', letterSpacing: '0.1em', textTransform: 'uppercase' },
  title: { fontSize: '1.15rem', fontWeight: 700, letterSpacing: '0.04em', marginTop: 2 },
  closeBtn: { background: 'none', border: 'none', fontSize: '1rem', cursor: 'pointer', color: '#555' },
  summary: {
    display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center',
    marginBottom: '1.25rem', padding: '0.75rem', background: '#f8f8f8', borderRadius: 8,
  },
  section: { marginBottom: '1rem' },
  sectionLabel: {
    fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em',
    color: '#888', textTransform: 'uppercase', marginBottom: 8,
  },
  barRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  barLabel: { fontSize: '0.78rem', width: 72, flexShrink: 0 },
  barTrack: { flex: 1, height: 8, background: '#eee', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', background: '#333', borderRadius: 4, transition: 'width 0.3s' },
  barValue: { fontSize: '0.72rem', color: '#666', width: 36, textAlign: 'right' },
  posRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  posChip: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    background: '#f4f4f4', borderRadius: 6, padding: '4px 10px', minWidth: 44,
  },
  posLabel: { fontSize: '0.85rem', fontWeight: 700 },
  posCount: { fontSize: '0.65rem', color: '#888' },
  muted: { color: '#999', textAlign: 'center', fontSize: '0.85rem', padding: '1rem 0' },
};
