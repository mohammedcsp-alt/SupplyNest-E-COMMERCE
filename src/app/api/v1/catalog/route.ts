import { apiRoute, ok } from '@/lib/api';
import { errors } from '@/lib/errors';
import { getCurrentUser, viewerOf } from '@/lib/session';
import { listCatalog, type SkuListParams } from '@/modules/catalog/public';

export const dynamic = 'force-dynamic';

function num(v: string | null, fallback?: number): number | undefined {
  if (v === null || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw errors.validation(`Invalid number: ${v}`);
  return n;
}

const SORTS = ['relevance', 'newest', 'name', 'price_asc', 'price_desc'] as const;

/** UX-001/002/003: catalog list with filters. Anonymous viewers never receive price fields. */
export const GET = apiRoute(async (req, _ctx, requestId) => {
  const sp = req.nextUrl.searchParams;
  const sort = sp.get('sort') ?? 'relevance';
  if (!(SORTS as readonly string[]).includes(sort)) throw errors.validation('Unknown sort');
  const params: SkuListParams = {
    q: sp.get('q') ?? undefined,
    categoryId: sp.get('categoryId') ?? undefined,
    brandId: sp.get('brandId') ?? undefined,
    modelId: sp.get('modelId') ?? undefined,
    qualityId: sp.get('qualityId') ?? undefined,
    availableOnly: sp.get('available') === 'true',
    priceMin: sp.get('priceMin') ?? undefined,
    priceMax: sp.get('priceMax') ?? undefined,
    sort: sort as SkuListParams['sort'],
    page: num(sp.get('page'), 1),
    pageSize: num(sp.get('pageSize'), 20),
  };
  const viewer = viewerOf(await getCurrentUser());
  const result = await listCatalog(params, viewer);
  return ok(requestId, result.items, { meta: result.meta });
});
