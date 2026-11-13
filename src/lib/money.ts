import { Prisma } from '@prisma/client';

/**
 * Exact monetary arithmetic. IQD is stored as whole dinars (OPEN-08 default: no fractions, no VAT).
 * Never use JS floating point for money. Values cross the API boundary as integer strings.
 */
export type Money = Prisma.Decimal;
export const D = Prisma.Decimal;

export const CURRENCY = 'IQD' as const;
const MAX_IQD = new Prisma.Decimal('999999999999'); // fits DECIMAL(18,0) with headroom

export function money(value: string | number | Prisma.Decimal): Money {
  const d = new Prisma.Decimal(value);
  if (!d.isFinite()) throw new RangeError('Money value must be finite');
  return d;
}

/** Validates a user-supplied IQD amount: non-negative whole number within range. */
export function parseIqdAmount(input: unknown): Money | null {
  if (typeof input === 'number') {
    if (!Number.isSafeInteger(input)) return null;
  } else if (typeof input !== 'string' || !/^\d+$/.test(input.trim())) {
    return null;
  }
  const d = new Prisma.Decimal(typeof input === 'string' ? input.trim() : input);
  if (d.isNegative() || !d.isInteger() || d.greaterThan(MAX_IQD)) return null;
  return d;
}

export function mulQty(unitPrice: Money, qty: number): Money {
  if (!Number.isInteger(qty) || qty < 0) throw new RangeError('Quantity must be a non-negative integer');
  return unitPrice.mul(qty);
}

export function sumMoney(values: Money[]): Money {
  return values.reduce((acc, v) => acc.add(v), new Prisma.Decimal(0));
}

/** Canonical API representation: plain integer string, e.g. "125000". */
export function toApiAmount(value: Money | string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return new Prisma.Decimal(value).toFixed(0, Prisma.Decimal.ROUND_HALF_UP);
}

/** Display formatter. Latin digits keep ledgers unambiguous in both locales. */
export function formatIqd(value: Money | string | number, locale: 'ar' | 'en' = 'en'): string {
  const n = Number(new Prisma.Decimal(value).toFixed(0));
  const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
  return locale === 'ar' ? `${formatted} د.ع` : `${formatted} IQD`;
}
