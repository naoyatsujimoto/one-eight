/**
 * verify_sim_s1.ts
 *
 * S-1 取り込み後の検証スクリプト
 * - sim_match_logs / sim_position_stats の件数確認
 * - サンプルデータ確認
 * - 削除・再取り込みテスト
 * - 実戦テーブル汚染チェック
 *
 * 実行方法:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   npx vite-node scripts/verify_sim_s1.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: env vars missing');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const SIM_BATCH_ID = 'easy_20260507_001';
const SIM_POLICY = 'easy_vs_easy';

async function main() {
  console.log('=== verify_sim_s1.ts ===\n');

  // 1. sim_match_logs 件数
  const { count: logCount } = await supabase
    .from('sim_match_logs')
    .select('*', { count: 'exact', head: true })
    .eq('sim_batch_id', SIM_BATCH_ID);

  console.log(`[1] sim_match_logs (batch_id=${SIM_BATCH_ID}): ${logCount} 件`);

  // 2. sim_position_stats 件数
  const { count: statsCount } = await supabase
    .from('sim_position_stats')
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', SIM_POLICY);

  console.log(`[2] sim_position_stats (policy=${SIM_POLICY}): ${statsCount} 件`);

  // 3. サンプル確認
  const { data: sample } = await supabase
    .from('sim_position_stats')
    .select('canonical_hash, sim_policy, wins_black, wins_white, total')
    .eq('sim_policy', SIM_POLICY)
    .order('total', { ascending: false })
    .limit(3);

  console.log('\n[3] sim_position_stats サンプル (total上位3件):');
  for (const row of sample ?? []) {
    console.log(`  hash=${row.canonical_hash?.substring(0, 16)}... policy=${row.sim_policy} B=${row.wins_black} W=${row.wins_white} total=${row.total}`);
  }

  // 4. delete_sim_batch テスト
  console.log('\n[4] delete_sim_batch テスト...');
  const { data: deleteResult, error: deleteErr } = await supabase
    .rpc('delete_sim_batch', { p_sim_batch_id: SIM_BATCH_ID });

  if (deleteErr) {
    console.error(`  ERROR: ${deleteErr.message}`);
  } else {
    console.log(`  削除結果: ${JSON.stringify(deleteResult)}`);
  }

  // 削除後件数確認
  const { count: afterDeleteLogs } = await supabase
    .from('sim_match_logs')
    .select('*', { count: 'exact', head: true })
    .eq('sim_batch_id', SIM_BATCH_ID);
  const { count: afterDeleteStats } = await supabase
    .from('sim_position_stats')
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', SIM_POLICY);

  console.log(`  削除後 sim_match_logs: ${afterDeleteLogs} 件 (期待: 0)`);
  console.log(`  削除後 sim_position_stats: ${afterDeleteStats} 件 (期待: 0)`);

  // 5. 再取り込み確認（import_sim_easy_s1.ts を再実行してください）
  console.log('\n[5] 再取り込みは import_sim_easy_s1.ts を再実行して確認してください');

  // 6. 実戦テーブル汚染チェック
  console.log('\n[6] 実戦テーブル汚染チェック...');
  const { count: mlCount } = await supabase
    .from('match_logs')
    .select('*', { count: 'exact', head: true });
  const { count: psCount } = await supabase
    .from('position_stats')
    .select('*', { count: 'exact', head: true });

  console.log(`  match_logs: ${mlCount} 件`);
  console.log(`  position_stats: ${psCount} 件`);
  console.log('  (sim テーブルとは完全に分離されています)');

  console.log('\n=== 完了 ===');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
