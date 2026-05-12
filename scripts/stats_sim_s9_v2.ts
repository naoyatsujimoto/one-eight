/**
 * stats_sim_s9_v2.ts
 * 正しい medium_pattern_id 形式（hash:4桁コード）対応版
 * moveNumber は sim_match_logs.full_record から取得
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('env未設定'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const SIM_POLICY = 'easy_vs_easy';
const PAGE_SIZE = 500;

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

async function main() {
  console.log('=== stats_sim_s9_v2.ts ===\n');

  // ─── sim_position_stats ───
  console.log('【sim_position_stats】');
  const posMaxTotal = await maxTotalWhere('sim_position_stats', SIM_POLICY);
  console.log(`最大 total: ${posMaxTotal}`);
  for (const n of [30, 50, 100, 200]) {
    const c = await countWhere('sim_position_stats', SIM_POLICY, n);
    console.log(`total>=${n}: ${c} 件`);
  }

  // sim_position_stats には moveNumber カラムなし・canonical_hash のみ
  // → moveNumber は sim_match_logs の full_record から各 canonical_hash の初出 moveNumber を取得
  // 簡略化: moveNumber は "位置統計では取得不可" として N/A とする
  console.log('total>=100 最大 moveNumber: N/A (canonical_hash のみ、moveNumber カラムなし)');
  console.log('total>=30  最大 moveNumber: N/A');

  // ─── sim_medium_pattern_stats ───
  console.log('\n【sim_medium_pattern_stats】');
  const medMaxTotal = await maxTotalWhere('sim_medium_pattern_stats', SIM_POLICY);
  console.log(`最大 total: ${medMaxTotal}`);
  for (const n of [30, 50, 100, 200, 500]) {
    const c = await countWhere('sim_medium_pattern_stats', SIM_POLICY, n);
    console.log(`total>=${n}: ${c} 件`);
  }

  // ─── moveNumber マッピング構築 ───
  // sim_match_logs の full_record から medium_pattern_id → moveNumber のマッピング（初出）を作成
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
  const medMn100 = Math.max(...withMn.filter(r => r.total >= 100).map(r => r.moveNumber));
  const medMn50  = Math.max(...withMn.filter(r => r.total >= 50).map(r => r.moveNumber));
  const medMn30  = Math.max(...withMn.filter(r => r.total >= 30).map(r => r.moveNumber));
  console.log(`\ntotal>=100 最大 moveNumber: M${medMn100 < 0 ? 0 : medMn100}`);
  console.log(`total>=50  最大 moveNumber: M${medMn50  < 0 ? 0 : medMn50}`);
  console.log(`total>=30  最大 moveNumber: M${medMn30  < 0 ? 0 : medMn30}`);

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

  // ─── 実戦テーブル汚染チェック ───
  console.log('\n【実戦テーブル汚染チェック】');
  const { count: mlCount } = await supabase.from('match_logs').select('*', { count: 'exact', head: true });
  console.log(`match_logs: ${mlCount} 件`);
  const { count: psCount } = await supabase.from('position_stats').select('*', { count: 'exact', head: true });
  console.log(`position_stats: ${psCount} 件`);
  const { count: mpsCount, error: mpsErr } = await supabase.from('medium_pattern_stats').select('*', { count: 'exact', head: true });
  if (mpsErr) console.log(`medium_pattern_stats: 存在しない or エラー`);
  else console.log(`medium_pattern_stats: ${mpsCount} 件`);

  // ─── sim テーブル総件数 ───
  console.log('\n【sim テーブル総件数】');
  const { count: smlTotal } = await supabase.from('sim_match_logs').select('*', { count: 'exact', head: true });
  console.log(`sim_match_logs: ${smlTotal} 件`);
  const { count: spsTotal } = await supabase.from('sim_position_stats').select('*', { count: 'exact', head: true });
  console.log(`sim_position_stats: ${spsTotal} 件`);
  const { count: smpTotal } = await supabase.from('sim_medium_pattern_stats').select('*', { count: 'exact', head: true });
  console.log(`sim_medium_pattern_stats: ${smpTotal} 件`);

  console.log('\n=== 完了 ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
