/**
 * phase_c_med_s15.ts
 *
 * sim_batch_id=easy_20260512_015 の medium_pattern_stats への差分 upsert。
 * import_sim_easy_s15.ts（Phase A/B）完了後に実行する。
 *
 * 設計:
 *   - easy_20260512_015 のみをスキャン（全量保持禁止）
 *   - 同一ゲーム内 medium_pattern_id 重複除去
 *   - 既存値の取得は .in() 100件チャンク（Bad Request防止）
 *   - ORDER BY 付きページネーション
 *   - upsert チャンク 500件
 *   - 実戦テーブルに一切触れない
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('ERROR: env missing'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const SIM_BATCH_ID  = 'easy_20260512_015';
const SIM_POLICY    = 'easy_vs_easy';
const SCAN_PAGE     = 500;
const IN_CHUNK      = 100;   // .in() 最大件数（Bad Request防止）
const UPSERT_CHUNK  = 500;

type MedStat = {
  medium_pattern_id: string; sim_policy: string;
  wins_black: number; wins_white: number; draws: number; total: number;
};

async function main() {
  console.log('=== phase_c_med_s15.ts ===');
  console.log(`sim_batch_id: ${SIM_BATCH_ID}`);
  console.log(`sim_policy  : ${SIM_POLICY}\n`);

  // 事前確認
  const {count: ml0} = await supabase.from('match_logs').select('*',{count:'exact',head:true});
  const {count: ps0} = await supabase.from('position_stats').select('*',{count:'exact',head:true});
  console.log(`[事前] match_logs: ${ml0} / position_stats: ${ps0}`);

  const {count: batchCount} = await supabase.from('sim_match_logs')
    .select('*',{count:'exact',head:true}).eq('sim_batch_id', SIM_BATCH_ID);
  console.log(`sim_match_logs (${SIM_BATCH_ID}): ${batchCount} 件`);
  const {count: beforeMed} = await supabase.from('sim_medium_pattern_stats')
    .select('*',{count:'exact',head:true}).eq('sim_policy', SIM_POLICY);
  console.log(`sim_medium_pattern_stats 現在: ${beforeMed} 件\n`);

  if (!batchCount || batchCount === 0) {
    console.error('ERROR: batch_015 が sim_match_logs に存在しません。先に import_sim_easy_s15.ts を実行してください。');
    process.exit(1);
  }

  // ─── Step 1: batch_015 スキャン & 集計 ─────────────────────────────────
  console.log('--- Step 1: batch_015 スキャン & 集計 (ORDER BY game_index) ---');

  const newStats = new Map<string, MedStat>();
  let gameCount = 0, skipCount = 0, scanOff = 0;

  while (true) {
    const {data, error} = await supabase.from('sim_match_logs')
      .select('winner, full_record')
      .eq('sim_batch_id', SIM_BATCH_ID)
      .order('game_index', {ascending: true})
      .range(scanOff, scanOff + SCAN_PAGE - 1);

    if (error) { console.error(`scan error: ${error.message}`); process.exit(1); }
    if (!data || data.length === 0) break;

    for (const row of data as {winner:string; full_record:{medium_pattern_id?:string}[]}[]) {
      if (!row.winner) { skipCount++; continue; }
      const pids = row.full_record.map(m=>m.medium_pattern_id).filter((p):p is string => !!p);
      if (pids.length === 0) { skipCount++; continue; }
      const unique = [...new Set(pids)];
      for (const pid of unique) {
        const cur = newStats.get(pid) ?? {medium_pattern_id:pid, sim_policy:SIM_POLICY, wins_black:0, wins_white:0, draws:0, total:0};
        cur.wins_black += row.winner==='black' ? 1 : 0;
        cur.wins_white += row.winner==='white' ? 1 : 0;
        cur.draws      += row.winner==='draw'  ? 1 : 0;
        cur.total      += 1;
        newStats.set(pid, cur);
      }
      gameCount++;
    }
    scanOff += SCAN_PAGE;
    process.stdout.write(`  scan: ${scanOff} / patterns=${newStats.size}\r`);
    if (data.length < SCAN_PAGE) break;
  }
  console.log(`\nscan完了: ${gameCount} ゲーム / ${newStats.size} patterns / skip=${skipCount}`);

  // ─── Step 2: 既存値取得 & マージ & upsert（100件チャンク）──────────────────
  console.log('\n--- Step 2: 既存値取得 → マージ → upsert ---');

  const pids = [...newStats.keys()];
  let upsertOk = 0, upsertErr = 0;
  let processed = 0;

  // pids を UPSERT_CHUNK 単位で処理
  for (let i = 0; i < pids.length; i += UPSERT_CHUNK) {
    const chunkPids = pids.slice(i, i + UPSERT_CHUNK);

    // 既存値を IN_CHUNK=100 件ずつ取得
    const existingMap = new Map<string, MedStat>();
    for (let j = 0; j < chunkPids.length; j += IN_CHUNK) {
      const sub = chunkPids.slice(j, j + IN_CHUNK);
      const {data: exData, error: exErr} = await supabase
        .from('sim_medium_pattern_stats')
        .select('medium_pattern_id, sim_policy, wins_black, wins_white, draws, total')
        .eq('sim_policy', SIM_POLICY)
        .in('medium_pattern_id', sub);
      if (exErr) { console.error(`\n既存取得エラー: ${exErr.message}`); }
      else for (const r of (exData ?? []) as MedStat[]) existingMap.set(r.medium_pattern_id, r);
    }

    // マージ
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

    // upsert
    const {error: upErr} = await supabase.from('sim_medium_pattern_stats')
      .upsert(merged, {onConflict: 'medium_pattern_id,sim_policy'});
    if (upErr) { console.error(`\nupsert error: ${upErr.message}`); upsertErr += merged.length; }
    else upsertOk += merged.length;

    processed += chunkPids.length;
    process.stdout.write(`  upsert: ${processed}/${pids.length} ok=${upsertOk} err=${upsertErr}\r`);
  }
  console.log(`\nPhase C 完了: upsert ok=${upsertOk} error=${upsertErr}`);

  // ─── 結果確認 ────────────────────────────────────────────────────────────
  console.log('\n--- 結果確認 ---');
  const {count: afterMed} = await supabase.from('sim_medium_pattern_stats')
    .select('*',{count:'exact',head:true}).eq('sim_policy', SIM_POLICY);
  console.log(`sim_medium_pattern_stats: ${afterMed} (前回: ${beforeMed})`);

  for (const n of [30,50,100,200,500]) {
    const {count:c} = await supabase.from('sim_medium_pattern_stats')
      .select('*',{count:'exact',head:true}).eq('sim_policy',SIM_POLICY).gte('total',n);
    console.log(`total>=${n}: ${c}`);
  }
  const {data: top} = await supabase.from('sim_medium_pattern_stats')
    .select('total').eq('sim_policy',SIM_POLICY).order('total',{ascending:false}).limit(1);
  console.log(`最大 total: ${(top as {total:number}[]|null)?.[0]?.total ?? 0}`);

  // 対象 pattern
  const {data: tp} = await supabase.from('sim_medium_pattern_stats')
    .select('total,wins_black,wins_white,draws')
    .eq('medium_pattern_id','06865a5f36ac5df5:1011').eq('sim_policy',SIM_POLICY);
  const tr = (tp as {total:number;wins_black:number;wins_white:number;draws:number}[]|null)?.[0];
  if (tr) {
    console.log(`\npattern 06865a5f36ac5df5:1011: total=${tr.total} (前回:10, +${tr.total-10})`);
    console.log(`  >=30: ${tr.total>=30?'✅ 到達':'❌ 未達 ('+tr.total+'/30)'}`);
  } else console.log('\npattern 06865a5f36ac5df5:1011: レコードなし');

  // 異常検知
  const base = {ge30:2297, ge50:1203, ge100:435, maxTotal:15359};
  const cur30 = await supabase.from('sim_medium_pattern_stats').select('*',{count:'exact',head:true}).eq('sim_policy',SIM_POLICY).gte('total',30);
  console.log(`\n【異常検知】`);
  console.log(`total>=30: ${cur30.count} (基準:${base.ge30}) ${(cur30.count??0)>=base.ge30?'✅':'❌ 減少異常'}`);

  // 汚染チェック
  const {count:ml1}=await supabase.from('match_logs').select('*',{count:'exact',head:true});
  const {count:ps1}=await supabase.from('position_stats').select('*',{count:'exact',head:true});
  console.log(`\nmatch_logs: ${ml1} (${ml0===ml1?'✅ 変化なし':'❌ 変化あり'})`);
  console.log(`position_stats: ${ps1} (${ps0===ps1?'✅ 変化なし':'❌ 変化あり'})`);

  console.log('\n=== Phase C 完了 ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
