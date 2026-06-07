import { readFileSync } from 'fs';
try {
  const lines = readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/.env', 'utf-8').split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx < 0) continue;
    const k = t.slice(0, idx).trim();
    const v = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
} catch {}

// 初手の canonical_hash を計算するテスト
import { createInitialState } from '../src/game/initialState';
import { computeCanonicalHashString } from '../src/game/zobrist';

const initialState = createInitialState('white'); // human=Black, cpu=White
const hash = computeCanonicalHashString(initialState);
console.log('Initial hash (cpuPlayer=white):', hash);

const initialStateBlackCpu = createInitialState('black'); // human=White, cpu=Black
const hash2 = computeCanonicalHashString(initialStateBlackCpu);
console.log('Initial hash (cpuPlayer=black):', hash2);

// note: cpuPlayer は canonical_hash に含まれない（ゲーム状態のみ）
// 両方同じハッシュになるはず（cpuPlayer は表示UI用であって局面ではない）
