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

function placeIntoSlots(slots: Array<Asset | null>, asset: Asset): { slots: Array<Asset | null>; placed: number } {
  const index = slots.findIndex((slot) => slot === null);
  if (index === -1) return { slots: [...slots], placed: 0 };
  const next = [...slots];
  next[index] = asset;
  return { slots: next, placed: 1 };
}

export function applyMassiveToGate(gate: GateState, player: Player): { gate: GateState; placed: number } {
  const result = placeIntoSlots(gate.largeSlots, { size: 'large', owner: player });
  return { gate: { ...gate, largeSlots: result.slots }, placed: result.placed };
}

export function applySelectiveToGate(gate: GateState, player: Player): { gate: GateState; placed: number } {
  const result = placeIntoSlots(gate.middleSlots, { size: 'middle', owner: player });
  return { gate: { ...gate, middleSlots: result.slots }, placed: result.placed };
}

export function applyQuadToGate(gate: GateState, player: Player): { gate: GateState; placed: number } {
  const result = placeIntoSlots(gate.smallSlots, { size: 'small', owner: player });
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
