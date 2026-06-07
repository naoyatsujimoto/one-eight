import { readFileSync } from 'fs';
import { resolve } from 'path';
try {
  const envPath = resolve(process.cwd(), '.env');
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch {}
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data, error, count } = await supabase
    .from('match_logs')
    .select('id, full_record', { count: 'exact' });
  if (error) { console.error('Error:', error.message); return; }
  console.log(`match_logs 総件数: ${count}`);
  let withMpId = 0;
  let withoutMpId = 0;
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const fr = row.full_record;
    let history: Record<string, unknown>[] = [];
    if (Array.isArray(fr)) history = fr as Record<string, unknown>[];
    else if (fr && typeof fr === 'object') {
      const keys = Object.keys(fr as object).filter(k => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b));
      history = keys.map(k => (fr as Record<string, Record<string, unknown>>)[k]!);
    }
    const first = history[0];
    if (first && 'medium_pattern_id' in first && first.medium_pattern_id) {
      withMpId++;
    } else {
      withoutMpId++;
    }
  }
  console.log(`medium_pattern_id あり（新規対局）: ${withMpId}件`);
  console.log(`medium_pattern_id なし（既存/バックフィル未済）: ${withoutMpId}件`);
}
main().catch(e => { console.error(e); process.exit(1); });
