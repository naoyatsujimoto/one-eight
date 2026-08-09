/**
 * phase_c_fvhard_009.ts
 *
 * sim_batch_id=fvhard_20260806_009 の sim_medium_pattern_stats への差分 upsert。
 * import_fvhard_009.ts（Phase A）完了後に実行する。
 *
 * 実行方法:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   nohup node_modules/.bin/vite-node /tmp/phase_c_fvhard_009.ts > /tmp/phase_c_fvhard_009.log 2>&1 &
 *   tail -f /tmp/phase_c_fvhard_009.log
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
} catch { /* */ }

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('ERROR: env missing'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const SIM_BATCH_ID = 'fvhard_20260806_009';
const SIM_POLICY   = 'fastveryhard_vs_fastveryhard';
const SCAN_PAGE    = 500;
const IN_CHUNK     = 100;
const UPSERT_CHUNK = 500;

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

type MedStat = {
  medium_pattern_id: string; sim_policy: string;
  wins_black: number; wins_white: number; draws: number; total: number;
};

async function main() {
  log('=== phase_c_fvhard_009.ts (Run 9) ===');
  log(`sim_batch_id: ${SIM_BATCH_ID}`);
  log(`sim_policy  : ${SIM_POLICY}\n`);

  // ── 実戦テーブル事前確認 ──
  const {count: ml0} = await supabase.from('match_logs').select('*',{count:'exact',head:true});
  const {count: ps0} = await supabase.from('position_stats').select('*',{count:'exact',head:true});
  const {count: mps0} = await supabase.from('medium_pattern_stats').select('*',{count:'exact',head:true});
  const {count: sgs0} = await supabase.from('symmetry_group_stats').select('*',{count:'exact',head:true});
  const {count: psl0} = await supabase.from('position_stats_ledger').select('*',{count:'exact',head:true});
  log(`[事前] match_logs=${ml0} / position_stats=${ps0} / medium_pattern_stats=${mps0}`);
  log(`[事前] symmetry_group_stats=${sgs0} / position_stats_ledger=${psl0}（変更しない）`);

  // ── 他 policy 事前確認 ──
  const {count: fhMedBefore} = await supabase.from('sim_medium_pattern_stats')
    .select('*',{count:'exact',head:true}).eq('sim_policy','fast_hard_vs_fast_hard');
  const {count: easyMedBefore} = await supabase.from('sim_medium_pattern_stats')
    .select('*',{count:'exact',head:true}).eq('sim_policy','easy_vs_easy');
  log(`[事前] sim_medium_pattern_stats(fast_hard): ${fhMedBefore}（変更しない）`);
  log(`[事前] sim_medium_pattern_stats(easy_vs_easy): ${easyMedBefore}（変更しない）`);

  // ── バッチ確認 ──
  const {count: batchCount} = await supabase.from('sim_match_logs')
    .select('*',{count:'exact',head:true}).eq('sim_batch_id', SIM_BATCH_ID);
  log(`sim_match_logs (${SIM_BATCH_ID}): ${batchCount} 件`);

  if (!batchCount || batchCount === 0) {
    log('ERROR: バッチが sim_match_logs に存在しません。先に import_fvhard_009.ts を実行してください。');
    process.exit(1);
  }
  if (batchCount !== 10000) {
    log(`[ERROR] バッチ件数が 10000 ではありません: ${batchCount} — Phase A を再確認してください`);
    process.exit(1);
  }

  // ── Phase C 未実行確認（二重実行防止） ──
  // Run 9 のデータが既に medium_pattern_stats に反映済みかどうか確認するため、
  // Phase C 実行前後の件数増加で代わりに判定。ここではスキャン前の件数を記録する。
  const {count: beforeMed} = await supabase.from('sim_medium_pattern_stats')
    .select('*',{count:'exact',head:true}).eq('sim_policy', SIM_POLICY);
  log(`sim_medium_pattern_stats (${SIM_POLICY}) 現在: ${beforeMed} 件\n`);

  // ── Step 1: バッチスキャン & 集計 ──
  log('--- Step 1: バッチスキャン & 集計 (ORDER BY game_index) ---');

  const newStats = new Map<string, MedStat>();
  let gameCount = 0, skipCount = 0, scanOff = 0;

  while (true) {
    const {data, error} = await supabase.from('sim_match_logs')
      .select('winner, full_record')
      .eq('sim_batch_id', SIM_BATCH_ID)
      .order('game_index', {ascending: true})
      .range(scanOff, scanOff + SCAN_PAGE - 1);

    if (error) { log(`scan error: ${error.message}`); process.exit(1); }
    if (!data || data.length === 0) break;

    for (const row of data as {winner:string; full_record:{medium_pattern_id?:string}[]}[]) {
      if (!row.winner) { skipCount++; continue; }
      if (!Array.isArray(row.full_record) || row.full_record.length === 0) { skipCount++; continue; }

      const pids = row.full_record
        .map(m => m.medium_pattern_id)
        .filter((p): p is string => !!p);
      if (pids.length === 0) { skipCount++; continue; }

      // 1局内で同じmedium_pattern_idが複数出現しても1回だけ集計
      const unique = [...new Set(pids)];
      for (const pid of unique) {
        const cur = newStats.get(pid) ?? {
          medium_pattern_id: pid, sim_policy: SIM_POLICY,
          wins_black: 0, wins_white: 0, draws: 0, total: 0,
        };
        cur.wins_black += row.winner === 'black' ? 1 : 0;
        cur.wins_white += row.winner === 'white' ? 1 : 0;
        cur.draws      += row.winner === 'draw'  ? 1 : 0;
        cur.total      += 1;
        newStats.set(pid, cur);
      }
      gameCount++;
    }
    scanOff += SCAN_PAGE;
    process.stdout.write(`  scan: ${scanOff} / patterns=${newStats.size}\r`);
    if (data.length < SCAN_PAGE) break;
  }
  log(`\nscan完了: ${gameCount} ゲーム / ${newStats.size} patterns / skip=${skipCount}`);

  if (skipCount > 0) {
    log(`[WARN] skip=${skipCount} 件（winner未設定または full_record 空）`);
  }

  // ── Step 2: 既存値取得 → マージ → upsert ──
  log('\n--- Step 2: 既存値取得 → マージ → upsert ---');

  const pids = [...newStats.keys()];
  let upsertOk = 0, upsertErr = 0, processed = 0;

  for (let i = 0; i < pids.length; i += UPSERT_CHUNK) {
    const chunkPids = pids.slice(i, i + UPSERT_CHUNK);

    const existingMap = new Map<string, MedStat>();
    for (let j = 0; j < chunkPids.length; j += IN_CHUNK) {
      const sub = chunkPids.slice(j, j + IN_CHUNK);
      const {data: exData, error: exErr} = await supabase
        .from('sim_medium_pattern_stats')
        .select('medium_pattern_id, sim_policy, wins_black, wins_white, draws, total')
        .eq('sim_policy', SIM_POLICY)
        .in('medium_pattern_id', sub);
      if (exErr) { log(`\n既存取得エラー: ${exErr.message}`); }
      else for (const r of (exData ?? []) as MedStat[]) existingMap.set(r.medium_pattern_id, r);
    }

    const merged: MedStat[] = chunkPids.map(pid => {
      const n = newStats.get(pid)!;
      const ex = existingMap.get(pid);
      if (ex) return {
        medium_pattern_id: pid, sim_policy: SIM_POLICY,
        wins_black: ex.wins_black + n.wins_black,
        wins_white: ex.wins_white + n.wins_white,
        draws:      ex.draws      + n.draws,
        total:      ex.total      + n.total,
      };
      return { ...n };
    });

    const {error: upErr} = await supabase.from('sim_medium_pattern_stats')
      .upsert(merged, {onConflict: 'medium_pattern_id,sim_policy'});
    if (upErr) {
      log(`\nupsert error: ${upErr.message}`);
      log('[ERROR] 途中失敗が発生しました。スクリプトを再実行せず差分監査を行ってください。');
      upsertErr += merged.length;
      // 部分成功の可能性があるため即時停止
      process.exit(1);
    }
    upsertOk += merged.length;

    processed += chunkPids.length;
    process.stdout.write(`  upsert: ${processed}/${pids.length} ok=${upsertOk} err=${upsertErr}\r`);
  }
  log(`\nPhase C 完了: upsert ok=${upsertOk} error=${upsertErr}`);

  // ── 結果確認 ──
  log('\n--- 結果確認 ---');
  const {count: afterMed} = await supabase.from('sim_medium_pattern_stats')
    .select('*',{count:'exact',head:true}).eq('sim_policy', SIM_POLICY);
  log(`sim_medium_pattern_stats (${SIM_POLICY}): ${afterMed} (前回: ${beforeMed})`);

  if ((afterMed ?? 0) < (beforeMed ?? 0)) {
    log(`[ERROR] 件数が減少しています！前回: ${beforeMed} → 今回: ${afterMed}`);
    process.exit(1);
  }

  for (const n of [30, 50, 100, 200, 500]) {
    const {count: c} = await supabase.from('sim_medium_pattern_stats')
      .select('*',{count:'exact',head:true}).eq('sim_policy', SIM_POLICY).gte('total', n);
    log(`total>=${n}: ${c}`);
  }

  const {data: top} = await supabase.from('sim_medium_pattern_stats')
    .select('total').eq('sim_policy', SIM_POLICY).order('total',{ascending:false}).limit(1);
  log(`MAX total: ${(top as {total:number}[]|null)?.[0]?.total ?? 0}`);

  log(`\nRun 9 から抽出した unique medium pattern 数: ${newStats.size}`);
  log(`skip 数: ${skipCount}`);
  log(`upsert error 数: ${upsertErr}`);

  // ── 汚染チェック ──
  const {count: fhMedAfter} = await supabase.from('sim_medium_pattern_stats')
    .select('*',{count:'exact',head:true}).eq('sim_policy','fast_hard_vs_fast_hard');
  const {count: easyMedAfter} = await supabase.from('sim_medium_pattern_stats')
    .select('*',{count:'exact',head:true}).eq('sim_policy','easy_vs_easy');
  log(`\nsim_medium_pattern_stats(fast_hard): ${fhMedAfter} (${fhMedBefore===fhMedAfter?'✅ 変化なし':'❌ 汚染'})`);
  log(`sim_medium_pattern_stats(easy_vs_easy): ${easyMedAfter} (${easyMedBefore===easyMedAfter?'✅ 変化なし':'❌ 汚染'})`);

  // 実戦テーブル不変確認
  const {count: ml1} = await supabase.from('match_logs').select('*',{count:'exact',head:true});
  const {count: ps1} = await supabase.from('position_stats').select('*',{count:'exact',head:true});
  const {count: mps1} = await supabase.from('medium_pattern_stats').select('*',{count:'exact',head:true});
  const {count: sgs1} = await supabase.from('symmetry_group_stats').select('*',{count:'exact',head:true});
  const {count: psl1} = await supabase.from('position_stats_ledger').select('*',{count:'exact',head:true});
  log(`match_logs: ${ml1} (${ml0===ml1?'✅ 変化なし':'❌ 汚染'})`);
  log(`position_stats: ${ps1} (${ps0===ps1?'✅ 変化なし':'❌ 汚染'})`);
  log(`medium_pattern_stats: ${mps1} (${mps0===mps1?'✅ 変化なし':'❌ 汚染'})`);
  log(`symmetry_group_stats: ${sgs1} (${sgs0===sgs1?'✅ 変化なし':'❌ 汚染'})`);
  log(`position_stats_ledger: ${psl1} (${psl0===psl1?'✅ 変化なし':'❌ 汚染'})`);

  log('\n→ 次: vite-node /tmp/phase_d_fvhard_009.ts を実行');
  log('=== Phase C 完了 ===');
}

main().catch(e => { log(`FATAL: ${e}`); process.exit(1); });
