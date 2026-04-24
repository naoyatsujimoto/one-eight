import type { MoveRecord } from './types';

export function generateRecordText(history: MoveRecord[]): string {
  if (history.length === 0) return '';
  return history.map(toNotation).join('\n');
}

export function toNotation(record: MoveRecord): string {
  const prefix = `${record.moveNumber}. ${record.positioning}, `;

  switch (record.build.type) {
    case 'massive':
      return `${prefix}${record.build.gate === null ? 'm(-)' : `m(${record.build.gate})`}`;
    case 'selective':
      return `${prefix}s(${record.build.gates[0]},${record.build.gates[1]})`;
    case 'quad':
      return `${prefix}q`;
    case 'skip':
      return `${record.moveNumber}. P`;
    case 'no-build':
      return `${prefix}nb`;
  }
}
