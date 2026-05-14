/**
 * verify_position_only_postmortem.ts
 *
 * 対局 113969e1-929f-48c2-92f1-d1cff4e2bff4 の52手を対象に、
 * sim_position_only fallback chain の効果を検証する。
 *
 * 処理内容:
 * 1. 対局の full_record から各手の medium_pattern_id を取得
 * 2. position_only_id = medium_pattern_id.split(':')[0] を計算
 * 3. sim_position_only_stats から total / win_rate_black を取得
 * 4. 現行 fallback chain vs 新 fallback chain での winRateSource 分布を比較出力
 * 5. M47〜52 の WP 変化を確認
 *
 * 注意: sim_position_only_stats テーブルが Supabase に存在することが前提。
 *       テーブルがない場合は、まず以下を実行してください:
 *   1. Supabase SQL Editor で supabase/migrations/sim_position_only_stats.sql を実行
 *   2. npx vite-node scripts/backfill_sim_position_only_stats.ts を実行
 *
 * 実行コマンド:
 *   npx vite-node scripts/verify_position_only_postmortem.ts
 */

try {
  const { readFileSync } = await import('fs');
  const { resolve } = await import('path');
  const lines = readFileSync(resolve(process.cwd(), '.env'), 'utf-8').split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx < 0) continue;
    const key = t.slice(0, idx).trim();
    const val = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch {}

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('ERROR: env missing'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const TARGET_GAME_ID = '113969e1-929f-48c2-92f1-d1cff4e2bff4';
const SIM_POLICY     = 'easy_vs_easy';
const POS_ONLY_THRESHOLD = 100;
const SIM_MED_THRESHOLD  = 30;
const POS_ONLY_BLEND     = 0.1;
const SIM_MED_BLEND      = 0.2;

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

async function main() {
  log(`=== verify_position_only_postmortem.ts ===`);
  log(`対象対局: ${TARGET_GAME_ID}`);

  // ─── Step 1: sim_position_only_stats テーブル確認 ────────────────────────
  const { error: tableCheckError } = await supabase
    .from('sim_position_only_stats')
    .select('position_only_id')
    .limit(1);

  if (tableCheckError) {
    log(`ERROR: sim_position_only_stats テーブルが存在しないか、アクセスできません。`);
    log(`  詳細: ${tableCheckError.message}`);
    log(`\n【必要な手順】`);
    log(`  1. Supabase SQL Editor で以下を実行:`);
    log(`     supabase/migrations/sim_position_only_stats.sql`);
    log(`  2. バックフィルを実行:`);
    log(`     npx vite-node scripts/backfill_sim_position_only_stats.ts`);
    log(`  3. 再度このスクリプトを実行:`);
    log(`     npx vite-node scripts/verify_position_only_postmortem.ts`);
    process.exit(1);
  }
  log(`sim_position_only_stats テーブル: ✅ 存在確認`);

  // ─── Step 2: 対局の full_record を取得 ───────────────────────────────────
  log(`\n--- Step 2: 対局データ取得 ---`);
  const { data: gameData, error: gameError } = await supabase
    .from('sim_match_logs')
    .select('winner, full_record')
    .eq('game_id', TARGET_GAME_ID)
    .single();

  if (gameError || !gameData) {
    // sim_match_logs に game_id がない場合は match_logs を試みる
    log(`sim_match_logs に見つからないため match_logs を検索...`);
    const { data: matchData, error: matchError } = await supabase
      .from('match_logs')
      .select('winner, full_record')
      .eq('id', TARGET_GAME_ID)
      .single();

    if (matchError || !matchData) {
      log(`ERROR: 対局が見つかりません。`);
      log(`  sim_match_logs エラー: ${gameError?.message}`);
      log(`  match_logs エラー: ${matchError?.message}`);
      process.exit(1);
    }

    log(`match_logs から取得成功。`);
    await analyzeGame(matchData as { winner: string; full_record: any[] });
    return;
  }

  await analyzeGame(gameData as { winner: string; full_record: any[] });
}

async function analyzeGame(gameData: { winner: string; full_record: any[] }) {
  const winner = gameData.winner;
  const fullRecord = gameData.full_record;
  log(`winner: ${winner} / 手数: ${fullRecord.length}`);

  // ─── Step 3: medium_pattern_id / position_only_id の計算 ─────────────────
  log(`\n--- Step 3: medium_pattern_id / position_only_id 計算 ---`);

  const moves = fullRecord.map((step: any) => {
    const mediumPatternId = step.medium_pattern_id as string | undefined;
    const colonIdx = mediumPatternId?.indexOf(':') ?? -1;
    const positionOnlyId = mediumPatternId && colonIdx >= 0
      ? mediumPatternId.slice(0, colonIdx)
      : mediumPatternId;
    return {
      moveNumber: step.moveNumber as number,
      player: step.player as string,
      mediumPatternId,
      positionOnlyId,
    };
  });

  // ─── Step 4: sim_position_only_stats から一括取得 ─────────────────────────
  log(`\n--- Step 4: sim_position_only_stats 取得 ---`);
  const uniquePosIds = [...new Set(moves.map(m => m.positionOnlyId).filter(Boolean))] as string[];

  const { data: posOnlyData, error: posOnlyError } = await supabase
    .from('sim_position_only_stats')
    .select('position_only_id, wins_black, wins_white, draws, total')
    .in('position_only_id', uniquePosIds)
    .eq('sim_policy', SIM_POLICY);

  if (posOnlyError) {
    log(`ERROR: sim_position_only_stats 取得失敗: ${posOnlyError.message}`);
    process.exit(1);
  }

  const posOnlyMap = new Map<string, { total: number; win_rate_black: number }>();
  for (const row of (posOnlyData ?? []) as any[]) {
    posOnlyMap.set(row.position_only_id, {
      total: row.total,
      win_rate_black: row.total > 0 ? row.wins_black / row.total : 0.5,
    });
  }
  log(`sim_position_only_stats: ${posOnlyMap.size} / ${uniquePosIds.length} 件取得`);

  // sim_medium_pattern_stats も取得（比較用）
  const uniqueMedIds = [...new Set(moves.map(m => m.mediumPatternId).filter(Boolean))] as string[];
  const { data: simMedData } = await supabase
    .from('sim_medium_pattern_stats')
    .select('medium_pattern_id, total, wins_black, wins_white, draws')
    .in('medium_pattern_id', uniqueMedIds)
    .eq('sim_policy', SIM_POLICY)
    .gte('total', SIM_MED_THRESHOLD);

  const simMedMap = new Map<string, { total: number; win_rate_black: number }>();
  for (const row of (simMedData ?? []) as any[]) {
    simMedMap.set(row.medium_pattern_id, {
      total: row.total,
      win_rate_black: row.total > 0 ? row.wins_black / row.total : 0.5,
    });
  }
  log(`sim_medium_pattern_stats (>=${SIM_MED_THRESHOLD}): ${simMedMap.size} / ${uniqueMedIds.length} 件取得`);

  // ─── Step 5: fallback chain 比較 ──────────────────────────────────────────
  log(`\n--- Step 5: fallback chain 比較 ---`);
  log(`${'M'.padEnd(4)} ${'Player'.padEnd(7)} ${'旧Source'.padEnd(20)} ${'新Source'.padEnd(22)} ${'PosOnly_total'.padEnd(14)} ${'PosOnly_WP'.padEnd(12)}`);
  log(`${'-'.repeat(85)}`);

  const sourceCountOld: Record<string, number> = {};
  const sourceCountNew: Record<string, number> = {};

  // M47〜52 の詳細を記録
  const lateGameDetails: string[] = [];

  for (const move of moves) {
    const mn = move.moveNumber;
    const posId = move.positionOnlyId;
    const medId = move.mediumPatternId;

    // 旧 fallback chain (sim_medium_pattern で止まる)
    const oldSource = simMedMap.has(medId ?? '') ? 'sim_medium_pattern' : 'static';

    // 新 fallback chain (sim_position_only を追加)
    let newSource = oldSource;
    if (newSource === 'static' && posId) {
      const posOnlyStat = posOnlyMap.get(posId);
      if (posOnlyStat && posOnlyStat.total >= POS_ONLY_THRESHOLD) {
        newSource = 'sim_position_only';
      }
    }

    const posOnlyStat = posId ? posOnlyMap.get(posId) : undefined;
    const posOnlyTotal = posOnlyStat?.total ?? 0;
    const posOnlyWP = posOnlyStat?.win_rate_black ?? 0;

    sourceCountOld[oldSource] = (sourceCountOld[oldSource] ?? 0) + 1;
    sourceCountNew[newSource] = (sourceCountNew[newSource] ?? 0) + 1;

    const changed = oldSource !== newSource;
    const marker = changed ? ' ← NEW' : '';
    const line = `M${String(mn).padEnd(3)} ${move.player.padEnd(7)} ${oldSource.padEnd(20)} ${(newSource + marker).padEnd(22)} ${String(posOnlyTotal).padEnd(14)} ${posOnlyWP.toFixed(4)}`;
    log(line);

    if (mn >= 47) {
      lateGameDetails.push(line);
    }
  }

  // ─── Step 6: 分布サマリー ─────────────────────────────────────────────────
  log(`\n--- Step 6: winRateSource 分布 ---`);
  log(`【旧 fallback chain (sim_medium_pattern まで)】`);
  for (const [src, cnt] of Object.entries(sourceCountOld).sort()) {
    log(`  ${src}: ${cnt} 手`);
  }
  log(`\n【新 fallback chain (sim_position_only 追加後)】`);
  for (const [src, cnt] of Object.entries(sourceCountNew).sort()) {
    log(`  ${src}: ${cnt} 手`);
  }

  const staticOld = sourceCountOld['static'] ?? 0;
  const staticNew = sourceCountNew['static'] ?? 0;
  const improved = staticOld - staticNew;
  log(`\nstatic → sim_position_only に改善: ${improved} 手`);

  // ─── Step 7: M47〜52 の WP 変化 ──────────────────────────────────────────
  log(`\n--- Step 7: M47〜52 の詳細 ---`);
  for (const line of lateGameDetails) {
    log(line);
  }

  log(`\n=== 検証完了 ===`);
  log(`\n【Naoya が実施すべき手順】（未実施の場合）`);
  log(`  1. Supabase SQL Editor で実行:`);
  log(`     supabase/migrations/sim_position_only_stats.sql`);
  log(`  2. バックフィル実行:`);
  log(`     nohup npx vite-node scripts/backfill_sim_position_only_stats.ts > /tmp/backfill_position_only.log 2>&1 &`);
  log(`     tail -f /tmp/backfill_position_only.log`);
  log(`  3. 検証再実行:`);
  log(`     npx vite-node scripts/verify_position_only_postmortem.ts`);
}

main().catch(e => { log(`FATAL: ${e}`); process.exit(1); });
