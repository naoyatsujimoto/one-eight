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
 * Returns the preferred slot-fill order for a given slot type, gate, and player.
 *
 * Occupation order rules:
 *   1) Player-near side first (black=bottom, white=top).
 *   2) From the player's left first within the same row/column
 *      (black faces up → screen-left = player-left;
 *       white faces down → screen-right = player-left).
 */
function getSlotFillOrder(
  slotType: 'large' | 'middle' | 'small',
  gateId: GateId,
  player: Player
): number[] {
  const isBlack = player === 'black';
  const isHorizontal = HORIZONTAL_GATE_IDS.has(gateId);

  if (slotType === 'large') {
    if (isHorizontal) {
      // L[0]=left, L[1]=right
      // Black (faces up): player-left = screen-left → [0, 1]
      // White (faces down): player-left = screen-right → [1, 0]
      return isBlack ? [0, 1] : [1, 0];
    } else {
      // L[0]=top, L[1]=bottom
      // Black: near side = bottom (L[1]) first → [1, 0]
      // White: near side = top  (L[0]) first → [0, 1]
      return isBlack ? [1, 0] : [0, 1];
    }
  }

  if (slotType === 'middle') {
    if (isHorizontal) {
      // M[0]=top, M[1]=bottom
      // Black: near side = bottom (M[1]) first → [1, 0]
      // White: near side = top  (M[0]) first → [0, 1]
      return isBlack ? [1, 0] : [0, 1];
    } else {
      // M[0]=left, M[1]=right
      // Black (faces up): player-left = screen-left (M[0]) first → [0, 1]
      // White (faces down): player-left = screen-right (M[1]) first → [1, 0]
      return isBlack ? [0, 1] : [1, 0];
    }
  }

  // small: S[0]=TL, S[1]=TR, S[2]=BL, S[3]=BR
  // Black: near=bottom, player-left=screen-left → BL(2), BR(3), TL(0), TR(1)
  // White: near=top,    player-left=screen-right → TR(1), TL(0), BR(3), BL(2)
  return isBlack ? [2, 3, 0, 1] : [1, 0, 3, 2];
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
  const order = getSlotFillOrder('large', gate.id, player);
  const result = placeIntoSlotsOrdered(gate.largeSlots, { size: 'large', owner: player }, order);
  return { gate: { ...gate, largeSlots: result.slots }, placed: result.placed };
}

export function applySelectiveToGate(gate: GateState, player: Player): { gate: GateState; placed: number } {
  const order = getSlotFillOrder('middle', gate.id, player);
  const result = placeIntoSlotsOrdered(gate.middleSlots, { size: 'middle', owner: player }, order);
  return { gate: { ...gate, middleSlots: result.slots }, placed: result.placed };
}

export function applyQuadToGate(gate: GateState, player: Player): { gate: GateState; placed: number } {
  const order = getSlotFillOrder('small', gate.id, player);
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
