/**
 * paddle_webhook_subscription_updated.test.ts
 *
 * Paddle subscription.updated webhook処理のロジック検証テスト。
 *
 * NOTE: Edge Function本体 (supabase/functions/paddle-webhook/index.ts) は
 * Deno専用の import URL (https://esm.sh/...) と Deno.serve を使用するため、
 * vitest (Node/jsdom環境) から直接 import することはできない。
 *
 * このテストファイルは:
 *   1. profile.ts の isProActive が subscription.updated の各ケースで正しく動作するか
 *   2. current_period_end の更新有無による isProActive の挙動を検証する
 *
 * これにより、webhook が current_period_end を正しく更新した場合/しなかった場合の
 * 結果をアプリ側で確認できる。
 */

import { describe, it, expect } from 'vitest';
import { isProActive } from '../lib/profile';

// ────────────────────────────────────────────────────────────────────────────
// A. subscription.updated / active / current_billing_period.ends_at あり
//    → plan=pro, subscription_status=active, current_period_end が新しい ends_at に更新
// ────────────────────────────────────────────────────────────────────────────
describe('A. subscription.updated / active / ends_at あり', () => {
  it('updated ends_at が未来 → isProActive = true', () => {
    const updatedEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    // webhook が current_period_end を updatedEndsAt に更新した後の profile 状態
    expect(isProActive({
      plan: 'pro',
      subscription_status: 'active',
      current_period_end: updatedEndsAt,
    })).toBe(true);
  });

  it('旧 ends_at (過去) のまま更新されていない場合 → isProActive = false (バグ状態)', () => {
    const oldEndsAt = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(); // 昨日
    expect(isProActive({
      plan: 'pro',
      subscription_status: 'active',
      current_period_end: oldEndsAt,
    })).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// B. subscription.updated / active / ends_at 欠落
//    → webhook は成功扱いにしない / current_period_end を壊さない
//    (profile 側の検証: 既存の有効な current_period_end が保持されていれば OK)
// ────────────────────────────────────────────────────────────────────────────
describe('B. subscription.updated / active / ends_at 欠落', () => {
  it('既存の有効な current_period_end が保持されていれば isProActive = true', () => {
    // webhook が ends_at 欠落時に current_period_end を null 上書きしない場合のシナリオ
    const existingEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(isProActive({
      plan: 'pro',
      subscription_status: 'active',
      current_period_end: existingEndsAt,
    })).toBe(true);
  });

  it('ends_at 欠落で current_period_end が null に上書きされた場合 → isProActive = true (null は有効扱い)', () => {
    // NOTE: isProActive では status=active かつ current_period_end=null は「制限なし有効」として true を返す
    // webhook で null 上書きされた場合は過剰にProになるリスクがあるため、
    // 修正後の webhook は ends_at 欠落時に current_period_end を更新しない
    expect(isProActive({
      plan: 'pro',
      subscription_status: 'active',
      current_period_end: null,
    })).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// C. stale event (旧 occurred_at のイベントが新しい状態を上書きしない)
//    → profile の current_period_end は新しい値のまま
// ────────────────────────────────────────────────────────────────────────────
describe('C. stale event guard', () => {
  it('新しい current_period_end が設定された後でも isProActive が正しく動作する', () => {
    const newEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    // stale event は profile を上書きしないため、新しい ends_at が維持される
    expect(isProActive({
      plan: 'pro',
      subscription_status: 'active',
      current_period_end: newEndsAt,
    })).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// D. duplicate event_id (冪等性)
//    → 2回目以降は paddle_webhook_events の PRIMARY KEY 衝突でスキップ
//    → profile は最初の処理結果を維持
// ────────────────────────────────────────────────────────────────────────────
describe('D. duplicate event_id (冪等性)', () => {
  it('冪等処理後も isProActive が正しく動作する', () => {
    const endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(isProActive({
      plan: 'pro',
      subscription_status: 'active',
      current_period_end: endsAt,
    })).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// E. info@tentomushi.co.jp guard
//    → Pro化されない (denied_account でスキップ)
//    → profile は free / inactive のまま
// ────────────────────────────────────────────────────────────────────────────
describe('E. info@tentomushi.co.jp guard', () => {
  it('denied_account 後は plan=free のまま → isProActive = false', () => {
    expect(isProActive({
      plan: 'free',
      subscription_status: 'inactive',
      current_period_end: null,
    })).toBe(false);
  });

  it('denied_account 後に pro にされても current_period_end が過去なら false', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(isProActive({
      plan: 'pro',
      subscription_status: 'active',
      current_period_end: past,
    })).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// F. is_test_account guard
//    → webhook でスキップされた後も test account は free / inactive のまま
// ────────────────────────────────────────────────────────────────────────────
describe('F. is_test_account guard', () => {
  it('test account はwebhookでスキップ → plan=free のまま → isProActive = false', () => {
    expect(isProActive({
      plan: 'free',
      subscription_status: 'inactive',
      current_period_end: null,
    })).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// isProActive: canceled / past_due シナリオの確認
// ────────────────────────────────────────────────────────────────────────────
describe('canceled / past_due のシナリオ', () => {
  it('canceled + current_period_end が未来 → isProActive = true (Pro維持)', () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(isProActive({
      plan: 'pro',
      subscription_status: 'canceled',
      current_period_end: future,
    })).toBe(true);
  });

  it('canceled + current_period_end が過去 → isProActive = false', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(isProActive({
      plan: 'pro',
      subscription_status: 'canceled',
      current_period_end: past,
    })).toBe(false);
  });

  it('canceled + current_period_end = null → isProActive = false', () => {
    expect(isProActive({
      plan: 'pro',
      subscription_status: 'canceled',
      current_period_end: null,
    })).toBe(false);
  });

  it('past_due → isProActive = false (有効期限に関わらず)', () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(isProActive({
      plan: 'pro',
      subscription_status: 'past_due',
      current_period_end: future,
    })).toBe(false);
  });
});
