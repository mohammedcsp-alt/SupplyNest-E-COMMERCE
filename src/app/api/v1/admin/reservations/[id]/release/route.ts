import { z } from 'zod';
import { apiRoute, ok, readJson, type RouteContext } from '@/lib/api';
import { db } from '@/lib/db';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { releaseReservationByAdmin } from '@/modules/inventory/inventory';

export const dynamic = 'force-dynamic';

const schema = z.object({ reason: z.string().trim().min(3).max(500) });

/** Exactly-once release of one reservation after a deliberate decision (INV-01: never automatic). */
export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.RESERVATION_MANAGE);
  const { id } = await ctx.params;
  const body = await readJson(req, schema);
  await db.$transaction((tx) => releaseReservationByAdmin(tx, { reservationId: id, reason: body.reason, actorId: actor.id }));
  return ok(requestId, { released: true });
});
