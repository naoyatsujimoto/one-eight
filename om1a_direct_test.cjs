/**
 * OM-1a Phase 2: Direct INSERT test via service_role (bypasses RLS)
 * RPC の admin 判定は auth.uid() に依存するため service_role では通過不可。
 * 代わりに:
 *   (A) official_matches への直接 INSERT（service_role は RLS バイパス）
 *   (B) official_matches の columns 確認（select で確認）
 *   (C) RLS ポリシーの存在確認（select に成功するかどうかで判定）
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://farieecfyajbtmjxelop.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhcmllZWNmeWFqYnRtanhlbG9wIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjU4MTEyOCwiZXhwIjoyMDkyMTU3MTI4fQ.Mk81v949kAAwvn_Cz0M1d8w_W9-b6f7jZZ-CoKT6Sak';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  console.log('=== Phase 2: Direct DB operations via service_role ===\n');

  // --- 1. profiles から2名取得（black/white用）---
  const rProfiles = await supabase.from('profiles').select('id, is_admin').limit(5);
  if (rProfiles.error) {
    console.log('[profiles] error:', rProfiles.error.message);
    return;
  }
  console.log('[profiles]', JSON.stringify(rProfiles.data));

  if (rProfiles.data.length < 2) {
    console.log('[SKIP] 2 users needed for test');
    return;
  }

  const [user1, user2] = rProfiles.data;
  console.log('user1:', user1.id, 'user2:', user2.id);

  const startsAt = new Date(Date.now() + 3600 * 1000).toISOString();
  const timerConfig = { mode: 'total_time', totalSeconds: 600 };

  // --- 2. official_matches に直接 INSERT（service_role = RLS バイパス）---
  const rInsert = await supabase
    .from('official_matches')
    .insert({
      black_user_id: user1.id,
      white_user_id: user2.id,
      starts_at: startsAt,
      status: 'scheduled',
      timer_config: timerConfig,
      created_by: user1.id
    })
    .select();

  if (rInsert.error) {
    console.log('[INSERT official_matches] NG —', rInsert.error.message, rInsert.error.details);
  } else {
    console.log('[INSERT official_matches] OK — row:', JSON.stringify(rInsert.data));

    const matchId = rInsert.data[0]?.id;
    console.log('match_id:', matchId);

    // --- 3. list_my_official_matches: user1 で呼ぶ（auth.uid()=NULL → [] 想定）---
    // service_role に auth.uid() はないため空
    const rList = await supabase.rpc('list_my_official_matches');
    console.log('[list_my_official_matches service_role]:', JSON.stringify(rList.data), rList.error?.message);

    // --- 4. cancel_official_match: service_role は auth.uid()=NULL → admin required ---
    // これは期待通りの挙動（admin チェックが機能している）
    const rCancel = await supabase.rpc('cancel_official_match', {
      p_match_id: matchId,
      p_reason: 'test'
    });
    if (rCancel.error) {
      console.log('[cancel_official_match] error (expected if auth.uid=NULL):', rCancel.error.message);
    } else {
      console.log('[cancel_official_match] result:', JSON.stringify(rCancel.data));
    }

    // --- 5. クリーンアップ: 作成した match を削除 ---
    const rDelete = await supabase.from('official_matches').delete().eq('id', matchId);
    if (rDelete.error) {
      console.log('[DELETE cleanup] NG:', rDelete.error.message);
    } else {
      console.log('[DELETE cleanup] OK — test match deleted');
    }
  }

  // --- 6. official_matches カラム確認（空の select * で確認）---
  const rCols = await supabase.from('official_matches').select('*').limit(0);
  if (rCols.error) {
    console.log('[columns check] NG:', rCols.error.message);
  } else {
    console.log('[columns check] OK — table exists and is accessible');
  }

  // --- 7. is_admin = true の確認（現在 0 名）---
  const rAdmins = await supabase.from('profiles').select('id, is_admin').eq('is_admin', true);
  console.log('[is_admin=true count]:', rAdmins.data?.length ?? 'error');
  if (rAdmins.data && rAdmins.data.length > 0) {
    console.log('admin uids:', rAdmins.data.map(u => u.id).join(', '));
  } else {
    console.log('[NOTE] No admin users. create_official_match admin test SKIPPED.');
  }
}

main().catch(console.error);
