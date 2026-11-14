import { z } from 'zod';
import { apiRoute, clientIp, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { requireUuid } from '@/modules/admin/ids';
import { setSkuMerchandising } from '@/modules/catalog/merchandising';

export const dynamic = 'force-dynamic';

const schema = z
  .object({
    featured: z.boolean().optional(),
    featuredOrder: z.number().int().min(0).max(100000).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'Nothing to update');

/** Marks/unmarks a SKU as featured and sets its display order. Requires catalog.manage. */
export const PATCH = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.CATALOG_MANAGE);
  const id = requireUuid((await ctx.params).id);
  const body = await readJson(req, schema);
  return ok(requestId, await setSkuMerchandising(actor.id, id, body, clientIp(req)));
});
