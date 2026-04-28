import { POSITION_TO_GATES } from './constants';
import { gatePlayerValue, gateTotalValue } from './build';
import type { GameState, GateState, Player, PositionId } from './types';

export function compareGateDominance(gate: GateState, player: Player): 'player' | 'opponent' | 'tie' {
  const mine = gatePlayerValue(gate, player);
  const opponent = gatePlayerValue(gate, player === 'black' ? 'white' : 'black');
  if (mine > opponent) return 'player';
  if (mine < opponent) return 'opponent';
  return 'tie';
}

export function canCapturePosition(state: GameState, player: Player, positionId: PositionId): boolean {
  const position = state.positions[positionId];
  if (!position.owner || position.owner === player) return false;

  const gates = POSITION_TO_GATES[positionId].map((id) => state.gates[id]);
  const maxValue = Math.max(...gates.map(gateTotalValue));
  const mostBuilt = gates.filter((gate) => gateTotalValue(gate) === maxValue);

  let playerWins = 0;
  let opponentWins = 0;

  for (const gate of mostBuilt) {
    const result = compareGateDominance(gate, player);
    if (result === 'player') playerWins += 1;
    if (result === 'opponent') opponentWins += 1;
  }

  return playerWins > opponentWins;
}
