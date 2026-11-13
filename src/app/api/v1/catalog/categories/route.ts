import { apiRoute, ok } from '@/lib/api';
import { categoryTree } from '@/modules/catalog/public';

export const dynamic = 'force-dynamic';

export const GET = apiRoute(async (_req, _ctx, requestId) => ok(requestId, await categoryTree()));
