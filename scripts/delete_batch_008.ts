/**
 * delete_batch_008.ts — easy_20260508_008 の部分取り込みを削除してリトライ準備
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const SIM_BATCH_ID = 'easy_20260508_008';

const { count: before } = await supabase
  .from('sim_match_logs')
  .select('*', { count: 'exact', head: true })
  .eq('sim_batch_id', SIM_BATCH_ID);

console.log(`削除前: ${before} 件`);

// RPC経由で削除を試みる
const { error: rpcErr } = await supabase.rpc('delete_sim_batch', { p_batch_id: SIM_BATCH_ID });
if (rpcErr) {
  console.log(`RPC失敗 (${rpcErr.message})、直接DELETEを試みます...`);
  const { error: delErr } = await supabase
    .from('sim_match_logs')
    .delete()
    .eq('sim_batch_id', SIM_BATCH_ID);
  if (delErr) {
    console.error(`DELETE失敗: ${delErr.message}`);
    process.exit(1);
  }
} else {
  console.log('RPC削除成功');
}

const { count: after } = await supabase
  .from('sim_match_logs')
  .select('*', { count: 'exact', head: true })
  .eq('sim_batch_id', SIM_BATCH_ID);

console.log(`削除後: ${after} 件`);

const { count: total } = await supabase
  .from('sim_match_logs')
  .select('*', { count: 'exact', head: true });
console.log(`sim_match_logs 総件数: ${total}`);
