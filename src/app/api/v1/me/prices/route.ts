import { apiRoute, ok } from '@/lib/api';
import { errors } from '@/lib/errors';
import { getCurrentUser, canSeePrices } from '@/lib/session';
import { db } from '@/lib/db';
import { toApiAmount } from '@/lib/money';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/me/prices?skus=A,B — prices for the caller's own level only.
 * Requires an ACTIVE customer (CUSTOMER-006, T005). Suspended/pending accounts get 403.
 */
export const GET = apiRoute(async (req, _ctx, requestId) => {
  const user = await getCurrentUser();
  if (!user) throw errors.unauthorized();
  if (!canSeePrices(user) || !user.priceLevelId) throw errors.forbidden('Prices are available to approved active customers only');
  const skus = (req.nextUrl.searchParams.get('skus') ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 100);
  if (skus.length === 0) return ok(requestId, []);
  const rows = await db.tierPrice.findMany({
    where: { priceLevelId: user.priceLevelId, sku: { sku: { in: skus } } },
    select: { amount: true, currency: true, sku: { select: { sku: true } } },
  });
  return ok(
    requestId,
    rows.map((r) => ({ sku: r.sku.sku, amount: toApiAmount(r.amount), currency: r.currency, levelCode: user.priceLevelCode })),
  );
});
