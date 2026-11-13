import { apiRoute, ok, type RouteContext } from '@/lib/api';
import { getCurrentUser, viewerOf } from '@/lib/session';
import { getPublicSku } from '@/modules/catalog/public';

export const dynamic = 'force-dynamic';

/** PUB-04: SKU detail with quality variants under the same model. Price only for entitled viewers. */
export const GET = apiRoute<{ sku: string }>(async (_req, ctx: RouteContext<{ sku: string }>, requestId) => {
  const { sku } = await ctx.params;
  const viewer = viewerOf(await getCurrentUser());
  return ok(requestId, await getPublicSku(decodeURIComponent(sku), viewer));
});
