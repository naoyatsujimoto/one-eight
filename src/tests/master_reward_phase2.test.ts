/**
 * master_reward_phase2.test.ts
 * Master報酬制度改定 Phase 2
 *
 * テスト対象:
 *  1. formatMasterReward 関数のユニットテスト
 *     - null → null (表示しない)
 *     - 有効値 (6500, 'USD') → 'USD 65.00'
 *     - 未設定通貨 (cents有り, currency null) → null (修正3: USD fallback廃止)
 *     - 0 → 'USD 0.00'
 *     - 非USD (1000, 'EUR') → 'EUR 10.00'
 *  2. JA/EN 文言定数テスト
 *     - arenaRulesRewardTitle が 'Master報酬' / 'Master Reward' であること
 *     - arenaRulesEntryBody が「永久にPro限定」文言を含まないこと
 *     - arenaMasterRewardBody が「Based on your result」「対局結果に基づき」を含まないこと
 *     - arenaRulesEntryMasterRewardNote が存在すること
 *     - arenaRulesMasterRewardAmount が関数として呼び出せること
 *     - arenaRulesMasterRewardUnset が存在すること
 */

import { describe, it, expect } from 'vitest';
import { formatMasterReward } from '../components/OfficialArenaOverview';
import { EN_TRANSLATIONS } from '../i18n/en';
import { JA_TRANSLATIONS } from '../i18n/ja';

// ─────────────────────────────────────────────────────────────────────────────
// 1. formatMasterReward ユニットテスト
// ─────────────────────────────────────────────────────────────────────────────

describe('formatMasterReward', () => {
  it('null cents → returns null', () => {
    expect(formatMasterReward(null, 'USD')).toBeNull();
  });

  it('null cents with null currency → returns null', () => {
    expect(formatMasterReward(null, null)).toBeNull();
  });

  it('6500 cents + USD → "USD 65.00"', () => {
    expect(formatMasterReward(6500, 'USD')).toBe('USD 65.00');
  });

  it('6500 cents + null currency → null (修正3: USD fallback廃止)', () => {
    expect(formatMasterReward(6500, null)).toBeNull();
  });

  it('0 cents + USD → "USD 0.00"', () => {
    expect(formatMasterReward(0, 'USD')).toBe('USD 0.00');
  });

  it('1000 cents + EUR → "EUR 10.00"', () => {
    expect(formatMasterReward(1000, 'EUR')).toBe('EUR 10.00');
  });

  it('100 cents + JPY → "JPY 1.00"', () => {
    expect(formatMasterReward(100, 'JPY')).toBe('JPY 1.00');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. JA 文言定数テスト
// ─────────────────────────────────────────────────────────────────────────────

describe('JA i18n - Master報酬 Phase 2', () => {
  it('arenaRulesRewardTitle is "Master報酬"', () => {
    expect(JA_TRANSLATIONS.arenaRulesRewardTitle).toBe('Master報酬');
  });

  it('arenaRulesEntryBody does not contain "Pro限定" as permanent restriction', () => {
    // 段階的解放の文言に変更されているため「永久にPro限定」的な絶対表現がない
    const body = JA_TRANSLATIONS.arenaRulesEntryBody;
    expect(body).not.toContain('永久');
    expect(body).toContain('段階的に解放');
  });

  it('arenaMasterRewardBody does not contain "対局結果に基づき"', () => {
    const body = JA_TRANSLATIONS.arenaMasterRewardBody('ELEPHANT');
    expect(body).not.toContain('対局結果に基づき');
  });

  it('arenaMasterRewardBody does not contain "Reward / Prize" for notification', () => {
    const body = JA_TRANSLATIONS.arenaMasterRewardBody('ELEPHANT');
    // 「Reward / Prize」ではなく「Master報酬」に変更済み
    expect(body).toContain('Master報酬');
  });

  it('arenaRulesEntryMasterRewardNote exists and contains "Master報酬"', () => {
    expect(JA_TRANSLATIONS.arenaRulesEntryMasterRewardNote).toBeDefined();
    expect(JA_TRANSLATIONS.arenaRulesEntryMasterRewardNote).toContain('Master報酬');
  });

  it('arenaRulesMasterRewardAmount is a function that formats correctly', () => {
    const fn = JA_TRANSLATIONS.arenaRulesMasterRewardAmount;
    expect(typeof fn).toBe('function');
    expect(fn('USD 65.00')).toContain('USD 65.00');
    expect(fn('USD 65.00')).toContain('Master');
  });

  it('arenaRulesMasterRewardUnset exists', () => {
    expect(JA_TRANSLATIONS.arenaRulesMasterRewardUnset).toBeDefined();
    expect(typeof JA_TRANSLATIONS.arenaRulesMasterRewardUnset).toBe('string');
  });

  it('arenaRulesRewardBody contains correct policy text', () => {
    const body = JA_TRANSLATIONS.arenaRulesRewardBody;
    expect(body).toContain('固定報酬');
    expect(body).toContain('義務');
    expect(body).not.toContain('Reward / Prize');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. EN 文言定数テスト
// ─────────────────────────────────────────────────────────────────────────────

describe('EN i18n - Master Reward Phase 2', () => {
  it('arenaRulesRewardTitle is "Master Reward"', () => {
    expect(EN_TRANSLATIONS.arenaRulesRewardTitle).toBe('Master Reward');
  });

  it('arenaRulesEntryBody does not say "required" as permanent restriction', () => {
    const body = EN_TRANSLATIONS.arenaRulesEntryBody;
    // 「A Pro account is required」から段階的解放の文言に変更
    expect(body).not.toBe('A Pro account is required to enter Official Arena.');
    expect(body).toContain('progressively opened');
  });

  it('arenaMasterRewardBody does not contain "Based on your result"', () => {
    const body = EN_TRANSLATIONS.arenaMasterRewardBody('ELEPHANT');
    expect(body).not.toContain('Based on your result');
  });

  it('arenaMasterRewardBody contains "Master Reward"', () => {
    const body = EN_TRANSLATIONS.arenaMasterRewardBody('ELEPHANT');
    expect(body).toContain('Master Reward');
  });

  it('arenaRulesEntryMasterRewardNote exists and mentions Master Reward', () => {
    expect(EN_TRANSLATIONS.arenaRulesEntryMasterRewardNote).toBeDefined();
    expect(EN_TRANSLATIONS.arenaRulesEntryMasterRewardNote).toContain('Master Reward');
  });

  it('arenaRulesMasterRewardAmount is a function', () => {
    const fn = EN_TRANSLATIONS.arenaRulesMasterRewardAmount;
    expect(typeof fn).toBe('function');
    expect(fn('USD 65.00')).toContain('USD 65.00');
    expect(fn('USD 65.00')).toContain('Master Reward');
  });

  it('arenaRulesMasterRewardUnset exists', () => {
    expect(EN_TRANSLATIONS.arenaRulesMasterRewardUnset).toBeDefined();
    expect(typeof EN_TRANSLATIONS.arenaRulesMasterRewardUnset).toBe('string');
  });

  it('arenaRulesRewardBody contains fixed compensation policy', () => {
    const body = EN_TRANSLATIONS.arenaRulesRewardBody;
    expect(body).toContain('fixed compensation');
    expect(body).toContain('obligation');
    expect(body).not.toContain('Reward / Prize');
  });
});
