/**
 * backfill_canonical_hash.ts
 *
 * 既存の match_logs.full_record から canonical_hash を再計算し、
 * Supabase の match_logs を更新する。
 *
 * 対象: canonical_hashes_computed = false のレコード
 *       （= F-2 実装前に保存された棋譜）
 *
 * 実行方法:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   npx vite-node ../scripts/backfill_canonical_hash.ts
 *
 * 前提:
 *   - N-1b migration が Supabase SQL Editor で実行済みであること
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
import type { GameState, MoveRecord, GateId, PositionId } from './src/game/types';

// ─── Supabase クライアント ────────────────────────────────────────────────────

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: VITE_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── 1ゲームをリプレイして canonical_hash を付与した MoveRecord[] を返す ─────

function replayGame(history: MoveRecord[]): MoveRecord[] {
  let state: GameState = createInitialState();
  const result: MoveRecord[] = [];

  for (const record of history) {
    const { positioning, build } = record;

    // Step 1: ポジション選択（'P' はスキップ = skipTurn を後で呼ぶ）
    if (positioning !== 'P') {
      state = selectPosition(state, positioning as PositionId);
      if (state.selectedPosition !== positioning) {
        // selectPosition が拒否した（通常は起きないはず）
        console.warn(`  selectPosition rejected: pos=${positioning} at move ${record.moveNumber}`);
        result.push(record); // original をそのまま保持
        continue;
      }
    }

    // Step 2: ビルドに応じた関数を呼ぶ
    let nextState: GameState;

    switch (build.type) {
      case 'massive': {
        if (build.gate !== null) {
          nextState = applyMassiveBuild(state, build.gate as GateId);
        } else {
          // gate = null: ゲートなしでターン確定（legacy ケース）
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

    // Step 3: リプレイ後の history 末尾が今の手のはず
    const lastRecord = nextState.history[nextState.history.length - 1];
    if (!lastRecord || lastRecord.moveNumber !== record.moveNumber) {
      console.warn(`  history mismatch at move ${record.moveNumber}`);
      result.push(record);
    } else {
      // canonical_hash が付与されたレコードをマージ
      result.push({
        ...record,
        canonical_hash: lastRecord.canonical_hash,
      });
    }

    state = nextState;
  }

  return result;
}

// ─── mode_group 決定ロジック ──────────────────────────────────────────────────

function resolveModeGroups(mode: string, cpuDifficulty: string | null): string[] {
  const groups: string[] = ['all'];
  if (mode === 'human_vs_human') {
    groups.push('pvp');
  } else if (mode === 'online') {
    groups.push('online');
  } else if (mode === 'human_vs_cpu' && cpuDifficulty) {
    // 英小文字・数字・アンダースコアのみ許可
    if (/^[a-z0-9_]+$/.test(cpuDifficulty)) {
      groups.push(`cpu_${cpuDifficulty}`);
    }
    // null の場合は 'all' のみ（cpu_unknown は作らない）
  }
  return groups;
}

// ─── メイン処理 ───────────────────────────────────────────────────────────────

async function main() {
  console.log('=== backfill_canonical_hash.ts ===');
  console.log('対象: canonical_hashes_computed = false のレコード\n');

  // 1. 対象レコードを取得
  const { data: rows, error: fetchErr } = await supabase
    .from('match_logs')
    .select('id, mode, cpu_difficulty, winner, full_record')
    .eq('canonical_hashes_computed', false)
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

    console.log(`[Processing] id=${row.id} mode=${row.mode} winner=${row.winner} moves=${fullRecord.length}`);

    try {
      // 2. リプレイして canonical_hash を付与
      const updatedHistory = replayGame(fullRecord);

      // 付与済みの hash 数を確認
      const hashCount = updatedHistory.filter(m => m.canonical_hash).length;
      console.log(`  canonical_hash 付与: ${hashCount}/${updatedHistory.length} 手`);

      // 3. match_logs.full_record を更新
      const { error: updateErr } = await supabase
        .from('match_logs')
        .update({
          full_record: updatedHistory,
          canonical_hashes_computed: true,
        })
        .eq('id', row.id);

      if (updateErr) {
        console.error(`  ERROR update: ${updateErr.message}`);
        errors++;
        continue;
      }

      // 4. position_stats に反映（batch_upsert_position_stats RPC を呼ぶ）
      if (row.winner && ['black', 'white', 'draw'].includes(row.winner)) {
        const hashes = updatedHistory
          .map(m => m.canonical_hash)
          .filter((h): h is string => !!h);

        if (hashes.length > 0) {
          const modeGroups = resolveModeGroups(row.mode, row.cpu_difficulty);
          const { error: rpcErr } = await supabase
            .rpc('batch_upsert_position_stats', {
              p_hashes: hashes,
              p_winner: row.winner,
              p_mode_groups: modeGroups,
            });

          if (rpcErr) {
            console.error(`  ERROR position_stats RPC: ${rpcErr.message}`);
          } else {
            console.log(`  position_stats 反映: ${hashes.length} hash × ${modeGroups.join(', ')}`);
          }
        }
      }

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
