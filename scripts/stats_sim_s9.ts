/**
 * stats_sim_s9.ts
 * sim_position_stats / sim_medium_pattern_stats の統計集計
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: env未設定');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const SIM_POLICY = 'easy_vs_easy';
const PAGE_SIZE = 1000;

async function countWhere(table: string, policy: string, minTotal: number): Promise<number> {
  // ページング不要 - count:exact を使う
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', policy)
    .gte('total', minTotal);
  if (error) { console.error(`countWhere error (${table}, >=${minTotal}): ${error.message}`); return -1; }
  return count ?? 0;
}

async function maxTotalWhere(table: string, policy: string): Promise<number> {
  const { data, error } = await supabase
    .from(table)
    .select('total')
    .eq('sim_policy', policy)
    .order('total', { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return 0;
  return (data[0] as { total: number }).total;
}

// medium_pattern_id から moveNumber を抽出（形式: {canonical_hash}_{moveNumber}）
function extractMoveNumber(pid: string): number | null {
  // 末尾の _数字 を moveNumber とする
  const m = pid.match(/_(\d+)$/);
  if (!m) return null;
  return parseInt(m[1], 10);
}

async function getMaxMoveNumberWhere(table: string, policy: string, minTotal: number): Promise<number> {
  // ページングで全件取得して moveNumber を抽出
  let maxMn = 0;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('medium_pattern_id, total')
      .eq('sim_policy', policy)
      .gte('total', minTotal)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) { console.error(`getMaxMoveNumber error: ${error.message}`); break; }
    if (!data || data.length === 0) break;
    for (const row of data as { medium_pattern_id: string; total: number }[]) {
      const mn = extractMoveNumber(row.medium_pattern_id);
      if (mn !== null && mn > maxMn) maxMn = mn;
    }
    process.stdout.write(`  max_mn scan: ${offset + data.length} 件\r`);
    offset += PAGE_SIZE;
    if (data.length < PAGE_SIZE) break;
  }
  process.stdout.write('\n');
  return maxMn;
}

// position_stats の最大 moveNumber（moveNumber カラムがある前提）
async function maxMoveNumberPos(policy: string, minTotal: number): Promise<number> {
  const { data, error } = await supabase
    .from('sim_position_stats')
    .select('move_number')
    .eq('sim_policy', policy)
    .gte('total', minTotal)
    .order('move_number', { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) {
    // move_number カラムがない場合は medium_pattern_id から抽出
    return -1;
  }
  return (data[0] as { move_number: number }).move_number;
}

// 深度分布（medium_pattern_stats）
async function depthDistribution(policy: string, thresholds: number[]): Promise<Map<string, Record<number, number>>> {
  // 全件ページング取得
  const all: { medium_pattern_id: string; total: number }[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('sim_medium_pattern_stats')
      .select('medium_pattern_id, total')
      .eq('sim_policy', policy)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) { console.error(`depth scan error: ${error.message}`); break; }
    if (!data || data.length === 0) break;
    all.push(...(data as { medium_pattern_id: string; total: number }[]));
    process.stdout.write(`  depth scan: ${all.length} 件\r`);
    offset += PAGE_SIZE;
    if (data.length < PAGE_SIZE) break;
  }
  process.stdout.write('\n');

  // 帯の定義
  const bands: [string, (mn: number) => boolean][] = [
    ['M1',    mn => mn === 1],
    ['M2-3',  mn => mn >= 2 && mn <= 3],
    ['M4-8',  mn => mn >= 4 && mn <= 8],
    ['M9-22', mn => mn >= 9 && mn <= 22],
    ['M23+',  mn => mn >= 23],
  ];

  // bandName -> threshold -> count
  const result = new Map<string, Record<number, number>>();
  for (const [band] of bands) {
    const rec: Record<number, number> = {};
    for (const t of thresholds) rec[t] = 0;
    result.set(band, rec);
  }

  for (const row of all) {
    const mn = extractMoveNumber(row.medium_pattern_id);
    if (mn === null) continue;
    for (const [band, check] of bands) {
      if (check(mn)) {
        const rec = result.get(band)!;
        for (const t of thresholds) {
          if (row.total >= t) rec[t]++;
        }
        break;
      }
    }
  }

  return result;
}

async function main() {
  console.log('=== stats_sim_s9.ts ===\n');

  // ─── sim_position_stats ───
  console.log('【sim_position_stats】');
  const posMaxTotal = await maxTotalWhere('sim_position_stats', SIM_POLICY);
  console.log(`最大 total: ${posMaxTotal}`);

  for (const n of [30, 50, 100, 200]) {
    const c = await countWhere('sim_position_stats', SIM_POLICY, n);
    console.log(`total>=${n}: ${c} 件`);
  }

  // move_number カラムで試す
  let posMn100 = await maxMoveNumberPos(SIM_POLICY, 100);
  let posMn30  = await maxMoveNumberPos(SIM_POLICY, 30);
  if (posMn100 < 0) {
    console.log('move_number カラムなし → medium_pattern_id から抽出');
    // sim_position_stats に medium_pattern_id があれば使う
    const { data: samplePos } = await supabase
      .from('sim_position_stats')
      .select('*')
      .limit(1);
    console.log('sample row keys:', samplePos ? Object.keys(samplePos[0] ?? {}).join(', ') : 'none');
    posMn100 = 0;
    posMn30  = 0;
  }
  console.log(`total>=100 最大 moveNumber: M${posMn100}`);
  console.log(`total>=30  最大 moveNumber: M${posMn30}`);

  // ─── sim_medium_pattern_stats ───
  console.log('\n【sim_medium_pattern_stats】');
  const medMaxTotal = await maxTotalWhere('sim_medium_pattern_stats', SIM_POLICY);
  console.log(`最大 total: ${medMaxTotal}`);

  for (const n of [30, 50, 100, 200, 500]) {
    const c = await countWhere('sim_medium_pattern_stats', SIM_POLICY, n);
    console.log(`total>=${n}: ${c} 件`);
  }

  console.log('\n最大 moveNumber 取得中 (total>=100)...');
  const medMn100 = await getMaxMoveNumberWhere('sim_medium_pattern_stats', SIM_POLICY, 100);
  console.log(`total>=100 最大 moveNumber: M${medMn100}`);

  console.log('最大 moveNumber 取得中 (total>=50)...');
  const medMn50  = await getMaxMoveNumberWhere('sim_medium_pattern_stats', SIM_POLICY, 50);
  console.log(`total>=50  最大 moveNumber: M${medMn50}`);

  console.log('最大 moveNumber 取得中 (total>=30)...');
  const medMn30  = await getMaxMoveNumberWhere('sim_medium_pattern_stats', SIM_POLICY, 30);
  console.log(`total>=30  最大 moveNumber: M${medMn30}`);

  // ─── 深度分布 ───
  console.log('\n【深度分布 (medium_pattern_stats)】取得中...');
  const dist = await depthDistribution(SIM_POLICY, [30, 50, 100]);
  console.log('\n| 帯 | >=30 | >=50 | >=100 |');
  console.log('|---|---|---|---|');
  for (const band of ['M1', 'M2-3', 'M4-8', 'M9-22', 'M23+']) {
    const rec = dist.get(band)!;
    console.log(`| ${band} | ${rec[30]} | ${rec[50]} | ${rec[100]} |`);
  }

  // ─── 実戦テーブル汚染チェック ───
  console.log('\n【実戦テーブル汚染チェック】');
  const { count: mlCount } = await supabase
    .from('match_logs')
    .select('*', { count: 'exact', head: true });
  console.log(`match_logs: ${mlCount} 件`);

  const { count: psCount } = await supabase
    .from('position_stats')
    .select('*', { count: 'exact', head: true });
  console.log(`position_stats: ${psCount} 件`);

  // medium_pattern_stats テーブル存在確認
  const { error: mpsErr } = await supabase
    .from('medium_pattern_stats')
    .select('*', { count: 'exact', head: true });
  if (mpsErr) {
    console.log(`medium_pattern_stats: 存在しない (${mpsErr.message})`);
  } else {
    const { count: mpsCount } = await supabase
      .from('medium_pattern_stats')
      .select('*', { count: 'exact', head: true });
    console.log(`medium_pattern_stats: ${mpsCount} 件`);
  }

  // ─── sim_match_logs / sim_position_stats 総件数 ───
  console.log('\n【sim テーブル総件数】');
  const { count: smlTotal } = await supabase
    .from('sim_match_logs')
    .select('*', { count: 'exact', head: true });
  console.log(`sim_match_logs 総件数: ${smlTotal}`);

  const { count: spsTotal } = await supabase
    .from('sim_position_stats')
    .select('*', { count: 'exact', head: true });
  console.log(`sim_position_stats 総行数: ${spsTotal}`);

  const { count: smpTotal } = await supabase
    .from('sim_medium_pattern_stats')
    .select('*', { count: 'exact', head: true });
  console.log(`sim_medium_pattern_stats 総行数: ${smpTotal}`);

  console.log('\n=== stats_sim_s9.ts 完了 ===');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
