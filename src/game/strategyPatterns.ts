/**
 * strategyPatterns.ts — ONE EIGHT 固有の戦略パターン検出
 *
 * post-move GameState と手を指したプレイヤーを受け取り、
 * その局面で成立している戦略的特徴を StrategyFlag[] として返す。
 *
 * 方針:
 * - 完璧な評価関数ではなく、局面特徴の可視化が目的
 * - 既存の capture / build ロジックを再利用し独自評価関数を持たない
 * - CPU探索・α β・評価スコアには一切関与しない
 */

import { canCapturePosition, compareGateDominance } from './capture';
import { POSITION_IDS } from './constants';
import type { GameState, GateId, Player, PositionId } from './types';

// ─── Flag 型定義 ──────────────────────────────────────────────────────────────

export type StrategyFlag =
  | 'corner_gate_control'    // コーナーゲート支配（Gate 1,4,7,10 のうち2+を支配）
  | 'center_position_control' // 中心ポジション所有（Position G）
  | 'corner_position_control' // コーナーポジション所有（A,C,K,M のうち2+）
  | 'inner_cross_control'    // 内十字ポジション所有（D,E,I,J のうち2+）
  | 'capture_threat'         // 次手で相手Positionを奪取可能
  | 'recapture_risk';        // 自Positionが相手に奪取されうる

// ─── 定数 ────────────────────────────────────────────────────────────────────

/** コーナーゲート: 盤の4隅に位置するゲート */
const CORNER_GATE_IDS: GateId[] = [1, 4, 7, 10];

/** コーナーポジション: 盤の4隅に位置するポジション */
const CORNER_POSITION_IDS: PositionId[] = ['A', 'C', 'K', 'M'];

/** 内十字ポジション: 中心周辺の4ポジション */
const INNER_CROSS_POSITION_IDS: PositionId[] = ['D', 'E', 'I', 'J'];

// ─── 個別検出関数 ──────────────────────────────────────────────────────────────

/**
 * corner_gate_control: Gate 1,4,7,10 のうち 2+ で支配優勢
 * compareGateDominance を再利用し、Gate asset 蓄積状況で判定。
 */
function detectCornerGateControl(state: GameState, player: Player): boolean {
  const dominated = CORNER_GATE_IDS.filter(
    gateId => compareGateDominance(state.gates[gateId], player) === 'player',
  );
  return dominated.length >= 2;
}

/**
 * center_position_control: Position G を所有している
 * G は唯一 4コーナーゲートすべてに接するポジション。
 */
function detectCenterPositionControl(state: GameState, player: Player): boolean {
  return state.positions['G'].owner === player;
}

/**
 * corner_position_control: A,C,K,M のうち 2+ を所有
 */
function detectCornerPositionControl(state: GameState, player: Player): boolean {
  return CORNER_POSITION_IDS.filter(id => state.positions[id].owner === player).length >= 2;
}

/**
 * inner_cross_control: D,E,I,J のうち 2+ を所有
 */
function detectInnerCrossControl(state: GameState, player: Player): boolean {
  return INNER_CROSS_POSITION_IDS.filter(id => state.positions[id].owner === player).length >= 2;
}

/**
 * capture_threat: 現局面でプレイヤーが相手ポジションを奪取可能
 * canCapturePosition を全相手ポジションに対して判定。
 */
function detectCaptureThreat(state: GameState, player: Player): boolean {
  const opponent: Player = player === 'black' ? 'white' : 'black';
  return POSITION_IDS.some(
    id => state.positions[id].owner === opponent && canCapturePosition(state, player, id),
  );
}

/**
 * recapture_risk: 現局面で相手がプレイヤーのポジションを奪取可能
 */
function detectRecaptureRisk(state: GameState, player: Player): boolean {
  const opponent: Player = player === 'black' ? 'white' : 'black';
  return POSITION_IDS.some(
    id => state.positions[id].owner === player && canCapturePosition(state, opponent, id),
  );
}

// ─── 公開 API ─────────────────────────────────────────────────────────────────

/**
 * post-move の GameState とそのターンのプレイヤーを受け取り、
 * 成立している StrategyFlag[] を返す。
 *
 * 検出順序: structural（支配系）→ threat（脅威系）
 * 空配列は「特記すべき戦略的特徴なし」を意味する。
 */
export function detectStrategyFlags(state: GameState, player: Player): StrategyFlag[] {
  const flags: StrategyFlag[] = [];

  if (detectCornerGateControl(state, player))    flags.push('corner_gate_control');
  if (detectCenterPositionControl(state, player)) flags.push('center_position_control');
  if (detectCornerPositionControl(state, player)) flags.push('corner_position_control');
  if (detectInnerCrossControl(state, player))    flags.push('inner_cross_control');
  if (detectCaptureThreat(state, player))        flags.push('capture_threat');
  if (detectRecaptureRisk(state, player))        flags.push('recapture_risk');

  return flags;
}

// ─── ラベルマップ（UI表示用） ─────────────────────────────────────────────────

/** StrategyFlag を短縮ラベルに変換する（UI表示用） */
export const STRATEGY_FLAG_LABEL: Record<StrategyFlag, string> = {
  corner_gate_control:     'Corner Gates',
  center_position_control: 'Center G',
  corner_position_control: 'Corners',
  inner_cross_control:     'Inner Cross',
  capture_threat:          'Threat',
  recapture_risk:          'At Risk',
};
