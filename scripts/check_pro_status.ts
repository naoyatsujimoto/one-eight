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

const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const uid = '9924668a-a5ee-4bd3-a71e-f8f993e3f094';

async function main() {
  const { data: profile, error } = await sb
    .from('profiles')
    .select('id, plan, subscription_status, current_period_end')
    .eq('id', uid)
    .single();
  
  if (error) {
    console.log('Error:', error.message);
    return;
  }
  
  console.log('Profile:', {
    id: (profile.id as string).substring(0, 8),
    plan: profile.plan,
    subscription_status: profile.subscription_status,
    current_period_end: profile.current_period_end,
  });
  
  // isProActive 相当の判定
  const isProActive = profile.plan === 'pro'
    && profile.subscription_status === 'active'
    && (!profile.current_period_end || new Date(profile.current_period_end) > new Date());
  
  console.log('isProActive:', isProActive);
}

main().catch(console.error);
