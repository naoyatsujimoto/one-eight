// create_daily_test_official_match.ts
// 日次テスト公式戦作成スクリプト（Gate D / 2G）
//
// 用途: Opusによる日次公式戦UI確認用テスト公式戦を毎日作成する
// 実行タイミング: 毎日 15:00 JST（cron 経由）
// 公式戦条件:
//   starts_at:      当日 16:15 JST
//   entry_open:     当日 16:00 JST (starts_at - 15分)
//   participants:   naoya.tsujimoto@gmail.com (Black) / oneeight-test@oneeightgame.com (White)
//   timer_config:   { mode: 'total_time', totalSeconds: 60 }（各1分）
//   重複防止:        同日・同開始時刻・同参加者の official_match が既存なら skip
//
// 禁止事項: 対局プレイ / UI目視確認 / Ghost/Postmortem調査 / stats変更 / rebuild RPC
// DB変更範囲: official_matches INSERT のみ
//
// Usage: npx tsx scripts/create_daily_test_official_match.ts

import { readFileSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// .env ロード
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

// ログ設定
const LOG_DIR = '/Users/nt/.openclaw/workspace-gate-d/logs';
const todayJST = (): string => {
  const d = new Date();
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
};
const logPath = join(LOG_DIR, `daily_test_match_${todayJST()}.log`);

const log = (msg: string): void => {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(logPath, line + '\n');
  } catch (e) {
    console.error('[LOG_WRITE_ERROR]', e);
  }
};

// starts_at 計算: 当日 16:15 JST
const computeStartsAt = (): Date => {
  const now = new Date();
  // JST today
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year  = jst.getUTCFullYear();
  const month = jst.getUTCMonth();
  const day   = jst.getUTCDate();
  // 16:15 JST = 07:15 UTC
  return new Date(Date.UTC(year, month, day, 7, 15, 0));
};

// Supabase クライアント（service_role）
const sb = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main(): Promise<void> {
  log('=== create_daily_test_official_match 開始 ===');

  // Step 1: ユーザーID取得
  const { data: { users }, error: usersError } = await sb.auth.admin.listUsers();
  if (usersError || !users) {
    log(`ERROR: auth.users 取得失敗: ${usersError?.message}`);
    process.exit(1);
  }

  const naoya    = users.find(u => u.email === 'naoya.tsujimoto@gmail.com');
  const testUser = users.find(u => u.email === 'oneeight-test@oneeightgame.com');

  if (!naoya) {
    log('ERROR: naoya.tsujimoto@gmail.com が見つかりません');
    process.exit(1);
  }
  if (!testUser) {
    log('ERROR: oneeight-test@oneeightgame.com が見つかりません');
    process.exit(1);
  }

  log(`naoya.tsujimoto@gmail.com user_id: ${naoya.id}`);
  log(`oneeight-test@oneeightgame.com user_id: ${testUser.id}`);

  // Step 2: starts_at 計算
  const startsAt = computeStartsAt();
  const entryOpenAt = new Date(startsAt.getTime() - 15 * 60 * 1000);

  const startsAtJST     = startsAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const entryOpenJST    = entryOpenAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  log(`starts_at (JST): ${startsAtJST}`);
  log(`entry_open (JST): ${entryOpenJST}`);
  log(`starts_at (UTC): ${startsAt.toISOString()}`);

  // Step 3: 重複チェック
  // 同日・同開始時刻・同参加者（black/white 順不問）の official_match が既存か確認
  const { data: existing, error: checkError } = await sb
    .from('official_matches')
    .select('id, starts_at, status')
    .eq('starts_at', startsAt.toISOString())
    .or(
      `and(black_user_id.eq.${naoya.id},white_user_id.eq.${testUser.id}),` +
      `and(black_user_id.eq.${testUser.id},white_user_id.eq.${naoya.id})`
    )
    .not('status', 'eq', 'cancelled');

  if (checkError) {
    log(`ERROR: 重複チェッククエリ失敗: ${checkError.message}`);
    process.exit(1);
  }

  if (existing && existing.length > 0) {
    log(`SKIP: 既存の公式戦が見つかりました (${existing.length}件)`);
    for (const m of existing) {
      log(`  → match_id: ${m.id} / status: ${m.status} / starts_at: ${m.starts_at}`);
    }
    log('重複のため新規作成をスキップします。');
    log('=== 終了: SKIPPED ===');
    process.exit(0);
  }

  log('重複なし。新規作成を開始します。');

  // Step 4: INSERT
  const timerConfig = { mode: 'total_time', totalSeconds: 60 };

  const { data: match, error: insertError } = await sb
    .from('official_matches')
    .insert({
      black_user_id: naoya.id,
      white_user_id: testUser.id,
      starts_at:     startsAt.toISOString(),
      status:        'scheduled',
      timer_config:  timerConfig,
      created_by:    naoya.id,
    })
    .select()
    .single();

  if (insertError || !match) {
    log(`ERROR: INSERT 失敗: ${insertError?.message}`);
    process.exit(1);
  }

  const entryOpen = new Date(new Date(match.starts_at).getTime() - 15 * 60 * 1000);

  log('✅ テスト公式戦 作成成功');
  log(`match_id:          ${match.id}`);
  log(`start_time (JST):  ${new Date(match.starts_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
  log(`entry_open (JST):  ${entryOpen.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
  log(`start_time (UTC):  ${match.starts_at}`);
  log(`participants:      Black=${naoya.email} / White=${testUser.email}`);
  log(`timer_config:      ${JSON.stringify(match.timer_config)}`);
  log(`status:            ${match.status}`);
  log(`online_game_id:    ${(match as any).online_game_id ?? 'null（入室前）'}`);

  // Step 5: DB確認
  const { data: verify, error: verifyError } = await sb
    .from('official_matches')
    .select('id, black_user_id, white_user_id, starts_at, status, timer_config')
    .eq('id', match.id)
    .single();

  if (verifyError || !verify) {
    log(`WARN: DB確認クエリ失敗: ${verifyError?.message}`);
  } else {
    const tc = verify.timer_config as any;
    const ok_mode   = tc?.mode === 'total_time';
    const ok_sec    = tc?.totalSeconds === 60;
    const ok_black  = verify.black_user_id === naoya.id;
    const ok_white  = verify.white_user_id === testUser.id;
    log(`[DB確認] timer mode=total_time: ${ok_mode ? '✅' : '❌'} / 60秒: ${ok_sec ? '✅' : '❌'} / Black=naoya: ${ok_black ? '✅' : '❌'} / White=test: ${ok_white ? '✅' : '❌'}`);
  }

  log('=== 終了: SUCCESS ===');
  process.exit(0);
}

main().catch(err => {
  log(`FATAL: ${err?.message ?? String(err)}`);
  process.exit(1);
});
