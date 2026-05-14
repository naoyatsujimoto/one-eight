/**
 * backfill_sim_position_only_stats.ts
 *
 * sim_position_only_stats を sim_match_logs 全100,000局から
 * フルリビルドする。
 *
 * 方針:
 *   - position_only_id = medium_pattern_id の ":" より前（posOwnershipHash）
 *   - sim_position_only_stats の easy_vs_easy 分を全件 DELETE してから INSERT
 *   - 同一ゲーム内で同一 position_only_id が複数回登場した場合は最初の1回のみカウント
 *   - statsMap (position_only_id → 集計値) のみメモリに保持
 *   - 実戦テーブルには一切触れない
 *
 * 実行前提:
 *   Supabase SQL Editor で supabase/migrations/sim_position_only_stats.sql を実行済みであること。
 *
 * 実行方法:
 *   nohup npx vite-node scripts/backfill_sim_position_only_stats.ts \
 *     > /tmp/backfill_position_only.log 2>&1 &
 *   tail -f /tmp/backfill_position_only.log
 */

try {
  const { readFileSync } = await import('fs');
  const { resolve } = await import('path');
  const lines = readFileSync(resolve(process.cwd(), '.env'), 'utf-8').split('\n');
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

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('ERROR: env missing (VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const SIM_POLICY   = 'easy_vs_easy';
const SCAN_PAGE    = 500;   // sim_match_logs 取得単位
const INSERT_CHUNK = 1000;  // upsert 単位
const LOG_INTERVAL = 10000; // 進捗ログ間隔（ゲーム数）

type PosOnlyStat = {
  position_only_id: string;
  sim_policy: string;
  wins_black: number;
  wins_white: number;
  draws: number;
  total: number;
  move_number: number; // 最初に観測した moveNumber（後で検証可能にするため記録）
};

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const startTime = Date.now();
  log('=== backfill_sim_position_only_stats.ts 開始 ===');
  log(`対象: sim_match_logs 全局 → sim_position_only_stats フルリビルド`);
  log(`方針: DELETE (easy_vs_easy) → 全局スキャン集計 → INSERT`);

  // ─── Step 0: テーブル存在確認 ────────────────────────────────────────────
  log('\n--- Step 0: 事前確認 ---');

  const { error: tableCheckError } = await supabase
    .from('sim_position_only_stats')
    .select('position_only_id')
    .limit(1);

  if (tableCheckError) {
    log(`ERROR: sim_position_only_stats テーブルが存在しないか、アクセスできません。`);
    log(`  詳細: ${tableCheckError.message}`);
    log(`\n【手順】Naoya が Supabase SQL Editor で以下のファイルを実行してください:`);
    log(`  supabase/migrations/sim_position_only_stats.sql`);
    log(`その後、再度このスクリプトを実行してください。`);
    process.exit(1);
  }
  log(`sim_position_only_stats テーブル: ✅ 存在確認`);

  const { count: smlTotal } = await supabase.from('sim_match_logs').select('*', { count: 'exact', head: true });
  log(`sim_match_logs: ${smlTotal} 件`);
  if ((smlTotal ?? 0) < 100000) {
    log('WARNING: sim_match_logs が 100,000 件に満たない。処理は続行しますが確認を推奨。');
  }

  const { count: beforeCount } = await supabase
    .from('sim_position_only_stats')
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', SIM_POLICY);
  log(`sim_position_only_stats 現在: ${beforeCount} 行`);

  // 実戦テーブル事前確認
  const { count: ml0 } = await supabase.from('match_logs').select('*', { count: 'exact', head: true });
  const { count: ps0 } = await supabase.from('position_stats').select('*', { count: 'exact', head: true });
  const { count: mp0 } = await supabase.from('medium_pattern_stats').select('*', { count: 'exact', head: true });
  log(`実戦テーブル [事前]: match_logs=${ml0} / position_stats=${ps0} / medium_pattern_stats=${mp0}`);

  // ─── Step 1: DELETE ──────────────────────────────────────────────────────
  log('\n--- Step 1: sim_position_only_stats DELETE (easy_vs_easy) ---');
  const { error: delErr } = await supabase
    .from('sim_position_only_stats')
    .delete()
    .eq('sim_policy', SIM_POLICY);
  if (delErr) { log(`ERROR: DELETE failed: ${delErr.message}`); process.exit(1); }

  const { count: afterDel } = await supabase
    .from('sim_position_only_stats')
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', SIM_POLICY);
  log(`DELETE 完了: ${beforeCount} → ${afterDel} 行`);
  if ((afterDel ?? 0) > 0) { log('ERROR: DELETE 後に残行あり。中断。'); process.exit(1); }

  // ─── Step 2: 全局スキャン & 集計 ─────────────────────────────────────────
  log('\n--- Step 2: 全局スキャン & 集計 ---');
  const statsMap = new Map<string, PosOnlyStat>();
  let scanOffset = 0;
  let totalGames = 0;
  let skipGames  = 0;
  let totalContributions = 0;

  while (true) {
    const { data, error } = await supabase
      .from('sim_match_logs')
      .select('winner, full_record')
      .order('sim_batch_id', { ascending: true })
      .order('game_index',   { ascending: true })
      .range(scanOffset, scanOffset + SCAN_PAGE - 1);

    if (error) {
      log(`scan error at offset ${scanOffset}: ${error.message}`);
      await sleep(3000);
      continue;
    }
    if (!data || data.length === 0) break;

    for (const row of data as { winner: string | null; full_record: Array<{ medium_pattern_id?: string; moveNumber?: number }> }[]) {
      const winner = row.winner;
      if (!winner || (winner !== 'black' && winner !== 'white' && winner !== 'draw')) {
        skipGames++;
        continue;
      }

      // 同一ゲーム内重複除去: position_only_id ごとに最初の出現のみカウント
      const seenPosIds = new Set<string>();
      const posIdToMoveNum = new Map<string, number>();

      for (const step of row.full_record) {
        if (!step.medium_pattern_id) continue;
        // position_only_id = ":" より前の部分
        const colonIdx = step.medium_pattern_id.indexOf(':');
        const posOnlyId = colonIdx >= 0
          ? step.medium_pattern_id.slice(0, colonIdx)
          : step.medium_pattern_id;

        if (!seenPosIds.has(posOnlyId)) {
          seenPosIds.add(posOnlyId);
          posIdToMoveNum.set(posOnlyId, step.moveNumber ?? 0);
        }
      }

      for (const [posId, mn] of posIdToMoveNum) {
        const cur = statsMap.get(posId);
        if (cur) {
          cur.wins_black += winner === 'black' ? 1 : 0;
          cur.wins_white += winner === 'white' ? 1 : 0;
          cur.draws      += winner === 'draw'  ? 1 : 0;
          cur.total      += 1;
        } else {
          statsMap.set(posId, {
            position_only_id: posId,
            sim_policy:        SIM_POLICY,
            wins_black: winner === 'black' ? 1 : 0,
            wins_white: winner === 'white' ? 1 : 0,
            draws:      winner === 'draw'  ? 1 : 0,
            total:      1,
            move_number: mn,
          });
        }
      }

      totalContributions += posIdToMoveNum.size;
      totalGames++;
    }

    scanOffset += SCAN_PAGE;

    // 10,000局ごとに進捗ログ
    if (totalGames % LOG_INTERVAL === 0 && totalGames > 0) {
      log(`  スキャン進捗: ${totalGames}局 / patterns=${statsMap.size} / contributions=${totalContributions}`);
    }

    if (data.length < SCAN_PAGE) break;
  }

  log(`スキャン完了: ${totalGames} ゲーム / skip=${skipGames} / position_only_patterns=${statsMap.size} / 総貢献数=${totalContributions}`);

  // ─── Step 3: INSERT ──────────────────────────────────────────────────────
  log('\n--- Step 3: INSERT ---');
  const entries = [...statsMap.values()];
  const insertRows = entries.map(e => ({
    position_only_id: e.position_only_id,
    sim_policy:       e.sim_policy,
    wins_black:       e.wins_black,
    wins_white:       e.wins_white,
    draws:            e.draws,
    total:            e.total,
  }));

  let insertOk = 0, insertErr = 0;
  for (let i = 0; i < insertRows.length; i += INSERT_CHUNK) {
    const chunk = insertRows.slice(i, i + INSERT_CHUNK);
    let lastErr: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabase.from('sim_position_only_stats').insert(chunk);
      if (!error) { lastErr = null; break; }
      lastErr = error.message;
      if (attempt < 2) await sleep(2000);
    }
    if (lastErr) {
      log(`INSERT error at ${i}: ${lastErr}`);
      insertErr += chunk.length;
    } else {
      insertOk += chunk.length;
    }
    if ((i / INSERT_CHUNK) % 10 === 0 && i > 0) {
      log(`  INSERT進捗: ${insertOk}/${insertRows.length} ok / err=${insertErr}`);
    }
  }
  log(`INSERT 完了: ok=${insertOk} / error=${insertErr}`);

  // ─── Step 4: 最終確認 ────────────────────────────────────────────────────
  log('\n--- Step 4: 最終確認 ---');

  const { count: finalCount } = await supabase
    .from('sim_position_only_stats')
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', SIM_POLICY);
  log(`sim_position_only_stats 最終: ${finalCount} 行`);

  const { data: maxR } = await supabase
    .from('sim_position_only_stats')
    .select('total')
    .eq('sim_policy', SIM_POLICY)
    .order('total', { ascending: false })
    .limit(1);
  const maxTotal = (maxR as any)?.[0]?.total ?? 0;
  log(`MAX total: ${maxTotal}`);

  const thresholds = [30, 50, 100, 200, 500];
  for (const n of thresholds) {
    const { count } = await supabase
      .from('sim_position_only_stats')
      .select('*', { count: 'exact', head: true })
      .eq('sim_policy', SIM_POLICY)
      .gte('total', n);
    log(`total>=${n}: ${count}`);
  }

  // 深度分布（statsMapから集計）
  log('\n【深度分布 total>=100 (statsMapから集計)】');
  const ge100Entries = entries.filter(e => e.total >= 100);
  const depthBands = [
    { label: 'M1',      min: 1,  max: 1    },
    { label: 'M2〜3',   min: 2,  max: 3    },
    { label: 'M4〜8',   min: 4,  max: 8    },
    { label: 'M9〜22',  min: 9,  max: 22   },
    { label: 'M23以降', min: 23, max: 9999 },
  ];
  for (const band of depthBands) {
    const cnt = ge100Entries.filter(e => e.move_number >= band.min && e.move_number <= band.max).length;
    log(`  ${band.label}: ${cnt} 件`);
  }

  // 実戦テーブル汚染チェック
  const { count: ml1 } = await supabase.from('match_logs').select('*', { count: 'exact', head: true });
  const { count: ps1 } = await supabase.from('position_stats').select('*', { count: 'exact', head: true });
  const { count: mp1 } = await supabase.from('medium_pattern_stats').select('*', { count: 'exact', head: true });
  log(`\n実戦テーブル [事後]: match_logs=${ml1} (${ml0===ml1?'✅':'❌'}) / position_stats=${ps1} (${ps0===ps1?'✅':'❌'}) / medium_pattern_stats=${mp1} (${mp0===mp1?'✅':'❌'})`);

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  log(`\n総処理時間: ${elapsed} 分`);
  log('=== backfill 完了 ===');
}

main().catch(e => { log(`FATAL: ${e}`); process.exit(1); });
