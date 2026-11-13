import 'server-only';
import { db } from '@/lib/db';
import { startOfBaghdadDay } from './time';

/** Dashboard KPIs. Deliberately excludes profit and collected revenue (not reliable in V1). */
export async function getDashboardKpis() {
  const todayStart = startOfBaghdadDay();
  const weekStart = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [ordersToday, ordersTotal, pendingApproval, activeCustomers, alerts, reviewReservations, rejectedImports] = await Promise.all([
    db.order.count({ where: { submittedAt: { gte: todayStart } } }),
    db.order.count(),
    db.user.count({ where: { userType: 'CUSTOMER', status: 'APPROVAL_PENDING' } }),
    db.user.count({ where: { userType: 'CUSTOMER', status: 'ACTIVE' } }),
    db.inventoryAlert.groupBy({ by: ['alertType'], where: { state: 'OPEN' }, _count: { _all: true } }),
    db.inventoryReservation.count({ where: { status: 'REVIEW_REQUIRED' } }),
    db.importBatch.count({ where: { status: { in: ['REJECTED', 'PREVIEW_INVALID'] }, createdAt: { gte: weekStart } } }),
  ]);
  return {
    ordersToday,
    ordersTotal,
    pendingApproval,
    activeCustomers,
    alerts: alerts.map((a) => ({ type: a.alertType, count: a._count._all })),
    reviewReservations,
    rejectedImports,
  };
}
