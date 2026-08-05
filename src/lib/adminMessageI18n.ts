/**
 * adminMessageI18n.ts
 * Resolves localized title/body for admin_messages rows.
 *
 * Resolution order:
 *   1. Recognized message_key  → use t.arenaMasterReward* functions
 *   2. translations[locale]    → use the exact-locale translation
 *   3. translations['en']      → English fallback
 *   4. Legacy title/body       → last resort
 */
import type { Translations } from '../i18n/types';
import type { LocaleCode } from './locales';

type AdminMessageTranslation = {
  title: string;
  body: string;
};

export type AdminMessageRow = {
  title: string;
  body: string;
  translations?: Partial<Record<LocaleCode, AdminMessageTranslation>> | null;
  message_key?: string | null;
  message_params?: Record<string, unknown> | null;
};

const KNOWN_MESSAGE_KEYS = ['arena_master_reward_eligible'] as const;

export function resolveAdminMessageContent(
  message: AdminMessageRow,
  locale: LocaleCode,
  t: Translations,
): { title: string; body: string } {
  // 1. Recognized system message_key
  if (message.message_key === 'arena_master_reward_eligible') {
    const arenaLabel =
      typeof message.message_params?.arenaLabel === 'string'
        ? message.message_params.arenaLabel
        : '';
    return {
      title: t.arenaMasterRewardTitle(arenaLabel),
      body: t.arenaMasterRewardBody(arenaLabel),
    };
  }

  // Unknown message_key: fall through to translations (no crash)

  // 2. translations[locale]
  const localeEntry = message.translations?.[locale];
  if (localeEntry?.title && localeEntry?.body) {
    return { title: localeEntry.title, body: localeEntry.body };
  }

  // 3. translations['en']
  const enEntry = message.translations?.['en'];
  if (enEntry?.title && enEntry?.body) {
    return { title: enEntry.title, body: enEntry.body };
  }

  // 4. Legacy title/body
  return { title: message.title, body: message.body };
}

export { KNOWN_MESSAGE_KEYS };
