import { POSITION_IDS, POSITION_TO_GATES } from './constants';
import { canCapturePosition } from './capture';
import { canMassiveBuild, canQuadBuild, canSelectiveBuild, isGateFull } from './build';
import type { BuildType, GameState, GateId, Player, PositionId } from './types';

/**
 * Returns all selectable positions for the given player.
 * A position is selectable if it is empty, owned by the player, or capturable.
 * Note: this includes own positions even if no build is possible from them.
 * For legal-move purposes, use hasAnyLegalMove() instead.
 */
export function getSelectablePositions(state: GameState, player: Player): PositionId[] {
  return (Object.keys(state.positions) as PositionId[]).filter((id) => {
    const owner = state.positions[id].owner;
    return owner === null || owner === player || canCapturePosition(state, player, id);
  });
}

/**
 * Returns true if the given player has at least one legal move.
 *
 * A legal move is defined as:
 *   - Taking an empty position (any build is possible after), OR
 *   - Capturing an opponent's position (any build is possible after), OR
 *   - Selecting an own position AND at least one build option exists for it.
 *
 * Own positions where no build is possible are NOT counted as legal moves.
 * Pass/Skip is never counted as a legal move.
 */
export function hasAnyLegalMove(state: GameState, player: Player): boolean {
  for (const posId of POSITION_IDS) {
    const owner = state.positions[posId].owner;
    if (owner === player) {
      // Own position: only legal if at least one build is possible
      const opts = getAvailableBuildOptions(state, posId);
      if (opts.hasAny) return true;
    } else if (owner === null) {
      // Empty position: can always take it (no build required for positioning)
      // but we still need a build to be available — check build options
      const opts = getAvailableBuildOptions(state, posId);
      if (opts.hasAny) return true;
    } else {
      // Opponent's position: legal only if capturable
      if (canCapturePosition(state, player, posId)) {
        const opts = getAvailableBuildOptions(state, posId);
        if (opts.hasAny) return true;
      }
    }
  }
  return false;
}

export function getAvailableBuildOptions(state: GameState, positionId: PositionId): {
  massiveGateIds: GateId[];
  selectivePairs: [GateId, GateId][];
  quadAvailable: boolean;
  hasAny: boolean;
} {
  const gateIds = POSITION_TO_GATES[positionId];
  const gates = gateIds.map((id) => state.gates[id]);

  const massiveGateIds = gateIds.filter((id) => canMassiveBuild(state.gates[id]));
  const selectivePairs: [GateId, GateId][] = [];

  for (let i = 0; i < gateIds.length; i += 1) {
    for (let j = i + 1; j < gateIds.length; j += 1) {
      const gateA = state.gates[gateIds[i]!];
      const gateB = state.gates[gateIds[j]!];
      if (canSelectiveBuild(gateA, gateB)) selectivePairs.push([gateA.id, gateB.id]);
    }
  }

  const quadAvailable = canQuadBuild(gates);
  const hasAny = massiveGateIds.length > 0 || selectivePairs.length > 0 || quadAvailable;
  return { massiveGateIds, selectivePairs, quadAvailable, hasAny };
}

export function isGameEnded(state: GameState): boolean {
  return Object.values(state.gates).every(isGateFull);
}

export function getWinner(state: GameState): Player | 'draw' | null {
  if (!isGameEnded(state)) return null;
  const black = Object.values(state.positions).filter((p) => p.owner === 'black').length;
  const white = Object.values(state.positions).filter((p) => p.owner === 'white').length;
  if (black > white) return 'black';
  if (white > black) return 'white';
  return 'draw';
}

export function buildTypeLabel(buildType: BuildType): string {
  if (buildType === 'massive') return 'Massive';
  if (buildType === 'selective') return 'Selective';
  return 'Quad';
}
