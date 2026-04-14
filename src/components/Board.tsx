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

function DiamondPip({ owner, size, clickState, onClick }: DiamondPipProps) {
  const interactive = clickState === 'clickable' || clickState === 'selected';
  const cls = [
    `diamond-pip`,
    `diamond-pip-${owner ?? 'none'}`,
    `diamond-pip-size-${size}`,
    clickState === 'clickable' ? 'pocket-clickable' : '',
    clickState === 'selected' ? 'pocket-selected' : '',
    clickState === 'disabled' ? 'pocket-disabled' : '',
  ].filter(Boolean).join(' ');

  return (
    <span
      className={cls}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={clickState === 'selected' ? true : undefined}
      onClick={interactive ? onClick : undefined}
      onKeyDown={interactive && onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
    />
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

  switch (gateType) {
    case 'top-edge':
    case 'bottom-edge':
    case 'corner-tl':
    case 'corner-tr':
    case 'corner-br':
    case 'corner-bl':
      return (
        <div className={`gate-cluster gate-cluster-${gateType}`}>
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
  onLarge: () => void;
  onMiddle: () => void;
  onSmall: () => void;
}) {
  const anySelected = ps.large === 'selected' || ps.middle === 'selected' || ps.small === 'selected';
  const cardClass = [
    'gate-card',
    hasPosition ? (isRelated ? 'gate-card-active' : 'gate-card-inactive') : '',
    anySelected ? 'gate-card-selected' : '',
  ].filter(Boolean).join(' ');

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

const GATE_COORDS: Record<number, { left: number; top: number }> = {
  1:  { left: 25,  top: 43  },
  2:  { left: 172, top: 8   },
  3:  { left: 328, top: 8   },
  4:  { left: 475, top: 43  },
  5:  { left: 500, top: 196 },
  6:  { left: 500, top: 342 },
  7:  { left: 475, top: 493 },
  8:  { left: 328, top: 528 },
  9:  { left: 172, top: 528 },
  10: { left: 25,  top: 493 },
  11: { left: 0,   top: 342 },
  12: { left: 0,   top: 196 },
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

  const containerRef = useRef<HTMLDivElement>(null);
  const scalerRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<LineCoord[]>([]);

  // ── Responsive board scaling ──────────────────────────────────────────────
  const BOARD_W = 600;
  const BOARD_H = 680;

  const applyScale = useCallback(() => {
    const scaler = scalerRef.current;
    if (!scaler) return;
    const parent = scaler.parentElement;
    if (!parent) return;
    const isMobile = window.innerWidth <= 600;
    const safetyMargin = isMobile ? 16 : 8;
    const scaleCap = isMobile ? 0.53 : 1;
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
      newLines.push({
        x1: posX, y1: posY,
        x2: (gRect.left + gRect.width / 2 - cRect.left) / scale,
        y2: (gRect.top + gRect.height / 2 - cRect.top) / scale,
      });
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
            points="72,0 528,0 600,72 600,608 528,680 72,680 0,608 0,72"
            className="board-octagon-outer"
          />
          <polygon
            points="78,6 522,6 594,78 594,602 522,674 78,674 6,602 6,78"
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
                onLarge={() => onLargePocketClick(gateId)}
                onMiddle={() => onMiddlePocketClick(gateId)}
                onSmall={() => onSmallPocketClick(gateId)}
              />
            </div>
          );
        })}

        {/* Position grid */}
        <div className="position-grid" style={{ position: 'absolute', left: 116, top: 146 }}>
          {BOARD_POSITIONS.map((id) => {
            const pos = state.positions[id];
            const isSelected = state.selectedPosition === id;
            const coord = POSITION_COORDS[id];
            return (
              <button
                key={id}
                data-pos-id={id}
                className={`position-btn owner-${pos.owner ?? 'none'}${isSelected ? ' selected' : ''}`}
                onClick={() => onSelectPosition(id)}
                type="button"
                aria-pressed={isSelected}
                style={{ position: 'absolute', left: coord.left, top: coord.top }}
              >
                <span className="pos-id">{id}</span>
                <OwnerDot owner={pos.owner} />
                <span className="pos-gates">G{POSITION_TO_GATES[id].join(' ')}</span>
              </button>
            );
          })}
        </div>
      </div>
      </div>{/* board-inner-scaler */}
    </section>
  );
}
