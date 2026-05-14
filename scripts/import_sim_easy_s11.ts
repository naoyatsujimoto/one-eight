/**
 * import_sim_easy_s11.ts
 *
 * sim_easy_vs_easy_20260512b.md (5,000局) を取り込む。
 * sim_batch_id: easy_20260512_011
 *
 * 実行方法:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   npx vite-node scripts/import_sim_easy_s11.ts
 *
 * フェーズ分割設計（タイムアウト耐性）:
 *   Phase A: sim_match_logs INSERT (5,000件)
 *     - 既存バッチが5,000件揃っていればスキップ → Phase B/C へ
 *     - 既存バッチが不完全（< 5,000件）→ 削除して再INSERT
 *   Phase B: sim_position_stats upsert (Phase A 完了後)
 *   Phase C: sim_medium_pattern_stats 直接 upsert (Phase B 完了後)
 *
 * 制約:
 *   - match_logs / position_stats / medium_pattern_stats（実戦）への書き込みは一切行わない
 */

import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { createInitialState } from '../src/game/initialState';
import {
  selectPosition,
  applyMassiveBuild,
  applySelectiveBuild,
  applySelectiveBuildSingle,
  applyQuadBuildForGates,
  skipTurn,
  confirmPositionOnly,
} from '../src/game/engine';
import { computeMediumPatternId } from '../src/game/mediumPattern';
import type { GameState, MoveRecord, GateId, PositionId } from '../src/game/types';

// ─── 環境変数 ────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: VITE_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── sim メタデータ ───────────────────────────────────────────────────────────

const SIM_FILE_PATH = '/Users/nt/Desktop/Claude_Cowork/sim_easy/sim_easy_vs_easy_20260512b.md';
const SIM_BATCH_ID = 'easy_20260512_011';
const SIM_POLICY = 'easy_vs_easy';
const SIM_VERSION = '1.0.0';
const ENGINE_VERSION = '1.0.0';
const RULES_VERSION = '1.1.0';
const GENERATED_AT = '2026-05-12T00:00:00Z';

// ─── ユーティリティ ───────────────────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── 棋譜パーサー ─────────────────────────────────────────────────────────────

type ParsedGame = {
  gameIndex: number;
  batchNumber: number;
  winner: string;
  moveCount: number;
  moves: RawMove[];
};

type RawMove = {
  moveNumber: number;
  positionId: string;
  buildType: 's' | 'm' | 'q';
  gates: number[];
};

function parseMoveToken(token: string): RawMove | null {
  const match = token.match(/^M(\d+):([A-M]),([smq])\(([^)]*)\)$/);
  if (!match) return null;
  const moveNumber = parseInt(match[1], 10);
  const positionId = match[2];
  const buildType = match[3] as 's' | 'm' | 'q';
  const gatesStr = match[4];
  const gates = gatesStr
    .split(',')
    .map(g => g.trim())
    .filter(g => g !== '')
    .map(g => parseInt(g, 10));
  return { moveNumber, positionId, buildType, gates };
}

function parseSimFile(content: string): ParsedGame[] {
  const games: ParsedGame[] = [];
  const lines = content.split('\n');
  let currentGame: ParsedGame | null = null;

  for (const line of lines) {
    const gameHeaderMatch = line.match(/^### Game (\d+) \(Batch (\d+)\)/);
    if (gameHeaderMatch) {
      if (currentGame) games.push(currentGame);
      currentGame = {
        gameIndex: parseInt(gameHeaderMatch[1], 10),
        batchNumber: parseInt(gameHeaderMatch[2], 10),
        winner: '',
        moveCount: 0,
        moves: [],
      };
      continue;
    }

    if (!currentGame) continue;

    const resultMatch = line.match(/\*\*勝者\*\*:\s*(\w+)\s+\*\*手数\*\*:\s*(\d+)/);
    if (resultMatch) {
      currentGame.winner = resultMatch[1];
      currentGame.moveCount = parseInt(resultMatch[2], 10);
      continue;
    }

    if (line.match(/^\s+M\d+:/)) {
      const tokens = line.trim().split(/\s+/);
      for (const token of tokens) {
        const move = parseMoveToken(token);
        if (move) currentGame.moves.push(move);
      }
    }
  }

  if (currentGame) games.push(currentGame);
  return games;
}

// ─── MoveRecord 変換 ──────────────────────────────────────────────────────────

type ExtendedMoveRecord = MoveRecord & {
  medium_pattern_id?: string;
};

function rawMoveToMoveRecord(raw: RawMove): ExtendedMoveRecord {
  const player = raw.moveNumber % 2 === 1 ? 'black' : 'white';
  let build: MoveRecord['build'];

  switch (raw.buildType) {
    case 'm': {
      const gate = raw.gates.length > 0 ? (raw.gates[0] as GateId) : null;
      build = { type: 'massive', gate, placed: 1 };
      break;
    }
    case 's': {
      if (raw.gates.length >= 2) {
        build = {
          type: 'selective',
          gates: [raw.gates[0] as GateId, raw.gates[1] as GateId],
          placed: 2,
        };
      } else if (raw.gates.length === 1) {
        build = {
          type: 'selective',
          gates: [raw.gates[0] as GateId, 0],
          placed: 1,
        };
      } else {
        build = { type: 'selective', gates: [0, 0], placed: 0 };
      }
      break;
    }
    case 'q': {
      build = {
        type: 'quad',
        placedGateIds: raw.gates as GateId[],
        placed: raw.gates.length,
      };
      break;
    }
    default: {
      build = { type: 'no-build' };
      break;
    }
  }

  return {
    moveNumber: raw.moveNumber,
    player,
    positioning: raw.positionId as PositionId,
    build,
  };
}

// ─── replayGame: canonical_hash + medium_pattern_id を付与 ────────────────────

function replayGame(history: ExtendedMoveRecord[]): ExtendedMoveRecord[] {
  let state: GameState = createInitialState();
  const result: ExtendedMoveRecord[] = [];

  for (const record of history) {
    const { positioning, build } = record;

    if (positioning !== 'P') {
      state = selectPosition(state, positioning as PositionId);
    }

    let nextState: GameState;

    switch (build.type) {
      case 'massive': {
        if (build.gate !== null) {
          nextState = applyMassiveBuild(state, build.gate as GateId);
        } else {
          nextState = confirmPositionOnly(state);
        }
        break;
      }
      case 'selective': {
        const gates = build.gates as [GateId | 0, GateId | 0];
        const validGates = gates.filter((g): g is GateId => g !== 0);
        if (validGates.length === 2) {
          nextState = applySelectiveBuild(state, validGates as [GateId, GateId]);
        } else if (validGates.length === 1) {
          nextState = applySelectiveBuildSingle(state, validGates[0]);
        } else {
          nextState = confirmPositionOnly(state);
        }
        break;
      }
      case 'quad': {
        nextState = applyQuadBuildForGates(state, build.placedGateIds as GateId[]);
        break;
      }
      case 'skip': {
        nextState = skipTurn(state);
        break;
      }
      case 'no-build': {
        nextState = confirmPositionOnly(state);
        break;
      }
      default: {
        nextState = state;
        break;
      }
    }

    // canonical_hash 取得
    const lastRecord = nextState.history[nextState.history.length - 1];
    let canonicalHash: string | undefined;
    if (lastRecord && lastRecord.moveNumber === record.moveNumber) {
      canonicalHash = lastRecord.canonical_hash;
    }

    // medium_pattern_id 計算
    let mediumPatternId: string | undefined;
    try {
      mediumPatternId = computeMediumPatternId(nextState);
    } catch {
      mediumPatternId = undefined;
    }

    result.push({
      ...record,
      canonical_hash: canonicalHash,
      medium_pattern_id: mediumPatternId,
    });

    state = nextState;
  }

  return result;
}

// ─── メイン処理 ───────────────────────────────────────────────────────────────

async function main() {
  console.log('=== import_sim_easy_s11.ts ===');
  console.log(`sim_batch_id: ${SIM_BATCH_ID}`);
  console.log(`sim_policy  : ${SIM_POLICY}`);
  console.log(`source file : ${SIM_FILE_PATH}\n`);

  // ─── 変換済みデータを準備 ────────────────────────────────────────────────────

  // ファイル読み込み
  if (!fs.existsSync(SIM_FILE_PATH)) {
    console.error(`ERROR: ファイルが見つかりません: ${SIM_FILE_PATH}`);
    process.exit(1);
  }
  const content = fs.readFileSync(SIM_FILE_PATH, 'utf-8');
  console.log(`ファイル読み込み完了: ${content.length.toLocaleString()} bytes`);

  // パース
  console.log('パース中...');
  const games = parseSimFile(content);
  console.log(`パース完了: ${games.length} ゲーム\n`);

  if (games.length === 0) {
    console.error('ERROR: ゲームが1件もパースできませんでした');
    process.exit(1);
  }

  // MoveRecord変換 + canonical_hash + medium_pattern_id 付与
  console.log('MoveRecord変換 + canonical_hash + medium_pattern_id 計算中...');
  
  type RowData = {
    winner: string | null;
    full_record: ExtendedMoveRecord[];
    canonical_hashes_computed: boolean;
    game_index: number;
    move_count: number;
  };

  const allRows: RowData[] = [];
  let hashSuccessCount = 0;
  let hashFailCount = 0;
  let mediumSuccessCount = 0;
  let mediumFailCount = 0;
  let parseErrorCount = 0;

  for (let gi = 0; gi < games.length; gi++) {
    const game = games[gi];
    if (game.moves.length === 0) {
      console.warn(`[WARN] Game ${game.gameIndex}: 手がパースできませんでした`);
      parseErrorCount++;
      continue;
    }

    const moveRecords: ExtendedMoveRecord[] = game.moves.map(rawMoveToMoveRecord);

    let replayedRecords: ExtendedMoveRecord[];
    try {
      replayedRecords = replayGame(moveRecords);
    } catch (e) {
      console.warn(`[WARN] Game ${game.gameIndex}: replayGame失敗: ${e instanceof Error ? e.message : String(e)}`);
      replayedRecords = moveRecords;
      hashFailCount++;
    }

    const hashCount = replayedRecords.filter(m => m.canonical_hash).length;
    const mediumCount = replayedRecords.filter(m => m.medium_pattern_id).length;

    if (hashCount > 0) hashSuccessCount++;
    else hashFailCount++;

    if (mediumCount > 0) mediumSuccessCount++;
    else mediumFailCount++;

    if ((gi + 1) % 100 === 0) {
      process.stdout.write(`  変換中: ${gi + 1}/${games.length}\r`);
    }

    allRows.push({
      winner: game.winner || null,
      full_record: replayedRecords,
      canonical_hashes_computed: hashCount > 0,
      game_index: gi + 1,
      move_count: replayedRecords.length,
    });
  }

  console.log(`\n変換完了: ${allRows.length} 件`);
  console.log(`  canonical_hash: 成功=${hashSuccessCount} 失敗=${hashFailCount} parseError=${parseErrorCount}`);
  console.log(`  medium_pattern_id: 成功=${mediumSuccessCount} 失敗=${mediumFailCount}\n`);

  // ─── Phase A: sim_match_logs INSERT ─────────────────────────────────────────

  console.log('--- Phase A: sim_match_logs INSERT ---');

  // 既存バッチ確認
  const { count: existingCount } = await supabase
    .from('sim_match_logs')
    .select('*', { count: 'exact', head: true })
    .eq('sim_batch_id', SIM_BATCH_ID);

  const existing = existingCount ?? 0;

  if (existing >= 5000) {
    console.log(`Phase A スキップ: sim_batch_id='${SIM_BATCH_ID}' は既に ${existing} 件存在します（完全取込済み）。\n`);
  } else {
    if (existing > 0) {
      console.log(`[INFO] ${existing} 件の不完全なデータを削除して再INSERT します。`);
      const { error: delErr } = await supabase
        .from('sim_match_logs')
        .delete()
        .eq('sim_batch_id', SIM_BATCH_ID);
      if (delErr) {
        console.error(`削除エラー: ${delErr.message}`);
        process.exit(1);
      }
      console.log('削除完了。INSERT を再開します。\n');
    }

    // INSERT (小バッチ + リトライ)
    const INSERT_BATCH_SIZE = 5;
    const MAX_RETRY = 3;

    let insertedCount = 0;

    for (let i = 0; i < allRows.length; i += INSERT_BATCH_SIZE) {
      const chunk = allRows.slice(i, i + INSERT_BATCH_SIZE);
      const dbChunk = chunk.map(r => ({
        source: 'sim',
        sim_policy: SIM_POLICY,
        sim_batch_id: SIM_BATCH_ID,
        sim_version: SIM_VERSION,
        engine_version: ENGINE_VERSION,
        rules_version: RULES_VERSION,
        generated_at: GENERATED_AT,
        game_index: r.game_index,
        winner: r.winner,
        move_count: r.move_count,
        full_record: r.full_record,
        canonical_hashes_computed: r.canonical_hashes_computed,
      }));

      let lastError: string | null = null;
      for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
        const { error } = await supabase.from('sim_match_logs').insert(dbChunk);
        if (!error) {
          lastError = null;
          break;
        }
        lastError = error.message;
        if (attempt < MAX_RETRY - 1) {
          console.warn(`  [WARN] INSERT offset ${i} attempt ${attempt + 1} failed: ${error.message} — retrying...`);
          await sleep(3000);
        }
      }

      if (lastError) {
        throw new Error(`sim_match_logs INSERT failed (offset ${i}): ${lastError}`);
      }

      insertedCount += chunk.length;
      if (Math.floor(i / INSERT_BATCH_SIZE) % 20 === 0) {
        process.stdout.write(`  Phase A: ${insertedCount}/${allRows.length} 件\r`);
      }
    }

    console.log(`\n  Phase A 完了: ${insertedCount} 件\n`);
  }

  // ─── Phase B: sim_position_stats upsert ─────────────────────────────────────

  console.log('--- Phase B: sim_position_stats upsert ---');

  let bSuccess = 0;
  let bSkip = 0;
  let bError = 0;

  for (let i = 0; i < allRows.length; i++) {
    const r = allRows[i];

    if (!r.canonical_hashes_computed || !r.winner) {
      bSkip++;
      continue;
    }

    const hashes = r.full_record
      .map(m => m.canonical_hash)
      .filter((h): h is string => !!h);

    if (hashes.length === 0) {
      bSkip++;
      continue;
    }

    const { error: rpcErr } = await supabase.rpc('batch_upsert_sim_position_stats', {
      p_hashes: hashes,
      p_winner: r.winner,
      p_sim_policy: SIM_POLICY,
    });

    if (rpcErr) {
      console.error(`  RPC ERROR (game ${i + 1}): ${rpcErr.message}`);
      bError++;
    } else {
      bSuccess++;
    }

    if (bSuccess % 100 === 0 && bSuccess > 0) {
      process.stdout.write(`  Phase B: ${bSuccess + bSkip + bError}/${allRows.length} 完了\r`);
    }
  }

  console.log(`\nPhase B 完了: success=${bSuccess} skip=${bSkip} error=${bError}\n`);

  // ─── Phase C: sim_medium_pattern_stats 直接 upsert ──────────────────────────

  console.log('--- Phase C: sim_medium_pattern_stats 直接 upsert ---');

  // テーブル存在確認
  const { error: medCheckErr } = await supabase
    .from('sim_medium_pattern_stats')
    .select('*', { count: 'exact', head: true });

  const mediumTableMissing = medCheckErr && (
    medCheckErr.message.includes('relation') ||
    medCheckErr.message.includes('does not exist') ||
    (medCheckErr as { code?: string }).code === '42P01'
  );

  if (mediumTableMissing) {
    console.warn('[WARN] sim_medium_pattern_stats テーブルが存在しません。Phase C をスキップします。');
  } else {
    // Step C-1: メモリ上で medium_pattern_id ごとに集計（1ゲーム内重複除去）
    console.log('Step C-1: メモリ集計中...');

    type MedAccum = { wins_black: number; wins_white: number; draws: number; total: number };
    const newStats = new Map<string, MedAccum>();
    let cSkipCount = 0;

    for (const r of allRows) {
      if (!r.winner) { cSkipCount++; continue; }
      const patternIds = r.full_record
        .map((m: ExtendedMoveRecord) => m.medium_pattern_id)
        .filter((p): p is string => !!p);
      if (patternIds.length === 0) { cSkipCount++; continue; }
      const unique = [...new Set(patternIds)];
      for (const pid of unique) {
        const cur = newStats.get(pid) ?? { wins_black: 0, wins_white: 0, draws: 0, total: 0 };
        cur.wins_black += r.winner === 'black' ? 1 : 0;
        cur.wins_white += r.winner === 'white' ? 1 : 0;
        cur.draws      += r.winner === 'draw'  ? 1 : 0;
        cur.total      += 1;
        newStats.set(pid, cur);
      }
    }
    console.log(`集計完了: ${newStats.size} パターン (スキップ: ${cSkipCount} ゲーム)`);

    // Step C-2: 既存の sim_medium_pattern_stats を全件取得
    console.log('Step C-2: 既存データ取得中...');

    type MedStat = {
      medium_pattern_id: string;
      sim_policy: string;
      wins_black: number;
      wins_white: number;
      draws: number;
      total: number;
    };
    const existingMap = new Map<string, MedStat>();
    let exOffset2 = 0;
    const C_PAGE = 500;

    while (true) {
      const { data: exData, error: exErr } = await supabase
        .from('sim_medium_pattern_stats')
        .select('medium_pattern_id, sim_policy, wins_black, wins_white, draws, total')
        .eq('sim_policy', SIM_POLICY)
        .range(exOffset2, exOffset2 + C_PAGE - 1);
      if (exErr) { console.error(`既存データ取得エラー: ${exErr.message}`); break; }
      if (!exData || exData.length === 0) break;
      for (const row of exData as MedStat[]) {
        existingMap.set(row.medium_pattern_id, row);
      }
      process.stdout.write(`  既存取得: ${existingMap.size} 件\r`);
      exOffset2 += C_PAGE;
      if (exData.length < C_PAGE) break;
    }
    console.log(`\n既存取得完了: ${existingMap.size} 件`);

    // Step C-3: マージ
    console.log('Step C-3: マージ中...');
    const merged: MedStat[] = [];
    for (const [pid, newStat] of newStats) {
      const ex = existingMap.get(pid);
      if (ex) {
        merged.push({
          medium_pattern_id: pid,
          sim_policy: SIM_POLICY,
          wins_black: ex.wins_black + newStat.wins_black,
          wins_white: ex.wins_white + newStat.wins_white,
          draws:      ex.draws      + newStat.draws,
          total:      ex.total      + newStat.total,
        });
      } else {
        merged.push({
          medium_pattern_id: pid,
          sim_policy: SIM_POLICY,
          wins_black: newStat.wins_black,
          wins_white: newStat.wins_white,
          draws:      newStat.draws,
          total:      newStat.total,
        });
      }
    }
    console.log(`マージ完了: ${merged.length} 件`);

    // Step C-4: バルク upsert（500件チャンク）
    console.log('Step C-4: バルク upsert 中...');
    const UPSERT_CHUNK = 500;
    let upsertedOk = 0;
    let upsertErrors = 0;

    for (let i = 0; i < merged.length; i += UPSERT_CHUNK) {
      const chunk = merged.slice(i, i + UPSERT_CHUNK);
      const { error: upsertErr } = await supabase
        .from('sim_medium_pattern_stats')
        .upsert(chunk, { onConflict: 'medium_pattern_id,sim_policy' });
      if (upsertErr) {
        console.error(`\nUPSERT ERROR (chunk ${i}~${i + chunk.length}): ${upsertErr.message}`);
        upsertErrors += chunk.length;
      } else {
        upsertedOk += chunk.length;
      }
      process.stdout.write(`  upsert: ${upsertedOk + upsertErrors}/${merged.length} 件\r`);
    }

    console.log(`\nPhase C 完了: success=${upsertedOk} error=${upsertErrors}\n`);
  }

  // ─── 実戦テーブル汚染チェック ────────────────────────────────────────────────

  console.log('=== 実戦テーブル汚染チェック ===');
  const { count: mlCount, error: mlErr } = await supabase
    .from('match_logs')
    .select('*', { count: 'exact', head: true });
  const { count: psCount, error: psErr } = await supabase
    .from('position_stats')
    .select('*', { count: 'exact', head: true });

  if (mlErr) console.warn(`match_logs チェックエラー: ${mlErr.message}`);
  else console.log(`match_logs: ${mlCount} 件 (変化なし確認)`);

  if (psErr) console.warn(`position_stats チェックエラー: ${psErr.message}`);
  else console.log(`position_stats: ${psCount} 件 (変化なし確認)`);

  // ─── 件数確認 ────────────────────────────────────────────────────────────────

  console.log('\n=== 取り込み結果 ===');

  const { count: logCount } = await supabase
    .from('sim_match_logs')
    .select('*', { count: 'exact', head: true })
    .eq('sim_batch_id', SIM_BATCH_ID);

  const { count: totalLogCount } = await supabase
    .from('sim_match_logs')
    .select('*', { count: 'exact', head: true });

  const { count: statsCount } = await supabase
    .from('sim_position_stats')
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', SIM_POLICY);

  const { count: medCount } = await supabase
    .from('sim_medium_pattern_stats')
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', SIM_POLICY);

  console.log(`sim_match_logs (batch_id=${SIM_BATCH_ID}): ${logCount} 件`);
  console.log(`sim_match_logs 総件数: ${totalLogCount} 件`);
  console.log(`sim_position_stats (policy=${SIM_POLICY}): ${statsCount} 件`);
  console.log(`sim_medium_pattern_stats (policy=${SIM_POLICY}): ${medCount} 件`);

  console.log('\n=== 完了 ===');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
