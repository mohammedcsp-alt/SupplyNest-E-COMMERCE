import { apiRoute, ok } from '@/lib/api';
import { getCurrentUser, viewerOf } from '@/lib/session';
import { suggestCatalog } from '@/modules/catalog/public';

export const dynamic = 'force-dynamic';

/** UX-001: instant suggestions by name, SKU or model. */
export const GET = apiRoute(async (req, _ctx, requestId) => {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  const viewer = viewerOf(await getCurrentUser());
  return ok(requestId, await suggestCatalog(q, viewer));
});
