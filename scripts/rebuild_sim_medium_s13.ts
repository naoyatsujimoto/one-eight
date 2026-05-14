/**
 * rebuild_sim_medium_s13.ts
 *
 * sim_medium_pattern_stats (easy_vs_easy) を全件 DELETE して
 * sim_match_logs 全50,000局から正しく再構築する。
 *
 * 制約:
 *   - 実戦 match_logs / position_stats / medium_pattern_stats には一切触れない
 *   - sim_match_logs は削除しない
 *   - sim_position_stats は対象外
 *   - sim_policy = 'easy_vs_easy' のみ対象
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('ERROR: env missing'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

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
  console.log('=== rebuild_sim_medium_s13.ts ===');
  console.log(`sim_policy: ${SIM_POLICY}`);
  console.log('');

  // ─── Step 0: 実戦テーブル事前確認 ───────────────────────────────────────────
  console.log('--- Step 0: 実戦テーブル事前確認 ---');
  const { count: ml0 } = await supabase.from('match_logs').select('*', { count: 'exact', head: true });
  const { count: ps0 } = await supabase.from('position_stats').select('*', { count: 'exact', head: true });
  console.log(`match_logs: ${ml0} 件`);
  console.log(`position_stats: ${ps0} 件`);
  console.log('（これらは変更しない）\n');

  // ─── Step 1: sim_medium_pattern_stats 現在件数確認 ───────────────────────────
  console.log('--- Step 1: DELETE 前件数確認 ---');
  const { count: beforeCount } = await supabase
    .from('sim_medium_pattern_stats')
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', SIM_POLICY);
  console.log(`DELETE 対象: ${beforeCount} 件 (sim_policy=${SIM_POLICY})\n`);

  // ─── Step 2: sim_match_logs 件数確認 ─────────────────────────────────────────
  console.log('--- Step 2: sim_match_logs 確認 ---');
  const { count: simCount } = await supabase
    .from('sim_match_logs')
    .select('*', { count: 'exact', head: true });
  console.log(`sim_match_logs 総件数: ${simCount} 件\n`);

  // ─── Step 3: sim_match_logs 全件スキャン → 集計 ──────────────────────────────
  console.log('--- Step 3: sim_match_logs スキャン & 集計 ---');

  const statsMap = new Map<string, MedStat>();
  let off = 0;
  let gameCount = 0;
  let moveCount = 0;
  let skipCount = 0;

  while (true) {
    const { data, error } = await supabase
      .from('sim_match_logs')
      .select('winner, full_record')
      .range(off, off + PAGE - 1);
    if (error) { console.error(`scan error: ${error.message}`); process.exit(1); }
    if (!data || data.length === 0) break;

    for (const row of data as { winner: string; full_record: { medium_pattern_id?: string }[] }[]) {
      if (!row.winner) { skipCount++; continue; }

      const pids = row.full_record
        .map(m => m.medium_pattern_id)
        .filter((p): p is string => !!p);

      moveCount += pids.length;

      // 1ゲーム内で同一 pattern_id は重複除去
      const unique = [...new Set(pids)];
      for (const pid of unique) {
        const cur = statsMap.get(pid) ?? {
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
        statsMap.set(pid, cur);
      }
      gameCount++;
    }

    off += PAGE;
    process.stdout.write(`  scan: ${off} / games=${gameCount} / patterns=${statsMap.size}\r`);
    if ((data as unknown[]).length < PAGE) break;
  }

  console.log(`\nscan完了: ${gameCount} ゲーム / ${moveCount} 手 / ${statsMap.size} unique patterns / skip=${skipCount}\n`);

  // ─── Step 4: DELETE sim_medium_pattern_stats ─────────────────────────────────
  console.log('--- Step 4: DELETE sim_medium_pattern_stats ---');

  // Supabase の delete は filter 必須。バッチ削除（neq workaround は不要。全件対象）
  // sim_policy = 'easy_vs_easy' のみ削除
  let deleted = 0;
  while (true) {
    // 削除前に件数確認
    const { count: remaining } = await supabase
      .from('sim_medium_pattern_stats')
      .select('*', { count: 'exact', head: true })
      .eq('sim_policy', SIM_POLICY);
    if (!remaining || remaining === 0) break;

    // 500件ずつ id 取得→削除（idカラムがない場合は medium_pattern_id で対応）
    const { data: rows, error: fetchErr } = await supabase
      .from('sim_medium_pattern_stats')
      .select('medium_pattern_id')
      .eq('sim_policy', SIM_POLICY)
      .limit(500);
    if (fetchErr || !rows || rows.length === 0) break;

    const ids = (rows as { medium_pattern_id: string }[]).map(r => r.medium_pattern_id);
    const { error: delErr } = await supabase
      .from('sim_medium_pattern_stats')
      .delete()
      .eq('sim_policy', SIM_POLICY)
      .in('medium_pattern_id', ids);
    if (delErr) {
      console.error(`DELETE error: ${delErr.message}`);
      process.exit(1);
    }
    deleted += ids.length;
    process.stdout.write(`  deleted: ${deleted}\r`);
  }

  console.log(`\nDELETE 完了: ${deleted} 件`);

  // DELETE 後確認
  const { count: afterDel } = await supabase
    .from('sim_medium_pattern_stats')
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', SIM_POLICY);
  console.log(`DELETE 後 残件数: ${afterDel} 件\n`);

  // ─── Step 5: INSERT (チャンク upsert) ────────────────────────────────────────
  console.log('--- Step 5: INSERT ---');

  const allStats = [...statsMap.values()];
  let insertedOk = 0;
  let insertErrors = 0;

  for (let i = 0; i < allStats.length; i += UPSERT_CHUNK) {
    const chunk = allStats.slice(i, i + UPSERT_CHUNK);
    const { error: insErr } = await supabase
      .from('sim_medium_pattern_stats')
      .insert(chunk);
    if (insErr) {
      console.error(`\nINSERT ERROR (chunk ${i}~${i + chunk.length}): ${insErr.message}`);
      insertErrors += chunk.length;
    } else {
      insertedOk += chunk.length;
    }
    process.stdout.write(`  insert: ${insertedOk + insertErrors}/${allStats.length} 件\r`);
  }

  console.log(`\nINSERT 完了: success=${insertedOk} error=${insertErrors}\n`);

  // ─── Step 6: 結果確認 ────────────────────────────────────────────────────────
  console.log('--- Step 6: 結果確認 ---');

  const { count: finalCount } = await supabase
    .from('sim_medium_pattern_stats')
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', SIM_POLICY);
  console.log(`sim_medium_pattern_stats 総行数: ${finalCount} 件`);

  // 閾値集計
  for (const n of [30, 50, 100, 200, 500]) {
    const { count: c } = await supabase
      .from('sim_medium_pattern_stats')
      .select('*', { count: 'exact', head: true })
      .eq('sim_policy', SIM_POLICY)
      .gte('total', n);
    console.log(`total>=${n}: ${c} 件`);
  }

  // 最大 total
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
    console.log(`  total=${tRow.total}, wins_black=${tRow.wins_black}, wins_white=${tRow.wins_white}, draws=${tRow.draws}`);
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

  console.log('\n=== rebuild 完了 ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
