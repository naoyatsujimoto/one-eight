/**
 * diagnose_s13c.ts
 * batch001-012（40,000局）の medium_pattern_id を直接再計算
 * Stack overflow 対策: Math.max を使わず loop で最大値取得
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('env missing'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  // ─── batch001-012（40,000局）のみで medium_pattern 再計算 ───
  console.log('=== batch001-012 (40,000局) medium_pattern 再計算 ===');
  const prevStats = new Map<string, number>(); // pid -> total（ゲーム数）
  let off = 0;
  const PAGE = 500;
  let gameCount = 0;

  while (true) {
    const { data, error } = await supabase
      .from('sim_match_logs')
      .select('winner, full_record')
      .neq('sim_batch_id', 'easy_20260512_013')
      .range(off, off + PAGE - 1);
    if (error) { console.error(`scan error: ${error.message}`); break; }
    if (!data || data.length === 0) break;
    for (const row of data as { winner: string; full_record: { medium_pattern_id?: string }[] }[]) {
      if (!row.winner) continue;
      const pids = row.full_record
        .map(m => m.medium_pattern_id)
        .filter((p): p is string => !!p);
      const unique = [...new Set(pids)];
      for (const pid of unique) {
        prevStats.set(pid, (prevStats.get(pid) ?? 0) + 1);
      }
      gameCount++;
    }
    off += PAGE;
    process.stdout.write(`  scan: ${off} / gameCount=${gameCount} / patterns=${prevStats.size}\r`);
    if ((data as unknown[]).length < PAGE) break;
  }

  console.log(`\nscan完了: ${gameCount} ゲーム, ${prevStats.size} unique patterns`);

  // ─── 閾値集計（Math.max を使わず loop） ───
  let max = 0;
  let c30 = 0, c50 = 0, c100 = 0, c200 = 0, c500 = 0;
  for (const v of prevStats.values()) {
    if (v > max) max = v;
    if (v >= 30)  c30++;
    if (v >= 50)  c50++;
    if (v >= 100) c100++;
    if (v >= 200) c200++;
    if (v >= 500) c500++;
  }
  console.log(`\n【batch001-012 再計算結果】`);
  console.log(`  unique patterns: ${prevStats.size}`);
  console.log(`  最大 total: ${max}`);
  console.log(`  total>=30: ${c30}`);
  console.log(`  total>=50: ${c50}`);
  console.log(`  total>=100: ${c100}`);
  console.log(`  total>=200: ${c200}`);
  console.log(`  total>=500: ${c500}`);

  // ─── 全 50,000局での再計算（batch013含む） ───
  console.log('\n=== 全50,000局 medium_pattern 再計算 ===');
  const allStats = new Map<string, number>();
  let off2 = 0;
  let gc2 = 0;
  while (true) {
    const { data, error } = await supabase
      .from('sim_match_logs')
      .select('winner, full_record')
      .range(off2, off2 + PAGE - 1);
    if (error) { console.error(`scan2 error: ${error.message}`); break; }
    if (!data || data.length === 0) break;
    for (const row of data as { winner: string; full_record: { medium_pattern_id?: string }[] }[]) {
      if (!row.winner) continue;
      const pids = row.full_record.map(m => m.medium_pattern_id).filter((p): p is string => !!p);
      const unique = [...new Set(pids)];
      for (const pid of unique) {
        allStats.set(pid, (allStats.get(pid) ?? 0) + 1);
      }
      gc2++;
    }
    off2 += PAGE;
    process.stdout.write(`  scan: ${off2} / games=${gc2} / patterns=${allStats.size}\r`);
    if ((data as unknown[]).length < PAGE) break;
  }
  console.log(`\nscan完了: ${gc2} ゲーム, ${allStats.size} unique patterns`);

  let max2 = 0, c30_2 = 0, c50_2 = 0, c100_2 = 0, c200_2 = 0, c500_2 = 0;
  for (const v of allStats.values()) {
    if (v > max2) max2 = v;
    if (v >= 30)  c30_2++;
    if (v >= 50)  c50_2++;
    if (v >= 100) c100_2++;
    if (v >= 200) c200_2++;
    if (v >= 500) c500_2++;
  }
  console.log(`\n【全50,000局 再計算結果】`);
  console.log(`  unique patterns: ${allStats.size}`);
  console.log(`  最大 total: ${max2}`);
  console.log(`  total>=30: ${c30_2}`);
  console.log(`  total>=50: ${c50_2}`);
  console.log(`  total>=100: ${c100_2}`);
  console.log(`  total>=200: ${c200_2}`);
  console.log(`  total>=500: ${c500_2}`);

  // ─── DB vs 再計算の比較 ───
  console.log('\n=== DB vs 再計算 比較 ===');
  console.log('  項目               | 40K DB(報告値) | 40K 再計算 | 50K DB現在 | 50K 再計算');
  console.log('  -------------------|----------------|------------|------------|----------');
  console.log(`  最大 total         | 13,901         | ${max}      | 17,037     | ${max2}`);
  console.log(`  total>=30          | 4,406          | ${c30}       | 3,297      | ${c30_2}`);
  console.log(`  total>=50          | 2,454          | ${c50}       | 1,834      | ${c50_2}`);
  console.log(`  total>=100         | 904            | ${c100}      | 697        | ${c100_2}`);
  console.log(`  total>=200         | 376            | ${c200}      | 268        | ${c200_2}`);
  console.log(`  total>=500         | 86             | ${c500}      | 68         | ${c500_2}`);

  // ─── 対象 pattern 確認 ───
  const targetPid = '06865a5f36ac5df5:1011';
  const t40 = prevStats.get(targetPid) ?? 0;
  const t50 = allStats.get(targetPid) ?? 0;
  console.log(`\n=== pattern ${targetPid} ===`);
  console.log(`  40K 再計算 total: ${t40}`);
  console.log(`  50K 再計算 total: ${t50}`);
  console.log(`  50K DB total: 22`);
  console.log(`  total>=30(再計算): ${t50 >= 30 ? '✅ 到達' : `❌ 未達 (${t50}/30)`}`);

  console.log('\n=== 完了 ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
