/**
 * localeFormat.ts — Locale-aware date / time / number formatting helpers
 *
 * Provides wrappers around Intl APIs using the 10 supported UI locales.
 * Invalid Dates fall back gracefully without throwing.
 */

const INTL_LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  ja: 'ja-JP',
  'zh-Hant': 'zh-Hant',
  'zh-Hans': 'zh-Hans',
  ko: 'ko-KR',
  es: 'es',
  'pt-BR': 'pt-BR',
  de: 'de-DE',
  fr: 'fr-FR',
  it: 'it-IT',
};

export function getIntlLocale(locale: string): string {
  return INTL_LOCALE_MAP[locale] ?? 'en-US';
}

export function formatDate(
  date: Date | string,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return typeof date === 'string' ? date : '';
  return d.toLocaleDateString(getIntlLocale(locale), options);
}

export function formatTime(
  date: Date | string,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return typeof date === 'string' ? date : '';
  return d.toLocaleTimeString(getIntlLocale(locale), options);
}

export function formatDateTime(
  date: Date | string,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return typeof date === 'string' ? date : '';
  return d.toLocaleString(getIntlLocale(locale), options);
}

export function formatNumber(
  n: number,
  locale: string,
  options?: Intl.NumberFormatOptions,
): string {
  return n.toLocaleString(getIntlLocale(locale), options);
}
