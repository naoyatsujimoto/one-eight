import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveUiTranslations } from '../i18n';
import { KNOWN_MESSAGE_KEYS, resolveAdminMessageContent } from '../lib/adminMessageI18n';
import type { LocaleCode } from '../lib/locales';

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260901000001_public_launch_reset_and_welcome.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8');
const locales: LocaleCode[] = [
  'en', 'ja', 'zh-Hans', 'zh-Hant', 'ko', 'es', 'pt-BR', 'de', 'fr', 'it',
];

describe('public launch Arena and prize reset', () => {
  it('clears public Arena history, ranking, and Master history', () => {
    expect(sql).toMatch(/DELETE FROM public\.arena_match_history/i);
    expect(sql).toMatch(/DELETE FROM public\.arena_master_history/i);
    expect(sql).toMatch(/DELETE FROM public\.arena_points\s*;/i);
  });

  it('resets current and interim Master caches', () => {
    for (const column of [
      'current_master_user_id',
      'current_master_since_event_id',
      'current_interim_master_user_id',
      'current_interim_since_event_id',
    ]) {
      expect(sql).toContain(`${column} = NULL`);
    }
  });

  it('preserves Arena operations, future schedules, normal history, and users', () => {
    for (const table of [
      'arena_matches', 'arena_events', 'arena_entries', 'official_matches',
      'online_games', 'match_logs', 'profiles',
    ]) {
      expect(sql).not.toMatch(new RegExp(`DELETE\\s+FROM\\s+public\\.${table}\\b`, 'i'));
    }
  });

  it('clears the complete pre-launch prize and payment chain', () => {
    for (const table of [
      'prize_archive_logs', 'prize_payouts', 'prize_temp_tax_submissions', 'prize_awards',
    ]) {
      expect(sql).toMatch(new RegExp(`DELETE\\s+FROM\\s+public\\.${table}\\b`, 'i'));
    }
    expect(sql).toMatch(/DISABLE TRIGGER prize_archive_logs_no_update_or_delete/i);
    expect(sql).toMatch(/ENABLE TRIGGER prize_archive_logs_no_update_or_delete/i);
  });
});
describe('welcome guide delivery', () => {
  it('replaces every old message before seeding confirmed users', () => {
    const deletion = sql.indexOf('DELETE FROM public.admin_messages;');
    const seed = sql.indexOf('SELECT public.ensure_welcome_guide_message(au.id)');
    expect(deletion).toBeGreaterThan(-1);
    expect(seed).toBeGreaterThan(deletion);
    expect(sql).toMatch(/au\.email_confirmed_at IS NOT NULL/i);
  });

  it('uses an idempotent per-user source key', () => {
    expect(sql).toContain("'welcome_guide:' || p_user_id::text");
    expect(sql).toMatch(/ON CONFLICT \(source_id, target\)[\s\S]*DO NOTHING/i);
  });

  it('delivers on confirmation and also covers pre-confirmed account creation', () => {
    expect(sql).toMatch(/AFTER UPDATE OF email_confirmed_at ON auth\.users/i);
    expect(sql).toMatch(/OLD\.email_confirmed_at IS NULL AND NEW\.email_confirmed_at IS NOT NULL/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.handle_new_user\(\)[\s\S]*NEW\.email_confirmed_at IS NOT NULL/i);
  });

  it('does not expose the welcome helper to client roles', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.ensure_welcome_guide_message\(uuid\) FROM PUBLIC, anon, authenticated/i);
  });

  it('recognizes welcome_guide as a system message', () => {
    expect(KNOWN_MESSAGE_KEYS).toContain('welcome_guide');
    expect(sql).toContain("ARRAY['arena_master_reward_eligible', 'welcome_guide']");
  });

  it('resolves a useful welcome message in all 10 locales', () => {
    for (const locale of locales) {
      const t = resolveUiTranslations(locale);
      const resolved = resolveAdminMessageContent({
        title: 'legacy',
        body: 'legacy',
        message_key: 'welcome_guide',
        message_params: {},
        translations: null,
      }, locale, t);

      expect(resolved.title.trim(), `${locale} title`).not.toBe('');
      expect(resolved.body, `${locale} body`).toBe(t.welcomeGuideBody);
      expect(resolved.body.split('\n\n').length, `${locale} guidance sections`).toBeGreaterThanOrEqual(4);
      expect(resolved.body, `${locale} should mention STATS`).toContain('STATS');
    }
  });
});
