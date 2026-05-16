/**
 * import_fashard_fh02.ts
 *
 * Fast Hard vs Fast Hard 10,000局 を sim_match_logs に取り込む。
 * sim_batch_id: fahard_20260515_002
 * sim_policy  : fast_hard_vs_fast_hard
 *
 * ─────────────────────────────────────────────────
 * 棋譜フォーマット（新形式）:
 *   "A,s(1,8) | C,q(3,4,5,10) | P,pass | ..."
 *   区切り: " | "
 *   passターン: "P,pass"
 *
 * 設計方針:
 *   - Phase A: sim_match_logs に UPSERT（conflict on sim_batch_id, game_index）
 *     ストリーミング処理（全量メモリ保持禁止）
 *   - Phase B: 廃止（sim_position_stats テーブル削除済み）
 *   - Phase C: 別スクリプト phase_c_fashard_fh02.ts で実施
 *   - Phase D: 別スクリプト phase_d_posonly_fashard_fh02.ts で実施
 *
 * 実行方法:
 *   nohup npx vite-node scripts/import_fashard_fh02.ts > /tmp/fh01_import.log 2>&1 &
 *   tail -f /tmp/fh01_import.log
 *
 * 制約:
 *   - match_logs / position_stats / medium_pattern_stats（実戦）への書き込み禁止
 *   - sim_position_stats への書き込み禁止（テーブル削除済み）
 *   - easy_vs_easy データとは絶対に混ぜない
 */

import * as fs from 'fs';

// .env 手動ロード
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
} catch { /* .env なければ process.env をそのまま使う */ }

import { createClient } from '@supabase/supabase-js';
import { createInitialState } from '../src/game/initialState';
import {
  selectPosition, applyMassiveBuild, applySelectiveBuild,
  applySelectiveBuildSingle, applyQuadBuildForGates, skipTurn, confirmPositionOnly,
} from '../src/game/engine';
import { computeMediumPatternId } from '../src/game/mediumPattern';
import type { GameState, MoveRecord, GateId, PositionId } from '../src/game/types';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('ERROR: env missing'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const SIM_FILE_PATH       = '/Users/nt/Desktop/Claude_Cowork/sim_easy/sim_fashard_vs_fashard_20260515b.md';
const SIM_BATCH_ID        = 'fahard_20260515_002';
const SIM_POLICY          = 'fast_hard_vs_fast_hard';
const SIM_VERSION         = '1.0.0';
const ENGINE_VERSION      = '1.0.0';
const RULES_VERSION       = '1.1.0';
const GENERATED_AT        = '2026-05-15T00:00:00Z';
const EXPECTED_GAME_COUNT = 10000;

const INSERT_BATCH = 5;   // 一度にINSERTするゲーム数（メモリ節約）
const MAX_RETRY    = 3;

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── 型定義 ──────────────────────────────────────────────────────────────────

type RawMove = {
  positionId: string;
  buildType: 's' | 'm' | 'q' | 'pass';
  gates: number[];
};

type ParsedGame = {
  gameIndex: number;
  batchNumber: number;
  winner: string;
  moveCount: number;
  moves: RawMove[];
};

type ExtMoveRecord = MoveRecord & { medium_pattern_id?: string };

// ─── パーサー（新形式: "A,s(1,8) | C,q(3,4,5,10) | P,pass | ..." ）──────────

function parseMoveToken(token: string): RawMove | null {
  const t = token.trim();
  if (t === 'P,pass') return { positionId: 'P', buildType: 'pass', gates: [] };
  const m = t.match(/^([A-MP]),([smq])\(([^)]*)\)$/);
  if (!m) return null;
  const gateStr = m[3].trim();
  const gates = gateStr === '' ? [] : gateStr.split(',').map(g => parseInt(g.trim(), 10));
  return { positionId: m[1], buildType: m[2] as 's' | 'm' | 'q', gates };
}

function parseSimFile(content: string): ParsedGame[] {
  const games: ParsedGame[] = [];
  let cur: ParsedGame | null = null;

  for (const line of content.split('\n')) {
    const hm = line.match(/^### Game (\d+) \(batch_(\d+)\)/);
    if (hm) {
      if (cur) games.push(cur);
      cur = { gameIndex: parseInt(hm[1],10), batchNumber: parseInt(hm[2],10), winner:'', moveCount:0, moves:[] };
      continue;
    }
    if (!cur) continue;
    const rm = line.match(/^-\s+勝者:\s*(\w+)\s+陣地:.+手数:\s*(\d+)/);
    if (rm) { cur.winner = rm[1]; cur.moveCount = parseInt(rm[2],10); continue; }
    const km = line.match(/^-\s+棋譜:\s+(.+)$/);
    if (km) {
      for (const tok of km[1].split('|')) {
        const mv = parseMoveToken(tok);
        if (mv) cur.moves.push(mv);
      }
    }
  }
  if (cur) games.push(cur);
  return games;
}

// ─── リプレイ（canonical_hash + medium_pattern_id を付与）────────────────────

function replayGame(g: ParsedGame): ExtMoveRecord[] {
  let state: GameState = createInitialState();
  const result: ExtMoveRecord[] = [];
  let moveNum = 0;

  for (const raw of g.moves) {
    moveNum++;
    const player = moveNum % 2 === 1 ? 'black' : 'white';

    if (raw.buildType === 'pass') {
      try { state = skipTurn(state); } catch { /* skip */ }
      const last = state.history[state.history.length - 1];
      let medPid: string | undefined;
      try { medPid = computeMediumPatternId(state); } catch { /* skip */ }
      result.push({
        moveNumber: moveNum, player, positioning: 'P',
        build: { type: 'skip' },
        canonical_hash: last?.canonical_hash,
        medium_pattern_id: medPid,
      });
      continue;
    }

    try {
      state = selectPosition(state, raw.positionId as PositionId);

      if (raw.buildType === 'm') {
        state = raw.gates.length > 0
          ? applyMassiveBuild(state, raw.gates[0] as GateId)
          : confirmPositionOnly(state);
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
    } catch {
      // エンジンエラー: スキップして続行
      result.push({
        moveNumber: moveNum, player, positioning: raw.positionId as PositionId,
        build: { type: 'no-build' },
      });
      continue;
    }

    const last = state.history[state.history.length - 1];
    let medPid: string | undefined;
    try { medPid = computeMediumPatternId(state); } catch { /* skip */ }

    let build: MoveRecord['build'];
    if (raw.buildType === 'm') {
      build = { type: 'massive', gate: raw.gates[0] as GateId ?? null, placed: 1 };
    } else if (raw.buildType === 's') {
      if (raw.gates.length >= 2) build = { type: 'selective', gates: [raw.gates[0] as GateId, raw.gates[1] as GateId], placed: 2 };
      else if (raw.gates.length === 1) build = { type: 'selective', gates: [raw.gates[0] as GateId, 0], placed: 1 };
      else build = { type: 'selective', gates: [0, 0], placed: 0 };
    } else {
      build = { type: 'quad', placedGateIds: raw.gates as GateId[], placed: raw.gates.length };
    }

    result.push({
      moveNumber: moveNum, player,
      positioning: raw.positionId as PositionId,
      build,
      canonical_hash: last?.canonical_hash,
      medium_pattern_id: medPid,
    });
  }

  return result;
}

// ─── メイン ──────────────────────────────────────────────────────────────────

async function main() {
  log('=== import_fashard_fh02.ts 開始 ===');
  log(`sim_batch_id : ${SIM_BATCH_ID}`);
  log(`sim_policy   : ${SIM_POLICY}`);
  log(`source file  : ${SIM_FILE_PATH}`);
  log(`期待局数     : ${EXPECTED_GAME_COUNT}`);
  log('Phase B      : 廃止（sim_position_stats テーブル削除済み）\n');

  // ─── 実戦テーブル事前確認 ────────────────────────────────────────────────
  const {count: ml0} = await supabase.from('match_logs').select('*',{count:'exact',head:true});
  const {count: ps0} = await supabase.from('position_stats').select('*',{count:'exact',head:true});
  const {count: mps0} = await supabase.from('medium_pattern_stats').select('*',{count:'exact',head:true});
  log(`[事前] match_logs=${ml0} / position_stats=${ps0} / medium_pattern_stats=${mps0}（変更しない）\n`);

  // ─── easy_vs_easy 汚染防止事前確認 ──────────────────────────────────────
  const {count: easyBefore} = await supabase.from('sim_match_logs')
    .select('*',{count:'exact',head:true}).eq('sim_policy','easy_vs_easy');
  log(`[事前] sim_match_logs(easy_vs_easy): ${easyBefore}（変更しない）\n`);

  if (!fs.existsSync(SIM_FILE_PATH)) { log('ERROR: file not found'); process.exit(1); }
  const content = fs.readFileSync(SIM_FILE_PATH, 'utf-8');
  log(`ファイル読込: ${content.length.toLocaleString()} bytes`);

  log('パース中...');
  const games = parseSimFile(content);
  log(`パース完了: ${games.length} ゲーム`);
  if (games.length !== EXPECTED_GAME_COUNT) log(`[WARN] 期待 ${EXPECTED_GAME_COUNT} ≠ 実際 ${games.length}`);
  log('');

  // ─── Phase A: sim_match_logs UPSERT（ストリーミング）─────────────────────
  log('--- Phase A: sim_match_logs UPSERT (streaming) ---');

  const {count: existCount} = await supabase.from('sim_match_logs')
    .select('*',{count:'exact',head:true}).eq('sim_batch_id', SIM_BATCH_ID);
  const exist = existCount ?? 0;

  if (exist >= EXPECTED_GAME_COUNT) {
    log(`Phase A スキップ: ${SIM_BATCH_ID} 既に ${exist} 件\n`);
  } else {
    if (exist > 0) {
      log(`[INFO] 不完全データ ${exist} 件を削除して再INSERT`);
      const {error: de} = await supabase.from('sim_match_logs').delete().eq('sim_batch_id', SIM_BATCH_ID);
      if (de) { log(`削除エラー: ${de.message}`); process.exit(1); }
    }

    let inserted = 0;
    let phaseAErrors = 0;
    let hashOk = 0, hashFail = 0, medOk = 0, medFail = 0;
    const buf: object[] = [];

    const flush = async () => {
      if (buf.length === 0) return;
      let lastErr: string | null = null;
      for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
        // UPSERT: conflict on (sim_batch_id, game_index)
        const {error} = await supabase.from('sim_match_logs')
          .upsert(buf as any[], {onConflict: 'sim_batch_id,game_index'});
        if (!error) { lastErr = null; break; }
        lastErr = error.message;
        if (attempt < MAX_RETRY - 1) { await sleep(3000); }
      }
      if (lastErr) { log(`\nINSERT error: ${lastErr}`); phaseAErrors += buf.length; }
      else inserted += buf.length;
      buf.length = 0;
    };

    for (let gi = 0; gi < games.length; gi++) {
      const g = games[gi];
      if (g.moves.length === 0) { hashFail++; medFail++; continue; }

      let replayed: ExtMoveRecord[];
      try { replayed = replayGame(g); } catch { replayed = []; hashFail++; medFail++; continue; }

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

    log(`\nPhase A 完了: inserted=${inserted} errors=${phaseAErrors}`);
    log(`  canonical_hash: ok=${hashOk} fail=${hashFail}`);
    log(`  medium_pattern: ok=${medOk} fail=${medFail}\n`);
  }

  // ─── Phase B: 廃止 ───────────────────────────────────────────────────────
  log('--- Phase B: 廃止（sim_position_stats テーブル削除済み）---\n');

  // ─── 件数確認 ────────────────────────────────────────────────────────────
  log('=== Phase A 取込結果 ===');
  const {count: batchCnt} = await supabase.from('sim_match_logs')
    .select('*',{count:'exact',head:true}).eq('sim_batch_id', SIM_BATCH_ID);
  const {count: totalCnt} = await supabase.from('sim_match_logs')
    .select('*',{count:'exact',head:true});
  const {count: fhCnt} = await supabase.from('sim_match_logs')
    .select('*',{count:'exact',head:true}).eq('sim_policy', SIM_POLICY);
  log(`sim_match_logs (${SIM_BATCH_ID}): ${batchCnt}`);
  log(`sim_match_logs 総件数: ${totalCnt}`);
  log(`sim_match_logs (fast_hard_vs_fast_hard): ${fhCnt}`);

  // easy_vs_easy 汚染チェック
  const {count: easyAfter} = await supabase.from('sim_match_logs')
    .select('*',{count:'exact',head:true}).eq('sim_policy','easy_vs_easy');
  log(`sim_match_logs (easy_vs_easy): ${easyAfter} (${easyBefore===easyAfter?'✅ 変化なし':'❌ 汚染'})`);

  // 実戦汚染チェック
  const {count: ml1} = await supabase.from('match_logs').select('*',{count:'exact',head:true});
  const {count: ps1} = await supabase.from('position_stats').select('*',{count:'exact',head:true});
  const {count: mps1} = await supabase.from('medium_pattern_stats').select('*',{count:'exact',head:true});
  log(`match_logs: ${ml1} (${ml0===ml1?'✅ 変化なし':'❌ 汚染'})`);
  log(`position_stats: ${ps1} (${ps0===ps1?'✅ 変化なし':'❌ 汚染'})`);
  log(`medium_pattern_stats: ${mps1} (${mps0===mps1?'✅ 変化なし':'❌ 汚染'})`);

  log('\n→ 次: phase_c_fashard_fh02.ts を実行して sim_medium_pattern_stats を更新');
  log('→ 次: phase_d_posonly_fashard_fh02.ts を実行して sim_position_only_stats を更新');
  log('=== Phase A 完了 ===');
}

main().catch(e => { log(`FATAL: ${e}`); process.exit(1); });
