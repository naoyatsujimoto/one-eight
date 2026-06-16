import { describe, it } from 'vitest';
import { createInitialState } from '../game/initialState';
import { selectPosition, applyMassiveBuild } from '../game/engine';
import { enumerateLegalMoves } from '../game/ai';
import type { GameState, GateId, PositionId, MoveRecord } from '../game/types';

type Player = 'black' | 'white';

// 13ポジション全部順番に埋める（最後の2〜3を空にする）
const allMoves: Array<{ player: Player; posId: PositionId; gateId: GateId }> = [
  { player: 'black', posId: 'A', gateId: 1 },
  { player: 'white', posId: 'B', gateId: 2 },
  { player: 'black', posId: 'C', gateId: 3 },
  { player: 'white', posId: 'D', gateId: 7 },
  { player: 'black', posId: 'E', gateId: 4 },
  { player: 'white', posId: 'F', gateId: 8 },
  { player: 'black', posId: 'G', gateId: 1 },
  { player: 'white', posId: 'H', gateId: 2 },
  { player: 'black', posId: 'I', gateId: 4 },
  { player: 'white', posId: 'J', gateId: 1 },
  // K, L, M 残し（3ポジション空き）
];

describe('lategame branching probe', () => {
  it('終盤局面の合法手数確認', () => {
    let state: GameState = createInitialState(null);
    for (const { player, posId, gateId } of allMoves) {
      const s1 = selectPosition({ ...state, currentPlayer: player }, posId);
      state = applyMassiveBuild(s1, gateId);
    }
    const lB = enumerateLegalMoves(state, 'black');
    const lW = enumerateLegalMoves(state, 'white');
    console.log(`終盤: black=${lB.length} white=${lW.length}  depth-3-worst-black≈${Math.pow(lB.length,3).toLocaleString()}  white≈${Math.pow(lW.length,3).toLocaleString()}`);
  });
});
