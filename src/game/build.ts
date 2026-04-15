import { POSITION_TO_GATES } from './constants';
import type { Asset, AssetSize, GateId, GateState, Player, PositionId } from './types';

export function assetValue(size: AssetSize): number {
  if (size === 'small') return 1;
  if (size === 'middle') return 8;
  return 64;
}

export function gateTotalValue(gate: GateState): number {
  return [...gate.largeSlots, ...gate.middleSlots, ...gate.smallSlots]
    .filter((asset): asset is Asset => asset !== null)
    .reduce((sum, asset) => sum + assetValue(asset.size), 0);
}

export function gatePlayerValue(gate: GateState, player: Player): number {
  return [...gate.largeSlots, ...gate.middleSlots, ...gate.smallSlots]
    .filter((asset): asset is Asset => asset !== null)
    .filter((asset) => asset.owner === player)
    .reduce((sum, asset) => sum + assetValue(asset.size), 0);
}

/**
 * Gates 5, 6, 11, 12 have a horizontal layout (left-right for large slots,
 * top-bottom for middle slots). All other gates use a vertical layout.
 *
 * Visual mapping per layout:
 *   Vertical gates  : largeSlots[0]=top,  largeSlots[1]=bottom
 *                     middleSlots[0]=left, middleSlots[1]=right
 *   Horizontal gates: largeSlots[0]=left, largeSlots[1]=right
 *                     middleSlots[0]=top,  middleSlots[1]=bottom
 *   All gates       : smallSlots[0]=TL, [1]=TR, [2]=BL, [3]=BR
 */
const HORIZONTAL_GATE_IDS = new Set<GateId>([5, 6, 11, 12]);

/**
 * Returns the slot-fill order for a given slot type and gate.
 *
 * Occupation order rule (unified for all players):
 *   Fill from the inner side first — i.e. the side closer to the position grid
 *   (ポジション面に近い側から占有).
 *
 * Gate positions on the octagonal board:
 *   Top-side    : 1 (corner-tl), 2 (top-edge), 3 (top-edge), 4 (corner-tr)
 *   Right-side  : 5 (right-edge), 6 (right-edge)             [horizontal]
 *   Bottom-side : 7 (corner-br), 8 (bottom-edge), 9 (bottom-edge), 10 (corner-bl)
 *   Left-side   : 11 (left-edge), 12 (left-edge)             [horizontal]
 */
function getSlotFillOrder(
  slotType: 'large' | 'middle' | 'small',
  gateId: GateId,
): number[] {
  const isHorizontal = HORIZONTAL_GATE_IDS.has(gateId);

  if (slotType === 'large') {
    if (isHorizontal) {
      // L[0]=left, L[1]=right
      // Right-edge gates (5, 6): inner = left [0] first
      // Left-edge gates (11, 12): inner = right [1] first
      return (gateId === 5 || gateId === 6) ? [0, 1] : [1, 0];
    } else {
      // L[0]=top, L[1]=bottom
      // Top-side gates (1–4): inner = bottom [1] first
      // Bottom-side gates (7–10): inner = top [0] first
      return (gateId <= 4) ? [1, 0] : [0, 1];
    }
  }

  if (slotType === 'middle') {
    if (isHorizontal) {
      // M[0]=top, M[1]=bottom — equidistant for left/right edge gates
      return [0, 1];
    } else {
      // M[0]=left, M[1]=right
      // Corner-tl (1): inner direction = bottom-right → right [1] closer
      // Corner-bl (10): inner direction = top-right → right [1] closer
      // All others (2, 3, 4, 7, 8, 9): left[0] is closer or equidistant
      return (gateId === 1 || gateId === 10) ? [1, 0] : [0, 1];
    }
  }

  // small: S[0]=TL, S[1]=TR, S[2]=BL, S[3]=BR
  // Each gate fills the slot(s) nearest the position grid first.
  switch (gateId) {
    case 1:  return [3, 2, 1, 0]; // corner-tl: BR → BL → TR → TL
    case 2:  return [2, 3, 0, 1]; // top-edge:  BL → BR → TL → TR
    case 3:  return [2, 3, 0, 1]; // top-edge:  BL → BR → TL → TR
    case 4:  return [2, 3, 0, 1]; // corner-tr: BL → BR → TL → TR
    case 5:  return [0, 2, 1, 3]; // right-edge: TL → BL → TR → BR
    case 6:  return [0, 2, 1, 3]; // right-edge: TL → BL → TR → BR
    case 7:  return [0, 1, 2, 3]; // corner-br: TL → TR → BL → BR
    case 8:  return [0, 1, 2, 3]; // bottom-edge: TL → TR → BL → BR
    case 9:  return [0, 1, 2, 3]; // bottom-edge: TL → TR → BL → BR
    case 10: return [1, 0, 3, 2]; // corner-bl: TR → TL → BR → BL
    case 11: return [1, 3, 0, 2]; // left-edge: TR → BR → TL → BL
    case 12: return [1, 3, 0, 2]; // left-edge: TR → BR → TL → BL
    default: return [0, 1, 2, 3];
  }
}

/**
 * Places one asset into the first available slot according to the given fill order.
 */
function placeIntoSlotsOrdered(
  slots: Array<Asset | null>,
  asset: Asset,
  fillOrder: number[]
): { slots: Array<Asset | null>; placed: number } {
  const index = fillOrder.find((i) => slots[i] === null);
  if (index === undefined) return { slots: [...slots], placed: 0 };
  const next = [...slots];
  next[index] = asset;
  return { slots: next, placed: 1 };
}

export function applyMassiveToGate(gate: GateState, player: Player): { gate: GateState; placed: number } {
  const order = getSlotFillOrder('large', gate.id);
  const result = placeIntoSlotsOrdered(gate.largeSlots, { size: 'large', owner: player }, order);
  return { gate: { ...gate, largeSlots: result.slots }, placed: result.placed };
}

export function applySelectiveToGate(gate: GateState, player: Player): { gate: GateState; placed: number } {
  const order = getSlotFillOrder('middle', gate.id);
  const result = placeIntoSlotsOrdered(gate.middleSlots, { size: 'middle', owner: player }, order);
  return { gate: { ...gate, middleSlots: result.slots }, placed: result.placed };
}

export function applyQuadToGate(gate: GateState, player: Player): { gate: GateState; placed: number } {
  const order = getSlotFillOrder('small', gate.id);
  const result = placeIntoSlotsOrdered(gate.smallSlots, { size: 'small', owner: player }, order);
  return { gate: { ...gate, smallSlots: result.slots }, placed: result.placed };
}

export function canMassiveBuild(gate: GateState): boolean {
  return gate.largeSlots.some((slot) => slot === null);
}

export function canSelectiveBuild(gateA: GateState, gateB: GateState): boolean {
  if (gateA.id === gateB.id) return false;
  return gateA.middleSlots.some((slot) => slot === null) || gateB.middleSlots.some((slot) => slot === null);
}

export function canQuadBuild(gates: GateState[]): boolean {
  return gates.some((gate) => gate.smallSlots.some((slot) => slot === null));
}

export function getPositionGateIds(positionId: PositionId): GateId[] {
  return POSITION_TO_GATES[positionId];
}

export function isGateFull(gate: GateState): boolean {
  return gate.largeSlots.every(Boolean) && gate.middleSlots.every(Boolean) && gate.smallSlots.every(Boolean);
}
