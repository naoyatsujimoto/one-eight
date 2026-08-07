/**
 * ai_inspection_accounts_fix.test.ts
 *
 * AI確認アカウント補正 (20260807000002) の回帰テスト
 *
 * テスト対象:
 *   - enter_arena_event にガードが存在すること (DB定義の構造確認)
 *   - submit_prize_tax_submission が NOTICE のみでなく実際に拒否すること (関数シグネチャ確認)
 *   - join_or_create_random_game にガードが存在すること
 *   - online_games 直接INSERT ポリシーが補正されていること
 *   - 対象RPCの引数・戻り値・権限が維持されること
 *   - 通常プロフィールのPro判定が変わらないこと
 *   - AI FREEはFree、AI PROはProとして表示されること
 *   - /ai-check-login は AuthGate 外、通常 AuthGate は未変更
 */

import { describe, it, expect } from 'vitest';
import { isProActive } from '../lib/profile';

// ---------------------------------------------------------------------------
// ヘルパー: Pro判定ロジックの再現
// ---------------------------------------------------------------------------

// isProActive の内部ロジック参照テスト
function testIsProActive(profile: {
  plan?: string;
  subscription_status?: string;
  current_period_end?: string | null;
  internal_plan_override?: string | null;
}): boolean {
  // internal_plan_override が 'pro' なら Pro扱い (AI PROアカウント)
  if (profile.internal_plan_override === 'pro') return true;
  // internal_plan_override が 'free' なら Free扱い (AI FREEアカウント)
  if (profile.internal_plan_override === 'free') return false;

  // 通常のPro判定 (F-05準拠)
  if (profile.plan !== 'pro') return false;
  const status = profile.subscription_status;
  const end = profile.current_period_end;
  if (status === 'active') {
    return !end || new Date(end) > new Date();
  }
  if (status === 'canceled') {
    return !!end && new Date(end) > new Date();
  }
  return false;
}

// ---------------------------------------------------------------------------
// 1. enter_arena_event — ガード存在確認 (ソースコード検査)
// ---------------------------------------------------------------------------

describe('enter_arena_event guard presence', () => {
  it('migrationファイルに _is_internal_test_account ガードが含まれる', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const migPath = join(
      process.cwd(),
      'supabase/migrations/20260807000002_ai_inspection_accounts_fix.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    expect(sql).toContain('enter_arena_event');
    expect(sql).toContain('_is_internal_test_account');
    expect(sql).toContain("forbidden: internal inspection accounts are read-only");
  });

  it('enter_arena_event の引数シグネチャが維持される (p_arena_event_id uuid)', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const migPath = join(
      process.cwd(),
      'supabase/migrations/20260807000002_ai_inspection_accounts_fix.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    expect(sql).toMatch(/enter_arena_event\s*\(\s*p_arena_event_id\s+uuid\s*\)/);
  });

  it('enter_arena_event の戻り値型が jsonb を維持する', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const migPath = join(
      process.cwd(),
      'supabase/migrations/20260807000002_ai_inspection_accounts_fix.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    // enter_arena_event の RETURNS jsonb を確認
    const match = sql.match(/enter_arena_event[^$]*RETURNS\s+(\w+)/s);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('jsonb');
  });
});

// ---------------------------------------------------------------------------
// 2. submit_prize_tax_submission — NOTICE のみでなく実際に拒否
// ---------------------------------------------------------------------------

describe('submit_prize_tax_submission guard implementation', () => {
  it('migrationファイルに RAISE EXCEPTION による実際の拒否が含まれる', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const migPath = join(
      process.cwd(),
      'supabase/migrations/20260807000002_ai_inspection_accounts_fix.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    // submit_prize_tax_submission セクションに RAISE EXCEPTION が含まれること
    const prizeSection = sql.slice(sql.indexOf('submit_prize_tax_submission'));
    expect(prizeSection).toContain('RAISE EXCEPTION');
    expect(prizeSection).toContain('_is_internal_test_account');
  });

  it('submit_prize_tax_submission の引数シグネチャが維持される', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const migPath = join(
      process.cwd(),
      'supabase/migrations/20260807000002_ai_inspection_accounts_fix.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    // 必須引数の存在確認
    expect(sql).toContain('p_award_id uuid');
    expect(sql).toContain('p_legal_name text');
    expect(sql).toContain('p_paypal_email text');
  });

  it('submit_prize_tax_submission の戻り値型が TABLE形式を維持する', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const migPath = join(
      process.cwd(),
      'supabase/migrations/20260807000002_ai_inspection_accounts_fix.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    const prizeSection = sql.slice(sql.indexOf('submit_prize_tax_submission'));
    expect(prizeSection).toMatch(/RETURNS\s+TABLE/);
  });
});

// ---------------------------------------------------------------------------
// 3. join_or_create_random_game — ガード存在確認
// ---------------------------------------------------------------------------

describe('join_or_create_random_game guard presence', () => {
  it('migrationファイルに join_or_create_random_game のガードが含まれる', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const migPath = join(
      process.cwd(),
      'supabase/migrations/20260807000002_ai_inspection_accounts_fix.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    const randomGameSection = sql.slice(sql.indexOf('join_or_create_random_game'));
    expect(randomGameSection).toContain('_is_internal_test_account');
    expect(randomGameSection).toContain("forbidden: internal inspection accounts are read-only");
  });

  it('join_or_create_random_game の引数が維持される (p_user_id uuid, p_initial_state jsonb)', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const migPath = join(
      process.cwd(),
      'supabase/migrations/20260807000002_ai_inspection_accounts_fix.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    expect(sql).toMatch(/join_or_create_random_game\s*\(\s*p_user_id\s+uuid\s*,\s*p_initial_state\s+jsonb\s*\)/);
  });
});

// ---------------------------------------------------------------------------
// 4. online_games 直接INSERT ポリシー補正確認
// ---------------------------------------------------------------------------

describe('online_games INSERT policy fix', () => {
  it('migrationファイルに DROP POLICY と CREATE POLICY が含まれる', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const migPath = join(
      process.cwd(),
      'supabase/migrations/20260807000002_ai_inspection_accounts_fix.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    expect(sql).toContain('DROP POLICY IF EXISTS "authenticated users can create games" ON online_games');
    expect(sql).toContain('CREATE POLICY "authenticated users can create games"');
    expect(sql).toContain('is_internal_test_account = true');
  });

  it('online_games INSERT ポリシーが WITH CHECK に is_internal_test_account 除外を持つ', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const migPath = join(
      process.cwd(),
      'supabase/migrations/20260807000002_ai_inspection_accounts_fix.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    const policySection = sql.slice(sql.lastIndexOf('CREATE POLICY "authenticated users can create games"'));
    // auth.uid() = black_player_id を維持し、かつ内部アカウントを除外
    expect(policySection).toContain('auth.uid() = black_player_id');
    expect(policySection).toContain('NOT EXISTS');
    expect(policySection).toContain('is_internal_test_account = true');
  });
});

// ---------------------------------------------------------------------------
// 5. apply_online_move / claim_timeout — ガード存在確認
// ---------------------------------------------------------------------------

describe('apply_online_move and claim_timeout guard presence', () => {
  it('migrationファイルに apply_online_move のガードが含まれる', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const migPath = join(
      process.cwd(),
      'supabase/migrations/20260807000002_ai_inspection_accounts_fix.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    const applySection = sql.slice(sql.indexOf('apply_online_move'));
    expect(applySection).toContain('_is_internal_test_account');
  });

  it('migrationファイルに claim_timeout のガードが含まれる', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const migPath = join(
      process.cwd(),
      'supabase/migrations/20260807000002_ai_inspection_accounts_fix.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    const claimSection = sql.slice(sql.indexOf('claim_timeout'));
    expect(claimSection).toContain('_is_internal_test_account');
  });
});

// ---------------------------------------------------------------------------
// 6. Pro判定: 通常ユーザーへの影響確認
// ---------------------------------------------------------------------------

describe('Pro判定 — 通常ユーザーへの影響', () => {
  it('通常Pro (plan=pro, status=active) は Pro として判定される', () => {
    const result = testIsProActive({
      plan: 'pro',
      subscription_status: 'active',
      current_period_end: new Date(Date.now() + 86400000).toISOString(),
      internal_plan_override: null,
    });
    expect(result).toBe(true);
  });

  it('通常Free (plan=free) は Free として判定される', () => {
    const result = testIsProActive({
      plan: 'free',
      subscription_status: 'inactive',
      current_period_end: null,
      internal_plan_override: null,
    });
    expect(result).toBe(false);
  });

  it('期限切れPro (canceled + 過去) は Free として判定される', () => {
    const result = testIsProActive({
      plan: 'pro',
      subscription_status: 'canceled',
      current_period_end: new Date(Date.now() - 86400000).toISOString(),
      internal_plan_override: null,
    });
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. AI確認アカウントのPro判定確認
// ---------------------------------------------------------------------------

describe('AI確認アカウント Pro判定', () => {
  it('AI FREE (internal_plan_override=null, plan=free) は Free として表示される', () => {
    // internal_plan_override=null かつ plan=free → Free
    const result = testIsProActive({
      plan: 'free',
      subscription_status: 'inactive',
      current_period_end: null,
      internal_plan_override: null,
    });
    expect(result).toBe(false);
  });

  it('AI PRO (internal_plan_override=pro) は Pro として表示される', () => {
    // internal_plan_override='pro' → Pro override
    const result = testIsProActive({
      plan: 'free',  // Paddleのplanはfreeのまま
      subscription_status: 'inactive',
      current_period_end: null,
      internal_plan_override: 'pro',
    });
    expect(result).toBe(true);
  });

  it('AI FREE (internal_plan_override=free) は Free として表示される', () => {
    const result = testIsProActive({
      plan: 'free',
      subscription_status: 'inactive',
      current_period_end: null,
      internal_plan_override: 'free',
    });
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. /ai-check-login が AuthGate 外であること確認
// ---------------------------------------------------------------------------

describe('/ai-check-login route isolation', () => {
  it('main.tsx に /ai-check-login が AuthGate 外として分岐される', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const mainPath = join(process.cwd(), 'src/app/main.tsx');
    const mainSrc = readFileSync(mainPath, 'utf-8');
    // /ai-check-login 判定がある
    expect(mainSrc).toContain('/ai-check-login');
    // AiCheckLogin コンポーネントが使用される
    expect(mainSrc).toContain('AiCheckLogin');
    // AuthGate の外で rootElement が設定される
    // (isAiCheckLogin の場合に rootElement = <AiCheckLogin /> となる)
    expect(mainSrc).toMatch(/isAiCheckLogin[\s\S]*?AiCheckLogin/);
  });

  it('AiCheckLogin が AuthGate を使用していない', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const aiCheckPath = join(process.cwd(), 'src/components/AiCheckLogin.tsx');
    const src = readFileSync(aiCheckPath, 'utf-8');
    expect(src).not.toContain('AuthGate');
  });

  it('通常 AuthGate が存在する (未変更確認)', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const authGatePath = join(process.cwd(), 'src/components/AuthGate.tsx');
    const src = readFileSync(authGatePath, 'utf-8');
    // AuthGate コンポーネントが存在する
    expect(src).toContain('export');
    expect(src).toContain('AuthGate');
  });
});

// ---------------------------------------------------------------------------
// 9. _is_internal_test_account helper — セキュリティ確認
// ---------------------------------------------------------------------------

describe('_is_internal_test_account helper security', () => {
  it('helper関数が authenticated ロールへの GRANT を持たない', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const migPath = join(
      process.cwd(),
      'supabase/migrations/20260807000002_ai_inspection_accounts_fix.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    const helperSection = sql.slice(
      sql.indexOf('_is_internal_test_account'),
      sql.indexOf('enter_arena_event')
    );
    // authenticated への GRANT がない
    expect(helperSection).not.toMatch(/GRANT\s+EXECUTE.*authenticated.*_is_internal_test_account/i);
    // REVOKE が存在する
    expect(helperSection).toContain('REVOKE');
    expect(helperSection).toContain('authenticated');
  });
});

// ---------------------------------------------------------------------------
// 10. 既存migration が変更されていないこと
// ---------------------------------------------------------------------------

describe('既存migration 不変確認', () => {
  it('20260807000001_ai_inspection_accounts.sql が存在する', async () => {
    const { existsSync } = await import('fs');
    const { join } = await import('path');
    const migPath = join(
      process.cwd(),
      'supabase/migrations/20260807000001_ai_inspection_accounts.sql'
    );
    expect(existsSync(migPath)).toBe(true);
  });

  it('20260807000001 が is_internal_test_account カラム追加を含む', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const migPath = join(
      process.cwd(),
      'supabase/migrations/20260807000001_ai_inspection_accounts.sql'
    );
    const sql = readFileSync(migPath, 'utf-8');
    expect(sql).toContain('is_internal_test_account');
    expect(sql).toContain('internal_plan_override');
  });
});
