import { z } from 'zod';
import { apiRoute, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { setSkuAttributes } from '@/modules/catalog/admin';

export const dynamic = 'force-dynamic';

const schema = z.object({
  values: z.record(z.string().max(60), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])),
});

export const PUT = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.CATALOG_MANAGE);
  const { id } = await ctx.params;
  const body = await readJson(req, schema);
  await setSkuAttributes(actor.id, id, body.values);
  return ok(requestId, { saved: true });
});
