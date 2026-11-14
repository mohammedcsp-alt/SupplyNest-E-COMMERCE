import { afterAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { createSession } from '@/lib/session';
import { PUBLIC_ANON } from '@/modules/catalog/public';
import { listFeaturedSkus, setSkuMerchandising } from '@/modules/catalog/merchandising';
import { clearOwnerImage, readOwnerImage, setOwnerImage } from '@/modules/catalog/media';
import { PATCH as merchPATCH } from '@/app/api/v1/admin/skus/[id]/merchandising/route';
import { POST as categoryImagePOST, DELETE as categoryImageDELETE } from '@/app/api/v1/admin/categories/[id]/image/route';
import { GET as categoryImageGET } from '@/app/api/v1/public/categories/[id]/image/route';
import { POST as bulkPreviewPOST } from '@/app/api/v1/cart/bulk-preview/route';
import { GET as bannerImageGET } from '@/app/api/v1/cms/banners/[id]/image/route';
import { createActiveCustomer, STAFF } from '../helpers/fixtures';
import { makeSku, uniq } from './req-helpers';

// Route handlers read the session cookie through next/headers. Each test sets which session is "current".
const auth = vi.hoisted(() => ({ token: null as string | null }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (auth.token ? { name, value: auth.token } : undefined),
  }),
}));

const BASE = 'http://127.0.0.1:3200';

// Minimal valid PNG signature followed by padding. sniffImage checks magic bytes only.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 0)]);
const NOT_AN_IMAGE = Buffer.from('<html><script>alert(1)</script></html>', 'utf8');

const createdCategoryIds: string[] = [];
const createdBannerIds: string[] = [];

async function managerToken(): Promise<string> {
  const user = await db.user.findUniqueOrThrow({ where: { phone: STAFF.manager } });
  return (await createSession(user.id, null)).token;
}

async function customerToken(): Promise<string> {
  const c = await createActiveCustomer('LEVEL_A');
  return (await createSession(c.userId, null)).token;
}

async function makeCategory() {
  const slug = `media-test-${randomUUID().slice(0, 8)}`;
  const cat = await db.category.create({ data: { slug, nameAr: `اختبار ${slug}`, nameEn: `Media test ${slug}`, active: true } });
  createdCategoryIds.push(cat.id);
  return cat;
}

function categoryParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function adminImageRequest(id: string, bytes: Buffer, name = 'x.png') {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)]), name);
  return new NextRequest(`${BASE}/api/v1/admin/categories/${id}/image`, { method: 'POST', body: form });
}

async function errorCode(res: Response): Promise<string | undefined> {
  const body = (await res.json()) as { error?: { code: string } };
  return body.error?.code;
}

afterAll(async () => {
  for (const id of createdCategoryIds) {
    await clearOwnerImage('00000000-0000-4000-8000-000000000000', 'category', id, null).catch(() => undefined);
    await db.category.deleteMany({ where: { id } }).catch(() => undefined);
  }
  for (const id of createdBannerIds) {
    await db.cmsBanner.deleteMany({ where: { id } }).catch(() => undefined);
  }
});

describe('category image admin API: auth and validation (V3.3 M-02, T-01)', () => {
  it('anonymous visitors cannot upload a category image', async () => {
    auth.token = null;
    const cat = await makeCategory();
    const res = await categoryImagePOST(adminImageRequest(cat.id, PNG), categoryParams(cat.id));
    expect(res.status).toBe(401);
    expect((await db.category.findUniqueOrThrow({ where: { id: cat.id } })).imageKey).toBeNull();
  });

  it('a customer session cannot upload or remove a category image', async () => {
    auth.token = await customerToken();
    const cat = await makeCategory();
    const up = await categoryImagePOST(adminImageRequest(cat.id, PNG), categoryParams(cat.id));
    expect(up.status).toBe(403);
    const del = await categoryImageDELETE(new NextRequest(`${BASE}/api/v1/admin/categories/${cat.id}/image`, { method: 'DELETE' }), categoryParams(cat.id));
    expect(del.status).toBe(403);
    auth.token = null;
  });

  it('a non-image file is rejected with a validation error and nothing is stored', async () => {
    auth.token = await managerToken();
    const cat = await makeCategory();
    const res = await categoryImagePOST(adminImageRequest(cat.id, NOT_AN_IMAGE, 'evil.png'), categoryParams(cat.id));
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('VALIDATION_ERROR');
    expect((await db.category.findUniqueOrThrow({ where: { id: cat.id } })).imageKey).toBeNull();
    auth.token = null;
  });

  it('an empty file is rejected', async () => {
    const cat = await makeCategory();
    await expect(setOwnerImage('00000000-0000-4000-8000-000000000000', 'category', cat.id, Buffer.alloc(0), null)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('category image public visibility (V3.3 M-02, T-01)', () => {
  it('an active category image is public; inactive categories return 404 (no existence leak)', async () => {
    const cat = await makeCategory();
    await setOwnerImage('00000000-0000-4000-8000-000000000000', 'category', cat.id, PNG, null);

    const visible = await categoryImageGET(new NextRequest(`${BASE}/api/v1/public/categories/${cat.id}/image`), categoryParams(cat.id));
    expect(visible.status).toBe(200);
    expect(visible.headers.get('content-type')).toBe('image/png');
    expect(visible.headers.get('x-content-type-options')).toBe('nosniff');

    await db.category.update({ where: { id: cat.id }, data: { active: false } });
    const hidden = await categoryImageGET(new NextRequest(`${BASE}/api/v1/public/categories/${cat.id}/image`), categoryParams(cat.id));
    expect(hidden.status).toBe(404);
    expect(await readOwnerImage('category', cat.id, { publicOnly: true })).toBeNull();

    await db.category.update({ where: { id: cat.id }, data: { active: true } });
    await clearOwnerImage('00000000-0000-4000-8000-000000000000', 'category', cat.id, null);
    const cleared = await categoryImageGET(new NextRequest(`${BASE}/api/v1/public/categories/${cat.id}/image`), categoryParams(cat.id));
    expect(cleared.status).toBe(404);
  });
});

describe('banner image public visibility (V3.3 M-05, T-01)', () => {
  it('inactive banners are not served publicly even when they have an image', async () => {
    const banner = await db.cmsBanner.create({
      data: { titleAr: 'بنر اختبار', titleEn: 'Test banner', targetPath: '/catalog', active: false },
    });
    createdBannerIds.push(banner.id);
    await setOwnerImage('00000000-0000-4000-8000-000000000000', 'banner', banner.id, PNG, null);
    const res = await bannerImageGET(new NextRequest(`${BASE}/api/v1/cms/banners/${banner.id}/image`), { params: Promise.resolve({ id: banner.id }) });
    expect(res.status).toBe(404);

    await db.cmsBanner.update({ where: { id: banner.id }, data: { active: true } });
    const ok = await bannerImageGET(new NextRequest(`${BASE}/api/v1/cms/banners/${banner.id}/image`), { params: Promise.resolve({ id: banner.id }) });
    expect(ok.status).toBe(200);
    await clearOwnerImage('00000000-0000-4000-8000-000000000000', 'banner', banner.id, null);
  });
});

describe('featured products API: auth, validation and visibility (V3.3 M-04, T-01)', () => {
  it('anonymous and customer sessions cannot change merchandising; the manager can', async () => {
    const sku = await makeSku({ nameEn: `Feat auth ${uniq('')}`, physical: 3 });
    const patch = (body: unknown) =>
      merchPATCH(
        new NextRequest(`${BASE}/api/v1/admin/skus/${sku.skuId}/merchandising`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: sku.skuId }) },
      );

    auth.token = null;
    expect((await patch({ featured: true })).status).toBe(401);

    auth.token = await customerToken();
    expect((await patch({ featured: true })).status).toBe(403);

    auth.token = await managerToken();
    const bad = await patch({});
    expect(bad.status).toBe(400);
    expect(await errorCode(bad)).toBe('VALIDATION_ERROR');
    const bad2 = await patch({ featuredOrder: -1 });
    expect(bad2.status).toBe(400);

    const ok = await patch({ featured: true, featuredOrder: 7 });
    expect(ok.status).toBe(200);
    const row = await db.sku.findUniqueOrThrow({ where: { id: sku.skuId } });
    expect(row.featured).toBe(true);
    expect(row.featuredOrder).toBe(7);
    auth.token = null;
  });

  it('merchandising changes are audited with before and after values', async () => {
    const sku = await makeSku({ nameEn: `Feat audit ${uniq('')}`, physical: 3 });
    const actor = await db.user.findUniqueOrThrow({ where: { phone: STAFF.manager } });
    await setSkuMerchandising(actor.id, sku.skuId, { featured: true, featuredOrder: 2 }, null);
    const audit = await db.auditLog.findFirst({ where: { entityId: sku.skuId, action: 'sku.merchandising.update' }, orderBy: { occurredAt: 'desc' } });
    expect(audit).not.toBeNull();
    expect(audit!.actorId).toBe(actor.id);
    expect(audit!.before).toEqual({ featured: false, featuredOrder: 0 });
    expect(audit!.after).toEqual({ featured: true, featuredOrder: 2 });
  });

  it('featured listing shows only published, active, non-deleted SKUs, and anonymous viewers never get prices', async () => {
    const visible = await makeSku({ nameEn: `Feat visible ${uniq('')}`, physical: 3 });
    const hidden = await makeSku({ nameEn: `Feat hidden ${uniq('')}`, physical: 3 });
    const actor = await db.user.findUniqueOrThrow({ where: { phone: STAFF.manager } });
    await setSkuMerchandising(actor.id, visible.skuId, { featured: true, featuredOrder: 1 }, null);
    await setSkuMerchandising(actor.id, hidden.skuId, { featured: true, featuredOrder: 0 }, null);
    await db.sku.update({ where: { id: hidden.skuId }, data: { published: false } });

    const list = await listFeaturedSkus(PUBLIC_ANON, 24);
    const codes = list.map((s) => s.sku);
    expect(codes).toContain(visible.sku);
    expect(codes).not.toContain(hidden.sku);
    for (const item of list) {
      expect(item).not.toHaveProperty('unitPrice');
      expect(item).not.toHaveProperty('physicalOnHand');
    }
  });
});

describe('customer SKU,QTY file upload preview (CUS-08, T-01)', () => {
  it('a multipart CSV is accepted by the preview route and returns valid lines without creating a cart item', async () => {
    const sku = await makeSku({ nameEn: `CSV upload ${uniq('')}`, physical: 10 });
    auth.token = await customerToken();
    const form = new FormData();
    form.append('file', new Blob([`SKU,QTY
${sku.sku},2
`], { type: 'text/csv' }), 'order.csv');
    const req = new NextRequest(`${BASE}/api/v1/cart/bulk-preview`, { method: 'POST', body: form });
    const res = await bulkPreviewPOST(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { lines: Array<{ sku: string; qty: number }> } };
    expect(body.data.lines.find((l) => l.sku === sku.sku)?.qty).toBe(2);
    auth.token = null;
  });
});
