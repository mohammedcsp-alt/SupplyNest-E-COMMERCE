import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { createSession } from '@/lib/session';
import { createStaffUser } from '@/modules/admin/roles';
import { GET as catalogGET } from '@/app/api/v1/catalog/route';
import { GET as searchGET } from '@/app/api/v1/catalog/search/route';
import { GET as productGET } from '@/app/api/v1/products/[sku]/route';
import { GET as recentGET, POST as recentPOST } from '@/app/api/v1/me/recent/route';
import { GET as exportGET } from '@/app/api/v1/admin/reports/[type]/export/route';
import { actorFor, createActiveCustomer, DEV_PASSWORD, STAFF, uniquePhone } from '../helpers/fixtures';
import { makeSku, uniq } from './req-helpers';

// The route handlers read the session cookie through next/headers. The test controls which session is "current".
const auth = vi.hoisted(() => ({ token: null as string | null }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (auth.token ? { name, value: auth.token } : undefined),
  }),
}));

const BASE = 'http://127.0.0.1:3200';

async function sessionFor(userId: string): Promise<string> {
  return (await createSession(userId, null)).token;
}

function get(path: string) {
  return new NextRequest(`${BASE}${path}`);
}

async function json(res: Response) {
  return (await res.json()) as { data?: unknown; error?: { code: string }; meta?: unknown };
}

const STOCK_KEYS = ['"physicalOnHand"', '"reservedQty"', '"availableQty"'];

describe('anonymous HTTP catalog never exposes stock numbers or prices (STORE-004, PRODUCT-004/005)', () => {
  it('catalog list, suggestions and product detail return availability words only for an anonymous visitor', async () => {
    auth.token = null;
    const tag = uniq('HTTPTAG ');
    const inStock = await makeSku({ nameEn: `${tag} available`, physical: 4 });
    await makeSku({ nameEn: `${tag} unavailable`, physical: 0 });

    const listRes = await catalogGET(get(`/api/v1/catalog?q=${tag}&sort=name`), { params: Promise.resolve({}) });
    expect(listRes.status).toBe(200);
    const listBody = await json(listRes);
    const items = listBody.data as Array<{ sku: string; availability: string; price?: unknown }>;
    expect(items.map((i) => i.availability).sort()).toEqual(['AVAILABLE', 'UNAVAILABLE']);
    expect(items.find((i) => i.sku === inStock.sku)!.availability).toBe('AVAILABLE');
    const listText = JSON.stringify(listBody);
    for (const k of STOCK_KEYS) expect(listText).not.toContain(k);
    expect(listText).not.toContain('"price"');

    const sugRes = await searchGET(get(`/api/v1/catalog/search?q=${tag}`), { params: Promise.resolve({}) });
    const sugText = JSON.stringify(await json(sugRes));
    expect(sugText).toContain(inStock.sku);
    for (const k of STOCK_KEYS) expect(sugText).not.toContain(k);
    expect(sugText).not.toContain('"price"');

    const prodRes = await productGET(get(`/api/v1/products/${inStock.sku}`), { params: Promise.resolve({ sku: inStock.sku }) });
    expect(prodRes.status).toBe(200);
    const prodText = JSON.stringify(await json(prodRes));
    for (const k of STOCK_KEYS) expect(prodText).not.toContain(k);
    expect(prodText).not.toContain('"price"');
    expect(prodText).toContain('"availability":"AVAILABLE"');
  });
});

describe('recently viewed is private to its owner (UX-009, CUS-05)', () => {
  it('a view is recorded for the viewer and listed only for that customer', async () => {
    const owner = await createActiveCustomer('LEVEL_A');
    const other = await createActiveCustomer('LEVEL_A');
    const item = await makeSku({ nameEn: uniq('RECENT '), physical: 3 });

    auth.token = await sessionFor(owner.userId);
    const post = new NextRequest(`${BASE}/api/v1/me/recent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sku: item.sku }),
    });
    const recorded = await recentPOST(post, { params: Promise.resolve({}) });
    expect(recorded.status).toBe(200);
    expect((await json(recorded)).data).toEqual({ recorded: true });

    const ownerList = (await json(await recentGET(get('/api/v1/me/recent'), { params: Promise.resolve({}) }))).data as Array<{ sku: string }>;
    expect(ownerList.map((r) => r.sku)).toContain(item.sku);

    auth.token = await sessionFor(other.userId);
    const otherList = (await json(await recentGET(get('/api/v1/me/recent'), { params: Promise.resolve({}) }))).data as Array<{ sku: string }>;
    expect(otherList.map((r) => r.sku)).not.toContain(item.sku);
    expect(await db.recentView.count({ where: { customerId: other.userId, skuId: (await db.sku.findUniqueOrThrow({ where: { sku: item.sku } })).id } })).toBe(0);
    auth.token = null;
  });
});

describe('report export requires report.export (T032, ADMIN-003)', () => {
  it('a staff user with report.view but not report.export is refused by the export endpoint; a viewer with export gets the file', async () => {
    const manager = (await db.user.findUniqueOrThrow({ where: { phone: STAFF.manager } })).id;
    const roleName = uniq('REQ_VIEW_ONLY_');
    const viewPerm = await db.permission.findUniqueOrThrow({ where: { code: 'report.view' } });
    const adminPerm = await db.permission.findUniqueOrThrow({ where: { code: 'admin.access' } });
    await db.role.create({
      data: { name: roleName, permissions: { create: [{ permissionId: viewPerm.id }, { permissionId: adminPerm.id }] } },
    });
    const phone = uniquePhone();
    await createStaffUser(manager, { phone, fullNameEn: 'Req View Only', password: DEV_PASSWORD, roleNames: [roleName] }, null, { permissions: (await actorFor(STAFF.manager)).permissions, isOwner: true });
    const viewOnly = await db.user.findUniqueOrThrow({ where: { phone } });

    const ctx = { params: Promise.resolve({ type: 'orders' }) };
    auth.token = await sessionFor(viewOnly.id);
    const refused = await exportGET(get('/api/v1/admin/reports/orders/export?format=csv'), ctx);
    expect(refused.status).toBe(403);
    expect((await json(refused)).error?.code).toBe('FORBIDDEN');

    // positive control: the seeded report viewer holds report.export and receives the file
    auth.token = await sessionFor((await db.user.findUniqueOrThrow({ where: { phone: STAFF.reports } })).id);
    const allowed = await exportGET(get('/api/v1/admin/reports/orders/export?format=csv'), ctx);
    expect(allowed.status).toBe(200);
    auth.token = null;
  });
});
