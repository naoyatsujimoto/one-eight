// create_test_official_match_timeout.ts
// timeout 勝利表示修正確認用のテスト公式戦を作成する
// starts_at = now + 5分 / timer_config: total_time 120秒 / Naoya = Black
// Usage: npx tsx scripts/create_test_official_match_timeout.ts

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

const NAOYA_ID = '9924668a-a5ee-4bd3-a71e-f8f993e3f094';

async function main() {
  // Step 1: Naoya 以外のプロファイルを取得
  const { data: profiles, error: profilesError } = await sb
    .from('profiles')
    .select('id, display_name')
    .neq('id', NAOYA_ID)
    .limit(5);

  if (profilesError || !profiles || profiles.length === 0) {
    console.error('プロファイル取得失敗:', profilesError);
    process.exit(1);
  }

  const opponent = profiles[0];
  console.log(`対戦相手: ${opponent.id} (${opponent.display_name ?? 'no name'})`);

  // Step 2: starts_at = now + 5分
  const startsAt = new Date(Date.now() + 5 * 60 * 1000);
  const timerConfig = { mode: 'total_time', totalSeconds: 120 };

  console.log(`starts_at: ${startsAt.toISOString()}`);
  console.log(`timer_config: ${JSON.stringify(timerConfig)}`);
  console.log(`入室ウィンドウ開始 (15分前): ${new Date(startsAt.getTime() - 15 * 60 * 1000).toISOString()}`);
  console.log(`入室ウィンドウ終了 (starts_at + totalSeconds): ${new Date(startsAt.getTime() + 120 * 1000).toISOString()}`);

  // Step 3: official_matches に直接 INSERT（service_role でバイパス）
  const { data: match, error: insertError } = await sb
    .from('official_matches')
    .insert({
      black_user_id: NAOYA_ID,
      white_user_id: opponent.id,
      starts_at: startsAt.toISOString(),
      status: 'scheduled',
      timer_config: timerConfig,
      created_by: NAOYA_ID,
    })
    .select()
    .single();

  if (insertError || !match) {
    console.error('INSERT 失敗:', insertError);
    process.exit(1);
  }

  console.log('\n✅ テスト公式戦 作成成功');
  console.log('========================================');
  console.log('match_id    :', match.id);
  console.log('black (Naoya):', match.black_user_id);
  console.log('white (opp)  :', match.white_user_id, `(${opponent.display_name ?? 'no name'})`);
  console.log('starts_at    :', match.starts_at);
  console.log('status       :', match.status);
  console.log('timer_config :', JSON.stringify(match.timer_config));
  console.log('online_game_id:', match.online_game_id ?? 'null (未作成)');
  console.log('========================================');

  // Step 4: 直接クエリで現在の公式戦リストを確認
  const { data: allMatches, error: listError } = await sb
    .from('official_matches')
    .select('id, black_user_id, white_user_id, starts_at, status, timer_config, online_game_id')
    .or(`black_user_id.eq.${NAOYA_ID},white_user_id.eq.${NAOYA_ID}`)
    .order('starts_at', { ascending: false })
    .limit(10);

  if (listError) {
    console.error('一覧取得失敗:', listError);
  } else {
    console.log(`\nNaoya の公式戦 (直近10件):`);
    allMatches?.forEach(m => {
      const tc = m.timer_config as any;
      console.log(`  id: ${m.id}`);
      console.log(`     starts_at: ${m.starts_at} | status: ${m.status}`);
      console.log(`     timer: ${tc?.mode} / ${tc?.totalSeconds}s | game_id: ${m.online_game_id ?? 'null'}`);
    });
  }

  console.log('\n========================================');
  console.log('【Naoya 確認手順】');
  console.log('1. User Page を開く → Official Match Calendar を確認');
  console.log(`2. starts_at: ${startsAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} の公式戦が表示されること`);
  console.log('3. 15分前から入室可能。starts_at 到達後に Black 時計 2:00 から減算開始');
  console.log('4. 相手側 timeout または no_contest を発生させる');
  console.log('5. Official Match Calendar の Recent Results で「○ Win by timeout」を確認');
  console.log('6. User Page 上部「最近の対局」テーブルでも「○」表示になることを確認');
  console.log('');
  console.log('【Cleanup 方法】');
  console.log('以下の SQL を Supabase SQL Editor で実行（ただし Gate D スクリプトで実施可能）:');
  console.log(`  UPDATE official_matches SET status = 'cancelled', end_reason = 'cancelled' WHERE id = '${match.id}';`);
  console.log('  または');
  console.log(`  DELETE FROM official_matches WHERE id = '${match.id}';`);
  console.log(`  ※ online_game_id が設定されている場合は online_games も合わせて削除が必要`);
}

main().catch(err => {
  console.error('エラー:', err);
  process.exit(1);
});
