/**
 * fix_sim_s9_medium.ts
 *
 * import_sim_easy_s9.ts の Phase C 補完スクリプト（RPCなし・直接upsert版）。
 * batch_009 の full_record から medium_pattern_id を抽出し、
 * メモリ上で集計→既存データとマージ→バルクupsert。
 *
 * 実行方法:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   export $(grep -v '^#' .env | xargs)
 *   npx vite-node scripts/fix_sim_s9_medium.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: VITE_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const SIM_BATCH_ID = 'easy_20260511_009';
const SIM_POLICY = 'easy_vs_easy';
const PAGE_SIZE = 500;
const UPSERT_CHUNK = 500;

type MedStat = {
  medium_pattern_id: string;
  sim_policy: string;
  wins_black: number;
  wins_white: number;
  draws: number;
  total: number;
  updated_at: string;
};

async function main() {
  console.log('=== fix_sim_s9_medium.ts (bulk upsert版) ===');
  console.log('Phase C: sim_medium_pattern_stats 直接 upsert\n');

  // テーブル存在確認
  const { error: tableErr } = await supabase
    .from('sim_medium_pattern_stats')
    .select('*', { count: 'exact', head: true });

  if (tableErr) {
    const code = (tableErr as { code?: string }).code;
    if (
      code === '42P01' ||
      tableErr.message.includes('relation') ||
      tableErr.message.includes('does not exist')
    ) {
      console.error('ERROR: sim_medium_pattern_stats テーブルが存在しません。');
      process.exit(1);
    }
  }

  // batch_009 の件数確認
  const { count: batchCount } = await supabase
    .from('sim_match_logs')
    .select('*', { count: 'exact', head: true })
    .eq('sim_batch_id', SIM_BATCH_ID);

  console.log(`batch_id=${SIM_BATCH_ID}: ${batchCount} 件`);
  if (!batchCount || batchCount < 5000) {
    console.error(`ERROR: ${SIM_BATCH_ID} が 5,000 件未満 (現在: ${batchCount})`);
    process.exit(1);
  }

  // ─── Step 1: batch_009 の全レコードをページング取得 ───
  console.log('Step 1: batch_009 データ取得中...');

  type MatchRow = {
    winner: string | null;
    full_record: Array<{ medium_pattern_id?: string }>;
  };

  const allRows: MatchRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('sim_match_logs')
      .select('winner, full_record')
      .eq('sim_batch_id', SIM_BATCH_ID)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error(`取得エラー: ${error.message}`);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    allRows.push(...(data as MatchRow[]));
    process.stdout.write(`  取得: ${allRows.length}/${batchCount} 件\r`);
    offset += PAGE_SIZE;
    if (data.length < PAGE_SIZE) break;
  }
  console.log(`\n取得完了: ${allRows.length} 件`);

  // ─── Step 2: メモリ上で medium_pattern_id ごとに集計（1ゲーム内重複除去） ───
  console.log('\nStep 2: メモリ集計中...');

  const newStats = new Map<string, { wins_black: number; wins_white: number; draws: number; total: number }>();

  let skipped = 0;
  for (const row of allRows) {
    if (!row.winner) { skipped++; continue; }

    const patternIds = row.full_record
      .map(m => m.medium_pattern_id)
      .filter((p): p is string => !!p);

    if (patternIds.length === 0) { skipped++; continue; }

    const unique = [...new Set(patternIds)];
    for (const pid of unique) {
      const cur = newStats.get(pid) ?? { wins_black: 0, wins_white: 0, draws: 0, total: 0 };
      cur.wins_black += row.winner === 'black' ? 1 : 0;
      cur.wins_white += row.winner === 'white' ? 1 : 0;
      cur.draws      += row.winner === 'draw'  ? 1 : 0;
      cur.total      += 1;
      newStats.set(pid, cur);
    }
  }
  console.log(`集計完了: ${newStats.size} パターン (スキップ: ${skipped} ゲーム)`);

  // ─── Step 3: 既存の sim_medium_pattern_stats を全件取得 ───
  console.log('\nStep 3: 既存データ取得中...');

  const existingMap = new Map<string, MedStat>();
  let exOffset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('sim_medium_pattern_stats')
      .select('medium_pattern_id, sim_policy, wins_black, wins_white, draws, total, updated_at')
      .eq('sim_policy', SIM_POLICY)
      .range(exOffset, exOffset + PAGE_SIZE - 1);

    if (error) {
      console.error(`既存データ取得エラー: ${error.message}`);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    for (const row of data as MedStat[]) {
      existingMap.set(row.medium_pattern_id, row);
    }
    process.stdout.write(`  既存取得: ${existingMap.size} 件\r`);
    exOffset += PAGE_SIZE;
    if (data.length < PAGE_SIZE) break;
  }
  console.log(`\n既存取得完了: ${existingMap.size} 件`);

  // ─── Step 4: マージ ───
  console.log('\nStep 4: マージ中...');

  const now = new Date().toISOString();
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
        updated_at: now,
      });
    } else {
      merged.push({
        medium_pattern_id: pid,
        sim_policy: SIM_POLICY,
        wins_black: newStat.wins_black,
        wins_white: newStat.wins_white,
        draws:      newStat.draws,
        total:      newStat.total,
        updated_at: now,
      });
    }
  }
  console.log(`マージ完了: ${merged.length} 件 (新規: ${merged.length - existingMap.size < 0 ? 0 : merged.length} / 既存更新: ${Math.min(existingMap.size, merged.length)})`);

  // ─── Step 5: バルクupsert（500件チャンク） ───
  console.log('\nStep 5: バルクupsert中...');

  let upsertedTotal = 0;
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
      upsertedTotal += chunk.length;
    }
    process.stdout.write(`  upsert: ${upsertedTotal + upsertErrors}/${merged.length} 件\r`);
  }

  console.log(`\nupsert完了: success=${upsertedTotal} error=${upsertErrors}`);

  // ─── Step 6: 最終件数確認 ───
  console.log('\nStep 6: 最終件数確認...');

  const { count: finalCount } = await supabase
    .from('sim_medium_pattern_stats')
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', SIM_POLICY);

  console.log(`sim_medium_pattern_stats (policy=${SIM_POLICY}): ${finalCount} 件`);
  console.log('\n=== fix_sim_s9_medium.ts 完了 ===');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
