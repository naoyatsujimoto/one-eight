/**
 * postmortem_caseA_correction.test.ts
 *
 * 案A補正ロジック（全合法手が即終局・同一winner → 確定WP）のテスト。
 *
 * テスト局面の設計:
 *   Gate1〜11 満杯 / Gate12 が 7/8 埋まり（残 1 small スロット）
 *   次の手番プレイヤーが Gate12 に関連する手を打つと Gate12 が満杯 → 全 Gate 満杯 → 終局
 *
 * 実測:
 *   Black10/White3/White手番 → 合法手 1件(F quad) → Black 勝利終局
 *   White10/Black3/Black手番 → 合法手 1件       → White 勝利終局
 *   Gate11・12 両方 7/8     → 合法手 2件       → 一部非終局 → null
 */

import { describe, it, expect } from 'vitest';
import { checkAllMovesTerminalWinner } from '../game/postmortem';
import { createInitialState } from '../game/initialState';
import type { Asset, GameState, GateId, GateState, PositionId } from '../game/types';

// ─── ヘルパー ─────────────────────────────────────────────────────────────────

function fillGate(gate: GateState, owner: 'black' | 'white'): GateState {
  return {
    ...gate,
    largeSlots:  gate.largeSlots.map(() => ({ size: 'large'  as const, owner })),
    middleSlots: gate.middleSlots.map(() => ({ size: 'middle' as const, owner })),
    smallSlots:  gate.smallSlots.map(() => ({ size: 'small'  as const, owner })),
  };
}

/** Gate を 7/8 スロット埋めた状態（L2+M2+S3 埋め、S1 空）を作る */
function makeGate7of8(gate: GateState, owner: 'black' | 'white'): GateState {
  return {
    ...gate,
    largeSlots:  gate.largeSlots.map(() => ({ size: 'large'  as const, owner })),
    middleSlots: gate.middleSlots.map(() => ({ size: 'middle' as const, owner })),
    smallSlots: [
      { size: 'small' as const, owner },
      { size: 'small' as const, owner },
      { size: 'small' as const, owner },
      null,
    ] as Array<Asset | null>,
  };
}

/**
 * 「Gate1〜11 満杯 / Gate12 が 7/8 埋まり」の near-terminal 局面を作る。
 *
 * Gate12 に関連する positions: A, F, I, L（いずれも Gate12 を含む）。
 * White 所有 B, F, H のうち F が Gate12 に関与するため、
 * White 手番 / Black10:White3 では F quad の 1 手のみが合法手になる。
 */
function makeNearTerminalState(
  blackPositions: PositionId[],
  whitePositions: PositionId[],
  currentPlayer: 'black' | 'white',
  gateOwner: 'black' | 'white' = 'black',
): GameState {
  const base = createInitialState(currentPlayer);
  const positions = { ...base.positions };
  for (const p of blackPositions) positions[p] = { ...positions[p], owner: 'black' };
  for (const p of whitePositions) positions[p] = { ...positions[p], owner: 'white' };
  const gates = { ...base.gates } as GameState['gates'];
  for (let g = 1 as GateId; g <= 11; g++) gates[g] = fillGate(base.gates[g], gateOwner);
  gates[12] = makeGate7of8(base.gates[12], gateOwner);
  return { ...base, positions, gates, currentPlayer, gameEnded: false, winner: null };
}

// ─── checkAllMovesTerminalWinner テスト ──────────────────────────────────────

describe('checkAllMovesTerminalWinner', () => {

  it('terminal state (black) では null を返す', () => {
    const base = createInitialState('black');
    const s: GameState = { ...base, gameEnded: true, winner: 'black' };
    expect(checkAllMovesTerminalWinner(s)).toBeNull();
  });

  it('terminal state (white) では null を返す', () => {
    const base = createInitialState('black');
    const s: GameState = { ...base, gameEnded: true, winner: 'white' };
    expect(checkAllMovesTerminalWinner(s)).toBeNull();
  });

  it('terminal state (draw) では null を返す', () => {
    const base = createInitialState('black');
    const s: GameState = { ...base, gameEnded: true, winner: 'draw' };
    expect(checkAllMovesTerminalWinner(s)).toBeNull();
  });

  it('全合法手が即 Black 勝利終局 → black を返す', () => {
    // Gate1〜11 満杯(black) / Gate12 7/8(black)
    // Black 10 pos, White 3 pos, nextPlayer=white
    // White の合法手: F quad の 1 件のみ → 打つと即終局 Black 勝利
    const state = makeNearTerminalState(
      ['A','C','D','E','G','I','J','K','L','M'], // Black 10
      ['B','F','H'],                              // White 3
      'white',
    );
    expect(checkAllMovesTerminalWinner(state)).toBe('black');
  });

  it('全合法手が即 White 勝利終局 → white を返す', () => {
    // Gate1〜11 満杯(white) / Gate12 7/8(white)
    // White 10 pos, Black 3 pos, nextPlayer=black
    // Black の合法手 → 打つと即終局 White 勝利
    const state = makeNearTerminalState(
      ['A','B','C'],                              // Black 3
      ['D','E','F','G','H','I','J','K','L','M'], // White 10
      'black',
      'white',
    );
    expect(checkAllMovesTerminalWinner(state)).toBe('white');
  });

  it('Black 7 / White 6 → 全合法手が Black 勝利終局 → black を返す', () => {
    // Black 7 > White 6 なので終局時 Black 勝利
    const state = makeNearTerminalState(
      ['A','B','C','D','E','F','G'], // Black 7
      ['H','I','J','K','L','M'],    // White 6
      'white',
    );
    expect(checkAllMovesTerminalWinner(state)).toBe('black');
  });

  it('非終局手を含む場合は null を返す（Gate11・Gate12 両方 7/8）', () => {
    // Gate1〜10 満杯 / Gate11・12 が 7/8
    // 一部の合法手は Gate11 のみ完成させて Gate12 が残る → 即終局しない
    const base = createInitialState('white');
    const positions = { ...base.positions };
    const blackPos: PositionId[] = ['A','C','D','E','G','I','J','K','L','M'];
    const whitePos: PositionId[] = ['B','F','H'];
    for (const p of blackPos) positions[p] = { ...positions[p], owner: 'black' };
    for (const p of whitePos) positions[p] = { ...positions[p], owner: 'white' };
    const gates = { ...base.gates } as GameState['gates'];
    for (let g = 1 as GateId; g <= 10; g++) gates[g] = fillGate(base.gates[g], 'black');
    gates[11] = makeGate7of8(base.gates[11], 'black');
    gates[12] = makeGate7of8(base.gates[12], 'black');
    const state: GameState = { ...base, positions, gates, currentPlayer: 'white', gameEnded: false, winner: null };
    // White が B quad → Gate11 完成、Gate12 残る → 即終局しない → null
    expect(checkAllMovesTerminalWinner(state)).toBeNull();
  });

  it('初期局面（合法手多数・即終局なし）は null を返す', () => {
    const state = createInitialState('black');
    expect(checkAllMovesTerminalWinner(state)).toBeNull();
  });

});
