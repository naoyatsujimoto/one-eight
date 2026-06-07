/**
 * audit_wp_113969e1.ts
 *
 * 対局 113969e1（52手 Black勝利）の #48〜#52 について
 * Postmortem WP算出ロジックを数値ログで監査する。
 *
 * 確認項目:
 *   - move適用後state の gameEnded / winner
 *   - evaluateState(state, 'black') と evaluateState(state, 'white')
 *   - staticWP(Black)
 *   - 視点反転の有無
 *   - fallback chain の source と rawWP
 *   - final resolvedWP が70%前後になる直接原因の特定
 *
 * 実行方法:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   npx vite-node scripts/audit_wp_113969e1.ts
 *
 * Note: Git管理しない（git add しない）
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
} catch { /* skip */ }

import { createClient } from '@supabase/supabase-js';
import { createInitialState } from '../src/game/initialState';
import {
  selectPosition, applyMassiveBuild, applySelectiveBuild,
  applySelectiveBuildSingle, applyQuadBuildForGates, skipTurn,
} from '../src/game/engine';
import { evaluateState } from '../src/game/ai';
import type { GameState, MoveRecord, GateId, PositionId } from '../src/game/types';
import { POSITION_IDS, GATE_IDS } from '../src/game/constants';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('ERROR: env missing'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const TARGET_GAME_ID = '113969e1-929f-48c2-92f1-d1cff4e2bff4';

// WP変換 (Black視点)
const K_WP = 0.003;
function winProb(score: number): number {
  return 1 / (1 + Math.exp(-K_WP * score));
}

function log(msg: string) { console.log(msg); }

// ─── State Replay ─────────────────────────────────────────────────────────────

function applyMoveRecord(state: GameState, record: MoveRecord): GameState {
  if (record.positioning === 'P' || record.build.type === 'skip') {
    const withPlayer: GameState = { ...state, currentPlayer: record.player };
    return skipTurn(withPlayer);
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

// ─── State Inspector ──────────────────────────────────────────────────────────

function inspectState(state: GameState): {
  blackPos: number; whitePos: number; filledGates: number; totalGates: number;
  gameEnded: boolean; winner: string | null;
  evalBlack: number; evalWhite: number;
  staticWP_Black: number;
} {
  let blackPos = 0, whitePos = 0;
  for (const posId of POSITION_IDS as unknown as string[]) {
    const owner = (state.positions as any)[posId]?.owner;
    if (owner === 'black') blackPos++;
    if (owner === 'white') whitePos++;
  }
  let filledGates = 0;
  for (const gId of GATE_IDS as unknown as number[]) {
    const gate = (state.gates as any)[gId];
    if (gate && isGateFull(gate)) filledGates++;
  }
  const totalGates = (GATE_IDS as unknown as number[]).length;

  const evalBlack = evaluateState(state, 'black', true);
  const evalWhite = evaluateState(state, 'white', true);
  const staticWP_Black = winProb(evalBlack);

  return {
    blackPos, whitePos, filledGates, totalGates,
    gameEnded: state.gameEnded,
    winner: state.winner ?? null,
    evalBlack, evalWhite, staticWP_Black,
  };
}

function isGateFull(gate: any): boolean {
  // gate の各スロットが全て埋まっているかを判定
  if (!gate || !gate.slots) return false;
  return Object.values(gate.slots).every((v) => v !== null && v !== undefined && v !== '');
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  log('=== Postmortem WP 数値ログ監査 ===');
  log(`対象対局: ${TARGET_GAME_ID}`);
  log('');

  // ─── 対局データ取得 ───────────────────────────────────────────────────────
  log('--- 対局データ取得 ---');
  const { data: matchData, error: matchError } = await supabase
    .from('match_logs')
    .select('id, winner, move_count, full_record')
    .eq('id', TARGET_GAME_ID)
    .single();

  if (matchError || !matchData) {
    log(`ERROR: 対局取得失敗: ${matchError?.message}`);
    process.exit(1);
  }

  const fullRecord: MoveRecord[] = matchData.full_record as MoveRecord[];
  log(`winner: ${matchData.winner} / 手数: ${fullRecord.length} (move_count=${matchData.move_count})`);
  log('');

  // ─── fallback 統計取得 ────────────────────────────────────────────────────
  log('--- DB fallback統計 取得 ---');

  // medium_pattern_ids / position_only_ids を全hand分抽出
  const allMedIds = fullRecord.map(r => (r as any).medium_pattern_id).filter(Boolean) as string[];
  const allPosOnlyIds = allMedIds.map(mid => mid.includes(':') ? mid.split(':')[0] : null).filter(Boolean) as string[];

  // fh_sim_medium_pattern
  const { data: fhMedData } = await supabase
    .from('sim_medium_pattern_stats')
    .select('medium_pattern_id, total, wins_black, wins_white, draws')
    .eq('sim_policy', 'fast_hard_vs_fast_hard')
    .in('medium_pattern_id', allMedIds);

  const fhMedMap = new Map<string, { total: number; win_rate_black: number }>();
  for (const r of (fhMedData ?? []) as any[]) {
    fhMedMap.set(r.medium_pattern_id, {
      total: r.total,
      win_rate_black: r.total > 0 ? r.wins_black / r.total : 0.5,
    });
  }
  log(`fh_sim_medium_pattern: ${fhMedMap.size} / ${allMedIds.length} 件ヒット`);

  // fh_sim_position_only
  const { data: fhPosData } = await supabase
    .from('sim_position_only_stats')
    .select('position_only_id, total, wins_black, wins_white, draws')
    .eq('sim_policy', 'fast_hard_vs_fast_hard')
    .in('position_only_id', allPosOnlyIds);

  const fhPosMap = new Map<string, { total: number; win_rate_black: number }>();
  for (const r of (fhPosData ?? []) as any[]) {
    fhPosMap.set(r.position_only_id, {
      total: r.total,
      win_rate_black: r.total > 0 ? r.wins_black / r.total : 0.5,
    });
  }
  log(`fh_sim_position_only: ${fhPosMap.size} / ${allPosOnlyIds.length} 件ヒット`);

  // easy_sim_medium_pattern
  const { data: easyMedData } = await supabase
    .from('sim_medium_pattern_stats')
    .select('medium_pattern_id, total, wins_black, wins_white, draws')
    .eq('sim_policy', 'easy_vs_easy')
    .in('medium_pattern_id', allMedIds);

  const easyMedMap = new Map<string, { total: number; win_rate_black: number }>();
  for (const r of (easyMedData ?? []) as any[]) {
    easyMedMap.set(r.medium_pattern_id, {
      total: r.total,
      win_rate_black: r.total > 0 ? r.wins_black / r.total : 0.5,
    });
  }
  log(`easy_sim_medium_pattern: ${easyMedMap.size} / ${allMedIds.length} 件ヒット`);

  // easy_sim_position_only
  const { data: easyPosData } = await supabase
    .from('sim_position_only_stats')
    .select('position_only_id, total, wins_black, wins_white, draws')
    .eq('sim_policy', 'easy_vs_easy')
    .in('position_only_id', allPosOnlyIds);

  const easyPosMap = new Map<string, { total: number; win_rate_black: number }>();
  for (const r of (easyPosData ?? []) as any[]) {
    easyPosMap.set(r.position_only_id, {
      total: r.total,
      win_rate_black: r.total > 0 ? r.wins_black / r.total : 0.5,
    });
  }
  log(`easy_sim_position_only: ${easyPosMap.size} / ${allPosOnlyIds.length} 件ヒット`);
  log('');

  // ─── State 再構築 & ログ出力 ──────────────────────────────────────────────
  log('--- State再構築 & WP監査ログ ---');
  log('');

  let state: GameState = createInitialState();
  const AUDIT_FROM = 44; // #44以降を詳細出力（後半全体を確認）

  for (let i = 0; i < fullRecord.length; i++) {
    const record = fullRecord[i]!;
    const mn = record.moveNumber;

    // state にrecordを適用 → next
    let next: GameState;
    try {
      next = applyMoveRecord(state, record);
    } catch (e) {
      log(`[ERROR] #${mn} applyMoveRecord 失敗: ${e}`);
      state = state; // 変更しない
      continue;
    }

    // 監査ログ出力 (#44以降)
    if (mn >= AUDIT_FROM) {
      const info = inspectState(next);

      // medium_pattern_id / position_only_id
      const medId = (record as any).medium_pattern_id as string | undefined;
      const posOnlyId = medId?.includes(':') ? medId.split(':')[0] : medId;

      // fallback chain シミュレーション（postmortem.ts の enrichPostmortemWithStats と同じ順序）
      let fallbackSource = 'static';
      let fallbackRawWP: number | null = null;
      let resolvedWP = info.staticWP_Black;

      // Step 2.3a: fh_sim_medium_pattern (total >= 30, blend 0.2)
      const fhMed = medId ? fhMedMap.get(medId) : undefined;
      if (fhMed && fhMed.total >= 30) {
        const simWP = fhMed.win_rate_black;
        fallbackSource = 'fh_sim_medium_pattern';
        fallbackRawWP = simWP;
        resolvedWP = 0.2 * simWP + 0.8 * info.staticWP_Black;
      }

      // Step 2.5a: fh_sim_position_only (total >= 100, blend 0.1) — より上位
      // ※ postmortem.ts の順序: fh_sim_medium → fh_sim_position_only → easy_sim_medium → easy_sim_position_only → static
      // fh_sim_position_only は fh_sim_medium より下位（追加後は上位に入る場合もある）
      // 現行コードの順序を確認し、正確にシミュレートする

      // 現行コードでは fh_sim_medium → fh_sim_position_only の順
      // fh_sim_medium が採用されたら fh_sim_position_only はスキップ
      if (fallbackSource === 'static') {
        const fhPos = posOnlyId ? fhPosMap.get(posOnlyId) : undefined;
        if (fhPos && fhPos.total >= 100) {
          const posWP = fhPos.win_rate_black;
          fallbackSource = 'fh_sim_position_only';
          fallbackRawWP = posWP;
          resolvedWP = 0.1 * posWP + 0.9 * info.staticWP_Black;
        }
      }

      // Step 2.3b: easy_sim_medium_pattern (total >= 30, blend 0.2)
      if (fallbackSource === 'static') {
        const easyMed = medId ? easyMedMap.get(medId) : undefined;
        if (easyMed && easyMed.total >= 30) {
          const simWP = easyMed.win_rate_black;
          fallbackSource = 'sim_medium_pattern';
          fallbackRawWP = simWP;
          resolvedWP = 0.2 * simWP + 0.8 * info.staticWP_Black;
        }
      }

      // Step 2.5b: easy_sim_position_only (total >= 100, blend 0.1)
      if (fallbackSource === 'static') {
        const easyPos = posOnlyId ? easyPosMap.get(posOnlyId) : undefined;
        if (easyPos && easyPos.total >= 100) {
          const posWP = easyPos.win_rate_black;
          fallbackSource = 'sim_position_only';
          fallbackRawWP = posWP;
          resolvedWP = 0.1 * posWP + 0.9 * info.staticWP_Black;
        }
      }

      // ─── 出力 ───────────────────────────────────────────────────────────────
      log(`#${String(mn).padStart(2)} [${record.player.padEnd(5)}] move=${shortRecord(record)}`);
      log(`    positions: Black=${info.blackPos} White=${info.whitePos} | gates filled=${info.filledGates}/${info.totalGates}`);
      log(`    gameEnded=${info.gameEnded} winner=${info.winner ?? 'null'}`);
      log(`    evalBlack=${info.evalBlack} evalWhite=${info.evalWhite}`);
      log(`    staticWP(Black)=${(info.staticWP_Black * 100).toFixed(2)}%   [winProb(${info.evalBlack})]`);
      log(`    fallback source=${fallbackSource}`);
      if (fallbackRawWP !== null) {
        log(`    fallback rawWP=${(fallbackRawWP * 100).toFixed(2)}%`);
        if (fallbackSource === 'fh_sim_medium_pattern' || fallbackSource === 'sim_medium_pattern') {
          const blend = fallbackSource === 'fh_sim_medium_pattern' ? 0.2 : 0.2;
          log(`    blend: ${(blend*100).toFixed(0)}% × ${(fallbackRawWP*100).toFixed(2)}% + ${((1-blend)*100).toFixed(0)}% × ${(info.staticWP_Black*100).toFixed(2)}%`);
        } else {
          log(`    blend: 10% × ${(fallbackRawWP*100).toFixed(2)}% + 90% × ${(info.staticWP_Black*100).toFixed(2)}%`);
        }
      }
      log(`    resolvedWP=${(resolvedWP * 100).toFixed(2)}%`);

      // canonical_hash整合性確認
      const recordHash = (record as any).canonical_hash;
      const nextHash = next.history[next.history.length - 1]?.canonical_hash;
      if (recordHash && nextHash && recordHash !== nextHash) {
        log(`    ⚠️  canonical_hash不一致: record=${recordHash?.slice(0,8)} / replay=${nextHash?.slice(0,8)}`);
      } else if (recordHash) {
        log(`    canonical_hash: ✅ 一致 (${recordHash.slice(0,8)}...)`);
      }
      log('');
    }

    state = next;
  }

  // ─── 最終state確認 ────────────────────────────────────────────────────────
  log('--- 最終state（#52後）まとめ ---');
  const finalInfo = inspectState(state);
  log(`gameEnded: ${finalInfo.gameEnded}`);
  log(`winner: ${finalInfo.winner ?? 'null'}`);
  log(`Black pos: ${finalInfo.blackPos} / White pos: ${finalInfo.whitePos}`);
  log(`gates filled: ${finalInfo.filledGates}/${finalInfo.totalGates}`);
  log(`evaluateState('black'): ${finalInfo.evalBlack}`);
  log(`evaluateState('white'): ${finalInfo.evalWhite}`);
  log(`staticWP(Black): ${(finalInfo.staticWP_Black * 100).toFixed(2)}%`);
  log('');
  log(`▶ evaluateState が gameEnded を考慮しているか: NO（コード上確認済み）`);
  log(`▶ staticWP が ${(finalInfo.staticWP_Black * 100).toFixed(2)}% に留まる理由:`);
  log(`  evaluateState は盤面評価値 ${finalInfo.evalBlack} を返す（終局ボーナスなし）`);
  log(`  winProb(${finalInfo.evalBlack}) = 1/(1+exp(-0.003×${finalInfo.evalBlack})) = ${(finalInfo.staticWP_Black * 100).toFixed(2)}%`);
  log('');
  log('=== 監査完了 ===');
}

function shortRecord(r: MoveRecord): string {
  if (r.positioning === 'P' || r.build.type === 'skip') return 'Pass';
  if (r.build.type === 'massive') return `${r.positioning} massive(${r.build.gate ?? '?'})`;
  if (r.build.type === 'selective') {
    const gates = r.build.gates.filter(g => g !== 0);
    return `${r.positioning} selective(${gates.join(',')})`;
  }
  if (r.build.type === 'quad') return `${r.positioning} quad`;
  return '?';
}

main().catch(e => { log(`FATAL: ${e}`); process.exit(1); });
