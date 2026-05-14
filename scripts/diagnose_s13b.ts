/**
 * diagnose_s13b.ts
 * 閾値減少の原因詳細切り分け
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('env missing'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const SIM_POLICY = 'easy_vs_easy';

async function main() {
  // ─── A: sim_match_logs の全 sim_batch_id を distinct 取得 ───
  console.log('=== A: sim_match_logs 全 sim_batch_id ===');
  // ページネーションで全件の sim_batch_id を集める（sim_match_logs は 50,000件）
  const batchCounts: Record<string, number> = {};
  let off = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('sim_match_logs')
      .select('sim_batch_id')
      .range(off, off + PAGE - 1);
    if (error) { console.error(`error: ${error.message}`); break; }
    if (!data || data.length === 0) break;
    for (const r of data as { sim_batch_id: string }[]) {
      const b = r.sim_batch_id ?? 'null';
      batchCounts[b] = (batchCounts[b] ?? 0) + 1;
    }
    off += data.length;
    if (data.length < PAGE) break;
  }
  const sorted = Object.entries(batchCounts).sort((a, b) => a[0].localeCompare(b[0]));
  sorted.forEach(([k, v]) => console.log(`  ${k}: ${v} 件`));
  console.log(`  合計: ${sorted.reduce((s, [, v]) => s + v, 0)} 件`);

  // ─── B: s13 起因の medium_pattern_id 件数確認 ───
  // s13 allRows から集計されたパターン数は import log から読めないので、
  // s13 の full_record を読んで集計
  console.log('\n=== B: batch 013 の medium_pattern_id 出現数 ===');
  const batchNewStats = new Map<string, { wins_black: number; wins_white: number; draws: number; total: number }>();
  let b13off = 0;
  while (true) {
    const { data, error } = await supabase
      .from('sim_match_logs')
      .select('winner, full_record')
      .eq('sim_batch_id', 'easy_20260512_013')
      .range(b13off, b13off + 200 - 1);
    if (error) { console.error(`b13 error: ${error.message}`); break; }
    if (!data || data.length === 0) break;
    for (const row of data as { winner: string; full_record: { medium_pattern_id?: string }[] }[]) {
      if (!row.winner) continue;
      const pids = row.full_record
        .map(m => m.medium_pattern_id)
        .filter((p): p is string => !!p);
      const unique = [...new Set(pids)];
      for (const pid of unique) {
        const cur = batchNewStats.get(pid) ?? { wins_black: 0, wins_white: 0, draws: 0, total: 0 };
        cur.wins_black += row.winner === 'black' ? 1 : 0;
        cur.wins_white += row.winner === 'white' ? 1 : 0;
        cur.draws      += row.winner === 'draw'  ? 1 : 0;
        cur.total      += 1;
        batchNewStats.set(pid, cur);
      }
    }
    b13off += 200;
    if ((data as unknown[]).length < 200) break;
  }
  console.log(`  batch 013 unique patterns: ${batchNewStats.size}`);
  const b13sorted = [...batchNewStats.values()].sort((a, b) => b.total - a.total);
  console.log(`  batch 013 total 上位5: ${b13sorted.slice(0,5).map(r => r.total).join(', ')}`);

  // ─── C: DB vs 再計算の不整合チェック ───
  // total>=100 の pattern を DB から取得し、全 sim_match_logs での正しい total を確認（サンプル10件）
  console.log('\n=== C: total>=100 pattern サンプル 再計算検証 ===');
  const { data: top100 } = await supabase
    .from('sim_medium_pattern_stats')
    .select('medium_pattern_id, total')
    .eq('sim_policy', SIM_POLICY)
    .gte('total', 100)
    .order('total', { ascending: false })
    .limit(10);
  if (top100) {
    for (const row of top100 as { medium_pattern_id: string; total: number }[]) {
      // 全 sim_match_logs から再計算
      let recomputed = 0;
      let roff = 0;
      while (true) {
        const { data: games, error } = await supabase
          .from('sim_match_logs')
          .select('full_record')
          .range(roff, roff + 500 - 1);
        if (error || !games || games.length === 0) break;
        for (const g of games as { full_record: { medium_pattern_id?: string }[] }[]) {
          const pids = g.full_record.map(m => m.medium_pattern_id).filter((p): p is string => !!p);
          if ([...new Set(pids)].includes(row.medium_pattern_id)) recomputed++;
        }
        roff += 500;
        if ((games as unknown[]).length < 500) break;
      }
      const match = recomputed === row.total ? '✅' : `❌ (DB=${row.total}, 再計算=${recomputed})`;
      console.log(`  ${row.medium_pattern_id}: DB=${row.total} 再計算=${recomputed} ${match}`);
    }
  }

  // ─── D: 40,000局時点で total>=100 だったはずの代表pattern確認 ───
  // medium total>=100 の最大total pattern（6604522ded6f5e41:0000, 17037）
  console.log('\n=== D: 代表pattern 0b30d5a49ed7913f:1212 の詳細 ===');
  // 40000局時点で high total だったと思われる pattern
  const checkPids = [
    '6604522ded6f5e41:0000', // 今回 max (17037)
    '0b30d5a49ed7913f:1212', // 今回 6位 (3970)
  ];
  for (const pid of checkPids) {
    const { data: pdata } = await supabase
      .from('sim_medium_pattern_stats')
      .select('*')
      .eq('medium_pattern_id', pid)
      .eq('sim_policy', SIM_POLICY);
    if (pdata && pdata.length > 0) {
      console.log(`  ${pid}:`);
      pdata.forEach(r => console.log(`    ${JSON.stringify(r)}`));
    }
  }

  // ─── E: Phase C upsert の加算確認（batch013 前後比較） ───
  // batch013 で確実に出現するはずの pattern の total が正しく加算されているか
  console.log('\n=== E: batch013 由来パターンの加算確認 ===');
  // batch013 の top pattern を取得
  const top3b13 = b13sorted.slice(0, 3);
  // 対応する pattern_id を取得
  const topPids13 = [...batchNewStats.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5)
    .map(([pid, stat]) => ({ pid, batch13total: stat.total }));
  
  for (const { pid, batch13total } of topPids13) {
    const { data: dbRow } = await supabase
      .from('sim_medium_pattern_stats')
      .select('total')
      .eq('medium_pattern_id', pid)
      .eq('sim_policy', SIM_POLICY)
      .single();
    const dbTotal = (dbRow as { total?: number } | null)?.total ?? 'null';
    console.log(`  ${pid}: batch013=${batch13total}, DB=${dbTotal}`);
    // 簡易検証: DB total >= batch013 total のはず
    if (typeof dbTotal === 'number' && dbTotal < batch13total) {
      console.log(`    ❌ DB total が batch013 より小さい！加算失敗の可能性`);
    }
  }

  // ─── F: 40,000局時点の baseline 取得元確認 ───
  // stats_sim_s12.ts は DB から直接読んでいるのでそちらを信頼
  // ここでは 40,000局（batch001-012まで）の full_record から medium を再集計
  console.log('\n=== F: batch001-012 (40,000局) のみで medium total>=100 再計算 ===');
  // batch 013 を除いた sim_match_logs から medium_pattern_id を集計
  const prevStats = new Map<string, number>(); // pid -> total
  let foff = 0;
  while (true) {
    const { data, error } = await supabase
      .from('sim_match_logs')
      .select('winner, full_record, sim_batch_id')
      .neq('sim_batch_id', 'easy_20260512_013')
      .range(foff, foff + 500 - 1);
    if (error) { console.error(`F scan error: ${error.message}`); break; }
    if (!data || data.length === 0) break;
    for (const row of data as { winner: string; full_record: { medium_pattern_id?: string }[]; sim_batch_id: string }[]) {
      if (!row.winner) continue;
      const pids = row.full_record.map(m => m.medium_pattern_id).filter((p): p is string => !!p);
      for (const pid of [...new Set(pids)]) {
        prevStats.set(pid, (prevStats.get(pid) ?? 0) + 1);
      }
    }
    process.stdout.write(`  scan: ${foff + (data as unknown[]).length}\r`);
    foff += 500;
    if ((data as unknown[]).length < 500) break;
  }
  const prev100 = [...prevStats.values()].filter(v => v >= 100).length;
  const prev30 = [...prevStats.values()].filter(v => v >= 30).length;
  const prevMax = Math.max(...prevStats.values());
  console.log(`\n  batch001-012 再計算: unique patterns=${prevStats.size}`);
  console.log(`  total>=30: ${prev30}, total>=100: ${prev100}, max: ${prevMax}`);

  console.log('\n=== 完了 ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
