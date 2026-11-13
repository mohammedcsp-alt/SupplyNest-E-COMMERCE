import { z } from 'zod';
import { apiRoute, ok, readJson, type RouteContext } from '@/lib/api';
import { db } from '@/lib/db';
import { errors } from '@/lib/errors';
import { getCurrentUser, requireUser } from '@/lib/session';
import { assertGeoValid } from '@/modules/commerce/geo';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  label: z.string().trim().max(80).nullable().optional(),
  governorateId: z.string().uuid().optional(),
  areaId: z.string().uuid().nullable().optional(),
  details: z.string().trim().min(3).max(500).optional(),
  recipientName: z.string().trim().min(2).max(120).optional(),
  recipientPhone: z.string().trim().min(7).max(20).optional(),
  isDefault: z.boolean().optional(),
});

async function ownAddress(customerId: string, id: string) {
  const a = await db.address.findFirst({ where: { id, customerId, deletedAt: null } });
  if (!a) throw errors.notFound('Address not found');
  return a;
}

export const PATCH = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const user = requireUser(await getCurrentUser());
  const { id } = await ctx.params;
  const current = await ownAddress(user.id, id);
  const body = await readJson(req, patchSchema);
  const gov = body.governorateId ?? current.governorateId;
  const area = body.areaId !== undefined ? body.areaId : current.areaId;
  await assertGeoValid(gov, area);
  await db.$transaction(async (tx) => {
    if (body.isDefault) await tx.address.updateMany({ where: { customerId: user.id, deletedAt: null }, data: { isDefault: false } });
    await tx.address.update({ where: { id }, data: { ...body, governorateId: gov, areaId: area ?? null } });
  });
  return ok(requestId, { id, updated: true });
});

/** Soft delete: past orders keep their address snapshot (T026). */
export const DELETE = apiRoute<{ id: string }>(async (_req, ctx: RouteContext<{ id: string }>, requestId) => {
  const user = requireUser(await getCurrentUser());
  const { id } = await ctx.params;
  await ownAddress(user.id, id);
  await db.address.update({ where: { id }, data: { deletedAt: new Date(), isDefault: false } });
  return ok(requestId, { deleted: true });
});
