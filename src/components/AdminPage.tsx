/**
 * AdminPage.tsx — Admin Prize/Reward Award 管理 UI
 *
 * 表示条件: profile.is_admin === true
 * 権限: 実際の操作は SECURITY DEFINER RPC 内で is_admin を再確認する
 *
 * RP-3 追加: Winner File 印刷 / Archive 完了導線
 * UI refresh: デザインを本体UIトーンに統一
 */
import { useEffect, useState } from 'react';
import {
  adminListPrizeAwards,
  adminCreatePrizeAward,
  adminUpdatePrizeAwardStatus,
  adminGenerateArenaAwards,
  type AdminPrizeAwardRow,
  type SourceKind,
  type PrizeKind,
  type GenerateArenaAwardRow,
} from '../lib/prizeAdmin';
import { PrizeWinnerFilePrint } from './PrizeWinnerFilePrint';
import { PrizePaymentDashboard } from './PrizePaymentDashboard';

type AdminSubScreen = 'awards' | 'winner_file' | 'payment_dashboard';

interface Props {
  onBack: () => void;
}

// ── ユーティリティ ──────────────────────────────────────────────────────────

function fmtCents(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function statusColor(status: string): string {
  switch (status) {
    case 'eligible':  return '#2e7d32';
    case 'on_hold':   return '#e65100';
    case 'canceled':  return '#b71c1c';
    case 'expired':   return '#757575';
    default:          return '#1565c0';
  }
}

// ── コンポーネント ──────────────────────────────────────────────────────────

export function AdminPage({ onBack }: Props) {
  const [subScreen, setSubScreen] = useState<AdminSubScreen>('awards');
  /** Payment Dashboard から Winner File へ遷移時に渡す Submission ID */
  const [winnerFileSubmissionId, setWinnerFileSubmissionId] = useState<string | undefined>(undefined);
  const [awards, setAwards] = useState<AdminPrizeAwardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // Award 作成フォーム
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // フォーム値
  const [fRecipient, setFRecipient]     = useState('');
  const [fSourceKind, setFSourceKind]   = useState<SourceKind>('manual_admin');
  const [fEventId, setFEventId]         = useState('');
  const [fMatchId, setFMatchId]         = useState('');
  const [fAmountStr, setFAmountStr]     = useState('');
  const [fCurrency, setFCurrency]       = useState('JPY');
  const [fPrizeKind, setFPrizeKind]     = useState<PrizeKind>('cash');
  const [fNotes, setFNotes]             = useState('');

  // ステータス変更
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError]     = useState<string | null>(null);
  const [reasonInput, setReasonInput]     = useState<Record<string, string>>({});

  // Generate Arena Awards フォーム
  const [showGenerate, setShowGenerate]     = useState(false);
  const [generating, setGenerating]         = useState(false);
  const [generateError, setGenerateError]   = useState<string | null>(null);
  const [generateResult, setGenerateResult] = useState<GenerateArenaAwardRow[] | null>(null);
  const [gEventId, setGEventId]             = useState('');
  const [gAmountStr, setGAmountStr]         = useState('');
  const [gCurrency, setGCurrency]           = useState('JPY');
  const [gPrizeKind, setGPrizeKind]         = useState<PrizeKind>('cash');

  // ── 一覧取得 ──────────────────────────────────────────────────────────────

  async function loadAwards() {
    setLoading(true);
    setListError(null);
    const { data, error } = await adminListPrizeAwards();
    if (error) {
      setListError(error);
    } else {
      setAwards(data ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { loadAwards(); }, []);

  // ── Award 作成 ────────────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);

    const amountNum = parseFloat(fAmountStr);
    if (isNaN(amountNum) || amountNum < 0) {
      setCreateError('Amount must be a non-negative number.');
      setCreating(false);
      return;
    }
    const amountCents = Math.round(amountNum * 100);

    const { error } = await adminCreatePrizeAward({
      recipient_user_id:      fRecipient.trim(),
      source_kind:            fSourceKind,
      amount_cents:           amountCents,
      currency:               fCurrency.trim().toUpperCase(),
      source_arena_event_id:  fEventId.trim() || null,
      source_arena_match_id:  fMatchId.trim() || null,
      prize_kind:             fPrizeKind,
      notes:                  fNotes.trim() || null,
    });

    if (error) {
      setCreateError(error);
    } else {
      setCreateSuccess('Award created successfully.');
      setShowCreate(false);
      setFRecipient(''); setFSourceKind('manual_admin'); setFEventId('');
      setFMatchId(''); setFAmountStr(''); setFCurrency('JPY');
      setFPrizeKind('cash'); setFNotes('');
      await loadAwards();
    }
    setCreating(false);
  }

  // ── Arena Award 自動生成 ───────────────────────────────────────────────────

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    setGenerateError(null);
    setGenerateResult(null);

    const eventId = gEventId.trim();
    if (!eventId) {
      setGenerateError('Arena Event ID is required.');
      setGenerating(false);
      return;
    }

    const amountNum = parseFloat(gAmountStr);
    if (isNaN(amountNum) || amountNum < 0) {
      setGenerateError('Amount must be a non-negative number.');
      setGenerating(false);
      return;
    }
    const amountCents = Math.round(amountNum * 100);

    const { data, error } = await adminGenerateArenaAwards(
      eventId,
      amountCents,
      gCurrency.trim().toUpperCase(),
      gPrizeKind,
    );

    if (error) {
      setGenerateError(error);
    } else {
      setGenerateResult(data ?? []);
      await loadAwards();
    }
    setGenerating(false);
  }

  // ── ステータス変更 ─────────────────────────────────────────────────────────

  async function handleStatusChange(
    awardId: string,
    status: 'eligible' | 'on_hold' | 'canceled',
  ) {
    setActionLoading(awardId);
    setActionError(null);
    const reason = reasonInput[awardId]?.trim() || undefined;
    const { error } = await adminUpdatePrizeAwardStatus(awardId, status, reason);
    if (error) {
      setActionError(`[${awardId.slice(0, 8)}] ${error}`);
    } else {
      await loadAwards();
    }
    setActionLoading(null);
  }

  // ── レンダリング ───────────────────────────────────────────────────────────

  if (subScreen === 'winner_file') {
    return (
      <PrizeWinnerFilePrint
        onBack={() => {
          setWinnerFileSubmissionId(undefined);
          setSubScreen('awards');
        }}
        initialSubmissionId={winnerFileSubmissionId}
      />
    );
  }

  if (subScreen === 'payment_dashboard') {
    return (
      <PrizePaymentDashboard
        onBack={() => setSubScreen('awards')}
        onOpenWinnerFile={(submissionId) => {
          setWinnerFileSubmissionId(submissionId);
          setSubScreen('winner_file');
        }}
      />
    );
  }

  return (
    <div style={s.page}>
      {/* ヘッダー */}
      <div style={s.pageHeader}>
        <button type="button" style={s.backBtn} onClick={onBack}>← Back</button>
        <div style={s.headerCenter}>
          <div style={s.headerEyebrow}>Administration</div>
          <h1 style={s.headerTitle}>Prize / Reward Awards</h1>
        </div>
      </div>

      {/* 通知バナー */}
      {createSuccess && (
        <div style={s.successBanner}>
          <span>✓ {createSuccess}</span>
          <button type="button" style={s.dismissBtn} onClick={() => setCreateSuccess(null)}>✕</button>
        </div>
      )}
      {actionError && (
        <div style={s.errorBanner}>
          <span>⚠ {actionError}</span>
          <button type="button" style={s.dismissBtn} onClick={() => setActionError(null)}>✕</button>
        </div>
      )}

      {/* ナビゲーション */}
      <div style={s.navRow}>
        <button
          type="button"
          style={{ ...s.navBtn, ...(showCreate ? s.navBtnActive : {}) }}
          onClick={() => { setShowCreate(v => !v); setCreateError(null); }}
        >
          {showCreate ? '× Cancel' : '+ New Award'}
        </button>
        <button type="button" style={s.navBtn} onClick={loadAwards} disabled={loading}>
          {loading ? '…' : '↻ Reload'}
        </button>
        <div style={s.navDivider} />
        <button
          type="button"
          style={s.navBtn}
          onClick={() => setSubScreen('winner_file')}
        >
          Winner File
        </button>
        <button
          type="button"
          style={s.navBtn}
          onClick={() => setSubScreen('payment_dashboard')}
        >
          Payment Dashboard
        </button>
        <div style={s.navDivider} />
        <button
          type="button"
          style={{ ...s.navBtn, ...(showGenerate ? s.navBtnActive : {}) }}
          onClick={() => { setShowGenerate(v => !v); setGenerateError(null); setGenerateResult(null); }}
        >
          {showGenerate ? '× Cancel' : '⚡ Arena賞金を生成'}
        </button>
      </div>

      {/* Arena Award 自動生成フォーム */}
      {showGenerate && (
        <div style={s.formCard}>
          <div style={s.formEyebrow}>Generate Arena Awards</div>
          <div style={{ fontSize: 12, color: '#555', marginBottom: 12 }}>
            指定した Arena Event の master match winner に Prize Award を自動生成します。<br/>
            重複の場合は既存 Award を返します（新規作成しません）。
          </div>
          {generateError && <div style={s.errorBanner}><span>⚠ {generateError}</span></div>}
          <form style={s.form} onSubmit={handleGenerate}>
            <label style={s.label}>
              <span style={s.labelText}>Arena Event ID <span style={s.required}>*</span></span>
              <input
                style={s.input}
                type="text"
                value={gEventId}
                onChange={e => setGEventId(e.target.value)}
                placeholder="uuid"
                required
              />
            </label>

            <div style={s.formRow}>
              <label style={{ ...s.label, flex: 2 }}>
                <span style={s.labelText}>Amount <span style={s.required}>*</span></span>
                <input
                  style={s.input}
                  type="number"
                  min="0"
                  step="0.01"
                  value={gAmountStr}
                  onChange={e => setGAmountStr(e.target.value)}
                  placeholder="e.g. 5000"
                  required
                />
              </label>
              <label style={{ ...s.label, flex: 1 }}>
                <span style={s.labelText}>Currency <span style={s.required}>*</span></span>
                <input
                  style={s.input}
                  type="text"
                  maxLength={3}
                  value={gCurrency}
                  onChange={e => setGCurrency(e.target.value.toUpperCase())}
                  placeholder="JPY"
                  required
                />
              </label>
            </div>

            <label style={s.label}>
              <span style={s.labelText}>Prize Kind <span style={s.required}>*</span></span>
              <select style={s.select} value={gPrizeKind} onChange={e => setGPrizeKind(e.target.value as PrizeKind)}>
                <option value="cash">cash</option>
                <option value="merchandise">merchandise</option>
                <option value="title_only">title_only</option>
              </select>
            </label>

            <button type="submit" style={s.submitBtn} disabled={generating}>
              {generating ? 'Generating…' : '⚡ Generate Arena Awards'}
            </button>
          </form>

          {generateResult !== null && (
            <div style={{ marginTop: 16 }}>
              {generateResult.length === 0 ? (
                <div style={{ color: '#e65100', fontSize: 13 }}>
                  ⚠ 対象となる master match が見つかりませんでした。
                  (processed済み / winner有り / end_reason正常系 の条件を満たす match がありません)
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: '#2e7d32', fontWeight: 600, marginBottom: 8 }}>
                    ✓ {generateResult.length} 件処理しました
                  </div>
                  {generateResult.map((row, i) => (
                    <div key={i} style={{ fontSize: 12, background: '#f5f5f5', borderRadius: 6, padding: '8px 12px', marginBottom: 6 }}>
                      <span style={{ color: row.skipped_reason === 'already_exists' ? '#757575' : '#1565c0', fontWeight: 700 }}>
                        {row.skipped_reason === 'already_exists' ? 'SKIPPED (already exists)' : 'CREATED'}
                      </span>
                      {' '}award_id: {row.award_id.slice(0, 8)}…
                      {' '}| match: {row.arena_match_id.slice(0, 8)}…
                      {' '}| recipient: {row.recipient_user_id.slice(0, 8)}…
                      {' '}| status: {row.status}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Award 作成フォーム */}
      {showCreate && (
        <div style={s.formCard}>
          <div style={s.formEyebrow}>New Prize Award</div>
          {createError && <div style={s.errorBanner}><span>⚠ {createError}</span></div>}
          <form style={s.form} onSubmit={handleCreate}>
            <label style={s.label}>
              <span style={s.labelText}>Recipient User ID <span style={s.required}>*</span></span>
              <input
                style={s.input}
                type="text"
                value={fRecipient}
                onChange={e => setFRecipient(e.target.value)}
                placeholder="uuid"
                required
              />
            </label>

            <label style={s.label}>
              <span style={s.labelText}>Source Kind <span style={s.required}>*</span></span>
              <select style={s.select} value={fSourceKind} onChange={e => setFSourceKind(e.target.value as SourceKind)}>
                <option value="arena_master">arena_master</option>
                <option value="tournament">tournament</option>
                <option value="manual_admin">manual_admin</option>
                <option value="other">other</option>
              </select>
            </label>

            <label style={s.label}>
              <span style={s.labelText}>Source Arena Event ID</span>
              <input style={s.input} type="text" value={fEventId} onChange={e => setFEventId(e.target.value)} placeholder="uuid (optional)" />
            </label>

            <label style={s.label}>
              <span style={s.labelText}>Source Arena Match ID</span>
              <input style={s.input} type="text" value={fMatchId} onChange={e => setFMatchId(e.target.value)} placeholder="uuid (optional)" />
            </label>

            <div style={s.formRow}>
              <label style={{ ...s.label, flex: 2 }}>
                <span style={s.labelText}>Amount <span style={s.required}>*</span></span>
                <input
                  style={s.input}
                  type="number"
                  min="0"
                  step="0.01"
                  value={fAmountStr}
                  onChange={e => setFAmountStr(e.target.value)}
                  placeholder="e.g. 5000"
                  required
                />
              </label>
              <label style={{ ...s.label, flex: 1 }}>
                <span style={s.labelText}>Currency <span style={s.required}>*</span></span>
                <input
                  style={s.input}
                  type="text"
                  maxLength={3}
                  value={fCurrency}
                  onChange={e => setFCurrency(e.target.value.toUpperCase())}
                  placeholder="JPY"
                  required
                />
              </label>
            </div>

            <label style={s.label}>
              <span style={s.labelText}>Prize Kind <span style={s.required}>*</span></span>
              <select style={s.select} value={fPrizeKind} onChange={e => setFPrizeKind(e.target.value as PrizeKind)}>
                <option value="cash">cash</option>
                <option value="merchandise">merchandise</option>
                <option value="title_only">title_only</option>
              </select>
            </label>

            <label style={s.label}>
              <span style={s.labelText}>Notes</span>
              <textarea style={s.textarea} value={fNotes} onChange={e => setFNotes(e.target.value)} rows={2} />
            </label>

            <button type="submit" style={s.submitBtn} disabled={creating}>
              {creating ? 'Creating…' : 'Create Award'}
            </button>
          </form>
        </div>
      )}

      {/* エラー / ローディング */}
      {listError && (
        <div style={s.errorBanner}>
          <span>⚠ {listError}</span>
        </div>
      )}

      {loading && (
        <div style={s.emptyState}>
          <span style={s.emptyStateText}>Loading awards…</span>
        </div>
      )}

      {!loading && awards.length === 0 && (
        <div style={s.emptyState}>
          <span style={s.emptyStateEyebrow}>No Records</span>
          <span style={s.emptyStateText}>No prize awards found.</span>
        </div>
      )}

      {/* Award 一覧 */}
      {awards.map(award => (
        <div key={award.award_id} style={s.awardCard}>
          {/* カードヘッダー */}
          <div style={s.awardCardHeader}>
            <span style={{
              ...s.statusPill,
              background: statusColor(award.award_status) + '18',
              color: statusColor(award.award_status),
              borderColor: statusColor(award.award_status) + '44',
            }}>
              {award.award_status.toUpperCase()}
            </span>
            <span style={s.awardIdMono}>
              {award.arena_code ? `${award.arena_code} Master` : (award.source_kind ?? 'manual')}
            </span>
            <span style={s.awardDate}>{fmtDate(award.created_at)}</span>
          </div>

          {/* 主要情報グリッド */}
          <div style={s.infoGrid}>
            <InfoPair label="Award ID"      value={award.award_id} />
            <InfoPair label="Recipient"     value={award.recipient_display_name ?? award.recipient_user_id.slice(0, 8)} />
            <InfoPair label="Source"        value={award.arena_code ? `${award.arena_code} Master (${award.source_kind ?? 'arena_master'})` : (award.source_kind ?? '—')} />
            <InfoPair label="Amount"        value={fmtCents(award.amount_cents, award.currency)} />
            <InfoPair label="Prize Kind"    value={award.prize_kind ?? '—'} />
            <InfoPair label="Payout Status" value={award.latest_payout_status ?? 'none'} />
            {award.source_arena_event_id && <InfoPair label="Arena Event" value={award.source_arena_event_id} />}
            {award.source_arena_match_id && <InfoPair label="Arena Match" value={award.source_arena_match_id} />}
            {award.notes        && <InfoPair label="Notes"         value={award.notes} />}
            {award.hold_reason  && <InfoPair label="Hold Reason"   value={award.hold_reason} />}
            {award.cancel_reason && <InfoPair label="Cancel Reason" value={award.cancel_reason} />}
            {award.canceled_at  && <InfoPair label="Canceled At"   value={fmtDate(award.canceled_at)} />}
            {award.latest_submission_id && (
              <InfoPair label="Submission ID" value={`${award.latest_submission_id.slice(0, 8)}…`} />
            )}
            {award.latest_submission_status && (
              <InfoPair label="Submission Status" value={award.latest_submission_status} />
            )}
            {award.latest_submission_submitted_at && (
              <InfoPair label="Submitted At" value={fmtDate(award.latest_submission_submitted_at)} />
            )}
            {award.latest_submission_delete_after && (
              <InfoPair label="Data Expires" value={fmtDate(award.latest_submission_delete_after)} />
            )}
            {award.latest_submission_data_cleared_at && (
              <InfoPair label="Data Cleared" value={fmtDate(award.latest_submission_data_cleared_at)} />
            )}
          </div>

          {/* 操作エリア */}
          {award.award_status !== 'canceled' && award.award_status !== 'expired' && (
            <div style={s.actionsArea}>
              <input
                style={s.reasonInput}
                type="text"
                placeholder="Reason (optional)"
                value={reasonInput[award.award_id] ?? ''}
                onChange={e => setReasonInput(prev => ({ ...prev, [award.award_id]: e.target.value }))}
              />
              <div style={s.actionBtns}>
                {award.award_status !== 'on_hold' && (
                  <button
                    type="button"
                    style={{ ...s.actionBtn, ...s.actionBtnHold }}
                    disabled={actionLoading === award.award_id}
                    onClick={() => handleStatusChange(award.award_id, 'on_hold')}
                  >
                    Hold
                  </button>
                )}
                {award.award_status === 'on_hold' && (
                  <button
                    type="button"
                    style={{ ...s.actionBtn, ...s.actionBtnRestore }}
                    disabled={actionLoading === award.award_id}
                    onClick={() => handleStatusChange(award.award_id, 'eligible')}
                  >
                    Restore Eligible
                  </button>
                )}
                <button
                  type="button"
                  style={{ ...s.actionBtn, ...s.actionBtnCancel }}
                  disabled={actionLoading === award.award_id}
                  onClick={() => {
                    if (window.confirm('Cancel this award? This cannot be undone.')) {
                      handleStatusChange(award.award_id, 'canceled');
                    }
                  }}
                >
                  Cancel
                </button>
              </div>
              {actionLoading === award.award_id && (
                <div style={s.processingText}>Processing…</div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Sub-component ────────────────────────────────────────────────────────────

function InfoPair({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.infoPair}>
      <span style={s.infoPairLabel}>{label}</span>
      <span style={s.infoPairValue}>{value}</span>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  // ── ページ ──
  page: {
    maxWidth: 840,
    margin: '0 auto',
    padding: '0 0 40px',
    fontFamily: 'inherit',
    background: 'transparent',
    minHeight: '100vh',
  },

  // ── ページヘッダー ──
  pageHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 16,
    padding: '28px 24px 20px',
    borderBottom: '1px solid var(--rule)',
    marginBottom: 0,
  },
  backBtn: {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
    color: 'var(--ink-3)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '6px 0',
    flexShrink: 0,
    marginTop: 4,
  },
  headerCenter: {
    flex: 1,
  },
  headerEyebrow: {
    fontFamily: 'var(--mono)',
    fontSize: 9,
    letterSpacing: '0.24em',
    textTransform: 'uppercase' as const,
    color: 'var(--ink-3)',
    marginBottom: 4,
  },
  headerTitle: {
    fontFamily: 'var(--display)',
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: '0.02em',
    color: 'var(--ink)',
    margin: 0,
  },

  // ── ナビゲーション ──
  navRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 0,
    padding: '12px 24px',
    borderBottom: '1px solid var(--rule)',
    flexWrap: 'wrap' as const,
    rowGap: 6,
  },
  navBtn: {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
    color: 'var(--ink-2)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '8px 14px',
    transition: 'color .15s',
    whiteSpace: 'nowrap' as const,
  },
  navBtnActive: {
    color: 'var(--ink)',
    textDecoration: 'underline',
    textUnderlineOffset: 3,
  },
  navDivider: {
    width: 1,
    height: 14,
    background: 'var(--rule-strong)',
    margin: '0 6px',
  },

  // ── 通知バナー ──
  successBanner: {
    background: '#f0faf2',
    border: '1px solid #a5d6a7',
    borderRadius: 4,
    padding: '10px 16px',
    fontSize: 13,
    color: '#2e7d32',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    margin: '12px 24px',
  },
  errorBanner: {
    background: '#fff8f8',
    border: '1px solid #ffcdd2',
    borderRadius: 4,
    padding: '10px 16px',
    fontSize: 13,
    color: '#b71c1c',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    margin: '12px 24px',
  },
  dismissBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    color: 'inherit',
    padding: '0 2px',
    flexShrink: 0,
  },

  // ── フォームカード ──
  formCard: {
    margin: '16px 24px',
    border: '1px solid var(--rule)',
    borderRadius: 8,
    padding: '20px 24px',
    background: '#faf9f7',
  },
  formEyebrow: {
    fontFamily: 'var(--mono)',
    fontSize: 9,
    letterSpacing: '0.24em',
    textTransform: 'uppercase' as const,
    color: 'var(--ink-3)',
    marginBottom: 16,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  formRow: {
    display: 'flex',
    gap: 12,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  labelText: {
    fontFamily: 'var(--mono)',
    fontSize: 9,
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
    color: 'var(--ink-3)',
  },
  required: {
    color: '#b71c1c',
  },
  input: {
    border: '1px solid var(--rule-strong)',
    borderRadius: 4,
    padding: '7px 10px',
    fontSize: 13,
    fontFamily: 'inherit',
    background: '#fff',
    width: '100%',
    boxSizing: 'border-box' as const,
    color: 'var(--ink)',
  },
  select: {
    border: '1px solid var(--rule-strong)',
    borderRadius: 4,
    padding: '7px 10px',
    fontSize: 13,
    fontFamily: 'inherit',
    background: '#fff',
    width: '100%',
    color: 'var(--ink)',
  },
  textarea: {
    border: '1px solid var(--rule-strong)',
    borderRadius: 4,
    padding: '7px 10px',
    fontSize: 13,
    fontFamily: 'inherit',
    background: '#fff',
    width: '100%',
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
    color: 'var(--ink)',
  },
  submitBtn: {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
    background: 'var(--ink)',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '10px 20px',
    cursor: 'pointer',
    alignSelf: 'flex-start',
    transition: 'opacity .15s',
  },

  // ── 空状態 ──
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    gap: 8,
  },
  emptyStateEyebrow: {
    fontFamily: 'var(--mono)',
    fontSize: 9,
    letterSpacing: '0.24em',
    textTransform: 'uppercase' as const,
    color: 'var(--ink-4)',
  },
  emptyStateText: {
    fontSize: 14,
    color: 'var(--ink-3)',
  },

  // ── Award カード ──
  awardCard: {
    margin: '0 24px',
    marginTop: 12,
    border: '1px solid var(--rule)',
    borderRadius: 8,
    padding: '16px 20px',
    background: '#faf9f7',
  },
  awardCardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  statusPill: {
    fontFamily: 'var(--mono)',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.16em',
    border: '1px solid',
    borderRadius: 999,
    padding: '3px 10px',
    flexShrink: 0,
  },
  awardIdMono: {
    fontFamily: 'var(--mono)',
    fontSize: 11,
    color: 'var(--ink-4)',
  },
  awardDate: {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    color: 'var(--ink-4)',
    marginLeft: 'auto',
  },

  // ── 情報グリッド ──
  infoGrid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '6px 20px',
    marginBottom: 12,
  },
  infoPair: {
    display: 'flex',
    gap: 6,
    fontSize: 12,
    minWidth: 200,
  },
  infoPairLabel: {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    color: 'var(--ink-3)',
    flexShrink: 0,
    letterSpacing: '0.05em',
  },
  infoPairValue: {
    color: 'var(--ink)',
    fontWeight: 500,
    wordBreak: 'break-all' as const,
    fontSize: 12,
  },

  // ── 操作エリア ──
  actionsArea: {
    borderTop: '1px solid var(--rule)',
    paddingTop: 12,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  reasonInput: {
    border: '1px solid var(--rule-strong)',
    borderRadius: 4,
    padding: '6px 10px',
    fontSize: 12,
    fontFamily: 'inherit',
    background: '#fff',
    width: '100%',
    boxSizing: 'border-box' as const,
    color: 'var(--ink)',
  },
  actionBtns: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap' as const,
  },
  actionBtn: {
    fontFamily: 'var(--mono)',
    fontSize: 9,
    letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
    border: 'none',
    borderRadius: 4,
    padding: '7px 16px',
    cursor: 'pointer',
    fontWeight: 700,
    minHeight: 32,
    transition: 'opacity .15s',
  },
  actionBtnHold: {
    background: '#e65100',
    color: '#fff',
  },
  actionBtnRestore: {
    background: '#2e7d32',
    color: '#fff',
  },
  actionBtnCancel: {
    background: '#b71c1c',
    color: '#fff',
  },
  processingText: {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    color: 'var(--ink-3)',
    letterSpacing: '0.12em',
  },
};
