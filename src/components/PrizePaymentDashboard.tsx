/**
 * PrizePaymentDashboard.tsx — Payment Dashboard
 *
 * RP-5a: 支払対象 Award の一覧表示 + 詳細確認（read-only）
 * RP-5b: Prepare Payout ボタン + 確認モーダル + 成功後 prepared 状態表示
 *
 * 禁止:
 *   - Paid / Failed / Cancel / Retry ボタン（RP-5c以降）
 *   - PayPal API / CSV 生成 / PayPal 送金実行
 *   - PII を一覧に表示しない
 *   - PII を console.log / localStorage / sessionStorage / URL に出さない
 *   - PIIがURLに混入しない（state管理のみ）
 */
import { useEffect, useState } from 'react';
import {
  adminListPayableAwards,
  adminGetPayoutDetail,
  adminPreparePayout,
  type PayableAwardRow,
  type PayoutDetailResult,
  type PreparePayoutResult,
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

// ── Prepare Payout ボタン表示条件 ────────────────────────────────────────
// 以下をすべて満たす場合のみ表示:
// 1. award.status = eligible
// 2. active payout が存在しない (latest_payout_status が prepared/paid でない)
// 3. latest submission が存在する
// 4. detail.legal_name / paypal_email が取得できている
// 5. latest_submission_status が data_cleared ではない
// ※ 最終判定は RPC 側。frontend 条件は UI 補助のみ。
function canShowPrepareButton(detail: PayoutDetailResult): boolean {
  if (detail.award_status !== 'eligible') return false;
  const activePayout = detail.latest_payout_status;
  if (activePayout === 'prepared' || activePayout === 'paid') return false;
  if (!detail.latest_submission_id) return false;
  if (detail.latest_submission_status === 'data_cleared') return false;
  if (!detail.legal_name || !detail.paypal_email) return false;
  if (detail.pii_data_source === 'unavailable') return false;
  return true;
}

// ── コンポーネント: Prepare Payout 確認モーダル ────────────────────────────

interface PrepareConfirmModalProps {
  detail: PayoutDetailResult;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  isPreparing: boolean;
}

function PrepareConfirmModal({ detail, onConfirm, onCancel, isPreparing }: PrepareConfirmModalProps) {
  const [check1, setCheck1] = useState(false);
  const [check2, setCheck2] = useState(false);
  const [check3, setCheck3] = useState(false);
  const allChecked = check1 && check2 && check3;

  return (
    <div style={pm.overlay} onClick={e => { if (e.target === e.currentTarget && !isPreparing) onCancel(); }}>
      <div style={pm.modal}>
        <div style={pm.header}>
          <span style={pm.title}>Prepare Payout — Confirmation</span>
        </div>

        <div style={pm.body}>
          {/* 支払情報サマリー */}
          <div style={pm.infoBox}>
            <InfoRow label="Amount"      value={fmtCents(detail.amount_cents, detail.currency)} />
            <InfoRow label="Currency"    value={detail.currency} />
            {/* ⚠️ PII — 表示専用。console.log 禁止。 */}
            <InfoRow label="PayPal Email" value={detail.paypal_email ?? '—'} sensitive />
            <InfoRow label="Legal Name"   value={detail.legal_name ?? '—'} sensitive />
          </div>

          {/* 重要事項 */}
          <div style={pm.warningBox}>
            <div style={pm.warningTitle}>⚠️ Important</div>
            <ul style={pm.warningList}>
              <li>This operation does <strong>NOT</strong> execute a PayPal transfer.</li>
              <li>After this, the amount, currency, PayPal email, and legal name will be <strong>locked as a snapshot</strong>.</li>
              <li>After preparing, you can print / save the Winner File and delete submission_data from the online DB.</li>
              <li>Proceed to manual payment via the PayPal dashboard.</li>
            </ul>
          </div>

          {/* 必須チェックボックス（3つすべてチェックされるまでボタン disabled） */}
          <div style={pm.checksBox}>
            <label style={pm.checkLabel}>
              <input
                type="checkbox"
                checked={check1}
                onChange={e => setCheck1(e.target.checked)}
                disabled={isPreparing}
                style={pm.checkbox}
              />
              I have double-checked the <strong>PayPal Email</strong>.
            </label>
            <label style={pm.checkLabel}>
              <input
                type="checkbox"
                checked={check2}
                onChange={e => setCheck2(e.target.checked)}
                disabled={isPreparing}
                style={pm.checkbox}
              />
              I have double-checked the <strong>amount</strong> is correct.
            </label>
            <label style={pm.checkLabel}>
              <input
                type="checkbox"
                checked={check3}
                onChange={e => setCheck3(e.target.checked)}
                disabled={isPreparing}
                style={pm.checkbox}
              />
              I have double-checked the <strong>legal name</strong>.
            </label>
          </div>

          {/* アクションボタン */}
          <div style={pm.actions}>
            <button
              type="button"
              style={pm.cancelBtn}
              onClick={onCancel}
              disabled={isPreparing}
            >
              Cancel
            </button>
            <button
              type="button"
              style={{ ...pm.prepareBtn, ...((!allChecked || isPreparing) ? pm.disabledBtn : {}) }}
              onClick={onConfirm}
              disabled={!allChecked || isPreparing}
            >
              {isPreparing ? 'Preparing…' : 'Prepare Payout'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── コンポーネント: Prepared 成功表示 ────────────────────────────────────

interface PreparedSuccessViewProps {
  result: PreparePayoutResult;
  detail: PayoutDetailResult;
}

function PreparedSuccessView({ result, detail }: PreparedSuccessViewProps) {
  return (
    <div style={sv.container}>
      <div style={sv.successBadge}>✅ Prepared Successfully</div>

      <div style={sv.section}>
        <div style={sv.sectionTitle}>Payout Record</div>
        <DRow label="Payout ID"       value={result.payout_id} mono />
        <DRow label="Status"          value={result.status} />
        <DRow label="Payment Method"  value={result.payment_method} />
        <DRow label="Prepared At"     value={fmtDate(result.prepared_at)} />
        <DRow label="Source Sub. ID"
              value={detail.latest_submission_id
                ? detail.latest_submission_id.slice(0, 8) + '…'
                : '—'} />
      </div>

      <div style={sv.section}>
        <div style={sv.sectionTitle}>Snapshot (Locked)</div>
        <DRow label="Amount"        value={fmtCents(detail.amount_cents, detail.currency)} />
        <DRow label="Currency"      value={detail.currency} />
        {/* ⚠️ PII — 表示専用。console.log 禁止。 */}
        <DRow label="PayPal Email"  value={detail.paypal_email ?? '—'} sensitive />
        <DRow label="Legal Name"    value={detail.legal_name ?? '—'} sensitive />
      </div>

      <div style={sv.nextSteps}>
        <div style={sv.nextTitle}>Next Steps</div>
        <ol style={sv.nextList}>
          <li>Print or save the <strong>Winner File</strong> as PDF (offline).</li>
          <li>Archive submission: clear submission_data from online DB.</li>
          <li>Execute manual PayPal payment via PayPal dashboard.</li>
          <li>Mark as Paid (RP-5c, coming later).</li>
        </ol>
      </div>
    </div>
  );
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

  // Prepare Payout UI state
  const [showPrepareModal, setShowPrepareModal] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [prepareResult, setPrepareResult] = useState<PreparePayoutResult | null>(null);

  async function loadDetail(id: string) {
    setLoading(true);
    setError(null);
    const { data, error: err } = await adminGetPayoutDetail(id);
    if (err) {
      setError(err);
    } else {
      // ⚠️ PII を state に持つが、console.log しない
      setDetail(data);
    }
    setLoading(false);
  }

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
        setDetail(data);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [awardId]);

  async function handlePreparePayout() {
    if (!detail) return;
    setIsPreparing(true);
    setPrepareError(null);
    const { data, error: err } = await adminPreparePayout(awardId);
    setIsPreparing(false);
    if (err) {
      setPrepareError(err);
      setShowPrepareModal(false);
    } else if (data) {
      setPrepareResult(data);
      setShowPrepareModal(false);
      // 詳細を再取得して prepared 状態を表示
      await loadDetail(awardId);
    }
  }

  return (
    <div style={ds.overlay} onClick={e => { if (e.target === e.currentTarget && !showPrepareModal && !isPreparing) onClose(); }}>
      <div style={ds.modal}>
        <div style={ds.modalHeader}>
          <span style={ds.modalTitle}>Payout Detail</span>
          <button
            type="button"
            style={ds.closeBtn}
            onClick={onClose}
            disabled={showPrepareModal || isPreparing}
          >
            ✕
          </button>
        </div>

        {loading && <div style={ds.loading}>Loading detail…</div>}
        {error && <div style={ds.errorBanner}>{error}</div>}
        {prepareError && (
          <div style={{ ...ds.errorBanner, margin: '8px 16px' }}>
            ❌ Prepare failed: {prepareError}
          </div>
        )}

        {detail && !loading && (
          <div style={ds.detailBody}>
            {/* Prepare Payout 成功表示 */}
            {prepareResult && (
              <PreparedSuccessView result={prepareResult} detail={detail} />
            )}

            {/* Award 情報 */}
            {!prepareResult && (
              <>
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

                {/* RP-5b: Prepare Payout ボタン */}
                {canShowPrepareButton(detail) && (
                  <div style={ds.actionArea}>
                    <button
                      type="button"
                      style={ds.prepareBtn}
                      onClick={() => {
                        setPrepareError(null);
                        setShowPrepareModal(true);
                      }}
                      disabled={isPreparing}
                    >
                      Prepare Payout
                    </button>
                    <div style={ds.prepareNote}>
                      Snapshots payment info. Does NOT execute PayPal transfer.
                    </div>
                  </div>
                )}

                {/* prepared / paid の場合は操作ボタン非表示（Paid / Failed / Cancel は RP-5c 以降） */}
                {(detail.latest_payout_status === 'prepared' || detail.latest_payout_status === 'paid') && (
                  <div style={ds.futureNote}>
                    Payout is {detail.latest_payout_status}.
                    Mark as Paid / Failed / Cancel will be available in RP-5c+.
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Prepare Payout 確認モーダル（overlay の上に重ねる） */}
      {showPrepareModal && detail && (
        <PrepareConfirmModal
          detail={detail}
          onConfirm={handlePreparePayout}
          onCancel={() => setShowPrepareModal(false)}
          isPreparing={isPreparing}
        />
      )}
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
        PayPal payment is executed manually via PayPal dashboard.
        Use "Prepare Payout" to snapshot payment info before transferring.
        Mark as Paid / Failed / Cancel will be in RP-5c+.
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
          onClose={() => {
            setDetailAwardId(null);
            // モーダルを閉じた後に一覧を再取得（Prepare 完了後の表示更新）
            loadAwards();
          }}
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

function DRow({
  label,
  value,
  sensitive,
  mono,
}: {
  label: string;
  value: string;
  sensitive?: boolean;
  mono?: boolean;
}) {
  return (
    <div style={ds.dRow}>
      <span style={ds.dLabel}>{label}</span>
      <span
        style={{
          ...ds.dValue,
          ...(sensitive ? ds.sensitiveValue : {}),
          ...(mono ? ds.monoValue : {}),
        }}
      >
        {value}
      </span>
    </div>
  );
}

function InfoRow({ label, value, sensitive }: { label: string; value: string; sensitive?: boolean }) {
  return (
    <div style={pm.infoRow}>
      <span style={pm.infoLabel}>{label}</span>
      <span style={{ ...pm.infoValue, ...(sensitive ? pm.sensitiveValue : {}) }}>{value}</span>
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
  monoValue: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#555',
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
  actionArea: {
    marginTop: 16,
    padding: '12px',
    background: '#f0f7ff',
    border: '1px solid #bbdefb',
    borderRadius: 6,
  },
  prepareBtn: {
    background: '#1565c0',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '8px 20px',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
    minHeight: 40,
    width: '100%',
    marginBottom: 6,
  },
  prepareNote: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center' as const,
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

// Prepare Confirm Modal Styles
const pm: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: 16,
  },
  modal: {
    background: '#fff',
    borderRadius: 8,
    width: '100%',
    maxWidth: 480,
    maxHeight: '90vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 12px 48px rgba(0,0,0,0.3)',
  },
  header: {
    padding: '12px 16px',
    borderBottom: '1px solid #e0e0e0',
    background: '#1565c0',
    borderRadius: '8px 8px 0 0',
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
    color: '#fff',
  },
  body: {
    overflowY: 'auto',
    padding: '16px',
    WebkitOverflowScrolling: 'touch',
  },
  infoBox: {
    background: '#f5f5f5',
    border: '1px solid #e0e0e0',
    borderRadius: 6,
    padding: '10px 12px',
    marginBottom: 12,
  },
  infoRow: {
    display: 'flex',
    gap: 8,
    fontSize: 13,
    marginBottom: 4,
  },
  infoLabel: {
    color: '#888',
    flexShrink: 0,
    minWidth: 110,
  },
  infoValue: {
    color: '#222',
    fontWeight: 600,
    wordBreak: 'break-all' as const,
  },
  sensitiveValue: {
    color: '#1a237e',
    fontFamily: 'monospace',
  },
  warningBox: {
    background: '#fff8e1',
    border: '1px solid #ffe082',
    borderRadius: 6,
    padding: '10px 12px',
    marginBottom: 12,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#e65100',
    marginBottom: 6,
  },
  warningList: {
    margin: 0,
    paddingLeft: 20,
    fontSize: 12,
    color: '#555',
    lineHeight: 1.6,
  },
  checksBox: {
    marginBottom: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  checkLabel: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    fontSize: 13,
    color: '#333',
    cursor: 'pointer',
    lineHeight: 1.5,
  },
  checkbox: {
    flexShrink: 0,
    marginTop: 2,
    width: 16,
    height: 16,
    cursor: 'pointer',
  },
  actions: {
    display: 'flex',
    gap: 8,
  },
  cancelBtn: {
    flex: 1,
    background: '#f5f5f5',
    border: '1px solid #ccc',
    borderRadius: 4,
    padding: '10px',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    minHeight: 44,
  },
  prepareBtn: {
    flex: 2,
    background: '#1565c0',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '10px',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
    minHeight: 44,
  },
  disabledBtn: {
    background: '#bdbdbd',
    cursor: 'not-allowed',
    opacity: 0.7,
  },
};

// Success View Styles
const sv: Record<string, React.CSSProperties> = {
  container: {
    padding: '4px 0',
  },
  successBadge: {
    background: '#e8f5e9',
    border: '1px solid #a5d6a7',
    borderRadius: 6,
    padding: '10px 14px',
    fontSize: 15,
    fontWeight: 700,
    color: '#2e7d32',
    marginBottom: 16,
    textAlign: 'center' as const,
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
  nextSteps: {
    background: '#e3f2fd',
    border: '1px solid #90caf9',
    borderRadius: 6,
    padding: '10px 12px',
    marginTop: 8,
  },
  nextTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#1565c0',
    marginBottom: 8,
  },
  nextList: {
    margin: 0,
    paddingLeft: 20,
    fontSize: 12,
    color: '#555',
    lineHeight: 1.7,
  },
};
