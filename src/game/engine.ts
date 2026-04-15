import { POSITION_TO_GATES } from './constants';
import { applyMassiveToGate, applyQuadToGate, applySelectiveToGate } from './build';
import { canCapturePosition } from './capture';
import { createInitialState } from './initialState';
import { getAvailableBuildOptions, getWinner, isGameEnded } from './selectors';
import type { GameState, GateId, MoveRecord, PositionId } from './types';

export function selectPosition(state: GameState, positionId: PositionId): GameState {
  if (state.gameEnded) return state;

  // Toggle: re-clicking the selected position deselects it
  if (state.selectedPosition === positionId) {
    return { ...state, selectedPosition: null, pendingPositionOwner: null };
  }

  const position = state.positions[positionId];
  const owner = position.owner;
  const player = state.currentPlayer;
  const allowed = owner === null || owner === player || canCapturePosition(state, player, positionId);
  if (!allowed) return state;

  const pendingOwner = owner === player ? owner : player;

  // Do NOT mutate positions here; store preview in pendingPositionOwner only.
  return {
    ...state,
    selectedPosition: positionId,
    pendingPositionOwner: pendingOwner,
  };
}

function finalizeTurn(state: GameState, record: MoveRecord): GameState {
  // Commit pendingPositionOwner to the selected position if both are set.
  let positions = state.positions;
  if (state.selectedPosition && state.pendingPositionOwner !== null) {
    positions = {
      ...positions,
      [state.selectedPosition]: {
        ...positions[state.selectedPosition],
        owner: state.pendingPositionOwner,
      },
    };
  }

  const interim: GameState = {
    ...state,
    positions,
    history: [...state.history, record],
    selectedPosition: null,
    pendingPositionOwner: null,
    moveNumber: state.moveNumber + 1,
    currentPlayer: state.currentPlayer === 'black' ? 'white' : 'black'
  };
  const ended = isGameEnded(interim);
  const winner = ended ? getWinner(interim) : null;
  return { ...interim, gameEnded: ended, winner };
}

export function applyMassiveBuild(state: GameState, gateId: GateId): GameState {
  if (!state.selectedPosition || state.gameEnded) return state;
  if (!POSITION_TO_GATES[state.selectedPosition].includes(gateId)) return state;

  const result = applyMassiveToGate(state.gates[gateId], state.currentPlayer);
  const next = { ...state, gates: { ...state.gates, [gateId]: result.gate } };
  return finalizeTurn(next, {
    moveNumber: state.moveNumber,
    player: state.currentPlayer,
    positioning: state.selectedPosition,
    build: { type: 'massive', gate: gateId, placed: result.placed }
  });
}

export function applySelectiveBuild(state: GameState, gates: [GateId, GateId]): GameState {
  if (!state.selectedPosition || state.gameEnded) return state;
  const allowed = POSITION_TO_GATES[state.selectedPosition];
  if (!allowed.includes(gates[0]) || !allowed.includes(gates[1]) || gates[0] === gates[1]) return state;

  const first = applySelectiveToGate(state.gates[gates[0]], state.currentPlayer);
  const second = applySelectiveToGate(state.gates[gates[1]], state.currentPlayer);
  const next = {
    ...state,
    gates: {
      ...state.gates,
      [gates[0]]: first.gate,
      [gates[1]]: second.gate
    }
  };

  return finalizeTurn(next, {
    moveNumber: state.moveNumber,
    player: state.currentPlayer,
    positioning: state.selectedPosition,
    build: { type: 'selective', gates, placed: first.placed + second.placed }
  });
}

export function applyQuadBuild(state: GameState): GameState {
  if (!state.selectedPosition || state.gameEnded) return state;

  const gateIds = POSITION_TO_GATES[state.selectedPosition];
  const nextGates = { ...state.gates };
  const placedGateIds: GateId[] = [];

  for (const gateId of gateIds) {
    const result = applyQuadToGate(nextGates[gateId], state.currentPlayer);
    nextGates[gateId] = result.gate;
    if (result.placed > 0) placedGateIds.push(gateId);
  }

  return finalizeTurn({ ...state, gates: nextGates }, {
    moveNumber: state.moveNumber,
    player: state.currentPlayer,
    positioning: state.selectedPosition,
    build: { type: 'quad', placedGateIds, placed: placedGateIds.length }
  });
}

/** Quad build applied only to the explicitly selected gate IDs (new click-based UI) */
export function applyQuadBuildForGates(state: GameState, selectedGateIds: GateId[]): GameState {
  if (!state.selectedPosition || state.gameEnded) return state;

  const allowed = POSITION_TO_GATES[state.selectedPosition];
  const nextGates = { ...state.gates };
  const placedGateIds: GateId[] = [];

  for (const gateId of selectedGateIds) {
    if (!allowed.includes(gateId)) continue;
    const result = applyQuadToGate(nextGates[gateId], state.currentPlayer);
    nextGates[gateId] = result.gate;
    if (result.placed > 0) placedGateIds.push(gateId);
  }

  return finalizeTurn({ ...state, gates: nextGates }, {
    moveNumber: state.moveNumber,
    player: state.currentPlayer,
    positioning: state.selectedPosition,
    build: { type: 'quad', placedGateIds, placed: placedGateIds.length }
  });
}

export function skipTurn(state: GameState): GameState {
  if (state.selectedPosition) {
    const options = getAvailableBuildOptions(state, state.selectedPosition);
    if (options.hasAny) return state;
  }
  return finalizeTurn(state, {
    moveNumber: state.moveNumber,
    player: state.currentPlayer,
    positioning: 'P',
    build: { type: 'skip' }
  });
}

export function resetGame(cpuPlayer: GameState['cpuPlayer'] = null): GameState {
  return createInitialState(cpuPlayer);
}

export function getBuildOptionsForSelected(state: GameState) {
  if (!state.selectedPosition) return null;
  return getAvailableBuildOptions(state, state.selectedPosition);
}
