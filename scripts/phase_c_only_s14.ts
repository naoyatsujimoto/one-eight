/**
 * phase_c_only_s14.ts
 *
 * sim_batch_id=easy_20260512_014 の sim_medium_pattern_stats への
 * 差分 upsert のみを実行する。
 *
 * Phase A / B はスキップ。Phase C のみ。
 * - aggregate_medium_pattern_stats RPC には依存しない
 * - 直接 upsert 方式
 * - 1ゲーム内 medium_pattern_id 重複除去あり
 * - 実戦テーブルに一切触れない
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('ERROR: env missing'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const SIM_BATCH_ID = 'easy_20260512_014';
const SIM_POLICY = 'easy_vs_easy';
const PAGE = 500;
const UPSERT_CHUNK = 500;

type MedStat = {
  medium_pattern_id: string;
  sim_policy: string;
  wins_black: number;
  wins_white: number;
  draws: number;
  total: number;
};

async function main() {
  console.log('=== phase_c_only_s14.ts ===');
  console.log(`sim_batch_id: ${SIM_BATCH_ID}`);
  console.log(`sim_policy  : ${SIM_POLICY}`);
  console.log('');

  // Step 0: 実戦テーブル事前確認
  console.log('--- Step 0: 実戦テーブル事前確認 ---');
  const { count: ml0 } = await supabase.from('match_logs').select('*', { count: 'exact', head: true });
  const { count: ps0 } = await supabase.from('position_stats').select('*', { count: 'exact', head: true });
  console.log(`match_logs: ${ml0} 件`);
  console.log(`position_stats: ${ps0} 件`);
  console.log('（これらは変更しない）\n');

  // Step 1: batch_014 の件数確認
  console.log('--- Step 1: batch_014 確認 ---');
  const { count: batchCount } = await supabase
    .from('sim_match_logs')
    .select('*', { count: 'exact', head: true })
    .eq('sim_batch_id', SIM_BATCH_ID);
  console.log(`sim_match_logs (batch_014): ${batchCount} 件`);
  const { count: totalCount } = await supabase
    .from('sim_match_logs')
    .select('*', { count: 'exact', head: true });
  console.log(`sim_match_logs 総件数: ${totalCount} 件`);

  // Step 2: sim_medium_pattern_stats 現在値確認
  console.log('\n--- Step 2: sim_medium_pattern_stats 現在値 ---');
  const { count: beforeCount } = await supabase
    .from('sim_medium_pattern_stats')
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', SIM_POLICY);
  console.log(`現在の総行数: ${beforeCount} 件\n`);

  // Step 3: batch_014 のみスキャン → 集計
  console.log('--- Step 3: batch_014 スキャン & 集計 ---');

  const newStats = new Map<string, MedStat>();
  let gameCount = 0;
  let skipCount = 0;
  let off = 0;

  while (true) {
    const { data, error } = await supabase
      .from('sim_match_logs')
      .select('winner, full_record')
      .eq('sim_batch_id', SIM_BATCH_ID)
      .range(off, off + PAGE - 1);

    if (error) { console.error(`scan error: ${error.message}`); process.exit(1); }
    if (!data || data.length === 0) break;

    for (const row of data as { winner: string; full_record: { medium_pattern_id?: string }[] }[]) {
      if (!row.winner) { skipCount++; continue; }

      const pids = row.full_record
        .map(m => m.medium_pattern_id)
        .filter((p): p is string => !!p);

      if (pids.length === 0) { skipCount++; continue; }

      // 1ゲーム内重複除去
      const unique = [...new Set(pids)];
      for (const pid of unique) {
        const cur = newStats.get(pid) ?? {
          medium_pattern_id: pid,
          sim_policy: SIM_POLICY,
          wins_black: 0,
          wins_white: 0,
          draws: 0,
          total: 0,
        };
        cur.wins_black += row.winner === 'black' ? 1 : 0;
        cur.wins_white += row.winner === 'white' ? 1 : 0;
        cur.draws      += row.winner === 'draw'  ? 1 : 0;
        cur.total      += 1;
        newStats.set(pid, cur);
      }
      gameCount++;
    }

    off += PAGE;
    process.stdout.write(`  scan: ${off} / patterns=${newStats.size}\r`);
    if ((data as unknown[]).length < PAGE) break;
  }

  console.log(`\nscan完了: ${gameCount} ゲーム / ${newStats.size} unique patterns / skip=${skipCount}`);

  // Step 4: 既存 sim_medium_pattern_stats を全件取得（マージ用）
  console.log('\n--- Step 4: 既存データ取得 ---');
  const existingMap = new Map<string, MedStat>();
  let exOff = 0;

  while (true) {
    const { data: exData, error: exErr } = await supabase
      .from('sim_medium_pattern_stats')
      .select('medium_pattern_id, sim_policy, wins_black, wins_white, draws, total')
      .eq('sim_policy', SIM_POLICY)
      .range(exOff, exOff + PAGE - 1);

    if (exErr) { console.error(`既存取得エラー: ${exErr.message}`); break; }
    if (!exData || exData.length === 0) break;

    for (const row of exData as MedStat[]) {
      existingMap.set(row.medium_pattern_id, row);
    }
    exOff += PAGE;
    process.stdout.write(`  既存取得: ${existingMap.size} 件\r`);
    if ((exData as unknown[]).length < PAGE) break;
  }
  console.log(`\n既存取得完了: ${existingMap.size} 件`);

  // Step 5: マージ
  console.log('\n--- Step 5: マージ ---');
  const merged: MedStat[] = [];
  for (const [pid, newStat] of newStats) {
    const ex = existingMap.get(pid);
    if (ex) {
      merged.push({
        medium_pattern_id: pid,
        sim_policy: SIM_POLICY,
        wins_black: ex.wins_black + newStat.wins_black,
        wins_white: ex.wins_white + newStat.wins_white,
        draws:      ex.draws      + newStat.draws,
        total:      ex.total      + newStat.total,
      });
    } else {
      merged.push({
        medium_pattern_id: pid,
        sim_policy: SIM_POLICY,
        wins_black: newStat.wins_black,
        wins_white: newStat.wins_white,
        draws:      newStat.draws,
        total:      newStat.total,
      });
    }
  }
  console.log(`マージ完了: ${merged.length} 件（既存更新 + 新規）`);

  // Step 6: バルク upsert
  console.log('\n--- Step 6: バルク upsert ---');
  let upsertedOk = 0;
  let upsertErrors = 0;

  for (let i = 0; i < merged.length; i += UPSERT_CHUNK) {
    const chunk = merged.slice(i, i + UPSERT_CHUNK);
    const { error: upsertErr } = await supabase
      .from('sim_medium_pattern_stats')
      .upsert(chunk, { onConflict: 'medium_pattern_id,sim_policy' });
    if (upsertErr) {
      console.error(`\nUPSERT ERROR (chunk ${i}~${i + chunk.length}): ${upsertErr.message}`);
      upsertErrors += chunk.length;
    } else {
      upsertedOk += chunk.length;
    }
    process.stdout.write(`  upsert: ${upsertedOk + upsertErrors}/${merged.length} 件\r`);
  }
  console.log(`\nPhase C 完了: success=${upsertedOk} error=${upsertErrors}`);

  // Step 7: 結果確認
  console.log('\n--- Step 7: 結果確認 ---');
  const { count: afterCount } = await supabase
    .from('sim_medium_pattern_stats')
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', SIM_POLICY);
  console.log(`sim_medium_pattern_stats 総行数: ${afterCount} 件 (前回: ${beforeCount})`);

  for (const n of [30, 50, 100, 200, 500]) {
    const { count: c } = await supabase
      .from('sim_medium_pattern_stats')
      .select('*', { count: 'exact', head: true })
      .eq('sim_policy', SIM_POLICY)
      .gte('total', n);
    console.log(`total>=${n}: ${c} 件`);
  }

  const { data: topRow } = await supabase
    .from('sim_medium_pattern_stats')
    .select('medium_pattern_id, total')
    .eq('sim_policy', SIM_POLICY)
    .order('total', { ascending: false })
    .limit(1);
  const maxTotal = (topRow as { total: number }[] | null)?.[0]?.total ?? 0;
  console.log(`最大 total: ${maxTotal}`);

  // 対象 pattern
  const targetPid = '06865a5f36ac5df5:1011';
  const { data: tp } = await supabase
    .from('sim_medium_pattern_stats')
    .select('total, wins_black, wins_white, draws')
    .eq('medium_pattern_id', targetPid)
    .eq('sim_policy', SIM_POLICY);
  const tRow = (tp as { total: number; wins_black: number; wins_white: number; draws: number }[] | null)?.[0];
  console.log(`\npattern ${targetPid}:`);
  if (tRow) {
    console.log(`  total=${tRow.total} (前回: 10, 増加: +${tRow.total - 10})`);
    console.log(`  wins_black=${tRow.wins_black}, wins_white=${tRow.wins_white}, draws=${tRow.draws}`);
    console.log(`  total>=30: ${tRow.total >= 30 ? '✅ 到達' : `❌ 未達 (${tRow.total}/30)`}`);
  } else {
    console.log('  レコードなし');
  }

  // 実戦テーブル汚染チェック
  console.log('\n--- 実戦テーブル汚染チェック ---');
  const { count: ml1 } = await supabase.from('match_logs').select('*', { count: 'exact', head: true });
  const { count: ps1 } = await supabase.from('position_stats').select('*', { count: 'exact', head: true });
  console.log(`match_logs: ${ml1} 件 (事前=${ml0} → ${ml0 === ml1 ? '✅ 変化なし' : '❌ 変化あり'})`);
  console.log(`position_stats: ${ps1} 件 (事前=${ps0} → ${ps0 === ps1 ? '✅ 変化なし' : '❌ 変化あり'})`);

  console.log('\n=== Phase C 完了 ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
