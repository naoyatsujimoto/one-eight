/**
 * stats_sim_s14.ts
 * sim_easy_vs_easy_20260512e.md (10,000局) 取り込み後の統計集計
 * sim_match_logs 60,000局時点
 * 正しい medium_pattern_id 形式（hash:4桁コード）対応版
 * moveNumber は sim_match_logs.full_record から取得
 *
 * 50,000局正式基準値との比較:
 *   sim_medium_pattern_stats 総行数: 556,716
 *   medium 最大 total: 12,364
 *   total>=30: 1,740 / total>=50: 861 / total>=100: 296
 *   total>=200: 115 / total>=500: 25
 *   M1 total>=100: 16 / M2〜3 total>=100: 145
 *
 * 追加確認: pattern 06865a5f36ac5df5:1011
 *   50,000局正式基準: total=10 → 60,000局後の変化を確認
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('env未設定'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const SIM_POLICY = 'easy_vs_easy';
const PAGE_SIZE = 500;

// 追加確認対象 pattern
const TARGET_PATTERN_ID = '06865a5f36ac5df5:1011';

// 50,000局正式基準値
const BASELINE = {
  totalRows: 556716,
  maxTotal: 12364,
  ge30: 1740,
  ge50: 861,
  ge100: 296,
  ge200: 115,
  ge500: 25,
  m1_ge100: 16,
  m23_ge100: 145,
  m48_ge100: 0,
  m922_ge100: 9,
  m23plus_ge100: 211,
  targetPatternTotal: 10,
};

async function countWhere(table: string, policy: string, minTotal: number): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', policy)
    .gte('total', minTotal);
  if (error) { console.error(`countWhere error: ${error.message}`); return -1; }
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

function diff(current: number, baseline: number): string {
  const d = current - baseline;
  const sign = d >= 0 ? '+' : '';
  return `${current} (前回比: ${sign}${d})`;
}

async function main() {
  console.log('=== stats_sim_s14.ts (60,000局時点) ===\n');

  // ─── sim_match_logs 総件数 ───
  console.log('【sim テーブル総件数】');
  const { count: smlTotal } = await supabase.from('sim_match_logs').select('*', { count: 'exact', head: true });
  console.log(`sim_match_logs: ${smlTotal} 件 (想定: 60,000)`);
  const { count: spsTotal } = await supabase.from('sim_position_stats').select('*', { count: 'exact', head: true });
  console.log(`sim_position_stats: ${spsTotal} 件`);
  const { count: smpTotal } = await supabase.from('sim_medium_pattern_stats').select('*', { count: 'exact', head: true });
  console.log(`sim_medium_pattern_stats: ${smpTotal} 件 (前回: ${BASELINE.totalRows.toLocaleString()})`);

  // ─── sim_position_stats ───
  console.log('\n【sim_position_stats (canonical_hash)】');
  const posMaxTotal = await maxTotalWhere('sim_position_stats', SIM_POLICY);
  console.log(`最大 total: ${posMaxTotal}`);
  for (const n of [30, 50, 100, 200]) {
    const c = await countWhere('sim_position_stats', SIM_POLICY, n);
    console.log(`total>=${n}: ${c} 件`);
  }

  // ─── sim_medium_pattern_stats 閾値集計 ───
  console.log('\n【sim_medium_pattern_stats 閾値集計】');
  const medMaxTotal = await maxTotalWhere('sim_medium_pattern_stats', SIM_POLICY);
  console.log(`最大 total: ${diff(medMaxTotal, BASELINE.maxTotal)}`);

  const med30 = await countWhere('sim_medium_pattern_stats', SIM_POLICY, 30);
  console.log(`total>=30: ${diff(med30, BASELINE.ge30)}`);
  const med50 = await countWhere('sim_medium_pattern_stats', SIM_POLICY, 50);
  console.log(`total>=50: ${diff(med50, BASELINE.ge50)}`);
  const med100 = await countWhere('sim_medium_pattern_stats', SIM_POLICY, 100);
  console.log(`total>=100: ${diff(med100, BASELINE.ge100)}`);
  const med200 = await countWhere('sim_medium_pattern_stats', SIM_POLICY, 200);
  console.log(`total>=200: ${diff(med200, BASELINE.ge200)}`);
  const med500 = await countWhere('sim_medium_pattern_stats', SIM_POLICY, 500);
  console.log(`total>=500: ${diff(med500, BASELINE.ge500)}`);

  // ─── 追加確認: TARGET_PATTERN_ID の total ───
  console.log(`\n【追加確認: ${TARGET_PATTERN_ID}】`);
  console.log(`（50,000局正式基準: total=${BASELINE.targetPatternTotal}）`);
  const { data: targetData, error: targetErr } = await supabase
    .from('sim_medium_pattern_stats')
    .select('medium_pattern_id, sim_policy, wins_black, wins_white, draws, total')
    .eq('medium_pattern_id', TARGET_PATTERN_ID)
    .eq('sim_policy', SIM_POLICY)
    .single();
  if (targetErr) {
    console.log(`  → レコードなし（または取得エラー: ${targetErr.message}）`);
  } else if (targetData) {
    const row = targetData as { medium_pattern_id: string; wins_black: number; wins_white: number; draws: number; total: number };
    const delta = row.total - BASELINE.targetPatternTotal;
    console.log(`  total: ${row.total} (前回: ${BASELINE.targetPatternTotal}, 増加: +${delta})`);
    console.log(`  wins_black: ${row.wins_black}, wins_white: ${row.wins_white}, draws: ${row.draws}`);
    console.log(`  total>=30: ${row.total >= 30 ? '✅ 到達' : '❌ 未達（' + row.total + '/30）'}`);
  }

  // ─── moveNumber マッピング構築 ───
  console.log('\nmoveNumber マッピング構築中（sim_match_logs 全件スキャン）...');
  const pidToMoveNumber = new Map<string, number>();

  let offset = 0;
  let scanned = 0;
  while (true) {
    const { data, error } = await supabase
      .from('sim_match_logs')
      .select('full_record')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) { console.error(`scan error: ${error.message}`); break; }
    if (!data || data.length === 0) break;
    for (const row of data as { full_record: Array<{ medium_pattern_id?: string; moveNumber?: number }> }[]) {
      for (const step of row.full_record) {
        if (step.medium_pattern_id && step.moveNumber != null) {
          if (!pidToMoveNumber.has(step.medium_pattern_id)) {
            pidToMoveNumber.set(step.medium_pattern_id, step.moveNumber);
          }
        }
      }
    }
    scanned += data.length;
    process.stdout.write(`  スキャン: ${scanned} ゲーム / ${pidToMoveNumber.size} パターン\r`);
    offset += PAGE_SIZE;
    if (data.length < PAGE_SIZE) break;
  }
  console.log(`\nマッピング完了: ${pidToMoveNumber.size} パターン`);

  // TARGET_PATTERN の moveNumber 確認
  const targetMn = pidToMoveNumber.get(TARGET_PATTERN_ID);
  if (targetMn != null) {
    console.log(`  ${TARGET_PATTERN_ID} の moveNumber: M${targetMn}`);
  } else {
    console.log(`  ${TARGET_PATTERN_ID}: moveNumber 未解決`);
  }

  // ─── sim_medium_pattern_stats の全件取得 + moveNumber集計 ───
  console.log('\nsim_medium_pattern_stats 全件取得中...');
  type MedRow = { medium_pattern_id: string; total: number };
  const allMed: MedRow[] = [];
  let medOffset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('sim_medium_pattern_stats')
      .select('medium_pattern_id, total')
      .eq('sim_policy', SIM_POLICY)
      .range(medOffset, medOffset + PAGE_SIZE - 1);
    if (error) { console.error(`med fetch error: ${error.message}`); break; }
    if (!data || data.length === 0) break;
    allMed.push(...(data as MedRow[]));
    process.stdout.write(`  取得: ${allMed.length} 件\r`);
    medOffset += PAGE_SIZE;
    if (data.length < PAGE_SIZE) break;
  }
  console.log(`\n取得完了: ${allMed.length} 件`);

  // moveNumber 付与
  let noMnCount = 0;
  const withMn = allMed.map(r => {
    const mn = pidToMoveNumber.get(r.medium_pattern_id);
    if (mn == null) noMnCount++;
    return { ...r, moveNumber: mn ?? 0 };
  });
  console.log(`moveNumber 未解決: ${noMnCount} 件`);

  // 最大 moveNumber
  const mn100 = withMn.filter(r => r.total >= 100).map(r => r.moveNumber);
  const mn50  = withMn.filter(r => r.total >= 50).map(r => r.moveNumber);
  const mn30  = withMn.filter(r => r.total >= 30).map(r => r.moveNumber);
  const medMn100 = mn100.length > 0 ? Math.max(...mn100) : 0;
  const medMn50  = mn50.length  > 0 ? Math.max(...mn50)  : 0;
  const medMn30  = mn30.length  > 0 ? Math.max(...mn30)  : 0;
  console.log(`\ntotal>=100 最大 moveNumber: M${medMn100}`);
  console.log(`total>=50  最大 moveNumber: M${medMn50}`);
  console.log(`total>=30  最大 moveNumber: M${medMn30}`);

  // ─── 深度分布 ───
  console.log('\n【深度分布 (medium_pattern_stats)】');
  const bands: [string, (mn: number) => boolean][] = [
    ['M1',    mn => mn === 1],
    ['M2-3',  mn => mn >= 2 && mn <= 3],
    ['M4-8',  mn => mn >= 4 && mn <= 8],
    ['M9-22', mn => mn >= 9 && mn <= 22],
    ['M23+',  mn => mn >= 23],
  ];
  const thresholds = [30, 50, 100];

  const dist: Record<string, Record<number, number>> = {};
  for (const [band] of bands) {
    dist[band] = {};
    for (const t of thresholds) dist[band][t] = 0;
  }

  for (const row of withMn) {
    for (const [band, check] of bands) {
      if (check(row.moveNumber)) {
        for (const t of thresholds) {
          if (row.total >= t) dist[band][t]++;
        }
        break;
      }
    }
  }

  console.log('| 帯 | >=30 | >=50 | >=100 |');
  console.log('|---|---|---|---|');
  for (const [band] of bands) {
    console.log(`| ${band} | ${dist[band][30]} | ${dist[band][50]} | ${dist[band][100]} |`);
  }

  // 50,000局基準との比較
  console.log('\n【50,000局正式基準 vs 60,000局 比較】');
  console.log(`M1 total>=100: ${dist['M1'][100]} (前回: ${BASELINE.m1_ge100})`);
  console.log(`M2〜3 total>=100: ${dist['M2-3'][100]} (前回: ${BASELINE.m23_ge100})`);
  console.log(`M4〜8 total>=100: ${dist['M4-8'][100]} (前回: ${BASELINE.m48_ge100})`);
  console.log(`M9〜22 total>=100: ${dist['M9-22'][100]} (前回: ${BASELINE.m922_ge100})`);
  console.log(`M23以降 total>=100: ${dist['M23+'][100]} (前回: ${BASELINE.m23plus_ge100})`);

  // canonical_hash vs medium_pattern_id 比較
  console.log('\n【canonical_hash vs medium_pattern_id 比較】');
  const pos30 = await countWhere('sim_position_stats', SIM_POLICY, 30);
  const pos100 = await countWhere('sim_position_stats', SIM_POLICY, 100);
  console.log(`canonical_hash total>=30: ${pos30}`);
  console.log(`medium_pattern  total>=30: ${med30}`);
  console.log(`canonical_hash total>=100: ${pos100}`);
  console.log(`medium_pattern  total>=100: ${med100}`);

  // ─── 実戦テーブル汚染チェック ───
  console.log('\n【実戦テーブル汚染チェック】');
  const { count: mlCount } = await supabase.from('match_logs').select('*', { count: 'exact', head: true });
  console.log(`match_logs: ${mlCount} 件`);
  const { count: psCount } = await supabase.from('position_stats').select('*', { count: 'exact', head: true });
  console.log(`position_stats: ${psCount} 件`);
  const { count: mpsCount, error: mpsErr } = await supabase.from('medium_pattern_stats').select('*', { count: 'exact', head: true });
  if (mpsErr) console.log(`medium_pattern_stats: 存在しない or エラー`);
  else console.log(`medium_pattern_stats: ${mpsCount} 件`);

  console.log('\n=== 完了 ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
