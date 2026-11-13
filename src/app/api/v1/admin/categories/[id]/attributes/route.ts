import { z } from 'zod';
import { apiRoute, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { upsertAttribute } from '@/modules/catalog/admin';

export const dynamic = 'force-dynamic';

const schema = z.object({
  key: z.string(),
  labelAr: z.string().trim().min(1).max(120),
  labelEn: z.string().trim().min(1).max(120),
  dataType: z.enum(['TEXT', 'NUMBER', 'BOOLEAN', 'ENUM']),
  unit: z.string().trim().max(20).nullable().optional(),
  options: z.array(z.string().trim().min(1).max(60)).max(100).nullable().optional(),
  filterable: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

/** Category-specific attributes: size, color, material, capacity, compatibility, etc. */
export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.CATEGORY_MANAGE);
  const { id } = await ctx.params;
  const body = await readJson(req, schema);
  const def = await upsertAttribute(actor.id, { ...body, categoryId: id });
  return ok(requestId, { id: def.id, key: def.key }, { status: 201 });
});
