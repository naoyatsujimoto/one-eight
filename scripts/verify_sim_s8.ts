/**
 * verify_sim_s8.ts — batch_008 取り込み結果検証スクリプト
 *
 * 実行方法:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   npx vite-node scripts/verify_sim_s8.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: VITE_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const SIM_BATCH_ID = 'easy_20260508_008';
const SIM_POLICY = 'easy_vs_easy';

async function main() {
  console.log('=== verify_sim_s8.ts ===\n');

  // ─── 基本件数 ────────────────────────────────────────────────────────────────

  console.log('--- 基本件数 ---');

  const { count: totalLogCount } = await supabase
    .from('sim_match_logs')
    .select('*', { count: 'exact', head: true });
  console.log(`sim_match_logs 総件数: ${totalLogCount} (目標: 15,000)`);

  const { count: batch008Count } = await supabase
    .from('sim_match_logs')
    .select('*', { count: 'exact', head: true })
    .eq('sim_batch_id', SIM_BATCH_ID);
  console.log(`sim_match_logs batch_008 件数: ${batch008Count} (目標: 5,000)`);

  const { count: simPosCount } = await supabase
    .from('sim_position_stats')
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', SIM_POLICY);
  console.log(`sim_position_stats 総行数 (${SIM_POLICY}): ${simPosCount}`);

  const { count: medCount, error: medErr } = await supabase
    .from('sim_medium_pattern_stats')
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', SIM_POLICY);
  if (medErr) {
    console.log(`sim_medium_pattern_stats: テーブル不在またはエラー (${medErr.message})`);
  } else {
    console.log(`sim_medium_pattern_stats 総行数 (${SIM_POLICY}): ${medCount}`);
  }

  // 実戦テーブル汚染チェック
  const { count: mlCount } = await supabase
    .from('match_logs')
    .select('*', { count: 'exact', head: true });
  console.log(`match_logs: ${mlCount} 件 (変化なし確認)`);

  const { count: psCount } = await supabase
    .from('position_stats')
    .select('*', { count: 'exact', head: true });
  console.log(`position_stats: ${psCount} 件 (変化なし確認)\n`);

  // ─── sim_position_stats 統計 ────────────────────────────────────────────────

  console.log('--- sim_position_stats 統計 (easy_vs_easy) ---');

  const { data: posStatsData, error: posStatsErr } = await supabase.rpc('exec_sql' as string, {
    sql: `
      SELECT
        max(total) as max_total,
        count(*) filter (where total >= 30) as ge30,
        count(*) filter (where total >= 50) as ge50,
        count(*) filter (where total >= 100) as ge100,
        count(*) filter (where total >= 200) as ge200
      FROM sim_position_stats
      WHERE sim_policy = 'easy_vs_easy'
    `
  });

  // RPCが使えない場合は直接クエリ
  if (posStatsErr) {
    // 代替: 集計値をサンプリング
    const { data: sampleData } = await supabase
      .from('sim_position_stats')
      .select('total')
      .eq('sim_policy', SIM_POLICY)
      .order('total', { ascending: false })
      .limit(10000);

    if (sampleData) {
      const totals = sampleData.map(r => r.total as number);
      const maxTotal = Math.max(...totals);
      const ge30 = totals.filter(t => t >= 30).length;
      const ge50 = totals.filter(t => t >= 50).length;
      const ge100 = totals.filter(t => t >= 100).length;
      const ge200 = totals.filter(t => t >= 200).length;
      console.log(`  ※ 上位 10,000 件のサンプル統計 (全体の一部)`);
      console.log(`  max_total: ${maxTotal}`);
      console.log(`  total >= 30: ${ge30}`);
      console.log(`  total >= 50: ${ge50}`);
      console.log(`  total >= 100: ${ge100}`);
      console.log(`  total >= 200: ${ge200}`);
    }
  } else if (posStatsData) {
    const row = Array.isArray(posStatsData) ? posStatsData[0] : posStatsData;
    console.log(`  max_total: ${row.max_total}`);
    console.log(`  total >= 30: ${row.ge30}`);
    console.log(`  total >= 50: ${row.ge50}`);
    console.log(`  total >= 100: ${row.ge100}`);
    console.log(`  total >= 200: ${row.ge200}`);
  }

  // ─── sim_medium_pattern_stats 統計 ──────────────────────────────────────────

  if (!medErr) {
    console.log('\n--- sim_medium_pattern_stats 統計 (easy_vs_easy) ---');

    const { data: medSample } = await supabase
      .from('sim_medium_pattern_stats')
      .select('total')
      .eq('sim_policy', SIM_POLICY)
      .order('total', { ascending: false })
      .limit(50000);

    if (medSample) {
      const totals = medSample.map(r => r.total as number);
      const maxTotal = totals.length > 0 ? Math.max(...totals) : 0;
      const ge30 = totals.filter(t => t >= 30).length;
      const ge50 = totals.filter(t => t >= 50).length;
      const ge100 = totals.filter(t => t >= 100).length;
      const ge200 = totals.filter(t => t >= 200).length;
      const ge500 = totals.filter(t => t >= 500).length;
      console.log(`  ※ 上位 50,000 件のサンプル統計`);
      console.log(`  max_total: ${maxTotal}`);
      console.log(`  total >= 30: ${ge30}`);
      console.log(`  total >= 50: ${ge50}`);
      console.log(`  total >= 100: ${ge100}`);
      console.log(`  total >= 200: ${ge200}`);
      console.log(`  total >= 500: ${ge500}`);
    }
  }

  // ─── medium_pattern カバレッジ（full_record ベース）────────────────────────

  console.log('\n--- medium_pattern 深度別カバレッジ分析 (full_record ベース) ---');
  console.log('batch_008 の全レコードを取得してカバレッジ集計中...');

  // medium_pattern_id の moveNumber 別集計
  // batch_008 から full_record をページング取得
  type MoveEntry = { moveNumber: number; medium_pattern_id?: string };
  const pidByMove: Map<number, Map<string, number>> = new Map();

  let offset = 0;
  const PAGE_SIZE = 500;
  let totalGames = 0;

  while (true) {
    const { data, error } = await supabase
      .from('sim_match_logs')
      .select('winner, full_record')
      .eq('sim_batch_id', SIM_BATCH_ID)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error(`full_record 取得エラー: ${error.message}`);
      break;
    }
    if (!data || data.length === 0) break;

    totalGames += data.length;
    process.stdout.write(`  取得中: ${totalGames} 件\r`);

    for (const row of data) {
      const fullRecord = row.full_record as MoveEntry[];
      if (!fullRecord) continue;

      for (const move of fullRecord) {
        if (!move.medium_pattern_id) continue;
        const mn = move.moveNumber;
        if (!pidByMove.has(mn)) pidByMove.set(mn, new Map());
        const map = pidByMove.get(mn)!;
        map.set(move.medium_pattern_id, (map.get(move.medium_pattern_id) ?? 0) + 1);
      }
    }

    offset += PAGE_SIZE;
    if (data.length < PAGE_SIZE) break;
  }

  console.log(`\n取得完了: ${totalGames} 件\n`);

  // 帯別集計
  const bands = [
    { label: 'M1', min: 1, max: 1 },
    { label: 'M2〜3', min: 2, max: 3 },
    { label: 'M4〜8', min: 4, max: 8 },
    { label: 'M9〜22', min: 9, max: 22 },
    { label: 'M23以降', min: 23, max: Infinity },
  ];

  console.log('| 帯 | total>=30 | total>=50 | total>=100 | max_moveNumber |');
  console.log('|----|-----------|-----------|------------|----------------|');

  for (const band of bands) {
    // 各帯の medium_pattern_id ごとの合計カウントを集計
    const bandMap: Map<string, number> = new Map();

    for (const [mn, map] of pidByMove.entries()) {
      if (mn >= band.min && mn <= band.max) {
        for (const [pid, cnt] of map.entries()) {
          bandMap.set(pid, (bandMap.get(pid) ?? 0) + cnt);
        }
      }
    }

    const counts = Array.from(bandMap.values());
    const ge30 = counts.filter(c => c >= 30).length;
    const ge50 = counts.filter(c => c >= 50).length;
    const ge100 = counts.filter(c => c >= 100).length;

    // max moveNumber in band with total>=30
    let maxMoveNumber = 0;
    for (const [mn, map] of pidByMove.entries()) {
      if (mn >= band.min && mn <= band.max) {
        for (const [, cnt] of map.entries()) {
          if (cnt >= 30 && mn > maxMoveNumber) maxMoveNumber = mn;
        }
      }
    }

    console.log(`| ${band.label.padEnd(6)} | ${String(ge30).padEnd(9)} | ${String(ge50).padEnd(9)} | ${String(ge100).padEnd(10)} | ${maxMoveNumber > 0 ? maxMoveNumber : '-'} |`);
  }

  // ─── 全体サマリー ───────────────────────────────────────────────────────────

  console.log('\n--- 全 moveNumber サマリー (medium_pattern_id 集計) ---');
  // 全 pid の合計カウント
  const allPidMap: Map<string, number> = new Map();
  for (const map of pidByMove.values()) {
    for (const [pid, cnt] of map.entries()) {
      allPidMap.set(pid, (allPidMap.get(pid) ?? 0) + cnt);
    }
  }

  const allCounts = Array.from(allPidMap.values());
  const maxTotal = allCounts.length > 0 ? Math.max(...allCounts) : 0;
  const ge30_all = allCounts.filter(c => c >= 30).length;
  const ge50_all = allCounts.filter(c => c >= 50).length;
  const ge100_all = allCounts.filter(c => c >= 100).length;
  const ge200_all = allCounts.filter(c => c >= 200).length;
  const ge500_all = allCounts.filter(c => c >= 500).length;

  // max moveNumber for each threshold
  let maxMnGe30 = 0, maxMnGe50 = 0, maxMnGe100 = 0;
  for (const [mn, map] of pidByMove.entries()) {
    for (const [, cnt] of map.entries()) {
      if (cnt >= 30 && mn > maxMnGe30) maxMnGe30 = mn;
      if (cnt >= 50 && mn > maxMnGe50) maxMnGe50 = mn;
      if (cnt >= 100 && mn > maxMnGe100) maxMnGe100 = mn;
    }
  }

  console.log(`  medium_pattern 総種類数: ${allPidMap.size}`);
  console.log(`  max_total: ${maxTotal}`);
  console.log(`  total >= 30: ${ge30_all} (max moveNumber: ${maxMnGe30 || '-'})`);
  console.log(`  total >= 50: ${ge50_all} (max moveNumber: ${maxMnGe50 || '-'})`);
  console.log(`  total >= 100: ${ge100_all} (max moveNumber: ${maxMnGe100 || '-'})`);
  console.log(`  total >= 200: ${ge200_all}`);
  console.log(`  total >= 500: ${ge500_all}`);

  console.log('\n=== verify_sim_s8.ts 完了 ===');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
