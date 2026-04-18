import { useEffect, useRef, useState } from 'react';

interface Step {
  caption: string;
  sub?: string;
  duration: number; // ms
  highlight?: string; // CSS class suffix for highlighted element
}

const STEPS: Step[] = [
  {
    caption: 'Select a Position',
    sub: 'Choose any empty square on the board.',
    duration: 2200,
  },
  {
    caption: 'Build at a Gate',
    sub: 'Place assets at one of the 4 gates linked to your position.',
    duration: 2200,
  },
  {
    caption: 'MASSIVE — Large pocket',
    sub: 'Fill the large diamond once. Powerful, but slow.',
    duration: 2400,
  },
  {
    caption: 'SELECTIVE — Middle × 2 gates',
    sub: 'Place in the middle pockets of two gates simultaneously.',
    duration: 2400,
  },
  {
    caption: 'QUAD — Small × up to 4 gates',
    sub: 'Spread small assets across up to 4 gates at once.',
    duration: 2400,
  },
  {
    caption: 'Capture a Position',
    sub: "If you dominate the most-built gate on an opponent's position — you can take it.",
    duration: 3000,
  },
  {
    caption: 'Can you capture?',
    sub: 'Your assets must outnumber the opponent\'s on the highest-value gate.',
    duration: 3000,
  },
  {
    caption: 'Control the board',
    sub: 'The player who dominates the most positions wins.',
    duration: 2600,
  },
];

// Simple animated board illustration — pure CSS/SVG
function TutorialBoard({ step }: { step: number }) {
  // Positions to highlight per step
  const posHighlight: Record<number, string[]> = {
    0: ['G'],
    1: ['G'],
    2: ['G'],
    3: ['G', 'A'],
    4: ['G', 'A', 'C', 'M'],
    5: ['G', 'H'],
    6: ['G', 'H'],
    7: ['A', 'B', 'C', 'D', 'G', 'H', 'I', 'J'],
  };
  const highlighted = posHighlight[step] ?? [];

  // Gate to highlight per step
  const gateHighlight: Record<number, number[]> = {
    1: [1],
    2: [1],
    3: [2, 12],
    4: [1, 4, 7, 10],
    5: [1],
    6: [1],
  };
  const hlGates = gateHighlight[step] ?? [];

  // Simple 3x5 grid positions
  const positions = [
    ['A','B','C'],
    ['D','E','F'],
    ['G','H','I'],
    ['J','K','L'],
    ['','M',''],
  ];

  // Black-owned positions
  const blackOwned = new Set(
    step >= 2 ? ['G'] :
    step >= 0 ? [] : []
  );
  const whiteOwned = new Set(
    step >= 5 ? ['H'] :
    step >= 0 ? [] : []
  );
  // Capture state
  const captured = step >= 6 ? new Set(['H']) : new Set<string>();
  const capturedBy = 'black';

  return (
    <div className="tut-board-wrap">
      {/* Position grid */}
      <div className="tut-pos-grid">
        {positions.map((row, ri) =>
          row.map((id, ci) => {
            if (!id) return <div key={`${ri}-${ci}`} className="tut-pos-empty" />;
            const isHighlighted = highlighted.includes(id);
            const isBlack = blackOwned.has(id) || (captured.has(id) && capturedBy === 'black');
            const isWhite = whiteOwned.has(id) && !captured.has(id);
            return (
              <div
                key={id}
                className={[
                  'tut-pos',
                  isHighlighted ? 'tut-pos-hl' : '',
                  isBlack ? 'tut-pos-black' : '',
                  isWhite ? 'tut-pos-white' : '',
                  captured.has(id) ? 'tut-pos-captured' : '',
                ].filter(Boolean).join(' ')}
              >
                <span className="tut-pos-id">{id}</span>
                {isBlack && <span className="tut-dot tut-dot-black" />}
                {isWhite && <span className="tut-dot tut-dot-white" />}
              </div>
            );
          })
        )}
      </div>

      {/* Gate indicators */}
      <div className="tut-gates">
        {[1,2,3,4,5,6,7,8,9,10,11,12].map(g => (
          <div
            key={g}
            className={[
              'tut-gate',
              hlGates.includes(g) ? 'tut-gate-hl' : '',
            ].filter(Boolean).join(' ')}
          >
            {g}
          </div>
        ))}
      </div>
    </div>
  );
}

interface TutorialScreenProps {
  onComplete: () => void;
  onSkip: () => void;
}

export function TutorialScreen({ onComplete, onSkip }: TutorialScreenProps) {
  const [step, setStep] = useState(0);
  const [fade, setFade] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (step >= STEPS.length) {
      onComplete();
      return;
    }
    const s = STEPS[step]!;
    timerRef.current = setTimeout(() => {
      setFade(false);
      setTimeout(() => {
        setStep(prev => prev + 1);
        setFade(true);
      }, 400);
    }, s.duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [step, onComplete]);

  const currentIdx = Math.min(step, STEPS.length - 1);
  const current = STEPS[currentIdx]!
  const progress = Math.min(step / STEPS.length, 1);

  return (
    <div className="tutorial-screen">
      {/* Progress bar */}
      <div className="tut-progress-bar">
        <div className="tut-progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>

      {/* Skip */}
      <button type="button" className="tut-skip" onClick={onSkip}>Skip</button>

      {/* Board */}
      <div className="tut-board-area">
        <TutorialBoard step={Math.min(step, STEPS.length - 1)} />
      </div>

      {/* Caption */}
      <div className={`tut-caption${fade ? '' : ' tut-caption-fade'}`}>
        <div className="tut-caption-title">{current?.caption}</div>
        {current?.sub && <div className="tut-caption-sub">{current.sub}</div>}
      </div>

      {/* Step dots */}
      <div className="tut-dots">
        {STEPS.map((_, i) => (
          <span key={i} className={`tut-dot-nav${i === step ? ' active' : i < step ? ' done' : ''}`} />
        ))}
      </div>
    </div>
  );
}
