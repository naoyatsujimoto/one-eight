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
      <div style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        pointerEvents: 'none',
      }}>
        <div style={{
          background: '#fff',
          borderRadius: '16px',
          padding: '24px 28px',
          width: '80%',
          maxWidth: '340px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          pointerEvents: 'auto',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.12em', color: '#999', marginBottom: '10px', textTransform: 'uppercase' }}>
            Confirm
          </div>
          <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '20px', wordBreak: 'break-all' }}>
            {label}
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={onConfirm}
              style={{
                background: '#111',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 24px',
                fontSize: '13px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                cursor: 'pointer',
              }}
            >
              EXECUTE
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={{
                background: '#fff',
                color: '#111',
                border: '1.5px solid #ccc',
                borderRadius: '8px',
                padding: '10px 24px',
                fontSize: '13px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                cursor: 'pointer',
              }}
            >
              CANCEL
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
