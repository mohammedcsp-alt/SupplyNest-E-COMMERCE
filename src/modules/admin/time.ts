import 'server-only';
import { baghdadDayKey, DISPLAY_TZ } from '@/lib/time';

/** Admin date inputs are entered in Baghdad local time (UTC+3, no DST) unless they carry an explicit offset. */
const BAGHDAD_OFFSET = '+03:00';

/**
 * Parses an admin-entered date or datetime. Accepts "YYYY-MM-DD", "YYYY-MM-DDTHH:mm" (Baghdad time)
 * or any ISO string with an explicit offset / Z. Returns null when unparseable.
 */
export function parseAdminDateTime(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(trimmed) && trimmed.includes('T');
  const normalized = hasZone ? trimmed : `${trimmed.length === 10 ? `${trimmed}T00:00` : trimmed}${BAGHDAD_OFFSET}`;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Start of the Baghdad business day that contains the given instant. */
export function startOfBaghdadDay(d: Date = new Date()): Date {
  return new Date(`${baghdadDayKey(d)}T00:00:00${BAGHDAD_OFFSET}`);
}

export function timezoneLabel(): string {
  return DISPLAY_TZ;
}
