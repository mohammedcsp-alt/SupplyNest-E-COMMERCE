import { z } from 'zod';
import { apiRoute, ok, readJson } from '@/lib/api';
import { db } from '@/lib/db';
import { errors } from '@/lib/errors';
import { getCurrentUser, requireUser } from '@/lib/session';
import { assertGeoValid } from '@/modules/commerce/geo';

export const dynamic = 'force-dynamic';

const addressSchema = z.object({
  label: z.string().trim().max(80).nullable().optional(),
  governorateId: z.string().uuid(),
  areaId: z.string().uuid().nullable().optional(),
  details: z.string().trim().min(3).max(500),
  recipientName: z.string().trim().min(2).max(120),
  recipientPhone: z.string().trim().min(7).max(20),
  isDefault: z.boolean().optional(),
});

export const GET = apiRoute(async (_req, _ctx, requestId) => {
  const user = requireUser(await getCurrentUser());
  const rows = await db.address.findMany({
    where: { customerId: user.id, deletedAt: null },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    include: { governorate: true, area: true },
  });
  return ok(requestId, rows.map((a) => ({ id: a.id, label: a.label, governorateId: a.governorateId, governorate: a.governorate.nameEn, areaId: a.areaId, area: a.area?.nameEn ?? null, details: a.details, recipientName: a.recipientName, recipientPhone: a.recipientPhone, isDefault: a.isDefault })));
});

/** CUS-03: addresses are editable; an order copies the address at submission (ORD-007 / T026). */
export const POST = apiRoute(async (req, _ctx, requestId) => {
  const user = requireUser(await getCurrentUser());
  if (user.userType !== 'CUSTOMER') throw errors.forbidden('Customer account required');
  const body = await readJson(req, addressSchema);
  await assertGeoValid(body.governorateId, body.areaId ?? null);
  const created = await db.$transaction(async (tx) => {
    if (body.isDefault) await tx.address.updateMany({ where: { customerId: user.id, deletedAt: null }, data: { isDefault: false } });
    const count = await tx.address.count({ where: { customerId: user.id, deletedAt: null } });
    return tx.address.create({ data: { ...body, customerId: user.id, label: body.label ?? null, areaId: body.areaId ?? null, isDefault: body.isDefault ?? count === 0 } });
  });
  return ok(requestId, { id: created.id }, { status: 201 });
});

