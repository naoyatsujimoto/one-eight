import { useRef, useState } from 'react';

interface Props {
  onDismiss: () => void;
}

export function SplashScreen({ onDismiss }: Props) {
  const [turning, setTurning] = useState(false);
  const touchStartY = useRef<number | null>(null);

  function dismiss() {
    if (turning) return;
    setTurning(true);
    setTimeout(onDismiss, 680);
  }

  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (t) touchStartY.current = t.clientY;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartY.current === null) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dy = t.clientY - touchStartY.current;
    touchStartY.current = null;
    if (dy < -30) dismiss();
  }

  return (
    <div
      className={`splash-root${turning ? ' splash-turning' : ''}`}
      onClick={dismiss}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="button"
      tabIndex={0}
      aria-label="Continue to login"
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') dismiss(); }}
    >
      {/* Background image with slow zoom */}
      <div className="splash-bg" />

      {/* Overlay gradient for text legibility */}
      <div className="splash-overlay" />

      {/* Main copy */}
      <div className="splash-copy">
        <p className="splash-tagline">Imagine. Leave your mark.</p>
      </div>

      {/* Minimal hint */}
      <div className="splash-hint">Tap to continue</div>
    </div>
  );
}
