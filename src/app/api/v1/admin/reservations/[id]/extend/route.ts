import { z } from 'zod';
import { apiRoute, ok, readJson, type RouteContext } from '@/lib/api';
import { db } from '@/lib/db';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { extendReservation } from '@/modules/inventory/inventory';

export const dynamic = 'force-dynamic';

const schema = z.object({ hours: z.number().int().min(1).max(168), reason: z.string().trim().min(3).max(500) });

export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.RESERVATION_MANAGE);
  const { id } = await ctx.params;
  const body = await readJson(req, schema);
  const updated = await db.$transaction((tx) => extendReservation(tx, { reservationId: id, ...body, actorId: actor.id }));
  return ok(requestId, { id: updated.id, status: updated.status, expiresAt: updated.expiresAt });
});
