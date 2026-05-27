/**
 * audit_endgame_113969e1.ts
 *
 * 対局 113969e1 の #44〜#52 について、終局前評価の妥当性を監査する。
 *
 * 確認項目:
 *   - #47〜#51 の合法手数
 *   - Whiteが逆転できる合法手が本当に存在するか
 *   - #51後の状態で Whiteに勝ち筋・引き分け筋が残っているか
 *   - minimax評価がどう出るか
 *   - staticWP 75.63% が妥当か
 *
 * 実行方法:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   npx vite-node scripts/audit_endgame_113969e1.ts
 *
 * Note: Git管理しない
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
} catch { /* skip */ }

import { createClient } from '@supabase/supabase-js';
import { createInitialState } from '../src/game/initialState';
import {
  selectPosition, applyMassiveBuild, applySelectiveBuild,
  applySelectiveBuildSingle, applyQuadBuildForGates, skipTurn,
} from '../src/game/engine';
import { evaluateState, enumerateLegalMoves } from '../src/game/ai';
import { canCapturePosition } from '../src/game/capture';
import type { GameState, MoveRecord, GateId, PositionId } from '../src/game/types';
import { POSITION_IDS, GATE_IDS } from '../src/game/constants';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('ERROR: env missing'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const TARGET_GAME_ID = '113969e1-929f-48c2-92f1-d1cff4e2bff4';
const K_WP = 0.003;
function winProb(score: number): number { return 1 / (1 + Math.exp(-K_WP * score)); }
function log(msg: string) { console.log(msg); }

// ─── isGateFull ──────────────────────────────────────────────────────────────
function isGateFull(gate: any): boolean {
  if (!gate || !gate.slots) return false;
  return Object.values(gate.slots).every((v) => v !== null && v !== undefined && v !== '');
}

// ─── State Replay ─────────────────────────────────────────────────────────────
function applyMoveRecord(state: GameState, record: MoveRecord): GameState {
  if (record.positioning === 'P' || record.build.type === 'skip') {
    return skipTurn({ ...state, currentPlayer: record.player });
  }
  const posId = record.positioning as PositionId;
  const withPos = selectPosition({ ...state, currentPlayer: record.player }, posId);
  if (record.build.type === 'massive') {
    const gate = record.build.gate;
    if (gate === null) return withPos;
    return applyMassiveBuild(withPos, gate as GateId);
  }
  if (record.build.type === 'selective') {
    const [g1, g2] = record.build.gates;
    if (g1 !== 0 && g2 !== 0) return applySelectiveBuild(withPos, [g1 as GateId, g2 as GateId]);
    if (g1 !== 0) return applySelectiveBuildSingle(withPos, g1 as GateId);
    if (g2 !== 0) return applySelectiveBuildSingle(withPos, g2 as GateId);
    return withPos;
  }
  if (record.build.type === 'quad') {
    return applyQuadBuildForGates(withPos, record.build.placedGateIds);
  }
  return state;
}

// ─── Board Inspector ─────────────────────────────────────────────────────────
function inspectBoard(state: GameState) {
  let blackPos = 0, whitePos = 0, nonePos = 0;
  const blackPositions: string[] = [], whitePositions: string[] = [], nonePositions: string[] = [];

  for (const posId of POSITION_IDS as unknown as string[]) {
    const owner = (state.positions as any)[posId]?.owner;
    if (owner === 'black') { blackPos++; blackPositions.push(posId); }
    else if (owner === 'white') { whitePos++; whitePositions.push(posId); }
    else { nonePos++; nonePositions.push(posId); }
  }

  let filledGates = 0, totalGateSlots = 0, usedGateSlots = 0;
  const gateDetails: { id: number; blackVal: number; whiteVal: number; total: number; full: boolean }[] = [];

  for (const gId of GATE_IDS as unknown as number[]) {
    const gate = (state.gates as any)[gId];
    if (!gate) continue;
    const full = isGateFull(gate);
    if (full) filledGates++;

    // slot占有数を計算
    let bVal = 0, wVal = 0;
    const slots = gate.slots ?? {};
    for (const [, asset] of Object.entries(slots) as [string, any][]) {
      if (asset?.owner === 'black') bVal++;
      else if (asset?.owner === 'white') wVal++;
    }
    const total = bVal + wVal;
    totalGateSlots += Object.keys(slots).length;
    usedGateSlots += total;
    gateDetails.push({ id: gId, blackVal: bVal, whiteVal: wVal, total, full });
  }

  return {
    blackPos, whitePos, nonePos,
    blackPositions, whitePositions, nonePositions,
    filledGates, totalGateSlots, usedGateSlots,
    gateDetails,
    gameEnded: state.gameEnded,
    winner: state.winner ?? null,
  };
}

// ─── Minimax (depth-limited, Black視点, postmortem.ts と同じ実装) ─────────────
const INF = 1e9;

function simulateMove(state: GameState, player: 'black' | 'white', move: any): GameState {
  if (move.type === 'pass') {
    return skipTurn({ ...state, currentPlayer: player });
  }
  const stateForPlayer = state.currentPlayer === player ? state : { ...state, currentPlayer: player };
  const selected = selectPosition(stateForPlayer, move.positionId);
  switch (move.type) {
    case 'massive': return applyMassiveBuild(selected, move.gateId);
    case 'selective': return applySelectiveBuild(selected, move.gates);
    case 'quad': return applyQuadBuildForGates(selected, move.gateIds);
    default: return state;
  }
}

function minimaxAB(
  state: GameState, depth: number, alpha: number, beta: number,
  currentPlayer: 'black' | 'white', maximizingPlayer: 'black' | 'white',
): number {
  if (depth === 0 || state.gameEnded) {
    return evaluateState(state, maximizingPlayer, true);
  }
  const legal = enumerateLegalMoves(state, currentPlayer);
  const opp: 'black' | 'white' = currentPlayer === 'black' ? 'white' : 'black';
  if (legal.length === 0) {
    return minimaxAB(state, depth - 1, alpha, beta, opp, maximizingPlayer);
  }
  if (currentPlayer === maximizingPlayer) {
    let best = -INF;
    for (const move of legal) {
      const next = simulateMove(state, currentPlayer, move);
      const s = minimaxAB(next, depth - 1, alpha, beta, opp, maximizingPlayer);
      if (s > best) best = s;
      if (s > alpha) alpha = s;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = INF;
    for (const move of legal) {
      const next = simulateMove(state, currentPlayer, move);
      const s = minimaxAB(next, depth - 1, alpha, beta, opp, maximizingPlayer);
      if (s < best) best = s;
      if (s < beta) beta = s;
      if (beta <= alpha) break;
    }
    return best;
  }
}

function shortRecord(r: MoveRecord): string {
  if (r.positioning === 'P' || r.build.type === 'skip') return 'Pass';
  if (r.build.type === 'massive') return `${r.positioning} massive(${r.build.gate ?? '?'})`;
  if (r.build.type === 'selective') {
    const gates = r.build.gates.filter(g => g !== 0);
    return `${r.positioning} sel(${gates.join(',')})`;
  }
  if (r.build.type === 'quad') return `${r.positioning} quad`;
  return '?';
}

// ─── main ────────────────────────────────────────────────────────────────────
async function main() {
  log('=== 終局前評価 妥当性監査 ===');
  log(`対象対局: ${TARGET_GAME_ID}`);
  log('');

  const { data: matchData, error } = await supabase
    .from('match_logs')
    .select('winner, move_count, full_record')
    .eq('id', TARGET_GAME_ID)
    .single();

  if (error || !matchData) { log(`ERROR: ${error?.message}`); process.exit(1); }
  const fullRecord: MoveRecord[] = matchData.full_record as MoveRecord[];
  log(`winner: ${matchData.winner} / 手数: ${fullRecord.length}`);
  log('');

  // ─── State 再構築 #44〜#52 ─────────────────────────────────────────────────
  let state: GameState = createInitialState();
  const snapshots: { mn: number; player: string; move: string; state: GameState }[] = [];

  for (let i = 0; i < fullRecord.length; i++) {
    const record = fullRecord[i]!;
    const mn = record.moveNumber;
    let next: GameState;
    try { next = applyMoveRecord(state, record); }
    catch (e) { log(`[ERROR] #${mn}: ${e}`); state = state; continue; }

    if (mn >= 44) {
      snapshots.push({ mn, player: record.player, move: shortRecord(record), state: next });
    }
    state = next;
  }

  // ─── 各手の詳細ログ ───────────────────────────────────────────────────────
  log('=== #44〜#52 詳細監査 ===');
  log('');

  for (const snap of snapshots) {
    const { mn, player, move, state: s } = snap;
    const board = inspectBoard(s);
    const evalBlack = evaluateState(s, 'black', true);
    const evalWhite = evaluateState(s, 'white', true);
    const wp = winProb(evalBlack);

    // 合法手数（次の手番プレイヤー）
    const nextPlayer: 'black' | 'white' = s.currentPlayer;
    const legalMoves = s.gameEnded ? [] : enumerateLegalMoves(s, nextPlayer);

    // 奪取可能局面の確認
    let blackCaptureable = 0, whiteCaptureable = 0;
    for (const posId of board.whitePositions) {
      if (canCapturePosition(s, 'black', posId as PositionId)) blackCaptureable++;
    }
    for (const posId of board.blackPositions) {
      if (canCapturePosition(s, 'white', posId as PositionId)) whiteCaptureable++;
    }

    log(`#${String(mn).padStart(2)} [${player}] ${move}`);
    log(`  盤面: Black=${board.blackPos}pos[${board.blackPositions.join(',')}] White=${board.whitePos}pos[${board.whitePositions.join(',')}] 未所有=${board.nonePos}pos[${board.nonePositions.join(',')}]`);
    log(`  gates filled=${board.filledGates}/12 | スロット使用=${board.usedGateSlots}/${board.totalGateSlots}`);
    log(`  gameEnded=${s.gameEnded} winner=${board.winner ?? 'null'} | 次の手番=${nextPlayer}`);
    log(`  eval(Black)=${evalBlack.toFixed(1)} eval(White)=${evalWhite.toFixed(1)}`);
    log(`  staticWP(Black)=${(wp * 100).toFixed(2)}%`);
    log(`  合法手数(${nextPlayer}): ${legalMoves.length}`);
    log(`  Black→Whitepos奪取可能: ${blackCaptureable}件 | White→Blackpos奪取可能: ${whiteCaptureable}件`);

    // Gate残容量サマリー（未満杯 = まだBuild可能）
    const nonFullGates = board.gateDetails.filter(g => !g.full);
    if (nonFullGates.length > 0) {
      const gSummary = nonFullGates.map(g =>
        `Gate${g.id}(B${g.blackVal}/W${g.whiteVal})`
      ).join(' ');
      log(`  未満杯Gate(${nonFullGates.length}): ${gSummary}`);
    } else {
      log(`  未満杯Gate: なし（全Gate満杯 → 終局済み）`);
    }

    log('');
  }

  // ─── #51後の詳細分析 ──────────────────────────────────────────────────────
  const snap51 = snapshots.find(s => s.mn === 51);
  if (!snap51) { log('ERROR: #51 snapshot なし'); process.exit(1); }

  const state51 = snap51.state;
  const board51 = inspectBoard(state51);

  log('=== #51後 詳細分析 ===');
  log(`盤面: Black=${board51.blackPos}pos White=${board51.whitePos}pos 未所有=${board51.nonePos}pos`);
  log(`次の手番: ${state51.currentPlayer} (= White手)`);
  log('');

  // White の全合法手を列挙
  const whiteLegal = enumerateLegalMoves(state51, 'white');
  log(`White合法手数: ${whiteLegal.length}`);

  // White 各合法手について、適用後のevalBlackを計算
  log('');
  log('--- White合法手 → 適用後 staticWP(Black) ---');

  const moveEvals: { move: string; evalBlack: number; wp: number; gameEnded: boolean; winner: string | null }[] = [];

  for (const mv of whiteLegal) {
    const next = simulateMove(state51, 'white', mv);
    const evalB = evaluateState(next, 'black', true);
    const w = winProb(evalB);
    const moveStr = mv.type === 'pass' ? 'Pass'
      : mv.type === 'massive' ? `${mv.positionId} massive(${mv.gateId})`
      : mv.type === 'selective' ? `${mv.positionId} sel(${mv.gates.join(',')})`
      : mv.type === 'quad' ? `${mv.positionId} quad`
      : '?';
    moveEvals.push({ move: moveStr, evalBlack: evalB, wp: w, gameEnded: next.gameEnded, winner: next.winner ?? null });
  }

  // eval昇順（Whiteにとって有利=Blackにとって不利=evalが低い順）
  moveEvals.sort((a, b) => a.evalBlack - b.evalBlack);

  log(`上位5手（White視点で有利な手）:`);
  for (const me of moveEvals.slice(0, 5)) {
    log(`  ${me.move.padEnd(30)} evalBlack=${String(me.evalBlack.toFixed(1)).padStart(10)} staticWP(Black)=${(me.wp*100).toFixed(2)}% gameEnded=${me.gameEnded} winner=${me.winner}`);
  }
  log(`下位5手（White視点で不利な手）:`);
  for (const me of moveEvals.slice(-5).reverse()) {
    log(`  ${me.move.padEnd(30)} evalBlack=${String(me.evalBlack.toFixed(1)).padStart(10)} staticWP(Black)=${(me.wp*100).toFixed(2)}% gameEnded=${me.gameEnded} winner=${me.winner}`);
  }

  // ─── minimax評価 (#51後, depth=2, Black視点) ────────────────────────────
  log('');
  log('--- minimax評価 (#51後, Black視点) ---');

  log('depth=1:');
  const mm1 = minimaxAB(state51, 1, -INF, INF, 'white', 'black');
  log(`  minimax score(Black)=${mm1.toFixed(1)} → staticWP=${(winProb(mm1)*100).toFixed(2)}%`);

  log('depth=2:');
  const mm2 = minimaxAB(state51, 2, -INF, INF, 'white', 'black');
  log(`  minimax score(Black)=${mm2.toFixed(1)} → staticWP=${(winProb(mm2)*100).toFixed(2)}%`);

  log('depth=3:');
  const t0 = Date.now();
  const mm3 = minimaxAB(state51, 3, -INF, INF, 'white', 'black');
  log(`  minimax score(Black)=${mm3.toFixed(1)} → staticWP=${(winProb(mm3)*100).toFixed(2)}% (${Date.now()-t0}ms)`);

  // ─── White逆転可能性の判定 ───────────────────────────────────────────────
  log('');
  log('=== White逆転可能性の判定 ===');

  const terminalWinForWhite = moveEvals.filter(m => m.gameEnded && m.winner === 'white');
  const terminalDraw = moveEvals.filter(m => m.gameEnded && m.winner === 'draw');
  const terminalWinForBlack = moveEvals.filter(m => m.gameEnded && m.winner === 'black');

  log(`White即座勝利手: ${terminalWinForWhite.length}件`);
  log(`即座引き分け手: ${terminalDraw.length}件`);
  log(`即座Black勝利手（Whiteが踏むとBlack勝ち）: ${terminalWinForBlack.length}件`);

  if (terminalWinForWhite.length > 0) {
    log('⚠️  White逆転手が存在する → staticWP 75.63% は過小評価の可能性');
  } else if (terminalDraw.length > 0) {
    log('⚠️  引き分け手が存在する → staticWP 75.63% はやや過小評価の可能性');
  } else {
    log('✅ White即座逆転手なし');
    log('   → #51後も残りGateが多く存在するため、理論上逆転の余地がある');
    log('   → 静的評価（posWeight=70）でBlack 10対White 3 = +490点ベース');
    log('   → それでも75%程度は、残Gate・キャプチャ機会・ゲート支配の影響を受けた結果');
  }

  // ─── Gate残状況の詳細 ───────────────────────────────────────────────────
  log('');
  log('=== #51後 Gate残容量詳細 ===');
  for (const g of board51.gateDetails) {
    const status = g.full ? '満杯' : `残あり(B${g.blackVal}/W${g.whiteVal}/使用${g.total})`;
    log(`  Gate${String(g.id).padStart(2)}: ${status}`);
  }

  log('');
  log('=== 監査完了 ===');
}

main().catch(e => { log(`FATAL: ${e}`); process.exit(1); });
