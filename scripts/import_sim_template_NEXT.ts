/**
 * import_sim_template_NEXT.ts
 *
 * 次回以降の sim 追加用テンプレート（Phase B 廃止版）
 *
 * ─────────────────────────────────────────────────
 * 変更履歴:
 *   2026-05-14: Phase B（sim_position_stats upsert）を廃止
 *     理由: sim_position_stats を Supabase から撤去（1.80GB 削減）
 *           容量対効果が極めて低いため（total>=100 は全体の 0.0013%）
 *             以降は sim_medium_pattern_stats のみを sim fallback として使用
 * ─────────────────────────────────────────────────
 *
 * 実行順序:
 *   Step 1: このスクリプト（Phase A のみ）
 *     nohup npx vite-node scripts/import_sim_template_NEXT.ts > /tmp/sXX_import.log 2>&1 &
 *   Step 2: Phase C（medium_pattern_stats upsert）を別途実行
 *     npx vite-node scripts/phase_c_med_sXX.ts
 *
 * Phase B は実行しない（sim_position_stats テーブルは存在しない）
 *
 * 制約:
 *   - match_logs / position_stats / medium_pattern_stats（実戦）への書き込み禁止
 *   - sim_position_stats への書き込み禁止（テーブル削除済み）
 *   - sim_match_logs は削除しない
 */

import * as fs from 'fs';
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

// ─── ★ 次回実行時に変更する箇所 ──────────────────────────────────────────────
const SIM_FILE_PATH      = '/Users/nt/Desktop/Claude_Cowork/sim_easy/sim_easy_vs_easy_YYYYMMDD.md'; // ★
const SIM_BATCH_ID       = 'easy_YYYYMMDD_0XX';   // ★
const SIM_POLICY         = 'easy_vs_easy';
const SIM_VERSION        = '1.0.0';
const ENGINE_VERSION     = '1.0.0';
const RULES_VERSION      = '1.1.0';
const GENERATED_AT       = 'YYYY-MM-DDT00:00:00Z'; // ★
const EXPECTED_GAME_COUNT = 0;                       // ★ 局数を入れる
// ──────────────────────────────────────────────────────────────────────────────

const INSERT_BATCH = 5;
const MAX_RETRY    = 3;

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── 型定義 ──────────────────────────────────────────────────────────────────
interface RawMove {
  type: string;
  player: string;
  [key: string]: unknown;
}
interface ParsedGame { moves: RawMove[]; winner: string | null; }
interface ExtMoveRecord extends MoveRecord {
  canonical_hash?: string;
  medium_pattern_id?: string;
}

// ─── パース（import_sim_easy_s15.ts から引き継ぎ）────────────────────────────
// NOTE: md原本のフォーマットに合わせて実装してください
// 以下は s15 のパース関数をそのままコピーしてください
// （変更不要: rawToRecord / replayGame / parseSimFile）
// ...（省略: import_sim_easy_s15.ts の同名関数をコピー）

// ─── メイン ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== sim import（Phase A のみ / Phase B 廃止版）===\n');
  console.log(`batch_id     : ${SIM_BATCH_ID}`);
  console.log(`source file  : ${SIM_FILE_PATH}`);
  console.log(`期待局数     : ${EXPECTED_GAME_COUNT}`);
  console.log('Phase B      : 廃止（sim_position_stats テーブル削除済み）\n');

  // 実戦テーブル事前確認
  const {count: ml0} = await supabase.from('match_logs').select('*',{count:'exact',head:true});
  const {count: ps0} = await supabase.from('position_stats').select('*',{count:'exact',head:true});
  console.log(`[事前] match_logs: ${ml0} / position_stats: ${ps0}（変更しない）\n`);

  if (!fs.existsSync(SIM_FILE_PATH)) { console.error('ERROR: file not found'); process.exit(1); }
  const content = fs.readFileSync(SIM_FILE_PATH, 'utf-8');
  console.log(`ファイル読込: ${content.length.toLocaleString()} bytes`);

  // TODO: parseSimFile / rawToRecord / replayGame 関数をここに配置

  // ─── Phase A: sim_match_logs INSERT ──────────────────────────────────────
  console.log('--- Phase A: sim_match_logs INSERT ---');

  const {count: existCount} = await supabase.from('sim_match_logs')
    .select('*',{count:'exact',head:true}).eq('sim_batch_id', SIM_BATCH_ID);
  const exist = existCount ?? 0;

  if (exist >= EXPECTED_GAME_COUNT) {
    console.log(`Phase A スキップ: ${SIM_BATCH_ID} 既に ${exist} 件\n`);
  } else {
    if (exist > 0) {
      console.log(`[INFO] 不完全データ ${exist} 件を削除して再INSERT`);
      const {error: de} = await supabase.from('sim_match_logs').delete().eq('sim_batch_id', SIM_BATCH_ID);
      if (de) { console.error('削除エラー:', de.message); process.exit(1); }
    }

    // TODO: ここに games の取得・ループ・INSERT 処理を追加
    // import_sim_easy_s15.ts の Phase A ブロック（L158〜L218）をコピー
  }

  // ─── Phase B: 廃止 ───────────────────────────────────────────────────────
  // sim_position_stats テーブルは 2026-05-14 に Supabase から削除済み。
  // Phase B（batch_upsert_sim_position_stats RPC）は実行しない。

  // ─── 件数確認 ────────────────────────────────────────────────────────────
  console.log('\n=== 取込結果 ===');
  const {count: batchCnt} = await supabase.from('sim_match_logs')
    .select('*',{count:'exact',head:true}).eq('sim_batch_id', SIM_BATCH_ID);
  const {count: totalCnt} = await supabase.from('sim_match_logs')
    .select('*',{count:'exact',head:true});
  console.log(`sim_match_logs (${SIM_BATCH_ID}): ${batchCnt}`);
  console.log(`sim_match_logs 総件数: ${totalCnt}`);

  // 実戦汚染チェック
  const {count: ml1} = await supabase.from('match_logs').select('*',{count:'exact',head:true});
  const {count: ps1} = await supabase.from('position_stats').select('*',{count:'exact',head:true});
  console.log(`match_logs: ${ml1} (${ml0===ml1?'✅ 変化なし':'❌ 汚染'})`);
  console.log(`position_stats: ${ps1} (${ps0===ps1?'✅ 変化なし':'❌ 汚染'})`);
  console.log('\n→ 次: phase_c_med_sXX.ts を実行して sim_medium_pattern_stats を更新してください');
  console.log('=== Phase A 完了 ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
