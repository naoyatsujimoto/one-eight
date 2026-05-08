/**
 * import_sim_easy_s4.ts
 *
 * sim_easy_vs_easy_20260508c.md をパースして sim_match_logs / sim_position_stats に取り込む。
 *
 * 実行方法:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   npx vite-node scripts/import_sim_easy_s4.ts
 *
 * 前提:
 *   - Supabase SQL Editor で supabase/migrations/sim_tables_s1.sql を実行済み
 *   - .env に VITE_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が設定済み
 *
 * 制約:
 *   - match_logs / position_stats への書き込みは一切行わない
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
import type { GameState, MoveRecord, GateId, PositionId } from '../src/game/types';

// ─── 環境変数 ────────────────────────────────────────────────────────────────

// vite-node は .env を自動読み込みする
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: VITE_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── sim メタデータ ───────────────────────────────────────────────────────────

const SIM_FILE_PATH = '/Users/nt/Desktop/Claude_Cowork/sim_easy/sim_easy_vs_easy_20260508c.md';
const SIM_BATCH_ID = 'easy_20260508_004';
const SIM_POLICY = 'easy_vs_easy';
const SIM_VERSION = '1.0.0';
const ENGINE_VERSION = '1.0.0';
const RULES_VERSION = '1.1.0';
const GENERATED_AT = '2026-05-08T00:00:00Z'; // s4

// ─── 棋譜パーサー ─────────────────────────────────────────────────────────────

type ParsedGame = {
  gameIndex: number;
  batchNumber: number;
  winner: string;
  moveCount: number;
  moves: RawMove[];
};

type RawMove = {
  moveNumber: number;
  positionId: string;
  buildType: 's' | 'm' | 'q';
  gates: number[];
};

/**
 * 1行の手記法を解析する
 * 例: "M1:B,s(3,6)" → { moveNumber: 1, positionId: 'B', buildType: 's', gates: [3, 6] }
 */
function parseMoveToken(token: string): RawMove | null {
  // M{n}:{Pos},{type}({gates...})
  const match = token.match(/^M(\d+):([A-M]),([smq])\(([^)]*)\)$/);
  if (!match) {
    return null;
  }
  const moveNumber = parseInt(match[1], 10);
  const positionId = match[2];
  const buildType = match[3] as 's' | 'm' | 'q';
  const gatesStr = match[4];
  const gates = gatesStr
    .split(',')
    .map(g => g.trim())
    .filter(g => g !== '')
    .map(g => parseInt(g, 10));

  return { moveNumber, positionId, buildType, gates };
}

/**
 * sim棋譜ファイルをパースして ParsedGame[] を返す
 */
function parseSimFile(content: string): ParsedGame[] {
  const games: ParsedGame[] = [];
  const lines = content.split('\n');

  let currentGame: ParsedGame | null = null;

  for (const line of lines) {
    // ゲームヘッダー行: "### Game {n} (Batch {b})"
    const gameHeaderMatch = line.match(/^### Game (\d+) \(Batch (\d+)\)/);
    if (gameHeaderMatch) {
      if (currentGame) {
        games.push(currentGame);
      }
      currentGame = {
        gameIndex: parseInt(gameHeaderMatch[1], 10),
        batchNumber: parseInt(gameHeaderMatch[2], 10),
        winner: '',
        moveCount: 0,
        moves: [],
      };
      continue;
    }

    if (!currentGame) continue;

    // 結果行: "**勝者**: black  **手数**: 57  ..."
    const resultMatch = line.match(/\*\*勝者\*\*:\s*(\w+)\s+\*\*手数\*\*:\s*(\d+)/);
    if (resultMatch) {
      currentGame.winner = resultMatch[1]; // 'black' / 'white' / 'draw'
      currentGame.moveCount = parseInt(resultMatch[2], 10);
      continue;
    }

    // 手の行: "  M1:B,s(3,6)  M2:F,s(8,12)  ..."
    if (line.match(/^\s+M\d+:/)) {
      const tokens = line.trim().split(/\s+/);
      for (const token of tokens) {
        const move = parseMoveToken(token);
        if (move) {
          currentGame.moves.push(move);
        }
      }
    }
  }

  // 最後のゲームを追加
  if (currentGame) {
    games.push(currentGame);
  }

  return games;
}

/**
 * RawMove を MoveRecord に変換（player は moveNumber の奇偶で判定）
 */
function rawMoveToMoveRecord(raw: RawMove): MoveRecord {
  const player = raw.moveNumber % 2 === 1 ? 'black' : 'white';

  let build: MoveRecord['build'];

  switch (raw.buildType) {
    case 'm': {
      // massive: m(gate)
      const gate = raw.gates.length > 0 ? (raw.gates[0] as GateId) : null;
      build = { type: 'massive', gate, placed: 1 };
      break;
    }
    case 's': {
      // selective: s(g1,g2) → placed=2 / s(g1) → placed=1
      if (raw.gates.length >= 2) {
        build = {
          type: 'selective',
          gates: [raw.gates[0] as GateId, raw.gates[1] as GateId],
          placed: 2,
        };
      } else if (raw.gates.length === 1) {
        build = {
          type: 'selective',
          gates: [raw.gates[0] as GateId, 0],
          placed: 1,
        };
      } else {
        build = { type: 'selective', gates: [0, 0], placed: 0 };
      }
      break;
    }
    case 'q': {
      // quad: q(g1,g2,...) → placed=count
      build = {
        type: 'quad',
        placedGateIds: raw.gates as GateId[],
        placed: raw.gates.length,
      };
      break;
    }
    default: {
      build = { type: 'no-build' };
      break;
    }
  }

  return {
    moveNumber: raw.moveNumber,
    player,
    positioning: raw.positionId as PositionId,
    build,
  };
}

// ─── replayGame: canonical_hash を付与 ────────────────────────────────────────

function replayGame(history: MoveRecord[]): MoveRecord[] {
  let state: GameState = createInitialState();
  const result: MoveRecord[] = [];

  for (const record of history) {
    const { positioning, build } = record;

    // Step 1: ポジション選択
    if (positioning !== 'P') {
      state = selectPosition(state, positioning as PositionId);
    }

    // Step 2: ビルド
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
        nextState = state;
        break;
      }
    }

    // Step 3: canonical_hash を取得して MoveRecord にマージ
    const lastRecord = nextState.history[nextState.history.length - 1];
    if (lastRecord && lastRecord.moveNumber === record.moveNumber) {
      result.push({
        ...record,
        canonical_hash: lastRecord.canonical_hash,
      });
    } else {
      result.push(record);
    }

    state = nextState;
  }

  return result;
}

// ─── バッチ INSERT ─────────────────────────────────────────────────────────────

const INSERT_BATCH_SIZE = 10; // 一度に INSERT するゲーム数

async function insertSimMatchLogs(rows: object[]): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    const chunk = rows.slice(i, i + INSERT_BATCH_SIZE);
    const { error } = await supabase
      .from('sim_match_logs')
      .insert(chunk);
    if (error) {
      throw new Error(`sim_match_logs INSERT failed (offset ${i}): ${error.message}`);
    }
    process.stdout.write('.');
  }
  console.log('');
}

// ─── メイン処理 ───────────────────────────────────────────────────────────────

async function main() {
  console.log('=== import_sim_easy_s4.ts ===');
  console.log(`sim_batch_id: ${SIM_BATCH_ID}`);
  console.log(`sim_policy  : ${SIM_POLICY}`);
  console.log(`source file : ${SIM_FILE_PATH}\n`);

  // 1. ファイル読み込み
  if (!fs.existsSync(SIM_FILE_PATH)) {
    console.error(`ERROR: ファイルが見つかりません: ${SIM_FILE_PATH}`);
    process.exit(1);
  }
  const content = fs.readFileSync(SIM_FILE_PATH, 'utf-8');
  console.log(`ファイル読み込み完了: ${content.length.toLocaleString()} bytes`);

  // 2. パース
  console.log('パース中...');
  const games = parseSimFile(content);
  console.log(`パース完了: ${games.length} ゲーム\n`);

  if (games.length === 0) {
    console.error('ERROR: ゲームが1件もパースできませんでした');
    process.exit(1);
  }

  // 3. 既存バッチの確認
  const { count: existingCount } = await supabase
    .from('sim_match_logs')
    .select('*', { count: 'exact', head: true })
    .eq('sim_batch_id', SIM_BATCH_ID);

  if ((existingCount ?? 0) > 0) {
    console.error(`ERROR: sim_batch_id='${SIM_BATCH_ID}' は既に ${existingCount} 件存在します。`);
    console.error('再取り込みする場合は delete_sim_batch RPC で削除してから実行してください。');
    process.exit(1);
  }

  // 4. MoveRecord[] 変換 + canonical_hash 付与 + INSERT データ準備
  console.log('MoveRecord変換 + canonical_hash計算中...');
  const insertRows: object[] = [];
  let hashSuccessCount = 0;
  let hashFailCount = 0;
  let parseErrorCount = 0;

  let globalGameIndex = 0;
  for (const game of games) {
    globalGameIndex++;
    if (game.moves.length === 0) {
      console.warn(`[WARN] Game ${game.gameIndex}: 手がパースできませんでした`);
      parseErrorCount++;
      continue;
    }

    // RawMove → MoveRecord
    const moveRecords: MoveRecord[] = game.moves.map(rawMoveToMoveRecord);

    // canonical_hash 付与
    let replayedRecords: MoveRecord[];
    try {
      replayedRecords = replayGame(moveRecords);
    } catch (e) {
      console.warn(`[WARN] Game ${game.gameIndex}: replayGame失敗: ${e instanceof Error ? e.message : String(e)}`);
      replayedRecords = moveRecords;
      hashFailCount++;
    }

    const hashCount = replayedRecords.filter(m => m.canonical_hash).length;
    if (hashCount > 0) {
      hashSuccessCount++;
    } else {
      hashFailCount++;
    }

    const canonicalHashesComputed = hashCount > 0;

    insertRows.push({
      source: 'sim',
      sim_policy: SIM_POLICY,
      sim_batch_id: SIM_BATCH_ID,
      sim_version: SIM_VERSION,
      engine_version: ENGINE_VERSION,
      rules_version: RULES_VERSION,
      generated_at: GENERATED_AT,
      game_index: globalGameIndex,
      winner: game.winner || null,
      move_count: game.moveCount,
      full_record: replayedRecords,
      canonical_hashes_computed: canonicalHashesComputed,
    });
  }

  console.log(`変換完了: ${insertRows.length} 件 (hash付与成功: ${hashSuccessCount}, 失敗: ${hashFailCount}, parseError: ${parseErrorCount})\n`);

  // 5. sim_match_logs に INSERT
  console.log(`sim_match_logs に INSERT 中 (バッチサイズ: ${INSERT_BATCH_SIZE})...`);
  await insertSimMatchLogs(insertRows);
  console.log(`sim_match_logs INSERT 完了: ${insertRows.length} 件\n`);

  // 6. sim_position_stats に集計 INSERT
  console.log('sim_position_stats に集計中 (batch_upsert_sim_position_stats RPC)...');
  let statsSuccess = 0;
  let statsSkip = 0;
  let statsError = 0;

  for (const row of insertRows) {
    const r = row as {
      winner: string | null;
      full_record: MoveRecord[];
      canonical_hashes_computed: boolean;
    };

    if (!r.canonical_hashes_computed || !r.winner) {
      statsSkip++;
      continue;
    }

    const hashes = r.full_record
      .map(m => m.canonical_hash)
      .filter((h): h is string => !!h);

    if (hashes.length === 0) {
      statsSkip++;
      continue;
    }

    const { error: rpcErr } = await supabase.rpc('batch_upsert_sim_position_stats', {
      p_hashes: hashes,
      p_winner: r.winner,
      p_sim_policy: SIM_POLICY,
    });

    if (rpcErr) {
      console.error(`  RPC ERROR: ${rpcErr.message}`);
      statsError++;
    } else {
      statsSuccess++;
    }

    if (statsSuccess % 100 === 0) {
      process.stdout.write(`  ${statsSuccess}/${insertRows.length} 完了\r`);
    }
  }

  console.log(`\nsim_position_stats 集計完了: success=${statsSuccess} skip=${statsSkip} error=${statsError}\n`);

  // 7. 件数確認
  const { count: logCount } = await supabase
    .from('sim_match_logs')
    .select('*', { count: 'exact', head: true })
    .eq('sim_batch_id', SIM_BATCH_ID);

  const { count: statsCount } = await supabase
    .from('sim_position_stats')
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', SIM_POLICY);

  console.log('=== 取り込み結果 ===');
  console.log(`sim_match_logs (batch_id=${SIM_BATCH_ID}): ${logCount} 件`);
  console.log(`sim_position_stats (policy=${SIM_POLICY}): ${statsCount} 件\n`);

  // 8. match_logs / position_stats が汚染されていないか確認
  console.log('=== 実戦テーブル汚染チェック ===');
  const { count: mlCount, error: mlErr } = await supabase
    .from('match_logs')
    .select('*', { count: 'exact', head: true });
  const { count: psCount, error: psErr } = await supabase
    .from('position_stats')
    .select('*', { count: 'exact', head: true });

  if (mlErr) {
    console.warn(`match_logs チェックエラー: ${mlErr.message}`);
  } else {
    console.log(`match_logs: ${mlCount} 件 (変化なし確認)`);
  }
  if (psErr) {
    console.warn(`position_stats チェックエラー: ${psErr.message}`);
  } else {
    console.log(`position_stats: ${psCount} 件 (変化なし確認)`);
  }

  console.log('\n=== 完了 ===');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
