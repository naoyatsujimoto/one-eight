import { GATE_IDS, POSITION_IDS } from './constants';
import type { GameState, GateState, PositionState } from './types';

function createPosition(id: PositionState['id']): PositionState {
  return { id, owner: null };
}

function createGate(id: GateState['id']): GateState {
  return {
    id,
    largeSlots: [null, null],
    middleSlots: [null, null],
    smallSlots: [null, null, null, null]
  };
}

export function createInitialState(cpuPlayer: GameState['cpuPlayer'] = null): GameState {
  const positions = Object.fromEntries(POSITION_IDS.map((id) => [id, createPosition(id)])) as GameState['positions'];
  const gates = Object.fromEntries(GATE_IDS.map((id) => [id, createGate(id)])) as GameState['gates'];

  return {
    currentPlayer: 'black',
    moveNumber: 1,
    selectedPosition: null,
    pendingPositionOwner: null,
    positions,
    gates,
    history: [],
    gameEnded: false,
    winner: null,
    cpuPlayer,
    startedAt: new Date().toISOString(),
    endedAt: null,
  };
}
