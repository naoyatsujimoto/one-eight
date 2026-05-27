import { readFileSync } from 'fs';
try {
  const lines = readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/.env', 'utf-8').split('\n');
  for (const line of lines) { const t=line.trim(); if(!t||t.startsWith('#'))continue; const idx=t.indexOf('='); if(idx<0)continue; const k=t.slice(0,idx).trim(); const v=t.slice(idx+1).trim().replace(/^["']|["']$/g,''); if(!process.env[k])process.env[k]=v; }
} catch {}
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const UID = '9924668a-a5ee-4bd3-a71e-f8f993e3f094';

async function main() {
  const { data: profile } = await sb.from('profiles').select('*').eq('id', UID).single();
  console.log('=== profiles (9924668a) ===');
  if (profile) {
    for (const [k, v] of Object.entries(profile as object)) {
      if (k === 'id') continue;
      console.log(`  ${k}: ${v ?? 'null'}`);
    }
    const p = profile as any;
    const isPro = p.plan === 'pro' && p.subscription_status === 'active'
      && (!p.current_period_end || new Date(p.current_period_end) > new Date());
    console.log(`\n  isProActive = ${isPro ? '✅ true' : '❌ false'}`);
    if (!isPro) {
      console.log(`  → showGhostToggle = false → Ghost fetch が止まる ← これが原因の可能性`);
    }
  }

  // App.tsx の isProActive 関数の定義も確認
  const matchLogSrc = readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/src/lib/matchLog.ts', 'utf-8');
  const isProLines = matchLogSrc.split('\n').filter((_, i, arr) => {
    const line = arr[i];
    return line?.includes('isProActive') || arr[i-1]?.includes('isProActive') || arr[i+1]?.includes('isProActive');
  }).slice(0, 10);
  console.log('\n=== isProActive 関数 ===');
  isProLines.forEach(l => console.log('  ' + l.trim()));
}
main().catch(e => { console.error(e); process.exit(1); });
