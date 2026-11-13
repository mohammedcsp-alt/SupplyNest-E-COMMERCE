import { apiRoute, ok, type RouteContext } from '@/lib/api';
import { db } from '@/lib/db';
import { errors } from '@/lib/errors';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

/** Customer detail for administrators, including history. Admin-only; never exposed publicly. */
export const GET = apiRoute<{ id: string }>(async (_req, ctx: RouteContext<{ id: string }>, requestId) => {
  requirePermission(await getCurrentUser(), PERMISSIONS.CUSTOMER_VIEW);
  const { id } = await ctx.params;
  const u = await db.user.findUnique({
    where: { id },
    include: {
      customerProfile: { include: { priceLevel: true } },
      addresses: { where: { deletedAt: null }, include: { governorate: true, area: true } },
      statusHistory: { orderBy: { occurredAt: 'desc' }, take: 50 },
      priceAssignments: { orderBy: { effectiveAt: 'desc' }, take: 50, include: { priceLevel: true } },
    },
  });
  if (!u || u.userType !== 'CUSTOMER') throw errors.notFound('Customer not found');
  return ok(requestId, {
    id: u.id,
    phone: u.phone,
    status: u.status,
    phoneVerifiedAt: u.phoneVerifiedAt,
    createdAt: u.createdAt,
    displayName: u.customerProfile?.displayName ?? null,
    legalName: u.customerProfile?.legalName ?? null,
    businessIdentityLocked: u.customerProfile?.businessIdentityLocked ?? false,
    priceLevel: u.customerProfile?.priceLevel
      ? { id: u.customerProfile.priceLevel.id, code: u.customerProfile.priceLevel.code, name: u.customerProfile.priceLevel.name }
      : null,
    addresses: u.addresses.map((a) => ({
      id: a.id,
      label: a.label,
      governorate: a.governorate.nameEn,
      area: a.area?.nameEn ?? null,
      details: a.details,
      isDefault: a.isDefault,
    })),
    statusHistory: u.statusHistory.map((h) => ({
      from: h.fromStatus,
      to: h.toStatus,
      reason: h.reason,
      actorId: h.actorId,
      occurredAt: h.occurredAt,
    })),
    priceLevelHistory: u.priceAssignments.map((a) => ({
      priceLevel: a.priceLevel.code,
      effectiveAt: a.effectiveAt,
      reason: a.reason,
      assignedById: a.assignedById,
    })),
  });
});
