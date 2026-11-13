import { z } from 'zod';
import { apiRoute, clientIp, ok, readJson } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { errors } from '@/lib/errors';
import { listModels, upsertModel } from '@/modules/catalog/admin';

export const dynamic = 'force-dynamic';

const modelSchema = z.object({
  name: z.string().trim().min(1).max(200),
  brandId: z.string().uuid().nullable().optional(),
});

/** Product models (optional SKU grouping). Optional ?brandId= filter. Requires catalog.view. */
export const GET = apiRoute(async (req, _ctx, requestId) => {
  requirePermission(await getCurrentUser(), PERMISSIONS.CATALOG_VIEW);
  const brandId = req.nextUrl.searchParams.get('brandId');
  if (brandId !== null && !z.string().uuid().safeParse(brandId).success) throw errors.validation('brandId must be a UUID');
  const models = await listModels(brandId ?? undefined);
  return ok(
    requestId,
    models.map((m) => ({ id: m.id, name: m.name, brandId: m.brandId, brandName: m.brand?.name ?? null, active: m.active })),
  );
});

/** Creates a model or returns the existing one (200, existing: true). Requires catalog.manage. */
export const POST = apiRoute(async (req, _ctx, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.CATALOG_MANAGE);
  const body = await readJson(req, modelSchema);
  const { model, existing } = await upsertModel(actor, { name: body.name, brandId: body.brandId ?? null }, clientIp(req));
  return ok(requestId, { id: model.id, name: model.name, brandId: model.brandId, existing }, { status: existing ? 200 : 201 });
});
