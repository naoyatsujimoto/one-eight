/**
 * rebuild_sim_medium_s14b.ts
 *
 * sim_medium_pattern_stats を sim_batch_id ごとに分割処理で再構築。
 * 全パターンをメモリに保持しないため SIGKILL を回避する。
 *
 * 方式:
 *   sim_medium_pattern_stats は既に 0 件の前提で開始。
 *   各 sim_batch_id（10,000局ずつ）を順番に処理し、
 *   その都度 upsert（既存分とのマージ）を行う。
 *
 * ORDER BY: sim_batch_id, game_index で安定ページネーション
 * 制約: 実戦テーブルに一切触れない / sim_match_logs は削除しない
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('ERROR: env missing'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const SIM_POLICY = 'easy_vs_easy';
const GAME_PAGE = 500;
const UPSERT_CHUNK = 500;
const EXISTING_PAGE = 500;

type MedStat = {
  medium_pattern_id: string;
  sim_policy: string;
  wins_black: number;
  wins_white: number;
  draws: number;
  total: number;
};

async function processBatch(batchId: string): Promise<{ patterns: number; games: number; moves: number; upserted: number; errors: number }> {
  // Step A: このバッチの全ゲームをスキャンして集計
  const newStats = new Map<string, MedStat>();
  let gameCount = 0;
  let moveCount = 0;
  let skipCount = 0;
  let off = 0;

  while (true) {
    const { data, error } = await supabase
      .from('sim_match_logs')
      .select('winner, full_record, game_index')
      .eq('sim_batch_id', batchId)
      .order('game_index', { ascending: true })
      .range(off, off + GAME_PAGE - 1);

    if (error) { console.error(`  scan error (${batchId}): ${error.message}`); break; }
    if (!data || data.length === 0) break;

    for (const row of data as { winner: string; full_record: { medium_pattern_id?: string }[] }[]) {
      if (!row.winner) { skipCount++; continue; }
      const pids = row.full_record.map(m => m.medium_pattern_id).filter((p): p is string => !!p);
      moveCount += pids.length;
      const unique = [...new Set(pids)];
      for (const pid of unique) {
        const cur = newStats.get(pid) ?? { medium_pattern_id: pid, sim_policy: SIM_POLICY, wins_black: 0, wins_white: 0, draws: 0, total: 0 };
        cur.wins_black += row.winner === 'black' ? 1 : 0;
        cur.wins_white += row.winner === 'white' ? 1 : 0;
        cur.draws      += row.winner === 'draw'  ? 1 : 0;
        cur.total      += 1;
        newStats.set(pid, cur);
      }
      gameCount++;
    }
    off += GAME_PAGE;
    if ((data as unknown[]).length < GAME_PAGE) break;
  }

  // Step B: 既存の sim_medium_pattern_stats をこのバッチのパターンキーで取得
  const pids = [...newStats.keys()];
  const existingMap = new Map<string, MedStat>();

  for (let i = 0; i < pids.length; i += 1000) {
    const chunk = pids.slice(i, i + 1000);
    const { data: exData, error: exErr } = await supabase
      .from('sim_medium_pattern_stats')
      .select('medium_pattern_id, sim_policy, wins_black, wins_white, draws, total')
      .eq('sim_policy', SIM_POLICY)
      .in('medium_pattern_id', chunk);
    if (exErr) { console.error(`  existing fetch error: ${exErr.message}`); continue; }
    for (const row of (exData ?? []) as MedStat[]) {
      existingMap.set(row.medium_pattern_id, row);
    }
  }

  // Step C: マージ
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
      merged.push({ ...newStat });
    }
  }

  // Step D: upsert
  let upserted = 0;
  let errors = 0;
  for (let i = 0; i < merged.length; i += UPSERT_CHUNK) {
    const chunk = merged.slice(i, i + UPSERT_CHUNK);
    const { error: upsertErr } = await supabase
      .from('sim_medium_pattern_stats')
      .upsert(chunk, { onConflict: 'medium_pattern_id,sim_policy' });
    if (upsertErr) { console.error(`  upsert error: ${upsertErr.message}`); errors += chunk.length; }
    else upserted += chunk.length;
  }

  return { patterns: newStats.size, games: gameCount, moves: moveCount, upserted, errors };
}

async function main() {
  console.log('=== rebuild_sim_medium_s14b.ts ===');
  console.log('方式: sim_batch_id 分割処理（メモリ節約）');
  console.log(`sim_policy: ${SIM_POLICY}\n`);

  // 実戦テーブル事前確認
  const { count: ml0 } = await supabase.from('match_logs').select('*', { count: 'exact', head: true });
  const { count: ps0 } = await supabase.from('position_stats').select('*', { count: 'exact', head: true });
  console.log(`[事前] match_logs: ${ml0} 件 / position_stats: ${ps0} 件（変更しない）\n`);

  // 現在の sim_medium_pattern_stats 件数
  const { count: startCount } = await supabase
    .from('sim_medium_pattern_stats').select('*', { count: 'exact', head: true }).eq('sim_policy', SIM_POLICY);
  console.log(`sim_medium_pattern_stats 開始時: ${startCount} 件`);

  // sim_batch_id 一覧を取得（ORDER BY で安定）
  const batchSet = new Set<string>();
  let boff = 0;
  while (true) {
    const { data, error } = await supabase
      .from('sim_match_logs')
      .select('sim_batch_id')
      .order('sim_batch_id', { ascending: true })
      .range(boff, boff + 999);
    if (error || !data || data.length === 0) break;
    for (const r of data as { sim_batch_id: string }[]) batchSet.add(r.sim_batch_id);
    boff += 1000;
    if (data.length < 1000) break;
  }
  const batches = [...batchSet].sort();
  console.log(`対象 sim_batch_id: ${batches.length} バッチ`);
  console.log(batches.join(', '), '\n');

  // 各バッチを処理
  let totalGames = 0;
  let totalMoves = 0;
  let totalUpserted = 0;
  let totalErrors = 0;

  for (let i = 0; i < batches.length; i++) {
    const batchId = batches[i];
    process.stdout.write(`[${i + 1}/${batches.length}] ${batchId} 処理中...\r`);
    const result = await processBatch(batchId);
    totalGames    += result.games;
    totalMoves    += result.moves;
    totalUpserted += result.upserted;
    totalErrors   += result.errors;
    const { count: cur } = await supabase
      .from('sim_medium_pattern_stats').select('*', { count: 'exact', head: true }).eq('sim_policy', SIM_POLICY);
    console.log(`[${i + 1}/${batches.length}] ${batchId}: games=${result.games} patterns=${result.patterns} upserted=${result.upserted} errors=${result.errors} | 累計 total=${cur}`);
  }

  // 最終確認
  console.log('\n--- 最終確認 ---');
  const { count: finalCount } = await supabase
    .from('sim_medium_pattern_stats').select('*', { count: 'exact', head: true }).eq('sim_policy', SIM_POLICY);
  console.log(`sim_medium_pattern_stats 総行数: ${finalCount} 件`);
  console.log(`rebuild対象局数: ${totalGames} / 手数: ${totalMoves} / upsert合計: ${totalUpserted} / errors: ${totalErrors}`);

  for (const n of [30, 50, 100, 200, 500]) {
    const { count: c } = await supabase.from('sim_medium_pattern_stats')
      .select('*', { count: 'exact', head: true }).eq('sim_policy', SIM_POLICY).gte('total', n);
    console.log(`total>=${n}: ${c} 件`);
  }

  const { data: topRow } = await supabase.from('sim_medium_pattern_stats')
    .select('total').eq('sim_policy', SIM_POLICY).order('total', { ascending: false }).limit(1);
  console.log(`最大 total: ${(topRow as { total: number }[] | null)?.[0]?.total ?? 0}`);

  const targetPid = '06865a5f36ac5df5:1011';
  const { data: tp } = await supabase.from('sim_medium_pattern_stats')
    .select('total, wins_black, wins_white, draws')
    .eq('medium_pattern_id', targetPid).eq('sim_policy', SIM_POLICY);
  const tRow = (tp as { total: number; wins_black: number; wins_white: number; draws: number }[] | null)?.[0];
  if (tRow) {
    console.log(`\npattern ${targetPid}: total=${tRow.total} (前回正式基準:10, +${tRow.total - 10})`);
    console.log(`  wins_black=${tRow.wins_black}, wins_white=${tRow.wins_white}, draws=${tRow.draws}`);
    console.log(`  total>=30: ${tRow.total >= 30 ? '✅ 到達' : `❌ 未達 (${tRow.total}/30)`}`);
  } else {
    console.log(`\npattern ${targetPid}: レコードなし`);
  }

  // 汚染チェック
  const { count: ml1 } = await supabase.from('match_logs').select('*', { count: 'exact', head: true });
  const { count: ps1 } = await supabase.from('position_stats').select('*', { count: 'exact', head: true });
  console.log(`\nmatch_logs: ${ml1} (${ml0 === ml1 ? '✅ 変化なし' : '❌ 変化あり'})`);
  console.log(`position_stats: ${ps1} (${ps0 === ps1 ? '✅ 変化なし' : '❌ 変化あり'})`);

  console.log('\n=== rebuild 完了 ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
