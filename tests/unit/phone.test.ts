import { describe, expect, it } from 'vitest';
import { normalizeIraqPhone, maskPhone } from '@/modules/identity/phone';

describe('Iraqi mobile normalization', () => {
  it.each([
    ['07701234567', '+9647701234567'],
    ['+964 770 123 4567', '+9647701234567'],
    ['9647701234567', '+9647701234567'],
    ['7701234567', '+9647701234567'],
    ['+9647700001001', '+9647700001001'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeIraqPhone(input)).toBe(expected);
  });

  it.each(['0801234567', '+1 555 0100', '077012', 'phone', '+96477012345678'])('rejects %s', (input) => {
    expect(normalizeIraqPhone(input)).toBeNull();
  });

  it('masks numbers for display', () => {
    expect(maskPhone('+9647701234567')).toBe('+9647••••67');
  });
});
