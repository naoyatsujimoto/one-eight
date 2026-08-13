/**
 * AdminKpiDashboard.tsx — Admin KPI Dashboard
 *
 * Phase 4-C: 既存10 RPCの集計結果をAdmin向けに表示する。
 * 外部グラフライブラリ不使用。CSSバーによる簡易グラフ。
 * DB・RPC・migration変更なし。
 */

import { useState, useCallback, useEffect } from 'react';
import './AdminKpiDashboard.css';
import {
  fetchKpiDashboard,
  fmtNum,
  fmtPct,
  fmtDec,
  safeNum,
  type KpiDashboardData,
  type KpiDashboardSectionError,
  type KpiMatchDailyRow,
  type KpiArenaFunnelRow,
  type KpiTrainingTaskSummaryRow,
  type KpiTrainingStepFunnelRow,
  type KpiTrainingDailyRow,
  type KpiOejSummaryRow,
  type KpiOejArticleSummaryRow,
  type KpiOejSourceSummaryRow,
  type KpiOejDailyRow,
  type KpiOejAttributionRow,
} from '../lib/kpiAdmin';

// ---------------------------------------------------------------------------
// 型・ユーティリティ
// ---------------------------------------------------------------------------

type PeriodPreset = 7 | 30 | 90;
type StepSortOrder = 'step' | 'abandonment';

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function makeDateRange(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 3600 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** 0と未取得を区別して表示 */
function displayValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toLocaleString();
}

/** セクションエラー表示 */
function SectionError({ msg }: { msg: string }) {
  return <div className="kpi-status kpi-status--error">⚠ {msg}</div>;
}

/** ローディング表示 */
function Loading() {
  return <div className="kpi-status">読み込み中…</div>;
}

/** カードコンポーネント */
function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const isNull = value === '—';
  return (
    <div className="kpi-card">
      <div className="kpi-card__label">{label}</div>
      <div className={`kpi-card__value${isNull ? ' kpi-card__value--null' : ''}`}>{value}</div>
      {sub && <div className="kpi-card__sub">{sub}</div>}
    </div>
  );
}

/** CSSバーグラフ */
function BarChart({
  rows,
  maxVal,
}: {
  rows: { label: string; value: number | null }[];
  maxVal: number;
}) {
  const max = maxVal > 0 ? maxVal : 1;
  return (
    <div className="kpi-bar-chart">
      {rows.map((r, i) => (
        <div key={i} className="kpi-bar-row">
          <span className="kpi-bar-label">{r.label}</span>
          <div className="kpi-bar-track">
            <div
              className="kpi-bar-fill"
              style={{ width: `${Math.min(100, ((r.value ?? 0) / max) * 100)}%` }}
            />
          </div>
          <span className="kpi-bar-value">{r.value !== null ? r.value.toLocaleString() : '—'}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// セクション A: Acquisition / Users
// ---------------------------------------------------------------------------

function SectionAcquisition({
  data,
  error,
  loading,
}: {
  data: KpiDashboardData['acquisitionAuth'];
  error?: string;
  loading: boolean;
}) {
  return (
    <section className="kpi-section">
      <div className="kpi-section__header">
        <h2 className="kpi-section__title">A. Acquisition / Users</h2>
      </div>
      <div className="kpi-section__body">
        {loading && <Loading />}
        {!loading && error && <SectionError msg={error} />}
        {!loading && !error && !data && <div className="kpi-status kpi-status--empty">No data</div>}
        {!loading && !error && data && (
          <>
            <div className="kpi-card-grid">
              <KpiCard label="Login Page Views" value={displayValue(data.login_page_views)} />
              <KpiCard label="Unique Visitors" value={displayValue(data.unique_visitors)} />
              <KpiCard label="Sessions" value={displayValue(data.sessions)} />
              <KpiCard label="Registrations" value={displayValue(data.registrations)} />
              <KpiCard label="Free Users (current)" value={displayValue(data.current_free_users)} />
              <KpiCard label="Active Pro (current)" value={displayValue(data.current_active_pro_users)} />
              <KpiCard label="Auth Success Rate" value={data.auth_success_rate !== null && data.auth_success_rate !== undefined ? fmtPct(data.auth_success_rate) : '—'} />
            </div>

            <div className="kpi-subsection-title">Auth Details</div>
            <div className="kpi-card-grid kpi-card-grid--wide">
              <KpiCard label="Auth Started" value={displayValue(data.auth_started)} />
              <KpiCard label="Auth Succeeded" value={displayValue(data.auth_succeeded)} />
              <KpiCard label="Auth Failed" value={displayValue(data.auth_failed)} />
              <KpiCard label="Pro Started" value={displayValue(data.pro_started)} />
              <KpiCard label="Pro Canceled" value={displayValue(data.pro_canceled)} />
              <KpiCard label="Renewal Succeeded" value={displayValue(data.renewal_succeeded)} />
              <KpiCard label="Renewal Failed" value={displayValue(data.renewal_failed)} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// セクション B: Matches
// ---------------------------------------------------------------------------

function SectionMatches({
  summary,
  daily,
  summaryError,
  dailyError,
  loading,
}: {
  summary: KpiDashboardData['matchSummary'];
  daily: KpiMatchDailyRow[];
  summaryError?: string;
  dailyError?: string;
  loading: boolean;
}) {
  const maxMatches = daily.reduce((m, r) => Math.max(m, safeNum(r.total_matches) ?? 0), 0);

  return (
    <section className="kpi-section">
      <div className="kpi-section__header">
        <h2 className="kpi-section__title">B. Matches</h2>
      </div>
      <div className="kpi-section__body">
        {loading && <Loading />}
        {!loading && summaryError && <SectionError msg={summaryError} />}
        {!loading && !summaryError && !summary && <div className="kpi-status kpi-status--empty">No data</div>}
        {!loading && !summaryError && summary && (
          <>
            <div className="kpi-card-grid">
              <KpiCard label="Total Matches" value={displayValue(summary.total_matches)} />
              <KpiCard label="Unique Players" value={displayValue(summary.unique_players)} />
              <KpiCard label="Completed" value={displayValue(summary.completed_matches)} />
              <KpiCard label="Completion Rate" value={summary.completion_rate !== null && summary.completion_rate !== undefined ? fmtPct(summary.completion_rate) : '—'} />
            </div>

            <div className="kpi-subsection-title">Mode Breakdown</div>
            <div className="kpi-card-grid kpi-card-grid--wide">
              <KpiCard label="CPU" value={displayValue(summary.cpu_matches)} />
              <KpiCard label="Offline PvP" value={displayValue(summary.offline_pvp_matches)} />
              <KpiCard label="Online Casual" value={displayValue(summary.online_casual_matches)} />
              <KpiCard label="Official" value={displayValue(summary.official_standalone_matches)} />
              <KpiCard label="Arena" value={displayValue(summary.arena_matches_count)} />
            </div>

            <div className="kpi-subsection-title">End Reasons</div>
            <div className="kpi-card-grid kpi-card-grid--wide">
              <KpiCard label="Normal" value={displayValue(summary.normal_end_count)} />
              <KpiCard label="Timeout" value={displayValue(summary.timeout_count)} />
              <KpiCard label="Resign" value={displayValue(summary.resign_count)} />
              <KpiCard label="Draw" value={displayValue(summary.draw_count)} />
              <KpiCard label="Forfeit" value={displayValue(summary.forfeit_count)} />
              <KpiCard label="No Contest" value={displayValue(summary.no_contest_count)} />
            </div>
          </>
        )}

        {/* Daily */}
        <div className="kpi-subsection-title">Daily Matches</div>
        {loading && <Loading />}
        {!loading && dailyError && <SectionError msg={dailyError} />}
        {!loading && !dailyError && daily.length === 0 && (
          <div className="kpi-status kpi-status--empty">No data</div>
        )}
        {!loading && !dailyError && daily.length > 0 && (
          <BarChart
            rows={daily.map((r) => ({
              label: String(r.day ?? '').slice(5, 10), // MM-DD
              value: safeNum(r.total_matches),
            }))}
            maxVal={maxMatches}
          />
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// セクション C: Arena Funnel
// ---------------------------------------------------------------------------

function SectionArenaFunnel({
  data,
  error,
  loading,
}: {
  data: KpiArenaFunnelRow[];
  error?: string;
  loading: boolean;
}) {
  return (
    <section className="kpi-section">
      <div className="kpi-section__header">
        <h2 className="kpi-section__title">C. Arena Funnel</h2>
      </div>
      <div className="kpi-section__body">
        {loading && <Loading />}
        {!loading && error && <SectionError msg={error} />}
        {!loading && !error && data.length === 0 && (
          <div className="kpi-status kpi-status--empty">No data</div>
        )}
        {!loading && !error && data.length > 0 && (
          <div className="kpi-table-wrap">
            <table className="kpi-table">
              <thead>
                <tr>
                  <th>Arena</th>
                  <th>Scheduled At</th>
                  <th>Entries</th>
                  <th>Unique Entrants</th>
                  <th>Matched Users</th>
                  <th>Assigned Matches</th>
                  <th>Started</th>
                  <th>Completed</th>
                  <th>No-show</th>
                  <th>No Contest</th>
                  <th>Entry to Match Rate</th>
                  <th>Match Completion Rate</th>
                  <th>No-show Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r, i) => (
                  <tr key={i}>
                    <td>
                      {String(r.arena_code ?? '—')}
                      {r.arena_event_id !== null && r.arena_event_id !== undefined && (
                        <span style={{ fontSize: '0.75em', color: '#888', marginLeft: '0.4em' }}>({String(r.arena_event_id)})</span>
                      )}
                    </td>
                    <td>{String(r.scheduled_at ?? '—')}</td>
                    <td>{displayValue(r.entries)}</td>
                    <td>{displayValue(r.unique_entrants)}</td>
                    <td>{displayValue(r.matched_users)}</td>
                    <td>{displayValue(r.assigned_matches)}</td>
                    <td>{displayValue(r.started_matches)}</td>
                    <td>{displayValue(r.completed_matches)}</td>
                    <td>{displayValue(r.no_show_matches)}</td>
                    <td>{displayValue(r.no_contest_matches)}</td>
                    <td>{r.entry_to_match_rate !== null && r.entry_to_match_rate !== undefined ? fmtPct(r.entry_to_match_rate) : '—'}</td>
                    <td>{r.match_completion_rate !== null && r.match_completion_rate !== undefined ? fmtPct(r.match_completion_rate) : '—'}</td>
                    <td>{r.no_show_rate !== null && r.no_show_rate !== undefined ? fmtPct(r.no_show_rate) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// セクション D: Training
// ---------------------------------------------------------------------------

function SectionTraining({
  summary,
  taskSummary,
  stepFunnel,
  daily,
  summaryError,
  taskSummaryError,
  stepFunnelError,
  dailyError,
  loading,
}: {
  summary: KpiDashboardData['trainingSummary'];
  taskSummary: KpiTrainingTaskSummaryRow[];
  stepFunnel: KpiTrainingStepFunnelRow[];
  daily: KpiTrainingDailyRow[];
  summaryError?: string;
  taskSummaryError?: string;
  stepFunnelError?: string;
  dailyError?: string;
  loading: boolean;
}) {
  const [stepSort, setStepSort] = useState<StepSortOrder>('step');

  // full-game-v1のStep Funnelを抽出
  const fullGameSteps = stepFunnel.filter(
    (r) => String(r.task_id ?? '') === 'full-game-v1',
  );

  // ソート
  const sortedSteps = [...fullGameSteps].sort((a, b) => {
    if (stepSort === 'step') {
      return (safeNum(a.step) ?? 0) - (safeNum(b.step) ?? 0);
    }
    // 脱落割合順（降順）
    return (safeNum(b.share_of_task_abandonments) ?? 0) - (safeNum(a.share_of_task_abandonments) ?? 0);
  });

  return (
    <section className="kpi-section">
      <div className="kpi-section__header">
        <h2 className="kpi-section__title">D. Training</h2>
      </div>
      <div className="kpi-section__body">
        {loading && <Loading />}
        {!loading && summaryError && <SectionError msg={summaryError} />}
        {!loading && !summaryError && !summary && (
          <div className="kpi-status kpi-status--empty">No data</div>
        )}
        {!loading && !summaryError && summary && (
          <>
            <div className="kpi-card-grid">
              <KpiCard label="Started Runs" value={displayValue(summary.started_runs)} />
              <KpiCard label="Unique Starters" value={displayValue(summary.unique_starters)} />
              <KpiCard label="Completed" value={displayValue(summary.cohort_completed_runs)} />
              <KpiCard label="Completion Rate" value={summary.cohort_completion_rate !== null && summary.cohort_completion_rate !== undefined ? fmtPct(summary.cohort_completion_rate) : '—'} />
              <KpiCard label="Abandoned" value={displayValue(summary.abandoned_runs)} />
              <KpiCard label="Abandonment Rate" value={summary.abandonment_rate !== null && summary.abandonment_rate !== undefined ? fmtPct(summary.abandonment_rate) : '—'} />
              <KpiCard label="Attempt Events" value={displayValue(summary.attempt_events)} />
              <KpiCard label="Incorrect Attempts" value={displayValue(summary.incorrect_attempts)} />
              <KpiCard label="Hinted Runs" value={displayValue(summary.hinted_runs)} />
            </div>

            <div className="kpi-subsection-title">一局指南 vs 個別</div>
            <div className="kpi-card-grid kpi-card-grid--wide">
              <KpiCard label="Full Game Started" value={displayValue(summary.full_game_started_runs)} />
              <KpiCard label="Full Game Completed" value={displayValue(summary.full_game_completed_runs)} />
              <KpiCard label="Individual Started" value={displayValue(summary.individual_started_runs)} />
              <KpiCard label="Individual Completed" value={displayValue(summary.individual_completed_runs)} />
            </div>
          </>
        )}

        {/* Task Summary */}
        <div className="kpi-subsection-title">Task Breakdown</div>
        {loading && <Loading />}
        {!loading && taskSummaryError && <SectionError msg={taskSummaryError} />}
        {!loading && !taskSummaryError && taskSummary.length === 0 && (
          <div className="kpi-status kpi-status--empty">No data</div>
        )}
        {!loading && !taskSummaryError && taskSummary.length > 0 && (
          <div className="kpi-table-wrap">
            <table className="kpi-table">
              <thead>
                <tr>
                  <th>Task ID</th>
                  <th>Kind</th>
                  <th>Started</th>
                  <th>Cohort Completed</th>
                  <th>Rate</th>
                  <th>Abandoned</th>
                  <th>Abandon Rate</th>
                  <th>Attempts</th>
                  <th>Incorrect</th>
                  <th>Hinted Runs</th>
                </tr>
              </thead>
              <tbody>
                {taskSummary.map((r, i) => (
                  <tr key={i}>
                    <td>{String(r.task_id ?? '—')}</td>
                    <td>{String(r.training_kind ?? '—')}</td>
                    <td>{displayValue(r.started_runs)}</td>
                    <td>{displayValue(r.cohort_completed_runs)}</td>
                    <td>{r.completion_rate !== null && r.completion_rate !== undefined ? fmtPct(r.completion_rate) : '—'}</td>
                    <td>{displayValue(r.abandoned_runs)}</td>
                    <td>{r.abandonment_rate !== null && r.abandonment_rate !== undefined ? fmtPct(r.abandonment_rate) : '—'}</td>
                    <td>{displayValue(r.attempt_events)}</td>
                    <td>{displayValue(r.incorrect_attempts)}</td>
                    <td>{displayValue(r.hinted_runs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Step Funnel (full-game-v1) */}
        <div className="kpi-subsection-title">一局指南 脱落ステップ (full-game-v1)</div>
        {loading && <Loading />}
        {!loading && stepFunnelError && <SectionError msg={stepFunnelError} />}
        {!loading && !stepFunnelError && fullGameSteps.length === 0 && (
          <div className="kpi-status kpi-status--empty">No data for full-game-v1</div>
        )}
        {!loading && !stepFunnelError && fullGameSteps.length > 0 && (
          <>
            <div className="kpi-sort-btns">
              <button
                type="button"
                className={`kpi-sort-btn${stepSort === 'step' ? ' kpi-sort-btn--active' : ''}`}
                onClick={() => setStepSort('step')}
              >
                Step順
              </button>
              <button
                type="button"
                className={`kpi-sort-btn${stepSort === 'abandonment' ? ' kpi-sort-btn--active' : ''}`}
                onClick={() => setStepSort('abandonment')}
              >
                脱落割合順
              </button>
            </div>
            <div className="kpi-table-wrap">
              <table className="kpi-table">
                <thead>
                  <tr>
                    <th>Step</th>
                    <th>Move ID</th>
                    <th>Move Index</th>
                    <th>Total Steps</th>
                    <th>Reached</th>
                    <th>Continued / Completed</th>
                    <th>Abandoned</th>
                    <th>Progression</th>
                    <th>Share of Abandonments</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSteps.map((r, i) => (
                    <tr key={i}>
                      <td>{displayValue(r.step)}</td>
                      <td>{r.move_id !== null && r.move_id !== undefined ? String(r.move_id) : '—'}</td>
                      <td>{displayValue(r.move_index)}</td>
                      <td>{displayValue(r.total_steps)}</td>
                      <td>{displayValue(r.reached_runs)}</td>
                      <td>{displayValue(r.continued_or_completed_runs)}</td>
                      <td>{displayValue(r.abandoned_runs_at_step)}</td>
                      <td>{r.progression_rate !== null && r.progression_rate !== undefined ? fmtPct(r.progression_rate) : '—'}</td>
                      <td>{r.share_of_task_abandonments !== null && r.share_of_task_abandonments !== undefined ? fmtPct(r.share_of_task_abandonments) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Training Daily */}
        <div className="kpi-subsection-title">Daily Training</div>
        {loading && <Loading />}
        {!loading && dailyError && <SectionError msg={dailyError} />}
        {!loading && !dailyError && daily.length === 0 && (
          <div className="kpi-status kpi-status--empty">No data</div>
        )}
        {!loading && !dailyError && daily.length > 0 && (
          <div className="kpi-table-wrap">
            <table className="kpi-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Started</th>
                  <th>Completed</th>
                  <th>Abandoned</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((r, i) => (
                  <tr key={i}>
                    <td>{String(r.day ?? '').slice(5, 10)}</td>
                    <td>{displayValue(r.started_runs)}</td>
                    <td>{displayValue(r.completion_events)}</td>
                    <td>{displayValue(r.abandoned_runs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// セクション E: Postmortem
// ---------------------------------------------------------------------------

function SectionPostmortem({
  data,
  error,
  loading,
}: {
  data: KpiDashboardData['postmortem'];
  error?: string;
  loading: boolean;
}) {
  return (
    <section className="kpi-section">
      <div className="kpi-section__header">
        <h2 className="kpi-section__title">E. Postmortem</h2>
      </div>
      <div className="kpi-section__body">
        {loading && <Loading />}
        {!loading && error && <SectionError msg={error} />}
        {!loading && !error && !data && <div className="kpi-status kpi-status--empty">No data</div>}
        {!loading && !error && data && (
          <>
            <div className="kpi-card-grid">
              <KpiCard label="Started" value={displayValue(data.started)} />
              <KpiCard label="Completed" value={displayValue(data.completed)} />
              <KpiCard label="Failed" value={displayValue(data.failed)} />
              <KpiCard label="Completion Rate" value={data.completion_rate !== null && data.completion_rate !== undefined ? fmtPct(data.completion_rate) : '—'} />
              <KpiCard label="Failure Rate" value={data.failure_rate !== null && data.failure_rate !== undefined ? fmtPct(data.failure_rate) : '—'} />
            </div>

            <div className="kpi-subsection-title">Elapsed (seconds)</div>
            <div className="kpi-card-grid kpi-card-grid--wide">
              <KpiCard label="Average" value={data.average_elapsed_seconds !== null && data.average_elapsed_seconds !== undefined ? fmtDec(data.average_elapsed_seconds, 1) : '—'} />
              <KpiCard label="Median" value={data.median_elapsed_seconds !== null && data.median_elapsed_seconds !== undefined ? fmtDec(data.median_elapsed_seconds, 1) : '—'} />
              <KpiCard label="P95" value={data.p95_elapsed_seconds !== null && data.p95_elapsed_seconds !== undefined ? fmtDec(data.p95_elapsed_seconds, 1) : '—'} />
              <KpiCard label="Refreshed" value={displayValue(data.refreshed)} />
              <KpiCard label="Candidates Opened" value={displayValue(data.candidates_opened)} />
            </div>

            {/* Mode counts */}
            <div className="kpi-subsection-title">Mode Counts</div>
            <div className="kpi-card-grid kpi-card-grid--wide">
              <KpiCard label="Online" value={displayValue(data.online_mode_count)} />
              <KpiCard label="Official" value={displayValue(data.official_mode_count)} />
              <KpiCard label="Arena" value={displayValue(data.arena_mode_count)} />
              <KpiCard label="CPU" value={displayValue(data.cpu_mode_count)} />
              <KpiCard label="Unknown" value={displayValue(data.unknown_mode_count)} />
            </div>

            {/* Error counts */}
            <div className="kpi-subsection-title">Error Counts</div>
            <div className="kpi-card-grid kpi-card-grid--wide">
              <KpiCard label="RPC Errors" value={displayValue(data.rpc_error_count)} />
              <KpiCard label="Worker Errors" value={displayValue(data.worker_error_count)} />
              <KpiCard label="Parse Errors" value={displayValue(data.parse_error_count)} />
              <KpiCard label="Unknown Errors" value={displayValue(data.unknown_error_count)} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// セクション F: System Health
// ---------------------------------------------------------------------------

function SectionSystemHealth({
  data,
  error,
  loading,
}: {
  data: KpiDashboardData['systemHealth'];
  error?: string;
  loading: boolean;
}) {
  return (
    <section className="kpi-section">
      <div className="kpi-section__header">
        <h2 className="kpi-section__title">F. System Health</h2>
      </div>
      <div className="kpi-section__body">
        {loading && <Loading />}
        {!loading && error && <SectionError msg={error} />}
        {!loading && !error && !data && <div className="kpi-status kpi-status--empty">No data</div>}
        {!loading && !error && data && (
          <>
            <div className="kpi-card-grid">
              <KpiCard label="Sessions" value={displayValue(data.sessions)} />
              <KpiCard label="Frontend Errors" value={displayValue(data.frontend_errors)} />
              <KpiCard label="Errors / 100 Sessions" value={data.frontend_errors_per_100_sessions !== null && data.frontend_errors_per_100_sessions !== undefined ? fmtDec(data.frontend_errors_per_100_sessions, 2) : '—'} />
              <KpiCard label="RPC Calls" value={displayValue(data.rpc_calls)} />
              <KpiCard label="RPC Errors" value={displayValue(data.rpc_errors)} />
              <KpiCard label="RPC Error Rate" value={data.rpc_error_rate !== null && data.rpc_error_rate !== undefined ? fmtPct(data.rpc_error_rate) : '—'} />
              <KpiCard label="RT Reconnections" value={displayValue(data.realtime_reconnections)} />
            </div>

            {/* rpc_stats */}
            {data.rpc_stats !== null && data.rpc_stats !== undefined && (
              <>
                <div className="kpi-subsection-title">RPC Stats</div>
                <JsonKvTable data={data.rpc_stats} />
              </>
            )}
            {(data.rpc_stats === null || data.rpc_stats === undefined) && (
              <div className="kpi-status kpi-status--empty">RPC Stats: No data</div>
            )}

            {/* performance_stats */}
            {data.performance_stats !== null && data.performance_stats !== undefined && (
              <>
                <div className="kpi-subsection-title">Performance Stats</div>
                <JsonKvTable data={data.performance_stats} />
              </>
            )}
            {(data.performance_stats === null || data.performance_stats === undefined) && (
              <div className="kpi-status kpi-status--empty">Performance Stats: No data</div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// セクション G: ONE EIGHT JOURNAL
// ---------------------------------------------------------------------------

const OEJ_SOURCE_ORDER = [
  'x', 'instagram', 'google', 'bing', 'direct', 'one_eight_internal', 'other_external',
];

function oejSourceSort(rows: KpiOejSourceSummaryRow[]): KpiOejSourceSummaryRow[] {
  return [...rows].sort((a, b) => {
    const ai = OEJ_SOURCE_ORDER.indexOf(String(a.traffic_source ?? ''));
    const bi = OEJ_SOURCE_ORDER.indexOf(String(b.traffic_source ?? ''));
    const an = ai === -1 ? 999 : ai;
    const bn = bi === -1 ? 999 : bi;
    return an - bn;
  });
}

function SectionOejOverview({
  data,
  error,
  loading,
}: {
  data: KpiOejSummaryRow | null;
  error?: string;
  loading: boolean;
}) {
  return (
    <>
      <div className="kpi-subsection-title">A. Overview</div>
      {loading && <Loading />}
      {!loading && error && <SectionError msg={error} />}
      {!loading && !error && !data && (
        <div className="kpi-status kpi-status--empty">No data</div>
      )}
      {!loading && !error && data && (
        <>
          {data.is_reference_period && (
            <div className="kpi-reference-notice">REFERENCE PERIOD</div>
          )}
          <div className="kpi-card-grid">
            <KpiCard label="Unique Readers" value={fmtNum(data.unique_readers)} />
            <KpiCard label="Article Opens" value={fmtNum(data.article_opens)} />
            <KpiCard label="Completion Rate" value={fmtPct(data.completion_rate)} />
            <KpiCard label="Avg Active Seconds" value={data.average_active_seconds !== null && data.average_active_seconds !== undefined ? fmtDec(data.average_active_seconds, 1) : '—'} />
            <KpiCard label="Game CTA Clicks" value={fmtNum(data.game_cta_clicks)} />
            <KpiCard label="Game CTA Rate" value={fmtPct(data.game_cta_rate)} />
            <KpiCard label="Reference Clicks" value={fmtNum(data.reference_clicks)} />
            <KpiCard label="Load Failures" value={fmtNum(data.load_failures)} />
          </div>
          <div className="kpi-card-grid kpi-card-grid--wide">
            <KpiCard label="List Views" value={fmtNum(data.list_views)} />
            <KpiCard label="Impressions" value={fmtNum(data.impressions)} />
            <KpiCard label="Fallback Opens" value={fmtNum(data.fallback_opens)} />
            <KpiCard label="Fallback Rate" value={fmtPct(data.fallback_rate)} />
            <KpiCard label="Sessions" value={fmtNum(data.sessions)} />
          </div>
        </>
      )}
    </>
  );
}

function SectionOejSource({
  data,
  error,
  loading,
}: {
  data: KpiOejSourceSummaryRow[];
  error?: string;
  loading: boolean;
}) {
  const sorted = oejSourceSort(data);
  return (
    <>
      <div className="kpi-subsection-title">B. Traffic Source</div>
      {loading && <Loading />}
      {!loading && error && <SectionError msg={error} />}
      {!loading && !error && data.length === 0 && (
        <div className="kpi-status kpi-status--empty">No data</div>
      )}
      {!loading && !error && data.length > 0 && (
        <div className="kpi-table-wrap">
          <table className="kpi-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>List Views</th>
                <th>Article Opens</th>
                <th>Unique Readers</th>
                <th>Completion Rate</th>
                <th>Avg Active Seconds</th>
                <th>Game CTA Clicks</th>
                <th>Game CTA Rate</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={i}>
                  <td>{String(r.traffic_source ?? '—')}</td>
                  <td>{fmtNum(r.list_views)}</td>
                  <td>{fmtNum(r.article_opens)}</td>
                  <td>{fmtNum(r.unique_readers)}</td>
                  <td>{fmtPct(r.completion_rate)}</td>
                  <td>{r.average_active_seconds !== null && r.average_active_seconds !== undefined ? fmtDec(r.average_active_seconds, 1) : '—'}</td>
                  <td>{fmtNum(r.game_cta_clicks)}</td>
                  <td>{fmtPct(r.game_cta_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function SectionOejArticle({
  data,
  error,
  loading,
}: {
  data: KpiOejArticleSummaryRow[];
  error?: string;
  loading: boolean;
}) {
  return (
    <>
      <div className="kpi-subsection-title">C. Article Performance</div>
      {loading && <Loading />}
      {!loading && error && <SectionError msg={error} />}
      {!loading && !error && data.length === 0 && (
        <div className="kpi-status kpi-status--empty">No data</div>
      )}
      {!loading && !error && data.length > 0 && (
        <div className="kpi-table-wrap">
          <table className="kpi-table">
            <thead>
              <tr>
                <th>Article Slug</th>
                <th>Impressions</th>
                <th>Article Opens</th>
                <th>Unique Readers</th>
                <th>List to Open Rate</th>
                <th>Completion Rate</th>
                <th>Avg Active Seconds</th>
                <th>Avg Max Scroll</th>
                <th>Reference Clicks</th>
                <th>Game CTA Clicks</th>
                <th>Game CTA Rate</th>
                <th>Fallback Opens</th>
                <th>Load Failures</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i}>
                  <td>{String(r.article_slug ?? '—')}</td>
                  <td>{fmtNum(r.impressions)}</td>
                  <td>{fmtNum(r.article_opens)}</td>
                  <td>{fmtNum(r.unique_readers)}</td>
                  <td>{fmtPct(r.list_to_open_rate)}</td>
                  <td>{fmtPct(r.completion_rate)}</td>
                  <td>{r.average_active_seconds !== null && r.average_active_seconds !== undefined ? fmtDec(r.average_active_seconds, 1) : '—'}</td>
                  <td>{r.average_max_scroll_percent !== null && r.average_max_scroll_percent !== undefined ? fmtDec(r.average_max_scroll_percent, 1) : '—'}</td>
                  <td>{fmtNum(r.reference_clicks)}</td>
                  <td>{fmtNum(r.game_cta_clicks)}</td>
                  <td>{fmtPct(r.game_cta_rate)}</td>
                  <td>{fmtNum(r.fallback_opens)}</td>
                  <td>{fmtNum(r.load_failures)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function SectionOejAttribution({
  data,
  error,
  loading,
}: {
  data: KpiOejAttributionRow[];
  error?: string;
  loading: boolean;
}) {
  const overall = data.find((r) => String(r.dimension_type ?? '') === 'overall') ?? null;
  const sourceRows = data
    .filter((r) => String(r.dimension_type ?? '') === 'source')
    .sort((a, b) => {
      const ai = OEJ_SOURCE_ORDER.indexOf(String(a.dimension_value ?? ''));
      const bi = OEJ_SOURCE_ORDER.indexOf(String(b.dimension_value ?? ''));
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  const articleRows = data.filter((r) => String(r.dimension_type ?? '') === 'article');

  return (
    <>
      <div className="kpi-subsection-title">D. Acquisition Attribution</div>
      {loading && <Loading />}
      {!loading && error && <SectionError msg={error} />}
      {!loading && !error && data.length === 0 && (
        <div className="kpi-status kpi-status--empty">No data</div>
      )}
      {!loading && !error && overall && (
        <>
          {overall.is_reference_period && (
            <div className="kpi-reference-notice">REFERENCE PERIOD</div>
          )}
          <div className="kpi-card-grid">
            <KpiCard label="Auth Started" value={fmtNum(overall.auth_started)} />
            <KpiCard label="Registrations" value={fmtNum(overall.registrations)} />
            <KpiCard label="Auth to Reg Rate" value={fmtPct(overall.auth_to_registration_rate)} />
            <KpiCard label="Attributed Auth Started" value={fmtNum(overall.attributed_auth_started)} />
            <KpiCard label="Attributed Regs" value={fmtNum(overall.attributed_registrations)} />
            <KpiCard label="Unattributed Auth Started" value={fmtNum(overall.unattributed_auth_started)} />
            <KpiCard label="Unattributed Regs" value={fmtNum(overall.unattributed_registrations)} />
          </div>
        </>
      )}
      {!loading && !error && sourceRows.length > 0 && (
        <>
          <div className="kpi-subsection-title" style={{ marginTop: '16px' }}>Source Attribution</div>
          <div className="kpi-table-wrap">
            <table className="kpi-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Auth Started</th>
                  <th>Registrations</th>
                  <th>Auth to Reg Rate</th>
                  <th>Attributed Auth Started</th>
                  <th>Attributed Regs</th>
                </tr>
              </thead>
              <tbody>
                {sourceRows.map((r, i) => (
                  <tr key={i}>
                    <td>{String(r.dimension_value ?? '—')}</td>
                    <td>{fmtNum(r.auth_started)}</td>
                    <td>{fmtNum(r.registrations)}</td>
                    <td>{fmtPct(r.auth_to_registration_rate)}</td>
                    <td>{fmtNum(r.attributed_auth_started)}</td>
                    <td>{fmtNum(r.attributed_registrations)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!loading && !error && articleRows.length > 0 && (
        <>
          <div className="kpi-subsection-title" style={{ marginTop: '16px' }}>Article Attribution</div>
          <div className="kpi-table-wrap">
            <table className="kpi-table">
              <thead>
                <tr>
                  <th>Article Slug</th>
                  <th>Auth Started</th>
                  <th>Registrations</th>
                  <th>Auth to Reg Rate</th>
                </tr>
              </thead>
              <tbody>
                {articleRows.map((r, i) => (
                  <tr key={i}>
                    <td>{String(r.dimension_value ?? '—')}</td>
                    <td>{fmtNum(r.auth_started)}</td>
                    <td>{fmtNum(r.registrations)}</td>
                    <td>{fmtPct(r.auth_to_registration_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function SectionOejDaily({
  data,
  error,
  loading,
}: {
  data: KpiOejDailyRow[];
  error?: string;
  loading: boolean;
}) {
  return (
    <>
      <div className="kpi-subsection-title">E. Daily</div>
      {loading && <Loading />}
      {!loading && error && <SectionError msg={error} />}
      {!loading && !error && data.length === 0 && (
        <div className="kpi-status kpi-status--empty">No data</div>
      )}
      {!loading && !error && data.length > 0 && (
        <div className="kpi-table-wrap">
          <table className="kpi-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>List Views</th>
                <th>Article Opens</th>
                <th>Unique Readers</th>
                <th>Completion Rate</th>
                <th>Game CTA Clicks</th>
                <th>X Opens</th>
                <th>Instagram Opens</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i}>
                  <td>{String(r.day ?? '').slice(5, 10)}</td>
                  <td>{fmtNum(r.list_views)}</td>
                  <td>{fmtNum(r.article_opens)}</td>
                  <td>{fmtNum(r.unique_readers)}</td>
                  <td>{fmtPct(r.completion_rate)}</td>
                  <td>{fmtNum(r.game_cta_clicks)}</td>
                  <td>{fmtNum(r.x_article_opens)}</td>
                  <td>{fmtNum(r.instagram_article_opens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function SectionOej({
  summary,
  article,
  source,
  daily,
  attribution,
  summaryError,
  articleError,
  sourceError,
  dailyError,
  attributionError,
  loading,
}: {
  summary: KpiOejSummaryRow | null;
  article: KpiOejArticleSummaryRow[];
  source: KpiOejSourceSummaryRow[];
  daily: KpiOejDailyRow[];
  attribution: KpiOejAttributionRow[];
  summaryError?: string;
  articleError?: string;
  sourceError?: string;
  dailyError?: string;
  attributionError?: string;
  loading: boolean;
}) {
  return (
    <section className="kpi-section">
      <div className="kpi-section__header">
        <h2 className="kpi-section__title">G. ONE EIGHT JOURNAL</h2>
      </div>
      <div className="kpi-section__body">
        <SectionOejOverview data={summary} error={summaryError} loading={loading} />
        <SectionOejSource data={source} error={sourceError} loading={loading} />
        <SectionOejArticle data={article} error={articleError} loading={loading} />
        <SectionOejAttribution data={attribution} error={attributionError} loading={loading} />
        <SectionOejDaily data={daily} error={dailyError} loading={loading} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// JSONをkey-value表に整形
// ---------------------------------------------------------------------------

function JsonKvTable({ data }: { data: unknown }) {
  if (data === null || data === undefined) {
    return <div className="kpi-status kpi-status--empty">No data</div>;
  }

  let entries: [string, unknown][] = [];
  if (typeof data === 'object' && !Array.isArray(data)) {
    entries = Object.entries(data as Record<string, unknown>);
  } else if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        entries = Object.entries(parsed as Record<string, unknown>);
      }
    } catch {
      return <div className="kpi-status kpi-status--empty">{data}</div>;
    }
  }

  if (entries.length === 0) {
    return <div className="kpi-status kpi-status--empty">No data</div>;
  }

  return (
    <div className="kpi-table-wrap">
      <table className="kpi-json-table">
        <tbody>
          {entries.map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td>{v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

interface Props {
  onBack: () => void;
}

export function AdminKpiDashboard({ onBack }: Props) {
  const [preset, setPreset] = useState<PeriodPreset>(30);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [includeInternal, setIncludeInternal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<KpiDashboardData | null>(null);
  const [errors, setErrors] = useState<KpiDashboardSectionError>({});

  const handleLoad = useCallback(async () => {
    setLoading(true);
    const range =
      customFrom && customTo
        ? { from: new Date(customFrom).toISOString(), to: new Date(customTo + 'T23:59:59').toISOString() }
        : makeDateRange(preset);

    const result = await fetchKpiDashboard({
      p_from: range.from,
      p_to: range.to,
      p_timezone: 'Asia/Tokyo',
      p_include_internal: includeInternal,
    });

    setData(result.data);
    setErrors(result.errors);
    setLoading(false);
  }, [preset, customFrom, customTo, includeInternal]);

  // 初回ロード
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { handleLoad(); }, []);

  const isRefPeriod =
    data?.settings !== null &&
    data?.settings !== undefined &&
    (data.settings.official_kpi_start_at === null || data.settings.official_kpi_start_at === undefined);

  return (
    <div className="kpi-dashboard">
      {/* ヘッダー */}
      <div className="kpi-dashboard__header">
        <button type="button" className="kpi-dashboard__back-btn" onClick={onBack}>
          ← Back
        </button>
        <div className="kpi-dashboard__header-center">
          <div className="kpi-dashboard__eyebrow">Administration</div>
          <h1 className="kpi-dashboard__title">KPI Dashboard</h1>
        </div>
      </div>

      {/* 参考計測バナー */}
      {data !== null && isRefPeriod && (
        <div className="kpi-dashboard__reference-notice">
          現在は参考計測期間です。正式KPI開始日は未設定です。
        </div>
      )}

      {/* フィルターバー */}
      <div className="kpi-dashboard__filter-bar">
        <span className="kpi-dashboard__filter-label">Period</span>
        <div className="kpi-dashboard__period-btns">
          {([7, 30, 90] as PeriodPreset[]).map((d) => (
            <button
              key={d}
              type="button"
              className={`kpi-dashboard__period-btn${preset === d && !customFrom ? ' kpi-dashboard__period-btn--active' : ''}`}
              onClick={() => {
                setPreset(d);
                setCustomFrom('');
                setCustomTo('');
              }}
            >
              {d}d
            </button>
          ))}
        </div>

        <div className="kpi-dashboard__filter-divider" />

        <input
          type="date"
          className="kpi-dashboard__date-input"
          value={customFrom}
          onChange={(e) => setCustomFrom(e.target.value)}
          max={toISODate(new Date())}
          aria-label="開始日"
        />
        <span className="kpi-dashboard__filter-label" style={{ margin: '0 2px' }}>〜</span>
        <input
          type="date"
          className="kpi-dashboard__date-input"
          value={customTo}
          onChange={(e) => setCustomTo(e.target.value)}
          max={toISODate(new Date())}
          aria-label="終了日"
        />

        <div className="kpi-dashboard__filter-divider" />

        <label className="kpi-dashboard__internal-label">
          <input
            type="checkbox"
            checked={includeInternal}
            onChange={(e) => setIncludeInternal(e.target.checked)}
          />
          Internal/Test含む
        </label>

        <button
          type="button"
          className="kpi-dashboard__reload-btn"
          onClick={handleLoad}
          disabled={loading}
        >
          {loading ? '…' : '↻ Reload'}
        </button>
      </div>

      {/* コンテンツ */}
      {loading && !data && (
        <div className="kpi-dashboard__loading">読み込み中…</div>
      )}

      {(data || !loading) && (
        <div className="kpi-dashboard__content">
          <SectionAcquisition
            data={data?.acquisitionAuth ?? null}
            error={errors.acquisitionAuth}
            loading={loading}
          />
          <SectionMatches
            summary={data?.matchSummary ?? null}
            daily={data?.matchDaily ?? []}
            summaryError={errors.matchSummary}
            dailyError={errors.matchDaily}
            loading={loading}
          />
          <SectionArenaFunnel
            data={data?.arenaFunnel ?? []}
            error={errors.arenaFunnel}
            loading={loading}
          />
          <SectionTraining
            summary={data?.trainingSummary ?? null}
            taskSummary={data?.trainingTaskSummary ?? []}
            stepFunnel={data?.trainingStepFunnel ?? []}
            daily={data?.trainingDaily ?? []}
            summaryError={errors.trainingSummary}
            taskSummaryError={errors.trainingTaskSummary}
            stepFunnelError={errors.trainingStepFunnel}
            dailyError={errors.trainingDaily}
            loading={loading}
          />
          <SectionPostmortem
            data={data?.postmortem ?? null}
            error={errors.postmortem}
            loading={loading}
          />
          <SectionSystemHealth
            data={data?.systemHealth ?? null}
            error={errors.systemHealth}
            loading={loading}
          />
          <SectionOej
            summary={data?.oejSummary ?? null}
            article={data?.oejArticle ?? []}
            source={data?.oejSource ?? []}
            daily={data?.oejDaily ?? []}
            attribution={data?.oejAttribution ?? []}
            summaryError={errors.oejSummary}
            articleError={errors.oejArticle}
            sourceError={errors.oejSource}
            dailyError={errors.oejDaily}
            attributionError={errors.oejAttribution}
            loading={loading}
          />
        </div>
      )}
    </div>
  );
}
