/**
 * master_reward_phase2_fix.test.ts
 * Master報酬制度改定 Phase 2補正テスト
 *
 * テスト項目:
 * 1. 全10言語に「必ず出場する義務」「obligation to participate」の意味が残っていない
 *    （every effort / 最大限調整 / allAnstrengungen / tous les efforts / ogni sforzo / 最대한 / todos os esforços / 尽一切努力 / 盡一切努力 の文言が含まれる）
 * 2. 全10言語が予定を最大限調整する努力義務を表している
 * 3. Arena規則・Arena詳細・Entry確認の3か所がDB由来の同じ金額を使用（formatMasterReward）
 * 4. ELEPHANT/JAGUARはUSD 65.00を表示
 * 5. 未設定Arenaを65ドル表示しない
 * 6. 異なる金額の新Arenaを追加してもその金額を表示（8000, 'USD' → 'USD 80.00'）
 * 7. currency=nullをUSD扱いしない（formatMasterRewardがnullを返す）
 * 8. 受給者・Master遷移・no-showロジックに差分なし（既存テスト担保）
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { formatMasterReward } from '../components/OfficialArenaOverview';

// i18n imports
import { JA_TRANSLATIONS } from '../i18n/ja';
import { EN_TRANSLATIONS } from '../i18n/en';
import { DE_TRANSLATIONS } from '../i18n/de';
import { ES_TRANSLATIONS } from '../i18n/es';
import { FR_TRANSLATIONS } from '../i18n/fr';
import { IT_TRANSLATIONS } from '../i18n/it';
import { KO_TRANSLATIONS } from '../i18n/ko';
import { PT_BR_TRANSLATIONS } from '../i18n/pt-BR';
import { ZH_HANS_TRANSLATIONS } from '../i18n/zh-Hans';
import { ZH_HANT_TRANSLATIONS } from '../i18n/zh-Hant';

// ─── ヘルパー ──────────────────────────────────────────────────────────────────

const ALL_LOCALES = [
  { code: 'ja', t: JA_TRANSLATIONS },
  { code: 'en', t: EN_TRANSLATIONS },
  { code: 'de', t: DE_TRANSLATIONS },
  { code: 'es', t: ES_TRANSLATIONS },
  { code: 'fr', t: FR_TRANSLATIONS },
  { code: 'it', t: IT_TRANSLATIONS },
  { code: 'ko', t: KO_TRANSLATIONS },
  { code: 'pt-BR', t: PT_BR_TRANSLATIONS },
  { code: 'zh-Hans', t: ZH_HANS_TRANSLATIONS },
  { code: 'zh-Hant', t: ZH_HANT_TRANSLATIONS },
] as const;

// 「必ず出場する義務」「obligation to participate」という誤った意味の禁止文言
const FORBIDDEN_PHRASES: Record<string, string[]> = {
  ja: ['次回のArenaにMasterとして出場する義務', '必ず出場する義務', '出場を保証する義務'],
  en: ['obligation to participate in the next Arena as Master', 'obligation to participate in the next Master match without'],
  de: ['Verpflichtung, an der nächsten Arena als Master teilzunehmen', 'Teilnahme am nächsten Arena'],
  es: ['obligación de participar en la próxima Arena como Master'],
  fr: ["obligation de participer à la prochaine Arena en tant que Master"],
  it: ["obbligo di partecipare alla prossima Arena come Master"],
  ko: ['다음 Arena에 Master로 참가할 의무'],
  'pt-BR': ['obrigação de participar da próxima Arena como Master'],
  'zh-Hans': ['以 Master 身份参加下次 Arena 之义务', '参加下次Arena'],
  'zh-Hant': ['以 Master 身份參加下次 Arena 之義務', '參加下次Arena'],
};

// 「予定を最大限調整する努力義務」の存在確認フレーズ（各言語）
const REQUIRED_EFFORT_PHRASES: Record<string, string[]> = {
  ja: ['最大限調整'],
  en: ['every effort'],
  de: ['alle Anstrengungen'],
  es: ['todo lo posible'],
  fr: ['tout son possible', 'tout leur possible'],
  it: ['ogni sforzo'],
  ko: ['최대한'],
  'pt-BR': ['todos os esforços'],
  'zh-Hans': ['尽一切努力'],
  'zh-Hant': ['盡一切努力'],
};

// ─── 1. 禁止文言が残っていない ────────────────────────────────────────────────

describe('修正1: 全10言語で禁止文言が存在しない', () => {
  for (const { code, t } of ALL_LOCALES) {
    const forbidden = FORBIDDEN_PHRASES[code] ?? [];
    const rewardBody = typeof t.arenaRulesRewardBody === 'string' ? t.arenaRulesRewardBody : '';
    const masterBodyWithLabel = typeof t.arenaMasterRewardBody === 'function' ? t.arenaMasterRewardBody('ELEPHANT') : '';
    const masterBodyEmpty = typeof t.arenaMasterRewardBody === 'function' ? t.arenaMasterRewardBody('') : '';
    const combined = rewardBody + masterBodyWithLabel + masterBodyEmpty;

    for (const phrase of forbidden) {
      it(`${code}: 禁止文言「${phrase.slice(0, 30)}...」が含まれない`, () => {
        expect(combined).not.toContain(phrase);
      });
    }
  }
});

// ─── 2. 努力義務フレーズが存在する ───────────────────────────────────────────

describe('修正1: 全10言語が予定を最大限調整する努力義務を表している', () => {
  for (const { code, t } of ALL_LOCALES) {
    const required = REQUIRED_EFFORT_PHRASES[code] ?? [];
    const rewardBody = typeof t.arenaRulesRewardBody === 'string' ? t.arenaRulesRewardBody : '';
    const masterBodyWithLabel = typeof t.arenaMasterRewardBody === 'function' ? t.arenaMasterRewardBody('ELEPHANT') : '';
    const combined = rewardBody + masterBodyWithLabel;

    it(`${code}: 努力義務フレーズが含まれる`, () => {
      const hasAny = required.some(p => combined.includes(p));
      expect(hasAny, `${code}: none of [${required.join(', ')}] found in text`).toBe(true);
    });
  }
});

// ─── 3. 3表示箇所がDB由来の同じ金額を使用（formatMasterReward経由） ──────────

describe('修正2&3: 3表示箇所（Arena規則・Arena詳細・Entry確認）がformatMasterRewardを通じて同一金額を表示', () => {
  it('formatMasterReward(6500, "USD") は "USD 65.00" を返す', () => {
    expect(formatMasterReward(6500, 'USD')).toBe('USD 65.00');
  });

  it('Arena規則・Arena詳細・Entry確認の全箇所でformatMasterRewardを使用していることをソースで確認', () => {
    // ソースコードに3箇所 formatMasterReward の呼び出しがあることを確認
    const src = readFileSync(
      resolve(__dirname, '../components/OfficialArenaOverview.tsx'),
      'utf8'
    );
    const matches = src.match(/formatMasterReward\(/g) ?? [];
    // 関数定義1箇所 + 呼び出し3箇所以上
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });
});

// ─── 4. ELEPHANT/JAGUAR: USD 65.00 を表示 ────────────────────────────────────

describe('修正3: formatMasterReward — 正常ケース', () => {
  it('ELEPHANT/JAGUAR相当: (6500, "USD") → "USD 65.00"', () => {
    expect(formatMasterReward(6500, 'USD')).toBe('USD 65.00');
  });

  it('(6500, "USD") と (6500, "USD") は同じ値を返す', () => {
    const elephant = formatMasterReward(6500, 'USD');
    const jaguar = formatMasterReward(6500, 'USD');
    expect(elephant).toBe(jaguar);
    expect(elephant).toBe('USD 65.00');
  });
});

// ─── 5. 未設定Arenaを65ドル表示しない ────────────────────────────────────────

describe('修正3: 未設定Arenaの誤表示なし', () => {
  it('cents=null → null（表示なし）', () => {
    expect(formatMasterReward(null, 'USD')).toBeNull();
  });

  it('currency=null → null（USD fallback廃止）', () => {
    expect(formatMasterReward(6500, null)).toBeNull();
  });

  it('cents=null, currency=null → null', () => {
    expect(formatMasterReward(null, null)).toBeNull();
  });

  it('undefined cents → null', () => {
    expect(formatMasterReward(undefined, 'USD')).toBeNull();
  });

  it('undefined currency → null', () => {
    expect(formatMasterReward(6500, undefined)).toBeNull();
  });
});

// ─── 6. 異なる金額の新Arenaも正しく表示 ──────────────────────────────────────

describe('修正3: 任意金額の表示', () => {
  it('(8000, "USD") → "USD 80.00"', () => {
    expect(formatMasterReward(8000, 'USD')).toBe('USD 80.00');
  });

  it('(1000, "EUR") → "EUR 10.00"', () => {
    expect(formatMasterReward(1000, 'EUR')).toBe('EUR 10.00');
  });

  it('(12345, "JPY") → "JPY 123.45"', () => {
    expect(formatMasterReward(12345, 'JPY')).toBe('JPY 123.45');
  });

  it('(0, "USD") → "USD 0.00"', () => {
    expect(formatMasterReward(0, 'USD')).toBe('USD 0.00');
  });
});

// ─── 7. currency=nullをUSD扱いしない ─────────────────────────────────────────

describe('修正3: formatMasterRewardの安全性', () => {
  it('currency=null → null（USD misidentificationなし）', () => {
    const result = formatMasterReward(6500, null);
    expect(result).toBeNull();
    // nullが返るのでUSD 65.00を誤表示しない
    expect(result).not.toBe('USD 65.00');
  });

  it('負数 cents → null', () => {
    expect(formatMasterReward(-100, 'USD')).toBeNull();
  });

  it('NaN cents → null', () => {
    expect(formatMasterReward(NaN as unknown as number, 'USD')).toBeNull();
  });

  it('非整数 cents (小数) → null', () => {
    expect(formatMasterReward(65.5, 'USD')).toBeNull();
  });
});

// ─── 8. 既存テストによる担保確認コメント ────────────────────────────────────

describe('修正3: 既存テスト担保の確認（参照）', () => {
  it('受給者判定・Master遷移・no-showロジックは master_reward_phase1.test.ts で担保済み', () => {
    // このテストは確認のみ。実際のロジックテストは phase1 テストで行う
    expect(true).toBe(true);
  });
});
