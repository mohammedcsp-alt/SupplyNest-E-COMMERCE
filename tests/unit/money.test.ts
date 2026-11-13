import { describe, expect, it } from 'vitest';
import { parseIqdAmount, toApiAmount, mulQty, sumMoney, money, formatIqd } from '@/lib/money';

describe('IQD money (integer dinars, exact decimal)', () => {
  it('accepts whole non-negative amounts only', () => {
    expect(parseIqdAmount('15000')?.toFixed(0)).toBe('15000');
    expect(parseIqdAmount(0)?.toFixed(0)).toBe('0');
    expect(parseIqdAmount('12.5')).toBeNull();
    expect(parseIqdAmount('-1')).toBeNull();
    expect(parseIqdAmount('abc')).toBeNull();
    expect(parseIqdAmount(1.5)).toBeNull();
    expect(parseIqdAmount('1000000000000')).toBeNull();
  });

  it('multiplies and sums without floating-point drift', () => {
    expect(mulQty(money(33333), 3).toFixed(0)).toBe('99999');
    expect(sumMoney([money(1), money(2), money(3)]).toFixed(0)).toBe('6');
    expect(() => mulQty(money(1), -1)).toThrow(RangeError);
    expect(() => mulQty(money(1), 1.5)).toThrow(RangeError);
  });

  it('serializes as plain integer strings for the API', () => {
    expect(toApiAmount(money('250000'))).toBe('250000');
    expect(toApiAmount(null)).toBeNull();
  });

  it('formats for display in both locales', () => {
    expect(formatIqd('1234567', 'en')).toBe('1,234,567 IQD');
    expect(formatIqd('5000', 'ar')).toBe('5,000 د.ع');
  });
});
