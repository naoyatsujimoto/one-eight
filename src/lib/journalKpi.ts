/**
 * journalKpi.ts — OEJ KPI helper (pure functions)
 *
 * 責務:
 *   1. URLSearchParams から許可 UTM を取得・sanitize
 *   2. document.referrer から traffic_source を判定
 *   3. article entry_type を判定
 *   4. UTM + 正規化済み utm_source を記事リンクへ安全に引き継ぐ
 *
 * PII禁止:
 *   - 完全 referrer URL 保存不可
 *   - query 全文・hash・検索語 保存不可
 *   - pathname 以外の任意 URL 保存不可
 *   - SNS ユーザー情報保存不可
 */

export type TrafficSource =
  | 'x'
  | 'instagram'
  | 'google'
  | 'bing'
  | 'one_eight_internal'
  | 'direct'
  | 'other_external';

export type EntryType = 'journal_list' | 'internal' | 'external' | 'direct';

export interface SanitizedUtm {
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
}

const UTM_MAX_LEN = 100;
const CONTROL_CHAR_RE = /[\x00-\x1F\x7F]/;

/**
 * 制御文字チェック + 100文字制限でsanitize
 * 問題があればundefinedを返す
 */
function sanitizeUtmValue(val: string | null): string | undefined {
  if (!val) return undefined;
  if (CONTROL_CHAR_RE.test(val)) return undefined;
  if (val.length > UTM_MAX_LEN) return undefined;
  return val;
}

/**
 * URLSearchParams から許可 UTM を取得する。
 * utm_source は正規化後の traffic_source のみ使用するため返さない。
 */
export function getSanitizedUtm(params: URLSearchParams): SanitizedUtm {
  const result: SanitizedUtm = {};
  const medium = sanitizeUtmValue(params.get('utm_medium'));
  if (medium !== undefined) result.utm_medium = medium;
  const campaign = sanitizeUtmValue(params.get('utm_campaign'));
  if (campaign !== undefined) result.utm_campaign = campaign;
  const content = sanitizeUtmValue(params.get('utm_content'));
  if (content !== undefined) result.utm_content = content;
  return result;
}

/**
 * hostname が domain と完全一致、またはサブドメイン一致かを判定する。
 * 例: matchesHost('www.instagram.com', 'instagram.com') → true
 *     matchesHost('exampleinstagram.com', 'instagram.com') → false
 */
function matchesHost(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/**
 * Google の正式ドメイン判定。
 * google.com / www.google.com / google.co.jp / google.de 等を対象とする。
 */
function isGoogleHost(hostname: string): boolean {
  return (
    hostname === 'google.com' ||
    hostname.endsWith('.google.com') ||
    /^google\.[a-z]{2,}(\.[a-z]{2})?$/.test(hostname) ||
    /\.google\.[a-z]{2,}(\.[a-z]{2})?$/.test(hostname)
  );
}

/**
 * document.referrer / utm_source から traffic_source を正規化する。
 *
 * 優先順位:
 *   1. utm_source
 *   2. 同一origin の referrer → 'one_eight_internal'
 *   3. 外部 referrer → ホスト名ベースで分類（完全一致・サブドメイン一致）
 *   4. referrerなし → 'direct'
 */
export function resolveTrafficSource(
  params: URLSearchParams,
  referrer: string,
  currentOrigin: string,
): TrafficSource {
  const rawUtmSource = params.get('utm_source');
  if (rawUtmSource) {
    return normalizeTrafficSource(rawUtmSource);
  }

  if (!referrer) return 'direct';

  let refOrigin: string;
  let refHostname: string;
  try {
    const refUrl = new URL(referrer);
    refOrigin = refUrl.origin;
    refHostname = refUrl.hostname.toLowerCase();
  } catch {
    return 'direct';
  }

  if (refOrigin === currentOrigin) return 'one_eight_internal';

  // 外部 referrer をホスト名ベースで分類（完全一致 or サブドメイン一致）
  if (matchesHost(refHostname, 't.co') || matchesHost(refHostname, 'twitter.com') || matchesHost(refHostname, 'x.com')) return 'x';
  if (matchesHost(refHostname, 'instagram.com')) return 'instagram';
  if (isGoogleHost(refHostname)) return 'google';
  if (matchesHost(refHostname, 'bing.com')) return 'bing';

  return 'other_external';
}

/**
 * utm_source 文字列を traffic_source に正規化する。
 */
export function normalizeTrafficSource(raw: string): TrafficSource {
  const s = raw.toLowerCase().trim();
  if (s === 'x' || s === 'twitter') return 'x';
  if (s === 'instagram') return 'instagram';
  if (s === 'google') return 'google';
  if (s === 'bing') return 'bing';
  return 'other_external';
}

/**
 * article の entry_type を判定する。
 *
 * - OEJ 一覧から遷移: referrer が /journal で始まるパス → 'journal_list'
 * - 同一 origin の他ページ → 'internal'
 * - 外部 referrer あり → 'external'
 * - referrer なし → 'direct'
 */
export function resolveEntryType(
  referrer: string,
  currentOrigin: string,
): EntryType {
  if (!referrer) return 'direct';

  let refOrigin: string;
  let refPathname: string;
  try {
    const refUrl = new URL(referrer);
    refOrigin = refUrl.origin;
    refPathname = refUrl.pathname;
  } catch {
    return 'direct';
  }

  if (refOrigin === currentOrigin) {
    if (refPathname.startsWith('/journal')) return 'journal_list';
    return 'internal';
  }

  return 'external';
}

/** utm_sourceとして付与可能なtraffic_sourceの正規値 */
const UTM_SOURCE_PROPAGATABLE: ReadonlySet<TrafficSource> = new Set([
  'x', 'instagram', 'google', 'bing', 'other_external',
]);

/**
 * 記事リンク URL に lang + 正規化済みutm_source + 許可 UTM を引き継ぐ。
 * lang が 'en' の場合は lang パラメータを付与しない。
 * direct / one_eight_internal は utm_source として付けない。
 * raw の utm_source は引き継がない（正規値のみ）。
 */
export function buildArticleHref(
  slug: string,
  locale: string,
  utm: SanitizedUtm,
  trafficSource?: TrafficSource,
): string {
  const params = new URLSearchParams();
  if (locale && locale !== 'en') {
    params.set('lang', locale);
  }
  // 正規化済み traffic_source を utm_source として付与（direct/one_eight_internal は除外）
  if (trafficSource && UTM_SOURCE_PROPAGATABLE.has(trafficSource)) {
    params.set('utm_source', trafficSource);
  }
  if (utm.utm_medium) params.set('utm_medium', utm.utm_medium);
  if (utm.utm_campaign) params.set('utm_campaign', utm.utm_campaign);
  if (utm.utm_content) params.set('utm_content', utm.utm_content);
  const qs = params.toString();
  return `/journal/${slug}${qs ? `?${qs}` : ''}`;
}
