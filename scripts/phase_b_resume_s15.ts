/**
 * phase_b_resume_s15.ts
 * Phase B 再開スクリプト: game_index > 14500 のみ処理
 * batch_upsert_sim_position_stats RPC は加算式のため、
 * 処理済み (1-14500) を再実行すると二重計上になる → スキップ
 */
import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('env missing'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const SIM_BATCH_ID = 'easy_20260512_015';
const SIM_POLICY   = 'easy_vs_easy';
const RESUME_FROM  = 14500; // この game_index より大きいものだけ処理
const PAGE         = 500;

type ExtMoveRecord = { canonical_hash?: string; medium_pattern_id?: string };

async function main() {
  console.log('=== phase_b_resume_s15.ts ===');
  console.log(`game_index > ${RESUME_FROM} のみ処理\n`);

  const {count: ml0} = await supabase.from('match_logs').select('*',{count:'exact',head:true});
  const {count: ps0} = await supabase.from('position_stats').select('*',{count:'exact',head:true});
  console.log(`[事前] match_logs:${ml0} / position_stats:${ps0}\n`);

  let off = 0, success = 0, skip = 0, err = 0;
  while (true) {
    const {data, error} = await supabase.from('sim_match_logs')
      .select('winner, full_record, canonical_hashes_computed, game_index')
      .eq('sim_batch_id', SIM_BATCH_ID)
      .gt('game_index', RESUME_FROM)           // 未処理分のみ
      .order('game_index', {ascending: true})
      .range(off, off + PAGE - 1);

    if (error) { console.error('scan error:', error.message); break; }
    if (!data || data.length === 0) break;

    for (const row of data as {winner:string; full_record:ExtMoveRecord[]; canonical_hashes_computed:boolean; game_index:number}[]) {
      if (!row.canonical_hashes_computed || !row.winner) { skip++; continue; }
      const hashes = row.full_record.map(m=>m.canonical_hash).filter((h):h is string=>!!h);
      if (hashes.length === 0) { skip++; continue; }
      const {error: rpcErr} = await supabase.rpc('batch_upsert_sim_position_stats', {
        p_hashes: hashes, p_winner: row.winner, p_sim_policy: SIM_POLICY,
      });
      if (rpcErr) { err++; }
      else { success++; }
    }
    off += PAGE;
    process.stdout.write(`  Phase B resume: processed=${off} success=${success} skip=${skip} err=${err}\r`);
    if (data.length < PAGE) break;
  }
  console.log(`\nPhase B resume 完了: success=${success} skip=${skip} err=${err}`);

  const {count: sps} = await supabase.from('sim_position_stats').select('*',{count:'exact',head:true}).eq('sim_policy',SIM_POLICY);
  console.log(`sim_position_stats 総行数: ${sps}`);

  const {count: ml1} = await supabase.from('match_logs').select('*',{count:'exact',head:true});
  const {count: ps1} = await supabase.from('position_stats').select('*',{count:'exact',head:true});
  console.log(`match_logs: ${ml1} (${ml0===ml1?'✅':'❌'}) / position_stats: ${ps1} (${ps0===ps1?'✅':'❌'})`);
  console.log('=== 完了 ===');
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); });
