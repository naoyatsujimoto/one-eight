import { describe, expect, it } from 'vitest';
import { generateRecordText, toNotation } from '../game/notation';

describe('notation', () => {
  it('formats selective build notation', () => {
    expect(toNotation({
      moveNumber: 3,
      player: 'black',
      positioning: 'G',
      build: { type: 'selective', gates: [1, 10], placed: 2 }
    })).toBe('3. G, s(1,10)');
  });
});

describe('generateRecordText', () => {
  it('returns empty string for empty history', () => {
    expect(generateRecordText([])).toBe('');
  });

  it('formats a single move', () => {
    const record = {
      moveNumber: 1,
      player: 'black' as const,
      positioning: 'A' as const,
      build: { type: 'massive' as const, gate: 2 as const, placed: 1 }
    };
    expect(generateRecordText([record])).toBe('1. A, m(2)');
  });

  it('formats multiple moves with newlines', () => {
    const records = [
      {
        moveNumber: 1,
        player: 'black' as const,
        positioning: 'A' as const,
        build: { type: 'massive' as const, gate: 2 as const, placed: 1 }
      },
      {
        moveNumber: 2,
        player: 'white' as const,
        positioning: 'B' as const,
        build: { type: 'selective' as const, gates: [3, 4] as [3, 4], placed: 2 }
      },
    ];
    expect(generateRecordText(records)).toBe('1. A, m(2)\n2. B, s(3,4)');
  });

  it('formats skip (Pass) notation', () => {
    const record = {
      moveNumber: 5,
      player: 'white' as const,
      positioning: 'P' as const,
      build: { type: 'skip' as const }
    };
    expect(generateRecordText([record])).toBe('5. P');
  });
});
