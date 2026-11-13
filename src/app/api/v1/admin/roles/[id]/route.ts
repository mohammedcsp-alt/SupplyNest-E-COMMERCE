import { z } from 'zod';
import { apiRoute, clientIp, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { setRolePermissions } from '@/modules/admin/roles';
import { requireUuid } from '@/modules/admin/ids';

export const dynamic = 'force-dynamic';

const schema = z.object({
  permissions: z.array(z.string().min(3).max(100)).max(200),
});

/** Replaces a role's permissions. Unknown codes are rejected; the MANAGER role cannot lose permissions. Audited. */
export const PUT = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.ROLE_MANAGE);
  const id = requireUuid((await ctx.params).id);
  const body = await readJson(req, schema);
  return ok(requestId, await setRolePermissions(actor.id, id, body.permissions, clientIp(req)));
});
