/**
 * PrizePaymentDashboard.tsx - Payment Dashboard
 *
 * RP-5a: 支払対象 Award の一覧表示 + 詳細確認(read-only)
 * RP-5b: Prepare Payout ボタン + 確認モーダル + 成功後 prepared 状態表示
 * RP-5c: Mark as Paid ボタン + モーダル / Mark as Failed ボタン + モーダル
 * RP-5d: Cancel Payout ボタン + モーダル / Retry Payout ボタン + モーダル / Retry chain 表示
 *
 * 禁止:
 *   - PayPal API / CSV 生成 / PayPal 送金実行
 *   - PII を一覧に表示しない
 *   - PII を console.log / localStorage / sessionStorage / URL に出さない
 *   - PIIがURLに混入しない(state管理のみ)
 *   - paid payout の cancel / retry
 *   - canceled → prepared / failed → prepared の直接 UPDATE
 *   - source payout の変更
 */
import { useEffect, useState } from 'react';
import {
  adminListPayableAwards,
  adminGetPayoutDetail,
  adminPreparePayout,
  adminMarkPayoutPaid,
  adminMarkPayoutFailed,
  adminCancelPayout,
  adminRetryPayout,
  type PayableAwardRow,
  type PayoutDetailResult,
  type PreparePayoutResult,
  type MarkPayoutPaidResult,
  type MarkPayoutFailedResult,
  type CancelPayoutResult,
  type RetryPayoutResult,
} from '../lib/prizeAdmin';
import { supabase } from '../lib/supabase';

interface Props {
  onBack: () => void;
}

// ── ユーティリティ ────────────────────────────────────────────────────────

function fmtCents(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '-';
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

// ── Mark as Paid ボタン表示条件 ───────────────────────────────────────
// prepared 履歴の payout がある場合にのみ表示
function canShowMarkAsPaidButton(detail: PayoutDetailResult): boolean {
  return detail.latest_payout_status === 'prepared';
}

// ── Mark as Failed ボタン表示条件 ──────────────────────────────────────
function canShowMarkAsFailedButton(detail: PayoutDetailResult): boolean {
  return detail.latest_payout_status === 'prepared';
}

// ── Cancel ボタン表示条件 ─────────────────────────────────────────────
// prepared 状態のみ表示
function canShowCancelButton(detail: PayoutDetailResult): boolean {
  return detail.latest_payout_status === 'prepared';
}

// ── Retry ボタン表示条件 ──────────────────────────────────────────────
// failed / canceled 状態 + award.status=eligible + snapshotあり + paypal_manual
function canShowRetryButton(
  detail: PayoutDetailResult,
  retryAllowed: RetryAllowedInfo | null,
): boolean {
  if (!['failed', 'canceled'].includes(detail.latest_payout_status ?? '')) return false;
  if (detail.award_status !== 'eligible') return false;
  if (retryAllowed?.snapshot_redacted) return false;
  if (!retryAllowed?.can_retry) return false;
  return true;
}

// ── Retry 可否情報型 ──────────────────────────────────────────────────
interface RetryAllowedInfo {
  can_retry: boolean;
  snapshot_redacted: boolean;
  has_active_payout: boolean;
  chain_depth: number;
  block_reason: string | null;
}

// ── Payout chain row 型 ───────────────────────────────────────────────
interface PayoutChainRow {
  id: string;
  status: string;
  retry_source_payout_id: string | null;
  created_at: string;
  paid_at: string | null;
  failed_at: string | null;
  canceled_at: string | null;
  amount_cents_snapshot: number;
  currency_snapshot: string;
  payment_method: string;
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

// ── コンポーネント: Cancel Payout 確認モーダル ─────────────────────────────

interface CancelPayoutModalProps {
  detail: PayoutDetailResult;
  payoutId: string;
  preparedAt: string | null;
  onConfirm: (cancelReason: string, adminNote: string | null) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  submitError: string | null;
}

function CancelPayoutModal({
  detail,
  payoutId,
  preparedAt,
  onConfirm,
  onCancel,
  isSubmitting,
  submitError,
}: CancelPayoutModalProps) {
  const [cancelReason, setCancelReason] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [check1, setCheck1] = useState(false);
  const [check2, setCheck2] = useState(false);
  const [check3, setCheck3] = useState(false);

  const cleanReason = cancelReason.trim();
  const reasonValid = cleanReason.length >= 3 && cleanReason.length <= 500;
  const allChecked = check1 && check2 && check3;
  const canConfirm = allChecked && reasonValid && !isSubmitting;

  return (
    <div style={pm.overlay}>
      <div style={{ ...pm.modal, maxWidth: 500 }}>
        <div style={{ ...pm.header, background: '#37474f' }}>
          <span style={pm.title}>Cancel Payout - Confirmation</span>
        </div>

        <div style={{ ...pm.body, maxHeight: '80vh', overflowY: 'auto' }}>
          {/* payout 情報サマリー */}
          <div style={pm.infoBox}>
            <InfoRow label="Payout ID"    value={payoutId.slice(0, 8) + '...'} />
            <InfoRow label="Award ID"     value={detail.award_id.slice(0, 8) + '...'} />
            <InfoRow label="Amount"       value={fmtCents(detail.amount_cents, detail.currency)} />
            {/* ⚠️ PII - 表示専用。console.log 禁止。 */}
            <InfoRow label="PayPal Email" value={detail.paypal_email ?? '-'} sensitive />
            <InfoRow label="Legal Name"   value={detail.legal_name  ?? '-'} sensitive />
            {preparedAt && <InfoRow label="Prepared At" value={fmtDate(preparedAt)} />}
          </div>

          {/* 警告 */}
          <div style={pm.warningBox}>
            <div style={pm.warningTitle}>⚠️ Important</div>
            <ul style={pm.warningList}>
              <li>This operation does <strong>NOT</strong> reverse a PayPal transfer.</li>
              <li>After cancel, this payout row is <strong>permanently terminal</strong>. It cannot be reused.</li>
              <li>To retry payment, use <strong>Retry Payout</strong> to create a new prepared payout.</li>
            </ul>
          </div>

          {/* 入力フォーム */}
          <div style={mp.formSection}>
            <label style={mp.label}>
              Cancel Reason <span style={mp.required}>*</span>
              <span style={mp.hint}> (3-500 chars. No PII.)</span>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                disabled={isSubmitting}
                maxLength={500}
                rows={3}
                style={{
                  ...mp.textarea,
                  ...(cancelReason.trim() !== '' && !reasonValid ? mp.textareaError : {}),
                }}
                placeholder="e.g. PayPal payment was not executed. Creating a new payout. No PII."
              />
              <span style={{ fontSize: 11, color: '#888' }}>
                {cleanReason.length} / 500 chars
                {cleanReason.length > 0 && cleanReason.length < 3 && (
                  <span style={{ color: '#b71c1c' }}> (min 3)</span>
                )}
              </span>
            </label>

            <label style={mp.label}>
              Admin Note <span style={mp.hint}>(max 1000 chars. No PII.)</span>
              <textarea
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                disabled={isSubmitting}
                maxLength={1000}
                rows={2}
                style={mp.textarea}
                placeholder="Internal note. Do not include PII."
              />
            </label>
          </div>

          {/* 必須チェックボックス(3つ全て) */}
          <div style={pm.checksBox}>
            <label style={pm.checkLabel}>
              <input type="checkbox" checked={check1} onChange={e => setCheck1(e.target.checked)} disabled={isSubmitting} style={pm.checkbox} />
              PayPalでまだ支払を実行していないことを確認した
            </label>
            <label style={pm.checkLabel}>
              <input type="checkbox" checked={check2} onChange={e => setCheck2(e.target.checked)} disabled={isSubmitting} style={pm.checkbox} />
              このpayout rowはcanceledとなり再利用できないことを理解した
            </label>
            <label style={pm.checkLabel}>
              <input type="checkbox" checked={check3} onChange={e => setCheck3(e.target.checked)} disabled={isSubmitting} style={pm.checkbox} />
              必要ならRetryで新しいprepared payoutを作ることを理解した
            </label>
          </div>

          {submitError && (
            <div style={{ ...ds.errorBanner, marginBottom: 8 }}>
              ❌ {submitError}
            </div>
          )}

          <div style={pm.actions}>
            <button type="button" style={pm.cancelBtn} onClick={onCancel} disabled={isSubmitting}>
              Back
            </button>
            <button
              type="button"
              style={{
                ...cr.confirmCancelBtn,
                ...(!canConfirm ? pm.disabledBtn : {}),
              }}
              onClick={() => {
                if (canConfirm) {
                  onConfirm(
                    cleanReason,
                    adminNote.trim() !== '' ? adminNote.trim() : null,
                  );
                }
              }}
              disabled={!canConfirm}
            >
              {isSubmitting ? 'Canceling...' : 'Confirm Cancel'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── コンポーネント: Retry Payout 確認モーダル ────────────────────────────────

interface RetryPayoutModalProps {
  detail: PayoutDetailResult;
  sourcePayoutId: string;
  sourceStatus: string;
  retryAllowed: RetryAllowedInfo;
  onConfirm: (retryReason: string, adminNote: string | null) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  submitError: string | null;
}

function RetryPayoutModal({
  detail,
  sourcePayoutId,
  sourceStatus,
  retryAllowed,
  onConfirm,
  onCancel,
  isSubmitting,
  submitError,
}: RetryPayoutModalProps) {
  const [retryReason, setRetryReason] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [check1, setCheck1] = useState(false);
  const [check2, setCheck2] = useState(false);
  const [check3, setCheck3] = useState(false);

  const cleanReason = retryReason.trim();
  const reasonValid = cleanReason.length >= 3 && cleanReason.length <= 500;
  const allChecked = check1 && check2 && check3;
  const canConfirm = allChecked && reasonValid && !isSubmitting;

  return (
    <div style={pm.overlay}>
      <div style={{ ...pm.modal, maxWidth: 520 }}>
        <div style={{ ...pm.header, background: '#4a148c' }}>
          <span style={pm.title}>Retry Payout - Confirmation</span>
        </div>

        <div style={{ ...pm.body, maxHeight: '80vh', overflowY: 'auto' }}>
          {/* source payout 情報 */}
          <div style={pm.infoBox}>
            <InfoRow label="Source Payout ID" value={sourcePayoutId.slice(0, 8) + '...'} />
            <InfoRow label="Source Status"    value={sourceStatus} />
            <InfoRow label="Award ID"         value={detail.award_id.slice(0, 8) + '...'} />
            <InfoRow label="Amount"           value={fmtCents(detail.amount_cents, detail.currency)} />
            {/* ⚠️ PII - 表示専用。console.log 禁止。 */}
            <InfoRow label="PayPal Email"     value={detail.paypal_email ?? '-'} sensitive />
            <InfoRow label="Legal Name"       value={detail.legal_name  ?? '-'} sensitive />
            <InfoRow label="Payment Method"   value="paypal_manual" />
            {detail.latest_submission_id && (
              <InfoRow label="Source Sub. ID" value={detail.latest_submission_id.slice(0, 8) + '...'} />
            )}
            <InfoRow label="Chain Depth"      value={String(retryAllowed.chain_depth)} />
          </div>

          {/* 重要事項 */}
          <div style={pm.warningBox}>
            <div style={pm.warningTitle}>⚠️ Important</div>
            <ul style={pm.warningList}>
              <li>Snapshot (email, name, amount) is <strong>copied from the source payout</strong>. No re-fetch from submission.</li>
              <li>The source payout row is <strong>NOT modified</strong>.</li>
              <li>A <strong>new prepared payout</strong> will be created with the same snapshot.</li>
              <li>This does <strong>NOT</strong> execute a PayPal transfer.</li>
            </ul>
          </div>

          {/* 入力フォーム */}
          <div style={mp.formSection}>
            <label style={mp.label}>
              Retry Reason <span style={mp.required}>*</span>
              <span style={mp.hint}> (3-500 chars. No PII.)</span>
              <textarea
                value={retryReason}
                onChange={e => setRetryReason(e.target.value)}
                disabled={isSubmitting}
                maxLength={500}
                rows={3}
                style={{
                  ...mp.textarea,
                  ...(retryReason.trim() !== '' && !reasonValid ? mp.textareaError : {}),
                }}
                placeholder="e.g. Retrying after network error. No PII."
              />
              <span style={{ fontSize: 11, color: '#888' }}>
                {cleanReason.length} / 500 chars
                {cleanReason.length > 0 && cleanReason.length < 3 && (
                  <span style={{ color: '#b71c1c' }}> (min 3)</span>
                )}
              </span>
            </label>

            <label style={mp.label}>
              Admin Note <span style={mp.hint}>(max 1000 chars. No PII.)</span>
              <textarea
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                disabled={isSubmitting}
                maxLength={1000}
                rows={2}
                style={mp.textarea}
                placeholder="Internal note. Do not include PII."
              />
            </label>
          </div>

          {/* 必須チェックボックス(3つ全て) */}
          <div style={pm.checksBox}>
            <label style={pm.checkLabel}>
              <input type="checkbox" checked={check1} onChange={e => setCheck1(e.target.checked)} disabled={isSubmitting} style={pm.checkbox} />
              同じsnapshotで再試行することを確認した
            </label>
            <label style={pm.checkLabel}>
              <input type="checkbox" checked={check2} onChange={e => setCheck2(e.target.checked)} disabled={isSubmitting} style={pm.checkbox} />
              PayPal Email / 法定氏名 / 金額を二重確認した
            </label>
            <label style={pm.checkLabel}>
              <input type="checkbox" checked={check3} onChange={e => setCheck3(e.target.checked)} disabled={isSubmitting} style={pm.checkbox} />
              元のpayoutは変更せず、新しいprepared payoutを作ることを理解した
            </label>
          </div>

          {submitError && (
            <div style={{ ...ds.errorBanner, marginBottom: 8 }}>
              ❌ {submitError}
            </div>
          )}

          <div style={pm.actions}>
            <button type="button" style={pm.cancelBtn} onClick={onCancel} disabled={isSubmitting}>
              Back
            </button>
            <button
              type="button"
              style={{
                ...cr.confirmRetryBtn,
                ...(!canConfirm ? pm.disabledBtn : {}),
              }}
              onClick={() => {
                if (canConfirm) {
                  onConfirm(
                    cleanReason,
                    adminNote.trim() !== '' ? adminNote.trim() : null,
                  );
                }
              }}
              disabled={!canConfirm}
            >
              {isSubmitting ? 'Retrying...' : 'Confirm Retry'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── コンポーネント: Retry chain 表示 ─────────────────────────────────────

function RetryChainView({ awardId }: { awardId: string }) {
  const [rows, setRows] = useState<PayoutChainRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // prize_payouts を award_id でクエリ(PII非返却列のみ)
      const { data, error: err } = await supabase
        .from('prize_payouts')
        .select('id, status, retry_source_payout_id, created_at, paid_at, failed_at, canceled_at, amount_cents_snapshot, currency_snapshot, payment_method')
        .eq('award_id', awardId)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (err) {
        setError(err.message);
      } else {
        setRows((data ?? []) as PayoutChainRow[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [awardId]);

  if (loading) return <div style={{ fontSize: 12, color: '#888', padding: '4px 0' }}>Loading payout chain...</div>;
  if (error) return <div style={{ fontSize: 12, color: '#b71c1c' }}>⚠ {error}</div>;
  if (rows.length === 0) return <div style={{ fontSize: 12, color: '#aaa' }}>No payout history.</div>;

  function statusColor(st: string): string {
    if (st === 'paid') return '#2e7d32';
    if (st === 'failed') return '#b71c1c';
    if (st === 'canceled') return '#757575';
    if (st === 'prepared') return '#1565c0';
    return '#333';
  }

  return (
    <div style={cr.chainContainer}>
      {rows.map((row, idx) => (
        <div key={row.id} style={cr.chainRow}>
          <div style={cr.chainIndex}>#{idx + 1}</div>
          <div style={cr.chainBody}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' as const }}>
              <span style={{ ...cr.chainStatus, color: statusColor(row.status) }}>
                {row.status.toUpperCase()}
              </span>
              <span style={cr.chainMono}>{row.id.slice(0, 8)}...</span>
              <span style={cr.chainAmt}>{fmtCents(row.amount_cents_snapshot, row.currency_snapshot)}</span>
              <span style={cr.chainMethod}>{row.payment_method}</span>
            </div>
            <div style={cr.chainDates}>
              <span>Created: {fmtDate(row.created_at)}</span>
              {row.paid_at && <span> · Paid: {fmtDate(row.paid_at)}</span>}
              {row.failed_at && <span> · Failed: {fmtDate(row.failed_at)}</span>}
              {row.canceled_at && <span> · Canceled: {fmtDate(row.canceled_at)}</span>}
            </div>
            {row.retry_source_payout_id && (
              <div style={cr.chainRetryRef}>
                ↩ Retry of: {row.retry_source_payout_id.slice(0, 8)}...
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
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
          <span style={pm.title}>Prepare Payout - Confirmation</span>
        </div>

        <div style={pm.body}>
          {/* 支払情報サマリー */}
          <div style={pm.infoBox}>
            <InfoRow label="Amount"      value={fmtCents(detail.amount_cents, detail.currency)} />
            <InfoRow label="Currency"    value={detail.currency} />
            {/* ⚠️ PII - 表示専用。console.log 禁止。 */}
            <InfoRow label="PayPal Email" value={detail.paypal_email ?? '-'} sensitive />
            <InfoRow label="Legal Name"   value={detail.legal_name ?? '-'} sensitive />
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

          {/* 必須チェックボックス(3つすべてチェックされるまでボタン disabled) */}
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
              {isPreparing ? 'Preparing...' : 'Prepare Payout'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── コンポーネント: Mark as Paid 確認モーダル ───────────────────────────────

interface MarkAsPaidModalProps {
  detail: PayoutDetailResult;
  /** 詳細画面から取得した payout_id */
  payoutId: string;
  /** 詳細画面から取得した prepared_at */
  preparedAt: string | null;
  onConfirm: (params: {
    paypalPayoutId: string;
    paidAt: string;
    grossAmountCents: number | null;
    feeAmountCents: number | null;
    netAmountCents: number | null;
    exchangeRate: number | null;
    exchangeCurrency: string | null;
    adminNote: string | null;
  }) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  submitError: string | null;
}

function MarkAsPaidModal({
  detail,
  payoutId,
  preparedAt,
  onConfirm,
  onCancel,
  isSubmitting,
  submitError,
}: MarkAsPaidModalProps) {
  // 入力値
  const [paypalPayoutId, setPaypalPayoutId] = useState('');
  const [paidAt, setPaidAt] = useState(() => {
    // 初期値: 現在時刻 (datetime-local形式)
    const now = new Date();
    now.setSeconds(0, 0);
    return now.toISOString().slice(0, 16);
  });
  const [grossInput, setGrossInput] = useState('');
  const [feeInput, setFeeInput] = useState('');
  const [netInput, setNetInput] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [exchangeCurrency, setExchangeCurrency] = useState('');
  const [adminNote, setAdminNote] = useState('');

  // 必須チェックボックス
  const [check1, setCheck1] = useState(false);
  const [check2, setCheck2] = useState(false);
  const [check3, setCheck3] = useState(false);
  const [check4, setCheck4] = useState(false);

  // 入力解析
  const grossCents = grossInput !== '' ? Math.round(parseFloat(grossInput) * 100) : null;
  const feeCents   = feeInput   !== '' ? Math.round(parseFloat(feeInput)   * 100) : null;
  const netCents   = netInput   !== '' ? Math.round(parseFloat(netInput)   * 100) : null;
  const exRate     = exchangeRate !== '' ? parseFloat(exchangeRate) : null;
  const exCurrency = exchangeCurrency.trim() !== '' ? exchangeCurrency.trim().toUpperCase() : null;

  // balance check (gross / fee / net が揁っている場合)
  const hasAllAmounts = grossCents !== null && feeCents !== null && netCents !== null;
  const balanceOk = hasAllAmounts ? Math.abs(grossCents - (feeCents + netCents)) <= 1 : true;

  // gross vs snapshot 一致確認
  const snapshotCents = detail.amount_cents;
  const grossMatchesSnapshot = grossCents !== null
    ? Math.abs(grossCents - snapshotCents) <= 1
    : true;

  // prepared_at かぉ24h超過警告
  const preparedDate = preparedAt ? new Date(preparedAt) : null;
  const hoursElapsed = preparedDate
    ? (Date.now() - preparedDate.getTime()) / 3600000
    : 0;
  const showStalePreparedWarning = hoursElapsed > 24;

  // exchange rate/currency ペアチェック
  const exchangePairValid = (exRate === null) === (exCurrency === null);

  // Confirm ボタン enabled 条件
  const allChecked = check1 && check2 && check3 && check4;
  const canConfirm =
    allChecked &&
    paypalPayoutId.trim() !== '' &&
    paidAt !== '' &&
    balanceOk &&
    grossMatchesSnapshot &&
    exchangePairValid &&
    !isSubmitting;

  function handleConfirm() {
    if (!canConfirm) return;
    onConfirm({
      paypalPayoutId: paypalPayoutId.trim(),
      paidAt: new Date(paidAt).toISOString(),
      grossAmountCents: grossCents,
      feeAmountCents: feeCents,
      netAmountCents: netCents,
      exchangeRate: exRate,
      exchangeCurrency: exCurrency,
      adminNote: adminNote.trim() !== '' ? adminNote.trim() : null,
    });
  }

  return (
    <div style={pm.overlay}>
      <div style={{ ...pm.modal, maxWidth: 560 }}>
        <div style={{ ...pm.header, background: '#1b5e20' }}>
          <span style={pm.title}>Mark as Paid - Confirmation</span>
        </div>

        <div style={{ ...pm.body, maxHeight: '80vh', overflowY: 'auto' }}>
          {/* 警告: prepared_atかぉ24h超過 */}
          {showStalePreparedWarning && (
            <div style={mp.warningStale}>
              ⚠️ This payout was prepared more than 24 hours ago. Please verify the payment details carefully.
            </div>
          )}

          {/* payout 情報サマリー */}
          <div style={pm.infoBox}>
            <InfoRow label="Payout ID"    value={payoutId.slice(0, 8) + '...'} />
            <InfoRow label="Award ID"     value={detail.award_id.slice(0, 8) + '...'} />
            <InfoRow label="Amount"       value={fmtCents(detail.amount_cents, detail.currency)} />
            <InfoRow label="Currency"     value={detail.currency} />
            {/* ⚠️ PII - 表示専用。console.log 禁止。 */}
            <InfoRow label="PayPal Email" value={detail.paypal_email ?? '-'} sensitive />
            <InfoRow label="Legal Name"   value={detail.legal_name  ?? '-'} sensitive />
            <InfoRow label="Method"       value={'paypal_manual'} />
            {preparedAt && <InfoRow label="Prepared At" value={fmtDate(preparedAt)} />}
          </div>

          {/* 入力フォーム */}
          <div style={mp.formSection}>
            {/* PayPal Transaction ID */}
            <label style={mp.label}>
              PayPal Transaction ID <span style={mp.required}>*</span>
              <input
                type="text"
                value={paypalPayoutId}
                onChange={e => setPaypalPayoutId(e.target.value)}
                disabled={isSubmitting}
                placeholder="e.g. 1AB23456CD789012E"
                style={mp.input}
              />
            </label>

            {/* paid_at */}
            <label style={mp.label}>
              Paid At <span style={mp.required}>*</span>
              <input
                type="datetime-local"
                value={paidAt}
                onChange={e => setPaidAt(e.target.value)}
                disabled={isSubmitting}
                style={mp.input}
              />
            </label>

            {/* gross */}
            <label style={mp.label}>
              Gross Amount ({detail.currency})
              <span style={mp.hint}> (推奨入力)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={grossInput}
                onChange={e => setGrossInput(e.target.value)}
                disabled={isSubmitting}
                placeholder={`${(snapshotCents / 100).toFixed(2)}`}
                style={{
                  ...mp.input,
                  ...(grossCents !== null && !grossMatchesSnapshot ? mp.inputError : {}),
                }}
              />
              {grossCents !== null && (
                <span style={{
                  fontSize: 11,
                  color: grossMatchesSnapshot ? '#2e7d32' : '#b71c1c',
                  marginTop: 2,
                }}>
                  {grossMatchesSnapshot
                    ? `✓ Matches snapshot (${(snapshotCents / 100).toFixed(2)})`
                    : `⚠ Snapshot is ${(snapshotCents / 100).toFixed(2)}, diff = ${((grossCents - snapshotCents) / 100).toFixed(2)}`
                  }
                </span>
              )}
            </label>

            {/* fee */}
            <label style={mp.label}>
              Fee Amount ({detail.currency})
              <input
                type="number"
                min="0"
                step="0.01"
                value={feeInput}
                onChange={e => setFeeInput(e.target.value)}
                disabled={isSubmitting}
                style={mp.input}
              />
            </label>

            {/* net */}
            <label style={mp.label}>
              Net Amount ({detail.currency})
              <input
                type="number"
                min="0"
                step="0.01"
                value={netInput}
                onChange={e => setNetInput(e.target.value)}
                disabled={isSubmitting}
                style={mp.input}
              />
            </label>

            {/* balance check */}
            {hasAllAmounts && (
              <div style={{
                fontSize: 12,
                padding: '6px 10px',
                borderRadius: 4,
                background: balanceOk ? '#e8f5e9' : '#ffebee',
                color: balanceOk ? '#2e7d32' : '#b71c1c',
                marginBottom: 8,
              }}>
                {balanceOk
                  ? `✓ Balance OK: ${(grossCents! / 100).toFixed(2)} = ${(feeCents! / 100).toFixed(2)} + ${(netCents! / 100).toFixed(2)}`
                  : `⚠ Balance mismatch: gross(${(grossCents! / 100).toFixed(2)}) ≠ fee(${(feeCents! / 100).toFixed(2)}) + net(${(netCents! / 100).toFixed(2)})`
                }
              </div>
            )}

            {/* exchange rate / currency */}
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ ...mp.label, flex: 2 }}>
                Exchange Rate
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={exchangeRate}
                  onChange={e => setExchangeRate(e.target.value)}
                  disabled={isSubmitting}
                  style={mp.input}
                />
              </label>
              <label style={{ ...mp.label, flex: 1 }}>
                Currency (3 chars)
                <input
                  type="text"
                  maxLength={3}
                  value={exchangeCurrency}
                  onChange={e => setExchangeCurrency(e.target.value.toUpperCase())}
                  disabled={isSubmitting}
                  placeholder="USD"
                  style={mp.input}
                />
              </label>
            </div>
            {!exchangePairValid && (
              <div style={{ fontSize: 11, color: '#b71c1c', marginBottom: 6 }}>
                ⚠ exchange_rate and exchange_currency must both be set or both empty.
              </div>
            )}

            {/* admin_note */}
            <label style={mp.label}>
              Admin Note <span style={mp.hint}>(max 1000 chars. No PII.)</span>
              <textarea
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                disabled={isSubmitting}
                maxLength={1000}
                rows={3}
                style={mp.textarea}
                placeholder="Internal note. Do not include PII."
              />
            </label>
          </div>

          {/* 必須チェックボックス */}
          <div style={pm.checksBox}>
            <label style={pm.checkLabel}>
              <input type="checkbox" checked={check1} onChange={e => setCheck1(e.target.checked)} disabled={isSubmitting} style={pm.checkbox} />
              PayPal管理画面で支払が完了したことを確認した
            </label>
            <label style={pm.checkLabel}>
              <input type="checkbox" checked={check2} onChange={e => setCheck2(e.target.checked)} disabled={isSubmitting} style={pm.checkbox} />
              PayPal Transaction IDを二重確認した
            </label>
            <label style={pm.checkLabel}>
              <input type="checkbox" checked={check3} onChange={e => setCheck3(e.target.checked)} disabled={isSubmitting} style={pm.checkbox} />
              金額・通貨がsnapshotと一致することを確認した
            </label>
            <label style={pm.checkLabel}>
              <input type="checkbox" checked={check4} onChange={e => setCheck4(e.target.checked)} disabled={isSubmitting} style={pm.checkbox} />
              PayPal Emailがsnapshotと一致することを確認した
            </label>
          </div>

          {/* エラー表示 */}
          {submitError && (
            <div style={{ ...ds.errorBanner, marginBottom: 8 }}>
              ❌ {submitError}
            </div>
          )}

          {/* アクションボタン */}
          <div style={pm.actions}>
            <button type="button" style={pm.cancelBtn} onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </button>
            <button
              type="button"
              style={{
                ...mp.confirmPaidBtn,
                ...(!canConfirm ? pm.disabledBtn : {}),
              }}
              onClick={handleConfirm}
              disabled={!canConfirm}
            >
              {isSubmitting ? 'Processing...' : 'Confirm Paid'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── コンポーネント: Mark as Failed 確認モーダル ──────────────────────────

interface MarkAsFailedModalProps {
  payoutId: string;
  detail: PayoutDetailResult;
  onConfirm: (failureReason: string, adminNote: string | null) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  submitError: string | null;
}

function MarkAsFailedModal({
  payoutId,
  detail,
  onConfirm,
  onCancel,
  isSubmitting,
  submitError,
}: MarkAsFailedModalProps) {
  const [failureReason, setFailureReason] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [check1, setCheck1] = useState(false);
  const [check2, setCheck2] = useState(false);
  const [check3, setCheck3] = useState(false);

  const cleanReason = failureReason.trim();
  const reasonValid = cleanReason.length >= 3 && cleanReason.length <= 500;
  const allChecked = check1 && check2 && check3;
  const canConfirm = allChecked && reasonValid && !isSubmitting;

  return (
    <div style={pm.overlay}>
      <div style={{ ...pm.modal, maxWidth: 500 }}>
        <div style={{ ...pm.header, background: '#b71c1c' }}>
          <span style={pm.title}>Mark as Failed - Confirmation</span>
        </div>

        <div style={{ ...pm.body, maxHeight: '80vh', overflowY: 'auto' }}>
          <div style={pm.infoBox}>
            <InfoRow label="Payout ID" value={payoutId.slice(0, 8) + '...'} />
            <InfoRow label="Award ID"  value={detail.award_id.slice(0, 8) + '...'} />
            <InfoRow label="Amount"    value={fmtCents(detail.amount_cents, detail.currency)} />
          </div>

          <div style={mp.formSection}>
            <label style={mp.label}>
              Failure Reason <span style={mp.required}>*</span>
              <span style={mp.hint}> (3-500 chars. No PII.)</span>
              <textarea
                value={failureReason}
                onChange={e => setFailureReason(e.target.value)}
                disabled={isSubmitting}
                maxLength={500}
                rows={4}
                style={{
                  ...mp.textarea,
                  ...(failureReason.trim() !== '' && !reasonValid ? mp.textareaError : {}),
                }}
                placeholder="e.g. PayPal payment was rejected by recipient. No PII."
              />
              <span style={{ fontSize: 11, color: '#888' }}>
                {cleanReason.length} / 500 chars
                {cleanReason.length > 0 && cleanReason.length < 3 && (
                  <span style={{ color: '#b71c1c' }}> (min 3)</span>
                )}
              </span>
            </label>

            <label style={mp.label}>
              Admin Note <span style={mp.hint}>(max 1000 chars. No PII.)</span>
              <textarea
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                disabled={isSubmitting}
                maxLength={1000}
                rows={2}
                style={mp.textarea}
                placeholder="Internal note. Do not include PII."
              />
            </label>
          </div>

          <div style={pm.checksBox}>
            <label style={pm.checkLabel}>
              <input type="checkbox" checked={check1} onChange={e => setCheck1(e.target.checked)} disabled={isSubmitting} style={pm.checkbox} />
              PayPal側で支払が失敗または未完了であることを確認した
            </label>
            <label style={pm.checkLabel}>
              <input type="checkbox" checked={check2} onChange={e => setCheck2(e.target.checked)} disabled={isSubmitting} style={pm.checkbox} />
              failed後はこのpayout rowを再利用できないことを理解した
            </label>
            <label style={pm.checkLabel}>
              <input type="checkbox" checked={check3} onChange={e => setCheck3(e.target.checked)} disabled={isSubmitting} style={pm.checkbox} />
              retryは後RP-5dで新規payout rowを作ることを理解した
            </label>
          </div>

          {submitError && (
            <div style={{ ...ds.errorBanner, marginBottom: 8 }}>
              ❌ {submitError}
            </div>
          )}

          <div style={pm.actions}>
            <button type="button" style={pm.cancelBtn} onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </button>
            <button
              type="button"
              style={{
                ...mp.confirmFailedBtn,
                ...(!canConfirm ? pm.disabledBtn : {}),
              }}
              onClick={() => {
                if (canConfirm) {
                  onConfirm(
                    cleanReason,
                    adminNote.trim() !== '' ? adminNote.trim() : null,
                  );
                }
              }}
              disabled={!canConfirm}
            >
              {isSubmitting ? 'Processing...' : 'Confirm Failed'}
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
                ? detail.latest_submission_id.slice(0, 8) + '...'
                : '-'} />
      </div>

      <div style={sv.section}>
        <div style={sv.sectionTitle}>Snapshot (Locked)</div>
        <DRow label="Amount"        value={fmtCents(detail.amount_cents, detail.currency)} />
        <DRow label="Currency"      value={detail.currency} />
        {/* ⚠️ PII - 表示専用。console.log 禁止。 */}
        <DRow label="PayPal Email"  value={detail.paypal_email ?? '-'} sensitive />
        <DRow label="Legal Name"    value={detail.legal_name ?? '-'} sensitive />
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

  // Mark as Paid UI state
  const [showMarkPaidModal, setShowMarkPaidModal] = useState(false);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [markPaidError, setMarkPaidError] = useState<string | null>(null);
  const [markPaidResult, setMarkPaidResult] = useState<MarkPayoutPaidResult | null>(null);

  // Mark as Failed UI state
  const [showMarkFailedModal, setShowMarkFailedModal] = useState(false);
  const [isMarkingFailed, setIsMarkingFailed] = useState(false);
  const [markFailedError, setMarkFailedError] = useState<string | null>(null);
  const [markFailedResult, setMarkFailedResult] = useState<MarkPayoutFailedResult | null>(null);

  // Cancel Payout UI state (RP-5d)
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelResult, setCancelResult] = useState<CancelPayoutResult | null>(null);

  // Retry Payout UI state (RP-5d)
  const [showRetryModal, setShowRetryModal] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retryResult, setRetryResult] = useState<RetryPayoutResult | null>(null);
  const [retryAllowed, setRetryAllowed] = useState<RetryAllowedInfo | null>(null);
  const [retryAllowedLoading, setRetryAllowedLoading] = useState(false);

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

  async function handleMarkAsPaid(params: {
    paypalPayoutId: string;
    paidAt: string;
    grossAmountCents: number | null;
    feeAmountCents: number | null;
    netAmountCents: number | null;
    exchangeRate: number | null;
    exchangeCurrency: string | null;
    adminNote: string | null;
  }) {
    if (!detail?.latest_payout_id) return;
    setIsMarkingPaid(true);
    setMarkPaidError(null);
    const { data, error: err } = await adminMarkPayoutPaid({
      payout_id:           detail.latest_payout_id,
      paypal_payout_id:    params.paypalPayoutId,
      paid_at:             params.paidAt,
      gross_amount_cents:  params.grossAmountCents,
      fee_amount_cents:    params.feeAmountCents,
      net_amount_cents:    params.netAmountCents,
      exchange_rate:       params.exchangeRate,
      exchange_currency:   params.exchangeCurrency,
      admin_note:          params.adminNote,
    });
    setIsMarkingPaid(false);
    if (err) {
      setMarkPaidError(err);
      // モーダルを維持してエラー表示
    } else if (data) {
      setMarkPaidResult(data);
      setShowMarkPaidModal(false);
      await loadDetail(awardId);
    }
  }

  async function handleMarkAsFailed(failureReason: string, adminNote: string | null) {
    if (!detail?.latest_payout_id) return;
    setIsMarkingFailed(true);
    setMarkFailedError(null);
    const { data, error: err } = await adminMarkPayoutFailed({
      payout_id:      detail.latest_payout_id,
      failure_reason: failureReason,
      admin_note:     adminNote,
    });
    setIsMarkingFailed(false);
    if (err) {
      setMarkFailedError(err);
    } else if (data) {
      setMarkFailedResult(data);
      setShowMarkFailedModal(false);
      await loadDetail(awardId);
    }
  }

  // RP-5d: Cancel
  async function handleCancelPayout(cancelReason: string, adminNote: string | null) {
    if (!detail?.latest_payout_id) return;
    setIsCanceling(true);
    setCancelError(null);
    const { data, error: err } = await adminCancelPayout({
      payout_id:     detail.latest_payout_id,
      cancel_reason: cancelReason,
      admin_note:    adminNote,
    });
    setIsCanceling(false);
    if (err) {
      setCancelError(err);
    } else if (data) {
      setCancelResult(data);
      setShowCancelModal(false);
      await loadDetail(awardId);
    }
  }

  // RP-5d: Retry
  async function handleRetryPayout(retryReason: string, adminNote: string | null) {
    if (!detail?.latest_payout_id) return;
    setIsRetrying(true);
    setRetryError(null);
    const { data, error: err } = await adminRetryPayout({
      source_payout_id: detail.latest_payout_id,
      retry_reason:     retryReason,
      admin_note:       adminNote,
    });
    setIsRetrying(false);
    if (err) {
      setRetryError(err);
    } else if (data) {
      setRetryResult(data);
      setShowRetryModal(false);
      await loadDetail(awardId);
    }
  }

  // retry 可否チェック(failed / canceled 状態になったタイミングで取得)
  useEffect(() => {
    if (!detail) return;
    const st = detail.latest_payout_status;
    if (st !== 'failed' && st !== 'canceled') {
      setRetryAllowed(null);
      return;
    }
    let cancelled = false;
    setRetryAllowedLoading(true);
    (async () => {
      // prize_payouts から source payout の snapshot 状態を確認
      if (!detail.latest_payout_id) {
        if (!cancelled) { setRetryAllowed(null); setRetryAllowedLoading(false); }
        return;
      }
      const { data: payoutRows } = await supabase
        .from('prize_payouts')
        .select('id, recipient_email_snapshot, recipient_name_snapshot, payment_method, retry_source_payout_id, status')
        .eq('id', detail.latest_payout_id)
        .maybeSingle();

      if (cancelled) return;

      if (!payoutRows) {
        setRetryAllowed(null);
        setRetryAllowedLoading(false);
        return;
      }

      const snapshot_redacted =
        payoutRows.recipient_email_snapshot === null ||
        payoutRows.recipient_name_snapshot === null;

      // active payout 確認
      const { count: activeCount } = await supabase
        .from('prize_payouts')
        .select('id', { count: 'exact', head: true })
        .eq('award_id', detail.award_id)
        .in('status', ['prepared', 'paid']);

      if (cancelled) return;

      const has_active_payout = (activeCount ?? 0) > 0;

      // chain depth 計算(簡易版: 先祖を辿る)
      let depth = 0;
      let cursor: string | null = payoutRows.id;
      while (cursor && depth < 12) {
        const { data: cur } = await supabase
          .from('prize_payouts')
          .select('retry_source_payout_id')
          .eq('id', cursor)
          .maybeSingle();
        if (!cur) break;
        cursor = cur.retry_source_payout_id ?? null;
        if (cursor) depth++;
      }

      if (cancelled) return;

      let block_reason: string | null = null;
      let can_retry = true;

      if (snapshot_redacted) {
        can_retry = false;
        block_reason = 'source_redacted';
      } else if (has_active_payout) {
        can_retry = false;
        block_reason = 'active_payout_exists';
      } else if (depth >= 10) {
        can_retry = false;
        block_reason = 'chain_too_deep';
      } else if (payoutRows.payment_method !== 'paypal_manual') {
        can_retry = false;
        block_reason = 'unsupported_payment_method';
      }

      setRetryAllowed({ can_retry, snapshot_redacted, has_active_payout, chain_depth: depth, block_reason });
      setRetryAllowedLoading(false);
    })();
    return () => { cancelled = true; };
  }, [detail?.latest_payout_id, detail?.latest_payout_status, detail?.award_id]);

  const anyModalOpen = showPrepareModal || showMarkPaidModal || showMarkFailedModal || showCancelModal || showRetryModal;
  const anySubmitting = isPreparing || isMarkingPaid || isMarkingFailed || isCanceling || isRetrying;

  return (
    <div style={ds.overlay} onClick={e => { if (e.target === e.currentTarget && !anyModalOpen && !anySubmitting) onClose(); }}>
      <div style={ds.modal}>
        <div style={ds.modalHeader}>
          <span style={ds.modalTitle}>Payout Detail</span>
          <button
            type="button"
            style={ds.closeBtn}
            onClick={onClose}
            disabled={anyModalOpen || anySubmitting}
          >
            ✕
          </button>
        </div>

        {loading && <div style={ds.loading}>Loading detail...</div>}
        {error && <div style={ds.errorBanner}>{error}</div>}
        {prepareError && (
          <div style={{ ...ds.errorBanner, margin: '8px 16px' }}>
            ❌ Prepare failed: {prepareError}
          </div>
        )}
        {/* Mark as Paid / Failed 成功バナー */}
        {markPaidResult && (
          <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: 4, padding: '8px 16px', margin: '8px 16px', fontSize: 13, color: '#2e7d32', fontWeight: 700 }}>
            ✅ Marked as Paid at {fmtDate(markPaidResult.paid_at)}
          </div>
        )}
        {markFailedResult && (
          <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 4, padding: '8px 16px', margin: '8px 16px', fontSize: 13, color: '#b71c1c', fontWeight: 700 }}>
            ❌ Marked as Failed at {fmtDate(markFailedResult.failed_at)}
          </div>
        )}
        {/* RP-5d バナー */}
        {cancelResult && (
          <div style={{ background: '#f5f5f5', border: '1px solid #bdbdbd', borderRadius: 4, padding: '8px 16px', margin: '8px 16px', fontSize: 13, color: '#37474f', fontWeight: 700 }}>
            🚫 Payout canceled at {fmtDate(cancelResult.canceled_at)}
          </div>
        )}
        {retryResult && (
          <div style={{ background: '#ede7f6', border: '1px solid #ce93d8', borderRadius: 4, padding: '8px 16px', margin: '8px 16px', fontSize: 13, color: '#4a148c', fontWeight: 700 }}>
            🔁 Retry created: new payout {retryResult.new_payout_id.slice(0, 8)}...
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
                  <DRow label="Award ID"    value={detail.award_id.slice(0, 8) + '...'} />
                  <DRow label="Status"      value={detail.award_status} />
                  <DRow label="Amount"      value={fmtCents(detail.amount_cents, detail.currency)} />
                  <DRow label="Prize Kind"  value={detail.prize_kind ?? '-'} />
                  <DRow label="Source"      value={detail.source_kind ?? '-'} />
                  {detail.source_arena_event_id && (
                    <DRow label="Arena Event" value={detail.source_arena_event_id.slice(0, 8) + '...'} />
                  )}
                  {detail.source_arena_match_id && (
                    <DRow label="Arena Match" value={detail.source_arena_match_id.slice(0, 8) + '...'} />
                  )}
                </Section>

                {/* Submission 情報(PIIなし) */}
                <Section title="Submission">
                  {detail.latest_submission_id ? (
                    <>
                      <DRow label="Sub ID"     value={detail.latest_submission_id.slice(0, 8) + '...'} />
                      <DRow label="Status"     value={detail.latest_submission_status ?? '-'} />
                      <DRow label="Submitted"  value={fmtDate(detail.latest_submission_submitted_at)} />
                      <DRow label="Data Exp."  value={fmtDate(detail.latest_submission_delete_after)} />
                    </>
                  ) : (
                    <div style={ds.noData}>No submission yet.</div>
                  )}
                </Section>

                {/* Payout 情報(PIIなし) */}
                <Section title="Payout">
                  {detail.latest_payout_id ? (
                    <>
                      <DRow label="Payout ID" value={detail.latest_payout_id.slice(0, 8) + '...'} />
                      <DRow label="Status"    value={detail.latest_payout_status ?? '-'} />
                      {detail.latest_payout_paid_at && (
                        <DRow label="Paid At" value={fmtDate(detail.latest_payout_paid_at)} />
                      )}
                    </>
                  ) : (
                    <div style={ds.noData}>No payout record yet.</div>
                  )}
                </Section>

                {/* PII セクション - 表示のみ、console.log 禁止 */}
                <Section title="Payment Info (Confidential)">
                  {detail.pii_data_source === 'unavailable' ? (
                    <div style={ds.errorBanner}>
                      ⚠️ Cannot Pay: payment information unavailable (data may have been cleared before payout was prepared).
                    </div>
                  ) : (
                    <>
                      <DRow label="Legal Name"    value={detail.legal_name ?? '-'} sensitive />
                      <DRow label="PayPal Email"  value={detail.paypal_email ?? '-'} sensitive />
                      <div style={ds.piiNote}>
                        i️ This information is sourced from: <strong>{detail.pii_data_source}</strong>
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
                      disabled={anySubmitting}
                    >
                      Prepare Payout
                    </button>
                    <div style={ds.prepareNote}>
                      Snapshots payment info. Does NOT execute PayPal transfer.
                    </div>
                  </div>
                )}

                {/* RP-5c: Mark as Paid / Failed ボタン(prepared のときのみ表示) */}
                {canShowMarkAsPaidButton(detail) && !markPaidResult && !markFailedResult && !cancelResult && (
                  <div style={ds.actionArea}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                      <button
                        type="button"
                        style={mp.markPaidBtn}
                        onClick={() => {
                          setMarkPaidError(null);
                          setShowMarkPaidModal(true);
                        }}
                        disabled={anySubmitting}
                      >
                        Mark as Paid
                      </button>
                      <button
                        type="button"
                        style={mp.markFailedBtn}
                        onClick={() => {
                          setMarkFailedError(null);
                          setShowMarkFailedModal(true);
                        }}
                        disabled={anySubmitting}
                      >
                        Mark as Failed
                      </button>
                    </div>
                    <div style={ds.prepareNote}>
                      Mark as Paid: after executing PayPal payment manually.<br />
                      Mark as Failed: if PayPal payment failed or was rejected.
                    </div>
                  </div>
                )}

                {/* RP-5d: Cancel ボタン(prepared のみ) */}
                {canShowCancelButton(detail) && !cancelResult && !markPaidResult && !markFailedResult && (
                  <div style={{ ...ds.actionArea, background: '#f5f5f5', borderColor: '#bdbdbd', marginTop: 8 }}>
                    <button
                      type="button"
                      style={cr.cancelPayoutBtn}
                      onClick={() => {
                        setCancelError(null);
                        setShowCancelModal(true);
                      }}
                      disabled={anySubmitting}
                    >
                      Cancel Payout
                    </button>
                    <div style={ds.prepareNote}>
                      Cancel without payment. Use Retry to create a new prepared payout.
                    </div>
                  </div>
                )}

                {/* paid 後の表示 */}
                {(detail.latest_payout_status === 'paid') && (
                  <div style={{ ...ds.futureNote, color: '#2e7d32', background: '#e8f5e9', borderColor: '#a5d6a7' }}>
                    ✅ Payout is <strong>paid</strong>. This is terminal.
                  </div>
                )}

                {/* failed / canceled 後 - Retry ボタン */}
                {(['failed', 'canceled'].includes(detail.latest_payout_status ?? '')) && (
                  <div style={{ ...ds.actionArea, background: '#ede7f6', borderColor: '#ce93d8', marginTop: 8 }}>
                    {retryAllowedLoading && (
                      <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Checking retry eligibility...</div>
                    )}
                    {!retryAllowedLoading && retryAllowed && (
                      <>
                        {retryAllowed.can_retry ? (
                          <button
                            type="button"
                            style={cr.retryPayoutBtn}
                            onClick={() => {
                              setRetryError(null);
                              setShowRetryModal(true);
                            }}
                            disabled={anySubmitting}
                          >
                            Retry Payout
                          </button>
                        ) : (
                          <button
                            type="button"
                            style={{ ...cr.retryPayoutBtn, ...pm.disabledBtn }}
                            disabled
                            title={
                              retryAllowed.snapshot_redacted
                                ? 'Source payoutのrecipient情報がredactionされているためretryできません。再提出フローが必要です。'
                                : retryAllowed.has_active_payout
                                  ? 'Active payout exists.'
                                  : retryAllowed.chain_depth >= 10
                                    ? 'Retry chain depth limit reached (max 9).'
                                    : retryAllowed.block_reason ?? 'Cannot retry.'
                            }
                          >
                            Retry Payout
                          </button>
                        )}
                        {retryAllowed.snapshot_redacted && (
                          <div style={{ fontSize: 11, color: '#b71c1c', marginTop: 4 }}>
                            ⚠ Source payoutのrecipient情報がredactionされているためretryできません。再提出フローが必要です。
                          </div>
                        )}
                        {!retryAllowed.snapshot_redacted && !retryAllowed.can_retry && (
                          <div style={{ fontSize: 11, color: '#b71c1c', marginTop: 4 }}>
                            ⚠ Cannot retry: {retryAllowed.block_reason}
                          </div>
                        )}
                      </>
                    )}
                    <div style={{ ...ds.prepareNote, marginTop: 6 }}>
                      Retry creates a new prepared payout from the same snapshot. Source payout is unchanged.
                    </div>
                  </div>
                )}

                {/* Retry chain 表示(Payout History) */}
                <Section title="Payout History (Retry Chain)">
                  <RetryChainView awardId={awardId} />
                </Section>
              </>
            )}
          </div>
        )}
      </div>

      {/* Prepare Payout 確認モーダル(overlay の上に重ねる) */}
      {showPrepareModal && detail && (
        <PrepareConfirmModal
          detail={detail}
          onConfirm={handlePreparePayout}
          onCancel={() => setShowPrepareModal(false)}
          isPreparing={isPreparing}
        />
      )}

      {/* Mark as Paid 確認モーダル */}
      {showMarkPaidModal && detail && detail.latest_payout_id && (
        <MarkAsPaidModal
          detail={detail}
          payoutId={detail.latest_payout_id}
          preparedAt={null}
          onConfirm={handleMarkAsPaid}
          onCancel={() => {
            setShowMarkPaidModal(false);
            setMarkPaidError(null);
          }}
          isSubmitting={isMarkingPaid}
          submitError={markPaidError}
        />
      )}

      {/* Mark as Failed 確認モーダル */}
      {showMarkFailedModal && detail && detail.latest_payout_id && (
        <MarkAsFailedModal
          payoutId={detail.latest_payout_id}
          detail={detail}
          onConfirm={handleMarkAsFailed}
          onCancel={() => {
            setShowMarkFailedModal(false);
            setMarkFailedError(null);
          }}
          isSubmitting={isMarkingFailed}
          submitError={markFailedError}
        />
      )}

      {/* Cancel Payout 確認モーダル (RP-5d) */}
      {showCancelModal && detail && detail.latest_payout_id && (
        <CancelPayoutModal
          detail={detail}
          payoutId={detail.latest_payout_id}
          preparedAt={null}
          onConfirm={handleCancelPayout}
          onCancel={() => {
            setShowCancelModal(false);
            setCancelError(null);
          }}
          isSubmitting={isCanceling}
          submitError={cancelError}
        />
      )}

      {/* Retry Payout 確認モーダル (RP-5d) */}
      {showRetryModal && detail && detail.latest_payout_id && retryAllowed && (
        <RetryPayoutModal
          detail={detail}
          sourcePayoutId={detail.latest_payout_id}
          sourceStatus={detail.latest_payout_status ?? 'unknown'}
          retryAllowed={retryAllowed}
          onConfirm={handleRetryPayout}
          onCancel={() => {
            setShowRetryModal(false);
            setRetryError(null);
          }}
          isSubmitting={isRetrying}
          submitError={retryError}
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
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase' as const, color: 'var(--ink-3)', marginBottom: 4 }}>Administration</div>
          <h2 style={s.title}>Payment Dashboard</h2>
        </div>
        <button type="button" style={s.reloadBtn} onClick={loadAwards} disabled={loading}>
          {loading ? '…' : '↻ Reload'}
        </button>
      </div>

      <div style={s.subtitle}>
        PayPal payment is executed manually via PayPal dashboard.
        Use "Prepare Payout" to snapshot payment info before transferring.
        After manual PayPal payment, use "Mark as Paid". If payment failed, use "Mark as Failed".
      </div>

      {listError && (
        <div style={s.errorBanner}>
          <span>⚠ {listError}</span>
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
            <span style={s.cardId}>{award.award_id.slice(0, 8)}...</span>
            <span style={s.cardDate}>{fmtDate(award.created_at)}</span>
          </div>

          <div style={s.cardGrid}>
            <CRow label="Recipient"  value={award.recipient_display_name ?? award.recipient_user_id.slice(0, 8)} />
            <CRow label="Amount"     value={fmtCents(award.amount_cents, award.currency)} />
            <CRow label="Prize Kind" value={award.prize_kind ?? '-'} />
            <CRow label="Source"     value={award.source_kind ?? '-'} />
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
            // モーダルを閉じた後に一覧を再取得(Prepare 完了後の表示更新)
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
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 16,
    padding: '28px 24px 20px',
    borderBottom: '1px solid var(--rule)',
    marginBottom: 0,
  },
  title: {
    fontFamily: 'var(--display)',
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: '0.02em',
    color: 'var(--ink)',
    margin: 0,
    flex: 1,
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
  reloadBtn: {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
    color: 'var(--ink-2)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '6px 0',
    marginTop: 4,
  },
  subtitle: {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '0.08em',
    color: 'var(--ink-3)',
    lineHeight: 1.7,
    margin: '0 24px 12px',
    padding: '10px 14px',
    background: '#faf9f7',
    border: '1px solid var(--rule)',
    borderRadius: 4,
    marginTop: 12,
  },

  // ── エラーバナー ──
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

  // ── 空状態 ──
  empty: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    gap: 8,
    color: 'var(--ink-3)',
    fontFamily: 'var(--mono)',
    fontSize: 11,
    letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
  },

  // ── Award カード ──
  card: {
    border: '1px solid var(--rule)',
    borderRadius: 8,
    padding: '16px 20px',
    margin: '0 24px',
    marginTop: 12,
    background: '#faf9f7',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  labelBadge: {
    fontFamily: 'var(--mono)',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.16em',
  },
  cardId: {
    fontFamily: 'var(--mono)',
    fontSize: 11,
    color: 'var(--ink-4)',
  },
  cardDate: {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    color: 'var(--ink-4)',
    marginLeft: 'auto',
  },

  // ── 情報グリッド ──
  cardGrid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '6px 20px',
    marginBottom: 12,
  },
  rowItem: {
    display: 'flex',
    gap: 6,
    fontSize: 12,
    minWidth: 180,
  },
  rowLabel: {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    color: 'var(--ink-3)',
    flexShrink: 0,
    letterSpacing: '0.05em',
  },
  rowValue: {
    color: 'var(--ink)',
    fontWeight: 500,
    fontSize: 12,
  },

  // ── カード操作 ──
  cardActions: {
    borderTop: '1px solid var(--rule)',
    paddingTop: 10,
    display: 'flex',
    gap: 6,
  },
  detailBtn: {
    fontFamily: 'var(--mono)',
    fontSize: 9,
    letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
    background: 'var(--ink)',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '7px 16px',
    cursor: 'pointer',
    fontWeight: 700,
    minHeight: 32,
    transition: 'opacity .15s',
  },
};

// Cancel / Retry Styles (RP-5d)
const cr: Record<string, React.CSSProperties> = {
  cancelPayoutBtn: {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
    background: 'var(--ink)',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '9px 16px',
    cursor: 'pointer',
    fontWeight: 700,
    minHeight: 40,
    width: '100%',
    marginBottom: 6,
    opacity: 0.85,
    transition: 'opacity .15s',
  },
  retryPayoutBtn: {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
    background: '#4a148c',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '9px 16px',
    cursor: 'pointer',
    fontWeight: 700,
    minHeight: 40,
    width: '100%',
    marginBottom: 6,
    transition: 'opacity .15s',
  },
  confirmCancelBtn: {
    flex: 2,
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
    background: 'var(--ink)',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '12px 10px',
    cursor: 'pointer',
    fontWeight: 700,
    minHeight: 44,
  },
  confirmRetryBtn: {
    flex: 2,
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
    background: '#4a148c',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '12px 10px',
    cursor: 'pointer',
    fontWeight: 700,
    minHeight: 44,
  },
  chainContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    marginTop: 4,
  },
  chainRow: {
    display: 'flex',
    gap: 8,
    padding: '8px 10px',
    background: '#faf9f7',
    border: '1px solid var(--rule)',
    borderRadius: 6,
    fontSize: 12,
  },
  chainIndex: {
    fontFamily: 'var(--mono)',
    color: 'var(--ink-4)',
    flexShrink: 0,
    minWidth: 20,
    fontWeight: 700,
    fontSize: 11,
  },
  chainBody: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 3,
  },
  chainStatus: {
    fontFamily: 'var(--mono)',
    fontWeight: 700,
    fontSize: 10,
    letterSpacing: '0.12em',
  },
  chainMono: {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    color: 'var(--ink-3)',
  },
  chainAmt: {
    color: 'var(--ink)',
    fontWeight: 600,
    fontSize: 12,
  },
  chainMethod: {
    fontFamily: 'var(--mono)',
    color: 'var(--ink-4)',
    fontSize: 10,
  },
  chainDates: {
    color: 'var(--ink-4)',
    fontSize: 11,
    fontFamily: 'var(--mono)',
  },
  chainRetryRef: {
    color: 'var(--accent)',
    fontSize: 11,
    fontStyle: 'italic' as const,
    fontFamily: 'var(--mono)',
  },
};

// Detail Modal Styles
const ds: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(20,20,26,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: 16,
  },
  modal: {
    background: '#ffffff',
    border: '1px solid var(--rule-strong)',
    borderRadius: 2,
    width: '100%',
    maxWidth: 520,
    maxHeight: '90vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 16px 48px rgba(20,20,26,0.18)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid var(--rule)',
    flexShrink: 0,
  },
  modalTitle: {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '0.22em',
    textTransform: 'uppercase' as const,
    color: 'var(--ink)',
  },
  closeBtn: {
    fontFamily: 'var(--mono)',
    fontSize: 14,
    color: 'var(--ink-3)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '2px 6px',
  },
  detailBody: {
    overflowY: 'auto',
    padding: '16px 20px',
    WebkitOverflowScrolling: 'touch',
  },
  loading: {
    padding: 28,
    textAlign: 'center',
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '0.2em',
    textTransform: 'uppercase' as const,
    color: 'var(--ink-3)',
  },
  errorBanner: {
    background: '#fff8f8',
    border: '1px solid #ffcdd2',
    borderRadius: 4,
    padding: '8px 12px',
    fontSize: 13,
    color: '#b71c1c',
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontFamily: 'var(--mono)',
    fontSize: 9,
    fontWeight: 700,
    color: 'var(--ink-3)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.22em',
    marginBottom: 8,
    paddingBottom: 5,
    borderBottom: '1px solid var(--rule)',
  },
  dRow: {
    display: 'flex',
    gap: 10,
    fontSize: 13,
    marginBottom: 5,
  },
  dLabel: {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    color: 'var(--ink-3)',
    flexShrink: 0,
    minWidth: 120,
    letterSpacing: '0.05em',
  },
  dValue: {
    color: 'var(--ink)',
    fontWeight: 500,
    wordBreak: 'break-all' as const,
    fontSize: 13,
  },
  sensitiveValue: {
    color: '#1a237e',
    fontFamily: 'var(--mono)',
    fontSize: 12,
  },
  monoValue: {
    fontFamily: 'var(--mono)',
    fontSize: 11,
    color: 'var(--ink-3)',
  },
  noData: {
    fontFamily: 'var(--mono)',
    fontSize: 11,
    color: 'var(--ink-4)',
    letterSpacing: '0.05em',
  },
  piiNote: {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    color: 'var(--ink-3)',
    marginTop: 6,
    fontStyle: 'italic',
    letterSpacing: '0.04em',
  },
  actionArea: {
    marginTop: 16,
    padding: '14px 16px',
    background: '#f5f7ff',
    border: '1px solid #c5cae9',
    borderRadius: 6,
  },
  prepareBtn: {
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
    fontWeight: 700,
    minHeight: 42,
    width: '100%',
    marginBottom: 6,
    transition: 'opacity .15s',
  },
  prepareNote: {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    color: 'var(--ink-3)',
    textAlign: 'center' as const,
    letterSpacing: '0.04em',
  },
  futureNote: {
    background: '#faf9f7',
    border: '1px solid var(--rule)',
    borderRadius: 4,
    padding: '8px 12px',
    fontSize: 12,
    color: 'var(--ink-3)',
    marginTop: 8,
  },
};

// Prepare Confirm Modal Styles
const pm: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(20,20,26,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: 16,
  },
  modal: {
    background: '#ffffff',
    border: '1px solid var(--rule-strong)',
    borderRadius: 2,
    width: '100%',
    maxWidth: 480,
    maxHeight: '90vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 16px 56px rgba(20,20,26,0.22)',
  },
  header: {
    padding: '14px 20px',
    borderBottom: '1px solid var(--rule)',
    background: 'var(--ink)',
  },
  title: {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '0.22em',
    textTransform: 'uppercase' as const,
    color: '#fff',
  },
  body: {
    overflowY: 'auto',
    padding: '18px 20px',
    WebkitOverflowScrolling: 'touch',
  },
  infoBox: {
    background: '#faf9f7',
    border: '1px solid var(--rule)',
    borderRadius: 6,
    padding: '12px 14px',
    marginBottom: 14,
  },
  infoRow: {
    display: 'flex',
    gap: 10,
    fontSize: 13,
    marginBottom: 5,
  },
  infoLabel: {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    color: 'var(--ink-3)',
    flexShrink: 0,
    minWidth: 110,
    letterSpacing: '0.05em',
  },
  infoValue: {
    color: 'var(--ink)',
    fontWeight: 600,
    wordBreak: 'break-all' as const,
    fontSize: 13,
  },
  sensitiveValue: {
    color: '#1a237e',
    fontFamily: 'var(--mono)',
    fontSize: 12,
  },
  warningBox: {
    background: '#fffbf0',
    border: '1px solid #ffe082',
    borderRadius: 6,
    padding: '10px 14px',
    marginBottom: 14,
  },
  warningTitle: {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    fontWeight: 700,
    color: '#e65100',
    letterSpacing: '0.12em',
    marginBottom: 8,
  },
  warningList: {
    margin: 0,
    paddingLeft: 18,
    fontSize: 12,
    color: 'var(--ink-2)',
    lineHeight: 1.7,
  },
  checksBox: {
    marginBottom: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: '12px 14px',
    background: '#faf9f7',
    border: '1px solid var(--rule)',
    borderRadius: 6,
  },
  checkLabel: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    fontSize: 13,
    color: 'var(--ink)',
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
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
    background: 'transparent',
    border: '1px solid var(--rule-strong)',
    borderRadius: 4,
    padding: '12px 10px',
    cursor: 'pointer',
    fontWeight: 600,
    minHeight: 44,
    color: 'var(--ink-2)',
  },
  prepareBtn: {
    flex: 2,
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
    background: 'var(--ink)',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '12px 10px',
    cursor: 'pointer',
    fontWeight: 700,
    minHeight: 44,
    transition: 'opacity .15s',
  },
  disabledBtn: {
    background: 'var(--ink-4)',
    cursor: 'not-allowed',
    opacity: 0.5,
  },
};

// Mark as Paid / Failed Modal Styles
const mp: Record<string, React.CSSProperties> = {
  formSection: {
    marginBottom: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  required: {
    color: '#b71c1c',
  },
  hint: {
    fontWeight: 400,
    color: 'var(--ink-3)',
    fontSize: 10,
    fontFamily: 'var(--mono)',
    letterSpacing: '0.04em',
  },
  input: {
    border: '1px solid var(--rule-strong)',
    borderRadius: 4,
    padding: '7px 10px',
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box' as const,
    fontFamily: 'inherit',
    color: 'var(--ink)',
    background: '#fff',
  },
  inputError: {
    borderColor: '#b71c1c',
    background: '#fff8f8',
  },
  textarea: {
    border: '1px solid var(--rule-strong)',
    borderRadius: 4,
    padding: '7px 10px',
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box' as const,
    fontFamily: 'inherit',
    resize: 'vertical' as const,
    color: 'var(--ink)',
    background: '#fff',
  },
  textareaError: {
    borderColor: '#b71c1c',
    background: '#fff8f8',
  },
  warningStale: {
    background: '#fffbf0',
    border: '1px solid #ffe082',
    borderRadius: 4,
    padding: '8px 12px',
    fontSize: 12,
    color: '#e65100',
    marginBottom: 12,
  },
  confirmPaidBtn: {
    flex: 2,
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
    background: '#1b5e20',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '12px 10px',
    cursor: 'pointer',
    fontWeight: 700,
    minHeight: 44,
  },
  confirmFailedBtn: {
    flex: 2,
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
    background: '#b71c1c',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '12px 10px',
    cursor: 'pointer',
    fontWeight: 700,
    minHeight: 44,
  },
  markPaidBtn: {
    flex: 1,
    fontFamily: 'var(--mono)',
    fontSize: 9,
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    background: '#1b5e20',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '8px 14px',
    cursor: 'pointer',
    fontWeight: 700,
    minHeight: 40,
  },
  markFailedBtn: {
    flex: 1,
    fontFamily: 'var(--mono)',
    fontSize: 9,
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    background: '#b71c1c',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '8px 14px',
    cursor: 'pointer',
    fontWeight: 700,
    minHeight: 40,
  },
};

// Success View Styles
const sv: Record<string, React.CSSProperties> = {
  container: {
    padding: '4px 0',
  },
  successBadge: {
    background: '#f0faf2',
    border: '1px solid #a5d6a7',
    borderRadius: 6,
    padding: '12px 16px',
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '0.16em',
    fontWeight: 700,
    color: '#2e7d32',
    marginBottom: 18,
    textAlign: 'center' as const,
    textTransform: 'uppercase' as const,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontFamily: 'var(--mono)',
    fontSize: 9,
    fontWeight: 700,
    color: 'var(--ink-3)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.22em',
    marginBottom: 8,
    paddingBottom: 5,
    borderBottom: '1px solid var(--rule)',
  },
  nextSteps: {
    background: '#f5f7ff',
    border: '1px solid #c5cae9',
    borderRadius: 6,
    padding: '12px 14px',
    marginTop: 10,
  },
  nextTitle: {
    fontFamily: 'var(--mono)',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
    color: 'var(--ink)',
    marginBottom: 10,
  },
  nextList: {
    margin: 0,
    paddingLeft: 18,
    fontSize: 12,
    color: 'var(--ink-2)',
    lineHeight: 1.8,
  },
};
