// create_test_official_match_tsujimoto.ts
// tsujimoto@tentomushi.co.jp vs oneeight-test@oneeightgame.com
// 公式戦テスト 1件作成
// Usage: npx tsx scripts/create_test_official_match_tsujimoto.ts

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
  // Step 1: メールアドレスから user_id を取得
  const { data: { users }, error: usersError } = await sb.auth.admin.listUsers();
  if (usersError || !users) {
    console.error('auth.users 取得失敗:', usersError);
    process.exit(1);
  }

  const tsujimoto = users.find(u => u.email === 'tsujimoto@tentomushi.co.jp');
  const testUser  = users.find(u => u.email === 'oneeight-test@oneeightgame.com');

  if (!tsujimoto) {
    console.error('tsujimoto@tentomushi.co.jp が見つかりません');
    process.exit(1);
  }
  if (!testUser) {
    console.error('oneeight-test@oneeightgame.com が見つかりません');
    process.exit(1);
  }

  console.log('tsujimoto@tentomushi.co.jp user_id :', tsujimoto.id);
  console.log('oneeight-test@oneeightgame.com user_id:', testUser.id);

  // Step 2: starts_at = now + 15分 / entry_open = starts_at - 15分 = now
  const now = new Date();
  const startsAt    = new Date(now.getTime() + 15 * 60 * 1000);
  const entryOpenAt = new Date(startsAt.getTime() - 15 * 60 * 1000); // ≒ now

  // timer_config: 既存の公式戦テストと同形式（各1分 = total_time 60秒）
  const timerConfig = { mode: 'total_time', totalSeconds: 60 };

  console.log('\nstarts_at (JST)    :', startsAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
  console.log('entry_open (JST)   :', entryOpenAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
  console.log('starts_at (UTC)    :', startsAt.toISOString());
  console.log('timer_config       :', JSON.stringify(timerConfig));

  // Step 3: official_matches INSERT
  // tsujimoto = Black / oneeight-test = White
  const { data: match, error: insertError } = await sb
    .from('official_matches')
    .insert({
      black_user_id: tsujimoto.id,
      white_user_id: testUser.id,
      starts_at:     startsAt.toISOString(),
      status:        'scheduled',
      timer_config:  timerConfig,
      created_by:    tsujimoto.id,
    })
    .select()
    .single();

  if (insertError || !match) {
    console.error('INSERT 失敗:', insertError);
    process.exit(1);
  }

  const entryOpen = new Date(new Date(match.starts_at).getTime() - 15 * 60 * 1000);

  console.log('\n✅ テスト公式戦 作成成功');
  console.log('========================================');
  console.log('match_id          :', match.id);
  console.log('start_time (JST)  :', new Date(match.starts_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
  console.log('entry_open (JST)  :', entryOpen.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
  console.log('start_time (UTC)  :', match.starts_at);
  console.log('Black (tsujimoto) :', tsujimoto.email, '/', match.black_user_id);
  console.log('White (test)      :', testUser.email, '/', match.white_user_id);
  console.log('timer_config      :', JSON.stringify(match.timer_config));
  console.log('status            :', match.status);
  console.log('online_game_id    :', (match as any).online_game_id ?? 'null（入室前）');
  console.log('========================================');

  // Step 4: DB確認
  const { data: verify, error: verifyError } = await sb
    .from('official_matches')
    .select('id, black_user_id, white_user_id, starts_at, status, timer_config')
    .eq('id', match.id)
    .single();

  if (verifyError || !verify) {
    console.error('確認クエリ失敗:', verifyError);
  } else {
    const tc = verify.timer_config as any;
    console.log('\n[DB確認]');
    console.log('  id           :', verify.id);
    console.log('  black_user_id:', verify.black_user_id, `(${tsujimoto.email})`);
    console.log('  white_user_id:', verify.white_user_id, `(${testUser.email})`);
    console.log('  starts_at JST:', new Date(verify.starts_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
    console.log('  starts_at UTC:', verify.starts_at);
    console.log('  status       :', verify.status);
    console.log('  timer_config :', JSON.stringify(tc));
    console.log('\n  [チェック]');
    console.log('  timer mode=total_time / 60秒:', tc?.mode === 'total_time' && tc?.totalSeconds === 60 ? '✅' : `❌ (${JSON.stringify(tc)})`);
    console.log('  Black = tsujimoto           :', verify.black_user_id === tsujimoto.id ? '✅' : '❌');
    console.log('  White = oneeight-test        :', verify.white_user_id === testUser.id ? '✅' : '❌');
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
