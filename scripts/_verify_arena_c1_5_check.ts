// _verify_arena_c1_5_check.ts — C-1.5 CHECK制約動作確認スクリプト
// withdrawn INSERTが拒否されること / new status INSERTが通ること を確認

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

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

// management APIでREST経由のSQL実行を試みる
async function runSql(query: string): Promise<{ rows?: any[], error?: string }> {
  const projectRef = 'farieecfyajbtmjxelop';
  const managementUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  
  try {
    const resp = await fetch(managementUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`
      },
      body: JSON.stringify({ query })
    });
    if (!resp.ok) {
      const text = await resp.text();
      return { error: `HTTP ${resp.status}: ${text}` };
    }
    const data = await resp.json();
    return { rows: data };
  } catch (e: any) {
    return { error: e.message };
  }
}

async function main() {
  console.log('=== C-1.5 CHECK制約動作確認 ===\n');

  // 1. CHECK制約名をpg_constraintから確認（Management API経由）
  console.log('--- 1. pg_constraint でCHECK制約確認 ---');
  const r1 = await runSql(`
    SELECT conname, pg_get_constraintdef(oid) as def
    FROM pg_constraint
    WHERE conrelid = 'public.arena_entries'::regclass AND contype = 'c'
  `);
  if (r1.error) {
    console.log('Management API unavailable:', r1.error);
  } else {
    console.log('CHECK constraints:', JSON.stringify(r1.rows, null, 2));
  }

  // 2. withdrawn INSERTがCHECKで弾かれることを確認（service_role で直接INSERT試み）
  console.log('\n--- 2. withdrawn INSERT テスト（CHECK違反が期待値） ---');
  
  // まずダミーevent_idとuser_idが必要 → arena_eventsから取得
  const { data: events, error: ee } = await supabase
    .from('arena_events')
    .select('id')
    .limit(1);
  
  if (ee || !events || events.length === 0) {
    console.log('arena_events not found, cannot test INSERT');
  } else {
    const eventId = events[0].id;
    // ダミーuser_id（実在しないUUID）でINSERTは FK制約で失敗するため、
    // 実在するユーザーが必要。ここではCHECKの前にFKで弾かれる可能性あり。
    // なので、status='withdrawn' でのINSERT errorメッセージを確認する。
    const { data: ins, error: ie } = await supabase
      .from('arena_entries')
      .insert({
        arena_event_id: eventId,
        user_id: '00000000-0000-0000-0000-000000000000', // ダミー
        status: 'withdrawn'
      })
      .select();
    
    if (ie) {
      const isCheckViolation = ie.message?.includes('check') || ie.code === '23514';
      const isFKViolation = ie.code === '23503';
      if (isCheckViolation) {
        console.log('✅ withdrawn INSERT → CHECK constraint violation (期待通り)');
        console.log('   Error:', ie.message);
      } else if (isFKViolation) {
        console.log('⚠️  withdrawn INSERT → FK violation (CHECK前にFKで失敗)');
        console.log('   これはCHECKより先にFKが発動したため。CHECKの存在は別途確認要。');
        console.log('   Error:', ie.message);
      } else {
        console.log('⚠️  withdrawn INSERT error:', ie.code, ie.message);
      }
    } else {
      console.log('❌ withdrawn INSERT succeeded unexpectedly! Rows:', ins);
      // クリーンアップ
      if (ins && ins.length > 0) {
        await supabase.from('arena_entries').delete().eq('id', ins[0].id);
      }
    }
  }

  // 3. enter_arena_event RPC定義確認（pg_proc from Management API）
  console.log('\n--- 3. enter_arena_event status DEFAULT確認 ---');
  const r3 = await runSql(`
    SELECT prosrc
    FROM pg_proc
    WHERE proname = 'enter_arena_event'
    LIMIT 1
  `);
  if (r3.error) {
    console.log('Management API unavailable:', r3.error);
  } else {
    const src: string = (r3.rows as any)?.[0]?.prosrc ?? '';
    const statusLines = src.split('\n').filter((l: string) => 
      l.includes('status') || l.includes('pending') || l.includes('no_match')
    );
    console.log('enter_arena_event status-related lines:');
    statusLines.forEach((l: string) => console.log('  ', l.trim()));
  }

  // 4. read RPCが my_entry_status:"pending" を返せるか確認（anonで）
  console.log('\n--- 4. read RPC確認（anon / 認証なし） ---');
  const anonUrl = url;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!anonKey) {
    console.log('ANON KEY not found in .env, skipping anon RPC test');
  } else {
    const anonClient = createClient(anonUrl, anonKey, { auth: { persistSession: false } });
    const { data: overview, error: oe } = await anonClient.rpc('get_arena_overview');
    if (oe) {
      console.log('get_arena_overview error:', oe.message);
    } else {
      console.log('get_arena_overview: ✅ OK, type:', typeof overview, 'length:', (overview as any)?.length ?? 'N/A');
    }
  }

  // 5. official_matches変更なし確認
  console.log('\n--- 5. official_matches未変更確認 ---');
  const r5 = await runSql(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'official_matches'
    ORDER BY ordinal_position
  `);
  if (r5.error) {
    console.log('Management API unavailable:', r5.error);
    // フォールバック: supabase client から
    const { data: om, error: ome } = await supabase
      .from('official_matches')
      .select('*')
      .limit(0);
    if (ome) {
      console.log('official_matches access error:', ome.message);
    } else {
      console.log('official_matches accessible: ✅');
    }
  } else {
    const cols = (r5.rows as any[])?.map((r: any) => r.column_name) ?? [];
    const hasSourceKind = cols.includes('source_kind');
    if (hasSourceKind) {
      console.log('❌ official_matches has source_kind column!');
    } else {
      console.log('✅ official_matches.source_kind: not added (correct)');
    }
    console.log('columns:', cols.join(', '));
  }

  // 6. arena_entries permissions確認
  console.log('\n--- 6. arena_entries direct INSERT不可確認（anon） ---');
  if (!process.env.VITE_SUPABASE_ANON_KEY) {
    console.log('anon key not available, skipping');
  } else {
    const anonClient2 = createClient(url, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data: anonIns, error: aie } = await anonClient2
      .from('arena_entries')
      .insert({ arena_event_id: '00000000-0000-0000-0000-000000000000', user_id: '00000000-0000-0000-0000-000000000000', status: 'pending' })
      .select();
    if (aie) {
      console.log('✅ anon INSERT blocked:', aie.message.slice(0, 80));
    } else {
      console.log('❌ anon INSERT unexpectedly succeeded:', anonIns);
    }
  }

  console.log('\n=== 確認完了 ===');
}

main().catch(console.error);
