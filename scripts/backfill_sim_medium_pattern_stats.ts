/**
 * backfill_sim_medium_pattern_stats.ts
 *
 * sim_match_logs (sim_policy='easy_vs_easy') から medium_pattern_id を計算し、
 * Supabase の sim_medium_pattern_stats を更新する。
 *
 * 実行方法:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   npx tsx scripts/backfill_sim_medium_pattern_stats.ts
 *
 * 前提:
 *   - phase_medium_pattern.sql が Supabase SQL Editor で実行済みであること
 *   - sim_medium_pattern_stats テーブルが存在すること
 *   - .env に VITE_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が設定済みであること
 *
 * 注意:
 *   - 実戦の match_logs / medium_pattern_stats には一切書き込まない
 *   - sim_match_logs / sim_medium_pattern_stats のみ操作する
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// .env を手動ロード（dotenv 未インストール対応）
try {
  const envPath = resolve(process.cwd(), '.env');
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* .env なければ process.env をそのまま使う */ }

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

// ─── Supabase クライアント ────────────────────────────────────────────────────

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: VITE_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── 型 ──────────────────────────────────────────────────────────────────────

interface StatAccum {
  wins_black: number;
  wins_white: number;
  draws: number;
  total: number;
}

// key: `${medium_pattern_id}||${sim_policy}`
type StatsMap = Map<string, StatAccum>;

// ─── ゲームリプレイ ──────────────────────────────────────────────────────────

function replayGameWithStates(history: MoveRecord[]): GameState[] {
  let state: GameState = createInitialState();
  const postMoveStates: GameState[] = [];

  for (const record of history) {
    const { positioning, build } = record;

    if (positioning !== 'P') {
      state = selectPosition(state, positioning as PositionId);
    }

    let nextState: GameState;

    switch (build.type) {
      case 'massive':
        nextState = build.gate !== null && build.gate !== undefined
          ? applyMassiveBuild(state, build.gate as GateId)
          : confirmPositionOnly(state);
        break;
      case 'selective': {
        const gates = (build.gates as [GateId | 0, GateId | 0]).filter((g): g is GateId => g !== 0);
        if (gates.length === 2) nextState = applySelectiveBuild(state, gates as [GateId, GateId]);
        else if (gates.length === 1) nextState = applySelectiveBuildSingle(state, gates[0]!);
        else nextState = confirmPositionOnly(state);
        break;
      }
      case 'quad':
        nextState = applyQuadBuildForGates(state, build.placedGateIds as GateId[]);
        break;
      case 'skip':
        nextState = skipTurn(state);
        break;
      case 'no-build':
        nextState = confirmPositionOnly(state);
        break;
      default:
        console.warn(`  unknown build type: ${(build as { type: string }).type}`);
        nextState = state;
        break;
    }

    postMoveStates.push(nextState);
    state = nextState;
  }

  return postMoveStates;
}

// ─── 統計集計 ────────────────────────────────────────────────────────────────

function accumulate(
  statsMap: StatsMap,
  mediumPatternId: string,
  simPolicy: string,
  winner: string,
): void {
  const key = `${mediumPatternId}||${simPolicy}`;
  const prev = statsMap.get(key) ?? { wins_black: 0, wins_white: 0, draws: 0, total: 0 };
  statsMap.set(key, {
    wins_black: prev.wins_black + (winner === 'black' ? 1 : 0),
    wins_white: prev.wins_white + (winner === 'white' ? 1 : 0),
    draws:      prev.draws      + (winner === 'draw'  ? 1 : 0),
    total:      prev.total + 1,
  });
}

// ─── バッチ upsert（CHUNK_SIZE 件ずつ） ──────────────────────────────────────

const CHUNK_SIZE = 200;

async function flushStats(statsMap: StatsMap): Promise<{ ok: number; err: number }> {
  const rows = Array.from(statsMap.entries()).map(([key, accum]) => {
    const [medium_pattern_id, sim_policy] = key.split('||') as [string, string];
    const { wins_black, wins_white, draws, total } = accum;
    return {
      medium_pattern_id,
      sim_policy,
      wins_black,
      wins_white,
      draws,
      total,
      win_rate_black: total > 0 ? Math.round(wins_black / total * 10000) / 100 : null,
      win_rate_white: total > 0 ? Math.round(wins_white / total * 10000) / 100 : null,
    };
  });

  console.log(`\n== upsert 開始: ${rows.length} 行 ==`);
  let ok = 0;
  let err = 0;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from('sim_medium_pattern_stats')
      .upsert(chunk, { onConflict: 'medium_pattern_id,sim_policy' });
    if (error) {
      console.error(`  ERROR (chunk ${Math.floor(i / CHUNK_SIZE) + 1}): ${error.message}`);
      err += chunk.length;
    } else {
      ok += chunk.length;
      process.stdout.write('.');
    }
  }
  console.log('\n');
  return { ok, err };
}

// ─── ページング取得 ──────────────────────────────────────────────────────────

const PAGE_SIZE = 500;

async function fetchAllSimMatchLogs(): Promise<Array<{ id: string; sim_policy: string; winner: string; full_record: MoveRecord[] }>> {
  const allRows: Array<{ id: string; sim_policy: string; winner: string; full_record: MoveRecord[] }> = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('sim_match_logs')
      .select('id, sim_policy, winner, full_record')
      .eq('sim_policy', 'easy_vs_easy')
      .not('winner', 'is', null)
      .not('full_record', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error(`ERROR: fetch failed at offset ${offset}:`, error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) break;

    allRows.push(...(data as Array<{ id: string; sim_policy: string; winner: string; full_record: MoveRecord[] }>));
    console.log(`  取得済み: ${allRows.length} 件`);

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return allRows;
}

// ─── メイン処理 ───────────────────────────────────────────────────────────────

async function main() {
  console.log('=== backfill_sim_medium_pattern_stats.ts ===');
  console.log('対象テーブル: sim_medium_pattern_stats (sim_policy=easy_vs_easy)\n');

  // Step 1: 現在の行数確認
  const { count: currentCount } = await supabase
    .from('sim_medium_pattern_stats')
    .select('*', { count: 'exact', head: true });
  console.log(`現在の sim_medium_pattern_stats 行数: ${currentCount ?? 0}`);

  if ((currentCount ?? 0) > 0) {
    console.log('既にデータが存在します。スキップせず追記（upsert）します。');
  }

  // Step 2: sim_match_logs 取得
  console.log('\nsim_match_logs (easy_vs_easy) を取得中...');
  const targets = await fetchAllSimMatchLogs();
  console.log(`\n合計取得: ${targets.length} 件\n`);

  const statsMap: StatsMap = new Map();
  let processed = 0;
  let skipped = 0;
  let errors = 0;
  let totalPatterns = 0;

  for (let i = 0; i < targets.length; i++) {
    const row = targets[i]!;
    const fullRecord = row.full_record as MoveRecord[] | null;
    const winner = row.winner as string;

    if (!fullRecord || fullRecord.length === 0) {
      skipped++;
      continue;
    }
    if (!['black', 'white', 'draw'].includes(winner)) {
      skipped++;
      continue;
    }

    if ((i + 1) % 1000 === 0) {
      console.log(`  処理中: ${i + 1} / ${targets.length} ゲーム (statsMap size: ${statsMap.size})`);
    }

    try {
      const postMoveStates = replayGameWithStates(fullRecord);

      for (const state of postMoveStates) {
        const patternId = computeMediumPatternId(state);
        if (!patternId) continue;
        accumulate(statsMap, patternId, row.sim_policy, winner);
        totalPatterns++;
      }

      processed++;
    } catch (e) {
      console.error(`  EXCEPTION id=${row.id}: ${e instanceof Error ? e.message : String(e)}`);
      errors++;
    }
  }

  console.log(`\n--- 集計完了 ---`);
  console.log(`processed: ${processed} / skipped: ${skipped} / errors: ${errors}`);
  console.log(`総パターン計算数: ${totalPatterns}`);
  console.log(`ユニーク (medium_pattern_id, sim_policy) ペア数: ${statsMap.size}`);

  if (statsMap.size === 0) {
    console.log('upsert 対象なし。終了。');
    return;
  }

  const { ok, err: upsertErr } = await flushStats(statsMap);

  console.log('=== 完了 ===');
  console.log(`upsert OK: ${ok} / ERROR: ${upsertErr}`);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
