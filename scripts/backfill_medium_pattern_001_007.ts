/**
 * backfill_medium_pattern_001_007.ts
 *
 * batch_001〜007（10,000局）の sim_medium_pattern_stats バックフィル。
 *
 * 実行方法:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   npx vite-node scripts/backfill_medium_pattern_001_007.ts
 *
 * 処理フロー:
 *   1. batch_001〜007 を順番にページング取得
 *   2. full_record の各手を engine でリプレイし medium_pattern_id を計算
 *   3. batch_upsert_sim_medium_pattern_stats RPC で sim_medium_pattern_stats に加算
 *   4. 処理済みゲームIDをチェックポイントファイルに記録（再実行時スキップ）
 *   5. full_record も medium_pattern_id 付きで上書き更新（batch_008 と整合）
 *
 * チェックポイント: /tmp/backfill_medium_checkpoint.json
 * ダブルカウント防止: チェックポイントに記録済みの id はスキップ
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
  console.error('ERROR: env 未設定');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const SIM_POLICY = 'easy_vs_easy';

const TARGET_BATCHES = [
  'easy_20260507_001',
  'easy_20260508_002',
  'easy_20260508_003',
  'easy_20260508_004',
  'easy_20260508_005',
  'easy_20260508_006',
  'easy_20260508_007',
];

const CHECKPOINT_PATH = '/tmp/backfill_medium_checkpoint.json';

// チェックポイント読み込み
function loadCheckpoint(): Set<number> {
  try {
    if (fs.existsSync(CHECKPOINT_PATH)) {
      const raw = fs.readFileSync(CHECKPOINT_PATH, 'utf-8');
      const ids: number[] = JSON.parse(raw);
      return new Set(ids);
    }
  } catch {}
  return new Set();
}

function saveCheckpoint(ids: Set<number>) {
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify([...ids]));
}

// ─── engine リプレイ（medium_pattern_id 付与） ────────────────────────────────

type ExtendedMoveRecord = MoveRecord & {
  medium_pattern_id?: string;
  canonical_hash?: string;
};

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
        const b = build as { type: 'massive'; gate: GateId | null; placed: number };
        if (b.gate !== null) {
          nextState = applyMassiveBuild(state, b.gate);
        } else {
          nextState = confirmPositionOnly(state);
        }
        break;
      }
      case 'selective': {
        const b = build as { type: 'selective'; gates: [GateId | 0, GateId | 0]; placed: number };
        const validGates = b.gates.filter((g): g is GateId => g !== 0);
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
        const b = build as { type: 'quad'; placedGateIds: GateId[]; placed: number };
        nextState = applyQuadBuildForGates(state, b.placedGateIds);
        break;
      }
      case 'skip': {
        nextState = skipTurn(state);
        break;
      }
      case 'no-build':
      default: {
        nextState = confirmPositionOnly(state);
        break;
      }
    }

    let mediumPatternId: string | undefined;
    try {
      mediumPatternId = computeMediumPatternId(nextState);
    } catch {
      mediumPatternId = undefined;
    }

    result.push({ ...record, medium_pattern_id: mediumPatternId });
    state = nextState;
  }

  return result;
}

// ─── メイン ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== backfill_medium_pattern_001_007.ts ===');
  console.log(`対象バッチ: ${TARGET_BATCHES.join(', ')}\n`);

  // RPC 存在確認
  const { error: rpcTest } = await supabase.rpc('batch_upsert_sim_medium_pattern_stats', {
    p_pattern_ids: [] as string[],
    p_winner: 'black',
    p_sim_policy: SIM_POLICY,
  });
  if (rpcTest && (rpcTest.message.includes('does not exist') || rpcTest.message.includes('function'))) {
    console.error('ERROR: batch_upsert_sim_medium_pattern_stats RPC が存在しません');
    process.exit(1);
  }

  const processed = loadCheckpoint();
  console.log(`チェックポイント: ${processed.size} 件スキップ\n`);

  let totalSuccess = 0;
  let totalSkip = 0;
  let totalError = 0;

  for (const batchId of TARGET_BATCHES) {
    console.log(`\n--- ${batchId} 処理開始 ---`);

    let offset = 0;
    const PAGE = 100;
    let batchSuccess = 0;
    let batchSkip = 0;

    while (true) {
      const { data, error } = await supabase
        .from('sim_match_logs')
        .select('id, winner, move_count, full_record')
        .eq('sim_batch_id', batchId)
        .range(offset, offset + PAGE - 1);

      if (error) {
        console.error(`取得エラー (${batchId} offset=${offset}): ${error.message}`);
        break;
      }
      if (!data || data.length === 0) break;

      for (const row of data) {
        const rowId = row.id as number;

        // チェックポイントでスキップ
        if (processed.has(rowId)) {
          batchSkip++;
          continue;
        }

        if (!row.winner || !row.full_record) {
          processed.add(rowId);
          batchSkip++;
          continue;
        }

        const fr = row.full_record as ExtendedMoveRecord[];

        // リプレイして medium_pattern_id 付与
        let replayed: ExtendedMoveRecord[];
        try {
          replayed = replayGame(fr);
        } catch (e) {
          console.warn(`  [WARN] id=${rowId} replay失敗: ${e instanceof Error ? e.message : String(e)}`);
          totalError++;
          continue;
        }

        const patternIds = replayed
          .map(m => m.medium_pattern_id)
          .filter((p): p is string => !!p);

        if (patternIds.length === 0) {
          processed.add(rowId);
          batchSkip++;
          continue;
        }

        // sim_medium_pattern_stats に加算
        const { error: rpcErr } = await supabase.rpc('batch_upsert_sim_medium_pattern_stats', {
          p_pattern_ids: patternIds,
          p_winner: row.winner,
          p_sim_policy: SIM_POLICY,
        });

        if (rpcErr) {
          console.error(`  RPC ERROR (id=${rowId}): ${rpcErr.message}`);
          totalError++;
          continue;
        }

        // full_record を medium_pattern_id 付きで更新
        const { error: updateErr } = await supabase
          .from('sim_match_logs')
          .update({ full_record: replayed })
          .eq('id', rowId);

        if (updateErr) {
          // 更新失敗しても RPC は済んでいるのでチェックポイントに記録
          console.warn(`  [WARN] full_record更新失敗 (id=${rowId}): ${updateErr.message}`);
        }

        processed.add(rowId);
        batchSuccess++;
        totalSuccess++;

        if (batchSuccess % 200 === 0) {
          saveCheckpoint(processed);
          process.stdout.write(`  ${batchId}: ${batchSuccess + batchSkip}件処理済み\r`);
        }
      }

      saveCheckpoint(processed);
      offset += PAGE;
      if (data.length < PAGE) break;
    }

    console.log(`${batchId}: success=${batchSuccess} skip=${batchSkip}`);
    totalSkip += batchSkip;
  }

  saveCheckpoint(processed);

  // 最終件数確認
  console.log('\n=== 最終確認 ===');
  const { count: medTotal } = await supabase
    .from('sim_medium_pattern_stats')
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', SIM_POLICY);

  const { count: mge30 } = await supabase.from('sim_medium_pattern_stats').select('*', { count: 'exact', head: true }).gte('total', 30);
  const { count: mge50 } = await supabase.from('sim_medium_pattern_stats').select('*', { count: 'exact', head: true }).gte('total', 50);
  const { count: mge100 } = await supabase.from('sim_medium_pattern_stats').select('*', { count: 'exact', head: true }).gte('total', 100);
  const { count: mge200 } = await supabase.from('sim_medium_pattern_stats').select('*', { count: 'exact', head: true }).gte('total', 200);
  const { count: mge500 } = await supabase.from('sim_medium_pattern_stats').select('*', { count: 'exact', head: true }).gte('total', 500);

  const { data: medMax } = await supabase
    .from('sim_medium_pattern_stats')
    .select('total')
    .order('total', { ascending: false })
    .limit(1);

  console.log(`sim_medium_pattern_stats 総行数: ${medTotal}`);
  console.log(`最大total: ${medMax?.[0]?.total}`);
  console.log(`total>=30: ${mge30} / >=50: ${mge50} / >=100: ${mge100} / >=200: ${mge200} / >=500: ${mge500}`);
  console.log(`\n処理結果: success=${totalSuccess} skip=${totalSkip} error=${totalError}`);
  console.log('\n=== 完了 ===');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
