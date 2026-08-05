/**
 * admin_message_i18n.test.ts
 * Tests for resolveAdminMessageContent()
 */
import { describe, it, expect } from 'vitest';
import { resolveAdminMessageContent } from '../lib/adminMessageI18n';
import type { AdminMessageRow } from '../lib/adminMessageI18n';
import { resolveUiTranslations } from '../i18n/index';
import type { LocaleCode } from '../lib/locales';

const ALL_LOCALES: LocaleCode[] = ['en', 'ja', 'zh-Hans', 'zh-Hant', 'ko', 'es', 'pt-BR', 'de', 'fr', 'it'];

function t(locale: LocaleCode) {
  return resolveUiTranslations(locale);
}

describe('resolveAdminMessageContent — system key: arena_master_reward_eligible', () => {
  const baseMsg: AdminMessageRow = {
    title: 'Legacy Title',
    body: 'Legacy Body',
    message_key: 'arena_master_reward_eligible',
    message_params: { arenaLabel: 'ELEPHANT Arena' },
    translations: null,
  };

  it('returns non-empty title and body for all 10 locales', () => {
    for (const locale of ALL_LOCALES) {
      const result = resolveAdminMessageContent(baseMsg, locale, t(locale));
      expect(result.title, `title for ${locale}`).toBeTruthy();
      expect(result.body, `body for ${locale}`).toBeTruthy();
      expect(typeof result.title, `title type for ${locale}`).toBe('string');
      expect(typeof result.body, `body type for ${locale}`).toBe('string');
    }
  });

  it('preserves arenaLabel in all 10 locales', () => {
    for (const locale of ALL_LOCALES) {
      const result = resolveAdminMessageContent(baseMsg, locale, t(locale));
      expect(result.title, `title for ${locale} should contain arenaLabel`).toContain('ELEPHANT Arena');
      expect(result.body, `body for ${locale} should contain arenaLabel`).toContain('ELEPHANT Arena');
    }
  });

  it('handles empty arenaLabel gracefully for all 10 locales', () => {
    const msgNoLabel: AdminMessageRow = {
      ...baseMsg,
      message_params: { arenaLabel: '' },
    };
    for (const locale of ALL_LOCALES) {
      const result = resolveAdminMessageContent(msgNoLabel, locale, t(locale));
      expect(result.title, `title for ${locale} (no label)`).toBeTruthy();
      expect(result.body, `body for ${locale} (no label)`).toBeTruthy();
    }
  });

  it('handles null message_params gracefully', () => {
    const msgNullParams: AdminMessageRow = {
      ...baseMsg,
      message_params: null,
    };
    for (const locale of ALL_LOCALES) {
      const result = resolveAdminMessageContent(msgNullParams, locale, t(locale));
      expect(result.title).toBeTruthy();
      expect(result.body).toBeTruthy();
    }
  });
});

describe('resolveAdminMessageContent — resolution priority', () => {
  it('uses exact locale translation when available', () => {
    const msg: AdminMessageRow = {
      title: 'Legacy',
      body: 'Legacy body',
      message_key: null,
      message_params: null,
      translations: {
        en: { title: 'EN Title', body: 'EN Body' },
        ja: { title: 'JA タイトル', body: 'JA 本文' },
      },
    };
    const result = resolveAdminMessageContent(msg, 'ja', t('ja'));
    expect(result.title).toBe('JA タイトル');
    expect(result.body).toBe('JA 本文');
  });

  it('falls back to en when exact locale is missing', () => {
    const msg: AdminMessageRow = {
      title: 'Legacy',
      body: 'Legacy body',
      message_key: null,
      message_params: null,
      translations: {
        en: { title: 'EN Title', body: 'EN Body' },
      },
    };
    const result = resolveAdminMessageContent(msg, 'ko', t('ko'));
    expect(result.title).toBe('EN Title');
    expect(result.body).toBe('EN Body');
  });

  it('falls back to legacy title/body when translations is null', () => {
    const msg: AdminMessageRow = {
      title: 'Legacy Title',
      body: 'Legacy Body',
      message_key: null,
      message_params: null,
      translations: null,
    };
    const result = resolveAdminMessageContent(msg, 'en', t('en'));
    expect(result.title).toBe('Legacy Title');
    expect(result.body).toBe('Legacy Body');
  });

  it('does not crash on unknown message_key — falls through to translations', () => {
    const msg: AdminMessageRow = {
      title: 'Legacy',
      body: 'Legacy body',
      message_key: 'future_unknown_key',
      message_params: {},
      translations: {
        en: { title: 'EN Title', body: 'EN Body' },
      },
    };
    expect(() => resolveAdminMessageContent(msg, 'en', t('en'))).not.toThrow();
    const result = resolveAdminMessageContent(msg, 'en', t('en'));
    expect(result.title).toBe('EN Title');
  });

  it('system key takes priority over translations', () => {
    const msg: AdminMessageRow = {
      title: 'Legacy',
      body: 'Legacy body',
      message_key: 'arena_master_reward_eligible',
      message_params: { arenaLabel: 'JAGUAR Arena' },
      translations: {
        en: { title: 'Old EN Title', body: 'Old EN Body' },
      },
    };
    const result = resolveAdminMessageContent(msg, 'en', t('en'));
    // Should use the system key function, not the translations entry
    expect(result.title).toContain('JAGUAR Arena');
    expect(result.title).not.toBe('Old EN Title');
  });
});

describe('resolveAdminMessageContent — return type safety', () => {
  it('title and body are always strings', () => {
    const msg: AdminMessageRow = {
      title: 'T',
      body: 'B',
      message_key: 'arena_master_reward_eligible',
      message_params: { arenaLabel: 'ELEPHANT Arena' },
      translations: null,
    };
    for (const locale of ALL_LOCALES) {
      const result = resolveAdminMessageContent(msg, locale, t(locale));
      expect(typeof result.title).toBe('string');
      expect(typeof result.body).toBe('string');
    }
  });
});
