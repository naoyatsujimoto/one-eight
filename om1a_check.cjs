const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://farieecfyajbtmjxelop.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhcmllZWNmeWFqYnRtanhlbG9wIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjU4MTEyOCwiZXhwIjoyMDkyMTU3MTI4fQ.Mk81v949kAAwvn_Cz0M1d8w_W9-b6f7jZZ-CoKT6Sak';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  console.log('=== Phase 1: DB Structure Check ===\n');

  // 1. profiles.is_admin カラム確認
  const r1 = await supabase.from('profiles').select('id, is_admin').limit(1);
  if (r1.error) {
    console.log('[1] profiles.is_admin: NG —', r1.error.message);
  } else {
    console.log('[1] profiles.is_admin: OK — sample:', JSON.stringify(r1.data));
  }

  // 2. official_matches テーブル確認
  const r2 = await supabase.from('official_matches').select('*').limit(1);
  if (r2.error) {
    console.log('[2] official_matches テーブル: NG —', r2.error.message);
  } else {
    const cols = r2.data && r2.data.length > 0 ? Object.keys(r2.data[0]).join(', ') : '(empty table)';
    console.log('[2] official_matches テーブル: OK — columns:', cols);
    if (r2.data && r2.data.length > 0) {
      console.log('    row sample:', JSON.stringify(r2.data[0]));
    }
  }

  // 3. is_admin=true のユーザー（uid と is_admin のみ）
  const r5 = await supabase.from('profiles').select('id, is_admin').eq('is_admin', true).limit(5);
  if (r5.error) {
    console.log('[3] is_admin=true users: NG —', r5.error.message);
  } else {
    console.log('[3] is_admin=true users:', JSON.stringify(r5.data));
  }
}

main().catch(console.error);
