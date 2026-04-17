export type Player = 'black' | 'white';

export type PositionId =
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'
  | 'H' | 'I' | 'J' | 'K' | 'L' | 'M';

export type GateId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export type AssetSize = 'large' | 'middle' | 'small';
export type BuildType = 'massive' | 'selective' | 'quad';

export type Asset = { size: AssetSize; owner: Player };

export type PositionState = { id: PositionId; owner: Player | null };

export type GateState = {
  id: GateId;
  largeSlots: Array<Asset | null>;
  middleSlots: Array<Asset | null>;
  smallSlots: Array<Asset | null>;
};

export type MoveRecord = {
  moveNumber: number;
  player: Player;
  positioning: PositionId | 'P';
  build:
    | { type: 'massive'; gate: GateId | null; placed: number }
    | { type: 'selective'; gates: [GateId | 0, GateId | 0]; placed: number }
    | { type: 'quad'; placedGateIds: GateId[]; placed: number }
    | { type: 'skip' };
};

export type GameState = {
  currentPlayer: Player;
  moveNumber: number;
  selectedPosition: PositionId | null;
  /** Preview owner for the currently selected position (committed on finalizeTurn). */
  pendingPositionOwner: Player | null;
  positions: Record<PositionId, PositionState>;
  gates: Record<GateId, GateState>;
  history: MoveRecord[];
  gameEnded: boolean;
  winner: Player | 'draw' | null;
  /** Which player (if any) is controlled by the CPU. null = Human vs Human. */
  cpuPlayer: Player | null;
};
