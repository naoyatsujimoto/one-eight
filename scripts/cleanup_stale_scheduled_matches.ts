// cleanup_stale_scheduled_matches.ts
// scheduled 状態のうち最新1件を除いた古い公式戦を cancelled にする

import { readFileSync } from 'fs';
try {
  const lines = readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/.env', 'utf-8').split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx < 0) continue;
    const k = t.slice(0, idx).trim();
    const v = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
} catch {}

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const NAOYA_ID = '9924668a-a5ee-4bd3-a71e-f8f993e3f094';
// 今回保持する公式戦 ID（最新）
const KEEP_ID = 'fa3516bb-65d5-477a-a044-d8ce176e5a1c';
// キャンセルする古い scheduled ID
const CANCEL_IDS = [
  '57d03638-3757-4f3f-b229-00f908976143',
  'a9a402a5-e583-4f22-836a-7bfe8d08b223',
];

async function main() {
  for (const id of CANCEL_IDS) {
    const { error } = await sb
      .from('official_matches')
      .update({ status: 'cancelled', end_reason: 'cancelled' })
      .eq('id', id);
    if (error) {
      console.error(`❌ キャンセル失敗 ${id}:`, error.message);
    } else {
      console.log(`✅ キャンセル完了: ${id}`);
    }
  }
  console.log(`\n保持する公式戦: ${KEEP_ID}`);
}

main().catch(err => { console.error(err); process.exit(1); });
