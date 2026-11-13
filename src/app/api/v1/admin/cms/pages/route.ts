import { z } from 'zod';
import { apiRoute, clientIp, ok, readJson } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { createCmsPage, listCmsPages } from '@/modules/admin/cms';
import { CONTENT_SLUG_RE } from '@/modules/admin/constants';

export const dynamic = 'force-dynamic';

const schema = z.object({
  slug: z.string().trim().regex(CONTENT_SLUG_RE, 'Slug: lowercase letters, digits, dashes'),
  titleAr: z.string().trim().min(1).max(200),
  titleEn: z.string().trim().min(1).max(200),
  bodyAr: z.string().max(50_000),
  bodyEn: z.string().max(50_000),
  published: z.boolean().optional(),
});

/** CMS pages (admin view, including unpublished). Editing needs content.edit. */
export const GET = apiRoute(async (_req, _ctx, requestId) => {
  requirePermission(await getCurrentUser(), PERMISSIONS.CONTENT_EDIT);
  const pages = await listCmsPages();
  return ok(requestId, pages.map((p) => ({ id: p.id, slug: p.slug, titleAr: p.titleAr, titleEn: p.titleEn, bodyAr: p.bodyAr, bodyEn: p.bodyEn, publishedAt: p.publishedAt, updatedAt: p.updatedAt })));
});

/** Creates a page. Setting published=true requires content.publish. */
export const POST = apiRoute(async (req, _ctx, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.CONTENT_EDIT);
  const body = await readJson(req, schema);
  if (body.published === true) requirePermission(actor, PERMISSIONS.CONTENT_PUBLISH);
  const page = await createCmsPage(actor.id, { ...body, published: body.published ?? false }, clientIp(req));
  return ok(requestId, { id: page.id, slug: page.slug, publishedAt: page.publishedAt }, { status: 201 });
});
