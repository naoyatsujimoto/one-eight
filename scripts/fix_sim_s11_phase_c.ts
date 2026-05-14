/**
 * fix_sim_s11_phase_c.ts
 *
 * import_sim_easy_s11.ts の Phase C のみを再実行する。
 * 既存データをメモリに全件ロードせず、upsert の冪等性を利用して
 * 直接 merged upsert を行う。
 *
 * 既存データのマージは DB 側の upsert (total + new_total) で行う。
 * ただし total カラムの加算は upsert の onConflict 更新式では難しいため、
 * 各パターンについて SELECT → マージ → upsert を小バッチで行う。
 *
 * 対象: sim_batch_id = 'easy_20260512_011'
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

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: env未設定');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const SIM_FILE_PATH = '/Users/nt/Desktop/Claude_Cowork/sim_easy/sim_easy_vs_easy_20260512b.md';
const SIM_BATCH_ID = 'easy_20260512_011';
const SIM_POLICY = 'easy_vs_easy';

type ExtendedMoveRecord = MoveRecord & {
  medium_pattern_id?: string;
};

type RawMove = {
  moveNumber: number;
  positionId: string;
  buildType: 's' | 'm' | 'q';
  gates: number[];
};

type ParsedGame = {
  gameIndex: number;
  batchNumber: number;
  winner: string;
  moveCount: number;
  moves: RawMove[];
};

function parseMoveToken(token: string): RawMove | null {
  const match = token.match(/^M(\d+):([A-M]),([smq])\(([^)]*)\)$/);
  if (!match) return null;
  const moveNumber = parseInt(match[1], 10);
  const positionId = match[2];
  const buildType = match[3] as 's' | 'm' | 'q';
  const gatesStr = match[4];
  const gates = gatesStr.split(',').map(g => g.trim()).filter(g => g !== '').map(g => parseInt(g, 10));
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
      currentGame = { gameIndex: parseInt(gameHeaderMatch[1], 10), batchNumber: parseInt(gameHeaderMatch[2], 10), winner: '', moveCount: 0, moves: [] };
      continue;
    }
    if (!currentGame) continue;
    const resultMatch = line.match(/\*\*勝者\*\*:\s*(\w+)\s+\*\*手数\*\*:\s*(\d+)/);
    if (resultMatch) { currentGame.winner = resultMatch[1]; currentGame.moveCount = parseInt(resultMatch[2], 10); continue; }
    if (line.match(/^\s+M\d+:/)) {
      const tokens = line.trim().split(/\s+/);
      for (const token of tokens) { const move = parseMoveToken(token); if (move) currentGame.moves.push(move); }
    }
  }
  if (currentGame) games.push(currentGame);
  return games;
}

function rawMoveToMoveRecord(raw: RawMove): ExtendedMoveRecord {
  const player = raw.moveNumber % 2 === 1 ? 'black' : 'white';
  let build: MoveRecord['build'];
  switch (raw.buildType) {
    case 'm': build = { type: 'massive', gate: raw.gates.length > 0 ? (raw.gates[0] as GateId) : null, placed: 1 }; break;
    case 's':
      if (raw.gates.length >= 2) build = { type: 'selective', gates: [raw.gates[0] as GateId, raw.gates[1] as GateId], placed: 2 };
      else if (raw.gates.length === 1) build = { type: 'selective', gates: [raw.gates[0] as GateId, 0], placed: 1 };
      else build = { type: 'selective', gates: [0, 0], placed: 0 };
      break;
    case 'q': build = { type: 'quad', placedGateIds: raw.gates as GateId[], placed: raw.gates.length }; break;
    default: build = { type: 'no-build' }; break;
  }
  return { moveNumber: raw.moveNumber, player, positioning: raw.positionId as PositionId, build };
}

function replayGame(history: ExtendedMoveRecord[]): ExtendedMoveRecord[] {
  let state: GameState = createInitialState();
  const result: ExtendedMoveRecord[] = [];
  for (const record of history) {
    const { positioning, build } = record;
    if (positioning !== 'P') state = selectPosition(state, positioning as PositionId);
    let nextState: GameState;
    switch (build.type) {
      case 'massive': nextState = build.gate !== null ? applyMassiveBuild(state, build.gate as GateId) : confirmPositionOnly(state); break;
      case 'selective': {
        const gates = build.gates as [GateId | 0, GateId | 0];
        const validGates = gates.filter((g): g is GateId => g !== 0);
        if (validGates.length === 2) nextState = applySelectiveBuild(state, validGates as [GateId, GateId]);
        else if (validGates.length === 1) nextState = applySelectiveBuildSingle(state, validGates[0]);
        else nextState = confirmPositionOnly(state);
        break;
      }
      case 'quad': nextState = applyQuadBuildForGates(state, build.placedGateIds as GateId[]); break;
      case 'skip': nextState = skipTurn(state); break;
      case 'no-build': nextState = confirmPositionOnly(state); break;
      default: nextState = state; break;
    }
    const lastRecord = nextState.history[nextState.history.length - 1];
    let canonicalHash: string | undefined;
    if (lastRecord && lastRecord.moveNumber === record.moveNumber) canonicalHash = lastRecord.canonical_hash;
    let mediumPatternId: string | undefined;
    try { mediumPatternId = computeMediumPatternId(nextState); } catch { mediumPatternId = undefined; }
    result.push({ ...record, canonical_hash: canonicalHash, medium_pattern_id: mediumPatternId });
    state = nextState;
  }
  return result;
}

async function main() {
  console.log('=== fix_sim_s11_phase_c.ts ===');
  console.log(`対象: ${SIM_BATCH_ID}\n`);

  // ファイル読み込み・パース
  const content = fs.readFileSync(SIM_FILE_PATH, 'utf-8');
  console.log(`ファイル読み込み: ${content.length.toLocaleString()} bytes`);
  const games = parseSimFile(content);
  console.log(`パース完了: ${games.length} ゲーム`);

  // MoveRecord変換 + replayGame
  console.log('変換中...');
  type RowData = { winner: string | null; full_record: ExtendedMoveRecord[] };
  const allRows: RowData[] = [];
  for (let gi = 0; gi < games.length; gi++) {
    const game = games[gi];
    if (game.moves.length === 0) continue;
    const moveRecords = game.moves.map(rawMoveToMoveRecord);
    let replayedRecords: ExtendedMoveRecord[];
    try { replayedRecords = replayGame(moveRecords); } catch { replayedRecords = moveRecords; }
    allRows.push({ winner: game.winner || null, full_record: replayedRecords });
    if ((gi + 1) % 500 === 0) process.stdout.write(`  ${gi + 1}/${games.length}\r`);
  }
  console.log(`\n変換完了: ${allRows.length} 件`);

  // Step C-1: メモリ上で medium_pattern_id ごとに集計（1ゲーム内重複除去）
  console.log('\nStep C-1: メモリ集計中...');
  type MedAccum = { wins_black: number; wins_white: number; draws: number; total: number };
  const newStats = new Map<string, MedAccum>();
  let skipCount = 0;
  for (const r of allRows) {
    if (!r.winner) { skipCount++; continue; }
    const patternIds = r.full_record.map((m: ExtendedMoveRecord) => m.medium_pattern_id).filter((p): p is string => !!p);
    if (patternIds.length === 0) { skipCount++; continue; }
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
  console.log(`集計完了: ${newStats.size} パターン (スキップ: ${skipCount} ゲーム)`);

  // Step C-2: パターンリストを500件チャンクに分割し、DBから既存データを取得してマージ・upsert
  console.log('\nStep C-2/3/4: チャンク単位でDB取得→マージ→upsert...');
  const CHUNK = 500;
  const allPatternIds = [...newStats.keys()];
  let upsertedOk = 0;
  let upsertErrors = 0;
  let chunkIdx = 0;

  for (let i = 0; i < allPatternIds.length; i += CHUNK) {
    const chunkIds = allPatternIds.slice(i, i + CHUNK);
    chunkIdx++;

    // 既存データ取得
    const { data: exData, error: exErr } = await supabase
      .from('sim_medium_pattern_stats')
      .select('medium_pattern_id, wins_black, wins_white, draws, total')
      .eq('sim_policy', SIM_POLICY)
      .in('medium_pattern_id', chunkIds);

    if (exErr) {
      console.error(`\n既存取得エラー (chunk ${chunkIdx}): ${exErr.message}`);
      upsertErrors += chunkIds.length;
      continue;
    }

    type MedStat = { medium_pattern_id: string; wins_black: number; wins_white: number; draws: number; total: number };
    const existingMap = new Map<string, MedStat>();
    for (const row of (exData ?? []) as MedStat[]) {
      existingMap.set(row.medium_pattern_id, row);
    }

    // マージ
    const merged: (MedStat & { sim_policy: string })[] = [];
    for (const pid of chunkIds) {
      const newStat = newStats.get(pid)!;
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

    // upsert
    const { error: upsertErr } = await supabase
      .from('sim_medium_pattern_stats')
      .upsert(merged, { onConflict: 'medium_pattern_id,sim_policy' });

    if (upsertErr) {
      console.error(`\nUPSERT ERROR (chunk ${chunkIdx}, ids ${i}~${i + chunkIds.length}): ${upsertErr.message}`);
      upsertErrors += chunkIds.length;
    } else {
      upsertedOk += chunkIds.length;
    }

    process.stdout.write(`  chunk ${chunkIdx}: ${upsertedOk + upsertErrors}/${allPatternIds.length} 件\r`);
  }

  console.log(`\nPhase C 完了: success=${upsertedOk} error=${upsertErrors}`);

  // 件数確認
  console.log('\n=== 件数確認 ===');
  const { count: totalLogCount } = await supabase.from('sim_match_logs').select('*', { count: 'exact', head: true });
  const { count: logCount } = await supabase.from('sim_match_logs').select('*', { count: 'exact', head: true }).eq('sim_batch_id', SIM_BATCH_ID);
  const { count: statsCount } = await supabase.from('sim_position_stats').select('*', { count: 'exact', head: true }).eq('sim_policy', SIM_POLICY);
  const { count: medCount } = await supabase.from('sim_medium_pattern_stats').select('*', { count: 'exact', head: true }).eq('sim_policy', SIM_POLICY);

  console.log(`sim_match_logs (batch_id=${SIM_BATCH_ID}): ${logCount} 件`);
  console.log(`sim_match_logs 総件数: ${totalLogCount} 件`);
  console.log(`sim_position_stats: ${statsCount} 件`);
  console.log(`sim_medium_pattern_stats: ${medCount} 件`);
  console.log('\n=== 完了 ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
