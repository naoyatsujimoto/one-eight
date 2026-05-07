/**
 * backfill_symmetry_group_stats.ts
 *
 * 既存の match_logs.full_record から symmetry_group_id を計算し、
 * Supabase の symmetry_group_stats を更新する。
 *
 * 対象: canonical_hashes_computed = true のレコード
 *       （= canonical_hash が付与済みの棋譜）
 *
 * 実行方法:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   npx tsx scripts/backfill_symmetry_group_stats.ts
 *
 * 前提:
 *   - phase_symmetry_group_stats.sql が Supabase SQL Editor で実行済みであること
 *   - .env に VITE_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が設定済みであること
 */

import { createClient } from '@supabase/supabase-js';
import { createInitialState } from './src/game/initialState';
import {
  selectPosition,
  applyMassiveBuild,
  applySelectiveBuild,
  applySelectiveBuildSingle,
  applyQuadBuildForGates,
  skipTurn,
  confirmPositionOnly,
} from './src/game/engine';
import { computeSymmetryGroupId } from './src/game/symmetry';
import type { GameState, MoveRecord, GateId, PositionId } from './src/game/types';

// ─── Supabase クライアント ────────────────────────────────────────────────────

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: VITE_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── mode_group 決定ロジック ──────────────────────────────────────────────────

function resolveModeGroups(mode: string, cpuDifficulty: string | null): string[] {
  const groups: string[] = ['all'];
  if (mode === 'human_vs_human') {
    groups.push('pvp');
  } else if (mode === 'online') {
    groups.push('online');
  } else if (mode === 'human_vs_cpu' && cpuDifficulty) {
    if (/^[a-z0-9_]+$/.test(cpuDifficulty)) {
      groups.push(`cpu_${cpuDifficulty}`);
    }
  }
  return groups;
}

// ─── 1ゲームをリプレイして各手の GameState を返す ───────────────────────────

interface ReplayStep {
  record: MoveRecord;
  postMoveState: GameState;
}

function replayGameWithStates(history: MoveRecord[]): ReplayStep[] {
  let state: GameState = createInitialState();
  const result: ReplayStep[] = [];

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
        console.warn(`  unknown build type at move ${record.moveNumber}: ${(build as {type:string}).type}`);
        nextState = state;
        break;
      }
    }

    result.push({ record, postMoveState: nextState });
    state = nextState;
  }

  return result;
}

// ─── メイン処理 ───────────────────────────────────────────────────────────────

async function main() {
  console.log('=== backfill_symmetry_group_stats.ts ===');
  console.log('対象: canonical_hashes_computed = true のレコード\n');

  // 1. 対象レコードを取得
  const { data: rows, error: fetchErr } = await supabase
    .from('match_logs')
    .select('id, mode, cpu_difficulty, winner, full_record')
    .eq('canonical_hashes_computed', true)
    .not('full_record', 'is', null)
    .not('winner', 'is', null);

  if (fetchErr) {
    console.error('ERROR: fetch failed:', fetchErr.message);
    process.exit(1);
  }

  const targets = rows ?? [];
  console.log(`取得: ${targets.length} 件\n`);

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of targets) {
    const fullRecord = row.full_record as MoveRecord[] | null;
    if (!fullRecord || fullRecord.length === 0) {
      console.log(`[SKIP] id=${row.id} — full_record なし`);
      skipped++;
      continue;
    }

    const winner = row.winner as string;
    if (!['black', 'white', 'draw'].includes(winner)) {
      console.log(`[SKIP] id=${row.id} — invalid winner: ${winner}`);
      skipped++;
      continue;
    }

    console.log(`[Processing] id=${row.id} mode=${row.mode} winner=${winner} moves=${fullRecord.length}`);

    try {
      // 2. リプレイして各手の post-move state から symmetry_group_id を計算
      const steps = replayGameWithStates(fullRecord);

      const groupIds: string[] = [];
      for (const step of steps) {
        const gid = computeSymmetryGroupId(step.postMoveState);
        if (gid) groupIds.push(gid);
      }

      if (groupIds.length === 0) {
        console.log(`  [SKIP] symmetry_group_id 計算結果なし`);
        skipped++;
        continue;
      }

      console.log(`  symmetry_group_id 計算: ${groupIds.length} 手`);

      // 3. batch_upsert_symmetry_group_stats RPC を呼び出す
      const modeGroups = resolveModeGroups(row.mode, row.cpu_difficulty);
      const { error: rpcErr } = await supabase
        .rpc('batch_upsert_symmetry_group_stats', {
          p_group_ids: groupIds,
          p_winner: winner,
          p_mode_groups: modeGroups,
        });

      if (rpcErr) {
        console.error(`  ERROR symmetry_group_stats RPC: ${rpcErr.message}`);
        errors++;
        continue;
      }

      console.log(`  symmetry_group_stats 反映: ${groupIds.length} group × ${modeGroups.join(', ')}`);
      processed++;
    } catch (e) {
      console.error(`  EXCEPTION: ${e instanceof Error ? e.message : String(e)}`);
      errors++;
    }
  }

  console.log('\n=== 完了 ===');
  console.log(`processed: ${processed} / skipped: ${skipped} / errors: ${errors}`);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
