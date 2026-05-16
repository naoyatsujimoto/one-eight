import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://farieecfyajbtmjxelop.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhcmllZWNmeWFqYnRtanhlbG9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1ODExMjgsImV4cCI6MjA5MjE1NzEyOH0.YI_XFRTtF83Cy7BeNDq0D-40mxU1hEgMoE2wF-fqHlA'
);

// ユーザーリスト確認
async function main() {
  // authの設定確認
  const { data: { session } } = await supabase.auth.getSession();
  console.log('Current session:', session?.user?.email || 'none');
  
  // match_logs で113969e1を検索（cast経由）
  const { data, error } = await supabase
    .from('match_logs')
    .select('id, full_record')
    .filter('id::text', 'like', '113969e1%')
    .limit(3);
  console.log('match search result:', error?.message || 'OK', data?.length);
}

main().catch(console.error);
