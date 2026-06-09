/**
 * PrizeClaimForm.tsx — 受賞者本人による支払・税務情報提出フォーム
 *
 * 安全方針:
 *   - submission_data / フォーム入力値を Console log しない
 *   - エラー表示に機微情報を含めない
 *   - localStorage に保存しない
 *   - URL query に機微情報を入れない
 *   - Submit 成功後は submission_id / delete_after / ステータスメッセージのみ表示
 */
import { useState } from 'react';
import { submitPrizeTaxSubmission, type SubmitTaxResult } from '../lib/prizeUser';

interface Props {
  awardId: string;
  /** フォームを閉じる（親コンポーネントに委譲） */
  onClose: () => void;
  /** Submit 成功後のコールバック */
  onSuccess: (result: SubmitTaxResult) => void;
}

// ── コンポーネント ────────────────────────────────────────────────────────────

export function PrizeClaimForm({ awardId, onClose, onSuccess }: Props) {
  // フォーム値（機微情報 — Console log 禁止）
  const [legalName,               setLegalName]               = useState('');
  const [displayName,             setDisplayName]             = useState('');
  const [residenceCountry,        setResidenceCountry]        = useState('');
  const [addressLine1,            setAddressLine1]            = useState('');
  const [addressLine2,            setAddressLine2]            = useState('');
  const [city,                    setCity]                    = useState('');
  const [region,                  setRegion]                  = useState('');
  const [postalCode,              setPostalCode]              = useState('');
  const [country,                 setCountry]                 = useState('');
  const [taxResidenceCountry,     setTaxResidenceCountry]     = useState('');
  const [domesticOrForeign,       setDomesticOrForeign]       = useState<'domestic' | 'foreign' | 'unknown'>('unknown');
  const [paypalEmail,             setPaypalEmail]             = useState('');
  const [preferredCurrency,       setPreferredCurrency]       = useState<'USD' | 'JPY' | 'EUR' | 'GBP'>('USD');

  // 同意チェックボックス
  const [confirmedPaypalName,     setConfirmedPaypalName]     = useState(false);
  const [confirmedTaxResponsibility, setConfirmedTaxResponsibility] = useState(false);
  const [confirmedDataDeletion,   setConfirmedDataDeletion]   = useState(false);

  // 送信状態
  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── バリデーション ─────────────────────────────────────────────────────────

  function isValidEmail(email: string): boolean {
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  }

  function canSubmit(): boolean {
    return (
      legalName.trim() !== '' &&
      residenceCountry.trim() !== '' &&
      addressLine1.trim() !== '' &&
      city.trim() !== '' &&
      postalCode.trim() !== '' &&
      country.trim() !== '' &&
      taxResidenceCountry.trim() !== '' &&
      domesticOrForeign !== undefined &&
      isValidEmail(paypalEmail) &&
      confirmedPaypalName &&
      confirmedTaxResponsibility &&
      confirmedDataDeletion
    );
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit() || submitting) return;

    setSubmitting(true);
    setSubmitError(null);

    // ⚠️ params の内容を Console log しないこと
    const { data, error } = await submitPrizeTaxSubmission({
      award_id:                           awardId,
      legal_name:                         legalName.trim(),
      display_name:                       displayName.trim(),
      residence_country:                  residenceCountry.trim(),
      address_line1:                      addressLine1.trim(),
      address_line2:                      addressLine2.trim() || null,
      city:                               city.trim(),
      region:                             region.trim() || null,
      postal_code:                        postalCode.trim(),
      country:                            country.trim(),
      tax_residence_country:              taxResidenceCountry.trim(),
      domestic_or_foreign:                domesticOrForeign,
      paypal_email:                       paypalEmail.trim(),
      preferred_currency:                 preferredCurrency,
      user_confirmed_legal_responsibility: confirmedTaxResponsibility,
      user_confirmed_paypal_name_match:    confirmedPaypalName,
    });

    setSubmitting(false);

    if (error) {
      // エラーに機微情報を含めない
      setSubmitError(error);
      return;
    }

    if (data) {
      onSuccess(data);
    }
  }

  // ── レンダリング ───────────────────────────────────────────────────────────

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        {/* ヘッダー */}
        <div style={s.header}>
          <h2 style={s.title}>Reward / Prize — Payout Information</h2>
          <button type="button" style={s.closeBtn} onClick={onClose} disabled={submitting}>
            ✕
          </button>
        </div>

        {/* 注意書き */}
        <div style={s.notice}>
          <p style={s.noticeText}>
            Reward / Prize の支払には、本人確認・税務確認・PayPal受取情報が必要です。<br />
            提出された情報は、Winner FileとしてPDF保存・紙保管・オフライン保存を行った後、<br />
            原則72時間以内にオンラインDB上の機微情報を削除します。
          </p>
          <p style={s.noticeText}>
            PayPal受取メールが誤っている場合、支払が保留または失敗する可能性があります。<br />
            税務申告・居住国情報の正確性は受賞者本人の責任です。
          </p>
        </div>

        <form onSubmit={handleSubmit} style={s.form}>

          {/* Legal name */}
          <label style={s.label}>
            Legal Name *
            <input
              style={s.input}
              type="text"
              value={legalName}
              onChange={e => setLegalName(e.target.value)}
              placeholder="Full legal name as it appears on official documents"
              required
              autoComplete="off"
            />
          </label>

          {/* Display name */}
          <label style={s.label}>
            Display Name (optional)
            <input
              style={s.input}
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Game display name (optional)"
              autoComplete="off"
            />
          </label>

          {/* Residence country */}
          <label style={s.label}>
            Residence Country *
            <input
              style={s.input}
              type="text"
              value={residenceCountry}
              onChange={e => setResidenceCountry(e.target.value)}
              placeholder="e.g. Japan"
              required
              autoComplete="off"
            />
          </label>

          {/* Address line 1 */}
          <label style={s.label}>
            Address Line 1 *
            <input
              style={s.input}
              type="text"
              value={addressLine1}
              onChange={e => setAddressLine1(e.target.value)}
              placeholder="Street address"
              required
              autoComplete="off"
            />
          </label>

          {/* Address line 2 */}
          <label style={s.label}>
            Address Line 2 (optional)
            <input
              style={s.input}
              type="text"
              value={addressLine2}
              onChange={e => setAddressLine2(e.target.value)}
              placeholder="Apartment, suite, etc. (optional)"
              autoComplete="off"
            />
          </label>

          {/* City */}
          <div style={s.row}>
            <label style={{ ...s.label, flex: 2 }}>
              City *
              <input
                style={s.input}
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                placeholder="City"
                required
                autoComplete="off"
              />
            </label>
            <label style={{ ...s.label, flex: 1 }}>
              Region / Prefecture (optional)
              <input
                style={s.input}
                type="text"
                value={region}
                onChange={e => setRegion(e.target.value)}
                placeholder="State / Prefecture"
                autoComplete="off"
              />
            </label>
          </div>

          {/* Postal code + Country */}
          <div style={s.row}>
            <label style={{ ...s.label, flex: 1 }}>
              Postal Code *
              <input
                style={s.input}
                type="text"
                value={postalCode}
                onChange={e => setPostalCode(e.target.value)}
                placeholder="Postal / ZIP code"
                required
                autoComplete="off"
              />
            </label>
            <label style={{ ...s.label, flex: 2 }}>
              Country *
              <input
                style={s.input}
                type="text"
                value={country}
                onChange={e => setCountry(e.target.value)}
                placeholder="e.g. Japan"
                required
                autoComplete="off"
              />
            </label>
          </div>

          {/* Tax residence country */}
          <label style={s.label}>
            Tax Residence Country *
            <input
              style={s.input}
              type="text"
              value={taxResidenceCountry}
              onChange={e => setTaxResidenceCountry(e.target.value)}
              placeholder="Country where you are a tax resident"
              required
              autoComplete="off"
            />
          </label>

          {/* Domestic / Foreign */}
          <label style={s.label}>
            Domestic / Foreign *
            <select
              style={s.select}
              value={domesticOrForeign}
              onChange={e => setDomesticOrForeign(e.target.value as 'domestic' | 'foreign' | 'unknown')}
              required
            >
              <option value="unknown">— Select —</option>
              <option value="domestic">Domestic</option>
              <option value="foreign">Foreign</option>
            </select>
          </label>

          {/* PayPal email */}
          <label style={s.label}>
            PayPal Receiving Email *
            <input
              style={s.input}
              type="email"
              value={paypalEmail}
              onChange={e => setPaypalEmail(e.target.value)}
              placeholder="your@paypal.com"
              required
              autoComplete="off"
            />
            {paypalEmail.trim() !== '' && !isValidEmail(paypalEmail) && (
              <span style={s.fieldError}>Please enter a valid email address.</span>
            )}
          </label>

          {/* Preferred currency */}
          <label style={s.label}>
            Preferred Currency *
            <select
              style={s.select}
              value={preferredCurrency}
              onChange={e => setPreferredCurrency(e.target.value as 'USD' | 'JPY' | 'EUR' | 'GBP')}
              required
            >
              <option value="USD">USD</option>
              <option value="JPY">JPY</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </label>

          {/* 同意チェックボックス */}
          <div style={s.checkboxSection}>
            <div style={s.checkboxSectionTitle}>Confirmations (all required)</div>

            <label style={s.checkboxLabel}>
              <input
                type="checkbox"
                checked={confirmedPaypalName}
                onChange={e => setConfirmedPaypalName(e.target.checked)}
              />
              <span style={s.checkboxText}>
                I confirm that my PayPal account name matches the legal name provided above.
              </span>
            </label>

            <label style={s.checkboxLabel}>
              <input
                type="checkbox"
                checked={confirmedTaxResponsibility}
                onChange={e => setConfirmedTaxResponsibility(e.target.checked)}
              />
              <span style={s.checkboxText}>
                I understand that tax reporting is my own responsibility.
              </span>
            </label>

            <label style={s.checkboxLabel}>
              <input
                type="checkbox"
                checked={confirmedDataDeletion}
                onChange={e => setConfirmedDataDeletion(e.target.checked)}
              />
              <span style={s.checkboxText}>
                I understand that my submitted information will be deleted from the online database
                within 72 hours after offline archiving.
              </span>
            </label>
          </div>

          {/* エラー表示（機微情報を含めない） */}
          {submitError && (
            <div style={s.errorBanner}>
              Submission failed. Please try again or contact admin.<br />
              <span style={s.errorDetail}>{submitError}</span>
            </div>
          )}

          {/* Submit */}
          <div style={s.actions}>
            <button type="button" style={s.cancelBtn} onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button
              type="submit"
              style={{ ...s.submitBtn, ...((!canSubmit() || submitting) ? s.submitBtnDisabled : {}) }}
              disabled={!canSubmit() || submitting}
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    zIndex: 9000,
    overflowY: 'auto',
    padding: '24px 16px',
  },
  modal: {
    background: '#fff',
    borderRadius: 10,
    padding: 24,
    maxWidth: 580,
    width: '100%',
    boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    borderBottom: '1px solid #eee',
    paddingBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: 700,
    margin: 0,
    color: '#111',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 18,
    cursor: 'pointer',
    color: '#888',
    padding: '2px 6px',
  },
  notice: {
    background: '#fff8e1',
    border: '1px solid #ffe082',
    borderRadius: 6,
    padding: '12px 14px',
    marginBottom: 20,
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 1.8,
    color: '#555',
    margin: '0 0 8px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    fontSize: 13,
    fontWeight: 600,
    color: '#333',
  },
  input: {
    border: '1px solid #ccc',
    borderRadius: 5,
    padding: '8px 10px',
    fontSize: 14,
    background: '#fff',
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
  },
  select: {
    border: '1px solid #ccc',
    borderRadius: 5,
    padding: '8px 10px',
    fontSize: 14,
    background: '#fff',
    width: '100%',
    boxSizing: 'border-box',
  },
  row: {
    display: 'flex',
    gap: 12,
  },
  fieldError: {
    fontSize: 12,
    color: '#c62828',
    marginTop: 2,
  },
  checkboxSection: {
    background: '#f9f9f9',
    border: '1px solid #e8e8e8',
    borderRadius: 6,
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  checkboxSectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 4,
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    cursor: 'pointer',
  },
  checkboxText: {
    fontSize: 13,
    color: '#333',
    lineHeight: 1.6,
  },
  errorBanner: {
    background: '#ffebee',
    border: '1px solid #ef9a9a',
    borderRadius: 5,
    padding: '10px 12px',
    fontSize: 13,
    color: '#b71c1c',
    lineHeight: 1.6,
  },
  errorDetail: {
    fontSize: 12,
    color: '#c62828',
    fontFamily: 'monospace',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    paddingTop: 8,
    borderTop: '1px solid #f0f0f0',
  },
  cancelBtn: {
    background: '#f5f5f5',
    border: '1px solid #ccc',
    borderRadius: 5,
    padding: '10px 20px',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    color: '#555',
    minHeight: 44,
  },
  submitBtn: {
    background: '#1a237e',
    color: '#fff',
    border: 'none',
    borderRadius: 5,
    padding: '10px 28px',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
    minHeight: 44,
    transition: 'opacity 0.15s',
  },
  submitBtnDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
};
