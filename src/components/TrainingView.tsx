import { useLang } from '../lib/lang';

interface TrainingViewProps {
  onExit: () => void;
}

export function TrainingView({ onExit }: TrainingViewProps) {
  const { t } = useLang();

  return (
    <div className="screen-wrapper" style={{ background: '#ffffff', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px' }}>
        <button
          type="button"
          className="mode-modal-cancel"
          onClick={onExit}
          style={{ marginBottom: '0' }}
        >
          Back
        </button>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', gap: '12px' }}>
        <div className="result-eyebrow">{t.trainingTitle}</div>
        <div className="mode-modal-title">{t.trainingRecordeTitle}</div>
        <p style={{ textAlign: 'center', color: '#5c5c5c', fontSize: '14px', marginTop: '8px' }}>
          {t.trainingPlaceholderMsg}
        </p>
      </div>
    </div>
  );
}
