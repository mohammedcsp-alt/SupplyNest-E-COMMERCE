import { z } from 'zod';
import { apiRoute, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { upsertCategory } from '@/modules/catalog/admin';

export const dynamic = 'force-dynamic';

const schema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,118}$/),
  nameAr: z.string().trim().min(1).max(160),
  nameEn: z.string().trim().min(1).max(160),
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
  active: z.boolean().optional(),
});

export const PUT = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.CATEGORY_MANAGE);
  const { id } = await ctx.params;
  const body = await readJson(req, schema);
  const cat = await upsertCategory(actor.id, { ...body, id });
  return ok(requestId, { id: cat.id, slug: cat.slug });
});
