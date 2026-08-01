/**
 * Splits text into sentences for training display.
 *
 * Rules:
 * - ASCII `.` `!` `?`: split when followed by whitespace or end of string,
 *   but NOT when the `.` is between two digit characters (e.g. `1.5`, `v1.5`).
 * - Full-width `。` `！` `？`: split immediately (no whitespace required),
 *   unless immediately followed by another terminator character.
 * - Do NOT split in the middle of consecutive terminators (e.g. `!?`, `！？`).
 * - Retain terminators in the output strings.
 * - Do not generate empty sentences.
 * - Newline characters are treated as sentence boundaries (similar to whitespace).
 */
export function splitIntoSentences(text: string): string[] {
  if (!text) return [];

  const result: string[] = [];
  let current = '';

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    current += ch;

    const isFullWidth = ch === '。' || ch === '！' || ch === '？';
    const isAsciiTerm = ch === '.' || ch === '!' || ch === '?';

    if (!isFullWidth && !isAsciiTerm) continue;

    // Peek ahead: consume any consecutive terminator characters first.
    // This handles cases like `!?`, `！？`, `...` — we keep them in the current segment.
    while (i + 1 < text.length) {
      const next = text[i + 1]!;
      if (
        next === '.' || next === '!' || next === '?' ||
        next === '。' || next === '！' || next === '？'
      ) {
        i++;
        current += text[i]!;
      } else {
        break;
      }
    }

    // For ASCII `.`: do not split if it is a decimal point between digits.
    // e.g. "1.5" or "v1.5" — check that the char before `.` and after `.` are digits.
    // Only applies to single isolated `.` (not `..` sequences, already consumed above).
    if (ch === '.' && current.length >= 2) {
      const lastCh = current[current.length - 1]!; // the `.` we just added
      const prevCh = current[current.length - 2];   // char before `.`
      if (lastCh === '.' && prevCh !== undefined && /\d/.test(prevCh)) {
        // Check the character after `.`
        const nextCh = i + 1 < text.length ? text[i + 1] : undefined;
        if (nextCh !== undefined && /\d/.test(nextCh)) {
          // This is a decimal point — do not split here.
          continue;
        }
      }
    }

    // For ASCII terminators (`.`, `!`, `?`):
    // Split only when followed by whitespace (including \n) or end of string.
    if (isAsciiTerm) {
      const nextCh = i + 1 < text.length ? text[i + 1] : undefined;
      if (nextCh !== undefined && !/[\s]/.test(nextCh)) {
        // Not followed by whitespace or end — do not split.
        continue;
      }
    }

    // Commit the current sentence.
    const trimmed = current.trim();
    if (trimmed.length > 0) {
      result.push(trimmed);
    }
    current = '';
  }

  // Remainder after last terminator (or entire input if no terminator found).
  const trimmed = current.trim();
  if (trimmed.length > 0) {
    result.push(trimmed);
  }

  return result.length > 0 ? result : (text.trim() ? [text.trim()] : []);
}
