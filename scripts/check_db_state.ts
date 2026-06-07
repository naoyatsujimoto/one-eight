/**
 * check_db_state.ts — DB状態確認スクリプト
 *
 * 実行方法:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   npx vite-node scripts/check_db_state.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: VITE_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  console.log('=== DB State Check ===\n');

  // sim_match_logs 総件数
  const { count: simLogCount, error: simLogErr } = await supabase
    .from('sim_match_logs')
    .select('*', { count: 'exact', head: true });
  if (simLogErr) {
    console.error(`sim_match_logs エラー: ${simLogErr.message}`);
  } else {
    console.log(`sim_match_logs 総件数: ${simLogCount}`);
  }

  // sim_match_logs batch別件数
  const { data: batchData, error: batchErr } = await supabase
    .from('sim_match_logs')
    .select('sim_batch_id')
    .order('sim_batch_id');
  if (!batchErr && batchData) {
    const batchCounts: Record<string, number> = {};
    for (const row of batchData) {
      batchCounts[row.sim_batch_id] = (batchCounts[row.sim_batch_id] ?? 0) + 1;
    }
    console.log('  batch別件数:');
    for (const [bid, cnt] of Object.entries(batchCounts)) {
      console.log(`    ${bid}: ${cnt} 件`);
    }
  }

  // sim_position_stats 総行数
  const { count: simPosCount, error: simPosErr } = await supabase
    .from('sim_position_stats')
    .select('*', { count: 'exact', head: true });
  if (simPosErr) {
    console.error(`sim_position_stats エラー: ${simPosErr.message}`);
  } else {
    console.log(`\nsim_position_stats 総行数: ${simPosCount}`);
  }

  // sim_medium_pattern_stats テーブル存在確認
  console.log('\nsim_medium_pattern_stats テーブル確認...');
  const { count: medCount, error: medErr } = await supabase
    .from('sim_medium_pattern_stats')
    .select('*', { count: 'exact', head: true });
  if (medErr) {
    if (medErr.message.includes('relation') || medErr.message.includes('does not exist') || medErr.code === '42P01') {
      console.log('sim_medium_pattern_stats: テーブルが存在しません');
    } else {
      console.log(`sim_medium_pattern_stats エラー: ${medErr.message} (code: ${medErr.code})`);
    }
  } else {
    console.log(`sim_medium_pattern_stats 総行数: ${medCount}`);
  }

  // match_logs 件数（汚染チェック用ベースライン）
  const { count: mlCount, error: mlErr } = await supabase
    .from('match_logs')
    .select('*', { count: 'exact', head: true });
  if (mlErr) {
    console.warn(`\nmatch_logs チェックエラー: ${mlErr.message}`);
  } else {
    console.log(`\nmatch_logs 件数（ベースライン）: ${mlCount}`);
  }

  // position_stats 件数（汚染チェック用ベースライン）
  const { count: psCount, error: psErr } = await supabase
    .from('position_stats')
    .select('*', { count: 'exact', head: true });
  if (psErr) {
    console.warn(`position_stats チェックエラー: ${psErr.message}`);
  } else {
    console.log(`position_stats 件数（ベースライン）: ${psCount}`);
  }

  console.log('\n=== チェック完了 ===');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
