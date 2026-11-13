import 'server-only';
import { db } from '@/lib/db';
import { errors } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';

export async function listCmsPages() {
  return db.cmsPage.findMany({ orderBy: { slug: 'asc' } });
}

export async function listCmsBanners() {
  return db.cmsBanner.findMany({ orderBy: [{ position: 'asc' }, { titleEn: 'asc' }] });
}

export type PageInput = {
  slug?: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  /** Only meaningful when the caller holds content.publish; the route enforces that. */
  published?: boolean;
};

/** Creates a page. Publishing (published=true) sets publishedAt; the route checks content.publish first. */
export async function createCmsPage(actorId: string, input: PageInput & { slug: string }, ip: string | null) {
  const data = {
    slug: input.slug,
    titleAr: input.titleAr,
    titleEn: input.titleEn,
    bodyAr: input.bodyAr,
    bodyEn: input.bodyEn,
    publishedAt: input.published ? new Date() : null,
  };
  return db.$transaction(async (tx) => {
    if (await tx.cmsPage.findUnique({ where: { slug: input.slug }, select: { id: true } })) throw errors.conflict('A page with this slug already exists');
    const page = await tx.cmsPage.create({ data });
    await writeAudit(tx, { actorId, action: 'cms.page.create', entityType: 'cms_page', entityId: page.id, after: { slug: page.slug, published: !!page.publishedAt }, ip });
    return page;
  });
}

/** Updates text; publish state changes only when `published` is present and differs from the stored state. */
export async function updateCmsPage(actorId: string, pageId: string, input: PageInput, ip: string | null) {
  return db.$transaction(async (tx) => {
    const before = await tx.cmsPage.findUnique({ where: { id: pageId } });
    if (!before) throw errors.notFound('Page not found');
    const wasPublished = !!before.publishedAt;
    const publishChanged = input.published !== undefined && input.published !== wasPublished;
    const page = await tx.cmsPage.update({
      where: { id: pageId },
      data: {
        titleAr: input.titleAr,
        titleEn: input.titleEn,
        bodyAr: input.bodyAr,
        bodyEn: input.bodyEn,
        ...(publishChanged ? { publishedAt: input.published ? new Date() : null } : {}),
      },
    });
    await writeAudit(tx, {
      actorId,
      action: 'cms.page.update',
      entityType: 'cms_page',
      entityId: page.id,
      before: { slug: before.slug, titleEn: before.titleEn, published: wasPublished },
      after: { slug: page.slug, titleEn: page.titleEn, published: !!page.publishedAt },
      ip,
    });
    return { page, publishChanged };
  });
}

export async function createCmsBanner(
  actorId: string,
  input: { titleAr: string; titleEn: string; imageKey?: string | null; targetPath: string; position: number; active: boolean; activeFrom?: Date | null; activeTo?: Date | null },
  ip: string | null,
) {
  if (input.activeFrom && input.activeTo && input.activeTo <= input.activeFrom) throw errors.validation('activeTo must be after activeFrom');
  return db.$transaction(async (tx) => {
    const banner = await tx.cmsBanner.create({ data: input });
    await writeAudit(tx, { actorId, action: 'cms.banner.create', entityType: 'cms_banner', entityId: banner.id, after: { titleEn: banner.titleEn, active: banner.active, targetPath: banner.targetPath }, ip });
    return banner;
  });
}

export type BannerPatch = {
  titleAr?: string;
  titleEn?: string;
  targetPath?: string;
  position?: number;
  active?: boolean;
  activeFrom?: Date | null;
  activeTo?: Date | null;
};

function bannerSnapshot(b: { titleAr: string; titleEn: string; targetPath: string; position: number; active: boolean; activeFrom: Date | null; activeTo: Date | null }) {
  return {
    titleAr: b.titleAr,
    titleEn: b.titleEn,
    targetPath: b.targetPath,
    position: b.position,
    active: b.active,
    activeFrom: b.activeFrom?.toISOString() ?? null,
    activeTo: b.activeTo?.toISOString() ?? null,
  };
}

/** Partial banner update. The date window is validated against the merged (stored + patched) values. */
export async function updateCmsBanner(actorId: string, bannerId: string, input: BannerPatch, ip: string | null) {
  return db.$transaction(async (tx) => {
    const before = await tx.cmsBanner.findUnique({ where: { id: bannerId } });
    if (!before) throw errors.notFound('Banner not found');
    const from = input.activeFrom !== undefined ? input.activeFrom : before.activeFrom;
    const to = input.activeTo !== undefined ? input.activeTo : before.activeTo;
    if (from && to && to <= from) throw errors.validation('activeTo must be after activeFrom', { fieldErrors: { activeTo: ['activeTo must be after activeFrom'] } });
    const after = await tx.cmsBanner.update({ where: { id: bannerId }, data: input });
    await writeAudit(tx, { actorId, action: 'cms.banner.update', entityType: 'cms_banner', entityId: bannerId, before: bannerSnapshot(before), after: bannerSnapshot(after), ip });
    return after;
  });
}

/** Banners are never hard-deleted: deactivation keeps the row and its history. */
export async function deactivateCmsBanner(actorId: string, bannerId: string, ip: string | null) {
  return db.$transaction(async (tx) => {
    const before = await tx.cmsBanner.findUnique({ where: { id: bannerId } });
    if (!before) throw errors.notFound('Banner not found');
    const after = await tx.cmsBanner.update({ where: { id: bannerId }, data: { active: false } });
    await writeAudit(tx, { actorId, action: 'cms.banner.deactivate', entityType: 'cms_banner', entityId: bannerId, before: { active: before.active }, after: { active: false }, ip });
    return after;
  });
}

/** Hard-deletes an unpublished page. Published pages must be unpublished first (409). */
export async function deleteCmsPage(actorId: string, pageId: string, reason: string, ip: string | null) {
  return db.$transaction(async (tx) => {
    const before = await tx.cmsPage.findUnique({ where: { id: pageId } });
    if (!before) throw errors.notFound('Page not found');
    if (before.publishedAt) throw errors.conflict('Unpublish first');
    // Conditional delete: a concurrent publish between the read and the delete must not remove a live page.
    const res = await tx.cmsPage.deleteMany({ where: { id: pageId, publishedAt: null } });
    if (res.count !== 1) throw errors.conflict('Unpublish first');
    await writeAudit(tx, {
      actorId,
      action: 'cms.page.delete',
      entityType: 'cms_page',
      entityId: pageId,
      before: { slug: before.slug, titleAr: before.titleAr, titleEn: before.titleEn },
      reason,
      ip,
    });
  });
}
