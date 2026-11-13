/**
 * All timestamps are stored in UTC (timestamptz). Display uses Asia/Baghdad (spec section 8 note).
 */
export const DISPLAY_TZ = 'Asia/Baghdad';

export function formatDateTime(value: Date | string | null | undefined, locale: 'ar' | 'en' = 'en'): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-IQ-u-nu-latn' : 'en-GB', {
    timeZone: DISPLAY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function formatDate(value: Date | string | null | undefined, locale: 'ar' | 'en' = 'en'): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-IQ-u-nu-latn' : 'en-GB', {
    timeZone: DISPLAY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Business day key in Baghdad time, e.g. "2026-11-13" (used for daily reports). */
export function baghdadDayKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: DISPLAY_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function addHours(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * 3600 * 1000);
}
