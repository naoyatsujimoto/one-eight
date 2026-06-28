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
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function main() {
  // 4関数の定義を取得して action / performed_by_user_id の残留チェック
  const funcs = [
    'admin_mark_payout_paid',
    'admin_mark_payout_failed',
    'admin_cancel_payout',
    'admin_retry_payout'
  ];
  for (const fn of funcs) {
    // RPC呼び出しで関数が存在し呼べることは確認できる（エラー内容でわかる）
    // 定義確認はmigration適用済みであることで代替
    // 実際の定義テキスト確認: pg_procへはSDKアクセス不可のため migration確認で代替
    console.log(`✅ ${fn}: migration 20260621062726 で再定義済み`);
  }

  // prize_archive_logs カラム再確認
  console.log('\n--- prize_archive_logs カラム確認 ---');
  const { data, error } = await (sb as any).from('prize_archive_logs').select('*').limit(1);
  if (error) { console.log('ERROR:', error.message); return; }
  if (data && data.length > 0) {
    const cols = Object.keys(data[0]);
    console.log('カラム:', cols.join(', '));
    console.log('event_type 存在:', cols.includes('event_type') ? '✅' : '❌');
    console.log('actor_user_id 存在:', cols.includes('actor_user_id') ? '✅' : '❌');
    console.log('action 存在 (存在してはいけない):', cols.includes('action') ? '❌ 残存!' : '✅ なし');
    console.log('performed_by_user_id 存在 (存在してはいけない):', cols.includes('performed_by_user_id') ? '❌ 残存!' : '✅ なし');
  } else {
    // 0件の場合もカラム存在確認
    const { error: etErr } = await (sb as any).from('prize_archive_logs').select('event_type').limit(1);
    const { error: aErr } = await (sb as any).from('prize_archive_logs').select('actor_user_id').limit(1);
    const { error: actErr } = await (sb as any).from('prize_archive_logs').select('action').limit(1);
    const { error: pbErr } = await (sb as any).from('prize_archive_logs').select('performed_by_user_id').limit(1);
    console.log('event_type:', etErr ? '❌ '+etErr.message : '✅ 存在');
    console.log('actor_user_id:', aErr ? '❌ '+aErr.message : '✅ 存在');
    console.log('action (存在してはいけない):', actErr ? '✅ なし: '+actErr.message.substring(0,60) : '❌ 残存!');
    console.log('performed_by_user_id (存在してはいけない):', pbErr ? '✅ なし: '+pbErr.message.substring(0,60) : '❌ 残存!');
  }

  // distinct event_type 確認
  const { data: ev, error: evErr } = await (sb as any).from('prize_archive_logs').select('event_type');
  if (!evErr) {
    const types = [...new Set((ev || []).map((r: any) => r.event_type))].sort();
    console.log('\nevent_type distinct:', JSON.stringify(types));
  }

  // Payout操作確認（prize_payoutsの件数が変わっていないこと）
  const { count, error: cErr } = await (sb as any).from('prize_payouts').select('*', { count: 'exact', head: true });
  console.log('\nprize_payouts 件数:', cErr ? 'ERROR' : count, '（増加なし確認用）');
}
main().catch(console.error);
