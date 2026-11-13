import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { actorFor, createActiveCustomer, createSkuFixture, placeTestOrder, STAFF } from '../helpers/fixtures';
import { listJobs } from '@/modules/fulfillment/service';

/** Display queue: search, sort direction and role scope. Display only; no workflow state is read or changed. */
describe('fulfillment queue — search, sort and scope', () => {
  it('finds a job by order number and by job id, and sorts by direction', async () => {
    const sku = await createSkuFixture({ physical: 20 });
    const c = await createActiveCustomer('LEVEL_A');
    const first = await placeTestOrder(c, [{ sku: sku.sku, qty: 1 }]);
    const second = await placeTestOrder(c, [{ sku: sku.sku, qty: 1 }]);
    const jobA = await db.fulfillmentJob.findUniqueOrThrow({ where: { orderId: first.order.id }, include: { order: true } });
    const jobB = await db.fulfillmentJob.findUniqueOrThrow({ where: { orderId: second.order.id }, include: { order: true } });
    const manager = await actorFor(STAFF.manager);

    const byNumber = await listJobs(manager, { q: jobA.order.orderNumber });
    expect(byNumber.rows.map((r) => r.id)).toEqual([jobA.id]);

    const byId = await listJobs(manager, { q: jobB.id });
    expect(byId.rows.map((r) => r.id)).toEqual([jobB.id]);

    // Sort direction applies to the whole queue (search matches numbers and ids, not SKUs).
    const newestFirst = await listJobs(manager, { dir: 'desc' });
    const oldestFirst = await listJobs(manager, { dir: 'asc' });
    const timesDesc = newestFirst.rows.map((r) => r.createdAt.getTime());
    const timesAsc = oldestFirst.rows.map((r) => r.createdAt.getTime());
    expect(timesDesc.length).toBeGreaterThan(0);
    expect(timesDesc).toEqual([...timesDesc].sort((a, b) => b - a));
    expect(timesAsc).toEqual([...timesAsc].sort((a, b) => a - b));
    expect(newestFirst.pageSize).toBe(50);
  });

  it('does not show unassigned jobs to a picker who has no assignment', async () => {
    const sku = await createSkuFixture({ physical: 10 });
    const c = await createActiveCustomer('LEVEL_A');
    const { order } = await placeTestOrder(c, [{ sku: sku.sku, qty: 1 }]);
    const picker = await actorFor(STAFF.picker);
    const result = await listJobs(picker, { q: order.orderNumber });
    expect(result.rows).toEqual([]);
  });
});
