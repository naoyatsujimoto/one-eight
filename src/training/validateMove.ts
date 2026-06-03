import type { MoveRecord } from '../game/types';
import type { ExpectedMove } from './types';

/**
 * Validate whether a MoveRecord matches the expected move.
 * - massive: positioning + build.type + gate must match
 * - selective: positioning + build.type + gates match (order-insensitive)
 * - quad: positioning + build.type must match (specific gates not checked)
 */
export function validateMove(record: MoveRecord, expected: ExpectedMove): boolean {
  if (record.positioning !== expected.positioning) return false;
  if (record.build.type !== expected.build.type) return false;

  if (expected.build.type === 'massive') {
    if (record.build.type !== 'massive') return false;
    return record.build.gate === expected.build.gate;
  }

  if (expected.build.type === 'selective') {
    if (record.build.type !== 'selective') return false;
    const eg = expected.build.gates;
    const rg = record.build.gates;
    // order-insensitive comparison
    return (
      (rg[0] === eg[0] && rg[1] === eg[1]) ||
      (rg[0] === eg[1] && rg[1] === eg[0])
    );
  }

  if (expected.build.type === 'quad') {
    return record.build.type === 'quad';
  }

  return false;
}
