/**
 * get_arena_detail top_ranking を直近90日集計に修正する
 * SQL エラーを修正した版を直接実行する
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// .env load
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

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false }
});

// Read the migration SQL
const migrationSql = readFileSync(
  '/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/supabase/migrations/20260622030356_arena_recent_point_ranking_90days.sql',
  'utf-8'
);

async function main() {
  // Apply the SQL directly
  const { error } = await (supabase as any).rpc('exec_sql', { query: migrationSql });
  if (error) {
    console.error('exec_sql error:', error.message);
    // Try to apply via management API approach - execute the SQL file content
    console.log('Trying alternative approach...');
    
    // Test if RPC works after (it might already be applied)
    const { data: defs } = await (supabase as any)
      .from('arena_definitions')
      .select('id, code')
      .limit(1);
    
    if (defs && defs.length > 0) {
      const { data: detail, error: detErr } = await supabase.rpc('get_arena_detail', { p_arena_id: defs[0].id });
      if (detErr) {
        console.error('get_arena_detail still broken:', detErr.message);
      } else {
        const d = detail as any;
        console.log('top_ranking after fix:', JSON.stringify(d?.top_ranking, null, 2));
      }
    }
  } else {
    console.log('SQL applied successfully');
    
    // Verify
    const { data: defs } = await (supabase as any)
      .from('arena_definitions')
      .select('id, code')
      .limit(2);
    
    for (const def of defs || []) {
      const { data: detail, error: detErr } = await supabase.rpc('get_arena_detail', { p_arena_id: (def as any).id });
      if (detErr) {
        console.error(`[${(def as any).code}] error:`, detErr.message);
      } else {
        const d = detail as any;
        console.log(`[${(def as any).code}] top_ranking:`, JSON.stringify(d?.top_ranking, null, 2));
      }
    }
  }
}

main().catch(console.error);
