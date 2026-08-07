/**
 * AI確認専用アカウント作成スクリプト
 * 実行: npx tsx scripts/_create_ai_inspection_accounts.ts
 *
 * パスワードは macOS Keychain に保存。コンソールには一切出力しない。
 * 実行前に .env の SUPABASE_SERVICE_ROLE_KEY が設定済みであること。
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// .env 読み込み
function loadEnv() {
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
  } catch {
    // .env が存在しない場合は環境変数をそのまま使用
  }
}
loadEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('ERROR: VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function generatePassword(len = 24): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#%^&*';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => chars[b % chars.length]).join('');
}

function saveToKeychain(account: string, password: string): void {
  // macOS Keychain に保存（コンソールに password を出力しない）
  execSync(
    `security add-generic-password -s "one-eight-ai-check" -a "${account}" -w "${password}" -U`,
    { stdio: 'pipe' }
  );
}

function keychainExists(account: string): boolean {
  try {
    execSync(
      `security find-generic-password -s "one-eight-ai-check" -a "${account}" -w`,
      { stdio: 'pipe' }
    );
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const freeEmail = 'ai-check-free@oneeightgame.com';
  const proEmail  = 'ai-check-pro@oneeightgame.com';

  // --- FREE アカウント ---
  console.log('Processing FREE account...');

  // 既存ユーザーを検索
  const { data: existingFreeList } = await admin.auth.admin.listUsers();
  const existingFree = existingFreeList?.users.find(u => u.email === freeEmail);

  let freeUserId: string;

  if (existingFree) {
    console.log('FREE account already exists:', existingFree.id);
    freeUserId = existingFree.id;
  } else {
    const freePassword = generatePassword();
    saveToKeychain('ai-check-free', freePassword);
    console.log('FREE password saved to macOS Keychain (service: one-eight-ai-check, account: ai-check-free)');

    const { data: freeUser, error: freeErr } = await admin.auth.admin.createUser({
      email: freeEmail,
      password: freePassword,
      email_confirm: true,
      user_metadata: { display_name: 'AI CHECK FREE' },
    });
    if (freeErr) { console.error('FREE creation failed:', freeErr.message); process.exit(1); }
    freeUserId = freeUser.user.id;
    console.log('FREE account created:', freeUserId);
  }

  // FREE profile 設定
  const { error: freeProfileErr } = await admin.from('profiles').upsert({
    id: freeUserId,
    display_name: 'AI CHECK FREE',
    lang: 'en',
    stats_public: false,
    plan: 'free',
    subscription_status: 'inactive',
    current_period_end: null,
    is_admin: false,
    is_test_account: true,
    is_internal_test_account: true,
    internal_plan_override: null,
  }, { onConflict: 'id' });
  if (freeProfileErr) {
    console.error('FREE profile upsert failed:', freeProfileErr.message);
    process.exit(1);
  }
  console.log('FREE profile configured');

  // --- PRO アカウント ---
  console.log('Processing PRO account...');

  const existingPro = existingFreeList?.users.find(u => u.email === proEmail);
  let proUserId: string;

  if (existingPro) {
    console.log('PRO account already exists:', existingPro.id);
    proUserId = existingPro.id;
  } else {
    const proPassword = generatePassword();
    saveToKeychain('ai-check-pro', proPassword);
    console.log('PRO password saved to macOS Keychain (service: one-eight-ai-check, account: ai-check-pro)');

    const { data: proUser, error: proErr } = await admin.auth.admin.createUser({
      email: proEmail,
      password: proPassword,
      email_confirm: true,
      user_metadata: { display_name: 'AI CHECK PRO' },
    });
    if (proErr) { console.error('PRO creation failed:', proErr.message); process.exit(1); }
    proUserId = proUser.user.id;
    console.log('PRO account created:', proUserId);
  }

  // PRO profile 設定
  const { error: proProfileErr } = await admin.from('profiles').upsert({
    id: proUserId,
    display_name: 'AI CHECK PRO',
    lang: 'en',
    stats_public: false,
    plan: 'free',                  // Paddle plan は free のまま
    subscription_status: 'inactive',
    current_period_end: null,
    is_admin: false,
    is_test_account: true,
    is_internal_test_account: true,
    internal_plan_override: 'pro', // 内部 override で Pro 扱い
  }, { onConflict: 'id' });
  if (proProfileErr) {
    console.error('PRO profile upsert failed:', proProfileErr.message);
    process.exit(1);
  }
  console.log('PRO profile configured');

  console.log('');
  console.log('Done.');
  console.log('FREE account ID:', freeUserId);
  console.log('PRO  account ID:', proUserId);
  console.log('');
  console.log('To retrieve passwords from Keychain:');
  console.log('  security find-generic-password -s "one-eight-ai-check" -a "ai-check-free" -w');
  console.log('  security find-generic-password -s "one-eight-ai-check" -a "ai-check-pro"  -w');
}

main().catch(e => { console.error(e); process.exit(1); });
