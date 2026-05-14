/**
 * export_sim_position_stats.ts
 *
 * sim_position_stats テーブルを Mac mini にバックアップする。
 * 削除前バックアップ用。
 *
 * 出力: ~/Desktop/ONE_EIGHT/backup/sim_position_stats_YYYYMMDD.jsonl.gz
 *       ~/Desktop/ONE_EIGHT/backup/sim_position_stats_YYYYMMDD_meta.json
 *
 * 実行方法:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   npx vite-node scripts/export_sim_position_stats.ts
 */

import { readFileSync, mkdirSync, createWriteStream } from 'fs';
import { resolve } from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Writable } from 'stream';

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

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const BACKUP_DIR = resolve(process.env.HOME!, 'Desktop/ONE_EIGHT/backup');
const DATE_STR   = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const OUT_JSONL  = resolve(BACKUP_DIR, `sim_position_stats_${DATE_STR}.jsonl.gz`);
const OUT_META   = resolve(BACKUP_DIR, `sim_position_stats_${DATE_STR}_meta.json`);
const PAGE_SIZE  = 1000;

async function main() {
  console.log('=== sim_position_stats バックアップ開始 ===');
  console.log(`出力先: ${OUT_JSONL}`);

  mkdirSync(BACKUP_DIR, { recursive: true });

  // gzip stream セットアップ
  const fileStream = createWriteStream(OUT_JSONL);
  const gzip       = createGzip({ level: 9 });

  let totalRows     = 0;
  let offset        = 0;
  let done          = false;
  const startTime   = Date.now();

  // Writable ラッパー（pipeline 用）
  const chunks: Buffer[] = [];
  const collector = new Writable({
    write(chunk, _enc, cb) { chunks.push(chunk); cb(); }
  });

  // gzip → file pipe
  gzip.pipe(fileStream);

  while (!done) {
    const { data, error } = await supabase
      .from('sim_position_stats')
      .select('canonical_hash, sim_policy, wins_black, wins_white, draws, total, first_seen_at, last_updated_at')
      .range(offset, offset + PAGE_SIZE - 1)
      .order('canonical_hash');

    if (error) {
      console.error(`fetch error at offset ${offset}:`, error.message);
      break;
    }
    if (!data || data.length === 0) { done = true; break; }

    for (const row of data) {
      gzip.write(JSON.stringify(row) + '\n');
    }

    totalRows += data.length;
    if (data.length < PAGE_SIZE) { done = true; }
    offset += PAGE_SIZE;

    if (totalRows % 10000 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  ${totalRows} 行完了 (${elapsed}s)`);
    }
  }

  gzip.end();
  await new Promise<void>((res, rej) => fileStream.on('finish', res).on('error', rej));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nエクスポート完了: ${totalRows} 行 (${elapsed}s)`);
  console.log(`出力ファイル: ${OUT_JSONL}`);

  // メタデータ書き出し
  const meta = {
    exported_at: new Date().toISOString(),
    source_table: 'public.sim_position_stats',
    total_rows: totalRows,
    format: 'jsonl.gz',
    columns: ['canonical_hash','sim_policy','wins_black','wins_white','draws','total','first_seen_at','last_updated_at'],
    note: 'Backup before DROP. Supabase table: sim_position_stats (sim canonical stats).',
  };
  const { writeFileSync } = await import('fs');
  writeFileSync(OUT_META, JSON.stringify(meta, null, 2));
  console.log(`メタデータ: ${OUT_META}`);
  console.log('\n=== バックアップ完了 ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
