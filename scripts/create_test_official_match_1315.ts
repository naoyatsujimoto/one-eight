// create_test_official_match_1315.ts
// 公式戦テスト用 match を1件作成する（2026-05-30 13:15 JST）
// 入室可能: 13:00 JST（starts_at - 15分）/ 持ち時間: 各1分
// Usage: npx tsx scripts/create_test_official_match_1315.ts

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

async function main() {
  // Step 1: メールアドレスから user_id を取得（auth.users は service_role のみアクセス可）
  const { data: { users }, error: usersError } = await sb.auth.admin.listUsers();
  if (usersError || !users) {
    console.error('auth.users 取得失敗:', usersError);
    process.exit(1);
  }

  const naoya = users.find(u => u.email === 'naoya.tsujimoto@gmail.com');
  const testUser = users.find(u => u.email === 'oneeight-test@oneeightgame.com');

  if (!naoya) {
    console.error('naoya.tsujimoto@gmail.com が見つかりません');
    process.exit(1);
  }
  if (!testUser) {
    console.error('oneeight-test@oneeightgame.com が見つかりません');
    process.exit(1);
  }

  console.log('naoya.tsujimoto@gmail.com  user_id:', naoya.id);
  console.log('oneeight-test@oneeightgame.com user_id:', testUser.id);

  // Step 2: starts_at = 2026-05-30 13:15:00 JST = 04:15:00 UTC
  const startsAt = new Date('2026-05-30T13:15:00+09:00');
  const entryOpenAt = new Date(startsAt.getTime() - 15 * 60 * 1000); // 13:00 JST

  const timerConfig = { mode: 'total_time', totalSeconds: 60 };

  console.log('\nstarts_at (JST)    :', startsAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
  console.log('entry_open_at (JST):', entryOpenAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
  console.log('starts_at (UTC)    :', startsAt.toISOString());
  console.log('timer_config       :', JSON.stringify(timerConfig));

  // Step 3: official_matches に直接 INSERT（service_role でバイパス）
  // Naoya = Black / oneeight-test = White
  const { data: match, error: insertError } = await sb
    .from('official_matches')
    .insert({
      black_user_id: naoya.id,
      white_user_id: testUser.id,
      starts_at: startsAt.toISOString(),
      status: 'scheduled',
      timer_config: timerConfig,
      created_by: naoya.id,
    })
    .select()
    .single();

  if (insertError || !match) {
    console.error('INSERT 失敗:', insertError);
    process.exit(1);
  }

  const matchUrl = `https://oneeightgame.com/official/${match.id}`;
  const entryOpen = new Date(new Date(match.starts_at).getTime() - 15 * 60 * 1000);

  console.log('\n✅ テスト公式戦 作成成功');
  console.log('========================================');
  console.log('match_id         :', match.id);
  console.log('URL              :', matchUrl);
  console.log('start_time (JST) :', new Date(match.starts_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
  console.log('entry_open (JST) :', entryOpen.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
  console.log('start_time (UTC) :', match.starts_at);
  console.log('Black (Naoya)    :', naoya.email, '/', match.black_user_id);
  console.log('White (test)     :', testUser.email, '/', match.white_user_id);
  console.log('timer_config     :', JSON.stringify(match.timer_config));
  console.log('status           :', match.status);
  console.log('online_game_id   :', match.online_game_id ?? 'null（入室前）');
  console.log('========================================');

  // Step 4: DB整合性確認
  const { data: verify, error: verifyError } = await sb
    .from('official_matches')
    .select('id, black_user_id, white_user_id, starts_at, status, timer_config')
    .eq('id', match.id)
    .single();

  if (verifyError || !verify) {
    console.error('確認クエリ失敗:', verifyError);
  } else {
    const tc = verify.timer_config as any;
    const startsAtVerified = new Date(verify.starts_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    const startUTC = verify.starts_at;
    console.log('\n[DB確認]');
    console.log('  id           :', verify.id);
    console.log('  black_user_id:', verify.black_user_id, `(${naoya.email})`);
    console.log('  white_user_id:', verify.white_user_id, `(${testUser.email})`);
    console.log('  starts_at JST:', startsAtVerified);
    console.log('  starts_at UTC:', startUTC);
    console.log('  status       :', verify.status);
    console.log('  timer_config :', JSON.stringify(tc));
    const startOk  = startUTC === '2026-05-30T04:15:00+00:00' || startUTC.startsWith('2026-05-30T04:15:00');
    const timerOk  = tc?.mode === 'total_time' && tc?.totalSeconds === 60;
    const blackOk  = verify.black_user_id === naoya.id;
    const whiteOk  = verify.white_user_id === testUser.id;
    console.log('\n  [チェック]');
    console.log('  start_time 13:15 JST :', startOk  ? '✅' : `❌ (${startUTC})`);
    console.log('  timer 60秒          :', timerOk  ? '✅' : `❌ (${JSON.stringify(tc)})`);
    console.log('  Black = naoya       :', blackOk  ? '✅' : `❌`);
    console.log('  White = oneeight-test:', whiteOk ? '✅' : `❌`);
  }

  console.log('\n========================================');
  console.log('【Cleanup 方法（必要時のみ）】');
  console.log('Supabase SQL Editor で:');
  console.log(`  UPDATE official_matches SET status = 'cancelled', end_reason = 'cancelled' WHERE id = '${match.id}';`);
  console.log('========================================');
}

main().catch(err => {
  console.error('エラー:', err);
  process.exit(1);
});
