/**
 * AdminPage.tsx — Admin Prize/Reward Award 管理 UI
 *
 * 表示条件: profile.is_admin === true
 * 権限: 実際の操作は SECURITY DEFINER RPC 内で is_admin を再確認する
 *
 * RP-3 追加: Winner File 印刷 / Archive 完了導線
 */
import { useEffect, useState } from 'react';
import {
  adminListPrizeAwards,
  adminCreatePrizeAward,
  adminUpdatePrizeAwardStatus,
  type AdminPrizeAwardRow,
  type SourceKind,
  type PrizeKind,
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
  const [actionLoading, setActionLoading] = useState<string | null>(null); // award_id
  const [actionError, setActionError]     = useState<string | null>(null);
  const [reasonInput, setReasonInput]     = useState<Record<string, string>>({});

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

    // amount を cents に変換（小数点2桁まで）
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

  // Winner File 画面
  if (subScreen === 'winner_file') {
    return <PrizeWinnerFilePrint onBack={() => setSubScreen('awards')} />;
  }

  // Payment Dashboard 画面
  if (subScreen === 'payment_dashboard') {
    return <PrizePaymentDashboard onBack={() => setSubScreen('awards')} />;
  }

  return (
    <div style={s.page}>
      {/* ヘッダー */}
      <div style={s.header}>
        <button type="button" style={s.backBtn} onClick={onBack}>← Back</button>
        <h2 style={s.title}>Admin — Prize/Reward Awards</h2>
      </div>

      {/* 作成成功通知 */}
      {createSuccess && (
        <div style={s.successBanner}>
          {createSuccess}
          <button type="button" style={s.dismissBtn} onClick={() => setCreateSuccess(null)}>✕</button>
        </div>
      )}

      {/* アクションエラー */}
      {actionError && (
        <div style={s.errorBanner}>
          {actionError}
          <button type="button" style={s.dismissBtn} onClick={() => setActionError(null)}>✕</button>
        </div>
      )}

      {/* ツールバー */}
      <div style={s.toolbar}>
        <button
          type="button"
          style={s.createBtn}
          onClick={() => { setShowCreate(v => !v); setCreateError(null); }}
        >
          {showCreate ? 'Cancel' : '+ Create Award'}
        </button>
        <button type="button" style={s.reloadBtn} onClick={loadAwards} disabled={loading}>
          {loading ? 'Loading…' : 'Reload'}
        </button>
        <button
          type="button"
          style={s.winnerFileBtn}
          onClick={() => setSubScreen('winner_file')}
        >
          🖶 Winner File / Archive
        </button>
        <button
          type="button"
          style={s.paymentDashBtn}
          onClick={() => setSubScreen('payment_dashboard')}
        >
          💳 Payment Dashboard
        </button>
      </div>

      {/* Award 作成フォーム */}
      {showCreate && (
        <form style={s.form} onSubmit={handleCreate}>
          <div style={s.formTitle}>New Prize Award</div>

          {createError && <div style={s.errorBanner}>{createError}</div>}

          <label style={s.label}>
            Recipient User ID *
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
            Source Kind *
            <select style={s.select} value={fSourceKind} onChange={e => setFSourceKind(e.target.value as SourceKind)}>
              <option value="arena_master">arena_master</option>
              <option value="tournament">tournament</option>
              <option value="manual_admin">manual_admin</option>
              <option value="other">other</option>
            </select>
          </label>

          <label style={s.label}>
            Source Arena Event ID
            <input style={s.input} type="text" value={fEventId} onChange={e => setFEventId(e.target.value)} placeholder="uuid (optional)" />
          </label>

          <label style={s.label}>
            Source Arena Match ID
            <input style={s.input} type="text" value={fMatchId} onChange={e => setFMatchId(e.target.value)} placeholder="uuid (optional)" />
          </label>

          <div style={s.row}>
            <label style={{ ...s.label, flex: 2 }}>
              Amount *
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
              Currency *
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
            Prize Kind *
            <select style={s.select} value={fPrizeKind} onChange={e => setFPrizeKind(e.target.value as PrizeKind)}>
              <option value="cash">cash</option>
              <option value="merchandise">merchandise</option>
              <option value="title_only">title_only</option>
            </select>
          </label>

          <label style={s.label}>
            Notes
            <textarea style={s.textarea} value={fNotes} onChange={e => setFNotes(e.target.value)} rows={2} />
          </label>

          <button type="submit" style={s.submitBtn} disabled={creating}>
            {creating ? 'Creating…' : 'Create Award'}
          </button>
        </form>
      )}

      {/* Award 一覧 */}
      {listError && <div style={s.errorBanner}>{listError}</div>}

      {!loading && awards.length === 0 && (
        <div style={s.empty}>No prize awards found.</div>
      )}

      {awards.map(award => (
        <div key={award.award_id} style={s.card}>
          {/* ヘッダー行 */}
          <div style={s.cardHeader}>
            <span style={{ ...s.statusBadge, color: statusColor(award.award_status) }}>
              {award.award_status.toUpperCase()}
            </span>
            <span style={s.cardId}>{award.award_id.slice(0, 8)}…</span>
            <span style={s.cardDate}>{fmtDate(award.created_at)}</span>
          </div>

          {/* 主要情報 */}
          <div style={s.cardGrid}>
            <Row label="Recipient"     value={award.recipient_display_name ?? award.recipient_user_id.slice(0, 8)} />
            <Row label="Source"        value={award.source_kind ?? '—'} />
            <Row label="Amount"        value={fmtCents(award.amount_cents, award.currency)} />
            <Row label="Prize Kind"    value={award.prize_kind ?? '—'} />
            <Row label="Payout Status" value={award.latest_payout_status ?? 'none'} />
            {award.source_arena_event_id && <Row label="Arena Event" value={award.source_arena_event_id.slice(0, 8)} />}
            {award.source_arena_match_id && <Row label="Arena Match" value={award.source_arena_match_id.slice(0, 8)} />}
            {award.notes        && <Row label="Notes"         value={award.notes} />}
            {award.hold_reason  && <Row label="Hold Reason"   value={award.hold_reason} />}
            {award.cancel_reason && <Row label="Cancel Reason" value={award.cancel_reason} />}
            {award.canceled_at  && <Row label="Canceled At"   value={fmtDate(award.canceled_at)} />}
            {/* RP-4: submission 情報（PIIなし） */}
            {award.latest_submission_id && (
              <Row label="Submission ID" value={`${award.latest_submission_id.slice(0, 8)}…`} />
            )}
            {award.latest_submission_status && (
              <Row label="Submission Status" value={award.latest_submission_status} />
            )}
            {award.latest_submission_submitted_at && (
              <Row label="Submitted At" value={fmtDate(award.latest_submission_submitted_at)} />
            )}
            {award.latest_submission_delete_after && (
              <Row label="Data Expires" value={fmtDate(award.latest_submission_delete_after)} />
            )}
            {award.latest_submission_data_cleared_at && (
              <Row label="Data Cleared" value={fmtDate(award.latest_submission_data_cleared_at)} />
            )}
          </div>

          {/* 操作 — canceled/expired は操作不可 */}
          {award.award_status !== 'canceled' && award.award_status !== 'expired' && (
            <div style={s.actions}>
              {/* Reason 入力 */}
              <input
                style={{ ...s.input, fontSize: 12, padding: '4px 8px' }}
                type="text"
                placeholder="Reason (optional)"
                value={reasonInput[award.award_id] ?? ''}
                onChange={e => setReasonInput(prev => ({ ...prev, [award.award_id]: e.target.value }))}
              />
              <div style={s.actionButtons}>
                {award.award_status !== 'on_hold' && (
                  <button
                    type="button"
                    style={{ ...s.actionBtn, background: '#e65100', color: '#fff' }}
                    disabled={actionLoading === award.award_id}
                    onClick={() => handleStatusChange(award.award_id, 'on_hold')}
                  >
                    Hold
                  </button>
                )}
                {award.award_status === 'on_hold' && (
                  <button
                    type="button"
                    style={{ ...s.actionBtn, background: '#2e7d32', color: '#fff' }}
                    disabled={actionLoading === award.award_id}
                    onClick={() => handleStatusChange(award.award_id, 'eligible')}
                  >
                    Restore Eligible
                  </button>
                )}
                <button
                  type="button"
                  style={{ ...s.actionBtn, background: '#b71c1c', color: '#fff' }}
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
                <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Processing…</div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Sub-component ────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.rowItem}>
      <span style={s.rowLabel}>{label}</span>
      <span style={s.rowValue}>{value}</span>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 800,
    margin: '0 auto',
    padding: '16px',
    fontFamily: 'inherit',
    background: '#fff',
    minHeight: '100vh',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    borderBottom: '1px solid #e0e0e0',
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    margin: 0,
  },
  backBtn: {
    background: 'none',
    border: '1px solid #ccc',
    borderRadius: 4,
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: 14,
  },
  toolbar: {
    display: 'flex',
    gap: 8,
    marginBottom: 12,
  },
  createBtn: {
    background: '#1a237e',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
  },
  reloadBtn: {
    background: '#f5f5f5',
    border: '1px solid #ccc',
    borderRadius: 4,
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: 14,
  },
  winnerFileBtn: {
    background: '#4a148c',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
  },
  paymentDashBtn: {
    background: '#004d40',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
  },
  form: {
    background: '#f9f9f9',
    border: '1px solid #e0e0e0',
    borderRadius: 6,
    padding: 16,
    marginBottom: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  formTitle: {
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 4,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 13,
    fontWeight: 600,
    color: '#333',
  },
  input: {
    border: '1px solid #ccc',
    borderRadius: 4,
    padding: '6px 10px',
    fontSize: 14,
    background: '#fff',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  select: {
    border: '1px solid #ccc',
    borderRadius: 4,
    padding: '6px 10px',
    fontSize: 14,
    background: '#fff',
    width: '100%',
  },
  textarea: {
    border: '1px solid #ccc',
    borderRadius: 4,
    padding: '6px 10px',
    fontSize: 14,
    background: '#fff',
    width: '100%',
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
  },
  row: {
    display: 'flex',
    gap: 8,
  },
  submitBtn: {
    background: '#1565c0',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '10px 20px',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    alignSelf: 'flex-start',
  },
  successBanner: {
    background: '#e8f5e9',
    border: '1px solid #a5d6a7',
    borderRadius: 4,
    padding: '8px 12px',
    fontSize: 13,
    color: '#2e7d32',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  errorBanner: {
    background: '#ffebee',
    border: '1px solid #ef9a9a',
    borderRadius: 4,
    padding: '8px 12px',
    fontSize: 13,
    color: '#b71c1c',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dismissBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    color: 'inherit',
  },
  empty: {
    color: '#888',
    fontSize: 14,
    padding: 16,
    textAlign: 'center',
  },
  card: {
    border: '1px solid #e0e0e0',
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
    background: '#fafafa',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  statusBadge: {
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: 1,
  },
  cardId: {
    fontSize: 11,
    color: '#888',
    fontFamily: 'monospace',
  },
  cardDate: {
    fontSize: 11,
    color: '#aaa',
    marginLeft: 'auto',
  },
  cardGrid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px 16px',
    marginBottom: 8,
  },
  rowItem: {
    display: 'flex',
    gap: 4,
    fontSize: 12,
    minWidth: 200,
  },
  rowLabel: {
    color: '#888',
    flexShrink: 0,
  },
  rowValue: {
    color: '#222',
    fontWeight: 500,
    wordBreak: 'break-all' as const,
  },
  actions: {
    borderTop: '1px solid #eee',
    paddingTop: 8,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  actionButtons: {
    display: 'flex',
    gap: 6,
  },
  actionBtn: {
    border: 'none',
    borderRadius: 4,
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    minHeight: 32,
  },
};
