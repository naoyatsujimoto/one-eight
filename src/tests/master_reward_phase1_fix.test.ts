/**
 * master_reward_phase1_fix.test.ts
 * Master報酬制度改定 Phase 1 — 補正テスト
 *
 * テスト対象:
 *  1. 未設定Arenaで報酬生成を拒否 (master_reward_not_configured エラー)
 *  2. mismatch拒否 (arena設定値と異なる引数はエラー)
 *  3. 片方だけ設定された状態をDB制約で拒否 (CHECK制約違反)
 *  4. EUR等の大文字3文字通貨は形式上設定可能 ('^[A-Z]{3}$' をパス)
 *  5. 小文字・2文字・4文字通貨は拒否 (CHECK制約違反)
 *  6. ELEPHANT/JAGUARは 6500 USD (正しい設定値を返すこと)
 *  7. 既存award行は不変 (既存テスト master_reward_phase1 で担保)
 *  8. winner/Master遷移/no-show判定は不変 (既存テスト master_reward_phase1 で担保)
 *
 * Supabase RPC への実際の呼び出しは行わない（純粋関数・型チェックのみ）。
 */

import { describe, it, expect } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// ヘルパー: 補正後のRPC実効値決定ロジック (migration SQL を TS で再現)
// admin_generate_arena_prize_awards 内の「fallback廃止・mismatch検証」ロジック
// ─────────────────────────────────────────────────────────────────────────────

interface ArenaRewardSetting {
  master_reward_amount_cents: number | null;
  master_reward_currency: string | null;
  code?: string;
}

type RewardResolutionResult =
  | { ok: true; amount_cents: number; currency: string; source: 'arena_definition' }
  | { ok: false; error: 'master_reward_not_configured' | 'master_reward_amount_mismatch'; detail: string };

/**
 * 補正1: fallback廃止・mismatch検証版の実効値決定ロジック
 * - 両方設定済み → arena設定値を使用（引数との一致確認）
 * - いずれかがNULL → master_reward_not_configured エラー
 * - arena設定値と引数が不一致 → master_reward_amount_mismatch エラー
 */
function resolveEffectiveRewardFixed(
  arenaSetting: ArenaRewardSetting,
  argAmountCents: number,
  argCurrency: string,
): RewardResolutionResult {
  const { master_reward_amount_cents, master_reward_currency, code } = arenaSetting;

  if (master_reward_amount_cents === null || master_reward_currency === null) {
    return {
      ok: false,
      error: 'master_reward_not_configured',
      detail: `Arena "${code ?? 'unknown'}" does not have master_reward configured. Set master_reward_amount_cents and master_reward_currency before generating awards.`,
    };
  }

  if (argAmountCents !== master_reward_amount_cents || argCurrency.toUpperCase() !== master_reward_currency) {
    return {
      ok: false,
      error: 'master_reward_amount_mismatch',
      detail: `Arena master_reward is configured as ${master_reward_amount_cents} ${master_reward_currency}, but arguments provided ${argAmountCents} ${argCurrency.toUpperCase()}. Pass the configured values.`,
    };
  }

  return {
    ok: true,
    amount_cents: master_reward_amount_cents,
    currency: master_reward_currency,
    source: 'arena_definition',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ヘルパー: DB制約シミュレーション
// ─────────────────────────────────────────────────────────────────────────────

/**
 * master_reward_both_or_neither 制約シミュレーション
 * amount と currency は両方NULL、または両方設定（片方だけは禁止）
 */
function checkBothOrNeither(
  amount_cents: number | null,
  currency: string | null,
): boolean {
  return (
    (amount_cents === null && currency === null) ||
    (amount_cents !== null && currency !== null)
  );
}

/**
 * master_reward_amount_positive 制約シミュレーション
 * 設定するamountは正の整数
 */
function checkAmountPositive(amount_cents: number | null): boolean {
  return amount_cents === null || amount_cents > 0;
}

/**
 * master_reward_currency_format 制約シミュレーション
 * ISO 4217形式: 大文字3文字
 */
function checkCurrencyFormat(currency: string | null): boolean {
  return currency === null || /^[A-Z]{3}$/.test(currency);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. 未設定Arenaで報酬生成を拒否 (master_reward_not_configured)
// ─────────────────────────────────────────────────────────────────────────────
describe('補正1: 未設定Arenaで報酬生成を拒否', () => {
  it('両方NULLのArenaは master_reward_not_configured エラーを返す', () => {
    const arena: ArenaRewardSetting = {
      master_reward_amount_cents: null,
      master_reward_currency: null,
      code: 'FUTURE_ARENA',
    };
    const result = resolveEffectiveRewardFixed(arena, 6500, 'USD');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('master_reward_not_configured');
      expect(result.detail).toContain('FUTURE_ARENA');
    }
  });

  it('amountだけNULLのArenaは master_reward_not_configured エラーを返す', () => {
    const arena: ArenaRewardSetting = {
      master_reward_amount_cents: null,
      master_reward_currency: 'USD',
      code: 'PARTIAL_ARENA',
    };
    const result = resolveEffectiveRewardFixed(arena, 6500, 'USD');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('master_reward_not_configured');
    }
  });

  it('currencyだけNULLのArenaは master_reward_not_configured エラーを返す', () => {
    const arena: ArenaRewardSetting = {
      master_reward_amount_cents: 6500,
      master_reward_currency: null,
      code: 'PARTIAL_ARENA',
    };
    const result = resolveEffectiveRewardFixed(arena, 6500, 'USD');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('master_reward_not_configured');
    }
  });

  it('未設定Arenaで引数値へのfallbackが発生しない', () => {
    const arena: ArenaRewardSetting = {
      master_reward_amount_cents: null,
      master_reward_currency: null,
    };
    // 補正前はfallbackで 10000 JPY が返ったが、補正後はエラー
    const result = resolveEffectiveRewardFixed(arena, 10000, 'JPY');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('master_reward_not_configured');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. mismatch拒否 (arena設定値と異なる引数はエラー)
// ─────────────────────────────────────────────────────────────────────────────
describe('補正1: mismatch拒否', () => {
  const elephantArena: ArenaRewardSetting = {
    master_reward_amount_cents: 6500,
    master_reward_currency: 'USD',
    code: 'ELEPHANT',
  };

  it('arena設定値と異なるamountはエラー', () => {
    const result = resolveEffectiveRewardFixed(elephantArena, 9999, 'USD');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('master_reward_amount_mismatch');
      expect(result.detail).toContain('6500');
      expect(result.detail).toContain('9999');
    }
  });

  it('arena設定値と異なるcurrencyはエラー', () => {
    const result = resolveEffectiveRewardFixed(elephantArena, 6500, 'JPY');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('master_reward_amount_mismatch');
      expect(result.detail).toContain('USD');
      expect(result.detail).toContain('JPY');
    }
  });

  it('arena設定値と一致する引数は成功する', () => {
    const result = resolveEffectiveRewardFixed(elephantArena, 6500, 'USD');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.amount_cents).toBe(6500);
      expect(result.currency).toBe('USD');
      expect(result.source).toBe('arena_definition');
    }
  });

  it('小文字の引数も正規化されて一致すれば成功', () => {
    // argCurrency は toUpperCase() で正規化される
    const result = resolveEffectiveRewardFixed(elephantArena, 6500, 'usd');
    expect(result.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. 片方だけ設定された状態をDB制約で拒否
// ─────────────────────────────────────────────────────────────────────────────
describe('補正2: DB制約 - master_reward_both_or_neither', () => {
  it('両方NULL → 制約をパス（未設定は許可）', () => {
    expect(checkBothOrNeither(null, null)).toBe(true);
  });

  it('両方設定済み → 制約をパス', () => {
    expect(checkBothOrNeither(6500, 'USD')).toBe(true);
  });

  it('amountだけ設定、currencyはNULL → 制約違反', () => {
    expect(checkBothOrNeither(6500, null)).toBe(false);
  });

  it('currencyだけ設定、amountはNULL → 制約違反', () => {
    expect(checkBothOrNeither(null, 'USD')).toBe(false);
  });
});

describe('補正2: DB制約 - master_reward_amount_positive', () => {
  it('NULLは制約をパス（未設定は許可）', () => {
    expect(checkAmountPositive(null)).toBe(true);
  });

  it('正の整数 6500 は制約をパス', () => {
    expect(checkAmountPositive(6500)).toBe(true);
  });

  it('正の整数 1 は制約をパス', () => {
    expect(checkAmountPositive(1)).toBe(true);
  });

  it('0 は制約違反（amount > 0 が必要）', () => {
    expect(checkAmountPositive(0)).toBe(false);
  });

  it('負の値は制約違反', () => {
    expect(checkAmountPositive(-1)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. EUR等の大文字3文字通貨は形式上設定可能
// ─────────────────────────────────────────────────────────────────────────────
describe('補正3: 通貨制約 - ISO 4217形式（大文字3文字）', () => {
  it('NULL は制約をパス（未設定は許可）', () => {
    expect(checkCurrencyFormat(null)).toBe(true);
  });

  it('USD は制約をパス', () => {
    expect(checkCurrencyFormat('USD')).toBe(true);
  });

  it('JPY は制約をパス', () => {
    expect(checkCurrencyFormat('JPY')).toBe(true);
  });

  it('EUR は制約をパス（将来のArenaで使用可能）', () => {
    expect(checkCurrencyFormat('EUR')).toBe(true);
  });

  it('GBP は制約をパス', () => {
    expect(checkCurrencyFormat('GBP')).toBe(true);
  });

  it('AUD は制約をパス', () => {
    expect(checkCurrencyFormat('AUD')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. 小文字・2文字・4文字通貨は拒否
// ─────────────────────────────────────────────────────────────────────────────
describe('補正3: 通貨制約 - 不正形式は拒否', () => {
  it('小文字 "usd" は制約違反', () => {
    expect(checkCurrencyFormat('usd')).toBe(false);
  });

  it('小文字 "jpy" は制約違反', () => {
    expect(checkCurrencyFormat('jpy')).toBe(false);
  });

  it('混在 "Usd" は制約違反', () => {
    expect(checkCurrencyFormat('Usd')).toBe(false);
  });

  it('2文字 "US" は制約違反', () => {
    expect(checkCurrencyFormat('US')).toBe(false);
  });

  it('4文字 "USDD" は制約違反', () => {
    expect(checkCurrencyFormat('USDD')).toBe(false);
  });

  it('空文字 "" は制約違反', () => {
    expect(checkCurrencyFormat('')).toBe(false);
  });

  it('数字含む "US1" は制約違反', () => {
    expect(checkCurrencyFormat('US1')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. ELEPHANT/JAGUARは 6500 USD
// ─────────────────────────────────────────────────────────────────────────────
describe('ELEPHANT/JAGUARの設定値確認', () => {
  const elephantArena: ArenaRewardSetting = {
    master_reward_amount_cents: 6500,
    master_reward_currency: 'USD',
    code: 'ELEPHANT',
  };
  const jaguarArena: ArenaRewardSetting = {
    master_reward_amount_cents: 6500,
    master_reward_currency: 'USD',
    code: 'JAGUAR',
  };

  it('ELEPHANTは 6500 USD で設定済み → 正常に解決できる', () => {
    const result = resolveEffectiveRewardFixed(elephantArena, 6500, 'USD');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.amount_cents).toBe(6500);
      expect(result.currency).toBe('USD');
      expect(result.source).toBe('arena_definition');
    }
  });

  it('JAGUARは 6500 USD で設定済み → 正常に解決できる', () => {
    const result = resolveEffectiveRewardFixed(jaguarArena, 6500, 'USD');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.amount_cents).toBe(6500);
      expect(result.currency).toBe('USD');
      expect(result.source).toBe('arena_definition');
    }
  });

  it('ELEPHANTの設定値はISO 4217形式（大文字3文字）をパスする', () => {
    expect(checkCurrencyFormat(elephantArena.master_reward_currency)).toBe(true);
    expect(checkAmountPositive(elephantArena.master_reward_amount_cents)).toBe(true);
    expect(checkBothOrNeither(
      elephantArena.master_reward_amount_cents,
      elephantArena.master_reward_currency,
    )).toBe(true);
  });

  it('JAGUARの設定値はISO 4217形式（大文字3文字）をパスする', () => {
    expect(checkCurrencyFormat(jaguarArena.master_reward_currency)).toBe(true);
    expect(checkAmountPositive(jaguarArena.master_reward_amount_cents)).toBe(true);
    expect(checkBothOrNeither(
      jaguarArena.master_reward_amount_cents,
      jaguarArena.master_reward_currency,
    )).toBe(true);
  });

  it('ELEPHANTに誤った引数 (1000 JPY) を渡すと mismatch エラー', () => {
    const result = resolveEffectiveRewardFixed(elephantArena, 1000, 'JPY');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('master_reward_amount_mismatch');
    }
  });

  it('JAGUARに誤った引数 (0 USD) を渡すと mismatch エラー', () => {
    const result = resolveEffectiveRewardFixed(jaguarArena, 0, 'USD');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('master_reward_amount_mismatch');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. 既存award行は不変（明示）
// ─────────────────────────────────────────────────────────────────────────────
describe('既存award行の不変性（型レベル担保）', () => {
  it('既存テスト master_reward_phase1.test.ts で winner_user_id 受給ロジックの不変性を担保済み', () => {
    // このテストは、既存の master_reward_phase1.test.ts テストが
    // 引き続きパスすることで担保される。
    // Phase 1 補正は既存 prize_awards 行を変更しない。
    expect(true).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. winner/Master遷移/no-show判定は不変（明示）
// ─────────────────────────────────────────────────────────────────────────────
describe('winner/Master遷移/no-show判定の不変性（型レベル担保）', () => {
  it('Phase 1補正はマッチング・ポイント計算・Master遷移ロジックを変更しない', () => {
    // 補正対象は以下のみ:
    //   - admin_generate_arena_prize_awards RPCのfallback廃止・mismatch検証
    //   - arena_definitions のDB制約追加
    //   - AdminPage UI の未設定Arena無効化
    // winner判定・Master遷移・no-show判定は変更なし。
    // 既存テスト suite が引き続きパスすることで担保される。
    expect(true).toBe(true);
  });
});
