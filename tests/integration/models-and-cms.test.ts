import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createSku, upsertBrand, upsertModel } from '@/modules/catalog/admin';
import { createCmsBanner, createCmsPage, deactivateCmsBanner, deleteCmsPage, updateCmsBanner, updateCmsPage } from '@/modules/admin/cms';
import { actorFor, STAFF } from '../helpers/fixtures';

/** Product models (optional grouping) and CMS banner/page lifecycle, at the service layer. */
describe('product models (optional grouping)', () => {
  it('creates a model with a lowercase trimmed normalized name', async () => {
    const manager = await actorFor(STAFF.manager);
    const name = `QA-AGENT-Model-${randomUUID().slice(0, 8)}`;
    const result = await upsertModel(manager, { name: `  ${name}  ` });
    expect(result.existing).toBe(false);
    expect(result.model.name).toBe(name);
    expect(result.model.normalizedName).toBe(name.toLowerCase());
    const audit = await db.auditLog.findFirst({ where: { action: 'model.create', entityId: result.model.id } });
    expect(audit?.actorId).toBe(manager.id);
  });

  it('is idempotent for the same brand and normalized name', async () => {
    const manager = await actorFor(STAFF.manager);
    const name = `QA-AGENT-Dup-${randomUUID().slice(0, 8)}`;
    const first = await upsertModel(manager, { name });
    const again = await upsertModel(manager, { name: name.toUpperCase() });
    expect(again.existing).toBe(true);
    expect(again.model.id).toBe(first.model.id);

    const brand = await upsertBrand(manager.id, { name: `QA-AGENT-Brand-${randomUUID().slice(0, 8)}` });
    const withBrand = await upsertModel(manager, { name, brandId: brand.id });
    expect(withBrand.existing).toBe(false);
    expect(withBrand.model.id).not.toBe(first.model.id);
    const withBrandAgain = await upsertModel(manager, { name, brandId: brand.id });
    expect(withBrandAgain.existing).toBe(true);
    expect(withBrandAgain.model.id).toBe(withBrand.model.id);
  });

  it('a SKU can be created without any model', async () => {
    const manager = await actorFor(STAFF.manager);
    const category = await db.category.findUniqueOrThrow({ where: { slug: 'dev-tshirts' } });
    const code = `QA-AGENT-NOMODEL-${randomUUID().slice(0, 8).toUpperCase()}`;
    const sku = await createSku(manager.id, { sku: code, categoryId: category.id, nameAr: 'اختبار', nameEn: 'No model item' });
    expect(sku.modelId).toBeNull();
  });

  it('a SKU can reference a model', async () => {
    const manager = await actorFor(STAFF.manager);
    const category = await db.category.findUniqueOrThrow({ where: { slug: 'dev-tshirts' } });
    const { model } = await upsertModel(manager, { name: `QA-AGENT-Linked-${randomUUID().slice(0, 8)}` });
    const code = `QA-AGENT-MODEL-${randomUUID().slice(0, 8).toUpperCase()}`;
    const sku = await createSku(manager.id, { sku: code, categoryId: category.id, modelId: model.id, nameAr: 'اختبار', nameEn: 'Linked item' });
    expect(sku.modelId).toBe(model.id);
  });

  it('an actor without catalog.manage cannot create a model', async () => {
    const reports = await actorFor(STAFF.reports);
    expect(reports.permissions.has('catalog.manage')).toBe(false);
    const name = `QA-AGENT-Denied-${randomUUID().slice(0, 8)}`;
    await expect(upsertModel(reports, { name })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await db.productModel.count({ where: { normalizedName: name.toLowerCase() } })).toBe(0);
  });
});

describe('CMS banner update, deactivate and page delete', () => {
  it('partially updates a banner, audits before/after, and rejects an inverted date window', async () => {
    const manager = await actorFor(STAFF.manager);
    const banner = await createCmsBanner(manager.id, { titleAr: 'بنر', titleEn: `QA-AGENT-Banner-${randomUUID().slice(0, 6)}`, targetPath: '/catalog', position: 1, active: false, activeFrom: null, activeTo: null }, null);
    const updated = await updateCmsBanner(manager.id, banner.id, { position: 7, targetPath: '/catalog/new' }, null);
    expect(updated.position).toBe(7);
    expect(updated.targetPath).toBe('/catalog/new');
    expect(updated.titleEn).toBe(banner.titleEn);
    const audit = await db.auditLog.findFirst({ where: { action: 'cms.banner.update', entityId: banner.id }, orderBy: { occurredAt: 'desc' } });
    expect(audit?.before).toMatchObject({ position: 1, targetPath: '/catalog' });
    expect(audit?.after).toMatchObject({ position: 7, targetPath: '/catalog/new' });

    await expect(
      updateCmsBanner(manager.id, banner.id, { activeFrom: new Date('2026-12-10T00:00:00Z'), activeTo: new Date('2026-12-09T00:00:00Z') }, null),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    // the window is judged against the stored values too: moving activeFrom past the stored activeTo is refused
    await updateCmsBanner(manager.id, banner.id, { activeTo: new Date('2026-12-20T00:00:00Z') }, null);
    await expect(updateCmsBanner(manager.id, banner.id, { activeFrom: new Date('2026-12-25T00:00:00Z') }, null)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('deactivating a banner keeps the row and writes cms.banner.deactivate', async () => {
    const manager = await actorFor(STAFF.manager);
    const banner = await createCmsBanner(manager.id, { titleAr: 'بنر', titleEn: `QA-AGENT-Deact-${randomUUID().slice(0, 6)}`, targetPath: '/', position: 0, active: true, activeFrom: null, activeTo: null }, null);
    const after = await deactivateCmsBanner(manager.id, banner.id, null);
    expect(after.active).toBe(false);
    expect(await db.cmsBanner.findUnique({ where: { id: banner.id } })).not.toBeNull();
    expect(await db.auditLog.count({ where: { action: 'cms.banner.deactivate', entityId: banner.id } })).toBe(1);
  });

  it('refuses to delete a published page and deletes an unpublished one with an audit row', async () => {
    const manager = await actorFor(STAFF.manager);
    const slug = `qa-agent-${randomUUID().slice(0, 8)}`;
    const page = await createCmsPage(manager.id, { slug, titleAr: 'صفحة', titleEn: 'QA page', bodyAr: 'نص', bodyEn: 'Body', published: true }, null);
    await expect(deleteCmsPage(manager.id, page.id, 'test reason', null)).rejects.toMatchObject({ code: 'CONFLICT', message: 'Unpublish first' });
    expect(await db.cmsPage.findUnique({ where: { id: page.id } })).not.toBeNull();

    await updateCmsPage(manager.id, page.id, { titleAr: 'صفحة', titleEn: 'QA page', bodyAr: 'نص', bodyEn: 'Body', published: false }, null);
    await deleteCmsPage(manager.id, page.id, 'test cleanup', null);
    expect(await db.cmsPage.findUnique({ where: { id: page.id } })).toBeNull();
    const audit = await db.auditLog.findFirst({ where: { action: 'cms.page.delete', entityId: page.id } });
    expect(audit?.before).toMatchObject({ slug });
    expect(audit?.reason).toBe('test cleanup');
  });
});
