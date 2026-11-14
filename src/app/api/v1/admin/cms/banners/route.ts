import { z } from 'zod';
import { apiRoute, clientIp, ok, readJson } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { errors } from '@/lib/errors';
import { createCmsBanner, listCmsBanners } from '@/modules/admin/cms';
import { dateOrNull } from '@/modules/admin/time';

export const dynamic = 'force-dynamic';

const schema = z.object({
  titleAr: z.string().trim().min(1).max(200),
  titleEn: z.string().trim().min(1).max(200),
  imageKey: z.string().trim().max(255).nullable().optional(),
  targetPath: z.string().trim().min(1).max(255).regex(/^\//, 'Target must be an internal path starting with /'),
  descriptionAr: z.string().trim().max(400).nullable().optional(),
  descriptionEn: z.string().trim().max(400).nullable().optional(),
  linkLabelAr: z.string().trim().max(120).nullable().optional(),
  linkLabelEn: z.string().trim().max(120).nullable().optional(),
  position: z.number().int().min(0).max(1000).default(0),
  /** Defaults to false. Turning a banner on requires content.publish. */
  active: z.boolean().optional(),
  activeFrom: z.string().trim().max(40).nullable().optional(),
  activeTo: z.string().trim().max(40).nullable().optional(),
});

export const GET = apiRoute(async (_req, _ctx, requestId) => {
  requirePermission(await getCurrentUser(), PERMISSIONS.CONTENT_EDIT);
  return ok(requestId, await listCmsBanners());
});

export const POST = apiRoute(async (req, _ctx, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.CONTENT_EDIT);
  const body = await readJson(req, schema);
  if (body.active === true && !actor.permissions.has(PERMISSIONS.CONTENT_PUBLISH)) throw errors.forbidden('Activating a banner requires content.publish');
  const banner = await createCmsBanner(
    actor.id,
    {
      titleAr: body.titleAr,
      titleEn: body.titleEn,
      imageKey: body.imageKey ?? null,
      targetPath: body.targetPath,
      descriptionAr: body.descriptionAr ?? null,
      descriptionEn: body.descriptionEn ?? null,
      linkLabelAr: body.linkLabelAr ?? null,
      linkLabelEn: body.linkLabelEn ?? null,
      position: body.position,
      active: body.active ?? false,
      activeFrom: dateOrNull(body.activeFrom, 'activeFrom'),
      activeTo: dateOrNull(body.activeTo, 'activeTo'),
    },
    clientIp(req),
  );
  return ok(requestId, { id: banner.id }, { status: 201 });
});
