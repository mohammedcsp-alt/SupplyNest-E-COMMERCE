import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { setTierPrice } from '@/modules/catalog/admin';
import { syncStaleAlerts } from '@/modules/inventory/inventory';
import { listRoles, setRolePermissions } from '@/modules/admin/roles';
import { buildReport } from '@/modules/admin/reports';
import { getDashboardKpis } from '@/modules/admin/dashboard';
import { setLocalHold } from '@/modules/commerce/orders';
import { actorFor, createActiveCustomer, placeTestOrder, STAFF } from '../helpers/fixtures';
import { makeSku, uniq } from './req-helpers';

describe('stale inventory alerts never change quantities (OPS-004, T040, INV)', () => {
  it('a stale balance raises STALE_DATA, keeps physicalOnHand, and a fresh source timestamp resolves the alert', async () => {
    const item = await makeSku({ nameEn: uniq('STALE '), physical: 7 });
    const row = await db.sku.findUniqueOrThrow({ where: { sku: item.sku } });
    const observedAt = new Date();
    await db.inventoryBalance.update({ where: { skuId: row.id }, data: { sourceTimestamp: observedAt } });

    // 48 hours later the observation is older than the 24-hour threshold
    const later = new Date(observedAt.getTime() + 48 * 3600 * 1000);
    await syncStaleAlerts(later);
    const open = await db.inventoryAlert.findFirst({ where: { skuId: row.id, alertType: 'STALE_DATA', state: 'OPEN' } });
    expect(open).not.toBeNull();
    const afterStale = await db.inventoryBalance.findUniqueOrThrow({ where: { skuId: row.id } });
    expect(afterStale.physicalOnHand).toBe(7);
    expect(afterStale.reservedQty).toBe(0);

    // a fresh source timestamp (at the same moment as 'later') clears the staleness
    await db.inventoryBalance.update({ where: { skuId: row.id }, data: { sourceTimestamp: later } });
    await syncStaleAlerts(later);
    const resolved = await db.inventoryAlert.findUniqueOrThrow({ where: { id: open!.id } });
    expect(resolved.state).toBe('RESOLVED');
    expect(resolved.resolvedAt).not.toBeNull();
    expect((await db.inventoryBalance.findUniqueOrThrow({ where: { skuId: row.id } })).physicalOnHand).toBe(7);
  });
});

describe('admin price change is audited with before and after (ADMIN-005, T035)', () => {
  it('setTierPrice writes a price.change audit row carrying the old and new amount for the SKU', async () => {
    const item = await makeSku({ nameEn: uniq('AUDIT PRICE '), physical: 3, prices: { LEVEL_A: 15000 } });
    const manager = await actorFor(STAFF.manager);
    const row = await db.sku.findUniqueOrThrow({ where: { sku: item.sku } });
    const level = await db.priceLevel.findUniqueOrThrow({ where: { code: 'LEVEL_A' } });
    await setTierPrice(manager.id, { skuId: row.id, priceLevelId: level.id, amount: '17000', reason: 'req audit check', ip: '10.9.9.9' });

    const rows = await db.auditLog.findMany({ where: { action: 'price.change', entityType: 'sku', entityId: row.id }, orderBy: { occurredAt: 'desc' } });
    const change = rows.find((r) => (r.after as { amount?: string } | null)?.amount === '17000');
    expect(change).toBeDefined();
    expect(change!.before).toEqual({ level: 'LEVEL_A', amount: '15000' });
    expect(change!.after).toEqual({ level: 'LEVEL_A', amount: '17000' });
    expect(change!.reason).toBe('req audit check');
    expect(change!.actorId).toBe(manager.id);
    expect(change!.ip).toBe('10.9.9.9');
  });
});

describe('MANAGER role cannot lose permissions; unknown codes are refused (ADMIN-002)', () => {
  it('removing any permission from MANAGER is CONFLICT and an unknown code is refused', async () => {
    const manager = await actorFor(STAFF.manager);
    const roles = await listRoles();
    const mgr = roles.find((r) => r.name === 'MANAGER');
    expect(mgr).toBeDefined();
    expect(mgr!.permissions).toContain('customer.approve');

    await expect(setRolePermissions(manager.id, mgr!.id, mgr!.permissions.filter((p) => p !== 'customer.approve'), null, { permissions: manager.permissions, isOwner: true })).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(setRolePermissions(manager.id, mgr!.id, [...mgr!.permissions, 'no.such.permission'], null, { permissions: manager.permissions, isOwner: true })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    // nothing was changed by the refused calls
    const after = (await listRoles()).find((r) => r.name === 'MANAGER')!;
    expect(after.permissions).toEqual(mgr!.permissions);
  });
});

describe('orders report status filter (ADMIN-004)', () => {
  it('the status filter returns only rows with that status', async () => {
    const manager = await actorFor(STAFF.manager);
    const submitted = await createActiveCustomer('LEVEL_A');
    const held = await createActiveCustomer('LEVEL_A');
    const itemA = await makeSku({ nameEn: uniq('RPT A '), physical: 10 });
    const orderS = (await placeTestOrder(submitted, [{ sku: itemA.sku, qty: 1 }])).order;
    const orderH = (await placeTestOrder(held, [{ sku: itemA.sku, qty: 1 }])).order;
    await setLocalHold({ actorId: manager.id, orderId: orderH.id, on: true, reason: 'req report filter' });

    const onHold = await buildReport('orders', { status: 'ON_HOLD_LOCAL' }, false);
    expect(onHold.rows.length).toBeGreaterThan(0);
    expect(onHold.rows.every((r) => r.status === 'ON_HOLD_LOCAL')).toBe(true);
    expect(onHold.rows.map((r) => r.orderNumber)).toContain(orderH.orderNumber);
    expect(onHold.rows.map((r) => r.orderNumber)).not.toContain(orderS.orderNumber);

    const sub = await buildReport('orders', { status: 'SUBMITTED' }, false);
    expect(sub.rows.every((r) => r.status === 'SUBMITTED')).toBe(true);
    expect(sub.rows.map((r) => r.orderNumber)).toContain(orderS.orderNumber);
    expect(sub.rows.map((r) => r.orderNumber)).not.toContain(orderH.orderNumber);
  });
});

describe('dashboard counts come from the data (ADMIN-001)', () => {
  it('creating one order increases the submitted-today and total counts by exactly 1', async () => {
    const item = await makeSku({ nameEn: uniq('DASH '), physical: 10 });
    const c = await createActiveCustomer('LEVEL_A');
    const before = await getDashboardKpis();
    await placeTestOrder(c, [{ sku: item.sku, qty: 1 }]);
    const after = await getDashboardKpis();
    expect(after.ordersToday - before.ordersToday).toBe(1);
    expect(after.ordersTotal - before.ordersTotal).toBe(1);
  });
});
