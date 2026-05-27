/**
 * phase_d_posonly_fashard_fh08.ts
 *
 * sim_batch_id=fahard_20260520_008 の sim_position_only_stats への差分 upsert。
 * phase_c_fashard_fh08.ts 完了後に実行する。
 *
 * 設計:
 *   - fahard_20260515_002 のみをスキャン
 *   - position_only_id = medium_pattern_id の ":" より前（posOwnershipHash）
 *   - 同一ゲーム内 position_only_id 重複除去
 *   - sim_policy='fast_hard_vs_fast_hard' のみ操作
 *   - easy_vs_easy の sim_position_only_stats には一切触れない
 *   - 実戦テーブルには一切触れない
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
} catch { /* .env なければ process.env をそのまま使う */ }

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('ERROR: env missing'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const SIM_BATCH_ID = 'fahard_20260520_008';
const SIM_POLICY   = 'fast_hard_vs_fast_hard';
const SCAN_PAGE    = 500;
const IN_CHUNK     = 100;
const UPSERT_CHUNK = 500;

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

type PosOnlyStat = {
  position_only_id: string; sim_policy: string;
  wins_black: number; wins_white: number; draws: number; total: number;
};

async function main() {
  log('=== phase_d_posonly_fashard_fh08.ts ===');
  log(`sim_batch_id: ${SIM_BATCH_ID}`);
  log(`sim_policy  : ${SIM_POLICY}\n`);

  // 事前確認（実戦テーブル）
  const {count: ml0} = await supabase.from('match_logs').select('*',{count:'exact',head:true});
  const {count: ps0} = await supabase.from('position_stats').select('*',{count:'exact',head:true});
  log(`[事前] match_logs=${ml0} / position_stats=${ps0}（変更しない）`);

  // easy_vs_easy 事前確認
  const {count: easyBefore} = await supabase.from('sim_position_only_stats')
    .select('*',{count:'exact',head:true}).eq('sim_policy','easy_vs_easy');
  log(`[事前] sim_position_only_stats(easy_vs_easy): ${easyBefore}（変更しない）`);

  const {count: batchCount} = await supabase.from('sim_match_logs')
    .select('*',{count:'exact',head:true}).eq('sim_batch_id', SIM_BATCH_ID);
  log(`sim_match_logs (${SIM_BATCH_ID}): ${batchCount} 件`);

  const {count: beforePos} = await supabase.from('sim_position_only_stats')
    .select('*',{count:'exact',head:true}).eq('sim_policy', SIM_POLICY);
  log(`sim_position_only_stats (${SIM_POLICY}) 現在: ${beforePos} 件\n`);

  if (!batchCount || batchCount === 0) {
    log('ERROR: バッチが sim_match_logs に存在しません。先に import_fashard_fh08.ts を実行してください。');
    process.exit(1);
  }

  // ─── Step 1: バッチスキャン & 集計 ─────────────────────────────────────
  log('--- Step 1: バッチスキャン & 集計 (ORDER BY game_index) ---');

  const newStats = new Map<string, PosOnlyStat>();
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
      const mids = row.full_record.map(m=>m.medium_pattern_id).filter((p):p is string => !!p);
      if (mids.length === 0) { skipCount++; continue; }

      // position_only_id = medium_pattern_id の ":" より前
      const posOnlyIds = mids
        .map(mid => mid.includes(':') ? mid.split(':')[0] : null)
        .filter((p):p is string => !!p);

      const unique = [...new Set(posOnlyIds)];
      for (const pid of unique) {
        const cur = newStats.get(pid) ?? {position_only_id:pid, sim_policy:SIM_POLICY, wins_black:0, wins_white:0, draws:0, total:0};
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
  log(`\nscan完了: ${gameCount} ゲーム / ${newStats.size} position_only patterns / skip=${skipCount}`);

  // ─── Step 2: 既存値取得 & マージ & upsert ──────────────────────────────
  log('\n--- Step 2: 既存値取得 → マージ → upsert ---');

  const pids = [...newStats.keys()];
  let upsertOk = 0, upsertErr = 0, processed = 0;

  for (let i = 0; i < pids.length; i += UPSERT_CHUNK) {
    const chunkPids = pids.slice(i, i + UPSERT_CHUNK);

    // 既存値を IN_CHUNK=100件ずつ取得
    const existingMap = new Map<string, PosOnlyStat>();
    for (let j = 0; j < chunkPids.length; j += IN_CHUNK) {
      const sub = chunkPids.slice(j, j + IN_CHUNK);
      const {data: exData, error: exErr} = await supabase
        .from('sim_position_only_stats')
        .select('position_only_id, sim_policy, wins_black, wins_white, draws, total')
        .eq('sim_policy', SIM_POLICY)
        .in('position_only_id', sub);
      if (exErr) { log(`\n既存取得エラー: ${exErr.message}`); }
      else for (const r of (exData ?? []) as PosOnlyStat[]) existingMap.set(r.position_only_id, r);
    }

    // マージ
    const merged: PosOnlyStat[] = chunkPids.map(pid => {
      const n = newStats.get(pid)!;
      const ex = existingMap.get(pid);
      if (ex) return {
        position_only_id: pid, sim_policy: SIM_POLICY,
        wins_black: ex.wins_black + n.wins_black,
        wins_white: ex.wins_white + n.wins_white,
        draws:      ex.draws      + n.draws,
        total:      ex.total      + n.total,
      };
      return { ...n };
    });

    // upsert
    const {error: upErr} = await supabase.from('sim_position_only_stats')
      .upsert(merged, {onConflict: 'position_only_id,sim_policy'});
    if (upErr) { log(`\nupsert error: ${upErr.message}`); upsertErr += merged.length; }
    else upsertOk += merged.length;

    processed += chunkPids.length;
    process.stdout.write(`  upsert: ${processed}/${pids.length} ok=${upsertOk} err=${upsertErr}\r`);
  }
  log(`\nPhase D 完了: upsert ok=${upsertOk} error=${upsertErr}`);

  // ─── 結果確認 ────────────────────────────────────────────────────────────
  log('\n--- 結果確認 ---');
  const {count: afterPos} = await supabase.from('sim_position_only_stats')
    .select('*',{count:'exact',head:true}).eq('sim_policy', SIM_POLICY);
  log(`sim_position_only_stats (${SIM_POLICY}): ${afterPos} (前回: ${beforePos})`);

  for (const n of [30,50,100,200,500]) {
    const {count:c} = await supabase.from('sim_position_only_stats')
      .select('*',{count:'exact',head:true}).eq('sim_policy',SIM_POLICY).gte('total',n);
    log(`total>=${n}: ${c}`);
  }

  const {data: top} = await supabase.from('sim_position_only_stats')
    .select('total').eq('sim_policy',SIM_POLICY).order('total',{ascending:false}).limit(1);
  log(`MAX total: ${(top as {total:number}[]|null)?.[0]?.total ?? 0}`);

  // easy_vs_easy 汚染チェック
  const {count: easyAfter} = await supabase.from('sim_position_only_stats')
    .select('*',{count:'exact',head:true}).eq('sim_policy','easy_vs_easy');
  log(`sim_position_only_stats(easy_vs_easy): ${easyAfter} (${easyBefore===easyAfter?'✅ 変化なし':'❌ 汚染'})`);

  // 実戦汚染チェック
  const {count:ml1}=await supabase.from('match_logs').select('*',{count:'exact',head:true});
  const {count:ps1}=await supabase.from('position_stats').select('*',{count:'exact',head:true});
  log(`match_logs: ${ml1} (${ml0===ml1?'✅ 変化なし':'❌ 汚染'})`);
  log(`position_stats: ${ps1} (${ps0===ps1?'✅ 変化なし':'❌ 汚染'})`);

  log('=== Phase D 完了 ===');
}

main().catch(e => { log(`FATAL: ${e}`); process.exit(1); });
