/**
 * check_pro_user.ts
 * tsujimoto@tentomushi.co.jp の auth.users / profiles 確認
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
try {
  const envPath = resolve(process.cwd(), '.env');
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch {}

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const TARGET_EMAIL = 'tsujimoto@tentomushi.co.jp';

  // 1. auth.users で email から id を取得
  const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();
  if (usersError) {
    console.error('auth.admin.listUsers error:', usersError);
    return;
  }
  const target = usersData?.users?.find(u => u.email === TARGET_EMAIL);
  console.log('auth.users:', target?.id, target?.email);
  if (!target) {
    console.log('=> ユーザーが auth.users に存在しない');
    return;
  }

  // 2. profiles テーブルの行を確認
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', target.id)
    .single();

  if (profileError) {
    console.log('profiles error:', JSON.stringify(profileError, null, 2));
  }
  console.log('profiles row:', JSON.stringify(profile, null, 2));
}

main().catch(console.error);
