import { readFileSync } from 'fs';
try {
  const lines = readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/.env', 'utf-8').split('\n');
  for (const line of lines) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('='); if (idx < 0) continue;
    const k = t.slice(0, idx).trim();
    const v = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
} catch {}
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // Q2: entered_at カラムなし版
  const q2 = await sb
    .from('official_matches')
    .select('id, starts_at, status, online_game_id')
    .in('status', ['live', 'joinable', 'scheduled'])
    .order('starts_at', { ascending: false });

  console.log('=== Q2: live/joinable/scheduled 公式戦（migration適用前） ===');
  if (q2.error) { console.error('ERROR:', q2.error.message); }
  else {
    console.log('件数:', q2.data?.length ?? 0);
    for (const r of (q2.data ?? []) as any[]) {
      console.log(`  id=${r.id.slice(0,8)} starts=${r.starts_at} status=${r.status} og_id=${r.online_game_id ? r.online_game_id.slice(0,8)+'...' : 'null'}`);
    }
  }

  // Q3補足: online_game_id あり/なし件数
  console.log('\n=== Q3補足: official_matches 全件 online_game_id 分布 ===');
  const q3all = await sb.from('official_matches').select('id, online_game_id, status');
  if (q3all.error) { console.error('ERROR:', q3all.error.message); }
  else {
    const rows = (q3all.data ?? []) as any[];
    const withOg = rows.filter((r: any) => r.online_game_id != null);
    const withoutOg = rows.filter((r: any) => r.online_game_id == null);
    console.log(`total: ${rows.length} / online_game_id あり: ${withOg.length} / なし: ${withoutOg.length}`);
    // online_game_id あり の move_number も確認
    if (withOg.length > 0) {
      const ogIds = withOg.map((r: any) => r.online_game_id);
      const { data: ogs } = await sb.from('online_games').select('id, move_number').in('id', ogIds);
      const ogMap = new Map((ogs ?? []).map((o: any) => [o.id, o.move_number]));
      let b2 = 0, w3 = 0;
      for (const r of withOg) {
        const mn = ogMap.get((r as any).online_game_id) ?? 0;
        if (mn >= 2) b2++;
        if (mn >= 3) w3++;
      }
      console.log(`  → バックフィル影響見込み: black_entered_at 補完対象 ${b2}件(move>=2) / white_entered_at ${w3}件(move>=3)`);
      console.log('  （entered_at 既に記録済み分は COALESCE で除外されるため実際の UPDATE 件数は以下以下）');
    }
    console.log('  注: entered_at カラムは migration 未適用のため、現時点では全件 NULL 扱い');
  }
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
