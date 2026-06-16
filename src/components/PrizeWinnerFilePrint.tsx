/**
 * PrizeWinnerFilePrint.tsx — Winner File 印刷/PDF 表示コンポーネント
 *
 * 目的: admin が Winner File を印刷 / PDF 保存し、
 *       オフライン保管完了後にオンライン DB 上の機微情報を削除する。
 *
 * 注意:
 *   - submission_data は機微情報。Console log 厳禁。
 *   - エラーメッセージに submission_data を含めない。
 *   - Archive 完了後は取り消し不可。
 */
import { useState, useEffect } from 'react';
import {
  adminGetPrizeSubmissionForPrint,
  adminMarkPrizeSubmissionArchived,
  type PrintSubmissionResult,
} from '../lib/prizeAdmin';

interface Props {
  onBack: () => void;
  /** 自動ロードする Submission ID（Payout Detail からの遷移時に設定） */
  initialSubmissionId?: string;
}

// ── ユーティリティ ────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function fmtCents(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
  })}`;
}

// submission_data から安全に文字列を取り出す（型不明のため）
function safeStr(obj: Record<string, unknown> | null | undefined, key: string): string {
  if (!obj) return '—';
  const v = obj[key];
  if (v === null || v === undefined) return '—';
  return String(v);
}

function safeBool(obj: Record<string, unknown> | null | undefined, key: string): string {
  if (!obj) return '—';
  const v = obj[key];
  if (v === null || v === undefined) return '—';
  // boolean true/false を人間が読める文字列に変換
  if (v === true)  return 'Yes / Confirmed';
  if (v === false) return 'Not confirmed';
  // 文字列で渡ってきた場合
  if (typeof v === 'string') {
    const lower = v.toLowerCase();
    if (lower === 'true')  return 'Yes / Confirmed';
    if (lower === 'false') return 'Not confirmed';
  }
  return String(v);
}

// 住所フィールドを Full Address として結合する
function buildFullAddress(obj: Record<string, unknown> | null | undefined): string {
  if (!obj) return '—';
  const parts: string[] = [];
  const line1     = obj['address_line1'];
  const line2     = obj['address_line2'];
  const city      = obj['city'];
  const region    = obj['region'];
  const postal    = obj['postal_code'];
  const country   = obj['country'];
  if (line1  && String(line1).trim())  parts.push(String(line1).trim());
  if (line2  && String(line2).trim())  parts.push(String(line2).trim());
  if (city   && String(city).trim())   parts.push(String(city).trim());
  if (region && String(region).trim()) parts.push(String(region).trim());
  if (postal && String(postal).trim()) parts.push(String(postal).trim());
  if (country && String(country).trim()) parts.push(String(country).trim());
  return parts.length > 0 ? parts.join(', ') : '—';
}

// ── コンポーネント ────────────────────────────────────────────────────────────

export function PrizeWinnerFilePrint({ onBack, initialSubmissionId }: Props) {
  const [submissionIdInput, setSubmissionIdInput] = useState(initialSubmissionId ?? '');
  const [loading,           setLoading]           = useState(false);
  const [fetchError,        setFetchError]         = useState<string | null>(null);
  const [printData,         setPrintData]          = useState<PrintSubmissionResult | null>(null);

  // initialSubmissionId が渡された場合は自動フェッチ
  useEffect(() => {
    if (initialSubmissionId && initialSubmissionId.trim()) {
      const id = initialSubmissionId.trim();
      setSubmissionIdInput(id);
      setLoading(true);
      setFetchError(null);
      setPrintData(null);
      setArchiveDone(false);
      setArchiveError(null);
      setShowArchiveConfirm(false);
      adminGetPrizeSubmissionForPrint(id).then(({ data, error }) => {
        if (error) {
          setFetchError(error);
        } else {
          setPrintData(data);
        }
        setLoading(false);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSubmissionId]);

  // Archive 完了処理
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiveNote,        setArchiveNote]        = useState('');
  const [archiving,          setArchiving]          = useState(false);
  const [archiveError,       setArchiveError]       = useState<string | null>(null);
  const [archiveDone,        setArchiveDone]        = useState(false);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  async function handleFetch(e: React.FormEvent) {
    e.preventDefault();
    const id = submissionIdInput.trim();
    if (!id) return;

    setLoading(true);
    setFetchError(null);
    setPrintData(null);
    setArchiveDone(false);
    setArchiveError(null);
    setShowArchiveConfirm(false);

    const { data, error } = await adminGetPrizeSubmissionForPrint(id);
    if (error) {
      // 機微情報をエラーに含めない
      setFetchError(error);
    } else {
      setPrintData(data);
    }
    setLoading(false);
  }

  // ── Archive 実行 ──────────────────────────────────────────────────────────

  async function handleArchive() {
    if (!printData) return;
    setArchiving(true);
    setArchiveError(null);

    const { data, error } = await adminMarkPrizeSubmissionArchived(
      printData.submission_id,
      archiveNote.trim() || null,
    );
    if (error) {
      // 機微情報をエラーに含めない
      setArchiveError(error);
      setArchiving(false);
      setShowArchiveConfirm(false);
      return;
    }

    // 成功: 表示を更新（submission_data はもう存在しない）
    if (data) {
      setPrintData(prev => prev
        ? {
            ...prev,
            submission_status: data.status,
            submission_data:   null,
            data_cleared_at:   data.data_cleared_at,
            archived_at:       data.archived_at,
          }
        : prev,
      );
    }
    setArchiveDone(true);
    setArchiving(false);
    setShowArchiveConfirm(false);
  }

  // ── 印刷 ──────────────────────────────────────────────────────────────────

  function handlePrint() {
    window.print();
  }

  // ── レンダリング ───────────────────────────────────────────────────────────

  const sd = printData?.submission_data ?? null;

  return (
    <>
      {/* ── 通常表示（非印刷時のみ表示） ─────────── */}
      <div className="no-print" style={s.page}>

        {/* ヘッダー */}
        <div style={s.header}>
          <button type="button" style={s.backBtn} onClick={onBack}>← Back</button>
          <h2 style={s.title}>Winner File — Print / Archive</h2>
        </div>

        {/* 検索フォーム */}
        <form style={s.searchForm} onSubmit={handleFetch}>
          <label style={s.label}>
            Submission ID
            <input
              style={s.input}
              type="text"
              value={submissionIdInput}
              onChange={e => setSubmissionIdInput(e.target.value)}
              placeholder="uuid"
              required
            />
          </label>
          <button type="submit" style={s.fetchBtn} disabled={loading}>
            {loading ? 'Loading…' : 'Show Winner File'}
          </button>
        </form>

        {/* エラー */}
        {fetchError && (
          <div style={s.errorBanner}>
            {fetchError}
          </div>
        )}

        {/* 印刷ボタン・Archive ボタン（データ取得後） */}
        {printData && (
          <div style={s.actionBar}>
            <button type="button" style={s.printBtn} onClick={handlePrint}>
              🖨 Print / Save as PDF
            </button>
            {printData.submission_status !== 'data_cleared' && !archiveDone && (
              <button
                type="button"
                style={s.archiveBtn}
                onClick={() => setShowArchiveConfirm(true)}
                disabled={archiving}
              >
                Archive completed / Clear online sensitive data
              </button>
            )}
            {(archiveDone || printData.submission_status === 'data_cleared') && (
              <div style={s.archivedBadge}>
                ✅ Online sensitive data cleared
                {printData.data_cleared_at && ` — ${fmtDate(printData.data_cleared_at)}`}
              </div>
            )}
          </div>
        )}

        {/* Archive エラー */}
        {archiveError && (
          <div style={s.errorBanner}>
            Archive failed: {archiveError}
          </div>
        )}

        {/* Archive 確認モーダル */}
        {showArchiveConfirm && (
          <div style={s.modalOverlay}>
            <div style={s.modal}>
              <div style={s.modalTitle}>⚠️ Confirm Archive & Data Clear</div>
              <div style={s.modalBody}>
                <p style={s.modalWarning}>
                  PDF保存・紙印刷・オフライン保管が完了している場合のみ実行してください。
                  この操作により、オンラインDB上の住所・税務情報・PayPalメール等の機微情報は削除されます。
                  この操作は取り消せません。
                </p>
                <label style={s.label}>
                  Admin Note (optional)
                  <input
                    style={s.input}
                    type="text"
                    value={archiveNote}
                    onChange={e => setArchiveNote(e.target.value)}
                    placeholder="Offline storage location, file name, etc."
                  />
                </label>
              </div>
              <div style={s.modalActions}>
                <button
                  type="button"
                  style={s.cancelBtn}
                  onClick={() => setShowArchiveConfirm(false)}
                  disabled={archiving}
                >
                  戻る (Cancel)
                </button>
                <button
                  type="button"
                  style={s.confirmArchiveBtn}
                  onClick={handleArchive}
                  disabled={archiving}
                >
                  {archiving ? 'Processing…' : 'Archive completed / Clear online sensitive data'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 印刷コンテンツ（印刷時に表示） ────────── */}
      {printData && (
        <div className="print-only" style={s.printArea}>
          <h1 style={s.printTitle}>WINNER FILE — ONE EIGHT</h1>
          <div style={s.printMeta}>Printed at: {new Date().toLocaleString()}</div>
          <hr style={s.divider} />

          {/* Award / Submission 情報 */}
          <Section title="Award Information">
            <PrintRow label="Award ID"           value={printData.award_id} />
            <PrintRow label="Submission ID"      value={printData.submission_id} />
            <PrintRow label="Recipient User ID"  value={printData.recipient_user_id} />
            <PrintRow label="Prize Kind"         value={printData.prize_kind ?? '—'} />
            <PrintRow label="Amount"             value={fmtCents(printData.amount_cents, printData.currency)} />
            <PrintRow label="Currency"           value={printData.currency} />
            <PrintRow label="Source Kind"        value={printData.source_kind ?? '—'} />
            <PrintRow label="Arena Event ID"     value={printData.source_arena_event_id ?? '—'} />
            <PrintRow label="Arena Match ID"     value={printData.source_arena_match_id ?? '—'} />
            <PrintRow label="Award Status"       value={printData.award_status} />
            <PrintRow label="Submitted At"       value={fmtDate(printData.submitted_at)} />
            <PrintRow label="Delete Due At"      value={fmtDate(printData.delete_after)} />
          </Section>

          {/* Payout 情報 */}
          <Section title="Payout Information">
            <PrintRow label="Payout ID"          value={printData.payout_id ?? '—'} />
            <PrintRow label="Payout Status"      value={printData.payout_status ?? '—'} />
            <PrintRow label="Prepared At"        value={fmtDate(printData.prepared_at)} />
            <PrintRow label="Paid At"            value={fmtDate(printData.paid_at)} />
          </Section>

          {/* データソース表示 */}
          {printData.data_source && printData.data_source !== 'submission_data' && (
            <div style={s.dataSourceNote}>
              ⚠ Data source: {printData.data_source === 'payout_snapshot'
                ? 'Payout Snapshot (submission data was cleared after prepare)'
                : 'Unavailable — sensitive data has been cleared'}
            </div>
          )}

          {/* 税務・支払情報（submission_data または payout_snapshot から） */}
          {sd ? (
            <Section title="Tax &amp; Payment Information (SENSITIVE)">
              <PrintRow label="Legal Name"                    value={safeStr(sd, 'legal_name')} />
              <PrintRow label="Residence Country"             value={safeStr(sd, 'residence_country')} />
              <PrintRow label="Full Address"                  value={buildFullAddress(sd)} />
              <PrintRow label="Tax Residence Country"         value={safeStr(sd, 'tax_residence_country')} />
              <PrintRow label="Domestic / Foreign"            value={safeStr(sd, 'domestic_or_foreign')} />
              <PrintRow label="PayPal Email"                  value={safeStr(sd, 'paypal_email')} />
              <PrintRow label="Preferred Currency"            value={safeStr(sd, 'preferred_currency')} />
              <PrintRow label="User Confirmed Identity"       value={safeBool(sd, 'user_confirmed_legal_responsibility')} />
              <PrintRow label="User Confirmed Paypal Name"    value={safeBool(sd, 'user_confirmed_paypal_name_match')} />
            </Section>
          ) : (
            <Section title="Tax &amp; Payment Information">
              <div style={s.dataCleared}>
                Sensitive data has been cleared (data_cleared_at: {fmtDate(printData.data_cleared_at)}).
              </div>
            </Section>
          )}

          {/* Admin 記入欄 */}
          <Section title="Admin Records">
            <PrintRow label="Admin Note"        value="___________________________" />
            <PrintRow label="Printed At"        value={new Date().toLocaleString()} />
            <PrintRow label="Offline Saved At"  value="___________________________" />
            <PrintRow label="Operator"          value="___________________________" />
          </Section>
        </div>
      )}
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={s.section}>
      <div style={s.sectionTitle}>{title}</div>
      {children}
    </div>
  );
}

function PrintRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.printRow}>
      <span style={s.printLabel}>{label}:</span>
      <span style={s.printValue}>{value}</span>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 800,
    margin: '0 auto',
    padding: 16,
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
  searchForm: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
    marginBottom: 16,
    background: '#f9f9f9',
    border: '1px solid #e0e0e0',
    borderRadius: 6,
    padding: 16,
  },
  label: {
    display: 'flex',
    flexDirection: 'column' as const,
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
  fetchBtn: {
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
  errorBanner: {
    background: '#ffebee',
    border: '1px solid #ef9a9a',
    borderRadius: 4,
    padding: '8px 12px',
    fontSize: 13,
    color: '#b71c1c',
    marginBottom: 8,
  },
  actionBar: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  printBtn: {
    background: '#1a237e',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '10px 20px',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    minHeight: 44,
  },
  archiveBtn: {
    background: '#b71c1c',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '10px 20px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    minHeight: 44,
  },
  archivedBadge: {
    background: '#e8f5e9',
    border: '1px solid #a5d6a7',
    borderRadius: 4,
    padding: '8px 12px',
    fontSize: 13,
    color: '#2e7d32',
    fontWeight: 600,
  },
  modalOverlay: {
    position: 'fixed' as const,
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
    padding: 24,
    maxWidth: 520,
    width: '100%',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 16,
    color: '#b71c1c',
  },
  modalBody: {
    marginBottom: 20,
  },
  modalWarning: {
    fontSize: 14,
    lineHeight: 1.7,
    color: '#333',
    background: '#fff3e0',
    border: '1px solid #ffcc80',
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
  },
  modalActions: {
    display: 'flex',
    gap: 8,
    justifyContent: 'flex-end',
  },
  cancelBtn: {
    background: '#f5f5f5',
    border: '1px solid #ccc',
    borderRadius: 4,
    padding: '10px 20px',
    cursor: 'pointer',
    fontSize: 14,
    minHeight: 44,
  },
  confirmArchiveBtn: {
    background: '#b71c1c',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '10px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    minHeight: 44,
  },
  // 印刷エリア
  printArea: {
    padding: '24px',
    fontFamily: 'serif',
    fontSize: 12,
    color: '#000',
    background: '#fff',
  },
  printTitle: {
    fontSize: 20,
    fontWeight: 700,
    textAlign: 'center' as const,
    marginBottom: 4,
  },
  printMeta: {
    textAlign: 'center' as const,
    fontSize: 11,
    color: '#555',
    marginBottom: 8,
  },
  divider: {
    border: 'none',
    borderTop: '1px solid #999',
    marginBottom: 12,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    borderBottom: '1px solid #ccc',
    paddingBottom: 2,
    marginBottom: 6,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  printRow: {
    display: 'flex',
    gap: 8,
    padding: '3px 0',
    borderBottom: '1px dotted #e0e0e0',
  },
  printLabel: {
    width: 200,
    flexShrink: 0,
    color: '#555',
    fontSize: 11,
  },
  printValue: {
    flex: 1,
    fontSize: 12,
    wordBreak: 'break-all' as const,
  },
  dataCleared: {
    color: '#888',
    fontStyle: 'italic',
    padding: '4px 0',
  },
  dataSourceNote: {
    background: '#fff3e0',
    border: '1px solid #ffcc80',
    borderRadius: 4,
    padding: '6px 10px',
    fontSize: 11,
    color: '#e65100',
    marginBottom: 10,
    fontWeight: 600,
  },
};
