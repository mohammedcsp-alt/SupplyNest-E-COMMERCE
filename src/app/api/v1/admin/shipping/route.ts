import { z } from 'zod';
import { apiRoute, clientIp, ok, readJson } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { getShippingAdmin, upsertArea, upsertGovernorate } from '@/modules/admin/shipping';
import { canSeePrices } from '@/modules/admin/access';

export const dynamic = 'force-dynamic';

const governorateSchema = z.object({
  type: z.literal('governorate'),
  id: z.string().uuid().optional(),
  code: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]{1,39}$/, 'Code: letters, digits, underscore'),
  nameAr: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

const areaSchema = z.object({
  type: z.literal('area'),
  id: z.string().uuid().optional(),
  governorateId: z.string().uuid(),
  nameAr: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120),
  active: z.boolean().optional(),
});

const bodySchema = z.discriminatedUnion('type', [governorateSchema, areaSchema]);

/** Governorates with areas and shipping rule history. Rule amounts are shown only with price.view. */
export const GET = apiRoute(async (_req, _ctx, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.SHIPPING_MANAGE);
  return ok(requestId, await getShippingAdmin(canSeePrices(actor)));
});

/** Create or update a governorate or an area (discriminated by "type"). */
export const POST = apiRoute(async (req, _ctx, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.SHIPPING_MANAGE);
  const body = await readJson(req, bodySchema);
  if (body.type === 'governorate') {
    const g = await upsertGovernorate(actor.id, body, clientIp(req));
    return ok(requestId, { id: g.id, code: g.code }, { status: body.id ? 200 : 201 });
  }
  const a = await upsertArea(actor.id, body, clientIp(req));
  return ok(requestId, { id: a.id }, { status: body.id ? 200 : 201 });
});
