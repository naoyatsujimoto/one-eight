/**
 * phase0_fvhard_009.ts
 *
 * Run 9 入力ファイル完全検査 (DB書き込みなし)
 * 1手でも再生失敗・手数不一致・不正トークンがあれば停止する。
 *
 * 実行:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   node_modules/.bin/vite-node /tmp/phase0_fvhard_009.ts 2>&1 | tee /tmp/phase0_fvhard_009.log
 */

import * as fs from 'fs';

// .env 手動ロード（DB接続不要だが engine/mediumPattern が参照する可能性に備える）
try {
  const lines = fs.readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/.env', 'utf-8').split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx < 0) continue;
    const key = t.slice(0, idx).trim();
    const val = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* ok */ }

import { createInitialState } from '../src/game/initialState';
import {
  selectPosition, applyMassiveBuild, applySelectiveBuild,
  applySelectiveBuildSingle, applyQuadBuildForGates, skipTurn, confirmPositionOnly,
} from '../src/game/engine';
import { computeMediumPatternId } from '../src/game/mediumPattern';
import type { GameState, GateId, PositionId } from '../src/game/types';

const SIM_FILE_PATH       = '/Users/nt/Desktop/Claude_Cowork/sim_easy/sim_fastveryhard_vs_fastveryhard_20260806.md';
const SIM_BATCH_ID        = 'fvhard_20260806_009';
const EXPECTED_GAME_COUNT = 10000;
const EXPECTED_BLACK_WINS = 4011;
const EXPECTED_WHITE_WINS = 5989;
const EXPECTED_DRAWS      = 0;

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

type RawMove = {
  positionId: string;
  buildType: 's' | 'm' | 'q' | 'pass';
  gates: number[];
};

type ParsedGame = {
  gameIndex: number;
  winner: string;
  moveCount: number;
  moves: RawMove[];
  rawLine: string;
};

function parseMoveToken(token: string): RawMove | null | 'INVALID' {
  const t = token.trim();
  if (!t) return null;
  if (t.startsWith('...')) return null;  // truncated marker
  if (t === 'P,pass') return { positionId: 'P', buildType: 'pass', gates: [] };
  const m = t.match(/^([A-MP]),([smq])\(([^)]*)\)$/);
  if (!m) return 'INVALID';  // 不正トークン
  const gateStr = m[3].trim();
  const gates = gateStr === '' ? [] : gateStr.split(',').map(g => {
    const n = parseInt(g.trim(), 10);
    if (isNaN(n)) return -1;
    return n;
  });
  if (gates.some(g => g < 0)) return 'INVALID';
  return { positionId: m[1], buildType: m[2] as 's' | 'm' | 'q', gates };
}

function parseWinner(col: string): string {
  const c = col.trim();
  if (c === '黒') return 'black';
  if (c === '白') return 'white';
  if (c === '引き分け') return 'draw';
  return c.toLowerCase();
}

function parseSimFile(content: string): { games: ParsedGame[]; invalidTokenGames: number[]; errors: string[] } {
  const games: ParsedGame[] = [];
  const invalidTokenGames: number[] = [];
  const errors: string[] = [];
  let inTable = false;

  for (const line of content.split('\n')) {
    if (line.trim() === '## 全棋譜') { inTable = true; continue; }
    if (!inTable) continue;
    if (!line.startsWith('| ')) continue;
    const cols = line.split('|').map(c => c.trim()).filter((_, i) => i > 0);
    if (cols.length < 6) continue;
    const indexStr = cols[0];
    if (!indexStr || !/^\d+$/.test(indexStr)) continue;

    const gameIndex = parseInt(indexStr, 10);
    const winner = parseWinner(cols[1]);
    const moveCount = parseInt(cols[2], 10) || 0;
    const kifu = cols[5] ?? '';
    const moves: RawMove[] = [];
    let hasInvalidToken = false;

    for (const tok of kifu.split(' ')) {
      if (!tok.trim()) continue;
      const mv = parseMoveToken(tok);
      if (mv === 'INVALID') {
        hasInvalidToken = true;
        errors.push(`game=${gameIndex} 不正トークン: "${tok}"`);
      } else if (mv !== null) {
        moves.push(mv);
      }
    }

    if (hasInvalidToken) invalidTokenGames.push(gameIndex);
    games.push({ gameIndex, winner, moveCount, moves, rawLine: line });
  }

  return { games, invalidTokenGames, errors };
}

type ReplayResult = {
  ok: boolean;
  errorMsg?: string;
  moveCount: number;
  hashOk: number;
  medOk: number;
};

function replayGameStrict(g: ParsedGame): ReplayResult {
  let state: GameState = createInitialState();
  let moveNum = 0;
  let hashOk = 0;
  let medOk = 0;

  for (const raw of g.moves) {
    moveNum++;

    if (raw.buildType === 'pass') {
      try {
        state = skipTurn(state);
      } catch (e) {
        return { ok: false, errorMsg: `Move ${moveNum} skipTurn failed: ${e}`, moveCount: moveNum - 1, hashOk, medOk };
      }
      const last = state.history[state.history.length - 1];
      if (last?.canonical_hash) hashOk++;
      try { if (computeMediumPatternId(state)) medOk++; } catch { /* ok */ }
      continue;
    }

    try {
      state = selectPosition(state, raw.positionId as PositionId);
    } catch (e) {
      return { ok: false, errorMsg: `Move ${moveNum} selectPosition(${raw.positionId}) failed: ${e}`, moveCount: moveNum - 1, hashOk, medOk };
    }

    try {
      if (raw.buildType === 'm') {
        if (raw.gates.length > 0) {
          state = applyMassiveBuild(state, raw.gates[0] as GateId);
        } else {
          state = confirmPositionOnly(state);
        }
      } else if (raw.buildType === 's') {
        if (raw.gates.length >= 2) {
          state = applySelectiveBuild(state, [raw.gates[0] as GateId, raw.gates[1] as GateId]);
        } else if (raw.gates.length === 1) {
          state = applySelectiveBuildSingle(state, raw.gates[0] as GateId);
        } else {
          state = confirmPositionOnly(state);
        }
      } else if (raw.buildType === 'q') {
        state = applyQuadBuildForGates(state, raw.gates as GateId[]);
      }
    } catch (e) {
      return { ok: false, errorMsg: `Move ${moveNum} build(${raw.buildType} gates=${raw.gates}) failed: ${e}`, moveCount: moveNum - 1, hashOk, medOk };
    }

    const last = state.history[state.history.length - 1];
    if (last?.canonical_hash) hashOk++;
    try { if (computeMediumPatternId(state)) medOk++; } catch { /* ok */ }
  }

  return { ok: true, moveCount: moveNum, hashOk, medOk };
}

async function main() {
  log('=== Phase 0: Run 9 入力ファイル完全検査 ===');
  log(`ファイル: ${SIM_FILE_PATH}`);
  log(`期待 batch: ${SIM_BATCH_ID}`);
  log(`期待局数: ${EXPECTED_GAME_COUNT}`);
  log('');

  if (!fs.existsSync(SIM_FILE_PATH)) {
    log(`ERROR: ファイルが存在しません: ${SIM_FILE_PATH}`);
    process.exit(1);
  }

  const content = fs.readFileSync(SIM_FILE_PATH, 'utf-8');
  log(`ファイルサイズ: ${content.length.toLocaleString()} bytes`);

  // ── パース ──
  log('パース中...');
  const { games, invalidTokenGames, errors: parseErrors } = parseSimFile(content);
  log(`パース完了: ${games.length} ゲーム`);

  // ── 基本チェック ──
  log('\n--- 基本チェック ---');

  // 局数
  if (games.length !== EXPECTED_GAME_COUNT) {
    log(`[FAIL] 局数不一致: 期待=${EXPECTED_GAME_COUNT} 実際=${games.length}`);
    process.exit(1);
  }
  log(`✅ 局数: ${games.length} (期待値 ${EXPECTED_GAME_COUNT} と一致)`);

  // game_index 重複チェック
  const indexSet = new Set<number>();
  const duplicates: number[] = [];
  for (const g of games) {
    if (indexSet.has(g.gameIndex)) duplicates.push(g.gameIndex);
    else indexSet.add(g.gameIndex);
  }
  if (duplicates.length > 0) {
    log(`[FAIL] game_index 重複: ${duplicates.slice(0, 10).join(', ')}`);
    process.exit(1);
  }
  log(`✅ game_index 重複: 0`);

  // game_index 範囲 1〜10000
  const indices = [...indexSet].sort((a, b) => a - b);
  const minIdx = indices[0];
  const maxIdx = indices[indices.length - 1];
  if (minIdx !== 1 || maxIdx !== EXPECTED_GAME_COUNT) {
    log(`[FAIL] game_index 範囲不正: min=${minIdx} max=${maxIdx} (期待: 1〜${EXPECTED_GAME_COUNT})`);
    process.exit(1);
  }
  log(`✅ game_index 範囲: ${minIdx}〜${maxIdx}`);

  // winner 集計
  let blackWins = 0, whiteWins = 0, draws = 0, invalidWinners = 0;
  for (const g of games) {
    if (g.winner === 'black') blackWins++;
    else if (g.winner === 'white') whiteWins++;
    else if (g.winner === 'draw') draws++;
    else invalidWinners++;
  }

  if (invalidWinners > 0) {
    log(`[FAIL] 不正 winner: ${invalidWinners} 件`);
    process.exit(1);
  }
  log(`✅ winner 不正: 0`);

  if (blackWins !== EXPECTED_BLACK_WINS) {
    log(`[FAIL] 黒勝利不一致: 期待=${EXPECTED_BLACK_WINS} 実際=${blackWins}`);
    process.exit(1);
  }
  log(`✅ 黒勝利: ${blackWins} (期待値 ${EXPECTED_BLACK_WINS})`);

  if (whiteWins !== EXPECTED_WHITE_WINS) {
    log(`[FAIL] 白勝利不一致: 期待=${EXPECTED_WHITE_WINS} 実際=${whiteWins}`);
    process.exit(1);
  }
  log(`✅ 白勝利: ${whiteWins} (期待値 ${EXPECTED_WHITE_WINS})`);

  if (draws !== EXPECTED_DRAWS) {
    log(`[FAIL] 引き分け不一致: 期待=${EXPECTED_DRAWS} 実際=${draws}`);
    process.exit(1);
  }
  log(`✅ 引き分け: ${draws}`);

  // 不正トークン
  if (invalidTokenGames.length > 0) {
    log(`[FAIL] 不正トークンを含むゲーム: ${invalidTokenGames.length} 件`);
    for (const e of parseErrors.slice(0, 10)) log(`  ${e}`);
    process.exit(1);
  }
  log(`✅ 不正トークン: 0`);

  // full_record 空配列チェック
  const emptyRecord = games.filter(g => g.moves.length === 0);
  if (emptyRecord.length > 0) {
    log(`[FAIL] 手数0のゲーム: ${emptyRecord.map(g => g.gameIndex).slice(0, 10).join(', ')}`);
    process.exit(1);
  }
  log(`✅ full_record空配列: 0`);

  // 手数統計
  const moveCounts = games.map(g => g.moves.length);
  const minMoves = Math.min(...moveCounts);
  const maxMoves = Math.max(...moveCounts);
  const avgMoves = moveCounts.reduce((a, b) => a + b, 0) / moveCounts.length;
  log(`\n手数統計: min=${minMoves} max=${maxMoves} avg=${avgMoves.toFixed(1)}`);
  if (minMoves < 40 || maxMoves > 80) {
    log(`[WARN] 手数範囲が想定外: min=${minMoves} max=${maxMoves}`);
  }

  // moveCount フィールドと実手数の一致チェック
  log('\n--- 手数一致チェック ---');
  const moveCountMismatch: number[] = [];
  for (const g of games) {
    if (g.moveCount !== g.moves.length) {
      moveCountMismatch.push(g.gameIndex);
    }
  }
  if (moveCountMismatch.length > 0) {
    log(`[FAIL] 手数不一致 (moveCountフィールド ≠ 実手数): ${moveCountMismatch.length} 件`);
    for (const gi of moveCountMismatch.slice(0, 5)) {
      const g = games.find(x => x.gameIndex === gi)!;
      log(`  game=${gi} expected_moves=${g.moveCount} actual_moves=${g.moves.length}`);
    }
    process.exit(1);
  }
  log(`✅ 全 ${games.length} 局の手数フィールド一致`);

  // ── 全局再生 ──
  log('\n--- 全局再生検査 (厳格モード: 失敗0件必須) ---');
  let replayFails = 0;
  let hashTotal = 0, medTotal = 0;
  let minHashOk = Infinity, minMedOk = Infinity;

  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    const result = replayGameStrict(g);
    if (!result.ok) {
      replayFails++;
      log(`[FAIL] game=${g.gameIndex} 再生失敗: ${result.errorMsg}`);
      if (replayFails >= 5) {
        log(`[FATAL] 再生失敗が ${replayFails} 件に達しました。DB書き込み前に中断します。`);
        process.exit(1);
      }
    }
    hashTotal += result.hashOk;
    medTotal  += result.medOk;
    if (result.hashOk < minHashOk) minHashOk = result.hashOk;
    if (result.medOk  < minMedOk)  minMedOk  = result.medOk;

    if ((i + 1) % 1000 === 0) {
      process.stdout.write(`  再生: ${i + 1}/${games.length} fails=${replayFails}\r`);
    }
  }
  process.stdout.write('\n');

  if (replayFails > 0) {
    log(`[FATAL] 再生失敗 ${replayFails} 件 — DB書き込みを中止します`);
    process.exit(1);
  }
  log(`✅ 再生失敗: 0`);

  const avgHash = (hashTotal / games.length).toFixed(1);
  const avgMed  = (medTotal  / games.length).toFixed(1);
  log(`canonical_hash: avg=${avgHash}/局 min=${minHashOk}`);
  log(`medium_pattern: avg=${avgMed}/局  min=${minMedOk}`);

  if (minHashOk === 0) {
    log(`[WARN] canonical_hash 取得失敗が1局以上あります`);
  } else {
    log(`✅ canonical_hash取得失敗: 0局`);
  }
  if (minMedOk === 0) {
    log(`[WARN] medium_pattern_id 取得失敗が1局以上あります`);
  } else {
    log(`✅ medium_pattern_id取得失敗: 0局`);
  }

  // ── Run 9 付帯情報確認 ──
  log('\n--- Run 9 実行条件メモ確認 ---');
  if (content.includes('4プロセス並列') || content.includes('Run 9')) {
    log('✅ 実行条件メモ（4プロセス並列・黒勝率上振れ注記）を確認');
    log('   → 勝率補正なし・fastveryhard_vs_fastveryhardとして取り込む');
  }

  // ── 最終結果 ──
  log('\n=== Phase 0 検査結果 ===');
  log(`局数              : ${games.length} ✅`);
  log(`game_index        : 1〜${maxIdx} ✅`);
  log(`game_index 重複   : 0 ✅`);
  log(`不正トークン      : 0 ✅`);
  log(`手数不一致        : 0 ✅`);
  log(`full_record空配列 : 0 ✅`);
  log(`再生失敗          : 0 ✅`);
  log(`黒勝利            : ${blackWins} (40.11%) ✅`);
  log(`白勝利            : ${whiteWins} (59.89%) ✅`);
  log(`引き分け          : ${draws} ✅`);
  log(`平均手数          : ${avgMoves.toFixed(1)} (期待: 51.6)`);
  log(`最短手数          : ${minMoves} (期待: 48)`);
  log(`最長手数          : ${maxMoves} (期待: 60)`);
  log('');
  log('→ Phase A (import_fvhard_009.ts) 実行可能');
  log('=== Phase 0 完了 ===');
}

main().catch(e => { log(`FATAL: ${e}`); process.exit(1); });
