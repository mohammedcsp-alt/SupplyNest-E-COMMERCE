/**
 * Iraqi mobile numbers, stored canonically as +9647XXXXXXXXX (13 chars).
 * Accepts +9647…, 9647…, 07… and 7… forms.
 */
export function normalizeIraqPhone(input: string): string | null {
  const compact = input.replace(/[\s\-()]/g, '');
  const match =
    compact.match(/^\+?964(7\d{9})$/) ?? compact.match(/^0(7\d{9})$/) ?? compact.match(/^(7\d{9})$/);
  return match ? `+964${match[1]}` : null;
}

export function maskPhone(phone: string): string {
  return phone.length > 6 ? `${phone.slice(0, 5)}••••${phone.slice(-2)}` : '••••';
}
