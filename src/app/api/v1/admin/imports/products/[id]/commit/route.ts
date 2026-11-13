import { z } from 'zod';
import { apiRoute, clientIp, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { commitProductImport } from '@/modules/imports/products-import';

export const dynamic = 'force-dynamic';

const schema = z.object({
  acknowledgeUnknownFreshness: z.boolean().optional(),
  override: z.object({ reason: z.string().trim().min(3).max(500) }).optional(),
});

/** IMP-01 step 2: atomic commit. Stale files require import.override_stale + reason (ACX-04). */
export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.IMPORT_COMMIT);
  const { id } = await ctx.params;
  const body = await readJson(req, schema);
  const result = await commitProductImport({
    importId: id,
    actorId: actor.id,
    actorPermissions: actor.permissions,
    acknowledgeUnknownFreshness: body.acknowledgeUnknownFreshness,
    override: body.override,
    ip: clientIp(req),
  });
  return ok(requestId, result);
});
