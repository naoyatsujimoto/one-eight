import { describe, it, expect } from 'vitest';
import { splitIntoSentences } from '../training/splitIntoSentences';

describe('splitIntoSentences — basic ASCII splitting', () => {
  it('splits on period followed by space', () => {
    const result = splitIntoSentences('First sentence. Second sentence.');
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('First sentence.');
    expect(result[1]).toBe('Second sentence.');
  });

  it('splits on question mark followed by space', () => {
    const result = splitIntoSentences('Are you ready? Continue.');
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('Are you ready?');
    expect(result[1]).toBe('Continue.');
  });

  it('splits on exclamation mark followed by space', () => {
    const result = splitIntoSentences('Great! Continue.');
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('Great!');
    expect(result[1]).toBe('Continue.');
  });
});

describe('splitIntoSentences — full-width Japanese punctuation', () => {
  it('splits on 。 immediately', () => {
    const result = splitIntoSentences('第一句。第二句。');
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('第一句。');
    expect(result[1]).toBe('第二句。');
  });

  it('splits on ！ and 。 in mixed Japanese text', () => {
    const result = splitIntoSentences('準備完了！次へ進みます。');
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('準備完了！');
    expect(result[1]).toBe('次へ進みます。');
  });
});

describe('splitIntoSentences — multilingual', () => {
  it('Spanish question mark: splits ¿Listo? Continúa.', () => {
    // ¿ is not a terminator; only ? at the end of the question triggers split
    const result = splitIntoSentences('¿Listo? Continúa.');
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('¿Listo?');
    expect(result[1]).toBe('Continúa.');
  });

  it('Korean question mark: splits 준비됐나요? 계속합니다.', () => {
    const result = splitIntoSentences('준비됐나요? 계속합니다.');
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('준비됐나요?');
    expect(result[1]).toBe('계속합니다.');
  });

  it('French spaced question mark: splits Prêt ? Continuez.', () => {
    // French uses a space before ?, so ? is followed by a space — split applies
    const result = splitIntoSentences('Prêt ? Continuez.');
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('Prêt ?');
    expect(result[1]).toBe('Continuez.');
  });
});

describe('splitIntoSentences — decimal / version numbers', () => {
  it('does NOT split on decimal point in a number', () => {
    const result = splitIntoSentences('Value is 1.5. Continue.');
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('Value is 1.5.');
    expect(result[1]).toBe('Continue.');
  });

  it('does NOT split v1.5 as a standalone token', () => {
    const result = splitIntoSentences('v1.5');
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('v1.5');
  });
});

describe('splitIntoSentences — consecutive terminators', () => {
  it('does NOT split in the middle of !? (ASCII consecutive terminators)', () => {
    // "!?" should be kept together; the sentence boundary is after the whole sequence
    const result = splitIntoSentences('What!? Really.');
    // "What!?" is one sentence; "Really." is another
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('What!?');
    expect(result[1]).toBe('Really.');
  });

  it('does NOT split in the middle of ！？ (full-width consecutive terminators)', () => {
    const result = splitIntoSentences('何！？本当に。');
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('何！？');
    expect(result[1]).toBe('本当に。');
  });
});

describe('splitIntoSentences — newlines and edge cases', () => {
  it('splits on period followed by newline', () => {
    const result = splitIntoSentences('Line one.\nLine two.');
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('Line one.');
    expect(result[1]).toBe('Line two.');
  });

  it('returns empty array for empty string', () => {
    const result = splitIntoSentences('');
    expect(result).toHaveLength(0);
  });

  it('does not generate empty sentences', () => {
    const result = splitIntoSentences('Hello. World.');
    result.forEach((s) => {
      expect(s.trim().length).toBeGreaterThan(0);
    });
  });
});

describe('splitIntoSentences — terminators are retained in output strings', () => {
  it('period is retained at end of first sentence', () => {
    const result = splitIntoSentences('First sentence. Second sentence.');
    expect(result[0]).toMatch(/\.$/);
  });

  it('question mark is retained at end of first sentence', () => {
    const result = splitIntoSentences('Are you ready? Continue.');
    expect(result[0]).toMatch(/\?$/);
  });

  it('exclamation mark is retained at end of first sentence', () => {
    const result = splitIntoSentences('Great! Continue.');
    expect(result[0]).toMatch(/!$/);
  });

  it('full-width 。 is retained at end of first sentence', () => {
    const result = splitIntoSentences('第一句。第二句。');
    expect(result[0]).toMatch(/。$/);
  });
});
