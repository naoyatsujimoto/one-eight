import { useRef, useEffect, useState, useCallback } from 'react';
import { POSITION_TO_GATES } from '../game/constants';
import { canMassiveBuild, canSelectiveBuild, canQuadBuild } from '../game/build';
import type { GameState, GateId, PositionId } from '../game/types';
import type { BoardBuildState } from '../app/App';

function OwnerDot({ owner }: { owner: 'black' | 'white' | null }) {
  return (
    <span
      className={`owner-dot owner-dot-${owner ?? 'none'}`}
      aria-label={owner ?? 'empty'}
    />
  );
}

type GateType =
  | 'top-edge'
  | 'bottom-edge'
  | 'left-edge'
  | 'right-edge'
  | 'corner-tl'
  | 'corner-tr'
  | 'corner-br'
  | 'corner-bl';

const GATE_TYPE_MAP: Record<number, GateType> = {
  1:  'corner-tl',
  2:  'top-edge',
  3:  'top-edge',
  4:  'corner-tr',
  5:  'right-edge',
  6:  'right-edge',
  7:  'corner-br',
  8:  'bottom-edge',
  9:  'bottom-edge',
  10: 'corner-bl',
  11: 'left-edge',
  12: 'left-edge',
};

// Pocket-level click states
type PocketClickState = 'disabled' | 'clickable' | 'selected';

interface PocketStates {
  large: PocketClickState;
  middle: PocketClickState;
  small: PocketClickState;
}

/**
 * Determine per-pocket clickability for a gate given current build state.
 * Rules:
 * - Position not selected → all disabled
 * - Gate not related → all disabled
 * - During selective → only middle clickable (large/small disabled)
 * - During quad → only small clickable (large/middle disabled)
 * - Otherwise (mode=none): each pocket type independently clickable if slot available
 */
function getPocketStates(
  gateId: GateId,
  gate: GameState['gates'][GateId],
  isRelated: boolean,
  hasPosition: boolean,
  buildState: BoardBuildState,
  allGates: GameState['gates'],
  relatedGates: GateId[],
): PocketStates {
  const disabled: PocketStates = { large: 'disabled', middle: 'disabled', small: 'disabled' };

  if (!hasPosition || !isRelated) return disabled;

  const { mode, selectiveFirst, quadSelected } = buildState;

  // ── Selective in progress ──────────────────────────────────────────────────
  if (mode === 'selective') {
    // large and small always disabled during selective
    let middle: PocketClickState = 'disabled';
    if (selectiveFirst === gateId) {
      middle = 'selected'; // re-click to deselect
    } else if (selectiveFirst === null) {
      // first pick: any related gate with a middle slot open
      middle = gate.middleSlots.some((s) => s === null) ? 'clickable' : 'disabled';
    } else {
      // second pick: different gate, must satisfy canSelectiveBuild
      middle = canSelectiveBuild(allGates[selectiveFirst], gate) ? 'clickable' : 'disabled';
    }
    return { large: 'disabled', middle, small: 'disabled' };
  }

  // ── Quad in progress ──────────────────────────────────────────────────────
  if (mode === 'quad') {
    // large and middle always disabled during quad
    let small: PocketClickState = 'disabled';
    if (quadSelected.includes(gateId)) {
      small = 'selected'; // re-click to deselect
    } else if (gate.smallSlots.some((s) => s === null)) {
      small = 'clickable';
    }
    return { large: 'disabled', middle: 'disabled', small };
  }

  // ── mode === 'none': each pocket independent ──────────────────────────────
  // Large → Massive available?
  const large: PocketClickState = canMassiveBuild(gate) ? 'clickable' : 'disabled';

  // Middle → Selective possible from this gate?
  // (need at least one middle slot open; we'll validate pair on second click)
  const middle: PocketClickState = gate.middleSlots.some((s) => s === null) ? 'clickable' : 'disabled';

  // Small → Quad available from this gate?
  const small: PocketClickState = gate.smallSlots.some((s) => s === null) ? 'clickable' : 'disabled';

  return { large, middle, small };
}

// ── DiamondPip (clickable variant) ───────────────────────────────────────────

interface DiamondPipProps {
  owner: 'black' | 'white' | null;
  size: 'large' | 'middle' | 'small';
  clickState: PocketClickState;
  onClick?: () => void;
}

/**
 * SilverCap — boomerang / L-shaped silver patch.
 *
 * The pip element is a square (viewBox 0 0 1 1) rotated 45° so that:
 *   (0,0) TL corner → TOP    vertex of diamond  (white player)
 *   (1,1) BR corner → BOTTOM vertex of diamond  (black player)
 *
 * Shape (3×3 grid, side = 1/3 each):
 *   Filled cells (white): 1,2,3,4,7  =  top row + left column
 *   Filled cells (black): 3,6,7,8,9  =  bottom row + right column  (180° mirror)
 *
 * Only two corners are rounded (r = 0.10):
 *   white: end of top row  at (1,   1/3)  and end of left col at (1/3, 1)
 *   black: mirror          at (0,   2/3)  and                    (2/3, 0)
 *
 * All other corners (tile corners + inner concave corner) stay sharp.
 *
 * Arc rule: right-turn convex corner in a CW path → sweep=1.
 */
function SilverCap({ owner }: { owner: 'black' | 'white' }) {
  const r   = 0.20;         // rounding radius (all 6 corners)
  const t   = 1 / 3;        // cell size
  const t2  = 2 / 3;

  const gradId = `scap-${owner}`;

  let path: string;
  let gradCx: number;
  let gradCy: number;

  const scaleStyle = owner === 'white'
    ? { transformOrigin: '0% 0%', transform: 'scale(0.8)' }
    : { transformOrigin: '100% 100%', transform: 'scale(0.8)' };

  if (owner === 'white') {
    // L-shape: top row + left col. All 6 corners rounded.
    // Convex corners → sweep=1; concave inner corner (t,t) → sweep=0
    path = [
      `M ${r},0`,
      `L ${1 - r},0`,
      `A ${r},${r} 0 0,1 1,${r}`,            // round TR (1,0)
      `L 1,${t - r}`,
      `A ${r},${r} 0 0,1 ${1 - r},${t}`,     // round arm end (1,t)
      `L ${t + r},${t}`,
      `A ${r},${r} 0 0,0 ${t},${t + r}`,     // round inner concave (t,t) — sweep=0
      `L ${t},${1 - r}`,
      `A ${r},${r} 0 0,1 ${t - r},1`,        // round arm end (t,1)
      `L ${r},1`,
      `A ${r},${r} 0 0,1 0,${1 - r}`,        // round BL (0,1)
      `L 0,${r}`,
      `A ${r},${r} 0 0,1 ${r},0`,            // round TL (0,0)
      `Z`,
    ].join(' ');
    gradCx = 0; gradCy = 0;
  } else {
    // 180° mirror of white
    path = [
      `M ${1 - r},1`,
      `L ${r},1`,
      `A ${r},${r} 0 0,1 0,${1 - r}`,        // round BL (0,1)
      `L 0,${t2 + r}`,
      `A ${r},${r} 0 0,1 ${r},${t2}`,        // round arm end (0,t2)
      `L ${t2 - r},${t2}`,
      `A ${r},${r} 0 0,0 ${t2},${t2 - r}`,   // round inner concave (t2,t2) — sweep=0
      `L ${t2},${r}`,
      `A ${r},${r} 0 0,1 ${t2 + r},0`,       // round arm end (t2,0)
      `L ${1 - r},0`,
      `A ${r},${r} 0 0,1 1,${r}`,            // round TR (1,0)
      `L 1,${1 - r}`,
      `A ${r},${r} 0 0,1 ${1 - r},1`,        // round BR (1,1)
      `Z`,
    ].join(' ');
    gradCx = 1; gradCy = 1;
  }

  return (
    <svg
      viewBox="0 0 1 1"
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', ...scaleStyle }}
    >
      <defs>
        <radialGradient
          id={gradId}
          cx={gradCx} cy={gradCy} r="1"
          gradientUnits="objectBoundingBox"
        >
          <stop offset="0%"   stopColor="#f4f4f4" />
          <stop offset="35%"  stopColor="#d4d4d4" />
          <stop offset="70%"  stopColor="#b0b0b0" />
          <stop offset="100%" stopColor="#909090" />
        </radialGradient>
      </defs>
      <path d={path} fill={`url(#${gradId})`} opacity="0.93" />
    </svg>
  );
}

function DiamondPip({ owner, size, clickState, onClick }: DiamondPipProps) {
  const interactive = clickState === 'clickable' || clickState === 'selected';
  const cls = [
    `diamond-pip`,
    `diamond-pip-${owner ?? 'none'}`,
    `diamond-pip-size-${size}`,
    clickState === 'clickable' ? 'pocket-clickable' : '',
    clickState === 'selected' ? 'pocket-selected' : '',
    clickState === 'disabled' ? 'pocket-disabled' : '',
    (owner === 'black' || owner === 'white') ? 'diamond-pip-occupied' : '',
  ].filter(Boolean).join(' ');

  return (
    <span
      className={cls}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={clickState === 'selected' ? true : undefined}
      onClick={interactive ? onClick : undefined}
      onKeyDown={interactive && onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
      style={{ position: 'relative' }}
    >
      {(owner === 'black' || owner === 'white') && <SilverCap owner={owner} />}
    </span>
  );
}

// ── Gate cluster renderers ────────────────────────────────────────────────────

interface ClusterProps {
  gate: GameState['gates'][GateId];
  gateType: GateType;
  ps: PocketStates;
  onLarge: () => void;
  onMiddle: () => void;
  onSmall: () => void;
}

function renderGateCluster({ gate, gateType, ps, onLarge, onMiddle, onSmall }: ClusterProps) {
  const L = gate.largeSlots;
  const M = gate.middleSlots;
  const S = gate.smallSlots;

  const SmallTL = () => <div className="gate-corner-tl"><DiamondPip owner={S[0]?.owner ?? null} size="small" clickState={ps.small} onClick={onSmall} /></div>;
  const SmallTR = () => <div className="gate-corner-tr"><DiamondPip owner={S[1]?.owner ?? null} size="small" clickState={ps.small} onClick={onSmall} /></div>;
  const SmallBL = () => <div className="gate-corner-bl"><DiamondPip owner={S[2]?.owner ?? null} size="small" clickState={ps.small} onClick={onSmall} /></div>;
  const SmallBR = () => <div className="gate-corner-br"><DiamondPip owner={S[3]?.owner ?? null} size="small" clickState={ps.small} onClick={onSmall} /></div>;

  const isCorner = gateType.startsWith('corner');
  const DbgBorder = DEBUG_GATES
    ? () => (
        <div
          className={`dbg-gate-border ${isCorner ? 'dbg-gate-border-corner' : 'dbg-gate-border-edge'}`}
          aria-hidden="true"
        >
          <div className="dbg-gate-center" />
        </div>
      )
    : () => null;

  switch (gateType) {
    case 'top-edge':
    case 'bottom-edge':
    case 'corner-tl':
    case 'corner-tr':
    case 'corner-br':
    case 'corner-bl':
      return (
        <div className={`gate-cluster gate-cluster-${gateType}`}>
          <DbgBorder />
          <SmallTL /><SmallTR /><SmallBL /><SmallBR />
          <div className="gate-col-1row-center">
            <DiamondPip owner={M[0]?.owner ?? null} size="middle" clickState={ps.middle} onClick={onMiddle} />
          </div>
          <div className="gate-col-tb">
            <DiamondPip owner={L[0]?.owner ?? null} size="large" clickState={ps.large} onClick={onLarge} />
            <DiamondPip owner={L[1]?.owner ?? null} size="large" clickState={ps.large} onClick={onLarge} />
          </div>
          <div className="gate-col-1row-center">
            <DiamondPip owner={M[1]?.owner ?? null} size="middle" clickState={ps.middle} onClick={onMiddle} />
          </div>
        </div>
      );

    case 'left-edge':
    case 'right-edge':
      return (
        <div className={`gate-cluster gate-cluster-${gateType}`}>
          <DbgBorder />
          <SmallTL /><SmallTR /><SmallBL /><SmallBR />
          <div className="gate-row-1col-center">
            <DiamondPip owner={M[0]?.owner ?? null} size="middle" clickState={ps.middle} onClick={onMiddle} />
          </div>
          <div className="gate-row-lr">
            <DiamondPip owner={L[0]?.owner ?? null} size="large" clickState={ps.large} onClick={onLarge} />
            <DiamondPip owner={L[1]?.owner ?? null} size="large" clickState={ps.large} onClick={onLarge} />
          </div>
          <div className="gate-row-1col-center">
            <DiamondPip owner={M[1]?.owner ?? null} size="middle" clickState={ps.middle} onClick={onMiddle} />
          </div>
        </div>
      );

    default:
      return null;
  }
}

// ── GateCard ─────────────────────────────────────────────────────────────────

function GateCard({
  gate,
  gateId,
  isRelated,
  hasPosition,
  gateType,
  ps,
  isLastOpponentBuild,
  onLarge,
  onMiddle,
  onSmall,
}: {
  gate: GameState['gates'][GateId];
  gateId: GateId;
  isRelated: boolean;
  hasPosition: boolean;
  gateType: GateType;
  ps: PocketStates;
  isLastOpponentBuild: boolean;
  onLarge: () => void;
  onMiddle: () => void;
  onSmall: () => void;
}) {
  const anySelected = ps.large === 'selected' || ps.middle === 'selected' || ps.small === 'selected';
  const cardClass = [
    'gate-card',
    hasPosition ? (isRelated ? 'gate-card-active' : 'gate-card-inactive') : '',
    anySelected ? 'gate-card-selected' : '',
    isLastOpponentBuild && !anySelected ? 'last-opponent-move' : '',
  ].filter(Boolean).join(' ');

  const isCorner = gateType.startsWith('corner');

  return (
    <div
      className={cardClass}
      data-gate-id={gateId}
      aria-label={`Gate ${gateId}`}
    >
      <div className="gate-card-id">{gateId}</div>
      {renderGateCluster({ gate, gateType, ps, onLarge, onMiddle, onSmall })}
    </div>
  );
}

// ── Debug gate-border overlay (active only when ?debug_gates present in URL) ─
const DEBUG_GATES =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('debug_gates');

// ── Board layout constants ────────────────────────────────────────────────────

const BOARD_POSITIONS: PositionId[] = ['A','B','C','D','E','F','G','H','I','J','K','L','M'];

const POSITION_COORDS: Record<PositionId, { left: number; top: number }> = {
  A: { left: 0,   top: 0   },
  B: { left: 146, top: 0   },
  C: { left: 292, top: 0   },
  D: { left: 73,  top: 73  },
  E: { left: 219, top: 73  },
  F: { left: 0,   top: 146 },
  G: { left: 146, top: 146 },
  H: { left: 292, top: 146 },
  I: { left: 73,  top: 219 },
  J: { left: 219, top: 219 },
  K: { left: 0,   top: 292 },
  L: { left: 146, top: 292 },
  M: { left: 292, top: 292 },
};

const ALL_GATES: GateId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// GATE_COORDS: re-centred on octagon centre (300, 340).
// Upper gates (1-5, 12) are mostly unchanged; lower gates (6-11) y-values
// corrected by +48 to restore y-symmetry around y=340.
// Corner gates (1, 4, 7, 10) left adjusted by ±2 for x-symmetry around x=300.
// Result: every corner is equidistant from the position-grid corner (~dx=40, dy=64).
const GATE_COORDS: Record<number, { left: number; top: number }> = {
  1:  { left: 56,  top: 55  },  // centre (104, 103) — symmetric with Gate 7
  2:  { left: 220, top: 25  },  // centre (268, 73)  — base point (268, 121)
  3:  { left: 366, top: 25  },  // centre (414, 73)  — base point (414, 121)
  4:  { left: 529, top: 55  },  // centre (577, 103) — symmetric with Gate 10
  5:  { left: 560, top: 219 },  // centre (608, 267) — base point (560, 267)
  6:  { left: 560, top: 365 },  // centre (608, 413) — base point (560, 413)
  7:  { left: 529, top: 528 },  // centre (577, 576) — symmetric with Gate 1
  8:  { left: 366, top: 559 },  // centre (414, 607) — base point (414, 559)
  9:  { left: 220, top: 559 },  // centre (268, 607) — base point (268, 559)
  10: { left: 56,  top: 528 },  // centre (104, 576) — symmetric with Gate 4
  11: { left: 26,  top: 365 },  // centre (74, 413)  — base point (122, 413)
  12: { left: 26,  top: 219 },  // centre (74, 267)  — base point (122, 267)
};

interface LineCoord { x1: number; y1: number; x2: number; y2: number }

// ── Board component ───────────────────────────────────────────────────────────

export function Board({
  state,
  buildState,
  onSelectPosition,
  onLargePocketClick,
  onMiddlePocketClick,
  onSmallPocketClick,
}: {
  state: GameState;
  buildState: BoardBuildState;
  onSelectPosition: (positionId: PositionId) => void;
  onLargePocketClick: (gateId: GateId) => void;
  onMiddlePocketClick: (gateId: GateId) => void;
  onSmallPocketClick: (gateId: GateId) => void;
}) {
  const selectedId = state.selectedPosition;
  const relatedGates: GateId[] = selectedId ? POSITION_TO_GATES[selectedId] : [];

  // Derive the last opponent's positioned move for subtle highlight
  const lastOpponentPositionId: PositionId | null = (() => {
    if (state.history.length === 0) return null;
    const last = state.history[state.history.length - 1];
    if (!last) return null;
    if (last.player === state.currentPlayer) return null; // opponent's last move
    if (last.positioning === 'P') return null; // skip/pass — no position
    return last.positioning as PositionId;
  })();

  // Derive the last opponent's built gate(s) for subtle highlight
  const lastOpponentBuildGateIds: Set<GateId> = (() => {
    if (state.history.length === 0) return new Set();
    const last = state.history[state.history.length - 1];
    if (!last) return new Set();
    if (last.player === state.currentPlayer) return new Set(); // opponent's last move
    if (last.build.type === 'skip') return new Set();
    if (last.build.type === 'massive' && last.build.gate !== null) {
      return new Set([last.build.gate]);
    }
    if (last.build.type === 'selective') {
      return new Set(last.build.gates);
    }
    if (last.build.type === 'quad') {
      return new Set(last.build.placedGateIds);
    }
    return new Set();
  })();

  const containerRef = useRef<HTMLDivElement>(null);
  const scalerRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<LineCoord[]>([]);

  // ── Responsive board scaling ──────────────────────────────────────────────
  const BOARD_W = 680;
  const BOARD_H = 680;

  const applyScale = useCallback(() => {
    const scaler = scalerRef.current;
    if (!scaler) return;
    const parent = scaler.parentElement;
    if (!parent) return;
    const isMobile = window.innerWidth <= 600;
    const safetyMargin = isMobile ? 8 : 8;
    const scaleCap = isMobile ? 0.60 : 1;
    // Use parent.clientWidth for available space.
    // This avoids measuring the scaler itself (whose width JS is about to override)
    // and correctly reflects the panel's content width.
    const raw = parent.clientWidth > 0 ? parent.clientWidth : 320;
    const available = Math.max(0, raw - safetyMargin);
    const scale = Math.min(scaleCap, available / BOARD_W);
    scaler.style.setProperty('--board-scale', String(scale));
    scaler.style.height = `${Math.ceil(BOARD_H * scale)}px`;
    if (isMobile) {
      // Shrink scaler to the post-scale visual width so CSS `margin: 0 auto`
      // can center it inside the panel — no margin-left math needed on board-inner.
      scaler.style.width = `${Math.ceil(BOARD_W * scale)}px`;
    } else {
      scaler.style.removeProperty('width');
    }
    // Remove legacy left-offset variable (centering is now done via scaler width + margin auto)
    scaler.style.removeProperty('--board-left-offset');
  }, []);

  useEffect(() => {
    applyScale();
    const ro = new ResizeObserver(applyScale);
    if (scalerRef.current?.parentElement) ro.observe(scalerRef.current.parentElement);
    return () => ro.disconnect();
  }, [applyScale]);

  useEffect(() => {
    if (!selectedId || !containerRef.current) {
      setLines([]);
      return;
    }
    const container = containerRef.current;
    const cRect = container.getBoundingClientRect();

    // Compute CSS-transform scale (board-inner may be scaled by a parent wrapper).
    // offsetWidth is the layout-space width (always 600); cRect.width is the
    // viewport-space width after transform. Dividing coords by `scale` converts
    // them back to the SVG's internal coordinate space (0-600).
    const scale = container.offsetWidth > 0 ? cRect.width / container.offsetWidth : 1;

    const posBtn = container.querySelector<HTMLElement>(`[data-pos-id="${selectedId}"]`);
    if (!posBtn) { setLines([]); return; }
    const pRect = posBtn.getBoundingClientRect();
    const posX = (pRect.left + pRect.width / 2 - cRect.left) / scale;
    const posY = (pRect.top + pRect.height / 2 - cRect.top) / scale;

    const newLines: LineCoord[] = [];
    for (const gateId of relatedGates) {
      const gateEl = container.querySelector<HTMLElement>(`[data-gate-id="${gateId}"]`);
      if (!gateEl) continue;
      const gRect = gateEl.getBoundingClientRect();
      const gateType: GateType = GATE_TYPE_MAP[gateId] ?? 'top-edge';
      const centerX = (gRect.left + gRect.width / 2 - cRect.left) / scale;
      const centerY = (gRect.top + gRect.height / 2 - cRect.top) / scale;
      // Edge gates: target the midpoint of the position-facing edge (基準点).
      // Corner gates: use center as-is.
      let x2: number;
      let y2: number;
      switch (gateType) {
        case 'top-edge':
          x2 = centerX;
          y2 = (gRect.bottom - cRect.top) / scale;
          break;
        case 'bottom-edge':
          x2 = centerX;
          y2 = (gRect.top - cRect.top) / scale;
          break;
        case 'left-edge':
          x2 = (gRect.right - cRect.left) / scale;
          y2 = centerY;
          break;
        case 'right-edge':
          x2 = (gRect.left - cRect.left) / scale;
          y2 = centerY;
          break;
        default:
          // Corner gates: use center
          x2 = centerX;
          y2 = centerY;
      }
      newLines.push({ x1: posX, y1: posY, x2, y2 });
    }
    setLines(newLines);
  }, [selectedId, relatedGates]);

  return (
    <section className="panel board-panel">
      <h2 className="board-title">
        Board
        {relatedGates.length > 0 && (
          <span className="gates-related-hint">related: {relatedGates.join(', ')}</span>
        )}
      </h2>

      <div className="board-inner-scaler" ref={scalerRef}>
      <div className="board-inner" ref={containerRef}>
        {/* Octagonal board outline */}
        <svg className="board-octagon-svg" aria-hidden="true">
          <polygon
            points="72,0 608,0 680,72 680,608 608,680 72,680 0,608 0,72"
            className="board-octagon-outer"
          />
          <polygon
            points="78,6 602,6 674,78 674,602 602,674 78,674 6,602 6,78"
            className="board-octagon-inner"

          />
        </svg>

        {/* Connection lines */}
        {lines.length > 0 && (
          <svg className="board-connection-svg" aria-hidden="true">
            {lines.map((l, i) => (
              <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className="board-connection-line" />
            ))}
          </svg>
        )}

        {/* Gates */}
        {ALL_GATES.map((gateId) => {
          const coord = GATE_COORDS[gateId];
          if (!coord) return null;
          const gateType: GateType = GATE_TYPE_MAP[gateId] ?? 'top-edge';
          const isRelated = relatedGates.includes(gateId);
          const ps = getPocketStates(
            gateId,
            state.gates[gateId],
            isRelated,
            selectedId !== null,
            buildState,
            state.gates,
            relatedGates,
          );
          return (
            <div key={gateId} style={{ position: 'absolute', left: coord.left, top: coord.top }}>
              <GateCard
                gate={state.gates[gateId]}
                gateId={gateId}
                isRelated={isRelated}
                hasPosition={selectedId !== null}
                gateType={gateType}
                ps={ps}
                isLastOpponentBuild={lastOpponentBuildGateIds.has(gateId)}
                onLarge={() => onLargePocketClick(gateId)}
                onMiddle={() => onMiddlePocketClick(gateId)}
                onSmall={() => onSmallPocketClick(gateId)}
              />
            </div>
          );
        })}

        {/* Position grid */}
        {/* position-grid top=155 → centre (300.5, 339.5) ≈ octagon centre (300, 340) */}
        <div className="position-grid" style={{ position: 'absolute', left: 156, top: 155 }}>
          {BOARD_POSITIONS.map((id) => {
            const pos = state.positions[id];
            const isSelected = state.selectedPosition === id;
            const displayOwner = isSelected ? state.pendingPositionOwner : pos.owner;
            const coord = POSITION_COORDS[id];
            return (
              <button
                key={id}
                data-pos-id={id}
                className={[
                  'position-btn',
                  isSelected ? 'selected' : '',
                  !isSelected && id === lastOpponentPositionId ? 'last-opponent-move' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => onSelectPosition(id)}
                type="button"
                aria-pressed={isSelected}
                style={{ position: 'absolute', left: coord.left, top: coord.top }}
              >
                <span className="pos-id">{id}</span>
                <OwnerDot owner={displayOwner} />
              </button>
            );
          })}
        </div>
      </div>
      </div>{/* board-inner-scaler */}
    </section>
  );
}
