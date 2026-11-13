import { apiRoute, clientIp, ok, type RouteContext } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { removeSkuImage } from '@/modules/catalog/admin';

export const dynamic = 'force-dynamic';

export const DELETE = apiRoute<{ imageId: string }>(async (req, ctx: RouteContext<{ imageId: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.IMAGE_MANAGE);
  const { imageId } = await ctx.params;
  await removeSkuImage(actor.id, imageId, clientIp(req));
  return ok(requestId, { removed: true });
});
