/**
 * rebuild_sim_medium_100k.ts
 *
 * sim_medium_pattern_stats を sim_match_logs 全100,000局から
 * フルリビルドする。
 *
 * 方針:
 *   - Phase B (sim_position_stats) は実行しない
 *   - sim_medium_pattern_stats の easy_vs_easy 分を全件 DELETE してから INSERT
 *   - 差分upsertによる過大計上・欠落リスクを排除
 *   - ORDER BY sim_batch_id, game_index で全局スキャン
 *   - 全量メモリ保持禁止: full_record はページ単位で処理後に破棄
 *   - statsMap (medium_pattern_id → 集計値) のみメモリに保持
 *   - 同一ゲーム内 medium_pattern_id 重複除去を維持
 *   - 実戦テーブルには一切触れない
 *
 * 実行方法:
 *   nohup npx vite-node scripts/rebuild_sim_medium_100k.ts \
 *     > /tmp/rebuild_100k.log 2>&1 &
 *   tail -f /tmp/rebuild_100k.log
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { readFileSync } from 'fs';

try {
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
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('ERROR: env missing'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const SIM_POLICY    = 'easy_vs_easy';
const SCAN_PAGE     = 500;    // sim_match_logs 取得単位
const INSERT_CHUNK  = 500;    // upsert 単位
const BACKUP_DIR    = resolve(process.env.HOME!, 'Desktop/ONE_EIGHT/backup');
const LOG_FILE      = '/tmp/rebuild_100k.log';

// 60,000局正式基準値（異常検知用）
const BASELINE_60K = {
  totalRows: 671588, maxTotal: 15359,
  ge30: 2297, ge50: 1203, ge100: 435, ge200: 168, ge500: 29,
};

type MedStat = {
  medium_pattern_id: string;
  sim_policy: string;
  wins_black: number;
  wins_white: number;
  draws: number;
  total: number;
  move_number: number;  // 最初に観測した moveNumber (深度分布用)
};

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const startTime = Date.now();
  log('=== rebuild_sim_medium_100k.ts 開始 ===');
  log(`対象: sim_match_logs 全局 → sim_medium_pattern_stats フルリビルド`);
  log(`方針: DELETE (easy_vs_easy) → 全局スキャン集計 → INSERT`);

  mkdirSync(BACKUP_DIR, { recursive: true });

  // ─── Step 0: 事前確認 ────────────────────────────────────────────────────
  log('\n--- Step 0: 事前確認 ---');

  const { count: smlTotal } = await supabase.from('sim_match_logs').select('*',{count:'exact',head:true});
  log(`sim_match_logs: ${smlTotal} 件`);
  if ((smlTotal ?? 0) < 100000) {
    log('ERROR: sim_match_logs が 100,000 件に満たない。中断。'); process.exit(1);
  }

  const { count: beforeMed } = await supabase.from('sim_medium_pattern_stats').select('*',{count:'exact',head:true}).eq('sim_policy', SIM_POLICY);
  log(`sim_medium_pattern_stats 現在: ${beforeMed} 行`);

  const { count: ml0 } = await supabase.from('match_logs').select('*',{count:'exact',head:true});
  const { count: ps0 } = await supabase.from('position_stats').select('*',{count:'exact',head:true});
  const { count: mp0 } = await supabase.from('medium_pattern_stats').select('*',{count:'exact',head:true});
  log(`実戦テーブル [事前]: match_logs=${ml0} / position_stats=${ps0} / medium_pattern_stats=${mp0}`);

  // 現在値バックアップ（サンプル + 統計のみ）
  const { data: topRows } = await supabase.from('sim_medium_pattern_stats')
    .select('medium_pattern_id,total').eq('sim_policy',SIM_POLICY)
    .order('total',{ascending:false}).limit(10);
  const backup = {
    timestamp: new Date().toISOString(),
    rows_before_delete: beforeMed,
    top10_by_total: topRows,
    baseline_60k: BASELINE_60K,
  };
  const bkPath = resolve(BACKUP_DIR, `sim_medium_before_rebuild_100k_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.json`);
  writeFileSync(bkPath, JSON.stringify(backup, null, 2));
  log(`現在値バックアップ: ${bkPath}`);

  // ─── Step 1: DELETE ─────────────────────────────────────────────────────
  log('\n--- Step 1: sim_medium_pattern_stats DELETE (easy_vs_easy) ---');
  const { error: delErr } = await supabase
    .from('sim_medium_pattern_stats')
    .delete()
    .eq('sim_policy', SIM_POLICY);
  if (delErr) { log(`ERROR: DELETE failed: ${delErr.message}`); process.exit(1); }
  const { count: afterDel } = await supabase.from('sim_medium_pattern_stats').select('*',{count:'exact',head:true}).eq('sim_policy', SIM_POLICY);
  log(`DELETE 完了: ${beforeMed} → ${afterDel} 行`);
  if ((afterDel ?? 0) > 0) { log('ERROR: DELETE 後に残行あり。中断。'); process.exit(1); }

  // ─── Step 2: 全局スキャン & 集計 ─────────────────────────────────────────
  log('\n--- Step 2: 全局スキャン & 集計 ---');
  const statsMap = new Map<string, MedStat>();
  let scanOffset = 0;
  let totalGames = 0;
  let skipGames  = 0;
  let totalMoves = 0;

  while (true) {
    const { data, error } = await supabase
      .from('sim_match_logs')
      .select('winner, full_record')
      .order('sim_batch_id', { ascending: true })
      .order('game_index',   { ascending: true })
      .range(scanOffset, scanOffset + SCAN_PAGE - 1);

    if (error) { log(`scan error at offset ${scanOffset}: ${error.message}`); await sleep(3000); continue; }
    if (!data || data.length === 0) break;

    for (const row of data as { winner: string | null; full_record: Array<{ medium_pattern_id?: string; moveNumber?: number }> }[]) {
      const winner = row.winner;
      if (!winner || (winner !== 'black' && winner !== 'white' && winner !== 'draw')) {
        skipGames++; continue;
      }

      // 同一ゲーム内重複除去
      const pidToMoveNum = new Map<string, number>();
      for (const step of row.full_record) {
        if (!step.medium_pattern_id) continue;
        if (!pidToMoveNum.has(step.medium_pattern_id)) {
          pidToMoveNum.set(step.medium_pattern_id, step.moveNumber ?? 0);
        }
      }

      for (const [pid, mn] of pidToMoveNum) {
        const cur = statsMap.get(pid);
        if (cur) {
          cur.wins_black += winner === 'black' ? 1 : 0;
          cur.wins_white += winner === 'white' ? 1 : 0;
          cur.draws      += winner === 'draw'  ? 1 : 0;
          cur.total      += 1;
        } else {
          statsMap.set(pid, {
            medium_pattern_id: pid,
            sim_policy: SIM_POLICY,
            wins_black: winner === 'black' ? 1 : 0,
            wins_white: winner === 'white' ? 1 : 0,
            draws:      winner === 'draw'  ? 1 : 0,
            total:      1,
            move_number: mn,
          });
        }
      }
      totalMoves += pidToMoveNum.size;
      totalGames++;
    }

    scanOffset += SCAN_PAGE;
    if (scanOffset % 5000 === 0) {
      log(`  スキャン進捗: ${scanOffset}局 / patterns=${statsMap.size}`);
    }
    if (data.length < SCAN_PAGE) break;
  }

  log(`スキャン完了: ${totalGames} ゲーム / skip=${skipGames} / patterns=${statsMap.size} / 総手数=${totalMoves}`);

  // ─── Step 3: INSERT ──────────────────────────────────────────────────────
  log('\n--- Step 3: INSERT ---');
  const entries = [...statsMap.values()];
  const insertRows = entries.map(e => ({
    medium_pattern_id: e.medium_pattern_id,
    sim_policy:        e.sim_policy,
    wins_black:        e.wins_black,
    wins_white:        e.wins_white,
    draws:             e.draws,
    total:             e.total,
  }));

  let insertOk = 0, insertErr = 0;
  for (let i = 0; i < insertRows.length; i += INSERT_CHUNK) {
    const chunk = insertRows.slice(i, i + INSERT_CHUNK);
    let lastErr: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabase.from('sim_medium_pattern_stats').insert(chunk);
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
    if ((i / INSERT_CHUNK) % 100 === 0 && i > 0) {
      log(`  INSERT進捗: ${insertOk}/${insertRows.length} ok / err=${insertErr}`);
    }
  }
  log(`INSERT 完了: ok=${insertOk} / error=${insertErr}`);

  // ─── Step 4: 最終確認 ────────────────────────────────────────────────────
  log('\n--- Step 4: 最終確認 ---');

  const { count: finalCount } = await supabase.from('sim_medium_pattern_stats').select('*',{count:'exact',head:true}).eq('sim_policy', SIM_POLICY);
  log(`sim_medium_pattern_stats 最終: ${finalCount} 行`);

  const { data: maxR } = await supabase.from('sim_medium_pattern_stats').select('total').eq('sim_policy',SIM_POLICY).order('total',{ascending:false}).limit(1);
  const maxTotal = (maxR as any)?.[0]?.total ?? 0;
  log(`MAX total: ${maxTotal}`);

  const thresholds = [30, 50, 100, 200, 500];
  const threshCounts: Record<number, number> = {};
  for (const n of thresholds) {
    const { count } = await supabase.from('sim_medium_pattern_stats').select('*',{count:'exact',head:true}).eq('sim_policy',SIM_POLICY).gte('total',n);
    threshCounts[n] = count ?? 0;
    const baseline = (BASELINE_60K as any)[`ge${n}`] ?? 0;
    const diff = (count ?? 0) - baseline;
    log(`total>=${n}: ${count} (60k比: +${diff})`);
  }

  // 深度分布（M1 / M2〜3 / M4〜8 / M9〜22 / M23以降）
  log('\n【深度分布 total>=100 (statsMapから集計)】');
  const ge100Entries = entries.filter(e => e.total >= 100);
  const depthBands = [
    { label: 'M1',      min: 1, max: 1 },
    { label: 'M2〜3',   min: 2, max: 3 },
    { label: 'M4〜8',   min: 4, max: 8 },
    { label: 'M9〜22',  min: 9, max: 22 },
    { label: 'M23以降', min: 23, max: 9999 },
  ];
  for (const band of depthBands) {
    const cnt = ge100Entries.filter(e => e.move_number >= band.min && e.move_number <= band.max).length;
    log(`  ${band.label}: ${cnt} 件`);
  }

  // 対象pattern
  const { data: tp } = await supabase.from('sim_medium_pattern_stats')
    .select('total,wins_black,wins_white,draws').eq('medium_pattern_id','06865a5f36ac5df5:1011').eq('sim_policy',SIM_POLICY);
  const tr = (tp as any)?.[0];
  log(`\n対象pattern 06865a5f36ac5df5:1011: ${tr ? `total=${tr.total} (>=30: ${tr.total >= 30 ? '✅到達' : '❌未達'})` : 'レコードなし'}`);

  // 実戦テーブル汚染チェック
  const { count: ml1 } = await supabase.from('match_logs').select('*',{count:'exact',head:true});
  const { count: ps1 } = await supabase.from('position_stats').select('*',{count:'exact',head:true});
  const { count: mp1 } = await supabase.from('medium_pattern_stats').select('*',{count:'exact',head:true});
  log(`\n実戦テーブル [事後]: match_logs=${ml1} (${ml0===ml1?'✅':'❌'}) / position_stats=${ps1} (${ps0===ps1?'✅':'❌'}) / medium_pattern_stats=${mp1} (${mp0===mp1?'✅':'❌'})`);

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  log(`\n総処理時間: ${elapsed} 分`);
  log('=== rebuild 完了 ===');
}

main().catch(e => { log(`FATAL: ${e}`); process.exit(1); });
