import { z } from 'zod';
import { apiRoute, clientIp, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { errors } from '@/lib/errors';
import { db } from '@/lib/db';
import { updateCmsPage } from '@/modules/admin/cms';
import { requireUuid } from '@/modules/admin/ids';

export const dynamic = 'force-dynamic';

const schema = z.object({
  titleAr: z.string().trim().min(1).max(200),
  titleEn: z.string().trim().min(1).max(200),
  bodyAr: z.string().max(50_000),
  bodyEn: z.string().max(50_000),
  /** Present only when the publish state should be set. Changing it requires content.publish. */
  published: z.boolean().optional(),
});

/** Edits page text (content.edit). Changing published (publishedAt) requires content.publish. Audited. */
export const PUT = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.CONTENT_EDIT);
  const id = requireUuid((await ctx.params).id);
  const body = await readJson(req, schema);
  if (body.published !== undefined && !actor.permissions.has(PERMISSIONS.CONTENT_PUBLISH)) {
    // Only a real change needs publish rights; the service decides, so check against the stored state first.
    const current = await db.cmsPage.findUnique({ where: { id }, select: { publishedAt: true } });
    if (current && !!current.publishedAt !== body.published) throw errors.forbidden('Publishing requires content.publish');
  }
  const { page, publishChanged } = await updateCmsPage(actor.id, id, body, clientIp(req));
  return ok(requestId, { id: page.id, publishedAt: page.publishedAt, publishChanged });
});
