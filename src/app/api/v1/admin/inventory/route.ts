import { apiRoute, ok } from '@/lib/api';
import { db } from '@/lib/db';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { availableOf } from '@/modules/inventory/inventory';

export const dynamic = 'force-dynamic';

/** ADM-08: inventory table with physical, reserved, available, and freshness. */
export const GET = apiRoute(async (req, _ctx, requestId) => {
  requirePermission(await getCurrentUser(), PERMISSIONS.INVENTORY_VIEW);
  const sp = req.nextUrl.searchParams;
  const onlyLow = sp.get('lowStock') === 'true';
  const page = Math.max(1, Number(sp.get('page') ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get('pageSize') ?? 50) || 50));
  const q = (sp.get('q') ?? '').trim().toUpperCase().slice(0, 64);
  const rows = await db.sku.findMany({
    where: { deletedAt: null, ...(q ? { sku: { contains: q } } : {}) },
    orderBy: { sku: 'asc' },
    include: { inventory: true, alerts: { where: { state: 'OPEN' }, select: { alertType: true } } },
  });
  const mapped = rows.map((s) => {
    const phys = s.inventory?.physicalOnHand ?? 0;
    const res = s.inventory?.reservedQty ?? 0;
    return {
      id: s.id,
      sku: s.sku,
      nameEn: s.nameEn,
      physicalOnHand: phys,
      reservedQty: res,
      availableQty: availableOf(phys, res),
      conflict: res > phys,
      sourceTimestamp: s.inventory?.sourceTimestamp ?? null,
      openAlerts: s.alerts.map((a) => a.alertType),
    };
  });
  const filtered = onlyLow ? mapped.filter((m) => m.openAlerts.includes('LOW_STOCK') || m.conflict) : mapped;
  return ok(requestId, filtered.slice((page - 1) * pageSize, page * pageSize), { meta: { page, pageSize, total: filtered.length } });
});
