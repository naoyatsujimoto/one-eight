// OM-1e 本番適用前 read-only 確認スクリプト
// SELECT のみ。DDL / DML は含まない。
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
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function rpc_sql(query: string) {
  const { data, error } = await sb.rpc('exec_sql_readonly', { sql: query }).select();
  return { data, error };
}

async function main() {
  // --- Q1: online_games 行数 ---
  console.log('=== Q1: online_games 行数 ===');
  const q1 = await sb.from('online_games').select('*', { count: 'exact', head: true });
  console.log(`online_games_rows: ${q1.count}`);
  if (q1.error) console.error('ERROR:', q1.error.message);

  // --- Q2: 進行中/予定中の公式戦 ---
  console.log('\n=== Q2: live/joinable/scheduled の公式戦 ===');
  const q2 = await sb
    .from('official_matches')
    .select(`
      id,
      starts_at,
      status,
      online_game_id,
      black_entered_at,
      white_entered_at
    `)
    .in('status', ['live', 'joinable', 'scheduled'])
    .order('starts_at', { ascending: false });
  if (q2.error) {
    console.error('ERROR:', q2.error.message);
  } else {
    console.log(`件数: ${q2.data?.length ?? 0}`);
    if (q2.data && q2.data.length > 0) {
      for (const row of q2.data) {
        const r = row as any;
        console.log(`  id=${r.id?.slice(0,8)} starts=${r.starts_at} status=${r.status} og_id=${r.online_game_id ? r.online_game_id.slice(0,8) : 'null'} b_entered=${r.black_entered_at ?? 'null'} w_entered=${r.white_entered_at ?? 'null'}`);
      }
    }
  }

  // --- Q3: entered_at バックフィル影響件数 ---
  console.log('\n=== Q3: entered_at バックフィル影響件数 ===');
  // Supabase JS では complex aggregation が難しいので個別に取得
  const q3a = await sb
    .from('official_matches')
    .select('id, online_game_id, black_entered_at')
    .not('online_game_id', 'is', null)
    .is('black_entered_at', null);
  const q3b = await sb
    .from('official_matches')
    .select('id, online_game_id, white_entered_at')
    .not('online_game_id', 'is', null)
    .is('white_entered_at', null);

  // move_number チェックは online_games を別途引く
  let blackBackfill = 0;
  let whiteBackfill = 0;

  if (q3a.data && q3a.data.length > 0) {
    const ogIds = q3a.data.map((r: any) => r.online_game_id).filter(Boolean);
    const { data: ogs } = await sb.from('online_games').select('id, move_number').in('id', ogIds);
    const ogMap = new Map((ogs ?? []).map((o: any) => [o.id, o.move_number]));
    for (const r of q3a.data as any[]) {
      const mn = ogMap.get(r.online_game_id) ?? 0;
      if (mn >= 2) blackBackfill++;
    }
  }
  if (q3b.data && q3b.data.length > 0) {
    const ogIds = q3b.data.map((r: any) => r.online_game_id).filter(Boolean);
    const { data: ogs } = await sb.from('online_games').select('id, move_number').in('id', ogIds);
    const ogMap = new Map((ogs ?? []).map((o: any) => [o.id, o.move_number]));
    for (const r of q3b.data as any[]) {
      const mn = ogMap.get(r.online_game_id) ?? 0;
      if (mn >= 3) whiteBackfill++;
    }
  }

  console.log(`black_backfill_count (move_number>=2): ${blackBackfill}`);
  console.log(`white_backfill_count (move_number>=3): ${whiteBackfill}`);

  // --- Q4: end_reason 分布 ---
  console.log('\n=== Q4: online_games.end_reason 分布 ===');
  const q4 = await sb.from('online_games').select('end_reason');
  if (q4.error) {
    console.error('ERROR:', q4.error.message);
  } else {
    const dist = new Map<string, number>();
    for (const row of (q4.data ?? []) as any[]) {
      const k = row.end_reason ?? 'NULL';
      dist.set(k, (dist.get(k) ?? 0) + 1);
    }
    const sorted = [...dist.entries()].sort((a, b) => b[1] - a[1]);
    for (const [k, v] of sorted) {
      console.log(`  ${k}: ${v}`);
    }
    // 既知値以外のチェック
    const known = new Set(['normal', 'timeout', 'resign', 'draw_agreement', 'NULL', null, 'forfeit_black', 'forfeit_white', 'no_contest']);
    const unknown = sorted.filter(([k]) => !known.has(k));
    if (unknown.length > 0) {
      console.log('\n  ⚠️  未知の end_reason あり:', unknown.map(([k]) => k).join(', '));
    } else {
      console.log('\n  ✅ 既知値のみ（問題なし）');
    }
  }

  console.log('\n=== 完了 ===');
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
