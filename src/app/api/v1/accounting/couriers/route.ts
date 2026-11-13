import { z } from 'zod';
import { apiRoute, ok, readJson } from '@/lib/api';
import { db } from '@/lib/db';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { createCourier } from '@/modules/accounting/service';

export const dynamic = 'force-dynamic';

export const GET = apiRoute(async (_req, _ctx, requestId) => {
  requirePermission(await getCurrentUser(), PERMISSIONS.FINANCE_VIEW);
  const couriers = await db.courier.findMany({ orderBy: { name: 'asc' }, include: { agreements: { orderBy: { effectiveFrom: 'desc' } } } });
  return ok(requestId, couriers.map((c) => ({
    id: c.id,
    name: c.name,
    active: c.active,
    agreements: c.agreements.map((a) => ({
      id: a.id,
      settlementMode: a.settlementMode,
      effectiveFrom: a.effectiveFrom,
      effectiveTo: a.effectiveTo,
      governorateId: a.governorateId,
      serviceFee: a.serviceFee.toFixed(0),
      returnFee: a.returnFee.toFixed(0),
      active: a.active,
    })),
  })));
});

const courierSchema = z.object({ name: z.string().trim().min(2).max(120), contact: z.string().trim().max(200).nullable().optional() });

export const POST = apiRoute(async (req, _ctx, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.COURIER_MANAGE);
  const body = await readJson(req, courierSchema);
  const c = await createCourier(actor, body);
  return ok(requestId, { id: c.id, name: c.name }, { status: 201 });
});

