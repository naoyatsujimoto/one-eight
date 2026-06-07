/**
 * backfill_canonical_hash_v2_dryrun.ts
 *
 * canonical_hash バックフィル dry-run（read-only）
 *
 * 目的:
 *   - match_logs.full_record を commit 6402506 以降の新方式 zobrist でリプレイ
 *   - 旧 canonical_hash と新 canonical_hash を比較し、差分を報告する
 *   - DB は一切変更しない（UPDATE / INSERT / DELETE / TRUNCATE / RPC 呼び出し なし）
 *
 * 対象:
 *   - winner IS NOT NULL
 *   - full_record IS NOT NULL
 *   - full_record が非空 JSON array
 *
 * 実行方法:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   npx tsx scripts/backfill_canonical_hash_v2_dryrun.ts
 *
 * 前提:
 *   - .env に VITE_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が設定済み
 *   - src/game/zobrist.ts が commit 6402506 以降（決定論的 getMoveNumberKey）であること
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createInitialState } from '../src/game/initialState';
import { computeCanonicalHashString } from '../src/game/zobrist';
import { computeSymmetryGroupId } from '../src/game/symmetry';
import { computeMediumPatternId } from '../src/game/mediumPattern';
import {
  selectPosition,
  applyMassiveBuild,
  applySelectiveBuild,
  applySelectiveBuildSingle,
  applyQuadBuildForGates,
  skipTurn,
  confirmPositionOnly,
} from '../src/game/engine';
import type { GameState, MoveRecord, GateId, PositionId } from '../src/game/types';

// ─── Supabase クライアント ────────────────────────────────────────────────────

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: VITE_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── リプレイ結果型 ───────────────────────────────────────────────────────────

interface ReplayResult {
  /** リプレイ後の MoveRecord（新 canonical_hash / symmetry_group_id / medium_pattern_id 付き） */
  newHistory: MoveRecord[];
  /** リプレイ失敗（ずれ検出）した手番数 */
  mismatchCount: number;
  /** 最終手後の state（loopback 検証用） */
  finalState: GameState;
}

// ─── 1ゲームをリプレイ ────────────────────────────────────────────────────────
// backfill_canonical_hash.ts の replayGame をベースに、
// symmetry_group_id / medium_pattern_id も同時再計算する

function replayGame(history: MoveRecord[]): ReplayResult {
  let state: GameState = createInitialState();
  const newHistory: MoveRecord[] = [];
  let mismatchCount = 0;

  for (const record of history) {
    const { positioning, build } = record;

    // Step 1: ポジション選択
    if (positioning !== 'P') {
      state = selectPosition(state, positioning as PositionId);
      if (state.selectedPosition !== positioning) {
        mismatchCount++;
        newHistory.push(record); // original を保持
        continue;
      }
    }

    // Step 2: ビルド適用
    let nextState: GameState;
    switch (build.type) {
      case 'massive': {
        nextState = build.gate !== null
          ? applyMassiveBuild(state, build.gate as GateId)
          : confirmPositionOnly(state);
        break;
      }
      case 'selective': {
        const gates = build.gates as [GateId | 0, GateId | 0];
        const valid = gates.filter((g): g is GateId => g !== 0);
        if (valid.length === 2) {
          nextState = applySelectiveBuild(state, valid as [GateId, GateId]);
        } else if (valid.length === 1) {
          nextState = applySelectiveBuildSingle(state, valid[0]);
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
        nextState = state;
        mismatchCount++;
        newHistory.push(record);
        continue;
      }
    }

    // Step 3: 最終手との整合チェック
    const lastRecord = nextState.history[nextState.history.length - 1];
    if (!lastRecord || lastRecord.moveNumber !== record.moveNumber) {
      mismatchCount++;
      newHistory.push(record);
    } else {
      // 新方式で再計算した hash / symmetry / medium_pattern をマージ
      newHistory.push({
        ...record,
        canonical_hash:     lastRecord.canonical_hash,
        symmetry_group_id:  lastRecord.symmetry_group_id,
        medium_pattern_id:  lastRecord.medium_pattern_id,
      });
    }

    state = nextState;
  }

  return { newHistory, mismatchCount, finalState: state };
}

// ─── hash 比較ヘルパー ────────────────────────────────────────────────────────

function countHashChanges(
  oldHistory: MoveRecord[],
  newHistory: MoveRecord[],
): { changed: number; unchanged: number } {
  let changed = 0;
  let unchanged = 0;
  const len = Math.min(oldHistory.length, newHistory.length);
  for (let i = 0; i < len; i++) {
    const oldH = oldHistory[i]?.canonical_hash;
    const newH = newHistory[i]?.canonical_hash;
    if (oldH === undefined && newH === undefined) continue;
    if (oldH === newH) unchanged++;
    else changed++;
  }
  return { changed, unchanged };
}

function countSymmetryChanges(
  oldHistory: MoveRecord[],
  newHistory: MoveRecord[],
): number {
  let changed = 0;
  const len = Math.min(oldHistory.length, newHistory.length);
  for (let i = 0; i < len; i++) {
    if (oldHistory[i]?.symmetry_group_id !== newHistory[i]?.symmetry_group_id) changed++;
  }
  return changed;
}

function countMediumPatternChanges(
  oldHistory: MoveRecord[],
  newHistory: MoveRecord[],
): number {
  let changed = 0;
  const len = Math.min(oldHistory.length, newHistory.length);
  for (let i = 0; i < len; i++) {
    if (oldHistory[i]?.medium_pattern_id !== newHistory[i]?.medium_pattern_id) changed++;
  }
  return changed;
}

// ─── メイン処理 ───────────────────────────────────────────────────────────────

async function main() {
  console.log('=== backfill_canonical_hash_v2_dryrun.ts (READ-ONLY) ===');
  console.log('DB変更: なし（dry-run のみ）\n');

  // 1. 全対象レコードを取得
  const { data: rows, error: fetchErr } = await supabase
    .from('match_logs')
    .select('id, mode, cpu_difficulty, winner, full_record, canonical_hashes_computed, created_at')
    .not('winner', 'is', null)
    .not('full_record', 'is', null);

  if (fetchErr || !rows) {
    console.error('ERROR: fetch failed:', fetchErr?.message);
    process.exit(1);
  }

  // 有効な配列のみに絞る
  const targets = rows.filter(
    r => Array.isArray(r.full_record) && (r.full_record as MoveRecord[]).length > 0
  );
  const skippedCount = rows.length - targets.length;

  console.log(`取得 total: ${rows.length} 件`);
  console.log(`有効 (non-empty array): ${targets.length} 件`);
  console.log(`スキップ (null / 空): ${skippedCount} 件`);
  console.log(`うち moves > 5: ${targets.filter(r => (r.full_record as MoveRecord[]).length > 5).length} 件`);
  console.log('');

  // 2. 集計変数
  let replayOk     = 0;
  let replayFailed = 0;
  let gamesWithHashChange    = 0;
  let gamesWithoutHashChange = 0;
  let totalHashChanged    = 0;
  let totalHashUnchanged  = 0;
  let totalSymmetryChanged = 0;
  let totalMediumChanged   = 0;
  let loopbackOk = 0;
  let loopbackNg = 0;

  const samples: object[] = [];

  // 3. ゲームごとにリプレイ
  for (const row of targets) {
    const oldHistory = row.full_record as MoveRecord[];

    let result: ReplayResult;
    try {
      result = replayGame(oldHistory);
    } catch (e) {
      console.error(`[FAIL] id=${row.id}: ${e instanceof Error ? e.message : String(e)}`);
      replayFailed++;
      continue;
    }

    if (result.mismatchCount > 0) {
      console.warn(`[WARN] id=${row.id}: mismatch ${result.mismatchCount}手`);
      replayFailed++;
    } else {
      replayOk++;
    }

    const { changed, unchanged } = countHashChanges(oldHistory, result.newHistory);
    const symChanged   = countSymmetryChanges(oldHistory, result.newHistory);
    const medChanged   = countMediumPatternChanges(oldHistory, result.newHistory);

    totalHashChanged   += changed;
    totalHashUnchanged += unchanged;
    totalSymmetryChanged += symChanged;
    totalMediumChanged   += medChanged;

    if (changed > 0) gamesWithHashChange++;
    else             gamesWithoutHashChange++;

    // loopback 検証: 最終 state の canonical_hash が newHistory 末尾と一致するか
    const lastNewHash = result.newHistory[result.newHistory.length - 1]?.canonical_hash;
    const loopbackHash = computeCanonicalHashString(result.finalState);
    if (lastNewHash && lastNewHash === loopbackHash) {
      loopbackOk++;
    } else {
      loopbackNg++;
      console.warn(`[LOOPBACK NG] id=${row.id} lastNewHash=${lastNewHash ?? 'none'} loopbackHash=${loopbackHash}`);
    }

    // 最初の 3 件サンプル出力
    if (samples.length < 3) {
      const before = oldHistory.slice(0, 5).map(m => m.canonical_hash ?? null);
      const after  = result.newHistory.slice(0, 5).map(m => m.canonical_hash ?? null);
      samples.push({
        id: row.id,
        mode: row.mode,
        moves: oldHistory.length,
        created_at: row.created_at,
        hash_changed: changed,
        symmetry_changed: symChanged,
        medium_pattern_changed: medChanged,
        loopback: lastNewHash === loopbackHash ? 'ok' : 'ng',
        before_hash_first5: before,
        after_hash_first5: after,
      });
    }
  }

  // 4. サマリ出力
  console.log('\n=== DRY-RUN サマリ ===');
  console.log(JSON.stringify({
    total: targets.length,
    replay_ok:     replayOk,
    replay_failed: replayFailed,
    games_with_hash_change:    gamesWithHashChange,
    games_without_hash_change: gamesWithoutHashChange,
    total_hash_records_changed:   totalHashChanged,
    total_hash_records_unchanged: totalHashUnchanged,
    total_symmetry_changed:       totalSymmetryChanged,
    total_medium_pattern_changed: totalMediumChanged,
    loopback_ok: loopbackOk,
    loopback_ng: loopbackNg,
  }, null, 2));

  console.log('\n=== サンプル（最初の 3 件） ===');
  for (const s of samples) {
    console.log(JSON.stringify(s, null, 2));
  }

  console.log('\n=== GO / NO-GO 判定基準 ===');
  if (loopbackNg > 0) {
    console.log('❌ NO-GO: loopback_ng > 0 → リプレイ実装に問題あり、本実行禁止');
  } else if (replayFailed > 0) {
    console.log(`⚠️  WARNING: replay_failed = ${replayFailed} — 原因確認推奨`);
  } else if (gamesWithoutHashChange > 0) {
    console.log(`⚠️  WARNING: hash が変わらないゲームが ${gamesWithoutHashChange} 件 — zobrist 修正の効果を確認推奨`);
  } else {
    console.log('✅ GO 条件を満たしています: loopback_ok = 全件, replay_failed = 0');
  }

  console.log('\n[DRY-RUN 完了] DBへの変更はありません。');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
