import { apiRoute, ok } from '@/lib/api';
import { getCurrentUser, requireActiveCustomer } from '@/lib/session';
import { getCart } from '@/modules/commerce/cart';

export const dynamic = 'force-dynamic';

/** CUS-06: the caller's cart with the caller's own prices. Only ACTIVE customers have a price-bearing cart. */
export const GET = apiRoute(async (_req, _ctx, requestId) => {
  const user = requireActiveCustomer(await getCurrentUser());
  if (!user.priceLevelId || !user.priceLevelCode) return ok(requestId, { items: [], count: 0 });
  return ok(requestId, await getCart(user.id, user.priceLevelId, user.priceLevelCode));
});
