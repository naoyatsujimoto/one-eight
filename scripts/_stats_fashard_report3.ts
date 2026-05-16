/**
 * _stats_fashard_report3.ts
 * Report 3: fast_hard_vs_fast_hard 統計概要
 */
import * as fs from 'fs';
try {
  const lines = fs.readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/.env', 'utf-8').split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx < 0) continue;
    const key = t.slice(0, idx).trim();
    const val = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch {}

import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function log(msg: string) { console.log(msg); }

async function getDepthDist(table: string, idCol: string, policy: string): Promise<Record<string,number>> {
  // medium_pattern_id or position_only_id の depth を extract
  // medium_pattern_id: hexhash:DDDD (decimal string is depth bits)
  // position_only_id: hexhash (no depth directly)
  // Actually let's query all rows and compute from move_number in sim_match_logs

  // Better: query medium_pattern_stats / position_only_stats and extract depth from the id
  // For medium_pattern_id: format is "hexhash:decimal" where decimal encodes cornerDominance (not depth)
  // Depth is not stored in these tables directly.
  // We need to scan sim_match_logs and look at the moveNumber of each medium_pattern_id
  return {};
}

async function getMedDepthDist(policy: string): Promise<Record<string,number>> {
  // Scan sim_match_logs for fast_hard_vs_fast_hard, extract move_number per unique medium_pattern_id
  // Group by move_number ranges
  const dist: Record<string, number> = { M1:0, 'M2-3':0, 'M4-8':0, 'M9-22':0, 'M23+':0 };
  const seen = new Set<string>();

  let off = 0;
  const PAGE = 500;
  while (true) {
    const {data, error} = await sb.from('sim_match_logs')
      .select('full_record')
      .eq('sim_policy', policy)
      .order('game_index', {ascending: true})
      .range(off, off + PAGE - 1);

    if (error) { log(`ERROR: ${error.message}`); break; }
    if (!data || data.length === 0) break;

    for (const row of data as {full_record: {move_number?: number; moveNumber?: number; medium_pattern_id?: string}[]}[]) {
      const seenInGame = new Set<string>();
      for (const mv of row.full_record) {
        const pid = mv.medium_pattern_id;
        if (!pid) continue;
        if (seenInGame.has(pid)) continue;
        seenInGame.add(pid);

        const moveNum = mv.moveNumber ?? mv.move_number ?? 0;
        if (!seen.has(pid)) {
          seen.add(pid);
          if (moveNum === 1) dist['M1']++;
          else if (moveNum <= 3) dist['M2-3']++;
          else if (moveNum <= 8) dist['M4-8']++;
          else if (moveNum <= 22) dist['M9-22']++;
          else dist['M23+']++;
        }
      }
    }
    off += PAGE;
    process.stdout.write(`  med scan: ${off}/${10000}\r`);
    if (data.length < PAGE) break;
  }
  return dist;
}

async function getPosOnlyDepthDist(policy: string): Promise<Record<string,number>> {
  const dist: Record<string, number> = { M1:0, 'M2-3':0, 'M4-8':0, 'M9-22':0, 'M23+':0 };
  const seen = new Set<string>();

  let off = 0;
  const PAGE = 500;
  while (true) {
    const {data, error} = await sb.from('sim_match_logs')
      .select('full_record')
      .eq('sim_policy', policy)
      .order('game_index', {ascending: true})
      .range(off, off + PAGE - 1);

    if (error) { log(`ERROR: ${error.message}`); break; }
    if (!data || data.length === 0) break;

    for (const row of data as {full_record: {move_number?: number; moveNumber?: number; medium_pattern_id?: string}[]}[]) {
      const seenInGame = new Set<string>();
      for (const mv of row.full_record) {
        const mid = mv.medium_pattern_id;
        if (!mid) continue;
        const pid = mid.includes(':') ? mid.split(':')[0] : null;
        if (!pid) continue;
        if (seenInGame.has(pid)) continue;
        seenInGame.add(pid);

        const moveNum = mv.moveNumber ?? mv.move_number ?? 0;
        if (!seen.has(pid)) {
          seen.add(pid);
          if (moveNum === 1) dist['M1']++;
          else if (moveNum <= 3) dist['M2-3']++;
          else if (moveNum <= 8) dist['M4-8']++;
          else if (moveNum <= 22) dist['M9-22']++;
          else dist['M23+']++;
        }
      }
    }
    off += PAGE;
    process.stdout.write(`  pos scan: ${off}/${10000}\r`);
    if (data.length < PAGE) break;
  }
  return dist;
}

async function main() {
  log('=== Report 3: fast_hard_vs_fast_hard 統計概要 ===\n');

  const FH_POLICY = 'fast_hard_vs_fast_hard';
  const EASY_POLICY = 'easy_vs_easy';

  // ─── medium_pattern_stats 統計 ────────────────────────────────────────────
  log('--- sim_medium_pattern_stats (fast_hard_vs_fast_hard) ---');
  const {count: medTotal} = await sb.from('sim_medium_pattern_stats').select('*',{count:'exact',head:true}).eq('sim_policy',FH_POLICY);
  log(`総行数: ${medTotal}`);
  const {data: medMax} = await sb.from('sim_medium_pattern_stats').select('total').eq('sim_policy',FH_POLICY).order('total',{ascending:false}).limit(1);
  log(`MAX total: ${(medMax as {total:number}[]|null)?.[0]?.total ?? 0}`);
  for (const n of [30,50,100,200,500]) {
    const {count:c} = await sb.from('sim_medium_pattern_stats').select('*',{count:'exact',head:true}).eq('sim_policy',FH_POLICY).gte('total',n);
    log(`total>=${n}: ${c}`);
  }

  // ─── position_only_stats 統計 ─────────────────────────────────────────────
  log('\n--- sim_position_only_stats (fast_hard_vs_fast_hard) ---');
  const {count: posTotal} = await sb.from('sim_position_only_stats').select('*',{count:'exact',head:true}).eq('sim_policy',FH_POLICY);
  log(`総行数: ${posTotal}`);
  const {data: posMax} = await sb.from('sim_position_only_stats').select('total').eq('sim_policy',FH_POLICY).order('total',{ascending:false}).limit(1);
  log(`MAX total: ${(posMax as {total:number}[]|null)?.[0]?.total ?? 0}`);
  for (const n of [30,50,100,200,500]) {
    const {count:c} = await sb.from('sim_position_only_stats').select('*',{count:'exact',head:true}).eq('sim_policy',FH_POLICY).gte('total',n);
    log(`total>=${n}: ${c}`);
  }

  // ─── 深度分布（medium_pattern）────────────────────────────────────────────
  log('\n--- 深度分布スキャン (medium_pattern) ---');
  const medDist = await getMedDepthDist(FH_POLICY);
  log(`\nmedium_pattern 深度分布:`);
  for (const [k,v] of Object.entries(medDist)) log(`  ${k}: ${v}`);

  log('\n--- 深度分布スキャン (position_only) ---');
  const posDist = await getPosOnlyDepthDist(FH_POLICY);
  log(`\nposition_only 深度分布:`);
  for (const [k,v] of Object.entries(posDist)) log(`  ${k}: ${v}`);

  // ─── easy_vs_easy 比較 ───────────────────────────────────────────────────
  log('\n--- easy_vs_easy 比較 ---');
  const {count: easyMedTotal} = await sb.from('sim_medium_pattern_stats').select('*',{count:'exact',head:true}).eq('sim_policy',EASY_POLICY);
  const {count: easyPosTotal} = await sb.from('sim_position_only_stats').select('*',{count:'exact',head:true}).eq('sim_policy',EASY_POLICY);
  log(`sim_medium_pattern_stats: fh=${medTotal} / easy=${easyMedTotal}`);
  log(`sim_position_only_stats: fh=${posTotal} / easy=${easyPosTotal}`);

  for (const n of [30,50,100,200,500]) {
    const {count:ce} = await sb.from('sim_medium_pattern_stats').select('*',{count:'exact',head:true}).eq('sim_policy',EASY_POLICY).gte('total',n);
    const {count:cf} = await sb.from('sim_medium_pattern_stats').select('*',{count:'exact',head:true}).eq('sim_policy',FH_POLICY).gte('total',n);
    log(`medium total>=${n}: easy=${ce} fh=${cf}`);
  }

  // 初手分布（ファイルヘッダーより）
  log('\n--- 初手分布（ファイルヘッダーより）---');
  log('Fast Hard: Selective=55.0% / Massive=35.7% / Quad=9.3%');
  log('Easy: Selective≈54.5% / Massive≈36.4% / Quad≈9.1%');
  log('→ 初手分布にほぼ偏りなし');

  log('\n--- 終局手数・勝率（ファイルヘッダーより）---');
  log('Fast Hard: 平均手数51.7手 / 黒勝率48.78% / 白勝率51.22%');
  log('Easy: 平均手数56.6手 / 黒勝率≈50.0%');
  log('→ Fast Hardのほうが5手短い（効率的な打ち筋）');
  log('→ 白がやや有利（Fast Hard同士）');

  log('\n--- Postmortem fallbackへの適用可能性 ---');
  log(`medium total>=30: ${(await sb.from('sim_medium_pattern_stats').select('*',{count:'exact',head:true}).eq('sim_policy',FH_POLICY).gte('total',30)).count}`);
  log(`position_only total>=100: ${(await sb.from('sim_position_only_stats').select('*',{count:'exact',head:true}).eq('sim_policy',FH_POLICY).gte('total',100)).count}`);
  log('→ 10,000局では閾値達成パターン数がeasy(100k)より少ない');
  log('→ fallback採用・重みは統計確認後にNaoya判断');

  log('\n=== Report 3 完了 ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
