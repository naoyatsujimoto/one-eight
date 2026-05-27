// create_test_official_match.ts
// OM-1b 実機確認用テスト公式戦を1件作成する
// Usage: npx tsx scripts/create_test_official_match.ts

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
  // Step 1: Naoya 以外のプロファイルを1件取得
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
  console.log(`対戦相手候補: ${opponent.id} (${opponent.display_name ?? 'no name'})`);

  // Step 2: starts_at = now + 8分
  const startsAt = new Date(Date.now() + 8 * 60 * 1000);
  console.log(`starts_at: ${startsAt.toISOString()}`);
  console.log(`joinable ウィンドウ開始 (15分前): ${new Date(startsAt.getTime() - 15 * 60 * 1000).toISOString()}`);

  // Step 3: official_matches に直接 INSERT
  const { data: match, error: insertError } = await sb
    .from('official_matches')
    .insert({
      black_user_id: NAOYA_ID,
      white_user_id: opponent.id,
      starts_at: startsAt.toISOString(),
      status: 'scheduled',
      timer_config: { mode: 'total_time', totalSeconds: 600 },
      created_by: NAOYA_ID,
    })
    .select()
    .single();

  if (insertError || !match) {
    console.error('INSERT 失敗:', insertError);
    process.exit(1);
  }

  console.log('\n✅ テスト公式戦 作成成功');
  console.log('match_id:', match.id);
  console.log('black_user_id:', match.black_user_id);
  console.log('white_user_id:', match.white_user_id);
  console.log('starts_at:', match.starts_at);
  console.log('status:', match.status);
  console.log('timer_config:', JSON.stringify(match.timer_config));
  console.log('created_by:', match.created_by);

  // Step 4: list_my_official_matches で Naoya の公式戦一覧を取得確認
  console.log('\n--- list_my_official_matches 確認 ---');
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth() + 4, 0).toISOString();

  const { data: myMatches, error: listError } = await sb
    .rpc('list_my_official_matches', {
      p_user_id: NAOYA_ID,
      p_from: from,
      p_to: to,
    });

  if (listError) {
    // RPC がサービスロールで p_user_id を直接受け取る形式でない可能性
    // 別の呼び方を試みる
    console.log('list_my_official_matches(p_user_id) 失敗, 代替方法を試みます:', listError.message);

    const { data: directCheck, error: directError } = await sb
      .from('official_matches')
      .select('id, black_user_id, white_user_id, starts_at, status, timer_config')
      .or(`black_user_id.eq.${NAOYA_ID},white_user_id.eq.${NAOYA_ID}`)
      .order('starts_at', { ascending: true });

    if (directError) {
      console.error('直接クエリも失敗:', directError);
    } else {
      console.log(`Naoya の公式戦 (直接クエリ): ${directCheck?.length ?? 0} 件`);
      directCheck?.forEach(m => {
        console.log(`  - id: ${m.id} | starts_at: ${m.starts_at} | status: ${m.status}`);
      });
    }
  } else {
    console.log(`Naoya の公式戦: ${myMatches?.length ?? 0} 件`);
    (myMatches as any[])?.forEach((m: any) => {
      console.log(`  - id: ${m.id} | starts_at: ${m.starts_at} | status: ${m.status}`);
    });
  }

  console.log('\n=== 確認事項 ===');
  console.log(`match_id: ${match.id}`);
  console.log(`black (Naoya): ${match.black_user_id}`);
  console.log(`white (opponent): ${match.white_user_id} (${opponent.display_name ?? 'no name'})`);
  console.log(`starts_at: ${match.starts_at}`);
  console.log(`joinable ウィンドウ: ${new Date(startsAt.getTime() - 15 * 60 * 1000).toISOString()} 〜 ${new Date(startsAt.getTime() + 30 * 60 * 1000).toISOString()}`);
  console.log(`timer_config: total_time / 600秒`);
}

main().catch(err => {
  console.error('エラー:', err);
  process.exit(1);
});
