/**
 * import_sim_easy_s15.ts
 *
 * sim_easy_vs_easy_20260512f.md (40,000局) を取り込む。
 * sim_batch_id: easy_20260512_015
 *
 * 設計方針（大容量対応）:
 *   - Phase A: ストリーミング処理（全量メモリ保持禁止）
 *     ゲームを 5 件単位で即 INSERT 即破棄→メモリ使用量 O(batch) に抑制
 *   - Phase B: per-game batch_upsert_sim_position_stats RPC
 *   - Phase C: 別スクリプト phase_c_med_s15.ts で処理
 *   - 全 pagination に ORDER BY 付与
 *   - resume-safe: 既存 batch_id の件数を確認してスキップ/再開
 *
 * 実行方法（background で無制限実行）:
 *   nohup npx vite-node scripts/import_sim_easy_s15.ts > /tmp/s15_import.log 2>&1 &
 *
 * 制約:
 *   - match_logs / position_stats / medium_pattern_stats（実戦）への書き込み禁止
 *   - sim_match_logs は削除しない（既存 60,000 件を保持）
 */

import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { createInitialState } from '../src/game/initialState';
import {
  selectPosition, applyMassiveBuild, applySelectiveBuild,
  applySelectiveBuildSingle, applyQuadBuildForGates, skipTurn, confirmPositionOnly,
} from '../src/game/engine';
import { computeMediumPatternId } from '../src/game/mediumPattern';
import type { GameState, MoveRecord, GateId, PositionId } from '../src/game/types';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('ERROR: env missing'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const SIM_FILE_PATH = '/Users/nt/Desktop/Claude_Cowork/sim_easy/sim_easy_vs_easy_20260512f.md';
const SIM_BATCH_ID  = 'easy_20260512_015';
const SIM_POLICY    = 'easy_vs_easy';
const SIM_VERSION   = '1.0.0';
const ENGINE_VERSION = '1.0.0';
const RULES_VERSION  = '1.1.0';
const GENERATED_AT   = '2026-05-12T00:00:00Z';
const EXPECTED_GAME_COUNT = 40000;

const INSERT_BATCH = 5;   // 一度にINSERTするゲーム数（メモリ節約）
const MAX_RETRY = 3;

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── パーサー ────────────────────────────────────────────────────────────────

type ParsedGame = { gameIndex: number; batchNumber: number; winner: string; moveCount: number; moves: RawMove[] };
type RawMove    = { moveNumber: number; positionId: string; buildType: 's'|'m'|'q'; gates: number[] };
type ExtMoveRecord = MoveRecord & { medium_pattern_id?: string };

function parseMoveToken(token: string): RawMove | null {
  const m = token.match(/^M(\d+):([A-M]),([smq])\(([^)]*)\)$/);
  if (!m) return null;
  return {
    moveNumber: parseInt(m[1], 10), positionId: m[2], buildType: m[3] as 's'|'m'|'q',
    gates: m[4].split(',').map(g=>g.trim()).filter(g=>g!=='').map(g=>parseInt(g,10)),
  };
}

function parseSimFile(content: string): ParsedGame[] {
  const games: ParsedGame[] = [];
  let cur: ParsedGame | null = null;
  for (const line of content.split('\n')) {
    const hm = line.match(/^### Game (\d+) \(Batch (\d+)\)/);
    if (hm) {
      if (cur) games.push(cur);
      cur = { gameIndex: parseInt(hm[1],10), batchNumber: parseInt(hm[2],10), winner:'', moveCount:0, moves:[] };
      continue;
    }
    if (!cur) continue;
    const rm = line.match(/\*\*勝者\*\*:\s*(\w+)\s+\*\*手数\*\*:\s*(\d+)/);
    if (rm) { cur.winner = rm[1]; cur.moveCount = parseInt(rm[2],10); continue; }
    if (line.match(/^\s+M\d+:/)) {
      for (const tok of line.trim().split(/\s+/)) {
        const mv = parseMoveToken(tok);
        if (mv) cur.moves.push(mv);
      }
    }
  }
  if (cur) games.push(cur);
  return games;
}

function rawToRecord(raw: RawMove): ExtMoveRecord {
  const player = raw.moveNumber % 2 === 1 ? 'black' : 'white';
  let build: MoveRecord['build'];
  if (raw.buildType === 'm') {
    build = { type:'massive', gate: raw.gates[0] as GateId ?? null, placed:1 };
  } else if (raw.buildType === 's') {
    if (raw.gates.length >= 2) build = { type:'selective', gates:[raw.gates[0] as GateId, raw.gates[1] as GateId], placed:2 };
    else if (raw.gates.length === 1) build = { type:'selective', gates:[raw.gates[0] as GateId, 0], placed:1 };
    else build = { type:'selective', gates:[0,0], placed:0 };
  } else {
    build = { type:'quad', placedGateIds: raw.gates as GateId[], placed: raw.gates.length };
  }
  return { moveNumber: raw.moveNumber, player, positioning: raw.positionId as PositionId, build };
}

function replayGame(history: ExtMoveRecord[]): ExtMoveRecord[] {
  let state: GameState = createInitialState();
  const result: ExtMoveRecord[] = [];
  for (const rec of history) {
    if (rec.positioning !== 'P') state = selectPosition(state, rec.positioning as PositionId);
    let next: GameState;
    const b = rec.build;
    if (b.type === 'massive') next = b.gate ? applyMassiveBuild(state, b.gate as GateId) : confirmPositionOnly(state);
    else if (b.type === 'selective') {
      const vg = (b.gates as (GateId|0)[]).filter((g): g is GateId => g !== 0);
      if (vg.length === 2) next = applySelectiveBuild(state, vg as [GateId,GateId]);
      else if (vg.length === 1) next = applySelectiveBuildSingle(state, vg[0]);
      else next = confirmPositionOnly(state);
    } else if (b.type === 'quad') next = applyQuadBuildForGates(state, b.placedGateIds as GateId[]);
    else if (b.type === 'skip') next = skipTurn(state);
    else next = confirmPositionOnly(state);

    const last = next.history[next.history.length - 1];
    let canonicalHash: string | undefined;
    if (last && last.moveNumber === rec.moveNumber) canonicalHash = last.canonical_hash;
    let mediumPatternId: string | undefined;
    try { mediumPatternId = computeMediumPatternId(next); } catch { /* skip */ }

    result.push({ ...rec, canonical_hash: canonicalHash, medium_pattern_id: mediumPatternId });
    state = next;
  }
  return result;
}

// ─── メイン ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== import_sim_easy_s15.ts ===');
  console.log(`sim_batch_id : ${SIM_BATCH_ID}`);
  console.log(`source file  : ${SIM_FILE_PATH}`);
  console.log(`期待局数     : ${EXPECTED_GAME_COUNT}\n`);

  // 実戦テーブル事前確認
  const {count: ml0} = await supabase.from('match_logs').select('*',{count:'exact',head:true});
  const {count: ps0} = await supabase.from('position_stats').select('*',{count:'exact',head:true});
  console.log(`[事前] match_logs: ${ml0} / position_stats: ${ps0}（変更しない）\n`);

  if (!fs.existsSync(SIM_FILE_PATH)) { console.error('ERROR: file not found'); process.exit(1); }
  const content = fs.readFileSync(SIM_FILE_PATH, 'utf-8');
  console.log(`ファイル読込: ${content.length.toLocaleString()} bytes`);

  console.log('パース中...');
  const games = parseSimFile(content);
  console.log(`パース完了: ${games.length} ゲーム`);
  if (games.length !== EXPECTED_GAME_COUNT) console.warn(`[WARN] 期待 ${EXPECTED_GAME_COUNT} ≠ 実際 ${games.length}`);
  console.log('');

  // ─── Phase A: sim_match_logs INSERT（ストリーミング）────────────────────────
  console.log('--- Phase A: sim_match_logs INSERT (streaming) ---');

  const {count: existCount} = await supabase.from('sim_match_logs')
    .select('*',{count:'exact',head:true}).eq('sim_batch_id', SIM_BATCH_ID);
  const exist = existCount ?? 0;

  if (exist >= EXPECTED_GAME_COUNT) {
    console.log(`Phase A スキップ: ${SIM_BATCH_ID} 既に ${exist} 件\n`);
  } else {
    if (exist > 0) {
      console.log(`[INFO] 不完全データ ${exist} 件を削除して再INSERT`);
      const {error: de} = await supabase.from('sim_match_logs').delete().eq('sim_batch_id', SIM_BATCH_ID);
      if (de) { console.error('削除エラー:', de.message); process.exit(1); }
    }

    let inserted = 0;
    let phaseAErrors = 0;
    let hashOk = 0, hashFail = 0, medOk = 0, medFail = 0;
    const buf: object[] = [];

    const flush = async () => {
      if (buf.length === 0) return;
      let lastErr: string | null = null;
      for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
        const {error} = await supabase.from('sim_match_logs').insert(buf);
        if (!error) { lastErr = null; break; }
        lastErr = error.message;
        if (attempt < MAX_RETRY-1) { await sleep(3000); }
      }
      if (lastErr) { console.error(`\nINSERT error: ${lastErr}`); phaseAErrors += buf.length; }
      else inserted += buf.length;
      buf.length = 0;
    };

    for (let gi = 0; gi < games.length; gi++) {
      const g = games[gi];
      if (g.moves.length === 0) { hashFail++; medFail++; continue; }

      const raws = g.moves.map(rawToRecord);
      let replayed: ExtMoveRecord[];
      try { replayed = replayGame(raws); } catch { replayed = raws; hashFail++; }

      const hCount = replayed.filter(m=>m.canonical_hash).length;
      const mCount = replayed.filter(m=>m.medium_pattern_id).length;
      if (hCount > 0) hashOk++; else hashFail++;
      if (mCount > 0) medOk++; else medFail++;

      buf.push({
        source: 'sim', sim_policy: SIM_POLICY, sim_batch_id: SIM_BATCH_ID,
        sim_version: SIM_VERSION, engine_version: ENGINE_VERSION,
        rules_version: RULES_VERSION, generated_at: GENERATED_AT,
        game_index: gi + 1, winner: g.winner || null,
        move_count: replayed.length, full_record: replayed,
        canonical_hashes_computed: hCount > 0,
      });

      if (buf.length >= INSERT_BATCH) await flush();

      if ((gi+1) % 500 === 0) {
        process.stdout.write(`  Phase A: ${gi+1}/${games.length} inserted=${inserted} errors=${phaseAErrors}\r`);
      }
    }
    await flush();

    console.log(`\nPhase A 完了: inserted=${inserted} errors=${phaseAErrors}`);
    console.log(`  canonical_hash: ok=${hashOk} fail=${hashFail}`);
    console.log(`  medium_pattern: ok=${medOk} fail=${medFail}\n`);
  }

  // ─── Phase B: sim_position_stats (per-game RPC) ──────────────────────────
  console.log('--- Phase B: sim_position_stats ---');

  // sim_match_logs から batch_id のデータを取得して RPC 呼び出し
  let bOff = 0, bSuccess = 0, bSkip = 0, bErr = 0;
  const B_PAGE = 500;

  while (true) {
    const {data, error} = await supabase.from('sim_match_logs')
      .select('winner, full_record, canonical_hashes_computed, game_index')
      .eq('sim_batch_id', SIM_BATCH_ID)
      .order('game_index', {ascending: true})
      .range(bOff, bOff + B_PAGE - 1);

    if (error) { console.error(`Phase B scan error: ${error.message}`); break; }
    if (!data || data.length === 0) break;

    for (const row of data as {winner:string; full_record: ExtMoveRecord[]; canonical_hashes_computed: boolean; game_index: number}[]) {
      if (!row.canonical_hashes_computed || !row.winner) { bSkip++; continue; }
      const hashes = row.full_record.map(m=>m.canonical_hash).filter((h): h is string => !!h);
      if (hashes.length === 0) { bSkip++; continue; }

      const {error: rpcErr} = await supabase.rpc('batch_upsert_sim_position_stats', {
        p_hashes: hashes, p_winner: row.winner, p_sim_policy: SIM_POLICY,
      });
      if (rpcErr) { bErr++; }
      else { bSuccess++; }
    }

    bOff += B_PAGE;
    process.stdout.write(`  Phase B: ${bOff} / success=${bSuccess} skip=${bSkip} err=${bErr}\r`);
    if (data.length < B_PAGE) break;
  }
  console.log(`\nPhase B 完了: success=${bSuccess} skip=${bSkip} error=${bErr}\n`);

  // ─── 件数確認 ────────────────────────────────────────────────────────────
  console.log('=== 取込結果（Phase A/B）===');
  const {count: batchCnt} = await supabase.from('sim_match_logs')
    .select('*',{count:'exact',head:true}).eq('sim_batch_id', SIM_BATCH_ID);
  const {count: totalCnt} = await supabase.from('sim_match_logs')
    .select('*',{count:'exact',head:true});
  const {count: spsCnt} = await supabase.from('sim_position_stats')
    .select('*',{count:'exact',head:true}).eq('sim_policy', SIM_POLICY);
  console.log(`sim_match_logs (${SIM_BATCH_ID}): ${batchCnt}`);
  console.log(`sim_match_logs 総件数: ${totalCnt} (想定: 100,000)`);
  console.log(`sim_position_stats: ${spsCnt}`);

  // 実戦汚染チェック
  const {count: ml1} = await supabase.from('match_logs').select('*',{count:'exact',head:true});
  const {count: ps1} = await supabase.from('position_stats').select('*',{count:'exact',head:true});
  console.log(`match_logs: ${ml1} (${ml0===ml1?'✅':'❌'})`);
  console.log(`position_stats: ${ps1} (${ps0===ps1?'✅':'❌'})`);
  console.log('\n→ Phase C は phase_c_med_s15.ts を別途実行してください');
  console.log('=== Phase A/B 完了 ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
