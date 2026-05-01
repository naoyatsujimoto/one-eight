interface ConfirmModalProps {
  open: boolean;
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ open, label, onConfirm, onCancel }: ConfirmModalProps) {
  if (!open) return null;
  return (
    <>
      <div className="backdrop open" onClick={onCancel} />
      <div className="result-modal">
        <div className="result-card">
          <div className="result-eyebrow">Confirm</div>
          <div className="result-title" style={{ fontSize: '18px', marginBottom: '8px' }}>
            {label}
          </div>
          <div className="result-actions">
            <button type="button" className="result-btn result-btn-primary" onClick={onConfirm}>
              Execute
            </button>
            <button type="button" className="result-btn" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
