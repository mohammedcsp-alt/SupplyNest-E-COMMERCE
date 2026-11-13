import { z } from 'zod';
import { apiRoute, clientIp, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { deactivateCmsBanner, updateCmsBanner } from '@/modules/admin/cms';
import { requireUuid } from '@/modules/admin/ids';
import { dateOrNull } from '@/modules/admin/time';

export const dynamic = 'force-dynamic';

const patchSchema = z
  .object({
    titleAr: z.string().trim().min(1).max(200).optional(),
    titleEn: z.string().trim().min(1).max(200).optional(),
    targetPath: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .regex(/^\//, 'Target must be an internal path starting with /')
      .refine((v) => !v.startsWith('//'), 'Target must not start with //')
      .optional(),
    position: z.number().int().min(0).max(1000).optional(),
    active: z.boolean().optional(),
    activeFrom: z.string().trim().max(40).nullable().optional(),
    activeTo: z.string().trim().max(40).nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'Nothing to update');

/** Partial banner update (content.edit). Audited as cms.banner.update with before/after. */
export const PATCH = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  // Activating or re-dating a banner publishes public content, so it needs CONTENT_PUBLISH (same rule as creation).
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.CONTENT_EDIT);
  const id = requireUuid((await ctx.params).id);
  const body = await readJson(req, patchSchema);
  if (body.active !== undefined || body.activeFrom !== undefined || body.activeTo !== undefined) requirePermission(actor, PERMISSIONS.CONTENT_PUBLISH);
  const banner = await updateCmsBanner(
    actor.id,
    id,
    {
      titleAr: body.titleAr,
      titleEn: body.titleEn,
      targetPath: body.targetPath,
      position: body.position,
      active: body.active,
      activeFrom: body.activeFrom === undefined ? undefined : dateOrNull(body.activeFrom, 'activeFrom'),
      activeTo: body.activeTo === undefined ? undefined : dateOrNull(body.activeTo, 'activeTo'),
    },
    clientIp(req),
  );
  return ok(requestId, { id: banner.id, active: banner.active });
});

/** Deleting public content is a publishing action (content.publish). Soft-deactivates; never hard-deletes. */
export const DELETE = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.CONTENT_PUBLISH);
  const id = requireUuid((await ctx.params).id);
  await deactivateCmsBanner(actor.id, id, clientIp(req));
  return ok(requestId, { deactivated: true });
});
