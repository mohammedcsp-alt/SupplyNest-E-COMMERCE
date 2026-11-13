import { z } from 'zod';
import { apiRoute, ok, readJson } from '@/lib/api';
import { getCurrentUser, requireActiveCustomer } from '@/lib/session';
import { addBulkToCart } from '@/modules/commerce/cart';

export const dynamic = 'force-dynamic';

const schema = z.object({
  lines: z.array(z.object({ sku: z.string().trim().min(1).max(64), qty: z.number().int().min(1).max(100000) })).min(1).max(500),
});

/** Adds reviewed bulk lines to the cart. Per-line results are returned. No order is created. */
export const POST = apiRoute(async (req, _ctx, requestId) => {
  const user = requireActiveCustomer(await getCurrentUser());
  const body = await readJson(req, schema);
  const results = await addBulkToCart({ customerId: user.id, lines: body.lines, priceLevelId: user.priceLevelId });
  return ok(requestId, { results, added: results.filter((r) => r.ok).length });
});
