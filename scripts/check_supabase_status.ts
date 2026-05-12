/**
 * check_supabase_status.ts
 * Supabase テーブル・RPC の動作確認
 */
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
  console.log('=== Supabase テーブル・RPC 動作確認 ===\n');

  // 1. medium_pattern_stats テーブル
  {
    const { count, error } = await supabase
      .from('medium_pattern_stats')
      .select('*', { count: 'exact', head: true });
    if (error) {
      console.log('[1] medium_pattern_stats: ERROR -', error.message);
    } else {
      console.log(`[1] medium_pattern_stats: 存在 ✓ (count=${count})`);
    }
  }

  // 2. sim_medium_pattern_stats テーブル
  {
    const { count, error } = await supabase
      .from('sim_medium_pattern_stats')
      .select('*', { count: 'exact', head: true });
    if (error) {
      console.log('[2] sim_medium_pattern_stats: ERROR -', error.message);
    } else {
      console.log(`[2] sim_medium_pattern_stats: 存在 ✓ (count=${count})`);
    }
  }

  // 3. get_medium_pattern_win_rates RPC（小さなテスト）
  {
    // 存在しうる patternId を使ってテスト
    const { data: sampleData } = await supabase
      .from('medium_pattern_stats')
      .select('medium_pattern_id')
      .limit(1);
    
    const testPatternId = (sampleData?.[0] as { medium_pattern_id?: string })?.medium_pattern_id ?? 'test_nonexistent';
    
    const { data, error } = await supabase.rpc('get_medium_pattern_win_rates', {
      p_pattern_ids: [testPatternId],
      p_mode_group: 'all',
      p_min_total: 1,
    });
    if (error) {
      console.log('[3] get_medium_pattern_win_rates RPC: ERROR -', error.message);
    } else {
      console.log(`[3] get_medium_pattern_win_rates RPC: 動作 ✓ (rows=${(data ?? []).length}, test_id=${testPatternId.substring(0, 20)}...)`);
    }
  }

  // 4. get_sim_medium_pattern_win_rates RPC（存在確認）
  {
    // sim テーブルの patternId を1件取得
    const { data: simSample } = await supabase
      .from('sim_medium_pattern_stats')
      .select('medium_pattern_id, total')
      .limit(1);
    
    const testPatternId = (simSample?.[0] as { medium_pattern_id?: string })?.medium_pattern_id ?? 'test_nonexistent';
    
    const { data, error } = await supabase.rpc('get_sim_medium_pattern_win_rates', {
      p_pattern_ids: [testPatternId],
      p_sim_policy: 'easy_vs_easy',
      p_min_total: 1,
    });
    if (error) {
      // RPC が存在しない可能性 → テーブル直接アクセスで代替確認
      console.log(`[4] get_sim_medium_pattern_win_rates RPC: ERROR - ${error.message}`);
      // 直接テーブルアクセスで確認
      const { data: d2, error: e2 } = await supabase
        .from('sim_medium_pattern_stats')
        .select('medium_pattern_id, sim_policy, wins_black, wins_white, draws, total')
        .eq('medium_pattern_id', testPatternId)
        .eq('sim_policy', 'easy_vs_easy')
        .limit(1);
      if (e2) {
        console.log('   (直接テーブルアクセスも失敗):', e2.message);
      } else {
        console.log(`   (RPC未定義だが sim_medium_pattern_stats テーブルは直接アクセス可 ✓, row:`, JSON.stringify(d2?.[0]).substring(0, 100), ')');
      }
    } else {
      console.log(`[4] get_sim_medium_pattern_win_rates RPC: 動作 ✓ (rows=${(data ?? []).length})`);
    }
  }

  // 5. match_logs の medium_pattern_id 有無確認
  {
    const { data, error } = await supabase
      .from('match_logs')
      .select('id, full_record')
      .limit(2);
    if (error) {
      console.log('\n[5] match_logs: ERROR -', error.message);
    } else {
      console.log(`\n[5] match_logs: 存在 ✓ (${data?.length}件取得)`);
      for (const row of (data ?? []) as Record<string, unknown>[]) {
        const fr = row.full_record as Record<string, unknown> | null;
        let history: Record<string, unknown>[] = [];
        if (Array.isArray(fr)) history = fr as Record<string, unknown>[];
        else if (fr && typeof fr === 'object') {
          const keys = Object.keys(fr).filter(k => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b));
          history = keys.map(k => (fr as Record<string, Record<string, unknown>>)[k]!);
        }
        const firstRecord = history[0];
        if (firstRecord) {
          const hasMediumPatternId = 'medium_pattern_id' in firstRecord;
          const mpId = firstRecord.medium_pattern_id;
          console.log(`  id: ${String(row.id).substring(0, 16)}... | history[0].medium_pattern_id: ${hasMediumPatternId ? JSON.stringify(mpId) : '(フィールドなし)'}`);
        }
      }
    }
  }

  // 6. sim_match_logs の full_record の medium_pattern_id 有無確認
  {
    const { data, error } = await supabase
      .from('sim_match_logs')
      .select('id, full_record')
      .eq('sim_policy', 'easy_vs_easy')
      .limit(1);
    if (error) {
      console.log('\n[6] sim_match_logs: ERROR -', error.message);
    } else {
      for (const row of (data ?? []) as Record<string, unknown>[]) {
        const fr = row.full_record as Record<string, unknown> | null;
        let history: Record<string, unknown>[] = [];
        if (Array.isArray(fr)) history = fr as Record<string, unknown>[];
        else if (fr && typeof fr === 'object') {
          const keys = Object.keys(fr).filter(k => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b));
          history = keys.map(k => (fr as Record<string, Record<string, unknown>>)[k]!);
        }
        const firstRecord = history[0];
        if (firstRecord) {
          const hasMediumPatternId = 'medium_pattern_id' in firstRecord;
          const mpId = firstRecord.medium_pattern_id;
          console.log(`\n[6] sim_match_logs full_record history[0].medium_pattern_id: ${hasMediumPatternId ? JSON.stringify(mpId) : '(フィールドなし)'}`);
          console.log(`  → sim_match_logs の full_record には medium_pattern_id は${hasMediumPatternId && mpId ? '含まれている' : '含まれていない'}`);
        }
      }
    }
  }

  console.log('\n=== 確認完了 ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
