/**
 * depth_dist_s14.ts - 深度分布集計（メモリ効率版）
 * sim_match_logs をスキャンして medium_pattern_id → moveNumber マッピングを構築し
 * sim_medium_pattern_stats の深度分布を集計する。
 */
import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('env未設定'); process.exit(1); }
const s = createClient(SUPABASE_URL, SERVICE_KEY);
const P = 'easy_vs_easy';
const PAGE = 500;

async function main() {
  // Step 1: pidToMoveNumber マッピング構築
  console.log('Step 1: moveNumber マッピング構築中...');
  const pidToMn = new Map<string, number>();
  let off = 0, scanned = 0;
  while (true) {
    const { data, error } = await s.from('sim_match_logs').select('full_record')
      .order('sim_batch_id', { ascending: true }).order('game_index', { ascending: true })
      .range(off, off + PAGE - 1);
    if (error) { console.error('scan error:', error.message); break; }
    if (!data || data.length === 0) break;
    for (const row of data as { full_record: { medium_pattern_id?: string; moveNumber?: number }[] }[]) {
      for (const step of row.full_record) {
        if (step.medium_pattern_id && step.moveNumber != null && !pidToMn.has(step.medium_pattern_id)) {
          pidToMn.set(step.medium_pattern_id, step.moveNumber);
        }
      }
    }
    scanned += data.length;
    process.stdout.write(`  scan: ${scanned} / patterns=${pidToMn.size}\r`);
    off += PAGE;
    if (data.length < PAGE) break;
  }
  console.log(`\nマッピング完了: ${pidToMn.size} patterns`);

  // Step 2: sim_medium_pattern_stats をストリームして深度分布集計
  console.log('Step 2: 深度分布集計中...');
  const bands: [string, (mn: number) => boolean][] = [
    ['M1',    mn => mn === 1],
    ['M2-3',  mn => mn >= 2 && mn <= 3],
    ['M4-8',  mn => mn >= 4 && mn <= 8],
    ['M9-22', mn => mn >= 9 && mn <= 22],
    ['M23+',  mn => mn >= 23],
  ];
  const thresholds = [30, 50, 100];
  const dist: Record<string, Record<number, number>> = {};
  for (const [b] of bands) { dist[b] = {}; for (const t of thresholds) dist[b][t] = 0; }
  const mnMax: Record<number, number> = { 30: 0, 50: 0, 100: 0 };
  let medOff = 0, medFetched = 0;
  while (true) {
    const { data, error } = await s.from('sim_medium_pattern_stats')
      .select('medium_pattern_id, total').eq('sim_policy', P)
      .order('medium_pattern_id', { ascending: true })
      .range(medOff, medOff + PAGE - 1);
    if (error) { console.error('med error:', error.message); break; }
    if (!data || data.length === 0) break;
    for (const row of data as { medium_pattern_id: string; total: number }[]) {
      const mn = pidToMn.get(row.medium_pattern_id) ?? 0;
      for (const [band, check] of bands) {
        if (check(mn)) {
          for (const t of thresholds) {
            if (row.total >= t) {
              dist[band][t]++;
              if (mn > mnMax[t]) mnMax[t] = mn;
            }
          }
          break;
        }
      }
    }
    medFetched += data.length;
    process.stdout.write(`  med: ${medFetched}\r`);
    medOff += PAGE;
    if (data.length < PAGE) break;
  }
  console.log(`\n集計完了: ${medFetched} 件\n`);

  // 出力
  console.log('【深度分布】');
  console.log('| 帯 | >=30 | >=50 | >=100 |');
  console.log('|---|---|---|---|');
  for (const [b] of bands) console.log(`| ${b} | ${dist[b][30]} | ${dist[b][50]} | ${dist[b][100]} |`);
  console.log(`\ntotal>=100 最大 moveNumber: M${mnMax[100]}`);
  console.log(`total>=50  最大 moveNumber: M${mnMax[50]}`);
  console.log(`total>=30  最大 moveNumber: M${mnMax[30]}`);

  // 50K基準比較
  console.log('\n【50,000局正式基準 vs 60,000局】');
  const base = { m1:16, m23:145, m48:0, m922:9, m23p:211 };
  console.log(`M1    >=100: ${dist['M1'][100]}   (前回: ${base.m1})`);
  console.log(`M2〜3 >=100: ${dist['M2-3'][100]} (前回: ${base.m23})`);
  console.log(`M4〜8 >=100: ${dist['M4-8'][100]} (前回: ${base.m48})`);
  console.log(`M9〜22>=100: ${dist['M9-22'][100]}(前回: ${base.m922})`);
  console.log(`M23+  >=100: ${dist['M23+'][100]} (前回: ${base.m23p})`);
  console.log('\n=== 完了 ===');
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); });
