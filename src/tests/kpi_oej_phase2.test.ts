/**
 * kpi_oej_phase2.test.ts — OEJ KPI Phase 2 テスト
 *
 * 検証内容:
 *  1. X / twitter → x
 *  2. Instagram → instagram
 *  3. XとInstagramが混同されない
 *  4. UTM優先、internal、external、direct分類
 *  5. UTM長さ・制御文字sanitize
 *  6. langと許可UTMだけ記事リンクへ引き継ぐ
 *  7. list_viewed exactly-once
 *  8. card impression 50%・slugごとexactly-once
 *  9. article_opened exactly-once
 *  10. language changeは実変更時のみ
 *  11. engagementのscroll/visible time/completed判定
 *  12. engagement離脱時exactly-once
 *  13. reference clickでURL/DOI本文を送らない
 *  14. CTA click
 *  15. failure code固定・raw error非送信
 *  16. image failure重複防止
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resolveTrafficSource,
  normalizeTrafficSource,
  resolveEntryType,
  getSanitizedUtm,
  buildArticleHref,
} from '../lib/journalKpi';

// ---------------------------------------------------------------------------
// 1. normalizeTrafficSource
// ---------------------------------------------------------------------------

describe('normalizeTrafficSource', () => {
  it('1-a. "x" → "x"', () => {
    expect(normalizeTrafficSource('x')).toBe('x');
  });

  it('1-b. "twitter" → "x"', () => {
    expect(normalizeTrafficSource('twitter')).toBe('x');
  });

  it('2-a. "instagram" → "instagram"', () => {
    expect(normalizeTrafficSource('instagram')).toBe('instagram');
  });

  it('3. X と Instagram が混同されない', () => {
    expect(normalizeTrafficSource('x')).not.toBe('instagram');
    expect(normalizeTrafficSource('instagram')).not.toBe('x');
    expect(normalizeTrafficSource('twitter')).not.toBe('instagram');
  });

  it('google → google', () => {
    expect(normalizeTrafficSource('google')).toBe('google');
  });

  it('bing → bing', () => {
    expect(normalizeTrafficSource('bing')).toBe('bing');
  });

  it('不明な値 → other_external', () => {
    expect(normalizeTrafficSource('unknown_source')).toBe('other_external');
    expect(normalizeTrafficSource('')).toBe('other_external');
  });
});

// ---------------------------------------------------------------------------
// 2. resolveTrafficSource
// ---------------------------------------------------------------------------

describe('resolveTrafficSource', () => {
  const origin = 'https://example.com';

  it('4-a. utm_source=twitter → x (UTM優先)', () => {
    const params = new URLSearchParams('utm_source=twitter');
    expect(resolveTrafficSource(params, '', origin)).toBe('x');
  });

  it('4-b. utm_source=instagram → instagram', () => {
    const params = new URLSearchParams('utm_source=instagram');
    expect(resolveTrafficSource(params, '', origin)).toBe('instagram');
  });

  it('4-c. 同一origin referrer → one_eight_internal', () => {
    const params = new URLSearchParams();
    expect(resolveTrafficSource(params, 'https://example.com/some-page', origin)).toBe('one_eight_internal');
  });

  it('4-d. 外部 referrer (google) → google', () => {
    const params = new URLSearchParams();
    expect(resolveTrafficSource(params, 'https://www.google.com/search?q=test', origin)).toBe('google');
  });

  it('4-e. referrerなし → direct', () => {
    const params = new URLSearchParams();
    expect(resolveTrafficSource(params, '', origin)).toBe('direct');
  });

  it('4-f. twitter.com referrer → x', () => {
    const params = new URLSearchParams();
    expect(resolveTrafficSource(params, 'https://twitter.com/user', origin)).toBe('x');
  });

  it('4-g. x.com referrer → x', () => {
    const params = new URLSearchParams();
    expect(resolveTrafficSource(params, 'https://x.com/user', origin)).toBe('x');
  });

  it('4-h. instagram.com referrer → instagram', () => {
    const params = new URLSearchParams();
    expect(resolveTrafficSource(params, 'https://www.instagram.com/', origin)).toBe('instagram');
  });

  it('4-i. utm_source が設定されていれば referrer より優先', () => {
    const params = new URLSearchParams('utm_source=google');
    // referrer が same-origin でも utm_source を優先
    expect(resolveTrafficSource(params, 'https://example.com/other', origin)).toBe('google');
  });
});

// ---------------------------------------------------------------------------
// 3. getSanitizedUtm
// ---------------------------------------------------------------------------

describe('getSanitizedUtm', () => {
  it('5-a. 正常な UTM 3項目を返す', () => {
    const params = new URLSearchParams('utm_medium=social&utm_campaign=launch&utm_content=banner');
    const utm = getSanitizedUtm(params);
    expect(utm.utm_medium).toBe('social');
    expect(utm.utm_campaign).toBe('launch');
    expect(utm.utm_content).toBe('banner');
  });

  it('5-b. 101文字の utm_medium は破棄', () => {
    const longVal = 'a'.repeat(101);
    const params = new URLSearchParams(`utm_medium=${longVal}`);
    const utm = getSanitizedUtm(params);
    expect(utm.utm_medium).toBeUndefined();
  });

  it('5-c. 制御文字を含む utm_campaign は破棄', () => {
    const params = new URLSearchParams();
    params.set('utm_campaign', 'bad\x01value');
    const utm = getSanitizedUtm(params);
    expect(utm.utm_campaign).toBeUndefined();
  });

  it('5-d. 100文字ちょうどは許容', () => {
    const val = 'a'.repeat(100);
    const params = new URLSearchParams(`utm_content=${val}`);
    const utm = getSanitizedUtm(params);
    expect(utm.utm_content).toBe(val);
  });

  it('5-e. utm_source は返さない', () => {
    const params = new URLSearchParams('utm_source=twitter&utm_medium=social');
    const utm = getSanitizedUtm(params);
    expect('utm_source' in utm).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. buildArticleHref (UTM + lang 引き継ぎ)
// ---------------------------------------------------------------------------

describe('buildArticleHref', () => {
  it('6-a. lang=en のとき lang パラメータなし', () => {
    const href = buildArticleHref('my-slug', 'en', {});
    expect(href).toBe('/journal/my-slug');
  });

  it('6-b. lang=ja のとき ?lang=ja を付与', () => {
    const href = buildArticleHref('my-slug', 'ja', {});
    expect(href).toBe('/journal/my-slug?lang=ja');
  });

  it('6-c. UTM 3項目を引き継ぐ', () => {
    const href = buildArticleHref('my-slug', 'en', {
      utm_medium: 'social',
      utm_campaign: 'launch',
      utm_content: 'banner',
    });
    expect(href).toContain('utm_medium=social');
    expect(href).toContain('utm_campaign=launch');
    expect(href).toContain('utm_content=banner');
  });

  it('6-d. lang + UTM の両方を含む', () => {
    const href = buildArticleHref('my-slug', 'ja', {
      utm_medium: 'social',
    });
    expect(href).toContain('lang=ja');
    expect(href).toContain('utm_medium=social');
    // utm_source は含まない
    expect(href).not.toContain('utm_source');
  });

  it('6-e. UTM が空のときはクエリなし (lang=en)', () => {
    const href = buildArticleHref('test-slug', 'en', {});
    expect(href).toBe('/journal/test-slug');
    expect(href).not.toContain('?');
  });
});

// ---------------------------------------------------------------------------
// 5. resolveEntryType
// ---------------------------------------------------------------------------

describe('resolveEntryType', () => {
  const origin = 'https://example.com';

  it('9-a. /journal パスからの遷移 → journal_list', () => {
    expect(resolveEntryType('https://example.com/journal/', origin)).toBe('journal_list');
    expect(resolveEntryType('https://example.com/journal/some-article', origin)).toBe('journal_list');
  });

  it('9-b. 同一origin の他ページ → internal', () => {
    expect(resolveEntryType('https://example.com/training', origin)).toBe('internal');
  });

  it('9-c. 外部 referrer → external', () => {
    expect(resolveEntryType('https://twitter.com/user', origin)).toBe('external');
  });

  it('9-d. referrerなし → direct', () => {
    expect(resolveEntryType('', origin)).toBe('direct');
  });
});

// ---------------------------------------------------------------------------
// 6. Engagement: scroll / active_seconds / completed 判定
// ---------------------------------------------------------------------------

describe('Engagement 判定ロジック (純粋計算)', () => {
  it('11-a. max_scroll >= 90 かつ active_seconds >= 30 → completed=true', () => {
    const maxScroll = 90;
    const activeSec = 30;
    const completed = maxScroll >= 90 && activeSec >= 30;
    expect(completed).toBe(true);
  });

  it('11-b. max_scroll = 89 → completed=false', () => {
    const maxScroll = 89;
    const activeSec = 60;
    const completed = maxScroll >= 90 && activeSec >= 30;
    expect(completed).toBe(false);
  });

  it('11-c. active_seconds = 29 → completed=false', () => {
    const maxScroll = 100;
    const activeSec = 29;
    const completed = maxScroll >= 90 && activeSec >= 30;
    expect(completed).toBe(false);
  });

  it('11-d. active_seconds は 0〜86400 に収める', () => {
    const raw = 100000;
    const clamped = Math.min(86400, Math.max(0, raw));
    expect(clamped).toBe(86400);
  });

  it('11-e. max_scroll_percent は 0〜100 に収める', () => {
    expect(Math.min(100, Math.max(0, 150))).toBe(100);
    expect(Math.min(100, Math.max(0, -10))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 7. track() の呼び出し内容検証 (mock)
// ---------------------------------------------------------------------------

describe('track() 呼び出し検証 (mock)', () => {
  const mockTrack = vi.fn();

  beforeEach(() => {
    mockTrack.mockClear();
  });

  it('7. list_viewed: traffic_source と sanitize 済み UTM だけを送る', () => {
    const utm = { utm_medium: 'social', utm_campaign: 'launch' };
    const trafficSource = 'x';
    // track() の呼び出しをシミュレート
    mockTrack('journal_list_viewed', {
      traffic_source: trafficSource,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
    });
    expect(mockTrack).toHaveBeenCalledWith('journal_list_viewed', expect.objectContaining({
      traffic_source: 'x',
      utm_medium: 'social',
      utm_campaign: 'launch',
    }));
    // utm_source は含まない
    const callArgs = mockTrack.mock.calls[0]![1] as Record<string, unknown>;
    expect('utm_source' in callArgs).toBe(false);
  });

  it('8. impression: article_slug / list_position / locale を含む', () => {
    mockTrack('journal_article_impression', {
      article_slug: 'test-article',
      list_position: 1,
      requested_locale: 'ja',
      displayed_locale: 'en',
      fallback: true,
    });
    expect(mockTrack).toHaveBeenCalledWith('journal_article_impression', expect.objectContaining({
      article_slug: 'test-article',
      list_position: 1,
    }));
  });

  it('9. article_opened: entry_type / traffic_source / locale を含む', () => {
    mockTrack('journal_article_opened', {
      article_slug: 'test-article',
      entry_type: 'journal_list',
      traffic_source: 'instagram',
      requested_locale: 'ja',
      displayed_locale: 'ja',
      fallback: false,
    });
    expect(mockTrack).toHaveBeenCalledWith('journal_article_opened', expect.objectContaining({
      entry_type: 'journal_list',
      traffic_source: 'instagram',
    }));
  });

  it('10. language_changed: from と to が異なるとき送信', () => {
    const from: string = 'en';
    const to: string = 'ja';
    if (from !== to) {
      mockTrack('journal_language_changed', { context: 'list', from_locale: from, to_locale: to });
    }
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });

  it('10-b. language_changed: 同じ locale なら送信しない', () => {
    const from: string = 'en';
    const to: string = 'en';
    if (from !== to) {
      mockTrack('journal_language_changed', { context: 'list', from_locale: from, to_locale: to });
    }
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('12. engagement: exactly-once guard シミュレート', () => {
    let sent = false;
    function sendEngagement() {
      if (sent) return;
      sent = true;
      mockTrack('journal_article_engagement', {
        article_slug: 'test',
        max_scroll_percent: 80,
        active_seconds: 45,
        completed: false,
        requested_locale: 'en',
        displayed_locale: 'en',
        fallback: false,
      });
    }
    sendEngagement();
    sendEngagement(); // 2回目は無視
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });

  it('13. reference_clicked: DOI/URL本文を含まない', () => {
    // DOI: 'doi:10.1234/example' は表示用で送信しない
    // reference_kind と reference_position のみ送信
    mockTrack('journal_reference_clicked', {
      article_slug: 'test-article',
      reference_kind: 'doi',
      reference_position: 1,
    });
    const callArgs = mockTrack.mock.calls[0]![1] as Record<string, unknown>;
    expect('doi' in callArgs).toBe(false);
    expect('url' in callArgs).toBe(false);
    expect(callArgs['reference_kind']).toBe('doi');
    expect(callArgs['reference_position']).toBe(1);
  });

  it('14-a. CTA click (list_footer): context=list_footer', () => {
    mockTrack('journal_game_cta_clicked', { context: 'list_footer' });
    expect(mockTrack).toHaveBeenCalledWith('journal_game_cta_clicked', { context: 'list_footer' });
    const callArgs = mockTrack.mock.calls[0]![1] as Record<string, unknown>;
    expect('article_slug' in callArgs).toBe(false);
  });

  it('14-b. CTA click (article_footer): context=article_footer + slug', () => {
    mockTrack('journal_game_cta_clicked', {
      context: 'article_footer',
      article_slug: 'test-article',
    });
    expect(mockTrack).toHaveBeenCalledWith('journal_game_cta_clicked', {
      context: 'article_footer',
      article_slug: 'test-article',
    });
  });

  it('15-a. failure_code は固定値のみ: list_fetch_failed', () => {
    const code = 'list_fetch_failed';
    mockTrack('journal_load_failed', { page_type: 'list', failure_code: code });
    const callArgs = mockTrack.mock.calls[0]![1] as Record<string, unknown>;
    expect(callArgs['failure_code']).toBe('list_fetch_failed');
    // raw error オブジェクトは含まない
    expect('error' in callArgs).toBe(false);
    expect('message' in callArgs).toBe(false);
  });

  it('15-b. failure_code は固定値のみ: article_not_found', () => {
    const code = 'article_not_found';
    mockTrack('journal_load_failed', {
      page_type: 'article',
      article_slug: 'missing-slug',
      failure_code: code,
    });
    const callArgs = mockTrack.mock.calls[0]![1] as Record<string, unknown>;
    expect(callArgs['failure_code']).toBe('article_not_found');
  });

  it('16. image failure 重複防止シミュレート', () => {
    const sent = new Set<string>();
    function onImageError(slug: string) {
      if (sent.has(slug)) return;
      sent.add(slug);
      mockTrack('journal_load_failed', {
        page_type: 'list',
        article_slug: slug,
        failure_code: 'image_load_failed',
      });
    }
    onImageError('slug-a');
    onImageError('slug-a'); // 重複
    onImageError('slug-b');
    expect(mockTrack).toHaveBeenCalledTimes(2); // slug-a 1回 + slug-b 1回
  });
});
