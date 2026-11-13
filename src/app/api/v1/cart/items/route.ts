import { z } from 'zod';
import { apiRoute, ok, readJson } from '@/lib/api';
import { getCurrentUser, requireActiveCustomer } from '@/lib/session';
import { setCartLine } from '@/modules/commerce/cart';

export const dynamic = 'force-dynamic';

const schema = z.object({
  sku: z.string().trim().min(1).max(64),
  qty: z.number().int().min(0).max(100000),
});

/** UX-006 / CUS-06: quick add, change quantity (qty 0 removes). */
export const PUT = apiRoute(async (req, _ctx, requestId) => {
  const user = requireActiveCustomer(await getCurrentUser());
  const body = await readJson(req, schema);
  const result = await setCartLine({ customerId: user.id, priceLevelId: user.priceLevelId, sku: body.sku, qty: body.qty });
  return ok(requestId, result);
});
