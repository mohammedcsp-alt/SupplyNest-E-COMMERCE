import 'server-only';
import { baghdadDayKey, DISPLAY_TZ } from '@/lib/time';
import { errors } from '@/lib/errors';

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

/** Optional admin date field: undefined stays undefined (not sent), null clears, a bad value throws a validation error. */
export function dateOrNull(raw: string | null | undefined, field: string): Date | null {
  if (!raw) return null;
  const d = parseAdminDateTime(raw);
  if (!d) throw errors.validation(`${field} must be a valid date`, { fieldErrors: { [field]: ['Invalid date'] } });
  return d;
}

/** Formats a stored instant as a Baghdad-local value for a datetime-local input. */
export function toBaghdadInputValue(d: Date | null): string {
  if (!d) return '';
  return new Date(d.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 16);
}
