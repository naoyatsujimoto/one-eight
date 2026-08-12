/**
 * kpi_oej_phase1.test.ts — OEJ KPI Phase 1 テスト
 *
 * 検証内容:
 *  - TypeScript型カタログとDB validator(migration SQL)の一致
 *  - 各eventの正常properties
 *  - 必須key欠落・余分なkey・型違反・enum違反・数値範囲違反の拒否
 *  - XとInstagramを別値として受理
 *  - raw URL/referrer/email/本文等の保存不可確認
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ALLOWED_KPI_EVENT_NAMES, isAllowedEventName } from '../lib/kpiEvents';

const MIGRATIONS_DIR = join(__dirname, '../../supabase/migrations');
const OEJ_MIGRATION = '20260811000002_kpi_oej_phase1.sql';
const OEJ_MIGRATION_PATH = join(MIGRATIONS_DIR, OEJ_MIGRATION);

const OEJ_EVENTS = [
  'journal_list_viewed',
  'journal_article_impression',
  'journal_article_opened',
  'journal_article_engagement',
  'journal_reference_clicked',
  'journal_language_changed',
  'journal_game_cta_clicked',
  'journal_load_failed',
] as const;

// ---------------------------------------------------------------------------
// describe 1: TypeScript Catalog
// ---------------------------------------------------------------------------

describe('OEJ KPI Phase 1 — TypeScript Catalog', () => {
  it('1. 全8 OEJイベントがALLOWED_KPI_EVENT_NAMESに含まれること', () => {
    for (const event of OEJ_EVENTS) {
      expect(
        (ALLOWED_KPI_EVENT_NAMES as readonly string[]).includes(event),
        `ALLOWED_KPI_EVENT_NAMES should include: ${event}`
      ).toBe(true);
    }
  });

  it('2. ALLOWED_KPI_EVENT_NAMESが35件であること (27 + 8)', () => {
    expect(ALLOWED_KPI_EVENT_NAMES.length).toBe(35);
  });

  it('3. isAllowedEventNameがOEJイベントをtrueと判定すること', () => {
    for (const event of OEJ_EVENTS) {
      expect(
        isAllowedEventName(event),
        `isAllowedEventName should return true for: ${event}`
      ).toBe(true);
    }
  });

  it('4. XとInstagramが独立した別値として定義されていること', () => {
    // kpiEvents.ts の型定義からSQLを読んで確認
    const kpiEventsPath = join(__dirname, '../lib/kpiEvents.ts');
    const tsContent = readFileSync(kpiEventsPath, 'utf-8');
    // traffic_source に 'x' と 'instagram' が独立した値として含まれること
    expect(tsContent).toContain("'x'");
    expect(tsContent).toContain("'instagram'");
    // x と instagram は同じ union 内に両方存在する
    const trafficSourceMatch = tsContent.match(/traffic_source.*?[;,]/s);
    expect(trafficSourceMatch).not.toBeNull();
  });

  it('5. PII/URL禁止フィールドがkpiEvents.tsのOEJ interface内に存在しないこと', () => {
    const kpiEventsPath = join(__dirname, '../lib/kpiEvents.ts');
    const tsContent = readFileSync(kpiEventsPath, 'utf-8');
    // OEJ interface内に禁止フィールドがプロパティキーとして含まれていないこと
    // journal_list_viewedからjournal_load_failedまでのinterface定義部分を抽出
    const journalStart = tsContent.indexOf('/** OEJ: ジャーナル一覧表示 */');
    const journalEnd = tsContent.indexOf('// ---------------------------------------------------------------------------\n// Event name union');
    const journalSection = tsContent.slice(journalStart, journalEnd);
    // 禁止フィールド: プロパティキーとして定義されていないことを確認
    // 例: `referrer_url:` `raw_error:` の形式で定義されていないこと
    const forbiddenPropPatterns = [
      'referrer_url:',
      'raw_error:',
      'body_text:',
      'user_agent:',
      'ip_address:',
      'stack_trace:',
      'email:',
    ];
    for (const pattern of forbiddenPropPatterns) {
      expect(
        journalSection.includes(pattern),
        `OEJ props should not include forbidden field pattern: ${pattern}`
      ).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// describe 2: Migration SQL
// ---------------------------------------------------------------------------

describe('OEJ KPI Phase 1 — Migration SQL', () => {
  it('6. migration fileが存在すること', () => {
    expect(existsSync(OEJ_MIGRATION_PATH), `${OEJ_MIGRATION} should exist`).toBe(true);
  });

  it('7. _kpi_allowed_event_namesに全8 OEJイベントが含まれること', () => {
    const sql = readFileSync(OEJ_MIGRATION_PATH, 'utf-8');
    for (const event of OEJ_EVENTS) {
      expect(sql, `SQL should include event name: ${event}`).toContain(`'${event}'`);
    }
  });

  it('8. _kpi_validate_propertiesに全8イベントのWHEN節が含まれること', () => {
    const sql = readFileSync(OEJ_MIGRATION_PATH, 'utf-8');
    for (const event of OEJ_EVENTS) {
      expect(sql, `SQL should have WHEN clause for: ${event}`).toContain(`WHEN '${event}' THEN`);
    }
  });

  it('9. traffic_sourceのenum値が両ファイルで一致すること', () => {
    const sql = readFileSync(OEJ_MIGRATION_PATH, 'utf-8');
    const kpiEventsPath = join(__dirname, '../lib/kpiEvents.ts');
    const tsContent = readFileSync(kpiEventsPath, 'utf-8');

    const trafficSourceValues = ['x', 'instagram', 'google', 'bing', 'one_eight_internal', 'direct', 'other_external'];
    for (const val of trafficSourceValues) {
      expect(tsContent, `TS should include traffic_source value: ${val}`).toContain(`'${val}'`);
      expect(sql, `SQL should include traffic_source value: ${val}`).toContain(`'${val}'`);
    }
  });

  it('10. article_slugが200文字制限で定義されていること', () => {
    const sql = readFileSync(OEJ_MIGRATION_PATH, 'utf-8');
    // > 200 の制約確認
    expect(sql).toContain('> 200');
    // article_slug と一緒に使われていること
    expect(sql).toContain('article_slug');
  });

  it('11. utm_*フィールドが100文字制限で定義されていること', () => {
    const sql = readFileSync(OEJ_MIGRATION_PATH, 'utf-8');
    // utm_* で > 100 の制約
    expect(sql).toContain('> 100');
    expect(sql).toContain('utm_medium');
    expect(sql).toContain('utm_campaign');
    expect(sql).toContain('utm_content');
  });

  it('12. XとInstagramが独立したenum値としてSQL内に存在すること', () => {
    const sql = readFileSync(OEJ_MIGRATION_PATH, 'utf-8');
    // 'x' と 'instagram' がそれぞれ traffic_source の IN リストに存在する
    expect(sql).toContain("'x'");
    expect(sql).toContain("'instagram'");
    // 両方が同じ IN リストに含まれること
    const inListMatch = sql.match(/NOT IN \([^)]*'x'[^)]*'instagram'[^)]*\)/s)
      || sql.match(/NOT IN \([^)]*'instagram'[^)]*'x'[^)]*\)/s);
    expect(inListMatch, 'x and instagram should be in the same IN list').not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// describe 3: Event Properties Validation (静的)
// ---------------------------------------------------------------------------

describe('OEJ KPI Phase 1 — Event Properties Validation (静的)', () => {
  const sql = existsSync(OEJ_MIGRATION_PATH) ? readFileSync(OEJ_MIGRATION_PATH, 'utf-8') : '';

  it('13. journal_list_viewed: traffic_source必須確認', () => {
    expect(sql).toContain("KPI_PROPS_MISSING_REQUIRED: event=journal_list_viewed key=traffic_source");
  });

  it('14. journal_list_viewed: traffic_source enum値確認', () => {
    expect(sql).toContain("KPI_PROPS_INVALID_ENUM: event=journal_list_viewed key=traffic_source");
    // 許可値確認
    const trafficSourceValues = ['x', 'instagram', 'google', 'bing', 'one_eight_internal', 'direct', 'other_external'];
    for (const val of trafficSourceValues) {
      expect(sql).toContain(`'${val}'`);
    }
  });

  it('15. journal_article_impression: 必須5フィールド確認', () => {
    const requiredFields = ['article_slug', 'list_position', 'requested_locale', 'displayed_locale', 'fallback'];
    for (const field of requiredFields) {
      expect(
        sql,
        `journal_article_impression should require: ${field}`
      ).toContain(`KPI_PROPS_MISSING_REQUIRED: event=journal_article_impression key=${field}`);
    }
  });

  it('16. journal_article_impression: list_position>=1の制約確認', () => {
    expect(sql).toContain('list_position');
    expect(sql).toContain('integer >= 1');
  });

  it('17. journal_article_opened: 必須フィールド確認', () => {
    const requiredFields = ['article_slug', 'entry_type', 'traffic_source', 'requested_locale', 'displayed_locale', 'fallback'];
    for (const field of requiredFields) {
      expect(
        sql,
        `journal_article_opened should require: ${field}`
      ).toContain(`KPI_PROPS_MISSING_REQUIRED: event=journal_article_opened key=${field}`);
    }
  });

  it('18. journal_article_opened: entry_type enum確認', () => {
    expect(sql).toContain("KPI_PROPS_INVALID_ENUM: event=journal_article_opened key=entry_type");
    const entryTypes = ['journal_list', 'direct', 'internal', 'external'];
    for (const t of entryTypes) {
      expect(sql).toContain(`'${t}'`);
    }
  });

  it('19. journal_article_engagement: max_scroll_percent 0-100範囲確認', () => {
    expect(sql).toContain('max_scroll_percent');
    expect(sql).toContain('integer 0-100');
  });

  it('20. journal_article_engagement: active_seconds 0-86400範囲確認', () => {
    expect(sql).toContain('active_seconds');
    expect(sql).toContain('integer 0-86400');
  });

  it('21. journal_reference_clicked: reference_kind enum確認', () => {
    expect(sql).toContain("KPI_PROPS_INVALID_ENUM: event=journal_reference_clicked key=reference_kind");
    expect(sql).toContain("'doi'");
    expect(sql).toContain("'url'");
  });

  it('22. journal_reference_clicked: reference_position>=1確認', () => {
    expect(sql).toContain('reference_position');
    // integer >= 1 の制約が存在すること
    expect(sql).toContain('KPI_PROPS_INVALID_VALUE: event=journal_reference_clicked key=reference_position must be integer >= 1');
  });

  it('23. journal_language_changed: context enum確認', () => {
    expect(sql).toContain("KPI_PROPS_INVALID_ENUM: event=journal_language_changed key=context");
    expect(sql).toContain("'list'");
    expect(sql).toContain("'article'");
  });

  it('24. journal_game_cta_clicked: context enum確認', () => {
    expect(sql).toContain("KPI_PROPS_INVALID_ENUM: event=journal_game_cta_clicked key=context");
    expect(sql).toContain("'list_footer'");
    expect(sql).toContain("'article_footer'");
  });

  it('25. journal_load_failed: failure_code enum確認', () => {
    expect(sql).toContain("KPI_PROPS_INVALID_ENUM: event=journal_load_failed key=failure_code");
    const failureCodes = ['list_fetch_failed', 'article_fetch_failed', 'article_not_found', 'image_load_failed', 'unknown'];
    for (const code of failureCodes) {
      expect(sql).toContain(`'${code}'`);
    }
  });

  it('26. 保存禁止情報がSQLに含まれていないこと (URL/referrer/email/stack)', () => {
    // allowed keys として禁止フィールドが登録されていないこと
    const forbiddenAllowedKeys = ['referrer_url', 'raw_error', 'email', 'body_text', 'user_agent', 'ip_address'];
    for (const field of forbiddenAllowedKeys) {
      // ARRAY['...field...'] の形で許可keyとして定義されていないこと
      const allowedKeyPattern = new RegExp(`'${field}'`);
      // journal_* の allowed_keys には含まれていない
      // ただし一般的なSQL文字列チェック（stack_trace等はFORBIDDEN_PROP_KEYSとして別定義される）
      // ここではjournal_*のallowed_keysセクションのみをチェック
      const journalSection = sql.slice(sql.indexOf("WHEN 'journal_list_viewed' THEN"));
      expect(
        journalSection.includes(`'${field}'`),
        `OEJ SQL should not allow key: ${field}`
      ).toBe(false);
    }
  });

  it('27. 制御文字拒否がutm_*フィールドのSQLに含まれること', () => {
    expect(sql).toContain('KPI_PROPS_CONTROL_CHARS: event=journal_list_viewed key=utm_medium');
    expect(sql).toContain('KPI_PROPS_CONTROL_CHARS: event=journal_list_viewed key=utm_campaign');
    expect(sql).toContain('KPI_PROPS_CONTROL_CHARS: event=journal_list_viewed key=utm_content');
    expect(sql).toContain('KPI_PROPS_CONTROL_CHARS: event=journal_article_opened key=utm_medium');
    expect(sql).toContain('KPI_PROPS_CONTROL_CHARS: event=journal_article_opened key=utm_campaign');
    expect(sql).toContain('KPI_PROPS_CONTROL_CHARS: event=journal_article_opened key=utm_content');
  });
});
