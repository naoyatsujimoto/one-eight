/**
 * strategy_patterns.test.ts -- Phase N-4 strategic pattern detection unit tests
 */

import { describe, it, expect } from 'vitest';
import { detectStrategyFlags } from '../game/strategyPatterns';
import { runPostmortem } from '../game/postmortem';
import { createInitialState } from '../game/initialState';
import { selectPosition, applyMassiveBuild } from '../game/engine';
import type { GameState, GateId, MoveRecord, PositionId } from '../game/types';

// ─── helpers ─────────────────────────────────────────────────────────────────

function withOwners(
  ownedByBlack: PositionId[],
  ownedByWhite: PositionId[] = [],
): GameState {
  const state = createInitialState(null);
  const positions = { ...state.positions };
  for (const id of ownedByBlack) {
    positions[id] = { ...positions[id], owner: 'black' };
  }
  for (const id of ownedByWhite) {
    positions[id] = { ...positions[id], owner: 'white' };
  }
  return { ...state, positions };
}

function withGateDominance(
  state: GameState,
  gateId: GateId,
  player: 'black' | 'white',
): GameState {
  const gates = { ...state.gates };
  gates[gateId] = {
    ...gates[gateId],
    largeSlots: [{ size: 'large', owner: player }, null],
  };
  return { ...state, gates };
}

// ─── corner_gate_control ─────────────────────────────────────────────────────

describe('corner_gate_control', () => {
  it('1 corner gate dominated -> no flag', () => {
    let state = createInitialState(null);
    state = withGateDominance(state, 1, 'black');
    expect(detectStrategyFlags(state, 'black')).not.toContain('corner_gate_control');
  });

  it('2 corner gates dominated -> flag present', () => {
    let state = createInitialState(null);
    state = withGateDominance(state, 1, 'black');
    state = withGateDominance(state, 4, 'black');
    expect(detectStrategyFlags(state, 'black')).toContain('corner_gate_control');
  });

  it('all 4 corner gates dominated -> flag present', () => {
    let state = createInitialState(null);
    for (const gid of [1, 4, 7, 10] as GateId[]) {
      state = withGateDominance(state, gid, 'black');
    }
    expect(detectStrategyFlags(state, 'black')).toContain('corner_gate_control');
  });

  it('white dominates 2 corner gates -> no black flag', () => {
    let state = createInitialState(null);
    state = withGateDominance(state, 1, 'white');
    state = withGateDominance(state, 4, 'white');
    expect(detectStrategyFlags(state, 'black')).not.toContain('corner_gate_control');
  });
});

// ─── center_position_control ──────────────────────────────────────────────────

describe('center_position_control', () => {
  it('G not owned -> no flag', () => {
    expect(detectStrategyFlags(createInitialState(null), 'black')).not.toContain('center_position_control');
  });

  it('black owns G -> flag present', () => {
    expect(detectStrategyFlags(withOwners(['G']), 'black')).toContain('center_position_control');
  });

  it('white owns G -> no black flag', () => {
    expect(detectStrategyFlags(withOwners([], ['G']), 'black')).not.toContain('center_position_control');
  });
});

// ─── corner_position_control ──────────────────────────────────────────────────

describe('corner_position_control', () => {
  it('1 corner position -> no flag', () => {
    expect(detectStrategyFlags(withOwners(['A']), 'black')).not.toContain('corner_position_control');
  });

  it('2 corner positions -> flag present', () => {
    expect(detectStrategyFlags(withOwners(['A', 'C']), 'black')).toContain('corner_position_control');
  });

  it('3 corner positions -> flag present', () => {
    expect(detectStrategyFlags(withOwners(['A', 'C', 'K']), 'black')).toContain('corner_position_control');
  });
});

// ─── inner_cross_control ────────────────────────────────────────────────────

describe('inner_cross_control', () => {
  it('1 inner cross position -> no flag', () => {
    expect(detectStrategyFlags(withOwners(['D']), 'black')).not.toContain('inner_cross_control');
  });

  it('2 inner cross positions -> flag present', () => {
    expect(detectStrategyFlags(withOwners(['D', 'E']), 'black')).toContain('inner_cross_control');
  });

  it('all 4 inner cross positions -> flag present', () => {
    expect(detectStrategyFlags(withOwners(['D', 'E', 'I', 'J']), 'black')).toContain('inner_cross_control');
  });
});

// ─── capture_threat ──────────────────────────────────────────────────────────

describe('capture_threat', () => {
  it('no opponent positions -> no flag', () => {
    expect(detectStrategyFlags(withOwners(['A']), 'black')).not.toContain('capture_threat');
  });

  it('opponent position exists but capture condition not met -> no flag', () => {
    // no gate assets -> cannot capture
    expect(detectStrategyFlags(withOwners([], ['A']), 'black')).not.toContain('capture_threat');
  });

  it('opponent position capturable -> flag present', () => {
    // A gates: 1,2,7,12 -- give black dominance in all
    let state = withOwners([], ['A']);
    for (const gid of [1, 2, 7, 12] as GateId[]) {
      state = withGateDominance(state, gid, 'black');
    }
    expect(detectStrategyFlags(state, 'black')).toContain('capture_threat');
  });
});

// ─── recapture_risk ──────────────────────────────────────────────────────────

describe('recapture_risk', () => {
  it('no own positions -> no flag', () => {
    expect(detectStrategyFlags(withOwners([], ['A']), 'black')).not.toContain('recapture_risk');
  });

  it('own position exists but opponent cannot capture -> no flag', () => {
    expect(detectStrategyFlags(withOwners(['A']), 'black')).not.toContain('recapture_risk');
  });

  it('opponent can capture own position -> flag present', () => {
    let state = withOwners(['A'], []);
    for (const gid of [1, 2, 7, 12] as GateId[]) {
      state = withGateDominance(state, gid, 'white');
    }
    expect(detectStrategyFlags(state, 'black')).toContain('recapture_risk');
  });
});

// ─── combined flags ──────────────────────────────────────────────────────────

describe('combined flags', () => {
  it('empty board -> no flags', () => {
    const flags = detectStrategyFlags(createInitialState(null), 'black');
    expect(flags).toHaveLength(0);
    expect(Array.isArray(flags)).toBe(true);
  });

  it('G + D,E owned -> center_position_control + inner_cross_control', () => {
    const flags = detectStrategyFlags(withOwners(['G', 'D', 'E']), 'black');
    expect(flags).toContain('center_position_control');
    expect(flags).toContain('inner_cross_control');
  });
});

// ─── postmortem integration ───────────────────────────────────────────────────

describe('runPostmortem -- strategicFlags', () => {
  function makeMinimalHistory(): MoveRecord[] {
    let state = createInitialState(null);
    const records: MoveRecord[] = [];

    const moves: Array<{ player: 'black' | 'white'; posId: PositionId; gateId: GateId }> = [
      { player: 'black', posId: 'A', gateId: 1 },
      { player: 'white', posId: 'C', gateId: 3 },
      { player: 'black', posId: 'D', gateId: 7 },
      { player: 'white', posId: 'E', gateId: 4 },
      { player: 'black', posId: 'G', gateId: 1 },
      { player: 'white', posId: 'K', gateId: 9 },
    ];

    for (const { player, posId, gateId } of moves) {
      const s1 = selectPosition({ ...state, currentPlayer: player }, posId);
      const s2 = applyMassiveBuild(s1, gateId);
      const last = s2.history[s2.history.length - 1];
      if (last) records.push(last);
      state = s2;
    }

    return records;
  }

  it('each row has strategicFlags array', () => {
    const result = runPostmortem(makeMinimalHistory());
    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows) {
      expect(row).toHaveProperty('strategicFlags');
      expect(Array.isArray(row.strategicFlags)).toBe(true);
    }
  });

  it('strategicFlags contains only strings', () => {
    const result = runPostmortem(makeMinimalHistory());
    for (const row of result.rows) {
      for (const flag of row.strategicFlags ?? []) {
        expect(typeof flag).toBe('string');
      }
    }
  });

  it('existing fields (wpAfter, loss, etc.) are not broken', () => {
    const result = runPostmortem(makeMinimalHistory());
    for (const row of result.rows) {
      expect(typeof row.wpAfter).toBe('number');
      expect(typeof row.moveNum).toBe('number');
      expect(typeof row.player).toBe('string');
    }
  });
});
