import { z } from 'zod';
import { apiRoute, ok, readJson } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { upsertCategory } from '@/modules/catalog/admin';

export const dynamic = 'force-dynamic';

const schema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,118}$/, 'Slug: lowercase letters, digits, dashes'),
  nameAr: z.string().trim().min(1).max(160),
  nameEn: z.string().trim().min(1).max(160),
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
  active: z.boolean().optional(),
});

/** Unlimited category depth (spec 19.1 / general-purpose catalog). */
export const POST = apiRoute(async (req, _ctx, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.CATEGORY_MANAGE);
  const body = await readJson(req, schema);
  const cat = await upsertCategory(actor.id, body);
  return ok(requestId, { id: cat.id, slug: cat.slug }, { status: 201 });
});
