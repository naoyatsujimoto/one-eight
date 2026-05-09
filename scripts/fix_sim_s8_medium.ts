/**
 * fix_sim_s8_medium.ts
 *
 * import_sim_easy_s8.ts の Phase C 補完スクリプト。
 * batch_008 の full_record から medium_pattern_id を抽出し、
 * sim_medium_pattern_stats に upsert する。
 *
 * 実行方法:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   npx vite-node scripts/fix_sim_s8_medium.ts
 *
 * 前提:
 *   - Naoya が phase_sim_medium_pattern_upsert.sql を Supabase SQL Editor で実行済み
 *   - batch_008 の sim_match_logs が 5,000 件存在すること
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
  console.log('=== fix_sim_s8_medium.ts ===');
  console.log('Phase C 補完: sim_medium_pattern_stats upsert\n');

  // sim_medium_pattern_stats テーブル確認
  const { error: medCheckErr } = await supabase
    .from('sim_medium_pattern_stats')
    .select('*', { count: 'exact', head: true });

  if (medCheckErr && (
    medCheckErr.message.includes('relation') ||
    medCheckErr.message.includes('does not exist') ||
    (medCheckErr as { code?: string }).code === '42P01'
  )) {
    console.error('ERROR: sim_medium_pattern_stats テーブルが存在しません。');
    console.error('phase_medium_pattern.sql を Supabase SQL Editor で実行してください。');
    process.exit(1);
  }

  // RPC 存在確認
  const { error: rpcTestErr } = await supabase.rpc('batch_upsert_sim_medium_pattern_stats', {
    p_pattern_ids: [] as string[],
    p_winner: 'black',
    p_sim_policy: SIM_POLICY,
  });

  if (rpcTestErr && (
    rpcTestErr.message.includes('does not exist') ||
    rpcTestErr.message.includes('function') ||
    rpcTestErr.message.includes('Could not find')
  )) {
    console.error('ERROR: batch_upsert_sim_medium_pattern_stats RPC が存在しません。');
    console.error('phase_sim_medium_pattern_upsert.sql を Supabase SQL Editor で実行してください。');
    process.exit(1);
  }

  // batch_008 の全レコードをページング取得
  console.log(`batch_id=${SIM_BATCH_ID} のデータを取得中...`);
  
  type RowData = {
    winner: string | null;
    full_record: Array<{ medium_pattern_id?: string }>;
  };

  let allRows: RowData[] = [];
  let offset = 0;
  const PAGE_SIZE = 500;

  while (true) {
    const { data, error } = await supabase
      .from('sim_match_logs')
      .select('winner, full_record')
      .eq('sim_batch_id', SIM_BATCH_ID)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error(`データ取得エラー: ${error.message}`);
      process.exit(1);
    }

    if (!data || data.length === 0) break;
    allRows = allRows.concat(data as RowData[]);
    process.stdout.write(`  取得中: ${allRows.length} 件\r`);
    offset += PAGE_SIZE;
    if (data.length < PAGE_SIZE) break;
  }

  console.log(`\n取得完了: ${allRows.length} 件\n`);

  // sim_medium_pattern_stats upsert
  let cSuccess = 0;
  let cSkip = 0;
  let cError = 0;

  for (let i = 0; i < allRows.length; i++) {
    const r = allRows[i];

    if (!r.winner) {
      cSkip++;
      continue;
    }

    const patternIds = r.full_record
      .map(m => m.medium_pattern_id)
      .filter((p): p is string => !!p);

    if (patternIds.length === 0) {
      cSkip++;
      continue;
    }

    const { error: rpcErr } = await supabase.rpc('batch_upsert_sim_medium_pattern_stats', {
      p_pattern_ids: patternIds,
      p_winner: r.winner,
      p_sim_policy: SIM_POLICY,
    });

    if (rpcErr) {
      console.error(`  RPC ERROR (game ${i + 1}): ${rpcErr.message}`);
      cError++;
    } else {
      cSuccess++;
    }

    if (cSuccess % 100 === 0 && cSuccess > 0) {
      process.stdout.write(`  Phase C: ${cSuccess + cSkip + cError}/${allRows.length} 完了\r`);
    }
  }

  console.log(`\nPhase C 完了: success=${cSuccess} skip=${cSkip} error=${cError}\n`);

  // 最終件数確認
  const { count: medCount } = await supabase
    .from('sim_medium_pattern_stats')
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', SIM_POLICY);

  console.log(`sim_medium_pattern_stats (policy=${SIM_POLICY}): ${medCount} 件`);
  console.log('\n=== fix_sim_s8_medium.ts 完了 ===');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
