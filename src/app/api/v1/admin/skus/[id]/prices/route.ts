import { z } from 'zod';
import { apiRoute, clientIp, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { setTierPrice } from '@/modules/catalog/admin';

export const dynamic = 'force-dynamic';

const schema = z.object({
  priceLevelId: z.string().uuid(),
  amount: z.string().regex(/^\d{1,12}$/, 'Whole IQD amount required'),
  reason: z.string().trim().min(3).max(500),
});

/** ADM-07: manual tier price change. Writes a price history row; never exposed publicly. */
export const PUT = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.PRICE_EDIT);
  const { id } = await ctx.params;
  const body = await readJson(req, schema);
  const result = await setTierPrice(actor.id, { skuId: id, ...body, ip: clientIp(req) });
  return ok(requestId, result);
});
