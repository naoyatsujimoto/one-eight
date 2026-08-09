/**
 * import_fvhard_009.ts
 *
 * Fast-Very-Hard vs Fast-Very-Hard Run 9 — 10,000局 を sim_match_logs に取り込む。
 * sim_batch_id: fvhard_20260806_009
 * sim_policy  : fastveryhard_vs_fastveryhard
 *
 * 実行方法:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   nohup node_modules/.bin/vite-node /tmp/import_fvhard_009.ts > /tmp/import_fvhard_009.log 2>&1 &
 *   tail -f /tmp/import_fvhard_009.log
 *
 * 制約:
 *   - Phase 0 検査完了後に実行する
 *   - 再生失敗は no-build 置換せず、即時停止する
 *   - match_logs / position_stats / medium_pattern_stats（実戦）への書き込み禁止
 *   - fast_hard_vs_fast_hard / easy_vs_easy データとは絶対に混ぜない
 */

import * as fs from 'fs';

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

const SIM_FILE_PATH       = '/Users/nt/Desktop/Claude_Cowork/sim_easy/sim_fastveryhard_vs_fastveryhard_20260806.md';
const SIM_BATCH_ID        = 'fvhard_20260806_009';
const SIM_POLICY          = 'fastveryhard_vs_fastveryhard';
const SIM_VERSION         = '1.0.0';
const ENGINE_VERSION      = '1.0.0';
const RULES_VERSION       = '1.1.0';
const GENERATED_AT        = '2026-08-06T00:00:00Z';
const EXPECTED_GAME_COUNT = 10000;

const INSERT_BATCH = 5;
const MAX_RETRY    = 3;

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

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
};

type ExtMoveRecord = MoveRecord & { medium_pattern_id?: string };

function parseMoveToken(token: string): RawMove | null {
  const t = token.trim();
  if (!t || t.startsWith('...')) return null;
  if (t === 'P,pass') return { positionId: 'P', buildType: 'pass', gates: [] };
  const m = t.match(/^([A-MP]),([smq])\(([^)]*)\)$/);
  if (!m) return null;
  const gateStr = m[3].trim();
  const gates = gateStr === '' ? [] : gateStr.split(',').map(g => parseInt(g.trim(), 10));
  return { positionId: m[1], buildType: m[2] as 's' | 'm' | 'q', gates };
}

function parseWinner(col: string): string {
  const c = col.trim();
  if (c === '黒') return 'black';
  if (c === '白') return 'white';
  if (c === '引き分け') return 'draw';
  return c.toLowerCase();
}

function parseSimFile(content: string): ParsedGame[] {
  const games: ParsedGame[] = [];
  let inTable = false;

  for (const line of content.split('\n')) {
    if (line.trim() === '## 全棋譜') { inTable = true; continue; }
    if (!inTable) continue;
    if (!line.startsWith('| ')) continue;
    const cols = line.split('|').map(c => c.trim()).filter((_, i) => i > 0);
    if (cols.length < 6) continue;
    const indexStr = cols[0];
    if (!indexStr || !/^\d+$/.test(indexStr)) continue;

    const winner = parseWinner(cols[1]);
    const moveCount = parseInt(cols[2], 10) || 0;
    const kifu = cols[5] ?? '';
    const moves: RawMove[] = [];
    for (const tok of kifu.split(' ')) {
      const mv = parseMoveToken(tok);
      if (mv) moves.push(mv);
    }
    if (moves.length === 0) continue;
    games.push({ gameIndex: parseInt(indexStr, 10), winner, moveCount, moves });
  }

  return games;
}

/**
 * 厳格な再生 — 失敗時は例外をスロー（no-build置換しない）
 */
function replayGameStrict(g: ParsedGame): ExtMoveRecord[] {
  let state: GameState = createInitialState();
  const result: ExtMoveRecord[] = [];
  let moveNum = 0;

  for (const raw of g.moves) {
    moveNum++;

    if (raw.buildType === 'pass') {
      state = skipTurn(state);  // 失敗時は例外
      const last = state.history[state.history.length - 1];
      let medPid: string | undefined;
      try { medPid = computeMediumPatternId(state); } catch { /* ok */ }
      result.push({
        moveNumber: moveNum, player: moveNum % 2 === 1 ? 'black' : 'white',
        positioning: 'P',
        build: { type: 'skip' },
        canonical_hash: last?.canonical_hash,
        medium_pattern_id: medPid,
      });
      continue;
    }

    // selectPosition — 失敗時は例外
    state = selectPosition(state, raw.positionId as PositionId);

    // build — 失敗時は例外
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

    const last = state.history[state.history.length - 1];
    let medPid: string | undefined;
    try { medPid = computeMediumPatternId(state); } catch { /* ok */ }

    let build: MoveRecord['build'];
    if (raw.buildType === 'm') {
      build = { type: 'massive', gate: raw.gates[0] as GateId ?? null, placed: 1 };
    } else if (raw.buildType === 's') {
      if (raw.gates.length >= 2) {
        build = { type: 'selective', gates: [raw.gates[0] as GateId, raw.gates[1] as GateId], placed: 2 };
      } else if (raw.gates.length === 1) {
        build = { type: 'selective', gates: [raw.gates[0] as GateId, 0], placed: 1 };
      } else {
        build = { type: 'selective', gates: [0, 0], placed: 0 };
      }
    } else {
      build = { type: 'quad', placedGateIds: raw.gates as GateId[], placed: raw.gates.length };
    }

    result.push({
      moveNumber: moveNum, player: moveNum % 2 === 1 ? 'black' : 'white',
      positioning: raw.positionId as PositionId,
      build,
      canonical_hash: last?.canonical_hash,
      medium_pattern_id: medPid,
    });
  }

  return result;
}

async function main() {
  log('=== import_fvhard_009.ts 開始 (Run 9) ===');
  log(`sim_batch_id : ${SIM_BATCH_ID}`);
  log(`sim_policy   : ${SIM_POLICY}`);
  log(`source file  : ${SIM_FILE_PATH}`);
  log(`期待局数     : ${EXPECTED_GAME_COUNT}`);
  log('Phase B      : 廃止（sim_position_stats テーブル削除済み）\n');

  // ── 実戦テーブル事前確認 ──
  const {count: ml0} = await supabase.from('match_logs').select('*',{count:'exact',head:true});
  const {count: ps0} = await supabase.from('position_stats').select('*',{count:'exact',head:true});
  const {count: mps0} = await supabase.from('medium_pattern_stats').select('*',{count:'exact',head:true});
  const {count: sgs0} = await supabase.from('symmetry_group_stats').select('*',{count:'exact',head:true});
  const {count: psl0} = await supabase.from('position_stats_ledger').select('*',{count:'exact',head:true});
  log(`[事前] match_logs=${ml0} / position_stats=${ps0} / medium_pattern_stats=${mps0}`);
  log(`[事前] symmetry_group_stats=${sgs0} / position_stats_ledger=${psl0}（すべて変更しない）\n`);

  // ── 汚染防止事前確認 ──
  const {count: fhBefore} = await supabase.from('sim_match_logs')
    .select('*',{count:'exact',head:true}).eq('sim_policy','fast_hard_vs_fast_hard');
  const {count: easyBefore} = await supabase.from('sim_match_logs')
    .select('*',{count:'exact',head:true}).eq('sim_policy','easy_vs_easy');
  const {count: fvhBefore} = await supabase.from('sim_match_logs')
    .select('*',{count:'exact',head:true}).eq('sim_policy','fastveryhard_vs_fastveryhard');
  log(`[事前] sim_match_logs(fast_hard): ${fhBefore}（変更しない）`);
  log(`[事前] sim_match_logs(easy_vs_easy): ${easyBefore}（変更しない）`);
  log(`[事前] sim_match_logs(fastveryhard): ${fvhBefore}\n`);

  // ── 事前条件チェック ──
  const {count: existBatch} = await supabase.from('sim_match_logs')
    .select('*',{count:'exact',head:true}).eq('sim_batch_id', SIM_BATCH_ID);
  if ((existBatch ?? 0) > 0) {
    log(`[ERROR] ${SIM_BATCH_ID} が既に ${existBatch} 件存在します。二重実行を防止するため中止します。`);
    log('         削除して再実行する場合は手動で確認してください。');
    process.exit(1);
  }
  log(`✅ 事前条件: ${SIM_BATCH_ID} = 0件\n`);

  // 他 policy に同 batch_id が存在しないことも確認
  const {data: otherPolicy} = await supabase.from('sim_match_logs')
    .select('sim_policy').eq('sim_batch_id', SIM_BATCH_ID).neq('sim_policy', SIM_POLICY).limit(1);
  if (otherPolicy && otherPolicy.length > 0) {
    log(`[ERROR] ${SIM_BATCH_ID} が他 policy (${otherPolicy[0].sim_policy}) に存在します。中止。`);
    process.exit(1);
  }
  log(`✅ 他 policy への同 batch_id 汚染なし\n`);

  // ── ファイル読み込み ──
  if (!fs.existsSync(SIM_FILE_PATH)) { log('ERROR: file not found'); process.exit(1); }
  const content = fs.readFileSync(SIM_FILE_PATH, 'utf-8');
  log(`ファイル読込: ${content.length.toLocaleString()} bytes`);

  log('パース中...');
  const games = parseSimFile(content);
  log(`パース完了: ${games.length} ゲーム`);
  if (games.length !== EXPECTED_GAME_COUNT) {
    log(`[ERROR] 期待 ${EXPECTED_GAME_COUNT} ≠ 実際 ${games.length} — 取り込み中止`);
    process.exit(1);
  }
  log('');

  // ── Phase A: sim_match_logs UPSERT ──
  log('--- Phase A: sim_match_logs UPSERT ---');
  log('  再生失敗は no-build 置換せず即時停止します\n');

  let inserted = 0;
  let phaseAErrors = 0;
  let hashOk = 0, hashFail = 0, medOk = 0, medFail = 0;
  let replayFails = 0;
  const buf: object[] = [];

  const flush = async () => {
    if (buf.length === 0) return;
    let lastErr: string | null = null;
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
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

    let replayed: ExtMoveRecord[];
    try {
      replayed = replayGameStrict(g);
    } catch (e) {
      replayFails++;
      log(`\n[FATAL] game=${g.gameIndex} 再生失敗: ${e}`);
      log('DB書き込みを中止します（再生失敗は no-build 置換しません）');
      // 既に insert したものは残るが、batch全体は未完成なので安全
      process.exit(1);
    }

    const hCount = replayed.filter(m => m.canonical_hash).length;
    const mCount = replayed.filter(m => m.medium_pattern_id).length;
    if (hCount > 0) hashOk++; else hashFail++;
    if (mCount > 0) medOk++; else medFail++;

    buf.push({
      source: 'sim', sim_policy: SIM_POLICY, sim_batch_id: SIM_BATCH_ID,
      sim_version: SIM_VERSION, engine_version: ENGINE_VERSION,
      rules_version: RULES_VERSION, generated_at: GENERATED_AT,
      game_index: g.gameIndex, winner: g.winner || null,
      move_count: replayed.length,
      full_record: replayed,
      canonical_hashes_computed: hCount > 0,
    });

    if (buf.length >= INSERT_BATCH) await flush();

    if ((gi + 1) % 500 === 0) {
      process.stdout.write(`  Phase A: ${gi + 1}/${games.length} inserted=${inserted} errors=${phaseAErrors}\r`);
    }
  }
  await flush();

  log(`\nPhase A 完了: inserted=${inserted} errors=${phaseAErrors}`);
  log(`  canonical_hash: ok=${hashOk} fail=${hashFail}`);
  log(`  medium_pattern: ok=${medOk} fail=${medFail}\n`);

  if (phaseAErrors > 0) {
    log(`[ERROR] Phase A エラー ${phaseAErrors} 件 — 確認が必要`);
    process.exit(1);
  }

  // ── Phase B: 廃止 ──
  log('--- Phase B: 廃止（sim_position_stats テーブル削除済み）---\n');

  // ── 取込結果確認 ──
  log('=== Phase A 取込結果 ===');
  const {count: batchCnt} = await supabase.from('sim_match_logs')
    .select('*',{count:'exact',head:true}).eq('sim_batch_id', SIM_BATCH_ID);
  const {count: fvhAfter} = await supabase.from('sim_match_logs')
    .select('*',{count:'exact',head:true}).eq('sim_policy', SIM_POLICY);
  const {count: totalCnt} = await supabase.from('sim_match_logs')
    .select('*',{count:'exact',head:true});
  log(`sim_match_logs (${SIM_BATCH_ID}): ${batchCnt}`);
  log(`sim_match_logs (fastveryhard): ${fvhAfter}`);
  log(`sim_match_logs 総件数: ${totalCnt}`);

  // winner 内訳確認
  const {data: winnerData} = await supabase.from('sim_match_logs')
    .select('winner')
    .eq('sim_batch_id', SIM_BATCH_ID);
  if (winnerData) {
    const bw = winnerData.filter(r => r.winner === 'black').length;
    const ww = winnerData.filter(r => r.winner === 'white').length;
    const dw = winnerData.filter(r => r.winner === 'draw').length;
    log(`winner内訳: black=${bw} white=${ww} draw=${dw}`);
  }

  // full_record 品質確認
  const {count: nullFR} = await supabase.from('sim_match_logs')
    .select('*',{count:'exact',head:true}).eq('sim_batch_id', SIM_BATCH_ID).is('full_record', null);
  const {count: notHash} = await supabase.from('sim_match_logs')
    .select('*',{count:'exact',head:true}).eq('sim_batch_id', SIM_BATCH_ID).neq('canonical_hashes_computed', true);
  log(`full_record NULL: ${nullFR}`);
  log(`canonical_hashes_computed IS NOT TRUE: ${notHash}`);

  // game_index MIN/MAX
  const {data: minMaxData} = await supabase.from('sim_match_logs')
    .select('game_index')
    .eq('sim_batch_id', SIM_BATCH_ID)
    .order('game_index', {ascending: true})
    .limit(1);
  const {data: maxData} = await supabase.from('sim_match_logs')
    .select('game_index')
    .eq('sim_batch_id', SIM_BATCH_ID)
    .order('game_index', {ascending: false})
    .limit(1);
  log(`game_index MIN: ${(minMaxData as {game_index:number}[]|null)?.[0]?.game_index}`);
  log(`game_index MAX: ${(maxData as {game_index:number}[]|null)?.[0]?.game_index}`);

  // 汚染チェック
  const {count: fhAfter} = await supabase.from('sim_match_logs')
    .select('*',{count:'exact',head:true}).eq('sim_policy','fast_hard_vs_fast_hard');
  const {count: easyAfter} = await supabase.from('sim_match_logs')
    .select('*',{count:'exact',head:true}).eq('sim_policy','easy_vs_easy');
  log(`\nsim_match_logs(fast_hard): ${fhAfter} (${fhBefore===fhAfter?'✅ 変化なし':'❌ 汚染'})`);
  log(`sim_match_logs(easy_vs_easy): ${easyAfter} (${easyBefore===easyAfter?'✅ 変化なし':'❌ 汚染'})`);

  // 実戦テーブル不変確認
  const {count: ml1} = await supabase.from('match_logs').select('*',{count:'exact',head:true});
  const {count: ps1} = await supabase.from('position_stats').select('*',{count:'exact',head:true});
  const {count: mps1} = await supabase.from('medium_pattern_stats').select('*',{count:'exact',head:true});
  const {count: sgs1} = await supabase.from('symmetry_group_stats').select('*',{count:'exact',head:true});
  const {count: psl1} = await supabase.from('position_stats_ledger').select('*',{count:'exact',head:true});
  log(`match_logs: ${ml1} (${ml0===ml1?'✅ 変化なし':'❌ 汚染'})`);
  log(`position_stats: ${ps1} (${ps0===ps1?'✅ 変化なし':'❌ 汚染'})`);
  log(`medium_pattern_stats: ${mps1} (${mps0===mps1?'✅ 変化なし':'❌ 汚染'})`);
  log(`symmetry_group_stats: ${sgs1} (${sgs0===sgs1?'✅ 変化なし':'❌ 汚染'})`);
  log(`position_stats_ledger: ${psl1} (${psl0===psl1?'✅ 変化なし':'❌ 汚染'})`);

  if (batchCnt !== EXPECTED_GAME_COUNT) {
    log(`\n[ERROR] 取込件数不一致: ${batchCnt} ≠ ${EXPECTED_GAME_COUNT}`);
    process.exit(1);
  }

  log('\n→ 次: vite-node /tmp/phase_c_fvhard_009.ts を実行');
  log('=== Phase A 完了 ===');
}

main().catch(e => { log(`FATAL: ${e}`); process.exit(1); });
