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
