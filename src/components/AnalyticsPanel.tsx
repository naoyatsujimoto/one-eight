import { useState } from 'react';
import type { Aggregates } from '../game/analytics';
import { useLang } from '../lib/lang';

const AGGREGATES_KEY = 'one_eight_aggregates';
const RECORDS_KEY = 'one_eight_game_records';
const TOP_N = 5;

function loadAggregates(): Aggregates | null {
  try {
    const raw = localStorage.getItem(AGGREGATES_KEY);
    return raw ? (JSON.parse(raw) as Aggregates) : null;
  } catch {
    return null;
  }
}

function loadTotalGames(): number {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    return raw ? (JSON.parse(raw) as unknown[]).length : 0;
  } catch {
    return 0;
  }
}

function winRate(tries: number, wins: number): string {
  if (tries === 0) return '-';
  return `${((wins / tries) * 100).toFixed(0)}%`;
}

function sortedTop<T extends string>(
  record: Record<T, { tries: number; wins: number }>,
  n: number
): [T, { tries: number; wins: number }][] {
  return (Object.entries(record) as [T, { tries: number; wins: number }][])
    .sort((a, b) => b[1].tries - a[1].tries)
    .slice(0, n);
}

export function AnalyticsPanel() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  const agg = open ? loadAggregates() : null;
  const total = open ? loadTotalGames() : 0;

  return (
    <div className="analytics-panel">
      <button
        type="button"
        className="analytics-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '▾' : '▸'} {t.openingStats}
      </button>

      {open && (
        <div className="analytics-body">
          {agg === null ? (
            <p className="analytics-empty">{t.noDataCpu}</p>
          ) : (
            <>
              <p className="analytics-total">{t.totalCpuGames}: {total}</p>

              {/* byPosition */}
              <h4 className="analytics-section-title">{t.firstMove} — Position ({t.topN(TOP_N)})</h4>
              <table className="analytics-table">
                <thead>
                  <tr><th>Pos</th><th>{t.tries}</th><th>{t.winPercent}</th></tr>
                </thead>
                <tbody>
                  {sortedTop(agg.byPosition, TOP_N).map(([key, v]) => (
                    <tr key={key}>
                      <td>{key}</td>
                      <td>{v.tries}</td>
                      <td>{winRate(v.tries, v.wins)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* byBuildType */}
              <h4 className="analytics-section-title">{t.firstMove} — {t.buildType}</h4>
              <table className="analytics-table">
                <thead>
                  <tr><th>Build</th><th>{t.tries}</th><th>{t.winPercent}</th></tr>
                </thead>
                <tbody>
                  {sortedTop(agg.byBuildType, 10).map(([key, v]) => (
                    <tr key={key}>
                      <td>{key}</td>
                      <td>{v.tries}</td>
                      <td>{winRate(v.tries, v.wins)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* byPositionBuildType */}
              <h4 className="analytics-section-title">{t.positionBuild} ({t.topN(TOP_N)})</h4>
              <table className="analytics-table">
                <thead>
                  <tr><th>Pos:Build</th><th>{t.tries}</th><th>{t.winPercent}</th></tr>
                </thead>
                <tbody>
                  {sortedTop(agg.byPositionBuildType, TOP_N).map(([key, v]) => (
                    <tr key={key}>
                      <td>{key}</td>
                      <td>{v.tries}</td>
                      <td>{winRate(v.tries, v.wins)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}
