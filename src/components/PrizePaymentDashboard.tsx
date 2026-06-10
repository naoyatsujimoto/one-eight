/**
 * PrizePaymentDashboard.tsx — Read-only Payment Dashboard
 *
 * RP-5a: 支払対象 Award の一覧表示 + 詳細確認（read-only）
 *
 * 禁止:
 *   - Prepare / Paid / Failed / Cancel / Retry ボタン（RP-5b以降）
 *   - PII を一覧に表示しない
 *   - PII を console.log / localStorage / sessionStorage / URL に出さない
 *   - PIIがURLに混入しない（state管理のみ）
 */
import { useEffect, useState } from 'react';
import {
  adminListPayableAwards,
  adminGetPayoutDetail,
  type PayableAwardRow,
  type PayoutDetailResult,
} from '../lib/prizeAdmin';

interface Props {
  onBack: () => void;
}

// ── ユーティリティ ────────────────────────────────────────────────────────

function fmtCents(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function displayLabelStyle(label: string): React.CSSProperties {
  if (label === 'Paid') return { color: '#2e7d32', fontWeight: 700 };
  if (label === 'Prepared') return { color: '#1565c0', fontWeight: 700 };
  if (label === 'Failed') return { color: '#b71c1c', fontWeight: 700 };
  if (label.startsWith('Cannot Pay')) return { color: '#b71c1c', fontWeight: 700 };
  if (label === 'Canceled') return { color: '#757575', fontWeight: 700 };
  if (label === 'On Hold') return { color: '#e65100', fontWeight: 700 };
  if (label === 'Awaiting Archive') return { color: '#e65100' };
  if (label === 'Ready for Prepare') return { color: '#1565c0' };
  return { color: '#555' };
}

// ── コンポーネント: 詳細モーダル ──────────────────────────────────────────

interface DetailModalProps {
  awardId: string;
  onClose: () => void;
}

function PayoutDetailModal({ awardId, onClose }: DetailModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // ⚠️ detail は PII を含む。console.log / localStorage 禁止。
  const [detail, setDetail] = useState<PayoutDetailResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: err } = await adminGetPayoutDetail(awardId);
      if (cancelled) return;
      if (err) {
        setError(err);
      } else {
        // ⚠️ PII を state に持つが、console.log しない
        setDetail(data);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [awardId]);

  return (
    <div style={ds.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={ds.modal}>
        <div style={ds.modalHeader}>
          <span style={ds.modalTitle}>Payout Detail</span>
          <button type="button" style={ds.closeBtn} onClick={onClose}>✕</button>
        </div>

        {loading && <div style={ds.loading}>Loading detail…</div>}
        {error && <div style={ds.errorBanner}>{error}</div>}

        {detail && !loading && (
          <div style={ds.detailBody}>
            {/* Award 情報 */}
            <Section title="Award">
              <DRow label="Award ID"    value={detail.award_id.slice(0, 8) + '…'} />
              <DRow label="Status"      value={detail.award_status} />
              <DRow label="Amount"      value={fmtCents(detail.amount_cents, detail.currency)} />
              <DRow label="Prize Kind"  value={detail.prize_kind ?? '—'} />
              <DRow label="Source"      value={detail.source_kind ?? '—'} />
              {detail.source_arena_event_id && (
                <DRow label="Arena Event" value={detail.source_arena_event_id.slice(0, 8) + '…'} />
              )}
              {detail.source_arena_match_id && (
                <DRow label="Arena Match" value={detail.source_arena_match_id.slice(0, 8) + '…'} />
              )}
            </Section>

            {/* Submission 情報（PIIなし） */}
            <Section title="Submission">
              {detail.latest_submission_id ? (
                <>
                  <DRow label="Sub ID"     value={detail.latest_submission_id.slice(0, 8) + '…'} />
                  <DRow label="Status"     value={detail.latest_submission_status ?? '—'} />
                  <DRow label="Submitted"  value={fmtDate(detail.latest_submission_submitted_at)} />
                  <DRow label="Data Exp."  value={fmtDate(detail.latest_submission_delete_after)} />
                </>
              ) : (
                <div style={ds.noData}>No submission yet.</div>
              )}
            </Section>

            {/* Payout 情報（PIIなし） */}
            <Section title="Payout">
              {detail.latest_payout_id ? (
                <>
                  <DRow label="Payout ID" value={detail.latest_payout_id.slice(0, 8) + '…'} />
                  <DRow label="Status"    value={detail.latest_payout_status ?? '—'} />
                  {detail.latest_payout_paid_at && (
                    <DRow label="Paid At" value={fmtDate(detail.latest_payout_paid_at)} />
                  )}
                </>
              ) : (
                <div style={ds.noData}>No payout record yet.</div>
              )}
            </Section>

            {/* PII セクション — 表示のみ、console.log 禁止 */}
            <Section title="Payment Info (Confidential)">
              {detail.pii_data_source === 'unavailable' ? (
                <div style={ds.errorBanner}>
                  ⚠️ Cannot Pay: payment information unavailable (data may have been cleared before payout was prepared).
                </div>
              ) : (
                <>
                  <DRow label="Legal Name"    value={detail.legal_name ?? '—'} sensitive />
                  <DRow label="PayPal Email"  value={detail.paypal_email ?? '—'} sensitive />
                  <div style={ds.piiNote}>
                    ℹ️ This information is sourced from: <strong>{detail.pii_data_source}</strong>
                  </div>
                </>
              )}
            </Section>

            {/* RP-5b以降の操作ボタンはここに追加予定 */}
            <div style={ds.futureNote}>
              Payout actions (Prepare / Mark Paid / Failed / Cancel) will be available in RP-5b+.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── コンポーネント: メインダッシュボード ─────────────────────────────────

export function PrizePaymentDashboard({ onBack }: Props) {
  const [awards, setAwards] = useState<PayableAwardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [detailAwardId, setDetailAwardId] = useState<string | null>(null);

  async function loadAwards() {
    setLoading(true);
    setListError(null);
    const { data, error } = await adminListPayableAwards();
    if (error) {
      setListError(error);
    } else {
      setAwards(data ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { loadAwards(); }, []);

  return (
    <div style={s.page}>
      {/* ヘッダー */}
      <div style={s.header}>
        <button type="button" style={s.backBtn} onClick={onBack}>← Back</button>
        <h2 style={s.title}>Payment Dashboard</h2>
        <button type="button" style={s.reloadBtn} onClick={loadAwards} disabled={loading}>
          {loading ? 'Loading…' : 'Reload'}
        </button>
      </div>

      <div style={s.subtitle}>
        Read-only. PayPal payment operations are performed manually in PayPal dashboard.
        Payout actions (Prepare / Mark Paid) will be available in RP-5b+.
      </div>

      {listError && (
        <div style={s.errorBanner}>
          {listError}
          <button type="button" style={s.dismissBtn} onClick={() => setListError(null)}>✕</button>
        </div>
      )}

      {!loading && awards.length === 0 && (
        <div style={s.empty}>No payable awards found.</div>
      )}

      {/* Award 一覧 */}
      {awards.map(award => (
        <div key={award.award_id} style={s.card}>
          <div style={s.cardHeader}>
            <span style={{ ...s.labelBadge, ...displayLabelStyle(award.display_label) }}>
              {award.display_label}
            </span>
            <span style={s.cardId}>{award.award_id.slice(0, 8)}…</span>
            <span style={s.cardDate}>{fmtDate(award.created_at)}</span>
          </div>

          <div style={s.cardGrid}>
            <CRow label="Recipient"  value={award.recipient_display_name ?? award.recipient_user_id.slice(0, 8)} />
            <CRow label="Amount"     value={fmtCents(award.amount_cents, award.currency)} />
            <CRow label="Prize Kind" value={award.prize_kind ?? '—'} />
            <CRow label="Source"     value={award.source_kind ?? '—'} />
            {award.latest_submission_status && (
              <CRow label="Submission" value={award.latest_submission_status} />
            )}
            {award.latest_payout_status && (
              <CRow label="Payout" value={award.latest_payout_status} />
            )}
            {award.latest_payout_paid_at && (
              <CRow label="Paid At" value={fmtDate(award.latest_payout_paid_at)} />
            )}
          </div>

          <div style={s.cardActions}>
            <button
              type="button"
              style={s.detailBtn}
              onClick={() => setDetailAwardId(award.award_id)}
            >
              Detail
            </button>
          </div>
        </div>
      ))}

      {/* 詳細モーダル */}
      {detailAwardId && (
        <PayoutDetailModal
          awardId={detailAwardId}
          onClose={() => setDetailAwardId(null)}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={ds.section}>
      <div style={ds.sectionTitle}>{title}</div>
      {children}
    </div>
  );
}

function DRow({ label, value, sensitive }: { label: string; value: string; sensitive?: boolean }) {
  return (
    <div style={ds.dRow}>
      <span style={ds.dLabel}>{label}</span>
      <span style={{ ...ds.dValue, ...(sensitive ? ds.sensitiveValue : {}) }}>{value}</span>
    </div>
  );
}

function CRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.rowItem}>
      <span style={s.rowLabel}>{label}</span>
      <span style={s.rowValue}>{value}</span>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

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
    marginBottom: 8,
    borderBottom: '1px solid #e0e0e0',
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    margin: 0,
    flex: 1,
  },
  backBtn: {
    background: 'none',
    border: '1px solid #ccc',
    borderRadius: 4,
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: 14,
  },
  reloadBtn: {
    background: '#f5f5f5',
    border: '1px solid #ccc',
    borderRadius: 4,
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: 14,
  },
  subtitle: {
    fontSize: 12,
    color: '#888',
    marginBottom: 12,
    padding: '8px 12px',
    background: '#f9f9f9',
    border: '1px solid #e0e0e0',
    borderRadius: 4,
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
  labelBadge: {
    fontSize: 12,
    letterSpacing: 0.5,
  },
  cardId: {
    fontSize: 11,
    color: '#aaa',
    fontFamily: 'monospace',
  },
  cardDate: {
    fontSize: 11,
    color: '#bbb',
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
    minWidth: 180,
  },
  rowLabel: {
    color: '#888',
    flexShrink: 0,
  },
  rowValue: {
    color: '#222',
    fontWeight: 500,
  },
  cardActions: {
    borderTop: '1px solid #eee',
    paddingTop: 8,
    display: 'flex',
    gap: 6,
  },
  detailBtn: {
    background: '#1565c0',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '6px 16px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    minHeight: 32,
  },
};

// Detail Modal Styles
const ds: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: 16,
  },
  modal: {
    background: '#fff',
    borderRadius: 8,
    width: '100%',
    maxWidth: 520,
    maxHeight: '90vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid #e0e0e0',
    flexShrink: 0,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 700,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 18,
    color: '#888',
    padding: '0 4px',
  },
  detailBody: {
    overflowY: 'auto',
    padding: '12px 16px',
    WebkitOverflowScrolling: 'touch',
  },
  loading: {
    padding: 24,
    textAlign: 'center',
    color: '#888',
    fontSize: 14,
  },
  errorBanner: {
    background: '#ffebee',
    border: '1px solid #ef9a9a',
    borderRadius: 4,
    padding: '8px 12px',
    fontSize: 13,
    color: '#b71c1c',
    margin: '12px 16px',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#555',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottom: '1px solid #f0f0f0',
  },
  dRow: {
    display: 'flex',
    gap: 8,
    fontSize: 13,
    marginBottom: 4,
  },
  dLabel: {
    color: '#888',
    flexShrink: 0,
    minWidth: 120,
  },
  dValue: {
    color: '#222',
    fontWeight: 500,
    wordBreak: 'break-all' as const,
  },
  sensitiveValue: {
    color: '#1a237e',
    fontFamily: 'monospace',
    fontSize: 13,
  },
  noData: {
    fontSize: 13,
    color: '#aaa',
  },
  piiNote: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
    fontStyle: 'italic',
  },
  futureNote: {
    background: '#f5f5f5',
    border: '1px solid #e0e0e0',
    borderRadius: 4,
    padding: '8px 12px',
    fontSize: 12,
    color: '#888',
    marginTop: 8,
  },
};
