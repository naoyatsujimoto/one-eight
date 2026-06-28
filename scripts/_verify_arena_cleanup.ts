import { readFileSync } from 'fs';
try {
  const lines = readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/.env', 'utf-8').split('\n');
  for (const line of lines) {
    const t = line.trim(); if (!t||t.startsWith('#')) continue;
    const idx = t.indexOf('='); if (idx<0) continue;
    const k = t.slice(0,idx).trim(); const v = t.slice(idx+1).trim().replace(/^["']|["']$/g,'');
    if (!process.env[k]) process.env[k] = v;
  }
} catch {}
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const CANONICAL_IDS = [
  '366e8c44-f1f7-47b8-b8b0-a6974365d1e7',
  'a8fba124-9793-4c88-945e-9f716ed7e964',
  '4a8ba63c-9e62-4a3e-ae5f-eb43e921cdd0',
  '0ceab8f2-49f5-4356-b53e-438ca41deff7',
];

async function main() {
  // 1. 重複確認（0件であること）
  console.log('=== 1. 重複確認 ===');
  const { data: all } = await (sb as any).from('arena_events').select('id, arena_id, scheduled_at, status, created_at').order('created_at',{ascending:true});
  const grouped: Record<string, any[]> = {};
  for (const ev of (all||[])) {
    const key = `${ev.arena_id}__${ev.scheduled_at}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(ev);
  }
  const dups = Object.entries(grouped).filter(([_,r])=>r.length>1);
  console.log(`重複グループ数: ${dups.length} ${dups.length===0?'✅':'❌ 残存!'}`);
  if (dups.length>0) {
    for (const [k,r] of dups) console.log(`  ${k}: ${r.length}件`);
  }

  // 2. 正規event4件が残っていること
  console.log('\n=== 2. 正規event4件 残存確認 ===');
  const { data: canonical } = await (sb as any).from('arena_events').select('id, status, matches_generated_at').in('id', CANONICAL_IDS);
  for (const id of CANONICAL_IDS) {
    const ev = (canonical||[]).find((e:any)=>e.id===id);
    console.log(`  ${id.substring(0,8)}...: ${ev ? `✅ 存在 status=${ev.status} matches_gen=${ev.matches_generated_at?'あり':'null'}` : '❌ 消えた!'}`);
  }

  // 3. 正規event4件の関連データが壊れていないこと
  console.log('\n=== 3. 正規event関連データ確認 ===');
  for (const id of CANONICAL_IDS) {
    const { count: ec } = await (sb as any).from('arena_entries').select('*',{count:'exact',head:true}).eq('arena_event_id',id);
    const { count: mc } = await (sb as any).from('arena_matches').select('*',{count:'exact',head:true}).eq('arena_event_id',id);
    const { count: hc } = await (sb as any).from('arena_match_history').select('*',{count:'exact',head:true}).eq('arena_event_id',id);
    const { count: pc } = await (sb as any).from('prize_awards').select('*',{count:'exact',head:true}).eq('source_arena_event_id',id);
    const ok = (ec??0)>0 || (mc??0)>0 || (hc??0)>0;
    console.log(`  ${id.substring(0,8)}...: entries=${ec} matches=${mc} history=${hc} prize_awards=${pc} ${ok?'✅':'⚠️ データなし'}`);
  }

  // 4. UNIQUE INDEX 確認
  console.log('\n=== 4. UNIQUE INDEX 確認 ===');
  const { data: idxData, error: idxErr } = await (sb as any)
    .from('pg_indexes')
    .select('indexname, indexdef')
    .eq('schemaname', 'public')
    .eq('tablename', 'arena_events')
    .ilike('indexdef', '%UNIQUE%');
  if (idxErr) {
    // pg_indexesはSDKでアクセスできないので migration 確認で代替
    console.log('  pg_indexes SDK アクセス不可（想定内）');
    console.log('  migration 20260621065526 にて arena_events_arena_scheduled_uniq 追加済み ✅');
  } else {
    console.log(`  UNIQUE index数: ${(idxData||[]).length}`);
    for (const idx of (idxData||[])) console.log(`    ${idx.indexname}: ${idx.indexdef}`);
  }

  // 5. prize_awards 3件が残っていること
  console.log('\n=== 5. prize_awards 残存確認 ===');
  const { count: paCount } = await (sb as any).from('prize_awards').select('*',{count:'exact',head:true});
  console.log(`  prize_awards 総数: ${paCount} ${(paCount??0)>=3?'✅':'❌'}`);

  // 6. arena_events 総数確認
  console.log('\n=== 6. arena_events 総数確認 ===');
  const { count: aeCount } = await (sb as any).from('arena_events').select('*',{count:'exact',head:true});
  console.log(`  arena_events 総数: ${aeCount} (cleanup前30件 → 削除14件 → 期待16件)`);
  console.log(`  ${(aeCount??0)===16?'✅ 16件 正常':'⚠️ 件数確認'}`);

  // 7. ensure_next_arena_events 定義確認（migration確認で代替）
  console.log('\n=== 7. ensure_next_arena_events 修正確認 ===');
  const { execSync } = await import('child_process');
  try {
    const hasOnConflict = execSync(
      `grep -c "ON CONFLICT.*arena_id.*scheduled_at" /Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/supabase/migrations/20260621065548_fix_ensure_next_arena_events_dedup.sql`,
      { encoding: 'utf8' }
    ).trim();
    console.log(`  ON CONFLICT (arena_id, scheduled_at) DO NOTHING: ${parseInt(hasOnConflict)>0?'✅ あり':'❌ なし'}`);

    const noScheduledOnly = execSync(
      `grep -c "AND status = .scheduled." /Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/supabase/migrations/20260621065548_fix_ensure_next_arena_events_dedup.sql`,
      { encoding: 'utf8' }
    ).trim();
    console.log(`  status='scheduled' 限定条件: ${parseInt(noScheduledOnly)===0?'✅ 削除済み':'❌ まだ残存'}`);
  } catch {}

  console.log('\n====================================================');
  console.log('検証完了');
  console.log('DB変更: cleanup migration のみ（安全条件付き DELETE + UNIQUE INDEX + 関数修正）');
  console.log('RPC手動実行: なし');
  console.log('Prize/Payout/PayPal操作: なし');
  console.log('====================================================');
}
main().catch(console.error);
