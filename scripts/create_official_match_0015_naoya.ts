// create_official_match_0015_naoya.ts
// naoya.tsujimoto@gmail.com (Black) vs oneeight-test@oneeightgame.com (White)
// starts_at: 2026-05-31 00:15 JST (= 15:15 UTC)
// entry_open: 2026-05-31 00:00 JST (= 15:00 UTC)
// timer_config: { mode: 'total_time', totalSeconds: 60 }
// Usage: npx tsx scripts/create_official_match_0015_naoya.ts

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
  // Step 1: user_id 取得
  const { data: { users }, error: usersError } = await sb.auth.admin.listUsers();
  if (usersError || !users) {
    console.error('auth.users 取得失敗:', usersError);
    process.exit(1);
  }

  const naoya    = users.find(u => u.email === 'naoya.tsujimoto@gmail.com');
  const testUser = users.find(u => u.email === 'oneeight-test@oneeightgame.com');

  if (!naoya)    { console.error('naoya.tsujimoto@gmail.com が見つかりません'); process.exit(1); }
  if (!testUser) { console.error('oneeight-test@oneeightgame.com が見つかりません'); process.exit(1); }

  console.log('naoya user_id    :', naoya.id);
  console.log('testUser user_id :', testUser.id);

  // Step 2: starts_at = 2026-05-31 00:15 JST = 2026-05-30 15:15 UTC
  const startsAt    = new Date('2026-05-30T15:15:00.000Z');
  const entryOpenAt = new Date(startsAt.getTime() - 15 * 60 * 1000); // 00:00 JST = 15:00 UTC

  const timerConfig = { mode: 'total_time', totalSeconds: 60 };

  console.log('\nstarts_at (JST)  :', startsAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
  console.log('entry_open (JST) :', entryOpenAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
  console.log('starts_at (UTC)  :', startsAt.toISOString());
  console.log('timer_config     :', JSON.stringify(timerConfig));

  // Step 3: 重複チェック（±1分ウィンドウ）
  const windowStart = new Date(startsAt.getTime() - 60 * 1000).toISOString();
  const windowEnd   = new Date(startsAt.getTime() + 60 * 1000).toISOString();

  const { data: existing, error: checkError } = await sb
    .from('official_matches')
    .select('id, starts_at, status, black_user_id, white_user_id')
    .eq('black_user_id', naoya.id)
    .eq('white_user_id', testUser.id)
    .gte('starts_at', windowStart)
    .lte('starts_at', windowEnd)
    .neq('status', 'cancelled');

  if (checkError) {
    console.error('重複チェック失敗:', checkError);
    process.exit(1);
  }

  if (existing && existing.length > 0) {
    const m = existing[0];
    const entryOpen = new Date(new Date(m.starts_at).getTime() - 15 * 60 * 1000);
    console.log('\n⚠️  SKIP: 同条件の公式戦が既に存在します');
    console.log('========================================');
    console.log('match_id         :', m.id);
    console.log('start_time (JST) :', new Date(m.starts_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
    console.log('entry_open (JST) :', entryOpen.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
    console.log('Black            : naoya.tsujimoto@gmail.com /', m.black_user_id);
    console.log('White            : oneeight-test@oneeightgame.com /', m.white_user_id);
    console.log('timer_config     :', JSON.stringify(timerConfig));
    console.log('status           :', m.status);
    console.log('tournament_id    : null（Ranked Match）');
    console.log('========================================');
    process.exit(0);
  }

  // Step 4: INSERT
  const { data: match, error: insertError } = await sb
    .from('official_matches')
    .insert({
      black_user_id: naoya.id,
      white_user_id: testUser.id,
      starts_at:     startsAt.toISOString(),
      status:        'scheduled',
      timer_config:  timerConfig,
      created_by:    naoya.id,
      // tournament_id は省略 → null
    })
    .select()
    .single();

  if (insertError || !match) {
    console.error('INSERT 失敗:', insertError);
    process.exit(1);
  }

  const entryOpen = new Date(new Date(match.starts_at).getTime() - 15 * 60 * 1000);
  const tc = match.timer_config as any;

  console.log('\n✅ テスト公式戦 作成成功');
  console.log('========================================');
  console.log('match_id         :', match.id);
  console.log('start_time (JST) :', new Date(match.starts_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
  console.log('entry_open (JST) :', entryOpen.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
  console.log('start_time (UTC) :', match.starts_at);
  console.log('Black            :', naoya.email, '/', match.black_user_id);
  console.log('White            :', testUser.email, '/', match.white_user_id);
  console.log('timer_config     :', JSON.stringify(tc));
  console.log('status           :', match.status);
  console.log('tournament_id    :', (match as any).tournament_id ?? 'null（Ranked Match）');
  console.log('========================================');

  // Step 5: DB確認
  const { data: verify, error: verifyError } = await sb
    .from('official_matches')
    .select('id, black_user_id, white_user_id, starts_at, status, timer_config, tournament_id')
    .eq('id', match.id)
    .single();

  if (verifyError || !verify) {
    console.error('確認クエリ失敗:', verifyError);
  } else {
    const v = verify as any;
    const vtc = v.timer_config as any;
    console.log('\n[DB確認]');
    console.log('  id            :', v.id);
    console.log('  black_user_id :', v.black_user_id, `(${naoya.email})`);
    console.log('  white_user_id :', v.white_user_id, `(${testUser.email})`);
    console.log('  starts_at JST :', new Date(v.starts_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
    console.log('  status        :', v.status);
    console.log('  timer_config  :', JSON.stringify(v.timer_config));
    console.log('  tournament_id :', v.tournament_id ?? 'null');
    console.log('\n  [チェック]');
    console.log('  timer mode=total_time / 60秒:', vtc?.mode === 'total_time' && vtc?.totalSeconds === 60 ? '✅' : `❌ (${JSON.stringify(vtc)})`);
    console.log('  Black = naoya.tsujimoto@gmail.com:', v.black_user_id === naoya.id ? '✅' : '❌');
    console.log('  White = oneeight-test:            ', v.white_user_id === testUser.id ? '✅' : '❌');
    console.log('  tournament_id = null:             ', v.tournament_id == null ? '✅' : `❌ (${v.tournament_id})`);
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
