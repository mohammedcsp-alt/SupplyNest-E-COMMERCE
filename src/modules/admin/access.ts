import 'server-only';
import type { CurrentUser } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';

/** Price visibility for admin reads. Only users holding price.view see monetary values. */
export function canSeePrices(user: CurrentUser | null): boolean {
  return !!user && user.permissions.has(PERMISSIONS.PRICE_VIEW_ADMIN);
}

/** Keys that carry monetary values. Used to scrub free-form JSON (audit before/after) for users without price.view. */
const MONEY_KEY = /amount|total|price|fee|subtotal|gross|collected|^cod[A-Z]|^cod$|^totalCod$/;

export const HIDDEN_MONEY = '[hidden: requires price.view]';

/** Recursively replaces monetary-looking values with a marker when the viewer may not see prices. */
export function scrubMoney(value: unknown, visible: boolean): unknown {
  if (visible || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => scrubMoney(v, false));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = MONEY_KEY.test(k) ? HIDDEN_MONEY : scrubMoney(v, false);
    }
    return out;
  }
  return value;
}
