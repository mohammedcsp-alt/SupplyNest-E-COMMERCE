import { apiRoute, ok, readJson } from '@/lib/api';
import { db } from '@/lib/db';
import { errors } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { priceLevelCreateSchema } from '@/modules/identity/schemas';

export const dynamic = 'force-dynamic';

export const GET = apiRoute(async (_req, _ctx, requestId) => {
  requirePermission(await getCurrentUser(), PERMISSIONS.PRICE_VIEW_ADMIN);
  const levels = await db.priceLevel.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] });
  return ok(requestId, levels.map((l) => ({ id: l.id, code: l.code, name: l.name, active: l.active, sortOrder: l.sortOrder })));
});

export const POST = apiRoute(async (req, _ctx, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.PRICE_LEVEL_MANAGE);
  const body = await readJson(req, priceLevelCreateSchema);
  const exists = await db.priceLevel.findUnique({ where: { code: body.code } });
  if (exists) throw errors.conflict('Price level code already exists');
  const level = await db.$transaction(async (tx) => {
    const l = await tx.priceLevel.create({ data: body });
    await writeAudit(tx, { actorId: actor.id, action: 'price_level.create', entityType: 'price_level', entityId: l.id, after: body });
    return l;
  });
  return ok(requestId, { id: level.id, code: level.code, name: level.name, active: level.active }, { status: 201 });
});
