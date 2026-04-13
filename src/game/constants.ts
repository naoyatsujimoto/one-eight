import type { GateId, PositionId } from './types';

export const POSITION_IDS: PositionId[] = ['A','B','C','D','E','F','G','H','I','J','K','L','M'];
export const GATE_IDS: GateId[] = [1,2,3,4,5,6,7,8,9,10,11,12];

export const POSITION_TO_GATES: Record<PositionId, GateId[]> = {
  A: [1, 2, 7, 12],
  B: [2, 3, 6, 11],
  C: [3, 4, 5, 10],
  D: [1, 3, 7, 11],
  E: [2, 4, 6, 10],
  F: [3, 8, 11, 12],
  G: [1, 4, 7, 10],
  H: [2, 5, 6, 9],
  I: [4, 8, 10, 12],
  J: [1, 5, 7, 9],
  K: [4, 9, 10, 11],
  L: [5, 8, 9, 12],
  M: [1, 6, 7, 8]
};

export const POSITION_LAYOUT: PositionId[][] = [
  ['A', 'B', 'C'],
  ['D', 'E', 'F'],
  ['G', 'H', 'I'],
  ['J', 'K', 'L'],
  ['M']
];
